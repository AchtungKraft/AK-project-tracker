/**
 * createScopeAddCommitment - Delta Commitment Model
 * 
 * HARD RULE: All positive quantity increases create a NEW commitment row.
 * No upward mutation of required_total on existing commitments allowed.
 * 
 * This eliminates lifecycle contamination where invoiced/installed/ordered
 * quantities become misaligned with required_total.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, part_id, deltaQty, parent_commitment_id } = await req.json();

    // ========== VALIDATION ==========
    
    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }
    
    if (!part_id) {
      return Response.json({ error: 'part_id is required' }, { status: 400 });
    }
    
    if (deltaQty === undefined || deltaQty === null) {
      return Response.json({ error: 'deltaQty is required' }, { status: 400 });
    }
    
    if (typeof deltaQty !== 'number' || deltaQty <= 0) {
      return Response.json({ 
        error: 'deltaQty must be a positive number. Use reduction flow for negative changes.',
        code: 'INVALID_DELTA_QTY'
      }, { status: 400 });
    }

    // Verify project exists
    const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
    if (!projects || projects.length === 0) {
      return Response.json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' }, { status: 404 });
    }

    // Verify part exists and get pricing
    const parts = await base44.asServiceRole.entities.Part.filter({ id: part_id });
    if (!parts || parts.length === 0) {
      return Response.json({ error: 'Part not found', code: 'PART_NOT_FOUND' }, { status: 404 });
    }
    
    const part = parts[0];

    // ========== PRICING SNAPSHOT ==========
    
    // Get cost (canonical field)
    const unit_cost_snapshot = part.cost || 0;
    
    // Get retail effective (respects pricing_mode)
    let unit_retail_snapshot = 0;
    const pricing_mode = part.pricing_mode || 'matrix';
    
    if (pricing_mode === 'manual') {
      unit_retail_snapshot = part.retail_override || 0;
    } else {
      // matrix mode
      unit_retail_snapshot = part.retail_matrix_price || 0;
    }
    
    // Calculate totals
    const planned_cost_total = unit_cost_snapshot * deltaQty;
    const planned_retail_total = unit_retail_snapshot * deltaQty;

    // ========== CREATE NEW COMMITMENT ==========
    
    const newCommitment = {
      project_id,
      part_id,
      
      // Canonical quantity fields - IMMUTABLE after creation for scope adds
      required_total: deltaQty,
      reserved_from_stock: 0,
      covered_from_po: 0,
      qty_installed: 0,
      invoiced_qty: 0,
      invoiced_amount: 0,
      
      // Status fields
      billing_status: 'unbilled',
      commitment_status: 'planned',
      coverage_status: 'NOT_COVERED',
      
      // Source tracking - CRITICAL for delta model
      source_type: 'scope_addition',
      parent_commitment_id: parent_commitment_id || null,
      allocation_source: 'manual_commitment',
      
      // Pricing snapshot - frozen at creation
      unit_cost_snapshot,
      unit_retail_snapshot,
      planned_cost_total,
      planned_retail_total,
      
      // Legacy fields (for compatibility)
      qty_committed: deltaQty,
      qty_to_order: deltaQty,
      qty_ordered: 0,
      qty_received: 0,
      qty_reserved: 0,
      qty_allocated: 0,
      qty_cancelled: 0,
      
      // Lifecycle tracking
      supply_source_type: 'VENDOR',
      order_line_item_ids: [],
      
      // Version control
      commitment_version: 1,
      state_version: 0,
      last_recomputed_at: new Date().toISOString(),
      
      // Integrity
      integrity_warning: false,
      integrity_warning_details: null,
      pricing_integrity_status: unit_cost_snapshot > 0 && unit_retail_snapshot > 0 ? 'ok' : 'estimated_cost',
      
      // Invoice controls
      invoice_override_approved: false,
      invoice_blocked_reason: null,
      scope_reduction_credit_created: false,
      requires_prepay: false,
    };

    const created = await base44.asServiceRole.entities.PartCommitment.create(newCommitment);

    // ========== PHASE 6: AUDIT LOGGING ==========
    // Track scope additions for traceability
    await base44.asServiceRole.entities.CommitmentAuditLog.create({
      commitment_id: created.id,
      action_type: 'SCOPE_ADD',
      actor_email: user.email,
      previous_state: null,
      new_state: JSON.stringify({
        required_total: deltaQty,
        unit_cost_snapshot,
        unit_retail_snapshot
      }),
      delta_qty: deltaQty,
      parent_commitment_id: parent_commitment_id || null,
      created_commitment_id: created.id,
      timestamp: new Date().toISOString(),
      notes: `Scope addition: +${deltaQty} x ${part.part_name}`
    });

    console.log(`[createScopeAddCommitment] Created scope addition commitment:`, {
      commitment_id: created.id,
      project_id,
      part_id,
      deltaQty,
      parent_commitment_id,
      unit_cost_snapshot,
      unit_retail_snapshot,
    });

    return Response.json({
      success: true,
      commitment_id: created.id,
      commitment: created,
      pricing: {
        unit_cost_snapshot,
        unit_retail_snapshot,
        planned_cost_total,
        planned_retail_total,
      },
      message: `Created scope addition commitment for ${deltaQty} units`,
    });

  } catch (error) {
    console.error('[createScopeAddCommitment] Error:', error);
    return Response.json({ 
      error: error.message,
      code: 'SCOPE_ADD_FAILED'
    }, { status: 500 });
  }
});