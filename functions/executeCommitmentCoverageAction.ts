import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9.7d — Explicit Coverage Action Engine
 * 
 * Handles explicit coverage mutations:
 * - RESERVE_STOCK: Reserve from available inventory
 * - RELEASE_RESERVATION: Release previously reserved stock
 * - ADD_TO_ORDER_QUEUE: Increase qty_committed (invariant recomputes qty_to_order)
 * - REMOVE_FROM_ORDER_QUEUE: Decrease qty_committed (if safe)
 */

const ACTION_TYPES = {
  RESERVE_STOCK: 'RESERVE_STOCK',
  RELEASE_RESERVATION: 'RELEASE_RESERVATION',
  ADD_TO_ORDER_QUEUE: 'ADD_TO_ORDER_QUEUE',
  REMOVE_FROM_ORDER_QUEUE: 'REMOVE_FROM_ORDER_QUEUE'
};

// Non-reversible event types
const NON_REVERSIBLE_EVENTS = [
  'PART_RECEIVED',
  'PART_INSTALLED',
  'CLIENT_PAID',
  'PO_CREATED',
  'DRIFT_REPAIRED'
];

// ============================================
// INVENTORY HELPERS
// ============================================

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
  
  availabilityByItem.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  
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
      inventory_item_id: item.inventory_item_id,
      qty_reserved: reserveFromThis
    });
    
    remainingToReserve -= reserveFromThis;
  }
  
  return { reservationsCreated, totalReserved: qtyToReserve - remainingToReserve };
}

