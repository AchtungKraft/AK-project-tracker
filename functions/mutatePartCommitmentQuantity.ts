import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9.7b — Commitment Quantity & Reallocation Mutation Engine
 * 
 * Handles controlled mutations to commitment quantities with:
 * - Reservation-first logic (reserves from available inventory)
 * - Automatic queue to order for uncovered delta
 * - Lifecycle state recomputation
 * - Full audit trail via LifecycleEvents
 */

const ACTION_TYPES = {
  INCREASE_QTY: 'INCREASE_QTY',
  DECREASE_QTY: 'DECREASE_QTY',
  REALLOCATE_TO_PROJECT: 'REALLOCATE_TO_PROJECT',
  CANCEL_UNORDERED_QTY: 'CANCEL_UNORDERED_QTY',
  SPLIT_COMMITMENT: 'SPLIT_COMMITMENT',
  MERGE_COMMITMENTS: 'MERGE_COMMITMENTS'
};

// ============================================
// INVENTORY AVAILABILITY HELPERS
// ============================================

/**
 * Calculate available inventory for a part across all locations
 * Available = qty_on_hand - sum(active_reservations)
 */
async function getInventoryAvailability(base44, partId) {
  // Get all inventory items for this part
  const inventoryItems = await base44.asServiceRole.entities.InventoryItem.filter({ part_id: partId });
  
  // Get all active reservations for this part
  const reservations = await base44.asServiceRole.entities.InventoryReservation.filter({ 
    part_id: partId, 
    status: 'active' 
  });
  
  // Build map of reserved qty per inventory item
  const reservedByItem = {};
  for (const res of reservations) {
    reservedByItem[res.inventory_item_id] = (reservedByItem[res.inventory_item_id] || 0) + (res.qty_reserved || 0);
  }
  
  // Calculate availability per item
  const availabilityByItem = [];
  let totalAvailable = 0;
  
  for (const item of inventoryItems) {
    const reserved = reservedByItem[item.id] || 0;
    const available = Math.max(0, (item.quantity_on_hand || 0) - reserved);
    
    if (available > 0) {
      availabilityByItem.push({
        inventory_item_id: item.id,
        location_id: item.location_id,
        qty_on_hand: item.quantity_on_hand || 0,
        qty_reserved: reserved,
        qty_available: available,
        sort_order: item.sort_order || 0,
        created_at: item.created_date
      });
      totalAvailable += available;
    }
  }
  
  // Sort by location sort_order, then FIFO
  availabilityByItem.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  
  return {
    total_available: totalAvailable,
    items: availabilityByItem
  };
}

/**
 * Create reservations from available inventory
 * Returns array of created reservations and total reserved
 */
async function createReservations(base44, partId, projectId, commitmentId, qtyToReserve, availabilityItems) {
  const reservationsCreated = [];
  let remainingToReserve = qtyToReserve;
  
  for (const item of availabilityItems) {
    if (remainingToReserve <= 0) break;
    
    const reserveFromThis = Math.min(remainingToReserve, item.qty_available);
    if (reserveFromThis <= 0) continue;
    
    // Create reservation record
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
      inventory_item_id: item.inventory_item_id,
      qty_reserved: reserveFromThis
    });
    
    remainingToReserve -= reserveFromThis;
  }
  
  const totalReserved = qtyToReserve - remainingToReserve;
  return { reservationsCreated, totalReserved };
}

/**
 * Release reservations for a commitment
 */
