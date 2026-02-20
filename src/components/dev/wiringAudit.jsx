import { base44 } from "@/api/base44Client";

/**
 * UI/Function Wiring Audit System
 * 
 * Tracks all button clicks and action executions to prevent silent failures
 * Dev-mode logging + analytics tracking for production debugging
 */

const DEV_MODE = process.env.NODE_ENV === 'development';

// In-memory action log for admin panel
const actionLog = [];
const MAX_LOG_SIZE = 100;

function addToLog(entry) {
  actionLog.unshift(entry);
  if (actionLog.length > MAX_LOG_SIZE) {
    actionLog.pop();
  }
}

export function getActionLog() {
  return [...actionLog];
}

export function clearActionLog() {
  actionLog.length = 0;
}

/**
 * Track action invocation
 */
export function trackAction(actionName, pageName, meta = {}) {
  const entry = {
    actionName,
    pageName,
    timestamp: new Date().toISOString(),
    meta,
    status: 'invoked',
  };
  
  addToLog(entry);
  
  if (DEV_MODE) {
    console.log('[WIRING AUDIT] Action invoked:', entry);
  }
  
  // Analytics tracking
  base44.analytics.track({
    eventName: 'ui_action_invoked',
    properties: {
      action_name: actionName,
      page_name: pageName,
      ...meta,
    },
  });
  
  return entry;
}

/**
 * Track action success
 */
export function trackSuccess(actionName, pageName, result = {}) {
  const entry = {
    actionName,
    pageName,
    timestamp: new Date().toISOString(),
    result,
    status: 'success',
  };
  
  addToLog(entry);
  
  if (DEV_MODE) {
    console.log('[WIRING AUDIT] Action succeeded:', entry);
  }
  
  base44.analytics.track({
    eventName: 'ui_action_success',
    properties: {
      action_name: actionName,
      page_name: pageName,
    },
  });
}

/**
 * Track action error
 */
export function trackError(actionName, pageName, error) {
  const entry = {
    actionName,
    pageName,
    timestamp: new Date().toISOString(),
    error: error.message || String(error),
    status: 'error',
  };
  
  addToLog(entry);
  
  console.error('[WIRING AUDIT] Action failed:', entry);
  
  base44.analytics.track({
    eventName: 'ui_action_error',
    properties: {
      action_name: actionName,
      page_name: pageName,
      error_message: error.message || String(error),
    },
  });
}

/**
 * Wrapper for action handlers with automatic tracking
 */
export function withWiringAudit(actionName, fn, meta = {}) {
  return async (...args) => {
    const pageName = meta.pageName || 'unknown';
    trackAction(actionName, pageName, meta);
    
    try {
      const result = await fn(...args);
      trackSuccess(actionName, pageName, result);
      return result;
    } catch (error) {
      trackError(actionName, pageName, error);
      throw error;
    }
  };
}

/**
 * React hook for component-level tracking
 */
export function useWiringAudit(pageName) {
  return {
    trackClick: (actionName, meta = {}) => trackAction(actionName, pageName, meta),
    trackSuccess: (actionName, result = {}) => trackSuccess(actionName, pageName, result),
    trackError: (actionName, error) => trackError(actionName, pageName, error),
    wrap: (actionName, fn, meta = {}) => withWiringAudit(actionName, fn, { ...meta, pageName }),
  };
}

/**
 * QA CHECKLIST - Critical action wiring verification
 * 
 * Each action must:
 * 1. trackClick() on user interaction
 * 2. trackSuccess() or trackError() on completion
 * 3. Call correct invalidation after mutation
 * 
 * VERIFIED ACTIONS:
 * [x] AddPartButton::add_part_button -> AddPartToProjectModal
 * [x] AddPartButton::add_part_modal_submit -> executeSupplyAction
 * [x] ProjectSupplyManager::bulk_po_preview -> createPurchaseOrdersFromCommitments(dry_run)
 * [x] ProjectSupplyManager::bulk_po_execute -> createPurchaseOrdersFromCommitments
 * [x] ProjectSupplyManager::single_po_create -> createPurchaseOrdersFromCommitments
 * [x] SupplyQueues::refresh_queues -> getGlobalSupplyQueues
 * [x] SupplyQueues::navigate_to_project -> ProjectSupplyManager
 * [x] GlobalNeedToOrder::batch_create_po -> CreateBatchOrderModal
 * [x] GlobalNeedToOrder::navigate_to_receiving -> POReceiving
 * 
 * TODO: Wire remaining actions
 * [ ] ForwardInvoiceDashboard::create_invoice -> createInvoiceBatch
 * [ ] ForwardInvoiceDashboard::record_payment -> updatePaymentStatus
 * [ ] ForwardInvoiceDashboard::export_csv -> exportInvoiceBatchToQuickBooks
 * [ ] InstallPartModal::install -> executeSupplyAction
 * [ ] ReceiveInventoryModal::receive -> executeSupplyAction
 */
export const WIRING_CHECKLIST = {
  // This is documentation only - used for verification
};