async function releaseReservationsFIFO(base44, commitmentId, qtyToRelease, userId, reason) {
  const reservations = await base44.asServiceRole.entities.InventoryReservation.filter({
    commitment_id: commitmentId,
    status: 'active'
  });
  
  // Release FIFO (oldest first)
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
// INVARIANT VALIDATOR
// ============================================

function validateCommitmentQtyInvariant(state) {
  const qty_needed = Math.max(0, Math.floor(state.qty_committed ?? 0));
  const qty_reserved = Math.max(0, Math.floor(state.qty_reserved ?? 0));
  const qty_ordered = Math.max(0, Math.floor(state.qty_ordered ?? 0));
  const qty_received = Math.max(0, Math.floor(state.qty_received ?? 0));
  const qty_installed = Math.max(0, Math.floor(state.qty_installed ?? 0));

  const coverage_total = qty_reserved + Math.max(qty_ordered, qty_received);
  const available_to_install = qty_reserved + qty_received;
  const gap_qty = Math.max(0, qty_needed - coverage_total);
  const overage_qty = Math.max(0, coverage_total - qty_needed);
  const qty_to_order_derived = gap_qty;

  const violations = [];

  // Check blocking violations
  if (qty_needed < 0 || qty_reserved < 0 || qty_ordered < 0 || qty_received < 0 || qty_installed < 0) {
    violations.push({ code: 'NEGATIVE_QTY', severity: 'BLOCKING', message: 'Quantity cannot be negative' });
  }
  if (qty_installed > available_to_install) {
    violations.push({ code: 'OVER_INSTALLED', severity: 'BLOCKING', message: 'Installed exceeds available' });
  }
  if (qty_received > qty_ordered && qty_ordered > 0) {
    violations.push({ code: 'OVER_RECEIVED', severity: 'WARNING', message: 'Received exceeds ordered' });
  }

  let coverage_status;
  if (qty_needed === 0) {
    coverage_status = coverage_total > 0 ? 'OVER' : 'FULL';
  } else if (coverage_total === 0) {
    coverage_status = 'NONE';
  } else if (coverage_total < qty_needed) {
    coverage_status = 'PARTIAL';
  } else if (coverage_total === qty_needed) {
    coverage_status = 'FULL';
  } else {
    coverage_status = 'OVER';
  }

  return {
    ok: violations.filter(v => v.severity === 'BLOCKING').length === 0,
    coverage: {
      qty_needed,
      qty_reserved,
      qty_ordered,
      qty_received,
      qty_installed,
      coverage_total,
      qty_to_order: qty_to_order_derived,
      gap_qty,
      overage_qty,
      coverage_status,
      available_to_install
    },
    violations
  };
}

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

// ============================================
// LIFECYCLE EVENT HELPER
// ============================================

async function createLifecycleEvent(base44, commitment, eventType, oldValues, newValues, userId, reason) {
  const isReversible = !NON_REVERSIBLE_EVENTS.includes(eventType);
  
  return await base44.asServiceRole.entities.LifecycleEvent.create({
    commitment_id: commitment.id,
    part_id: commitment.part_id,
    project_id: commitment.project_id,
    event_type: eventType,
    old_values: JSON.stringify(oldValues),
    new_values: JSON.stringify(newValues),
    trigger_source: 'COVERAGE_ACTION',
    triggered_by: userId,
    reason: reason || '',
    event_date: new Date().toISOString(),
    is_reversible: isReversible
  });
}

// ============================================
// ACTION HANDLERS
// ============================================

async function handleReserveStock(base44, commitment, qty, userId, reason, dryRun) {
  const availability = await getInventoryAvailability(base44, commitment.part_id);
  
  if (availability.total_available < qty) {
    return {
      ok: false,
      error: `Insufficient inventory. Available: ${availability.total_available}, Requested: ${qty}`,
      available_qty: availability.total_available
    };
  }
  
  const oldState = {
    qty_reserved: commitment.qty_reserved || 0,
    qty_to_order: commitment.qty_to_order || 0
  };
  
  const newQtyReserved = (commitment.qty_reserved || 0) + qty;
  const coverageAfter = newQtyReserved + Math.max(commitment.qty_ordered || 0, commitment.qty_received || 0);
  const newQtyToOrder = Math.max(0, (commitment.qty_committed || 0) - coverageAfter);
  
  const newState = {
    qty_reserved: newQtyReserved,
    qty_to_order: newQtyToOrder
  };
  
  // Validate new state
  const validation = validateCommitmentQtyInvariant({
    ...commitment,
    qty_reserved: newQtyReserved
  });
  
  if (!validation.ok) {
    return {
      ok: false,
      error: 'Invariant violation',
      violations: validation.violations
    };
  }
  
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      preview: {
        old_state: oldState,
        new_state: newState,
        coverage: validation.coverage
      }
    };
  }
  
  // Execute reservation
  const { reservationsCreated, totalReserved } = await createReservations(
    base44,
    commitment.part_id,
    commitment.project_id,
    commitment.id,
    qty,
    availability.items
  );
  
  // Update commitment
  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
    qty_reserved: newQtyReserved,
    qty_to_order: newQtyToOrder,
    coverage_status: computeCoverageStatus({ ...commitment, qty_reserved: newQtyReserved })
  });
  
  // Log event
  await createLifecycleEvent(base44, commitment, 'STOCK_RESERVED_MANUAL', oldState, newState, userId, reason);
  
  return {
    ok: true,
    action_type: 'RESERVE_STOCK',
    qty_reserved: totalReserved,
    reservations_created: reservationsCreated,
    old_state: oldState,
    new_state: newState,
    coverage: validation.coverage
  };
}