async function releaseReservations(base44, commitmentId, qtyToRelease, userId, reason) {
  const reservations = await base44.asServiceRole.entities.InventoryReservation.filter({
    commitment_id: commitmentId,
    status: 'active'
  });
  
  let remainingToRelease = qtyToRelease;
  const released = [];
  
  // Release in reverse order (LIFO for fairness)
  reservations.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  
  for (const res of reservations) {
    if (remainingToRelease <= 0) break;
    
    const releaseFromThis = Math.min(remainingToRelease, res.qty_reserved || 0);
    if (releaseFromThis <= 0) continue;
    
    if (releaseFromThis >= res.qty_reserved) {
      // Release entire reservation
      await base44.asServiceRole.entities.InventoryReservation.update(res.id, {
        status: 'released',
        released_at: new Date().toISOString(),
        released_by: userId,
        release_reason: reason
      });
    } else {
      // Partial release - reduce qty
      await base44.asServiceRole.entities.InventoryReservation.update(res.id, {
        qty_reserved: res.qty_reserved - releaseFromThis
      });
    }
    
    released.push({
      reservation_id: res.id,
      inventory_item_id: res.inventory_item_id,
      qty_released: releaseFromThis
    });
    
    remainingToRelease -= releaseFromThis;
  }
  
  return { released, totalReleased: qtyToRelease - remainingToRelease };
}

// ============================================
// LIFECYCLE STATE HELPERS
// ============================================

function computeCoverageStatus(commitment) {
  const needed = commitment.qty_committed || 0;
  const reserved = commitment.qty_reserved || 0;
  const received = commitment.qty_received || 0;
  const covered = reserved + received;
  
  if (needed <= 0) return 'FULLY_COVERED';
  if (covered >= needed) return 'FULLY_COVERED';
  if (covered > 0) return 'PARTIALLY_COVERED';
  return 'NOT_COVERED';
}

function computeLifecycleState(commitment, part) {
  const {
    qty_committed = 0,
    qty_reserved = 0,
    qty_to_order = 0,
    qty_ordered = 0,
    qty_received = 0,
    qty_installed = 0,
    billing_status,
    commitment_status
  } = commitment;

  // Coverage
  const coverageStatus = computeCoverageStatus(commitment);
  
  // Procurement status
  let procurementStatus = 'NOT_REQUIRED';
  if (qty_to_order > 0) {
    procurementStatus = 'NEEDS_ORDER';
  } else if (qty_ordered > qty_received) {
    procurementStatus = qty_received > 0 ? 'PARTIALLY_RECEIVED' : 'ORDERED';
  } else if (qty_ordered > 0 && qty_received >= qty_ordered) {
    procurementStatus = 'RECEIVED';
  }
  
  // Ordering safety based on billing
  let orderingSafety = 'RED';
  if (billing_status === 'paid') {
    orderingSafety = 'GREEN';
  } else if (billing_status === 'invoiced') {
    orderingSafety = 'YELLOW';
  } else if (billing_status === 'not_billable') {
    orderingSafety = 'GREEN';
  }
  
  // Recommended action
  let recommendedAction = null;
  let nextStepLabel = null;
  
  if (qty_to_order > 0) {
    if (orderingSafety === 'GREEN') {
      recommendedAction = 'CREATE_PO';
      nextStepLabel = 'Create PO';
    } else if (orderingSafety === 'YELLOW') {
      recommendedAction = 'AWAIT_PAYMENT';
      nextStepLabel = 'Awaiting Payment';
    } else {
      recommendedAction = 'INVOICE_CLIENT';
      nextStepLabel = 'Invoice Client';
    }
  } else if (qty_ordered > qty_received) {
    recommendedAction = 'RECEIVE';
    nextStepLabel = 'Receive';
  } else if (qty_reserved + qty_received > qty_installed) {
    recommendedAction = 'INSTALL';
    nextStepLabel = 'Ready to Install';
  } else if (qty_installed >= qty_committed) {
    recommendedAction = 'COMPLETE';
    nextStepLabel = 'Complete';
  }
  
  return {
    coverage_status: coverageStatus,
    procurement_status: procurementStatus,
    ordering_safety: orderingSafety,
    recommended_action: recommendedAction,
    next_step_label: nextStepLabel,
    qty_available_to_install: Math.max(0, (qty_reserved + qty_received) - qty_installed)
  };
}

