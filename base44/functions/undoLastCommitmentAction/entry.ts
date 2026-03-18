import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9.7d — Safe Undo Engine for Commitment Actions
 * 
 * Undoes the most recent reversible action on a commitment.
 * 
 * Reversible events:
 * - QTY_INCREASED, QTY_DECREASED
 * - STOCK_RESERVED, STOCK_RESERVED_MANUAL
 * - STOCK_RELEASED, STOCK_RELEASED_MANUAL
 * - ADDED_TO_ORDER_QUEUE, ADDED_TO_ORDER_QUEUE_MANUAL
 * - REMOVED_FROM_ORDER_QUEUE
 * 
 * Non-reversible events (blocked):
 * - PART_RECEIVED
 * - PART_INSTALLED
 * - CLIENT_PAID
 * - PO_CREATED
 * - DRIFT_REPAIRED
 */

const REVERSIBLE_EVENTS = [
  'QTY_INCREASED',
  'QTY_DECREASED',
  'STOCK_RESERVED',
  'STOCK_RESERVED_MANUAL',
  'STOCK_RELEASED',
  'STOCK_RELEASED_MANUAL',
  'ADDED_TO_ORDER_QUEUE',
  'ADDED_TO_ORDER_QUEUE_MANUAL',
  'REMOVED_FROM_ORDER_QUEUE'
];

const NON_REVERSIBLE_EVENTS = [
  'PART_RECEIVED',
  'PART_INSTALLED',
  'CLIENT_PAID',
  'PO_CREATED',
  'DRIFT_REPAIRED',
  'COMMITMENT_CANCELLED',
  'ACTION_UNDONE'
];

// Map event type to inverse action
const INVERSE_ACTIONS = {
  'QTY_INCREASED': { action: 'DECREASE_QTY', qtyField: 'delta' },
  'QTY_DECREASED': { action: 'INCREASE_QTY', qtyField: 'delta' },
  'STOCK_RESERVED': { action: 'RELEASE_RESERVATION', qtyField: 'qty_reserved' },
  'STOCK_RESERVED_MANUAL': { action: 'RELEASE_RESERVATION', qtyField: 'qty_reserved' },
  'STOCK_RELEASED': { action: 'RESERVE_STOCK', qtyField: 'qty_released' },
  'STOCK_RELEASED_MANUAL': { action: 'RESERVE_STOCK', qtyField: 'qty_released' },
  'ADDED_TO_ORDER_QUEUE': { action: 'REMOVE_FROM_ORDER_QUEUE', qtyField: 'qty_added' },
  'ADDED_TO_ORDER_QUEUE_MANUAL': { action: 'REMOVE_FROM_ORDER_QUEUE', qtyField: 'qty_added' },
  'REMOVED_FROM_ORDER_QUEUE': { action: 'ADD_TO_ORDER_QUEUE', qtyField: 'qty_removed' }
};

function computeCoverageStatus(commitment) {
  const needed = commitment.qty_committed || 0;
  const reserved = commitment.qty_reserved || 0;
  const ordered = commitment.qty_ordered || 0;
  const received = commitment.qty_received || 0;
  
  const coverage = reserved + Math.max(ordered, received);
  
  if (needed === 0) return coverage > 0 ? 'OVER' : 'FULLY_COVERED';
  if (coverage === 0) return 'NOT_COVERED';
  if (coverage < needed) return 'PARTIALLY_COVERED';
  if (coverage === needed) return 'FULLY_COVERED';
  return 'OVER';
}

async function releaseReservationsFIFO(base44, commitmentId, qtyToRelease, userId, reason) {
  const reservations = await base44.asServiceRole.entities.InventoryReservation.filter({
    commitment_id: commitmentId,
    status: 'active'
  });
  
  reservations.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  
  let remainingToRelease = qtyToRelease;
  const released = [];
  
  for (const res of reservations) {
    if (remainingToRelease <= 0) break;
    
    const releaseFromThis = Math.min(remainingToRelease, res.qty_reserved || 0);
    if (releaseFromThis <= 0) continue;
    
    if (releaseFromThis >= res.qty_reserved) {
      await base44.asServiceRole.entities.InventoryReservation.update(res.id, {
        status: 'released',
        released_at: new Date().toISOString(),
        released_by: userId,
        release_reason: reason
      });
    } else {
      await base44.asServiceRole.entities.InventoryReservation.update(res.id, {
        qty_reserved: res.qty_reserved - releaseFromThis
      });
    }
    
    released.push({ reservation_id: res.id, qty_released: releaseFromThis });
    remainingToRelease -= releaseFromThis;
  }
  
  return { released, totalReleased: qtyToRelease - remainingToRelease };
}

