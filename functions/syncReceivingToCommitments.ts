import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Automation: Sync PartPurchaseLineItem receiving to linked PartCommitments
 * 
 * Trigger: PartPurchaseLineItem UPDATE (qty_received change)
 * 
 * Behavior:
 * - Find commitments with this line item in order_line_item_ids
 * - Distribute qty_received proportionally across commitments
 * - Update commitment_status based on received quantities
 * 
 * GUARDRAIL: Does NOT modify InventoryItem - that's handled separately
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data, old_data } = await req.json();

    // Only process PartPurchaseLineItem updates
    if (event?.entity_name !== 'PartPurchaseLineItem' || event?.type !== 'update') {
      return Response.json({ skipped: true, reason: 'Not a PartPurchaseLineItem update' });
    }

    const lineItemId = event.entity_id;
    const newReceived = data?.qty_received || 0;
    const oldReceived = old_data?.qty_received || 0;
    const receivedDelta = newReceived - oldReceived;

    // Skip if qty_received didn't change
    if (receivedDelta === 0) {
      return Response.json({ skipped: true, reason: 'qty_received unchanged' });
    }

    // Find all commitments that reference this line item
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.list();
    const linkedCommitments = allCommitments.filter(c => 
      (c.order_line_item_ids || []).includes(lineItemId) &&
      c.commitment_status !== 'cancelled'
    );

    if (linkedCommitments.length === 0) {
      return Response.json({ skipped: true, reason: 'No linked commitments found' });
    }

    // Calculate total ordered across linked commitments for proportional distribution
    const totalCommittedOrdered = linkedCommitments.reduce((sum, c) => sum + (c.qty_ordered || 0), 0);
    
    const updates = [];

    for (const commitment of linkedCommitments) {
      // Proportional distribution of received delta
      let commitmentShare = receivedDelta;
      
      if (totalCommittedOrdered > 0 && linkedCommitments.length > 1) {
        const proportion = (commitment.qty_ordered || 0) / totalCommittedOrdered;
        commitmentShare = Math.round(receivedDelta * proportion);
      }

      const newCommitmentReceived = Math.max(0, (commitment.qty_received || 0) + commitmentShare);
      
      // Determine new status
      let newStatus = commitment.commitment_status;
      const qtyOrdered = commitment.qty_ordered || 0;
      const qtyCommitted = commitment.qty_committed || 0;
      
      if (newCommitmentReceived >= qtyOrdered && qtyOrdered > 0) {
        newStatus = 'received';
      } else if (newCommitmentReceived > 0) {
        newStatus = 'partially_received';
      } else if (qtyOrdered > 0) {
        newStatus = 'ordered';
      }

      // Don't downgrade from allocated/installed
      if (['allocated', 'installed', 'closed'].includes(commitment.commitment_status)) {
        newStatus = commitment.commitment_status;
      }

      await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
        qty_received: newCommitmentReceived,
        commitment_status: newStatus,
      });

      updates.push({
        commitment_id: commitment.id,
        qty_received: newCommitmentReceived,
        status: newStatus,
      });
    }

    return Response.json({
      success: true,
      line_item_id: lineItemId,
      received_delta: receivedDelta,
      commitments_updated: updates.length,
      updates,
    });

  } catch (error) {
    console.error('Receiving sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});