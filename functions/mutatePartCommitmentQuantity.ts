import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Commitment Quantity & Reallocation Mutation Engine
 * 
 * Handles controlled mutations to commitment quantities while preserving
 * lifecycle integrity and financial constraints.
 */

const ACTION_TYPES = {
  INCREASE_QTY: 'INCREASE_QTY',
  DECREASE_QTY: 'DECREASE_QTY',
  REALLOCATE_TO_PROJECT: 'REALLOCATE_TO_PROJECT',
  CANCEL_UNORDERED_QTY: 'CANCEL_UNORDERED_QTY',
  SPLIT_COMMITMENT: 'SPLIT_COMMITMENT',
  MERGE_COMMITMENTS: 'MERGE_COMMITMENTS'
};

// Quantity constraint rules
const validateQuantityConstraints = (commitment) => {
  const violations = [];
  
  const {
    qty_committed = 0,
    qty_ordered = 0,
    qty_received = 0,
    qty_installed = 0
  } = commitment;

  if (qty_installed > qty_received) {
    violations.push(`qty_installed (${qty_installed}) cannot exceed qty_received (${qty_received})`);
  }
  if (qty_received > qty_ordered) {
    violations.push(`qty_received (${qty_received}) cannot exceed qty_ordered (${qty_ordered})`);
  }
  if (qty_ordered > qty_committed) {
    violations.push(`qty_ordered (${qty_ordered}) cannot exceed qty_committed (${qty_committed})`);
  }

  return violations;
};

// Calculate derived state flags
const calculateDerivedFlags = (commitment, billingInfo = {}) => {
  const {
    qty_committed = 0,
    qty_ordered = 0,
    qty_received = 0,
    qty_installed = 0
  } = commitment;

  const { qty_billed = 0, qty_paid = 0 } = billingInfo;

  const flags = {
    is_overbilled: qty_billed > qty_committed,
    is_overordered: qty_ordered > qty_committed,
    credit_required: qty_billed > qty_committed,
    po_adjustment_required: qty_ordered > qty_committed,
    has_unordered_qty: qty_committed > qty_ordered,
    has_unreceived_qty: qty_ordered > qty_received,
    has_uninstalled_qty: qty_received > qty_installed,
    remaining_to_order: Math.max(0, qty_committed - qty_ordered),
    remaining_to_receive: Math.max(0, qty_ordered - qty_received),
    remaining_to_install: Math.max(0, qty_received - qty_installed)
  };

  return flags;
};

// Simulate mutation impact
const simulateMutationImpact = (commitment, actionType, qtyDelta, billingInfo = {}) => {
  const current = {
    qty_committed: commitment.qty_committed || 0,
    qty_ordered: commitment.qty_ordered || 0,
    qty_received: commitment.qty_received || 0,
    qty_installed: commitment.qty_installed || 0
  };

  const proposed = { ...current };

  switch (actionType) {
    case ACTION_TYPES.INCREASE_QTY:
      proposed.qty_committed = current.qty_committed + qtyDelta;
      break;
    case ACTION_TYPES.DECREASE_QTY:
    case ACTION_TYPES.CANCEL_UNORDERED_QTY:
      proposed.qty_committed = current.qty_committed - qtyDelta;
      break;
    case ACTION_TYPES.SPLIT_COMMITMENT:
      proposed.qty_committed = current.qty_committed - qtyDelta;
      break;
  }

  const currentFlags = calculateDerivedFlags(current, billingInfo);
  const proposedFlags = calculateDerivedFlags(proposed, billingInfo);

  // Check for blocking violations
  const blockingIssues = [];

  if (proposed.qty_committed < current.qty_installed) {
    blockingIssues.push(`Cannot reduce below installed qty (${current.qty_installed})`);
  }
  if (proposed.qty_committed < current.qty_received) {
    blockingIssues.push(`Cannot reduce below received qty (${current.qty_received})`);
  }
  if (actionType === ACTION_TYPES.CANCEL_UNORDERED_QTY && proposed.qty_committed < current.qty_ordered) {
    blockingIssues.push(`Cannot cancel ordered qty - use PO adjustment instead`);
  }

  // Calculate financial impact
  const unitCost = commitment.unit_cost_snapshot || 0;
  const unitRetail = commitment.unit_retail_snapshot || 0;
  
  const financialImpact = {
    cost_delta: qtyDelta * unitCost * (actionType === ACTION_TYPES.INCREASE_QTY ? 1 : -1),
    retail_delta: qtyDelta * unitRetail * (actionType === ACTION_TYPES.INCREASE_QTY ? 1 : -1),
    margin_impact: qtyDelta * (unitRetail - unitCost) * (actionType === ACTION_TYPES.INCREASE_QTY ? 1 : -1)
  };

  return {
    current,
    proposed,
    currentFlags,
    proposedFlags,
    blockingIssues,
    financialImpact,
    warnings: proposedFlags.credit_required ? ['Credit adjustment may be required'] : [],
    canProceed: blockingIssues.length === 0
  };
};

