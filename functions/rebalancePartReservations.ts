import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * rebalancePartReservations - CANONICAL reservation math
 * 
 * Phase 9G: This is the SINGLE SOURCE OF TRUTH for reservation calculations.
 * All other functions MUST call this after any stock/commitment mutation.
 * 
 * Algorithm:
 * 1. Fetch Part.physical_stock
 * 2. Fetch all open commitments for that part (status != cancelled/closed)
 * 3. Order by created_at ASC (FIFO allocation)
 * 4. Greedy allocate stock to commitments
 * 5. Update reserved_from_stock and to_order for each
 * 6. Enforce invariant - HARD FAIL if violated
 * 
 * Invariants enforced:
 * - required_total === reserved_from_stock + covered_from_po + to_order
 * - SUM(reserved_from_stock) <= physical_stock
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
    
    // Skip auth check - this is called internally by executeSupplyAction
    // which already validates user permissions
    const body = await req.json();
    const { part_id, dry_run = false } = body;

    if (!part_id) {
      return Response.json({ error: 'part_id required' }, { status: 400 });
    }

    const result = await rebalancePartReservationsInternal(base44, part_id, dry_run, 'service');
    return Response.json(result);

  } catch (error) {
    console.error("rebalancePartReservations error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Internal rebalance logic - exported for use by other functions
 */
export async function rebalancePartReservationsInternal(base44, part_id, dry_run = false, actor_email = 'system') {
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

  // 3. Order by created_date ASC (FIFO)
  openCommitments.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  // 4. Greedy allocate stock
  let remaining_stock = physical_stock;
  const updates = [];
  const violations = [];

  for (const c of openCommitments) {
    const required_total = c.required_total ?? c.qty_committed ?? 0;
    const covered_from_po = c.covered_from_po ?? 0;
    const current_reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
    const current_to_order = c.qty_to_order ?? 0;

    // How much do we need from stock? (required minus what PO covers)
    const need_from_stock = Math.max(0, required_total - covered_from_po);
    
    // Allocate from remaining stock
    const new_reserved = Math.min(remaining_stock, need_from_stock);
    
    // Compute to_order (the gap)
    const new_to_order = Math.max(0, required_total - new_reserved - covered_from_po);

    // Deduct from remaining
    remaining_stock = Math.max(0, remaining_stock - new_reserved);

    // Check if update needed
    const needs_update = (new_reserved !== current_reserved) || (new_to_order !== current_to_order);

    if (needs_update) {
      updates.push({
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

    // 5. INVARIANT CHECK - HARD FAIL
    const sum = new_reserved + covered_from_po + new_to_order;
    if (Math.abs(sum - required_total) > 0.001) {
      violations.push({
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
        commitment_version: (u.commitment_version ?? 0) + 1,
        last_recomputed_at: timestamp
      });
    }
  }

  return {
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
  };
}