/**
 * applyReceivingToOrderAndCommitment.js
 * 
 * UNIFIED SUPPLY EXECUTION ENGINE - RECEIVING
 * 
 * This is the CANONICAL entry point for receiving inventory that is linked
 * to purchase orders and commitments.
 * 
 * Governance:
 * - Updates PartPurchaseLineItem.qty_received
 * - Updates PartCommitment.qty_received
 * - Creates InventoryItem via mutateInventory
 * - Enforces qty invariants
 * - Emits LifecycleEvents
 * - Returns structured results
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const {
      order_id = null,
      line_item_id = null,
      commitment_id = null,
      part_id,
      qty_received,
      location_id = null,
      unit_cost = null,
      lot_number = null,
      notes = null,
      requires_inspection = false,
      source_type = 'vendor_order'
    } = payload;

    if (!part_id) {
      return Response.json({ error: 'part_id is required' }, { status: 400 });
    }

    if (!qty_received || qty_received <= 0) {
      return Response.json({ error: 'qty_received must be positive' }, { status: 400 });
    }

    // Load part
    const parts = await base44.asServiceRole.entities.Part.filter({ id: part_id });
    if (parts.length === 0) {
      return Response.json({ error: 'Part not found' }, { status: 404 });
    }
    const part = parts[0];

    // Check part is not archived
    if (part.is_archived) {
      return Response.json({ error: 'Cannot receive inventory for archived parts' }, { status: 400 });
    }

    // Resolve commitment and line item
    let commitment = null;
    let lineItem = null;
    let resolvedOrderId = order_id;

    // If line_item_id provided, load it
    if (line_item_id) {
      const lineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ id: line_item_id });
      if (lineItems.length > 0) {
        lineItem = lineItems[0];
        resolvedOrderId = lineItem.order_id;
        
        // Get commitment from line item if not provided
        if (!commitment_id && lineItem.commitment_id) {
          const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: lineItem.commitment_id });
          if (commitments.length > 0) {
            commitment = commitments[0];
          }
        }
      }
    }

    // If commitment_id provided, load it
    if (commitment_id && !commitment) {
      const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
      if (commitments.length > 0) {
        commitment = commitments[0];
      }
    }

    // If we have commitment but no line item, try to find matching line item
    if (commitment && !lineItem) {
      const lineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ commitment_id: commitment.id });
      // Find line item with remaining qty to receive
      lineItem = lineItems.find(li => (li.qty_ordered || 0) > (li.qty_received || 0));
    }

    // Determine cost
    const receiveCost = unit_cost ?? lineItem?.unit_cost ?? part.cost ?? part.default_cost ?? 0;

    // Step 1: Create inventory via mutateInventory
    const inventoryResult = await base44.functions.invoke('mutateInventory', {
      mutation_type: 'receive',
      part_id: part_id,
      qty: qty_received,
      to_location_id: location_id,
      unit_cost: receiveCost,
      order_id: resolvedOrderId,
      line_item_id: lineItem?.id || null,
      lot_number: lot_number,
      notes: notes,
      source_type: source_type,
      requires_inspection: requires_inspection
    });

    if (inventoryResult.data?.error) {
      return Response.json({ error: `Inventory mutation failed: ${inventoryResult.data.error}` }, { status: 500 });
    }

    const results = {
      inventory_created: inventoryResult.data,
      line_item_updated: null,
      commitment_updated: null,
      lifecycle_event: null
    };

    // Step 2: Update line item if exists
    if (lineItem) {
      const newLineItemQtyReceived = (lineItem.qty_received || 0) + qty_received;
      const lineItemStatus = newLineItemQtyReceived >= (lineItem.qty_ordered || 0) ? 'Received' : 'Partial';

      await base44.asServiceRole.entities.PartPurchaseLineItem.update(lineItem.id, {
        qty_received: newLineItemQtyReceived,
        status: lineItemStatus
      });

      results.line_item_updated = {
        id: lineItem.id,
        qty_received: newLineItemQtyReceived,
        status: lineItemStatus
      };

      // Update order status if all line items received
      if (resolvedOrderId) {
        await updateOrderStatus(base44, resolvedOrderId);
      }
    }

    // Step 3: Update commitment if exists
    if (commitment) {
      const beforeState = {
        qty_received: commitment.qty_received || 0,
        qty_ordered: commitment.qty_ordered || 0,
        status: commitment.commitment_status
      };

      const newCommitmentQtyReceived = (commitment.qty_received || 0) + qty_received;
      
      // Determine new status
      let newStatus = commitment.commitment_status;
      const qtyOrdered = commitment.qty_ordered || 0;
      
      if (newCommitmentQtyReceived >= qtyOrdered && qtyOrdered > 0) {
        newStatus = 'received';
      } else if (newCommitmentQtyReceived > 0) {
        newStatus = 'partially_received';
      }

      // Update commitment
      await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
        qty_received: newCommitmentQtyReceived,
        commitment_status: newStatus
      });

      results.commitment_updated = {
        id: commitment.id,
        qty_received: newCommitmentQtyReceived,
        commitment_status: newStatus
      };

      // Step 4: Create LifecycleEvent
      const lifecycleEvent = await base44.asServiceRole.entities.LifecycleEvent.create({
        event_type: 'PART_RECEIVED',
        commitment_id: commitment.id,
        project_id: commitment.project_id,
        part_id: part_id,
        order_id: resolvedOrderId,
        line_item_id: lineItem?.id,
        qty_delta: qty_received,
        before_state: JSON.stringify(beforeState),
        after_state: JSON.stringify({
          qty_received: newCommitmentQtyReceived,
          qty_ordered: qtyOrdered,
          status: newStatus
        }),
        metadata: JSON.stringify({
          location_id: location_id,
          unit_cost: receiveCost,
          lot_number: lot_number,
          source_type: source_type
        }),
        actor_email: user.email,
        actor_id: user.id,
        is_reversible: true
      });

      results.lifecycle_event = {
        id: lifecycleEvent.id,
        event_type: 'PART_RECEIVED'
      };

      // Step 5: Validate invariants
      const freshCommitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment.id });
      if (freshCommitments.length > 0) {
        const invariantError = validateCommitmentQtyInvariant(freshCommitments[0]);
        if (invariantError) {
          results.invariant_warning = invariantError;
          console.warn('Invariant warning after receiving:', invariantError);
        }
      }
    }

    return Response.json({
      ok: true,
      qty_received: qty_received,
      part_id: part_id,
      ...results
    });

  } catch (error) {
    console.error('applyReceivingToOrderAndCommitment error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Update order status based on line item statuses
 */
