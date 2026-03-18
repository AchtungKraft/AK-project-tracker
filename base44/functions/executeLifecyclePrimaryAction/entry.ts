import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9.5 — Lifecycle Primary Action Executor
 * 
 * Validates and executes the primary lifecycle action for a commitment.
 * Logs LifecycleEvent and returns updated state.
 */

const ACTION_TYPES = {
  INVOICE_CLIENT: 'INVOICE_CLIENT',
  RECORD_PAYMENT: 'RECORD_PAYMENT',
  CREATE_ORDER: 'CREATE_ORDER',
  RECEIVE_PART: 'RECEIVE_PART',
  INSTALL_PART: 'INSTALL_PART',
  FIX_DATA: 'FIX_DATA',
};

const ACTION_TO_EVENT_TYPE = {
  INVOICE_CLIENT: 'CLIENT_INVOICED',
  RECORD_PAYMENT: 'CLIENT_PAID',
  CREATE_ORDER: 'PO_CREATED',
  RECEIVE_PART: 'PART_RECEIVED',
  INSTALL_PART: 'PART_INSTALLED',
  FIX_DATA: 'DATA_CORRECTED',
};

async function validateActionAllowed(base44, commitmentId, actionType) {
  // Re-resolve lifecycle state to ensure action is still valid
  const response = await base44.functions.invoke('resolvePartLifecycleState', {
    commitment_ids: [commitmentId]
  });
  
  const lifecycleData = response.data;
  if (!lifecycleData?.results?.length) {
    return { allowed: false, reason: 'Commitment not found or invalid' };
  }
  
  const state = lifecycleData.results[0];
  const clientAxis = state.lifecycle_axes?.client;
  const procurementAxis = state.lifecycle_axes?.procurement;
  const installAxis = state.lifecycle_axes?.installation;
  
  switch (actionType) {
    case ACTION_TYPES.INVOICE_CLIENT:
      if (clientAxis?.billing_status !== 'NEEDS_BILLING') {
        return { allowed: false, reason: 'Already invoiced or not billable' };
      }
      if (state.financial_summary?.unit_retail <= 0) {
        return { allowed: false, reason: 'Missing retail price' };
      }
      break;
      
    case ACTION_TYPES.RECORD_PAYMENT:
      if (clientAxis?.billing_status !== 'INVOICED') {
        return { allowed: false, reason: 'Not yet invoiced' };
      }
      break;
      
    case ACTION_TYPES.CREATE_ORDER:
      if (procurementAxis?.procurement_status !== 'NEEDS_ORDER') {
        return { allowed: false, reason: 'Order not required or already ordered' };
      }
      if (procurementAxis?.ordering_safety === 'RED') {
        return { allowed: false, reason: 'Client payment required first (RED safety)' };
      }
      break;
      
    case ACTION_TYPES.RECEIVE_PART:
      if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(procurementAxis?.procurement_status)) {
        return { allowed: false, reason: 'No active orders to receive' };
      }
      break;
      
    case ACTION_TYPES.INSTALL_PART:
      if (installAxis?.install_status === 'INSTALLED') {
        return { allowed: false, reason: 'Already installed' };
      }
      if (procurementAxis?.procurement_status === 'NEEDS_ORDER' ||
          procurementAxis?.procurement_status === 'ORDERED') {
        return { allowed: false, reason: 'Parts not yet received' };
      }
      break;
      
    default:
      return { allowed: true, reason: null };
  }
  
  return { allowed: true, reason: null, state };
}

async function logLifecycleEvent(base44, commitmentId, actionType, previousState, newState, userId) {
  const eventType = ACTION_TO_EVENT_TYPE[actionType] || 'STATUS_OVERRIDE';
  
  try {
    await base44.asServiceRole.entities.LifecycleEvent.create({
      commitment_id: commitmentId,
      event_type: eventType,
      previous_state: JSON.stringify(previousState || {}),
      new_state: JSON.stringify(newState || {}),
      trigger_source: 'USER_ACTION',
      user_id: userId,
      part_id: previousState?.part_id,
      project_id: previousState?.project_id,
    });
  } catch (error) {
    console.error('Failed to log lifecycle event:', error);
  }
}