async function handleReleaseReservation(base44, commitment, qty, userId, reason, dryRun) {
  const currentReserved = commitment.qty_reserved || 0;
  
  if (currentReserved < qty) {
    return {
      ok: false,
      error: `Cannot release ${qty}. Only ${currentReserved} reserved.`,
      available_to_release: currentReserved
    };
  }
  
  const oldState = {
    qty_reserved: currentReserved,
    qty_to_order: commitment.qty_to_order || 0
  };
  
  const newQtyReserved = currentReserved - qty;
  const coverageAfter = newQtyReserved + Math.max(commitment.qty_ordered || 0, commitment.qty_received || 0);
  const newQtyToOrder = Math.max(0, (commitment.qty_committed || 0) - coverageAfter);
  
  const newState = {
    qty_reserved: newQtyReserved,
    qty_to_order: newQtyToOrder
  };
  
  // Validate new state
  const validation = validateCommitmentQtyInvariant({
    ...commitment,
    qty_reserved: newQtyReserved
  });
  
  if (!validation.ok) {
    return {
      ok: false,
      error: 'Invariant violation',
      violations: validation.violations
    };
  }
  
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      preview: {
        old_state: oldState,
        new_state: newState,
        coverage: validation.coverage
      }
    };
  }
  
  // Release reservations
  const { released, totalReleased } = await releaseReservationsFIFO(base44, commitment.id, qty, userId, reason);
  
  // Update commitment
  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
    qty_reserved: newQtyReserved,
    qty_to_order: newQtyToOrder,
    coverage_status: computeCoverageStatus({ ...commitment, qty_reserved: newQtyReserved })
  });
  
  // Log event
  await createLifecycleEvent(base44, commitment, 'STOCK_RELEASED_MANUAL', oldState, newState, userId, reason);
  
  return {
    ok: true,
    action_type: 'RELEASE_RESERVATION',
    qty_released: totalReleased,
    reservations_released: released,
    old_state: oldState,
    new_state: newState,
    coverage: validation.coverage
  };
}

async function handleAddToOrderQueue(base44, commitment, qty, userId, reason, dryRun) {
  const oldState = {
    qty_committed: commitment.qty_committed || 0,
    qty_to_order: commitment.qty_to_order || 0
  };
  
  const newQtyCommitted = (commitment.qty_committed || 0) + qty;
  const coverageAfter = (commitment.qty_reserved || 0) + Math.max(commitment.qty_ordered || 0, commitment.qty_received || 0);
  const newQtyToOrder = Math.max(0, newQtyCommitted - coverageAfter);
  
  const newState = {
    qty_committed: newQtyCommitted,
    qty_to_order: newQtyToOrder
  };
  
  // Validate new state
  const validation = validateCommitmentQtyInvariant({
    ...commitment,
    qty_committed: newQtyCommitted
  });
  
  if (!validation.ok) {
    return {
      ok: false,
      error: 'Invariant violation',
      violations: validation.violations
    };
  }
  
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      preview: {
        old_state: oldState,
        new_state: newState,
        coverage: validation.coverage
      }
    };
  }
  
  // Update commitment
  const unitCost = commitment.unit_cost_snapshot || 0;
  const unitRetail = commitment.unit_retail_snapshot || 0;
  
  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
    qty_committed: newQtyCommitted,
    qty_to_order: newQtyToOrder,
    planned_cost_total: newQtyCommitted * unitCost,
    planned_retail_total: newQtyCommitted * unitRetail,
    coverage_status: computeCoverageStatus({ ...commitment, qty_committed: newQtyCommitted })
  });
  
  // Log event
  await createLifecycleEvent(base44, commitment, 'ADDED_TO_ORDER_QUEUE_MANUAL', oldState, newState, userId, reason);
  
  return {
    ok: true,
    action_type: 'ADD_TO_ORDER_QUEUE',
    qty_added: qty,
    old_state: oldState,
    new_state: newState,
    coverage: validation.coverage
  };
}