// ============================================
// LIFECYCLE EVENT CREATION
// ============================================

async function createLifecycleEvent(base44, commitment, eventType, oldValues, newValues, userId, reason) {
  try {
    await base44.asServiceRole.entities.LifecycleEvent.create({
      commitment_id: commitment.id,
      project_id: commitment.project_id,
      part_id: commitment.part_id,
      event_type: eventType,
      old_values: JSON.stringify(oldValues),
      new_values: JSON.stringify(newValues),
      triggered_by: userId,
      trigger_source: 'QTY_MUTATION',
      reason: reason || '',
      event_date: new Date().toISOString()
    });
  } catch (e) {
    console.error('Failed to create lifecycle event:', e);
  }
}

// ============================================
// ACTION IMPLEMENTATIONS
// ============================================

/**
 * INCREASE_QTY - Reservation-first logic
 */
async function executeIncreaseQty(base44, commitment, part, delta, reason, userId, dryRun = false) {
  const currentQty = commitment.qty_committed || 0;
  const targetQty = currentQty + delta;
  
  // Get inventory availability
  const availability = await getInventoryAvailability(base44, commitment.part_id);
  
  // Calculate reservation and order queue quantities
  const reserveQty = Math.min(delta, availability.total_available);
  const toOrderQty = delta - reserveQty;
  
  if (dryRun) {
    return {
      dry_run: true,
      success: true,
      commitment_id: commitment.id,
      current_qty: currentQty,
      target_qty: targetQty,
      delta,
      reserve_qty: reserveQty,
      to_order_qty: toOrderQty,
      inventory_available: availability.total_available,
      inventory_items: availability.items.map(i => ({
        inventory_item_id: i.inventory_item_id,
        qty_available: i.qty_available
      }))
    };
  }
  
  // Re-validate availability immediately before writing (concurrency protection)
  const freshAvailability = await getInventoryAvailability(base44, commitment.part_id);
  const actualReserveQty = Math.min(delta, freshAvailability.total_available);
  const actualToOrderQty = delta - actualReserveQty;
  
  // Create reservations
  let reservationsCreated = [];
  if (actualReserveQty > 0) {
    const result = await createReservations(
      base44, 
      commitment.part_id, 
      commitment.project_id, 
      commitment.id,
      actualReserveQty,
      freshAvailability.items
    );
    reservationsCreated = result.reservationsCreated;
  }
  
  // Calculate new totals
  const newQtyCommitted = targetQty;
  const newQtyReserved = (commitment.qty_reserved || 0) + actualReserveQty;
  const newQtyToOrder = (commitment.qty_to_order || 0) + actualToOrderQty;
  
  const unitCost = commitment.unit_cost_snapshot || part?.cost || 0;
  const unitRetail = commitment.unit_retail_snapshot || part?.retail_override || part?.retail_matrix_price || 0;
  
  // Update commitment
  const updates = {
    qty_committed: newQtyCommitted,
    qty_reserved: newQtyReserved,
    qty_to_order: newQtyToOrder,
    planned_cost_total: newQtyCommitted * unitCost,
    planned_retail_total: newQtyCommitted * unitRetail,
    coverage_status: computeCoverageStatus({ ...commitment, qty_committed: newQtyCommitted, qty_reserved: newQtyReserved })
  };
  
  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);
  
  // Create lifecycle events
  await createLifecycleEvent(
    base44,
    commitment,
    'QTY_INCREASED',
    { qty_committed: currentQty, qty_reserved: commitment.qty_reserved || 0, qty_to_order: commitment.qty_to_order || 0 },
    { qty_committed: newQtyCommitted, qty_reserved: newQtyReserved, qty_to_order: newQtyToOrder, delta, reserved_qty_added: actualReserveQty, to_order_qty_added: actualToOrderQty },
    userId,
    reason
  );
  
  if (actualReserveQty > 0) {
    await createLifecycleEvent(
      base44,
      commitment,
      'STOCK_RESERVED',
      { qty_reserved: commitment.qty_reserved || 0 },
      { qty_reserved: newQtyReserved, reserved_qty_added: actualReserveQty, inventory_item_ids: reservationsCreated.map(r => r.inventory_item_id) },
      userId,
      reason
    );
  }
  
  if (actualToOrderQty > 0) {
    await createLifecycleEvent(
      base44,
      commitment,
      'ADDED_TO_ORDER_QUEUE',
      { qty_to_order: commitment.qty_to_order || 0 },
      { qty_to_order: newQtyToOrder, to_order_qty_added: actualToOrderQty },
      userId,
      reason
    );
  }
  
  // Compute lifecycle state
  const updatedCommitment = { ...commitment, ...updates };
  const lifecycleState = computeLifecycleState(updatedCommitment, part);
  
  return {
    success: true,
    commitment_id: commitment.id,
    qty_needed_new: newQtyCommitted,
    reserved_qty_added: actualReserveQty,
    to_order_qty_added: actualToOrderQty,
    reservations_created: reservationsCreated,
    lifecycle_state: lifecycleState,
    warnings: actualReserveQty < delta ? [`Only ${actualReserveQty} of ${delta} could be reserved from inventory`] : []
  };
}

