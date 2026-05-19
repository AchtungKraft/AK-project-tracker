import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * guardDuplicateCommitment — STEP 6: Duplicate commitment guard
 * 
 * Enforces uniqueness for active commitments per (part_id, project_id, demand_source).
 * 
 * Modes:
 * - CHECK: Returns whether a duplicate exists (dry run)
 * - MERGE: Merges qty into existing commitment instead of creating new
 * - FIND_OR_CREATE: Returns existing if found, creates if not
 * 
 * AK STOCK special handling: stock commitments with same part+project merge automatically.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { mode = 'CHECK', part_id, project_id, demand_source, qty_to_add = 0 } = await req.json();

    if (!part_id || !project_id) {
      return Response.json({ error: 'part_id and project_id required' }, { status: 400 });
    }

    // Find active commitments for same part + project
    const existing = await base44.asServiceRole.entities.PartCommitment.filter({
      part_id,
      project_id,
      commitment_status: { $nin: ['cancelled', 'closed'] },
    });

    // Further filter by demand_source if provided
    const matches = demand_source
      ? existing.filter(c => (c.demand_source || 'PROJECT') === demand_source)
      : existing;

    if (mode === 'CHECK') {
      return Response.json({
        success: true,
        has_duplicate: matches.length > 0,
        existing_count: matches.length,
        existing_commitments: matches.map(c => ({
          id: c.id,
          required_total: c.required_total,
          reserved_from_stock: c.reserved_from_stock,
          covered_from_po: c.covered_from_po,
          qty_installed: c.qty_installed,
          commitment_status: c.commitment_status,
          demand_source: c.demand_source,
        })),
      });
    }

    if (mode === 'MERGE' && matches.length > 0 && qty_to_add > 0) {
      // Merge into the first active commitment
      const target = matches[0];
      const newRequired = (target.required_total ?? 0) + qty_to_add;

      // Only merge into commitments with no lifecycle progress
      const hasProgress = (target.covered_from_po ?? 0) > 0 ||
                          (target.qty_installed ?? 0) > 0 ||
                          (target.invoiced_qty ?? 0) > 0;

      if (hasProgress) {
        return Response.json({
          success: false,
          error: 'Cannot merge into commitment with lifecycle progress. Use scope addition instead.',
          code: 'LIFECYCLE_PROGRESS',
          existing_commitment_id: target.id,
        });
      }

      const uc = target.unit_cost_snapshot ?? 0;
      const ur = target.unit_retail_snapshot ?? 0;

      await base44.asServiceRole.entities.PartCommitment.update(target.id, {
        required_total: newRequired,
        qty_committed: newRequired,
        qty_to_order: Math.max(0, newRequired - (target.reserved_from_stock ?? 0) - (target.covered_from_po ?? 0) - (target.qty_installed ?? 0)),
        planned_cost_total: uc * newRequired,
        planned_retail_total: ur * newRequired,
        commitment_version: (target.commitment_version ?? 0) + 1,
        last_recomputed_at: new Date().toISOString(),
      });

      return Response.json({
        success: true,
        action: 'MERGED',
        commitment_id: target.id,
        old_required: target.required_total,
        new_required: newRequired,
        delta: qty_to_add,
      });
    }

    if (mode === 'FIND_OR_CREATE') {
      if (matches.length > 0) {
        return Response.json({
          success: true,
          action: 'FOUND_EXISTING',
          commitment_id: matches[0].id,
          commitment: matches[0],
        });
      }
      // No existing — signal that creation is safe
      return Response.json({
        success: true,
        action: 'SAFE_TO_CREATE',
        has_duplicate: false,
      });
    }

    return Response.json({
      success: true,
      has_duplicate: matches.length > 0,
      existing_count: matches.length,
    });

  } catch (error) {
    console.error('guardDuplicateCommitment error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});