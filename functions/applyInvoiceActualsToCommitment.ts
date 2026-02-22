import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * applyInvoiceActualsToCommitment - PHASE 15V.2 Invoice Actuals Application
 * 
 * Updates commitment and part with actual cost from vendor invoice.
 * CRITICAL: NEVER modifies unit_retail_snapshot or retail fields.
 * 
 * If actual cost creates negative margin:
 * - Auto-creates RetailAdjustmentRequest
 * - Sets commitment.pricing_integrity_status = "margin_negative"
 * - Blocks invoicing until resolved
 * 
 * Input:
 *   commitment_id: string (required)
 *   actual_unit_cost: number (required)
 *   invoice_id: string (optional)
 *   vendor_id: string (optional)
 *   received_date: string (optional)
 *   notes: string (optional)
 * 
 * Output:
 *   { success, commitment_id, margin_status, adjustment_request_id? }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      commitment_id, 
      actual_unit_cost, 
      invoice_id, 
      vendor_id, 
      received_date,
      notes 
    } = await req.json();

    // === VALIDATION ===
    if (!commitment_id) {
      return Response.json({ 
        error: 'COMMITMENT_ID_REQUIRED',
        message: 'commitment_id is required'
      }, { status: 400 });
    }

    if (actual_unit_cost === undefined || actual_unit_cost === null) {
      return Response.json({ 
        error: 'ACTUAL_COST_REQUIRED',
        message: 'actual_unit_cost is required'
      }, { status: 400 });
    }

    const actualCost = Number(actual_unit_cost);
    if (isNaN(actualCost) || actualCost < 0) {
      return Response.json({ 
        error: 'INVALID_COST',
        message: 'actual_unit_cost must be a non-negative number',
        value: actual_unit_cost
      }, { status: 400 });
    }

    // === FETCH COMMITMENT & PART ===
    let commitment;
    try {
      const commitments = await base44.entities.PartCommitment.filter({ id: commitment_id });
      commitment = commitments[0];
    } catch (e) {
      return Response.json({ 
        error: 'COMMITMENT_NOT_FOUND',
        commitment_id,
        message: e.message
      }, { status: 404 });
    }
    
    if (!commitment) {
      return Response.json({ 
        error: 'COMMITMENT_NOT_FOUND',
        commitment_id
      }, { status: 404 });
    }

    const [part] = await base44.entities.Part.filter({ id: commitment.part_id });
    if (!part) {
      return Response.json({ 
        error: 'PART_NOT_FOUND',
        part_id: commitment.part_id
      }, { status: 404 });
    }

    const timestamp = new Date().toISOString();
    const required_total = commitment.required_total ?? 0;
    const unit_retail = commitment.unit_retail_snapshot ?? 0;

    // === COMPUTE ACTUALS ===
    const actual_extended_cost = actualCost * required_total;
    
    // Margin calculation: (retail - cost) / retail
    let margin_pct = null;
    let margin_status = 'ok';
    
    if (unit_retail > 0) {
      margin_pct = ((unit_retail - actualCost) / unit_retail) * 100;
      
      if (actualCost > unit_retail) {
        margin_status = 'margin_negative';
      } else if (margin_pct < 10) {
        margin_status = 'margin_low'; // Warning but not blocking
      }
    } else {
      margin_status = 'missing_retail';
    }

    // === UPDATE COMMITMENT (COST ONLY - NEVER TOUCH RETAIL) ===
    const commitmentUpdate = {
      actual_unit_cost: actualCost,
      actual_extended_cost,
      margin_pct,
      commitment_version: (commitment.commitment_version ?? 0) + 1
    };

    // Set pricing integrity status
    if (margin_status === 'margin_negative') {
      commitmentUpdate.pricing_integrity_status = 'margin_negative';
      commitmentUpdate.integrity_warning = true;
      commitmentUpdate.integrity_warning_details = `Cost $${actualCost.toFixed(2)} exceeds retail $${unit_retail.toFixed(2)}`;
      commitmentUpdate.invoice_blocked_reason = 'MARGIN_NEGATIVE';
    } else if (margin_status === 'missing_retail') {
      commitmentUpdate.pricing_integrity_status = 'missing_retail';
      commitmentUpdate.invoice_blocked_reason = 'MISSING_RETAIL';
    } else {
      commitmentUpdate.pricing_integrity_status = 'ok';
      commitmentUpdate.invoice_blocked_reason = null;
    }

    // === CREATE RETAIL ADJUSTMENT REQUEST IF NEGATIVE MARGIN ===
    let adjustment_request_id = null;
    
    if (margin_status === 'margin_negative') {
      // Compute suggested retail from matrix
      let suggested_retail = null;
      let margin_pct_suggested = null;
      
      try {
        const matrixResult = await base44.functions.invoke('computeRetailFromMatrix', { 
          cost: actualCost 
        });
        if (matrixResult.data?.success) {
          suggested_retail = matrixResult.data.retail_matrix_price;
          if (suggested_retail > 0) {
            margin_pct_suggested = ((suggested_retail - actualCost) / suggested_retail) * 100;
          }
        }
      } catch (e) {
        console.warn('Failed to compute suggested retail:', e.message);
      }

      // Check for existing open request
      const existingRequests = await base44.entities.RetailAdjustmentRequest.filter({
        commitment_id,
        status: 'OPEN'
      });

      if (existingRequests.length === 0) {
        // Create new request
        const newRequest = await base44.asServiceRole.entities.RetailAdjustmentRequest.create({
          commitment_id,
          project_id: commitment.project_id,
          part_id: commitment.part_id,
          old_retail: unit_retail,
          actual_unit_cost: actualCost,
          required_total,
          suggested_retail,
          margin_pct_current: margin_pct,
          margin_pct_suggested,
          reason_code: 'COST_INCREASE_FROM_INVOICE',
          status: 'OPEN',
          resolution_action: 'PENDING',
          invoice_id,
          vendor_id,
          notes: notes || `Auto-created: cost $${actualCost.toFixed(2)} exceeds retail $${unit_retail.toFixed(2)}`
        });
        
        adjustment_request_id = newRequest.id;
        commitmentUpdate.retail_adjustment_request_id = newRequest.id;
        commitmentUpdate.invoice_blocked_reason = 'OPEN_ADJUSTMENT_REQUEST';
      } else {
        adjustment_request_id = existingRequests[0].id;
        commitmentUpdate.retail_adjustment_request_id = existingRequests[0].id;
      }
    }

    // === UPDATE PART COST (NEVER TOUCH RETAIL) ===
    const partUpdate = {
      cost: actualCost,
      cost_source: 'invoice',
      is_cost_verified: true,
      last_cost_update_at: timestamp,
      last_cost_update_by: user.email,
      needs_cost_review: false // Clear review flag since we have verified cost
    };

    // === PERSIST CHANGES ===
    await Promise.all([
      base44.asServiceRole.entities.PartCommitment.update(commitment_id, commitmentUpdate),
      base44.asServiceRole.entities.Part.update(commitment.part_id, partUpdate)
    ]);

    // === EMIT LIFECYCLE EVENT ===
    await base44.asServiceRole.entities.LifecycleEvent.create({
      commitment_id,
      event_type: 'INVOICE_ACTUALS_APPLIED',
      trigger_source: 'INVOICE_RECONCILIATION',
      triggered_by: user.email,
      actor_email: user.email,
      part_id: commitment.part_id,
      project_id: commitment.project_id,
      old_values: JSON.stringify({
        actual_unit_cost: commitment.actual_unit_cost,
        actual_extended_cost: commitment.actual_extended_cost,
        margin_pct: commitment.margin_pct,
        part_cost: part.cost
      }),
      new_values: JSON.stringify({
        actual_unit_cost: actualCost,
        actual_extended_cost,
        margin_pct,
        part_cost: actualCost
      }),
      metadata: JSON.stringify({
        invoice_id,
        vendor_id,
        margin_status,
        adjustment_request_id,
        unit_retail_snapshot: unit_retail,
        notes
      }),
      event_date: timestamp
    });

    return Response.json({
      success: true,
      commitment_id,
      part_id: commitment.part_id,
      actual_unit_cost: actualCost,
      actual_extended_cost,
      margin_pct,
      margin_status,
      unit_retail_snapshot: unit_retail,
      pricing_integrity_status: commitmentUpdate.pricing_integrity_status,
      adjustment_request_id,
      invoice_blocked: margin_status === 'margin_negative' || margin_status === 'missing_retail',
      message: margin_status === 'margin_negative'
        ? `Negative margin detected. RetailAdjustmentRequest created. Invoice blocked until resolved.`
        : `Invoice actuals applied successfully. Margin: ${margin_pct?.toFixed(1)}%`
    });

  } catch (error) {
    console.error('applyInvoiceActualsToCommitment error:', error);
    return Response.json({ 
      error: 'APPLY_ACTUALS_FAILED',
      message: error.message 
    }, { status: 500 });
  }
});