/**
 * DECREASE_QTY - Release reservations first, then reduce to_order
 */
async function executeDecreaseQty(base44, commitment, part, delta, reason, userId, dryRun = false) {
  const currentQty = commitment.qty_committed || 0;
  const targetQty = currentQty - delta;
  
  // Validate constraints
  if (targetQty < (commitment.qty_installed || 0)) {
    return { success: false, error: `Cannot reduce below installed qty (${commitment.qty_installed})` };
  }
  if (targetQty < (commitment.qty_ordered || 0)) {
    return { 
      success: false, 
      error: `Cannot reduce below ordered qty (${commitment.qty_ordered}). Adjust PO first.`,
      flag: 'PO_ADJUSTMENT_REQUIRED'
    };
  }
  
  // Calculate what to release
  const currentReserved = commitment.qty_reserved || 0;
  const currentToOrder = commitment.qty_to_order || 0;
  
  // First reduce from to_order queue, then from reserved
  let reduceFromToOrder = Math.min(delta, currentToOrder);
  let reduceFromReserved = delta - reduceFromToOrder;
  
  if (dryRun) {
    return {
      dry_run: true,
      success: true,
      commitment_id: commitment.id,
      current_qty: currentQty,
      target_qty: targetQty,
      delta,
      reduce_from_to_order: reduceFromToOrder,
      reduce_from_reserved: reduceFromReserved
    };
  }
  
  // Release reservations if needed
  let releasedReservations = [];
  if (reduceFromReserved > 0) {
    const result = await releaseReservations(base44, commitment.id, reduceFromReserved, userId, reason);
    releasedReservations = result.released;
    reduceFromReserved = result.totalReleased;
  }
  
  const newQtyCommitted = targetQty;
  const newQtyReserved = Math.max(0, currentReserved - reduceFromReserved);
  const newQtyToOrder = Math.max(0, currentToOrder - reduceFromToOrder);
  
  const unitCost = commitment.unit_cost_snapshot || part?.cost || 0;
  const unitRetail = commitment.unit_retail_snapshot || part?.retail_override || part?.retail_matrix_price || 0;
  
  // Update commitment
  const updates = {
    qty_committed: newQtyCommitted,
    qty_reserved: newQtyReserved,
    qty_to_order: newQtyToOrder,
    planned_cost_total: newQtyCommitted * unitCost,
    planned_retail_total: newQtyCommitted * unitRetail,
    coverage_status: computeCoverageStatus({ ...commitment, qty_committed: newQtyCommitted, qty_reserved: newQtyReserved })
  };
  
  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);
  
  // Create lifecycle event
  await createLifecycleEvent(
    base44,
    commitment,
    'QTY_DECREASED',
    { qty_committed: currentQty, qty_reserved: currentReserved, qty_to_order: currentToOrder },
    { qty_committed: newQtyCommitted, qty_reserved: newQtyReserved, qty_to_order: newQtyToOrder, delta: -delta },
    userId,
    reason
  );
  
  const updatedCommitment = { ...commitment, ...updates };
  const lifecycleState = computeLifecycleState(updatedCommitment, part);
  
  return {
    success: true,
    commitment_id: commitment.id,
    qty_needed_new: newQtyCommitted,
    reservations_released: releasedReservations,
    lifecycle_state: lifecycleState,
    warnings: []
  };
}

