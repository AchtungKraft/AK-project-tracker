import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Cost Reconciliation Automation
 * 
 * When invoice line item is created/updated:
 * 1. Find linked commitments through purchase line item
 * 2. Update actual_unit_cost, actual_extended_cost
 * 3. Recalculate margin_pct and pricing_integrity_status
 */

function calculateMargin(retailPrice, actualCost) {
  if (!retailPrice || retailPrice <= 0) return null;
  if (!actualCost || actualCost <= 0) return null;
  return ((retailPrice - actualCost) / retailPrice) * 100;
}

function determinePricingStatus(commitment) {
  const { unit_retail_snapshot, actual_unit_cost, unit_cost_snapshot, margin_pct } = commitment;
  
  if (!unit_retail_snapshot) {
    return 'missing_retail';
  }
  
  if (margin_pct !== null && margin_pct < 0) {
    return 'margin_negative';
  }
  
  if (!actual_unit_cost && !unit_cost_snapshot) {
    return 'estimated_cost';
  }
  
  if (actual_unit_cost) {
    return 'ok';
  }
  
  return 'estimated_cost';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { event, data } = body;
    
    // Only process VendorInvoiceLineItem events
    if (event?.entity_name !== 'VendorInvoiceLineItem') {
      return Response.json({ skipped: true, reason: 'Not a VendorInvoiceLineItem event' });
    }
    
    if (!['create', 'update'].includes(event?.type)) {
      return Response.json({ skipped: true, reason: 'Not a create/update event' });
    }
    
    const invoiceLineItem = data;
    const { purchase_line_item_id, actual_unit_cost, landed_unit_cost } = invoiceLineItem;
    
    if (!purchase_line_item_id) {
      return Response.json({ skipped: true, reason: 'No purchase line item linked' });
    }
    
    // Get the purchase line item
    const purchaseLineItem = await base44.asServiceRole.entities.PartPurchaseLineItem.get(purchase_line_item_id);
    if (!purchaseLineItem) {
      return Response.json({ error: 'Purchase line item not found' }, { status: 404 });
    }
    
    // Find all commitments linked to this PO line item
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.list();
    const linkedCommitments = allCommitments.filter(c => 
      (c.order_line_item_ids || []).includes(purchase_line_item_id) &&
      c.commitment_status !== 'cancelled'
    );
    
    if (linkedCommitments.length === 0) {
      return Response.json({ skipped: true, reason: 'No commitments linked to this line item' });
    }
    
    // Use landed cost if available, otherwise actual cost
    const costToApply = landed_unit_cost || actual_unit_cost;
    
    const updates = [];
    
    for (const commitment of linkedCommitments) {
      const extendedCost = costToApply * (commitment.qty_committed || 0);
      const margin = calculateMargin(commitment.unit_retail_snapshot, costToApply);
      
      const updateData = {
        actual_unit_cost: costToApply,
        actual_extended_cost: extendedCost,
        margin_pct: margin,
        commitment_version: (commitment.commitment_version || 1) + 1
      };
      
      // Determine pricing status
      updateData.pricing_integrity_status = determinePricingStatus({
        ...commitment,
        ...updateData
      });
      
      await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updateData);
      
      // Audit log
      await base44.asServiceRole.entities.CommitmentAuditLog.create({
        commitment_id: commitment.id,
        action_type: 'update',
        previous_values: {
          actual_unit_cost: commitment.actual_unit_cost,
          actual_extended_cost: commitment.actual_extended_cost,
          margin_pct: commitment.margin_pct,
          pricing_integrity_status: commitment.pricing_integrity_status
        },
        new_values: updateData,
        trigger_source: 'sync',
        triggered_by: 'invoice_sync',
        validation_passed: true
      });
      
      updates.push({
        commitment_id: commitment.id,
        actual_unit_cost: costToApply,
        margin_pct: margin,
        pricing_status: updateData.pricing_integrity_status
      });
    }
    
    return Response.json({
      success: true,
      invoice_line_item_id: invoiceLineItem.id,
      purchase_line_item_id,
      commitments_updated: updates.length,
      updates
    });
    
  } catch (error) {
    console.error('Invoice sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});