// Create lifecycle event
const createLifecycleEvent = async (base44, commitment, eventType, oldValues, newValues, userId, reason) => {
  try {
    await base44.asServiceRole.entities.LifecycleEvent.create({
      commitment_id: commitment.id,
      project_id: commitment.project_id,
      part_id: commitment.part_id,
      event_type: eventType,
      old_values: JSON.stringify(oldValues),
      new_values: JSON.stringify(newValues),
      triggered_by: userId,
      reason: reason || '',
      event_date: new Date().toISOString()
    });
  } catch (e) {
    console.error('Failed to create lifecycle event:', e);
  }
};

// Execute INCREASE_QTY
const executeIncreaseQty = async (base44, commitment, qtyDelta, reason, userId) => {
  const oldQty = commitment.qty_committed || 0;
  const newQty = oldQty + qtyDelta;

  // Recalculate totals
  const unitCost = commitment.unit_cost_snapshot || 0;
  const unitRetail = commitment.unit_retail_snapshot || 0;

  const updates = {
    qty_committed: newQty,
    planned_cost_total: newQty * unitCost,
    planned_retail_total: newQty * unitRetail,
    // Reset integrity if needed
    pricing_integrity_status: commitment.pricing_integrity_status === 'ok' ? 'ok' : 'estimated_cost'
  };

  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);

  await createLifecycleEvent(
    base44,
    commitment,
    'QTY_INCREASED',
    { qty_committed: oldQty },
    { qty_committed: newQty, delta: qtyDelta },
    userId,
    reason
  );

  return { success: true, newQty, message: `Quantity increased from ${oldQty} to ${newQty}` };
};

// Execute DECREASE_QTY
const executeDecreaseQty = async (base44, commitment, qtyDelta, reason, userId) => {
  const oldQty = commitment.qty_committed || 0;
  const newQty = oldQty - qtyDelta;

  // Validate constraints
  if (newQty < (commitment.qty_installed || 0)) {
    return { success: false, error: `Cannot reduce below installed qty (${commitment.qty_installed})` };
  }
  if (newQty < (commitment.qty_ordered || 0)) {
    return { 
      success: false, 
      error: `Cannot reduce below ordered qty (${commitment.qty_ordered}). Adjust PO first.`,
      flag: 'PO_ADJUSTMENT_REQUIRED'
    };
  }

  const unitCost = commitment.unit_cost_snapshot || 0;
  const unitRetail = commitment.unit_retail_snapshot || 0;

  const updates = {
    qty_committed: newQty,
    planned_cost_total: newQty * unitCost,
    planned_retail_total: newQty * unitRetail
  };

  // Check if overbilled
  const allocations = await base44.asServiceRole.entities.PoolAllocation.filter({ commitment_id: commitment.id });
  const totalAllocated = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
  
  if (totalAllocated > newQty * unitRetail) {
    updates.integrity_warning = true;
    updates.integrity_warning_details = `Over-allocated: $${totalAllocated.toFixed(2)} allocated but new planned retail is $${(newQty * unitRetail).toFixed(2)}`;
  }

  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);

  await createLifecycleEvent(
    base44,
    commitment,
    'QTY_DECREASED',
    { qty_committed: oldQty },
    { qty_committed: newQty, delta: -qtyDelta },
    userId,
    reason
  );

  return { 
    success: true, 
    newQty, 
    message: `Quantity decreased from ${oldQty} to ${newQty}`,
    warnings: updates.integrity_warning ? ['Over-allocation detected - credit adjustment may be required'] : []
  };
};