/**
 * REALLOCATE_TO_PROJECT
 */
async function executeReallocateToProject(base44, commitment, part, qtyToMove, targetProjectId, reason, userId, dryRun = false) {
  const targetProjects = await base44.asServiceRole.entities.Project.filter({ id: targetProjectId });
  if (targetProjects.length === 0) {
    return { success: false, error: 'Target project not found' };
  }

  const maxMovable = (commitment.qty_committed || 0) - (commitment.qty_installed || 0);
  if (qtyToMove > maxMovable) {
    return { success: false, error: `Cannot move more than uninstalled qty (${maxMovable})` };
  }

  if (dryRun) {
    return {
      dry_run: true,
      success: true,
      commitment_id: commitment.id,
      qty_to_move: qtyToMove,
      target_project_id: targetProjectId,
      target_project_name: targetProjects[0].name,
      remaining_qty: (commitment.qty_committed || 0) - qtyToMove
    };
  }

  const remainingQty = (commitment.qty_committed || 0) - qtyToMove;
  
  // Calculate how much of the moved qty comes from reserved vs to_order
  const currentReserved = commitment.qty_reserved || 0;
  const currentToOrder = commitment.qty_to_order || 0;
  
  // Proportionally split the move between reserved and to_order
  const totalCoverage = currentReserved + currentToOrder;
  let moveFromReserved = 0;
  let moveFromToOrder = 0;
  
  if (totalCoverage > 0) {
    moveFromReserved = Math.min(currentReserved, Math.round(qtyToMove * (currentReserved / totalCoverage)));
    moveFromToOrder = qtyToMove - moveFromReserved;
  } else {
    moveFromToOrder = qtyToMove;
  }

  // Create new commitment on target project
  const unitCost = commitment.unit_cost_snapshot || 0;
  const unitRetail = commitment.unit_retail_snapshot || 0;

  const newCommitmentData = {
    project_id: targetProjectId,
    part_id: commitment.part_id,
    qty_committed: qtyToMove,
    qty_reserved: 0, // Will need to re-reserve on target project
    qty_to_order: qtyToMove, // All goes to order queue initially
    qty_ordered: 0,
    qty_received: 0,
    qty_installed: 0,
    qty_cancelled: 0,
    commitment_status: 'planned',
    source_type: 'split_commitment',
    parent_commitment_id: commitment.id,
    unit_cost_snapshot: unitCost,
    unit_retail_snapshot: unitRetail,
    planned_cost_total: qtyToMove * unitCost,
    planned_retail_total: qtyToMove * unitRetail,
    coverage_status: 'NOT_COVERED',
    notes: `Reallocated from project. Original commitment: ${commitment.id}. Reason: ${reason || 'N/A'}`
  };

  const newCommitment = await base44.asServiceRole.entities.PartCommitment.create(newCommitmentData);

  // Release reservations from original if needed
  if (moveFromReserved > 0) {
    await releaseReservations(base44, commitment.id, moveFromReserved, userId, `Reallocated to project ${targetProjectId}`);
  }

  // Update original commitment
  const updates = {
    qty_committed: remainingQty,
    qty_reserved: Math.max(0, currentReserved - moveFromReserved),
    qty_to_order: Math.max(0, currentToOrder - moveFromToOrder),
    planned_cost_total: remainingQty * unitCost,
    planned_retail_total: remainingQty * unitRetail,
    coverage_status: computeCoverageStatus({ ...commitment, qty_committed: remainingQty, qty_reserved: Math.max(0, currentReserved - moveFromReserved) })
  };

  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);

  await createLifecycleEvent(
    base44,
    commitment,
    'REALLOCATED',
    { qty_committed: commitment.qty_committed, project_id: commitment.project_id },
    { qty_committed: remainingQty, moved_qty: qtyToMove, target_project_id: targetProjectId, new_commitment_id: newCommitment.id },
    userId,
    reason
  );

  const updatedCommitment = { ...commitment, ...updates };
  const lifecycleState = computeLifecycleState(updatedCommitment, part);

  return {
    success: true,
    message: `Moved ${qtyToMove} units to project ${targetProjects[0].name}`,
    commitment_id: commitment.id,
    new_commitment_id: newCommitment.id,
    qty_needed_new: remainingQty,
    lifecycle_state: lifecycleState,
    warnings: []
  };
}

