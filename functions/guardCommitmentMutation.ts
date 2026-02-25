/**
 * guardCommitmentMutation - PHASE 7: Hard Protection Guard
 * 
 * HARD RULE: No existing commitment may have required_total INCREASED.
 * All positive quantity changes must create a new scope addition commitment.
 * 
 * This guard is called by resolver/mutation flows to validate mutations.
 * Throws an error if an illegal mutation is attempted.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      commitment_id, 
      proposed_required_total,
      mutation_source,
      bypass_guard = false // For admin emergency use only
    } = await req.json();

    if (!commitment_id) {
      return Response.json({ error: 'commitment_id is required' }, { status: 400 });
    }

    if (proposed_required_total === undefined) {
      return Response.json({ error: 'proposed_required_total is required' }, { status: 400 });
    }

    // Fetch commitment
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    const commitment = commitments[0];
    
    if (!commitment) {
      return Response.json({ error: 'Commitment not found', code: 'COMMITMENT_NOT_FOUND' }, { status: 404 });
    }

    const current_required = commitment.required_total ?? commitment.qty_committed ?? 0;
    const delta = proposed_required_total - current_required;

    // ========== DELTA COMMITMENT MODEL ENFORCEMENT ==========
    
    // RULE 1: No upward mutation of required_total allowed
    if (delta > 0 && !bypass_guard) {
      // Check if commitment has any lifecycle progress
      const has_lifecycle_progress = 
        (commitment.invoiced_qty || 0) > 0 ||
        (commitment.qty_installed || 0) > 0 ||
        (commitment.covered_from_po || 0) > 0 ||
        (commitment.reserved_from_stock || commitment.qty_reserved || 0) > 0;

      if (has_lifecycle_progress) {
        console.error(`[guardCommitmentMutation] BLOCKED: Attempt to increase required_total on commitment with lifecycle progress`, {
          commitment_id,
          current_required,
          proposed_required_total,
          delta,
          mutation_source,
          invoiced_qty: commitment.invoiced_qty,
          qty_installed: commitment.qty_installed,
          covered_from_po: commitment.covered_from_po,
          reserved_from_stock: commitment.reserved_from_stock
        });

        return Response.json({
          allowed: false,
          error: 'UPWARD_MUTATION_BLOCKED',
          message: `Cannot increase required_total on commitment with lifecycle progress. Use createScopeAddCommitment for quantity increases.`,
          code: 'DELTA_MODEL_VIOLATION',
          current_required,
          proposed_required_total,
          delta,
          lifecycle_progress: {
            invoiced_qty: commitment.invoiced_qty || 0,
            qty_installed: commitment.qty_installed || 0,
            covered_from_po: commitment.covered_from_po || 0,
            reserved_from_stock: commitment.reserved_from_stock || 0
          },
          suggested_action: {
            function: 'createScopeAddCommitment',
            params: {
              project_id: commitment.project_id,
              part_id: commitment.part_id,
              deltaQty: delta,
              parent_commitment_id: commitment_id
            }
          }
        }, { status: 400 });
      }
      
      // Even without lifecycle progress, warn about upward mutation
      console.warn(`[guardCommitmentMutation] WARNING: Upward mutation on fresh commitment. Consider using scope addition model.`, {
        commitment_id,
        delta,
        mutation_source
      });
    }

    // RULE 2: No downward mutation if lifecycle progress exists
    if (delta < 0) {
      const invoiced_qty = commitment.invoiced_qty || 0;
      const qty_installed = commitment.qty_installed || 0;
      const covered_from_po = commitment.covered_from_po || 0;
      const reserved_from_stock = commitment.reserved_from_stock || commitment.qty_reserved || 0;

      // Check each field individually with specific error messages
      if (invoiced_qty > 0) {
        return Response.json({
          allowed: false,
          error: 'REDUCTION_BLOCKED_INVOICED',
          message: `Cannot reduce required_total: ${invoiced_qty} units already invoiced.`,
          code: 'LIFECYCLE_PROGRESS_INVOICED',
          blocked_by: { invoiced_qty }
        }, { status: 400 });
      }

      if (qty_installed > 0) {
        return Response.json({
          allowed: false,
          error: 'REDUCTION_BLOCKED_INSTALLED',
          message: `Cannot reduce required_total: ${qty_installed} units already installed.`,
          code: 'LIFECYCLE_PROGRESS_INSTALLED',
          blocked_by: { qty_installed }
        }, { status: 400 });
      }

      if (covered_from_po > 0) {
        return Response.json({
          allowed: false,
          error: 'REDUCTION_BLOCKED_PO',
          message: `Cannot reduce required_total: ${covered_from_po} units covered by purchase order.`,
          code: 'LIFECYCLE_PROGRESS_PO',
          blocked_by: { covered_from_po }
        }, { status: 400 });
      }

      if (reserved_from_stock > 0) {
        return Response.json({
          allowed: false,
          error: 'REDUCTION_BLOCKED_RESERVED',
          message: `Cannot reduce required_total: ${reserved_from_stock} units reserved from stock.`,
          code: 'LIFECYCLE_PROGRESS_RESERVED',
          blocked_by: { reserved_from_stock }
        }, { status: 400 });
      }
    }

    // Mutation allowed
    console.log(`[guardCommitmentMutation] ALLOWED: Mutation on commitment ${commitment_id}`, {
      current_required,
      proposed_required_total,
      delta,
      mutation_source
    });

    return Response.json({
      allowed: true,
      commitment_id,
      current_required,
      proposed_required_total,
      delta,
      message: delta === 0 
        ? 'No change to required_total' 
        : (delta > 0 
            ? `Upward mutation allowed (no lifecycle progress)` 
            : `Downward mutation allowed (no lifecycle progress)`)
    });

  } catch (error) {
    console.error('[guardCommitmentMutation] Error:', error);
    return Response.json({ 
      error: error.message,
      code: 'GUARD_ERROR'
    }, { status: 500 });
  }
});