async function executeLifecyclePrimaryAction(base44, userId, commitmentId, actionType, actionData = {}) {
  // Validate action is allowed
  const validation = await validateActionAllowed(base44, commitmentId, actionType);
  
  if (!validation.allowed) {
    return {
      success: false,
      error: validation.reason,
      action_blocked: true,
    };
  }
  
  const previousState = validation.state;
  let result = { success: true };
  
  try {
    switch (actionType) {
      case ACTION_TYPES.INVOICE_CLIENT:
        // Create invoice batch line for this commitment
        result = await executeInvoiceAction(base44, commitmentId, previousState, actionData);
        break;
        
      case ACTION_TYPES.RECORD_PAYMENT:
        // Update billing status to paid
        result = await executePaymentAction(base44, commitmentId, previousState, actionData);
        break;
        
      case ACTION_TYPES.CREATE_ORDER:
        // Mark as ready for PO - actual PO creation is via separate flow
        result = { 
          success: true, 
          message: 'Ready for order. Use Create PO modal to complete.',
          requires_modal: 'CREATE_PO',
        };
        break;
        
      case ACTION_TYPES.RECEIVE_PART:
        // Mark as ready for receiving - actual receiving is via separate flow
        result = { 
          success: true, 
          message: 'Ready for receiving. Use Receive Inventory modal.',
          requires_modal: 'RECEIVE_INVENTORY',
        };
        break;
        
      case ACTION_TYPES.INSTALL_PART:
        // Mark as ready for install - actual install is via separate flow
        result = { 
          success: true, 
          message: 'Ready for installation. Use Install Part modal.',
          requires_modal: 'INSTALL_PART',
        };
        break;
        
      case ACTION_TYPES.FIX_DATA:
        // Open timeline drawer for data correction
        result = { 
          success: true, 
          message: 'Review and fix data issues.',
          requires_modal: 'LIFECYCLE_TIMELINE',
        };
        break;
        
      default:
        result = { success: false, error: 'Unknown action type' };
    }
    
    // Log the event
    if (result.success) {
      await logLifecycleEvent(base44, commitmentId, actionType, previousState, result, userId);
    }
    
    // Get updated lifecycle state
    if (result.success && !result.requires_modal) {
      const refreshResponse = await base44.functions.invoke('resolvePartLifecycleState', {
        commitment_ids: [commitmentId]
      });
      result.updated_state = refreshResponse.data?.results?.[0];
    }
    
  } catch (error) {
    console.error('Action execution error:', error);
    result = {
      success: false,
      error: error.message,
    };
  }
  
  return result;
}

async function executeInvoiceAction(base44, commitmentId, previousState, actionData) {
  // Update commitment billing status
  await base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
    billing_status: 'invoiced',
  });
  
  return {
    success: true,
    message: 'Marked as invoiced',
    new_billing_status: 'invoiced',
  };
}

async function executePaymentAction(base44, commitmentId, previousState, actionData) {
  // Update commitment billing status to paid
  await base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
    billing_status: 'paid',
  });
  
  return {
    success: true,
    message: 'Payment recorded',
    new_billing_status: 'paid',
  };
}

// ============================================
// HTTP ENDPOINT
// ============================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json().catch(() => ({}));
    const { commitment_id, action_type, action_data } = payload;
    
    if (!commitment_id || !action_type) {
      return Response.json({ 
        error: 'Missing commitment_id or action_type' 
      }, { status: 400 });
    }
    
    const result = await executeLifecyclePrimaryAction(
      base44, 
      user.id, 
      commitment_id, 
      action_type, 
      action_data
    );
    
    return Response.json(result);
    
  } catch (error) {
    console.error('Action execution error:', error);
    return Response.json({ 
      error: error.message,
      code: 'ACTION_EXECUTION_ERROR'
    }, { status: 500 });
  }
});