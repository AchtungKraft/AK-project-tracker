import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * resolveRetailAdjustmentRequest - PHASE 15V.2 Retail Adjustment Resolution
 * 
 * Manager action to resolve a RetailAdjustmentRequest.
 * 
 * Actions:
 * - APPROVE_RETAIL_CHANGE: Update commitment retail to new value
 * - WAIVE_INVOICE: Allow invoicing despite negative margin
 * - CLOSE_NO_ACTION: Close request without changes
 * 
 * Input:
 *   request_id: string (required)
 *   action: "APPROVE_RETAIL_CHANGE" | "WAIVE_INVOICE" | "CLOSE_NO_ACTION"
 *   new_retail: number (required if APPROVE_RETAIL_CHANGE)
 *   reason: string (required for WAIVE_INVOICE)
 * 
 * Output:
 *   { success, request_id, action_taken, commitment_updated }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Manager role check (could be admin or manager role)
    if (user.role !== 'admin') {
      return Response.json({ 
        error: 'MANAGER_ACCESS_REQUIRED',
        message: 'Only admins can resolve retail adjustment requests'
      }, { status: 403 });
    }

    const { request_id, action, new_retail, reason } = await req.json();

    if (!request_id) {
      return Response.json({ 
        error: 'REQUEST_ID_REQUIRED'
      }, { status: 400 });
    }

    if (!action || !['APPROVE_RETAIL_CHANGE', 'WAIVE_INVOICE', 'CLOSE_NO_ACTION'].includes(action)) {
      return Response.json({ 
        error: 'INVALID_ACTION',
        message: 'action must be APPROVE_RETAIL_CHANGE, WAIVE_INVOICE, or CLOSE_NO_ACTION'
      }, { status: 400 });
    }

    // Fetch the request
    let adjustmentRequest;
    try {
      const requests = await base44.entities.RetailAdjustmentRequest.filter({ 
        id: request_id 
      });
      adjustmentRequest = requests[0];
    } catch (e) {
      return Response.json({ 
        error: 'REQUEST_NOT_FOUND',
        request_id,
        message: e.message
      }, { status: 404 });
    }
    
    if (!adjustmentRequest) {
      return Response.json({ 
        error: 'REQUEST_NOT_FOUND',
        request_id
      }, { status: 404 });
    }

    if (adjustmentRequest.status !== 'OPEN') {
      return Response.json({ 
        error: 'REQUEST_ALREADY_RESOLVED',
        current_status: adjustmentRequest.status
      }, { status: 400 });
    }

    // Fetch commitment
    const [commitment] = await base44.entities.PartCommitment.filter({ 
      id: adjustmentRequest.commitment_id 
    });
    
    if (!commitment) {
      return Response.json({ 
        error: 'COMMITMENT_NOT_FOUND',
        commitment_id: adjustmentRequest.commitment_id
      }, { status: 404 });
    }

    const timestamp = new Date().toISOString();
    let requestUpdate = {};
    let commitmentUpdate = {};
    let action_taken = '';

    switch (action) {
      case 'APPROVE_RETAIL_CHANGE': {
        if (!new_retail || new_retail <= 0) {
          return Response.json({ 
            error: 'NEW_RETAIL_REQUIRED',
            message: 'new_retail must be a positive number'
          }, { status: 400 });
        }

        // Check billing status - can only change retail if billable
        if (commitment.billing_status === 'invoiced' || commitment.billing_status === 'paid') {
          return Response.json({ 
            error: 'RETAIL_LOCKED_AFTER_INVOICE',
            message: 'Cannot change retail after commitment has been invoiced or paid',
            billing_status: commitment.billing_status
          }, { status: 403 });
        }

        // Update commitment retail
        const newRetailRounded = Math.round(new_retail); // Ensure whole dollar
        const required_total = commitment.required_total || 0;
        
        commitmentUpdate = {
          unit_retail_snapshot: newRetailRounded,
          planned_retail_total: newRetailRounded * required_total,
          pricing_integrity_status: 'overridden_retail',
          retail_adjustment_request_id: null,
          invoice_blocked_reason: null,
          commitment_version: (commitment.commitment_version || 0) + 1
        };

        // Recompute margin
        const actualCost = commitment.actual_unit_cost || commitment.unit_cost_snapshot || 0;
        if (actualCost > 0 && newRetailRounded > 0) {
          commitmentUpdate.margin_pct = ((newRetailRounded - actualCost) / newRetailRounded) * 100;
        }

        requestUpdate = {
          status: 'APPROVED_RETAIL_CHANGE',
          resolution_action: 'RETAIL_UPDATED',
          new_retail_approved: newRetailRounded,
          override_reason: reason || `Retail updated to $${newRetailRounded}`,
          resolved_by: user.email,
          resolved_at: timestamp
        };

        action_taken = `Retail updated from $${adjustmentRequest.old_retail} to $${newRetailRounded}`;
        break;
      }

      case 'WAIVE_INVOICE': {
        if (!reason) {
          return Response.json({ 
            error: 'REASON_REQUIRED',
            message: 'reason required when waiving invoice block'
          }, { status: 400 });
        }

        // Allow invoicing despite margin issue
        commitmentUpdate = {
          invoice_override_approved: true,
          invoice_override_reason: reason,
          invoice_override_by: user.email,
          invoice_override_at: timestamp,
          invoice_blocked_reason: null, // Unblock
          retail_adjustment_request_id: null,
          commitment_version: (commitment.commitment_version || 0) + 1
        };

        requestUpdate = {
          status: 'WAIVED',
          resolution_action: 'INVOICE_OVERRIDE',
          override_reason: reason,
          resolved_by: user.email,
          resolved_at: timestamp
        };

        action_taken = `Invoice block waived. Reason: ${reason}`;
        break;
      }

      case 'CLOSE_NO_ACTION': {
        // Just close the request without changes
        commitmentUpdate = {
          retail_adjustment_request_id: null,
          // Keep invoice blocked if margin is negative
          commitment_version: (commitment.commitment_version || 0) + 1
        };

        requestUpdate = {
          status: 'CLOSED',
          resolution_action: 'NO_ACTION',
          override_reason: reason || 'Closed without action',
          resolved_by: user.email,
          resolved_at: timestamp
        };

        action_taken = 'Request closed without changes';
        break;
      }
    }

    // Persist changes
    await Promise.all([
      base44.asServiceRole.entities.RetailAdjustmentRequest.update(request_id, requestUpdate),
      base44.asServiceRole.entities.PartCommitment.update(commitment.id, commitmentUpdate)
    ]);

    // Emit lifecycle event
    await base44.asServiceRole.entities.LifecycleEvent.create({
      commitment_id: commitment.id,
      event_type: 'RETAIL_ADJUSTMENT_RESOLVED',
      trigger_source: 'MANAGER_ACTION',
      triggered_by: user.email,
      actor_email: user.email,
      part_id: commitment.part_id,
      project_id: commitment.project_id,
      old_values: JSON.stringify({
        request_status: 'OPEN',
        unit_retail_snapshot: commitment.unit_retail_snapshot
      }),
      new_values: JSON.stringify({
        request_status: requestUpdate.status,
        action,
        new_retail: commitmentUpdate.unit_retail_snapshot,
        invoice_override: commitmentUpdate.invoice_override_approved
      }),
      metadata: JSON.stringify({
        request_id,
        reason: requestUpdate.override_reason
      }),
      event_date: timestamp
    });

    return Response.json({
      success: true,
      request_id,
      commitment_id: commitment.id,
      action,
      action_taken,
      request_status: requestUpdate.status,
      commitment_updated: Object.keys(commitmentUpdate).length > 1,
      new_retail: commitmentUpdate.unit_retail_snapshot,
      invoice_blocked: !!commitmentUpdate.invoice_blocked_reason
    });

  } catch (error) {
    console.error('resolveRetailAdjustmentRequest error:', error);
    return Response.json({ 
      error: 'RESOLUTION_FAILED',
      message: error.message 
    }, { status: 500 });
  }
});