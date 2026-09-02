import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * rebalancePartReservations - CANONICAL reservation math
 * 
 * Phase 12R-HARDENING: This is the SINGLE SOURCE OF TRUTH for reservation calculations.
 * All other functions MUST call this after any stock/commitment mutation.
 * 
 * Algorithm:
 * 1. Fetch Part.physical_stock
 * 2. Fetch all open commitments for that part (status != cancelled/closed)
 * 3. Order by priority DESC, created_date ASC (highest priority first, then FIFO)
 * 4. Greedy allocate stock to commitments (accounting for already-installed qty)
 * 5. Update reserved_from_stock and qty_to_order for each
 * 6. Enforce invariant - HARD FAIL if violated
 * 
 * ============================================================================
 * CANONICAL INVARIANT (Phase 12R)
 * ============================================================================
 * For each commitment:
 *   remaining_required = required_total - qty_installed
 *   remaining_required === reserved_from_stock + covered_from_po + qty_to_order
 * 
 * Global constraint:
 *   SUM(reserved_from_stock) <= physical_stock
 * 
 * CANONICAL FIELDS ONLY (no legacy fallbacks):
 * - required_total (not qty_committed)
 * - reserved_from_stock (not qty_reserved - though we mirror on write)
 * - qty_to_order (canonical gap field)
 * - qty_installed (consumed quantity)
 * ============================================================================
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
    
    // This is a service-to-service function called by executeSupplyAction
    // No user auth required - use service role directly
    const body = await req.json();
    const { part_id, dry_run = false } = body;

    if (!part_id) {
      return Response.json({ error: 'part_id required' }, { status: 400 });
    }

    const timestamp = new Date().toISOString();

    // 1. Fetch part
    const [part] = await base44.asServiceRole.entities.Part.filter({ id: part_id });
    if (!part) {
      throw new Error(`REBALANCE_PART_NOT_FOUND: ${part_id}`);
    }

    const physical_stock = part.physical_stock ?? 0;

    // 2. Fetch all open commitments for this part
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.filter({ part_id });
    const openCommitments = allCommitments.filter(c => 
      c.commitment_status !== 'cancelled' && 
      c.commitment_status !== 'closed'
    );

    // 2b. Resolve AK_STOCK project IDs — any commitment on a system project
    // of type AK_STOCK must NOT consume general inventory (inventory holding, not consuming)
    const projectIds = [...new Set(openCommitments.map(c => c.project_id))];
    const projects = await base44.asServiceRole.entities.Project.filter({ id: { $in: projectIds } });
    const akStockProjectIds = new Set(
      projects
        .filter(p => p.is_system_project === true && p.system_project_type === 'AK_STOCK')
        .map(p => p.id)
    );

    // 3. Order by priority DESC, created_date ASC (highest priority first, then FIFO)
    // Phase 12R: Deterministic allocation policy
    const priorityOrder = { 'Critical': 4, 'High': 3, 'Normal': 2, 'Low': 1 };
    openCommitments.sort((a, b) => {
      // Priority descending (higher priority first)
      const aPriority = priorityOrder[a.priority] || 2;
      const bPriority = priorityOrder[b.priority] || 2;
      if (bPriority !== aPriority) return bPriority - aPriority;
      
      // Created date ascending (older first)
      const aDate = new Date(a.created_date);
      const bDate = new Date(b.created_date);
      if (aDate.getTime() !== bDate.getTime()) return aDate - bDate;
      
      // ID ascending (deterministic tie-breaker)
      return (a.id || '').localeCompare(b.id || '');
    });

    // 4. Greedy allocate stock
    let remaining_stock = physical_stock;
    const updates = [];
    const violations = [];

    for (const c of openCommitments) {
      // PHASE 12R: CANONICAL FIELDS ONLY - no legacy fallbacks
      const required_total = c.required_total ?? 0;
      const qty_installed = c.qty_installed ?? 0;
      const covered_from_po = c.covered_from_po ?? 0;
      const current_reserved = c.reserved_from_stock ?? 0;
      const current_to_order = c.qty_to_order ?? 0;

      // AK_STOCK INVENTORY HOLDING SEMANTICS:
      // AK_STOCK is an inventory holding project, NOT a consuming project.
      // Its commitments must NEVER auto-allocate general physical inventory.
      // This applies to ALL AK_STOCK commitments regardless of demand_source:
      //   - STOCK_REPLENISHMENT / STOCK_MANUAL = replenishment purchasing demand
      //   - PROJECT (null) = legacy stock-holding records
      //
      // EXCEPTION: Replenishment commitments that earned their reservation through
      // canonical PO receiving (coverage already >= required) preserve that state
      // to prevent duplicate demand regeneration. This ONLY applies to replenishment
      // demand_source, NOT to legacy PROJECT-style AK_STOCK commitments (which
      // never went through the replenishment receive path).
      const isReplenishment = c.demand_source === 'STOCK_REPLENISHMENT' || c.demand_source === 'STOCK_MANUAL';
      const isAkStockProject = akStockProjectIds.has(c.project_id);

      // PHASE 12R: Account for installed qty - only allocate for remaining need
      const remaining_required = Math.max(0, required_total - qty_installed);
      
      // For replenishment: earned fulfillment exception (preserve PO-received reservations)
      // For AK_STOCK PROJECT-style: ALWAYS zero from general stock (legacy inventory-holding records)
      const currentCoverage = current_reserved + covered_from_po + qty_installed;
      const isReplenishmentStillUnfulfilled = isReplenishment && currentCoverage < required_total;
      const isAkStockLegacyProjectCommitment = isAkStockProject && !isReplenishment;
      
      // Non-consuming commitment: zero from general stock
      // - AK_STOCK legacy PROJECT commitments: ALWAYS zero (never earns general stock)
      // - Unfulfilled replenishment: zero (still needs purchasing)
      // - Fulfilled replenishment: preserve earned reservation (treat normally)
      const skipAutoAllocation = isAkStockLegacyProjectCommitment || isReplenishmentStillUnfulfilled;
      const need_from_stock = skipAutoAllocation ? 0 : Math.max(0, remaining_required - covered_from_po);
      
      // Allocate from remaining stock
      const new_reserved = Math.min(remaining_stock, need_from_stock);
      
      // Compute to_order (the gap after reservation and PO coverage)
      // AK_STOCK legacy PROJECT commitments: to_order = 0 (inventory-holding records
      // do not generate procurement demand; only STOCK_REPLENISHMENT does)
      const new_to_order = isAkStockLegacyProjectCommitment 
        ? 0 
        : Math.max(0, remaining_required - new_reserved - covered_from_po);

      // Deduct from remaining
      remaining_stock = Math.max(0, remaining_stock - new_reserved);

      // Check if update needed
      const needs_update = (new_reserved !== current_reserved) || (new_to_order !== current_to_order);

      if (needs_update) {
        updates.push({
          commitment_id: c.id,
          project_id: c.project_id,
          required_total,
          qty_installed,
          remaining_required,
          covered_from_po,
          old_reserved: current_reserved,
          new_reserved,
          old_to_order: current_to_order,
          new_to_order,
          delta_reserved: new_reserved - current_reserved
        });
      }

      // 5. INVARIANT CHECK - HARD FAIL
      // PHASE 12R INVARIANT: remaining_required === reserved + covered + to_order
      // EXCEPTIONS:
      // - AK_STOCK legacy PROJECT commitments: intentionally reserved=0, to_order=0
      // - Over-covered commitments (covered_from_po > remaining_required): PO received
      //   more than committed — this is a data state, not a math error
      if (!isAkStockLegacyProjectCommitment) {
        const sum = new_reserved + covered_from_po + new_to_order;
        const isOverCovered = covered_from_po > remaining_required;
        if (!isOverCovered && Math.abs(sum - remaining_required) > 0.001) {
          violations.push({
            commitment_id: c.id,
            violation: 'COVERAGE_MATH_VIOLATION',
            required_total,
            qty_installed,
            remaining_required,
            reserved: new_reserved,
            covered: covered_from_po,
            to_order: new_to_order,
            sum,
            expected: remaining_required,
            diff: sum - remaining_required
          });
        }
      }
    }

    // Check total reserved does not exceed physical
    const total_reserved = openCommitments.reduce((sum, c) => {
      const update = updates.find(u => u.commitment_id === c.id);
      return sum + (update ? update.new_reserved : (c.reserved_from_stock ?? 0));
    }, 0);

    if (total_reserved > physical_stock + 0.001) {
      violations.push({
        violation: 'OVER_ALLOCATION',
        physical_stock,
        total_reserved,
        excess: total_reserved - physical_stock
      });
    }

    // PHASE 5: HARD GUARDRAIL — STOCK_AVAILABLE_NOT_RESERVED
    // If physical_stock > 0 AND to_order > 0 AND reserved_from_stock === 0
    // This indicates a bug in the allocation algorithm.
    // EXCEPTIONS:
    // 1. Replenishment demand is intentionally not reserved from stock.
    // 2. If remaining_stock is 0 after higher-priority allocations, zero reservation is correct.
    if (remaining_stock > 0) {
      for (const u of updates) {
        if (u.new_to_order > 0 && u.new_reserved === 0 && u.remaining_required > 0) {
          const commitmentRecord = openCommitments.find(c => c.id === u.commitment_id);
          const isReplenishmentOrAkStock = 
            commitmentRecord?.demand_source === 'STOCK_REPLENISHMENT' || 
            commitmentRecord?.demand_source === 'STOCK_MANUAL' ||
            akStockProjectIds.has(commitmentRecord?.project_id);
          if (!isReplenishmentOrAkStock) {
            violations.push({
              commitment_id: u.commitment_id,
              violation: 'STOCK_AVAILABLE_NOT_RESERVED',
              message: `Stock exists (${physical_stock}, remaining=${remaining_stock}) but commitment needs order (${u.new_to_order}) with zero reservation.`,
              physical_stock,
              remaining_stock,
              new_reserved: u.new_reserved,
              new_to_order: u.new_to_order,
              remaining_required: u.remaining_required,
              covered_from_po: u.covered_from_po
            });
          }
        }
      }
    }

    // HARD FAIL if violations
    if (violations.length > 0) {
      throw new Error(`REBALANCE_INVARIANT_VIOLATION: ${JSON.stringify(violations)}`);
    }

    // 6. Apply updates if not dry run
    if (!dry_run && updates.length > 0) {
      for (const u of updates) {
        await base44.asServiceRole.entities.PartCommitment.update(u.commitment_id, {
          reserved_from_stock: u.new_reserved,
          qty_reserved: u.new_reserved,
          qty_to_order: u.new_to_order,
          last_recomputed_at: timestamp
        });
      }
    }

    return Response.json({
      success: true,
      part_id,
      part_name: part.part_name,
      physical_stock,
      commitments_scanned: openCommitments.length,
      commitments_updated: updates.length,
      remaining_stock_after: remaining_stock,
      dry_run,
      updates,
      timestamp
    });

  } catch (error) {
    console.error("rebalancePartReservations error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});