/**
 * CANCEL_UNORDERED_QTY
 */
async function executeCancelUnorderedQty(base44, commitment, part, qtyToCancel, reason, userId, dryRun = false) {
  const currentToOrder = commitment.qty_to_order || 0;
  const unorderedQty = (commitment.qty_committed || 0) - (commitment.qty_ordered || 0);
  
  if (qtyToCancel > unorderedQty) {
    return { 
      success: false, 
      error: `Can only cancel unordered qty (${unorderedQty}). ${qtyToCancel - unorderedQty} units already on order.` 
    };
  }

  if (dryRun) {
    return {
      dry_run: true,
      success: true,
      commitment_id: commitment.id,
      qty_to_cancel: qtyToCancel,
      unordered_qty: unorderedQty
    };
  }

  const newQty = (commitment.qty_committed || 0) - qtyToCancel;
  const newCancelled = (commitment.qty_cancelled || 0) + qtyToCancel;
  
  // Reduce from to_order first, then from reserved
  let reduceFromToOrder = Math.min(qtyToCancel, currentToOrder);
  let reduceFromReserved = qtyToCancel - reduceFromToOrder;

  // Release reservations if needed
  if (reduceFromReserved > 0) {
    await releaseReservations(base44, commitment.id, reduceFromReserved, userId, `Cancelled: ${reason}`);
  }

  const unitCost = commitment.unit_cost_snapshot || 0;
  const unitRetail = commitment.unit_retail_snapshot || 0;

  const updates = {
    qty_committed: newQty,
    qty_cancelled: newCancelled,
    qty_reserved: Math.max(0, (commitment.qty_reserved || 0) - reduceFromReserved),
    qty_to_order: Math.max(0, currentToOrder - reduceFromToOrder),
    planned_cost_total: newQty * unitCost,
    planned_retail_total: newQty * unitRetail,
    coverage_status: computeCoverageStatus({ ...commitment, qty_committed: newQty, qty_reserved: Math.max(0, (commitment.qty_reserved || 0) - reduceFromReserved) })
  };

  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);

  await createLifecycleEvent(
    base44,
    commitment,
    'QTY_CANCELLED',
    { qty_committed: commitment.qty_committed, qty_cancelled: commitment.qty_cancelled || 0 },
    { qty_committed: newQty, qty_cancelled: newCancelled },
    userId,
    reason
  );

  const updatedCommitment = { ...commitment, ...updates };
  const lifecycleState = computeLifecycleState(updatedCommitment, part);

  return {
    success: true,
    commitment_id: commitment.id,
    qty_needed_new: newQty,
    cancelled_qty: newCancelled,
    lifecycle_state: lifecycleState,
    warnings: []
  };
}

