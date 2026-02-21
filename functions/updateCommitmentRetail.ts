import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * updateCommitmentRetail - PHASE 15 Commitment Retail Override
 * 
 * Allows editing commitment retail ONLY IF:
 * - billing_status = "billable"
 * - NOT invoiced
 * - NOT paid
 * 
 * If edited:
 * - Updates unit_retail_snapshot
 * - Recomputes planned_retail_total
 * - Sets pricing_integrity_status = "overridden_retail"
 * - Emits LifecycleEvent: RETAIL_OVERRIDE
 * 
 * If invoiced or paid:
 * - Returns error: RETAIL_LOCKED_AFTER_INVOICE
 * 
 * Input:
 *   commitment_id: string
 *   new_unit_retail: number
 *   reason: string (optional)
 * 
 * Output:
 *   { success: true, commitment_id, old_retail, new_retail, planned_retail_total }
 *   OR { error: "RETAIL_LOCKED_AFTER_INVOICE" }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commitment_id, new_unit_retail, reason } = await req.json();

    if (!commitment_id || new_unit_retail === undefined) {
      return Response.json({ 
        error: 'INVALID_INPUT',
        message: 'commitment_id and new_unit_retail required'
      }, { status: 400 });
    }

    const newRetail = Number(new_unit_retail);
    if (isNaN(newRetail) || newRetail <= 0) {
      return Response.json({ 
        error: 'INVALID_RETAIL',
        message: 'new_unit_retail must be positive',
        value: new_unit_retail
      }, { status: 400 });
    }

    // Fetch commitment
    const [commitment] = await base44.entities.PartCommitment.filter({ id: commitment_id });
    if (!commitment) {
      return Response.json({ 
        error: 'COMMITMENT_NOT_FOUND',
        message: `Commitment ${commitment_id} not found`
      }, { status: 404 });
    }

    // HARD LOCK CHECK
    const billing_status = commitment.billing_status || 'billable';
    
    if (billing_status === 'invoiced' || billing_status === 'paid') {
      return Response.json({
        error: 'RETAIL_LOCKED_AFTER_INVOICE',
        message: `Cannot edit retail for ${billing_status} commitment`,
        commitment_id,
        billing_status,
        current_retail: commitment.unit_retail_snapshot
      }, { status: 403 });
    }

    if (billing_status !== 'billable') {
      return Response.json({
        error: 'RETAIL_NOT_EDITABLE',
        message: `Retail can only be edited for billable commitments, current status: ${billing_status}`,
        billing_status
      }, { status: 403 });
    }

    // Calculate new planned retail total
    const required_total = commitment.required_total ?? 0;
    const planned_retail_total = newRetail * required_total;
    const old_retail = commitment.unit_retail_snapshot ?? 0;

    // Update commitment
    await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
      unit_retail_snapshot: newRetail,
      planned_retail_total,
      pricing_integrity_status: 'overridden_retail',
      commitment_version: (commitment.commitment_version ?? 0) + 1
    });

    // Emit lifecycle event
    await base44.asServiceRole.entities.LifecycleEvent.create({
      commitment_id,
      event_type: 'RETAIL_OVERRIDE',
      trigger_source: 'MANUAL_EDIT',
      triggered_by: user.email,
      actor_email: user.email,
      part_id: commitment.part_id,
      project_id: commitment.project_id,
      old_values: JSON.stringify({ 
        unit_retail_snapshot: old_retail,
        planned_retail_total: old_retail * required_total
      }),
      new_values: JSON.stringify({ 
        unit_retail_snapshot: newRetail,
        planned_retail_total
      }),
      metadata: JSON.stringify({ reason: reason || 'Manual retail override' }),
      event_date: new Date().toISOString()
    });

    return Response.json({
      success: true,
      commitment_id,
      old_retail,
      new_retail: newRetail,
      planned_retail_total,
      pricing_integrity_status: 'overridden_retail',
      message: `Retail updated from $${old_retail.toFixed(2)} to $${newRetail.toFixed(2)}`
    });

  } catch (error) {
    console.error('updateCommitmentRetail error:', error);
    return Response.json({ 
      error: 'UPDATE_FAILED',
      message: error.message 
    }, { status: 500 });
  }
});