// Execute REALLOCATE_TO_PROJECT
const executeReallocateToProject = async (base44, commitment, qtyToMove, targetProjectId, reason, userId) => {
  // Validate target project exists
  const targetProjects = await base44.asServiceRole.entities.Project.filter({ id: targetProjectId });
  if (targetProjects.length === 0) {
    return { success: false, error: 'Target project not found' };
  }

  const remainingQty = (commitment.qty_committed || 0) - qtyToMove;
  
  // Cannot move more than uninstalled qty
  const maxMovable = (commitment.qty_committed || 0) - (commitment.qty_installed || 0);
  if (qtyToMove > maxMovable) {
    return { success: false, error: `Cannot move more than uninstalled qty (${maxMovable})` };
  }

  // Create new commitment on target project
  const newCommitmentData = {
    project_id: targetProjectId,
    part_id: commitment.part_id,
    qty_committed: qtyToMove,
    qty_ordered: 0,
    qty_received: 0,
    qty_installed: 0,
    qty_cancelled: 0,
    commitment_status: 'planned',
    source_type: 'split_commitment',
    parent_commitment_id: commitment.id,
    unit_cost_snapshot: commitment.unit_cost_snapshot,
    unit_retail_snapshot: commitment.unit_retail_snapshot,
    planned_cost_total: qtyToMove * (commitment.unit_cost_snapshot || 0),
    planned_retail_total: qtyToMove * (commitment.unit_retail_snapshot || 0),
    notes: `Reallocated from project. Original commitment: ${commitment.id}. Reason: ${reason || 'N/A'}`
  };

  const newCommitment = await base44.asServiceRole.entities.PartCommitment.create(newCommitmentData);

  // Update original commitment
  const unitCost = commitment.unit_cost_snapshot || 0;
  const unitRetail = commitment.unit_retail_snapshot || 0;

  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
    qty_committed: remainingQty,
    planned_cost_total: remainingQty * unitCost,
    planned_retail_total: remainingQty * unitRetail,
    notes: `${commitment.notes || ''}\n[${new Date().toISOString()}] Reallocated ${qtyToMove} to project ${targetProjectId}`
  });

  await createLifecycleEvent(
    base44,
    commitment,
    'REALLOCATED',
    { qty_committed: commitment.qty_committed, project_id: commitment.project_id },
    { qty_committed: remainingQty, moved_qty: qtyToMove, target_project_id: targetProjectId, new_commitment_id: newCommitment.id },
    userId,
    reason
  );

  return {
    success: true,
    message: `Moved ${qtyToMove} units to project ${targetProjects[0].name}`,
    newCommitmentId: newCommitment.id,
    remainingQty
  };
};

// Execute CANCEL_UNORDERED_QTY
const executeCancelUnorderedQty = async (base44, commitment, qtyToCancel, reason, userId) => {
  const unorderedQty = (commitment.qty_committed || 0) - (commitment.qty_ordered || 0);
  
  if (qtyToCancel > unorderedQty) {
    return { 
      success: false, 
      error: `Can only cancel unordered qty (${unorderedQty}). ${qtyToCancel - unorderedQty} units already on order.` 
    };
  }

  const newQty = (commitment.qty_committed || 0) - qtyToCancel;
  const newCancelled = (commitment.qty_cancelled || 0) + qtyToCancel;

  const unitCost = commitment.unit_cost_snapshot || 0;
  const unitRetail = commitment.unit_retail_snapshot || 0;

  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
    qty_committed: newQty,
    qty_cancelled: newCancelled,
    planned_cost_total: newQty * unitCost,
    planned_retail_total: newQty * unitRetail
  });

  await createLifecycleEvent(
    base44,
    commitment,
    'QTY_CANCELLED',
    { qty_committed: commitment.qty_committed, qty_cancelled: commitment.qty_cancelled || 0 },
    { qty_committed: newQty, qty_cancelled: newCancelled },
    userId,
    reason
  );

  return {
    success: true,
    newQty,
    cancelledQty: newCancelled,
    message: `Cancelled ${qtyToCancel} unordered units`
  };
};