/**
 * SPLIT_COMMITMENT
 */
async function executeSplitCommitment(base44, commitment, part, qtyToSplit, reason, userId, dryRun = false) {
  if (qtyToSplit >= (commitment.qty_committed || 0)) {
    return { success: false, error: 'Split qty must be less than total committed qty' };
  }

  if (dryRun) {
    return {
      dry_run: true,
      success: true,
      commitment_id: commitment.id,
      qty_to_split: qtyToSplit,
      remaining_qty: (commitment.qty_committed || 0) - qtyToSplit
    };
  }

  const remainingQty = (commitment.qty_committed || 0) - qtyToSplit;
  const unitCost = commitment.unit_cost_snapshot || 0;
  const unitRetail = commitment.unit_retail_snapshot || 0;

  // Create new commitment
  const newCommitmentData = {
    project_id: commitment.project_id,
    part_id: commitment.part_id,
    qty_committed: qtyToSplit,
    qty_reserved: 0,
    qty_to_order: qtyToSplit,
    qty_ordered: 0,
    qty_received: 0,
    qty_installed: 0,
    qty_cancelled: 0,
    commitment_status: 'planned',
    source_type: 'split_commitment',
    parent_commitment_id: commitment.id,
    unit_cost_snapshot: unitCost,
    unit_retail_snapshot: unitRetail,
    planned_cost_total: qtyToSplit * unitCost,
    planned_retail_total: qtyToSplit * unitRetail,
    coverage_status: 'NOT_COVERED',
    notes: `Split from commitment ${commitment.id}. Reason: ${reason || 'N/A'}`
  };

  const newCommitment = await base44.asServiceRole.entities.PartCommitment.create(newCommitmentData);

  // Proportionally reduce reserved and to_order
  const currentReserved = commitment.qty_reserved || 0;
  const currentToOrder = commitment.qty_to_order || 0;
  const totalCoverage = currentReserved + currentToOrder;
  
  let splitFromReserved = 0;
  let splitFromToOrder = 0;
  
  if (totalCoverage > 0) {
    splitFromReserved = Math.min(currentReserved, Math.round(qtyToSplit * (currentReserved / totalCoverage)));
    splitFromToOrder = qtyToSplit - splitFromReserved;
  } else {
    splitFromToOrder = qtyToSplit;
  }

  // Release reservations if needed
  if (splitFromReserved > 0) {
    await releaseReservations(base44, commitment.id, splitFromReserved, userId, `Split commitment: ${reason}`);
  }

  // Update original
  const updates = {
    qty_committed: remainingQty,
    qty_reserved: Math.max(0, currentReserved - splitFromReserved),
    qty_to_order: Math.max(0, currentToOrder - splitFromToOrder),
    planned_cost_total: remainingQty * unitCost,
    planned_retail_total: remainingQty * unitRetail,
    coverage_status: computeCoverageStatus({ ...commitment, qty_committed: remainingQty, qty_reserved: Math.max(0, currentReserved - splitFromReserved) })
  };

  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);

  await createLifecycleEvent(
    base44,
    commitment,
    'COMMITMENT_SPLIT',
    { qty_committed: commitment.qty_committed },
    { qty_committed: remainingQty, split_qty: qtyToSplit, new_commitment_id: newCommitment.id },
    userId,
    reason
  );

  const updatedCommitment = { ...commitment, ...updates };
  const lifecycleState = computeLifecycleState(updatedCommitment, part);

  return {
    success: true,
    message: `Split ${qtyToSplit} units into new commitment`,
    commitment_id: commitment.id,
    new_commitment_id: newCommitment.id,
    qty_needed_new: remainingQty,
    lifecycle_state: lifecycleState,
    warnings: []
  };
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { 
      commitment_id, 
      action_type, 
      qty_delta = 0,
      new_qty_needed,
      target_project_id, 
      reason,
      dry_run = false 
    } = body;

    if (!commitment_id) {
      return Response.json({ error: 'commitment_id is required' }, { status: 400 });
    }

    if (!action_type || !Object.values(ACTION_TYPES).includes(action_type)) {
      return Response.json({ error: `Invalid action_type. Must be one of: ${Object.values(ACTION_TYPES).join(', ')}` }, { status: 400 });
    }

    // Fetch commitment
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    if (commitments.length === 0) {
      return Response.json({ error: 'Commitment not found' }, { status: 404 });
    }

    const commitment = commitments[0];

    // Fetch part
    const parts = await base44.asServiceRole.entities.Part.filter({ id: commitment.part_id });
    const part = parts[0] || null;

    // Check if commitment/part is archived or closed
    if (commitment.commitment_status === 'closed') {
      return Response.json({ error: 'Cannot mutate closed commitment' }, { status: 400 });
    }
    if (commitment.commitment_status === 'cancelled') {
      return Response.json({ error: 'Cannot mutate cancelled commitment' }, { status: 400 });
    }
    if (part?.is_archived) {
      return Response.json({ error: 'Cannot mutate commitment for archived part' }, { status: 400 });
    }

    // Normalize delta - support both qty_delta and new_qty_needed
    let delta = qty_delta;
    if (new_qty_needed !== undefined && action_type === ACTION_TYPES.INCREASE_QTY) {
      delta = new_qty_needed - (commitment.qty_committed || 0);
      if (delta <= 0) {
        return Response.json({ error: 'new_qty_needed must be greater than current qty for INCREASE_QTY' }, { status: 400 });
      }
    }

    // Execute action
    let result;
    switch (action_type) {
      case ACTION_TYPES.INCREASE_QTY:
        if (delta <= 0) {
          return Response.json({ error: 'qty_delta must be positive for INCREASE_QTY' }, { status: 400 });
        }
        result = await executeIncreaseQty(base44, commitment, part, delta, reason, user.email, dry_run);
        break;
        
      case ACTION_TYPES.DECREASE_QTY:
        if (delta <= 0) {
          return Response.json({ error: 'qty_delta must be positive for DECREASE_QTY' }, { status: 400 });
        }
        result = await executeDecreaseQty(base44, commitment, part, delta, reason, user.email, dry_run);
        break;
        
      case ACTION_TYPES.REALLOCATE_TO_PROJECT:
        if (!target_project_id) {
          return Response.json({ error: 'target_project_id required for REALLOCATE_TO_PROJECT' }, { status: 400 });
        }
        if (delta <= 0) {
          return Response.json({ error: 'qty_delta must be positive for REALLOCATE_TO_PROJECT' }, { status: 400 });
        }
        result = await executeReallocateToProject(base44, commitment, part, delta, target_project_id, reason, user.email, dry_run);
        break;
        
      case ACTION_TYPES.CANCEL_UNORDERED_QTY:
        if (delta <= 0) {
          return Response.json({ error: 'qty_delta must be positive for CANCEL_UNORDERED_QTY' }, { status: 400 });
        }
        result = await executeCancelUnorderedQty(base44, commitment, part, delta, reason, user.email, dry_run);
        break;
        
      case ACTION_TYPES.SPLIT_COMMITMENT:
        if (delta <= 0) {
          return Response.json({ error: 'qty_delta must be positive for SPLIT_COMMITMENT' }, { status: 400 });
        }
        result = await executeSplitCommitment(base44, commitment, part, delta, reason, user.email, dry_run);
        break;
        
      case ACTION_TYPES.MERGE_COMMITMENTS:
        return Response.json({ error: 'MERGE_COMMITMENTS not yet implemented' }, { status: 501 });
        
      default:
        return Response.json({ error: 'Unknown action type' }, { status: 400 });
    }

    return Response.json({
      ...result,
      action_type
    });

  } catch (error) {
    console.error('mutatePartCommitmentQuantity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});