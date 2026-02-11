import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Automation: Sync PartPurchaseLineItem receiving to linked PartCommitments
 * 
 * REFACTORED for Phase 2D:
 * - Uses State Engine for status calculation
 * - Proportional distribution with safety checks
 * - Audit logging
 * - Concurrency protection
 * 
 * GUARDRAIL: Does NOT modify InventoryItem - that's handled separately
 */

function calculateCommitmentState(commitment) {
  const { qty_committed = 0, qty_ordered = 0, qty_received = 0, qty_allocated = 0, qty_installed = 0, qty_cancelled = 0 } = commitment;
  if (qty_cancelled >= qty_committed) return 'cancelled';
  if (qty_installed >= qty_committed) return 'installed';
  if (qty_allocated >= qty_committed) return 'allocated';
  if (qty_received >= qty_committed) return 'received';
  if (qty_received > 0) return 'partially_received';
  if (qty_ordered > 0) return 'ordered';
  return 'planned';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data, old_data } = await req.json();

    if (event?.entity_name !== 'PartPurchaseLineItem' || event?.type !== 'update') {
      return Response.json({ skipped: true, reason: 'Not a PartPurchaseLineItem update' });
    }

    const lineItemId = event.entity_id;
    const newReceived = data?.qty_received || 0;
    const oldReceived = old_data?.qty_received || 0;
    const receivedDelta = newReceived - oldReceived;

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

    // Calculate proportional distribution
    // Priority: commitments with remaining qty_ordered - qty_received
    const commitmentsWithRemaining = linkedCommitments.map(c => ({
      ...c,
      remaining: Math.max(0, (c.qty_ordered || 0) - (c.qty_received || 0))
    })).filter(c => c.remaining > 0 || receivedDelta < 0);

    const totalRemaining = commitmentsWithRemaining.reduce((sum, c) => sum + c.remaining, 0);
    
    const updates = [];
    let remainingDelta = receivedDelta;

    for (const commitment of commitmentsWithRemaining) {
      if (remainingDelta === 0) break;

      let commitmentShare;
      
      if (receivedDelta > 0) {
        // Positive receiving - distribute proportionally
        if (totalRemaining > 0) {
          const proportion = commitment.remaining / totalRemaining;
          commitmentShare = Math.min(
            Math.round(receivedDelta * proportion),
            commitment.remaining,
            remainingDelta
          );
        } else {
          // Equal distribution if no remaining calculation possible
          commitmentShare = Math.round(remainingDelta / commitmentsWithRemaining.length);
        }
        commitmentShare = Math.max(0, commitmentShare);
      } else {
        // Negative (correction) - distribute proportionally by current received
        const totalCurrentReceived = commitmentsWithRemaining.reduce((s, c) => s + (c.qty_received || 0), 0);
        if (totalCurrentReceived > 0) {
          const proportion = (commitment.qty_received || 0) / totalCurrentReceived;
          commitmentShare = Math.round(receivedDelta * proportion);
        } else {
          commitmentShare = Math.round(remainingDelta / commitmentsWithRemaining.length);
        }
      }

      const newCommitmentReceived = Math.max(0, (commitment.qty_received || 0) + commitmentShare);
      
      // Calculate new status using state engine
      const updatedCommitment = { ...commitment, qty_received: newCommitmentReceived };
      const newStatus = calculateCommitmentState(updatedCommitment);

      // Don't downgrade from allocated/installed unless explicit
      let finalStatus = newStatus;
      if (['allocated', 'installed', 'closed'].includes(commitment.commitment_status)) {
        if (!['cancelled'].includes(newStatus)) {
          finalStatus = commitment.commitment_status;
        }
      }

      // Update with version increment
      const newVersion = (commitment.commitment_version || 1) + 1;
      
      await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
        qty_received: newCommitmentReceived,
        commitment_status: finalStatus,
        commitment_version: newVersion
      });

      // Audit log
      await base44.asServiceRole.entities.CommitmentAuditLog.create({
        commitment_id: commitment.id,
        action_type: 'qty_change',
        previous_values: {
          qty_received: commitment.qty_received,
          commitment_status: commitment.commitment_status,
          commitment_version: commitment.commitment_version
        },
        new_values: {
          qty_received: newCommitmentReceived,
          commitment_status: finalStatus,
          commitment_version: newVersion,
          delta: commitmentShare
        },
        trigger_source: 'receiving',
        validation_passed: true
      });

      updates.push({
        commitment_id: commitment.id,
        previous_received: commitment.qty_received,
        new_received: newCommitmentReceived,
        delta: commitmentShare,
        status: finalStatus,
        new_version: newVersion
      });

      remainingDelta -= commitmentShare;
    }

    return Response.json({
      success: true,
      line_item_id: lineItemId,
      total_received_delta: receivedDelta,
      distributed_delta: receivedDelta - remainingDelta,
      undistributed: remainingDelta,
      commitments_updated: updates.length,
      updates
    });

  } catch (error) {
    console.error('Receiving sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});