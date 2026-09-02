import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * rebalanceAllParts - Admin function to rebalance all parts
 * 
 * Phase 9G: Iterates all parts and rebalances reservations.
 * Direct implementation - does NOT call rebalancePartReservations HTTP endpoint.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const dry_run = body.dry_run !== false;
    const timestamp = new Date().toISOString();

    // Fetch all parts, commitments, and projects
    const [allParts, allCommitments, allProjects] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.Project.list(),
    ]);
    
    // Build AK_STOCK project ID set
    const akStockProjectIds = new Set(
      allProjects
        .filter(p => p.is_system_project === true && p.system_project_type === 'AK_STOCK')
        .map(p => p.id)
    );
    
    // Group commitments by part
    const commitmentsByPart = {};
    allCommitments.forEach(c => {
      if (c.commitment_status === 'cancelled' || c.commitment_status === 'closed') return;
      
      if (!commitmentsByPart[c.part_id]) {
        commitmentsByPart[c.part_id] = [];
      }
      commitmentsByPart[c.part_id].push(c);
    });

    const results = {
      parts_scanned: allParts.length,
      parts_with_commitments: Object.keys(commitmentsByPart).length,
      parts_processed: 0,
      parts_updated: 0,
      commitments_updated: 0,
      violations_found: 0,
      errors: [],
      details: []
    };

    // Process each part that has commitments
    for (const [partId, commitments] of Object.entries(commitmentsByPart)) {
      const part = allParts.find(p => p.id === partId);
      if (!part) {
        results.errors.push({ part_id: partId, error: 'Part not found' });
        results.violations_found++;
        continue;
      }

      results.parts_processed++;

      const physical_stock = part.physical_stock ?? 0;
      
      // Sort by created_date ASC (FIFO)
      commitments.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

      let remaining_stock = physical_stock;
      const part_updates = [];
      const part_violations = [];

      for (const c of commitments) {
        const required_total = c.required_total ?? c.qty_committed ?? 0;
        const covered_from_po = c.covered_from_po ?? 0;
        const current_reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
        const current_to_order = c.qty_to_order ?? 0;

        // AK_STOCK INVENTORY HOLDING: Non-consuming commitments must NOT auto-allocate
        // general stock. Legacy PROJECT-style AK_STOCK commitments: ALWAYS zero.
        // Replenishment: zero until fulfilled (earned via PO receive), then preserve.
        const isReplenishment = c.demand_source === 'STOCK_REPLENISHMENT' || c.demand_source === 'STOCK_MANUAL';
        const isAkStockProject = akStockProjectIds.has(c.project_id);
        const currentCoverage = current_reserved + covered_from_po;
        const isAkStockLegacyProject = isAkStockProject && !isReplenishment;
        const isReplenishmentUnfulfilled = isReplenishment && currentCoverage < required_total;
        const skipAutoAllocation = isAkStockLegacyProject || isReplenishmentUnfulfilled;

        // How much do we need from stock? Non-consuming = 0
        const need_from_stock = skipAutoAllocation ? 0 : Math.max(0, required_total - covered_from_po);
        
        // Allocate from remaining stock
        const new_reserved = Math.min(remaining_stock, need_from_stock);
        
        // Compute to_order
        // AK_STOCK legacy PROJECT commitments: to_order = 0 (inventory-holding, not procurement)
        const new_to_order = isAkStockLegacyProject 
          ? 0 
          : Math.max(0, required_total - new_reserved - covered_from_po);

        // Deduct from remaining
        remaining_stock = Math.max(0, remaining_stock - new_reserved);

        // Check if update needed
        const needs_update = (new_reserved !== current_reserved) || (new_to_order !== current_to_order);

        if (needs_update) {
          part_updates.push({
            commitment_id: c.id,
            project_id: c.project_id,
            required_total,
            covered_from_po,
            old_reserved: current_reserved,
            new_reserved,
            old_to_order: current_to_order,
            new_to_order,
            delta_reserved: new_reserved - current_reserved
          });
        }

        // INVARIANT CHECK
        // AK_STOCK legacy PROJECT commitments are inventory-holding records
        // that intentionally have reserved=0, to_order=0. Skip coverage math check.
        if (!isAkStockLegacyProject) {
          const sum = new_reserved + covered_from_po + new_to_order;
          if (Math.abs(sum - required_total) > 0.001) {
            part_violations.push({
              commitment_id: c.id,
              violation: 'COVERAGE_MATH_VIOLATION',
              required_total,
              reserved: new_reserved,
              covered: covered_from_po,
              to_order: new_to_order,
              sum,
              diff: sum - required_total
            });
          }
        }
      }

      // Check total reserved does not exceed physical
      const total_reserved = commitments.reduce((sum, c) => {
        const update = part_updates.find(u => u.commitment_id === c.id);
        return sum + (update ? update.new_reserved : (c.reserved_from_stock ?? 0));
      }, 0);

      if (total_reserved > physical_stock + 0.001) {
        part_violations.push({
          violation: 'OVER_ALLOCATION',
          physical_stock,
          total_reserved,
          excess: total_reserved - physical_stock
        });
      }

      // If violations, record error
      if (part_violations.length > 0) {
        results.violations_found++;
        results.errors.push({
          part_id: partId,
          part_name: part.part_name,
          violations: part_violations
        });
        continue;
      }

      // Apply updates if not dry run
      if (!dry_run && part_updates.length > 0) {
        for (const u of part_updates) {
          await base44.asServiceRole.entities.PartCommitment.update(u.commitment_id, {
            reserved_from_stock: u.new_reserved,
            qty_reserved: u.new_reserved,
            qty_to_order: u.new_to_order,
            last_recomputed_at: timestamp
          });
        }
        results.parts_updated++;
        results.commitments_updated += part_updates.length;
        results.details.push({
          part_id: partId,
          part_name: part.part_name,
          commitments_updated: part_updates.length,
          updates: part_updates
        });
      }
    }

    return Response.json({
      success: results.violations_found === 0,
      mode: dry_run ? 'DRY_RUN' : 'EXECUTED',
      timestamp,
      executed_by: user.email,
      summary: {
        parts_scanned: results.parts_scanned,
        parts_with_commitments: results.parts_with_commitments,
        parts_processed: results.parts_processed,
        parts_updated: results.parts_updated,
        commitments_updated: results.commitments_updated,
        violations_found: results.violations_found
      },
      errors: results.errors,
      details: results.details,
      message: results.violations_found === 0 
        ? `Processed ${results.parts_processed} parts, updated ${results.commitments_updated} commitments`
        : `Found ${results.violations_found} violations`
    });

  } catch (error) {
    console.error("rebalanceAllParts error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});