// Execute SPLIT_COMMITMENT
const executeSplitCommitment = async (base44, commitment, qtyToSplit, reason, userId) => {
  if (qtyToSplit >= (commitment.qty_committed || 0)) {
    return { success: false, error: 'Split qty must be less than total committed qty' };
  }

  const remainingQty = (commitment.qty_committed || 0) - qtyToSplit;

  // Create new commitment
  const newCommitmentData = {
    project_id: commitment.project_id,
    part_id: commitment.part_id,
    qty_committed: qtyToSplit,
    qty_ordered: 0,
    qty_received: 0,
    qty_installed: 0,
    qty_cancelled: 0,
    commitment_status: 'planned',
    source_type: 'split_commitment',
    parent_commitment_id: commitment.id,
    unit_cost_snapshot: commitment.unit_cost_snapshot,
    unit_retail_snapshot: commitment.unit_retail_snapshot,
    planned_cost_total: qtyToSplit * (commitment.unit_cost_snapshot || 0),
    planned_retail_total: qtyToSplit * (commitment.unit_retail_snapshot || 0),
    notes: `Split from commitment ${commitment.id}. Reason: ${reason || 'N/A'}`
  };

  const newCommitment = await base44.asServiceRole.entities.PartCommitment.create(newCommitmentData);

  // Update original
  const unitCost = commitment.unit_cost_snapshot || 0;
  const unitRetail = commitment.unit_retail_snapshot || 0;

  await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
    qty_committed: remainingQty,
    planned_cost_total: remainingQty * unitCost,
    planned_retail_total: remainingQty * unitRetail
  });

  await createLifecycleEvent(
    base44,
    commitment,
    'COMMITMENT_SPLIT',
    { qty_committed: commitment.qty_committed },
    { qty_committed: remainingQty, split_qty: qtyToSplit, new_commitment_id: newCommitment.id },
    userId,
    reason
  );

  return {
    success: true,
    message: `Split ${qtyToSplit} units into new commitment`,
    newCommitmentId: newCommitment.id,
    remainingQty
  };
};

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

    // Check if commitment is closed or archived
    if (commitment.commitment_status === 'closed') {
      return Response.json({ error: 'Cannot mutate closed commitment' }, { status: 400 });
    }
    if (commitment.commitment_status === 'cancelled') {
      return Response.json({ error: 'Cannot mutate cancelled commitment' }, { status: 400 });
    }

    // Get billing info for impact calculation
    const allocations = await base44.asServiceRole.entities.PoolAllocation.filter({ commitment_id: commitment_id });
    const totalAllocated = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
    const billingInfo = {
      qty_billed: totalAllocated > 0 ? Math.ceil(totalAllocated / (commitment.unit_retail_snapshot || 1)) : 0,
      qty_paid: 0 // Would need payment tracking
    };

    // Simulate impact
    const impact = simulateMutationImpact(commitment, action_type, qty_delta, billingInfo);

    if (dry_run) {
      return Response.json({
        dry_run: true,
        commitment_id,
        action_type,
        qty_delta,
        impact,
        can_proceed: impact.canProceed
      });
    }

    // Check if can proceed
    if (!impact.canProceed) {
      return Response.json({
        success: false,
        error: 'Mutation blocked by constraints',
        blocking_issues: impact.blockingIssues,
        impact
      }, { status: 400 });
    }

    // Execute mutation
    let result;
    switch (action_type) {
      case ACTION_TYPES.INCREASE_QTY:
        result = await executeIncreaseQty(base44, commitment, qty_delta, reason, user.email);
        break;
      case ACTION_TYPES.DECREASE_QTY:
        result = await executeDecreaseQty(base44, commitment, qty_delta, reason, user.email);
        break;
      case ACTION_TYPES.REALLOCATE_TO_PROJECT:
        if (!target_project_id) {
          return Response.json({ error: 'target_project_id required for REALLOCATE_TO_PROJECT' }, { status: 400 });
        }
        result = await executeReallocateToProject(base44, commitment, qty_delta, target_project_id, reason, user.email);
        break;
      case ACTION_TYPES.CANCEL_UNORDERED_QTY:
        result = await executeCancelUnorderedQty(base44, commitment, qty_delta, reason, user.email);
        break;
      case ACTION_TYPES.SPLIT_COMMITMENT:
        result = await executeSplitCommitment(base44, commitment, qty_delta, reason, user.email);
        break;
      case ACTION_TYPES.MERGE_COMMITMENTS:
        return Response.json({ error: 'MERGE_COMMITMENTS not yet implemented' }, { status: 501 });
      default:
        return Response.json({ error: 'Unknown action type' }, { status: 400 });
    }

    return Response.json({
      ...result,
      impact,
      action_type,
      commitment_id
    });

  } catch (error) {
    console.error('mutatePartCommitmentQuantity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});