async function updateOrderStatus(base44, orderId) {
  try {
    const lineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ order_id: orderId });
    
    if (lineItems.length === 0) return;

    const allReceived = lineItems.every(li => (li.qty_received || 0) >= (li.qty_ordered || 0));
    const someReceived = lineItems.some(li => (li.qty_received || 0) > 0);

    let newStatus;
    if (allReceived) {
      newStatus = 'Received';
    } else if (someReceived) {
      newStatus = 'Partial';
    } else {
      return; // No change needed
    }

    const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
    if (orders.length > 0 && orders[0].status !== newStatus) {
      await base44.asServiceRole.entities.Order.update(orderId, {
        status: newStatus,
        received_date: allReceived ? new Date().toISOString().split('T')[0] : null
      });
    }
  } catch (error) {
    console.warn('Failed to update order status:', error);
  }
}

/**
 * Validate commitment quantity invariant
 */
function validateCommitmentQtyInvariant(commitment) {
  const {
    qty_committed = 0,
    qty_reserved = 0,
    qty_to_order = 0,
    qty_ordered = 0,
    qty_received = 0,
    qty_installed = 0
  } = commitment;

  // Check ordering invariant
  if (qty_ordered < qty_received) {
    return `qty_ordered (${qty_ordered}) < qty_received (${qty_received})`;
  }

  // Check receiving invariant
  if (qty_received < qty_installed) {
    return `qty_received (${qty_received}) < qty_installed (${qty_installed})`;
  }

  return null;
}