async function getInventoryAvailability(base44, partId) {
  const inventoryItems = await base44.asServiceRole.entities.InventoryItem.filter({ part_id: partId });
  const reservations = await base44.asServiceRole.entities.InventoryReservation.filter({ 
    part_id: partId, 
    status: 'active' 
  });
  
  const reservedByItem = {};
  for (const res of reservations) {
    reservedByItem[res.inventory_item_id] = (reservedByItem[res.inventory_item_id] || 0) + (res.qty_reserved || 0);
  }
  
  const availabilityByItem = [];
  let totalAvailable = 0;
  
  for (const item of inventoryItems) {
    const reserved = reservedByItem[item.id] || 0;
    const available = Math.max(0, (item.quantity_on_hand || 0) - reserved);
    
    if (available > 0) {
      availabilityByItem.push({
        inventory_item_id: item.id,
        qty_available: available
      });
      totalAvailable += available;
    }
  }
  
  return { total_available: totalAvailable, items: availabilityByItem };
}

async function createReservations(base44, partId, projectId, commitmentId, qtyToReserve, availabilityItems) {
  const reservationsCreated = [];
  let remainingToReserve = qtyToReserve;
  
  for (const item of availabilityItems) {
    if (remainingToReserve <= 0) break;
    
    const reserveFromThis = Math.min(remainingToReserve, item.qty_available);
    if (reserveFromThis <= 0) continue;
    
    const reservation = await base44.asServiceRole.entities.InventoryReservation.create({
      inventory_item_id: item.inventory_item_id,
      part_id: partId,
      project_id: projectId,
      commitment_id: commitmentId,
      qty_reserved: reserveFromThis,
      status: 'active'
    });
    
    reservationsCreated.push({
      reservation_id: reservation.id,
      qty_reserved: reserveFromThis
    });
    
    remainingToReserve -= reserveFromThis;
  }
  
  return { reservationsCreated, totalReserved: qtyToReserve - remainingToReserve };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const { commitment_id } = await req.json();
    
    if (!commitment_id) {
      return Response.json({ ok: false, error: 'Missing commitment_id' }, { status: 400 });
    }
    
    // Fetch commitment
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    if (!commitments || commitments.length === 0) {
      return Response.json({ ok: false, error: 'Commitment not found' }, { status: 404 });
    }
    const commitment = commitments[0];
    
    // Check for blocking status
    if (commitment.commitment_status === 'cancelled') {
      return Response.json({ ok: false, error: 'Cannot undo on cancelled commitment' }, { status: 400 });
    }
    
    if (commitment.billing_status === 'paid') {
      return Response.json({ ok: false, error: 'Cannot undo: commitment is financially locked (paid)' }, { status: 400 });
    }
    
    // Fetch most recent lifecycle events for this commitment
    const events = await base44.asServiceRole.entities.LifecycleEvent.filter({ commitment_id });
    
    if (!events || events.length === 0) {
      return Response.json({ ok: false, error: 'No events found for this commitment' }, { status: 400 });
    }
    
    // Sort by event_date descending (most recent first)
    events.sort((a, b) => new Date(b.event_date || b.created_date) - new Date(a.event_date || a.created_date));
    
    // Find most recent reversible event that hasn't been undone
    const targetEvent = events.find(e => 
      REVERSIBLE_EVENTS.includes(e.event_type) && 
      !e.undone_at && 
      e.is_reversible !== false
    );
    
    if (!targetEvent) {
      // Check if there's a non-reversible event blocking
      const blockingEvent = events.find(e => NON_REVERSIBLE_EVENTS.includes(e.event_type));
      if (blockingEvent) {
        const reason = blockingEvent.event_type === 'PART_INSTALLED' 
          ? 'Cannot undo installed quantity'
          : blockingEvent.event_type === 'CLIENT_PAID'
          ? 'Financially locked'
          : blockingEvent.event_type === 'PART_RECEIVED'
          ? 'Cannot undo received quantity'
          : `Blocked by ${blockingEvent.event_type}`;
        
        return Response.json({ 
          ok: false, 
          error: reason,
          blocking_event_type: blockingEvent.event_type
        }, { status: 400 });
      }
      
      return Response.json({ ok: false, error: 'No reversible actions found' }, { status: 400 });
    }
    
    // Parse old/new values from the event
    let oldValues = {};
    let newValues = {};
    
    try {
      oldValues = JSON.parse(targetEvent.old_values || '{}');
      newValues = JSON.parse(targetEvent.new_values || '{}');
    } catch (e) {
      console.error('Failed to parse event values:', e);
    }
    
    const inverseConfig = INVERSE_ACTIONS[targetEvent.event_type];
    if (!inverseConfig) {
      return Response.json({ ok: false, error: `No inverse action defined for ${targetEvent.event_type}` }, { status: 400 });
    }
    
    // Determine qty to reverse
    let qtyToReverse = 1;
    
    // Try to extract qty from new_values
    if (newValues.delta) {
      qtyToReverse = Math.abs(newValues.delta);
    } else if (newValues.qty_reserved !== undefined && oldValues.qty_reserved !== undefined) {
      qtyToReverse = Math.abs(newValues.qty_reserved - oldValues.qty_reserved);
    } else if (newValues.qty_committed !== undefined && oldValues.qty_committed !== undefined) {
      qtyToReverse = Math.abs(newValues.qty_committed - oldValues.qty_committed);
    } else if (newValues.qty_to_order !== undefined && oldValues.qty_to_order !== undefined) {
      qtyToReverse = Math.abs(newValues.qty_to_order - oldValues.qty_to_order);
    }
    
    // Execute inverse action
    let undoResult = {};
    const inverseAction = inverseConfig.action;
    
    if (inverseAction === 'DECREASE_QTY' || inverseAction === 'INCREASE_QTY') {
      // Handle qty mutations by restoring old state
      const updates = {
        qty_committed: oldValues.qty_committed ?? commitment.qty_committed,
        qty_reserved: oldValues.qty_reserved ?? commitment.qty_reserved,
        qty_to_order: oldValues.qty_to_order ?? commitment.qty_to_order
      };
      
      const unitCost = commitment.unit_cost_snapshot || 0;
      const unitRetail = commitment.unit_retail_snapshot || 0;
      updates.planned_cost_total = updates.qty_committed * unitCost;
      updates.planned_retail_total = updates.qty_committed * unitRetail;
      updates.coverage_status = computeCoverageStatus({ ...commitment, ...updates });
      
      await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);
      undoResult = { restored_state: updates };
      
    } else if (inverseAction === 'RELEASE_RESERVATION') {
      // Release reservations
      const { released, totalReleased } = await releaseReservationsFIFO(
        base44, 
        commitment.id, 
        qtyToReverse, 
        user.email, 
        `Undo: ${targetEvent.event_type}`
      );
      
      const newQtyReserved = Math.max(0, (commitment.qty_reserved || 0) - totalReleased);
      const coverageAfter = newQtyReserved + Math.max(commitment.qty_ordered || 0, commitment.qty_received || 0);
      const newQtyToOrder = Math.max(0, (commitment.qty_committed || 0) - coverageAfter);
      
      await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
        qty_reserved: newQtyReserved,
        qty_to_order: newQtyToOrder,
        coverage_status: computeCoverageStatus({ ...commitment, qty_reserved: newQtyReserved })
      });
      
      undoResult = { released, qty_released: totalReleased };
      
    } else if (inverseAction === 'RESERVE_STOCK') {
      // Re-reserve stock
      const availability = await getInventoryAvailability(base44, commitment.part_id);
      
      if (availability.total_available < qtyToReverse) {
        return Response.json({ 
          ok: false, 
          error: `Cannot undo release: insufficient inventory. Available: ${availability.total_available}`,
          available_qty: availability.total_available
        }, { status: 400 });
      }
      
      const { reservationsCreated, totalReserved } = await createReservations(
        base44,
        commitment.part_id,
        commitment.project_id,
        commitment.id,
        qtyToReverse,
        availability.items
      );
      
      const newQtyReserved = (commitment.qty_reserved || 0) + totalReserved;
      const coverageAfter = newQtyReserved + Math.max(commitment.qty_ordered || 0, commitment.qty_received || 0);
      const newQtyToOrder = Math.max(0, (commitment.qty_committed || 0) - coverageAfter);
      
      await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
        qty_reserved: newQtyReserved,
        qty_to_order: newQtyToOrder,
        coverage_status: computeCoverageStatus({ ...commitment, qty_reserved: newQtyReserved })
      });
      
      undoResult = { reservations_created: reservationsCreated, qty_reserved: totalReserved };
      
    } else if (inverseAction === 'REMOVE_FROM_ORDER_QUEUE') {
      // Decrease qty_committed
      const newQtyCommitted = Math.max(0, (commitment.qty_committed || 0) - qtyToReverse);
      const coverageAfter = (commitment.qty_reserved || 0) + Math.max(commitment.qty_ordered || 0, commitment.qty_received || 0);
      const newQtyToOrder = Math.max(0, newQtyCommitted - coverageAfter);
      
      const unitCost = commitment.unit_cost_snapshot || 0;
      const unitRetail = commitment.unit_retail_snapshot || 0;
      
      await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
        qty_committed: newQtyCommitted,
        qty_to_order: newQtyToOrder,
        planned_cost_total: newQtyCommitted * unitCost,
        planned_retail_total: newQtyCommitted * unitRetail,
        coverage_status: computeCoverageStatus({ ...commitment, qty_committed: newQtyCommitted })
      });
      
      undoResult = { qty_committed: newQtyCommitted, qty_to_order: newQtyToOrder };
      
    } else if (inverseAction === 'ADD_TO_ORDER_QUEUE') {
      // Increase qty_committed
      const newQtyCommitted = (commitment.qty_committed || 0) + qtyToReverse;
      const coverageAfter = (commitment.qty_reserved || 0) + Math.max(commitment.qty_ordered || 0, commitment.qty_received || 0);
      const newQtyToOrder = Math.max(0, newQtyCommitted - coverageAfter);
      
      const unitCost = commitment.unit_cost_snapshot || 0;
      const unitRetail = commitment.unit_retail_snapshot || 0;
      
      await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
        qty_committed: newQtyCommitted,
        qty_to_order: newQtyToOrder,
        planned_cost_total: newQtyCommitted * unitCost,
        planned_retail_total: newQtyCommitted * unitRetail,
        coverage_status: computeCoverageStatus({ ...commitment, qty_committed: newQtyCommitted })
      });
      
      undoResult = { qty_committed: newQtyCommitted, qty_to_order: newQtyToOrder };
    }
    
    // Mark original event as undone
    await base44.asServiceRole.entities.LifecycleEvent.update(targetEvent.id, {
      undone_at: new Date().toISOString()
    });
    
    // Create ACTION_UNDONE event
    const undoEvent = await base44.asServiceRole.entities.LifecycleEvent.create({
      commitment_id: commitment.id,
      part_id: commitment.part_id,
      project_id: commitment.project_id,
      event_type: 'ACTION_UNDONE',
      old_values: JSON.stringify(newValues),
      new_values: JSON.stringify(oldValues),
      trigger_source: 'UNDO_ACTION',
      triggered_by: user.email,
      reason: `Undid ${targetEvent.event_type}`,
      event_date: new Date().toISOString(),
      reversal_reference_id: targetEvent.id,
      is_reversible: false
    });
    
    // Update original event with reference to undo event
    await base44.asServiceRole.entities.LifecycleEvent.update(targetEvent.id, {
      undone_by_event_id: undoEvent.id
    });
    
    // Fetch updated commitment
    const updatedCommitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    const updatedCommitment = updatedCommitments[0];
    
    return Response.json({
      ok: true,
      undone_event_id: targetEvent.id,
      undone_event_type: targetEvent.event_type,
      inverse_action: inverseAction,
      qty_reversed: qtyToReverse,
      undo_result: undoResult,
      commitment: {
        id: updatedCommitment.id,
        qty_committed: updatedCommitment.qty_committed,
        qty_reserved: updatedCommitment.qty_reserved,
        qty_to_order: updatedCommitment.qty_to_order,
        qty_ordered: updatedCommitment.qty_ordered,
        qty_received: updatedCommitment.qty_received,
        qty_installed: updatedCommitment.qty_installed,
        coverage_status: updatedCommitment.coverage_status
      }
    });
    
  } catch (error) {
    console.error('Undo action error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});