async function handleRemoveFromOrderQueue(base44, commitment, qty, userId, reason, dryRun) {
  const currentCommitted = commitment.qty_committed || 0;
  const currentOrdered = commitment.qty_ordered || 0;
  const currentReceived = commitment.qty_received || 0;
  const currentInstalled = commitment.qty_installed || 0;
  
  // Cannot reduce below what's ordered/received/installed
  const minCommitted = Math.max(currentOrdered, currentReceived, currentInstalled);
  const maxReducible = currentCommitted - minCommitted;
  
  if (qty > maxReducible) {
    return {
      ok: false,
      error: `Cannot remove ${qty} from queue. Max reducible: ${maxReducible} (blocked by ordered/received/installed).`,
      max_reducible: maxReducible
    };
  }
  
  const oldState = {
    qty_committed: currentCommitted,
    qty_to_order: commitment.qty_to_order || 0
  };
  
  const newQtyCommitted = currentCommitted - qty;
  const coverageAfter = (commitment.qty_reserved || 0) + Math.max(currentOrdered, currentReceived);
  const newQtyToOrder = Math.max(0, newQtyCommitted - coverageAfter);
  
  const newState = {
    qty_committed: newQtyCommitted,
    qty_to_order: newQtyToOrder
  };
  
  // Validate new state
  const validation = validateCommitmentQtyInvariant({
    ...commitment,
    qty_committed: newQtyCommitted
  });
  
  if (!validation.ok) {
    return {
      ok: false,
      error: 'Invariant violation',
      violations: validation.violations
    };
  }
  
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      preview: {
        old_state: oldState,
        new_state: newState,
        coverage: validation.coverage
      }
    };
  }
  
  // Update commitment
  const unitCost = commitment.unit_cost_snapshot || 0;
  const unitRetail = commitment.unit_retail_snapshot || 0;
  
  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
    qty_committed: newQtyCommitted,
    qty_to_order: newQtyToOrder,
    planned_cost_total: newQtyCommitted * unitCost,
    planned_retail_total: newQtyCommitted * unitRetail,
    coverage_status: computeCoverageStatus({ ...commitment, qty_committed: newQtyCommitted })
  });
  
  // Log event
  await createLifecycleEvent(base44, commitment, 'REMOVED_FROM_ORDER_QUEUE', oldState, newState, userId, reason);
  
  return {
    ok: true,
    action_type: 'REMOVE_FROM_ORDER_QUEUE',
    qty_removed: qty,
    old_state: oldState,
    new_state: newState,
    coverage: validation.coverage
  };
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const { commitment_id, action_type, qty, dry_run = false, reason } = await req.json();
    
    if (!commitment_id || !action_type) {
      return Response.json({ ok: false, error: 'Missing commitment_id or action_type' }, { status: 400 });
    }
    
    if (!ACTION_TYPES[action_type]) {
      return Response.json({ ok: false, error: `Invalid action_type: ${action_type}` }, { status: 400 });
    }
    
    if (!qty || qty <= 0) {
      return Response.json({ ok: false, error: 'qty must be a positive number' }, { status: 400 });
    }
    
    // Fetch commitment
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    if (!commitments || commitments.length === 0) {
      return Response.json({ ok: false, error: 'Commitment not found' }, { status: 404 });
    }
    const commitment = commitments[0];
    
    // Check for blocking status
    if (commitment.commitment_status === 'cancelled') {
      return Response.json({ ok: false, error: 'Cannot modify cancelled commitment' }, { status: 400 });
    }
    
    // Check for financial lock (paid status)
    if (commitment.billing_status === 'paid') {
      return Response.json({ ok: false, error: 'Commitment is financially locked (paid)' }, { status: 400 });
    }
    
    let result;
    
    switch (action_type) {
      case ACTION_TYPES.RESERVE_STOCK:
        result = await handleReserveStock(base44, commitment, qty, user.email, reason, dry_run);
        break;
      case ACTION_TYPES.RELEASE_RESERVATION:
        result = await handleReleaseReservation(base44, commitment, qty, user.email, reason, dry_run);
        break;
      case ACTION_TYPES.ADD_TO_ORDER_QUEUE:
        result = await handleAddToOrderQueue(base44, commitment, qty, user.email, reason, dry_run);
        break;
      case ACTION_TYPES.REMOVE_FROM_ORDER_QUEUE:
        result = await handleRemoveFromOrderQueue(base44, commitment, qty, user.email, reason, dry_run);
        break;
      default:
        return Response.json({ ok: false, error: 'Unknown action type' }, { status: 400 });
    }
    
    return Response.json({
      ...result,
      commitment_id,
      action_type
    });
    
  } catch (error) {
    console.error('Coverage action error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});