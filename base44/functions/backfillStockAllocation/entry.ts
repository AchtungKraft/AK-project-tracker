import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * backfillStockAllocation - One-time backfill for stock allocation drift
 * 
 * Fixes commitments where:
 * - required_total > 0
 * - Physical stock exists for the part
 * - reserved_from_stock is 0 (or under-allocated)
 * - to_order is artificially inflated because stock wasn't allocated
 * 
 * Supports dry_run mode for preview before committing changes.
 * 
 * IMPORTANT: This processes parts in priority order and respects global stock limits.
 * Each part's available stock is distributed across commitments until exhausted.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { dry_run = true, project_id = null, limit = 500 } = await req.json();
    const timestamp = new Date().toISOString();

    console.log(`[BACKFILL_ALLOCATION] Starting. dry_run=${dry_run} project_id=${project_id || 'ALL'}`);

    // ====================================================================
    // PHASE 1: Load all active commitments
    // ====================================================================
    const commitmentFilter = {
      commitment_status: { $nin: ['cancelled', 'closed'] },
    };
    if (project_id) commitmentFilter.project_id = project_id;

    const commitments = await base44.asServiceRole.entities.PartCommitment.filter(
      commitmentFilter, '-created_date', limit
    );

    if (commitments.length === 0) {
      return Response.json({ success: true, message: 'No commitments found', results: [] });
    }

    // ====================================================================
    // PHASE 2: Load parts for all referenced part_ids
    // ====================================================================
    const partIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    const parts = partIds.length > 0
      ? await base44.asServiceRole.entities.Part.filter({ id: { $in: partIds } })
      : [];
    const partMap = new Map(parts.map(p => [p.id, p]));

    // ====================================================================
    // PHASE 3: Build global available stock map
    // Start with physical_stock, subtract ALL existing reserved_from_stock
    // ====================================================================
    const availableStockMap = new Map();
    
    // Initialize from parts
    for (const part of parts) {
      availableStockMap.set(part.id, {
        physical_stock: part.physical_stock ?? 0,
        total_reserved: 0,
        available: 0,
      });
    }

    // Sum up ALL existing reservations (including from commitments we won't touch)
    // We need ALL commitments for these parts to get accurate global reserved
    const allCommitmentsForParts = partIds.length > 0
      ? await base44.asServiceRole.entities.PartCommitment.filter({
          part_id: { $in: partIds },
          commitment_status: { $nin: ['cancelled', 'closed'] },
        })
      : [];

    for (const c of allCommitmentsForParts) {
      const inv = availableStockMap.get(c.part_id);
      if (inv) {
        inv.total_reserved += (c.reserved_from_stock ?? 0);
      }
    }

    // Compute available
    for (const [_, inv] of availableStockMap) {
      inv.available = Math.max(0, inv.physical_stock - inv.total_reserved);
    }

    // ====================================================================
    // PHASE 4: Identify commitments that need allocation
    // ====================================================================
    const candidates = commitments.filter(c => {
      const required = c.required_total ?? 0;
      const reserved = c.reserved_from_stock ?? 0;
      const covered = c.covered_from_po ?? 0;
      const gap = Math.max(0, required - reserved - covered);
      
      if (gap <= 0) return false; // Already fully covered
      
      const inv = availableStockMap.get(c.part_id);
      if (!inv || inv.available <= 0) return false; // No stock available
      
      return true;
    });

    // Sort: highest priority first, then oldest first
    const priorityOrder = { Critical: 4, High: 3, Normal: 2, Low: 1 };
    candidates.sort((a, b) => {
      const ap = priorityOrder[a.priority] || 2;
      const bp = priorityOrder[b.priority] || 2;
      if (bp !== ap) return bp - ap;
      return new Date(a.created_date) - new Date(b.created_date);
    });

    // ====================================================================
    // PHASE 5: Compute allocations
    // ====================================================================
    const results = [];
    const updates = [];

    for (const c of candidates) {
      const required = c.required_total ?? 0;
      const oldReserved = c.reserved_from_stock ?? 0;
      const covered = c.covered_from_po ?? 0;
      const gap = Math.max(0, required - oldReserved - covered);
      
      const inv = availableStockMap.get(c.part_id);
      if (!inv || inv.available <= 0 || gap <= 0) continue;

      const allocation = Math.min(gap, inv.available);
      const newReserved = oldReserved + allocation;
      const newToOrder = Math.max(0, required - newReserved - covered);

      // INVARIANT: reserved + covered must not exceed required
      if (newReserved + covered > required + 0.001) {
        console.error(`[BACKFILL_INVARIANT] SKIP commitment=${c.id}: newReserved(${newReserved}) + covered(${covered}) > required(${required})`);
        continue;
      }

      // Deduct from available pool
      inv.available -= allocation;
      inv.total_reserved += allocation;

      const part = partMap.get(c.part_id);
      
      const record = {
        commitment_id: c.id,
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown',
        project_id: c.project_id,
        current_state: {
          required_total: required,
          reserved_from_stock: oldReserved,
          covered_from_po: covered,
          to_order: gap,
          physical_stock: inv.physical_stock,
        },
        proposed_allocation: allocation,
        new_state: {
          reserved_from_stock: newReserved,
          to_order: newToOrder,
          coverage_status: (newReserved + covered >= required) ? 'FULLY_COVERED' : 'PARTIALLY_COVERED',
        },
      };

      results.push(record);

      if (!dry_run) {
        updates.push({
          commitment_id: c.id,
          part_id: c.part_id,
          newReserved,
          newToOrder,
          required,
          covered,
          oldReserved,
          allocation,
        });
      }

      console.log(`[BACKFILL_ALLOCATION] commitment=${c.id} part=${part?.part_name} ` +
        `required=${required} stock=${inv.physical_stock} ` +
        `previous_reserved=${oldReserved} new_reserved=${newReserved} ` +
        `old_to_order=${gap} new_to_order=${newToOrder}`);
    }

    // ====================================================================
    // PHASE 6: Apply updates (if not dry_run)
    // ====================================================================
    let applied = 0;
    const errors = [];

    if (!dry_run) {
      for (const u of updates) {
        try {
          const covStatus = (u.newReserved + u.covered >= u.required && u.required > 0)
            ? 'FULLY_COVERED'
            : (u.newReserved + u.covered > 0 ? 'PARTIALLY_COVERED' : 'NOT_COVERED');

          await base44.asServiceRole.entities.PartCommitment.update(u.commitment_id, {
            reserved_from_stock: u.newReserved,
            qty_reserved: u.newReserved,
            qty_to_order: u.newToOrder,
            coverage_status: covStatus,
            commitment_status: (u.newReserved + u.covered >= u.required && u.required > 0) ? 'allocated' : undefined,
            last_recomputed_at: timestamp,
            commitment_version: 999, // Flag as backfilled
          });

          // Audit log
          await base44.asServiceRole.entities.CommitmentAuditLog.create({
            commitment_id: u.commitment_id,
            action_type: 'update',
            trigger_source: 'manual',
            triggered_by: user.email,
            actor_email: user.email,
            previous_values: {
              reserved_from_stock: u.oldReserved,
              qty_to_order: u.required - u.oldReserved - u.covered,
            },
            new_values: {
              reserved_from_stock: u.newReserved,
              qty_to_order: u.newToOrder,
            },
            notes: `BACKFILL_STOCK_ALLOCATION: Auto-allocated ${u.allocation} units from physical stock. Gap reduced from ${u.required - u.oldReserved - u.covered} to ${u.newToOrder}.`,
            timestamp,
          });

          applied++;
        } catch (err) {
          console.error(`[BACKFILL_ERROR] commitment=${u.commitment_id}: ${err.message}`);
          errors.push({ commitment_id: u.commitment_id, error: err.message });
        }
      }
    }

    // ====================================================================
    // PHASE 7: Summary
    // ====================================================================
    const summary = {
      total_commitments_scanned: commitments.length,
      candidates_with_gap: candidates.length,
      allocations_proposed: results.length,
      allocations_applied: applied,
      total_units_allocated: results.reduce((sum, r) => sum + r.proposed_allocation, 0),
      remaining_gaps: results.filter(r => r.new_state.to_order > 0).length,
      fully_resolved: results.filter(r => r.new_state.to_order === 0).length,
      errors: errors.length,
    };

    console.log(`[BACKFILL_ALLOCATION] Complete.`, JSON.stringify(summary));

    return Response.json({
      success: true,
      dry_run,
      timestamp,
      summary,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('[BACKFILL_ALLOCATION] Fatal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});