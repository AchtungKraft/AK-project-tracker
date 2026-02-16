/**
 * Financial Mutation Guard - Client-Side Enforcement
 * 
 * This module provides client-side guards for UI components.
 * It prevents direct mutations to protected financial and lifecycle entities.
 * 
 * USAGE:
 * import { guardedUpdate, guardedDelete, isProtectedEntity, CommitmentActions } from '@/components/financial/financialMutationGuard';
 * 
 * // Instead of: base44.entities.BillingPool.update(id, data)
 * // Use: await guardedUpdate('BillingPool', id, data) // Will throw if not allowed
 * 
 * // For financial operations, use:
 * await CommitmentActions.allocatePool({ pool_id, commitment_id, amount });
 */

import { base44 } from '@/api/base44Client';

// Protected entities that require CommitmentService
const PROTECTED_ENTITIES = [
  'BillingPool',
  'PoolAllocation', 
  'PoolCharge',
  'PartCommitment',
  'PartPurchaseLineItem',
  'InstalledPart',
  'InvoiceBatch',
  'InvoiceBatchLine'
];

// Sensitive fields that should NEVER be directly modified from UI
// INCLUDES: Financial fields + Lifecycle-impacting fields
const SENSITIVE_FIELDS = {
  BillingPool: ['balance', 'allocated_total', 'charges_total', 'paid_amount', 'invoiced_amount', 'pool_version', 'status'],
  PoolAllocation: ['amount_allocated', 'is_reversed', 'reversed_at', 'reversed_by'],
  PoolCharge: ['amount', 'is_reversed', 'reversed_at', 'reversed_by', 'reversal_reason'],
  PartCommitment: ['covered_retail_total', 'exposure_gap', 'planned_retail_total', 'invoiced_retail_total', 'commitment_version', 'qty_committed', 'commitment_status', 'qty_cancelled', 'cancelled_at', 'cancelled_by', 'cancelled_reason'],
  PartPurchaseLineItem: ['line_total', 'status'],
  InstalledPart: ['extended_cost', 'is_reversed', 'reversed_at', 'reversed_by', 'reversal_reason', 'reversal_type', 'qty_consumed'],
  InvoiceBatch: ['status', 'total_amount', 'line_count', 'qb_export_id', 'qb_exported_at', 'qb_invoice_number', 'voided_at', 'payment_received_at', 'payment_sync_status'],
  InvoiceBatchLine: ['line_total', 'qb_status', 'qb_line_id']
};

// Fields that are safe to update from UI (non-financial, non-lifecycle)
const SAFE_UI_FIELDS = {
  BillingPool: ['notes', 'pool_name'],
  PoolAllocation: ['notes'],
  PoolCharge: ['description', 'notes'],
  PartCommitment: ['notes'],
  PartPurchaseLineItem: ['notes'],
  InstalledPart: ['notes'],
  InvoiceBatch: ['notes', 'batch_name'],
  InvoiceBatchLine: ['description', 'notes']
};

/**
 * Check if an entity is protected
 */
export function isProtectedEntity(entityName) {
  return PROTECTED_ENTITIES.includes(entityName);
}

/**
 * Check if a field is a sensitive financial/lifecycle field
 */
export function isSensitiveField(entityName, fieldName) {
  return SENSITIVE_FIELDS[entityName]?.includes(fieldName) || false;
}

/**
 * Check if a field is safe to update from UI
 */
export function isSafeField(entityName, fieldName) {
  return SAFE_UI_FIELDS[entityName]?.includes(fieldName) || false;
}

/**
 * Validate an update operation before executing
 * @throws Error if mutation is not allowed
 */
export async function validateUpdate(entityName, recordId, updates) {
  if (!isProtectedEntity(entityName)) {
    return { allowed: true };
  }

  const sensitiveAttempted = Object.keys(updates).filter(f => isSensitiveField(entityName, f));
  
  if (sensitiveAttempted.length > 0) {
    throw new Error(
      `Cannot directly modify ${entityName} sensitive fields: ${sensitiveAttempted.join(', ')}. ` +
      `Use CommitmentService actions instead.`
    );
  }

  // Call backend guard for additional validation
  try {
    const result = await base44.functions.invoke('commitmentServiceGuard', {
      action: 'validateMutation',
      entityName,
      recordId,
      updates,
      callerSource: 'ui_component'
    });

    if (!result.data?.allowed) {
      const violation = result.data?.violations?.[0];
      throw new Error(violation?.message || `Mutation to ${entityName} not allowed`);
    }

    return result.data;
  } catch (error) {
    if (error.message.includes('Cannot directly modify')) {
      throw error;
    }
    // If guard service fails, allow update but log warning
    console.warn(`Guard validation failed for ${entityName}:`, error.message);
    return { allowed: true, warning: error.message };
  }
}

/**
 * Validate a delete operation before executing
 * @throws Error if delete is not allowed
 */
export async function validateDelete(entityName, recordId) {
  if (!isProtectedEntity(entityName)) {
    return { allowed: true };
  }

  // Protected entities should never be deleted directly
  const suggestions = {
    InstalledPart: 'Use "Reverse Installation" action instead',
    PoolAllocation: 'Use "Reverse Allocation" action instead',
    PoolCharge: 'Use "Reverse Charge" action instead',
    BillingPool: 'Close the pool instead of deleting',
    PartCommitment: 'Cancel the commitment instead of deleting',
    PartPurchaseLineItem: 'Cancel the line item instead of deleting',
    InvoiceBatch: 'Void the invoice batch instead of deleting',
    InvoiceBatchLine: 'Void the invoice batch instead of deleting lines'
  };

  throw new Error(
    `Cannot delete ${entityName} records directly. ${suggestions[entityName] || 'Use the appropriate reversal action.'}`
  );
}

/**
 * Guarded update - validates before executing
 * Only allows safe field updates from UI
 */
export async function guardedUpdate(entityName, recordId, updates) {
  await validateUpdate(entityName, recordId, updates);
  
  // Filter to only safe fields if protected
  if (isProtectedEntity(entityName)) {
    const safeUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (isSafeField(entityName, key)) {
        safeUpdates[key] = value;
      }
    }
    
    if (Object.keys(safeUpdates).length === 0) {
      throw new Error(`No safe fields to update for ${entityName}. Use CommitmentService for financial updates.`);
    }
    
    return base44.entities[entityName].update(recordId, safeUpdates);
  }
  
  return base44.entities[entityName].update(recordId, updates);
}

/**
 * Guarded delete - always blocks for protected entities
 */
export async function guardedDelete(entityName, recordId) {
  await validateDelete(entityName, recordId);
  return base44.entities[entityName].delete(recordId);
}

/**
 * CommitmentService action wrapper
 * Use this for all financial operations
 */
export async function commitmentAction(action, params) {
  const result = await base44.functions.invoke('commitmentService', {
    action,
    ...params
  });
  
  if (!result.data?.success) {
    throw new Error(result.data?.error || `CommitmentService action "${action}" failed`);
  }
  
  return result.data;
}

// Export action helpers for common operations
export const CommitmentActions = {
  createPO: (params) => commitmentAction('createPO', params),
  createDeltaOrder: (params) => commitmentAction('createDeltaOrder', params),
  createBillingPool: (params) => commitmentAction('createBillingPool', params),
  allocatePool: (params) => commitmentAction('allocatePool', params),
  recordVendorInvoiceCharge: (params) => commitmentAction('recordVendorInvoiceCharge', params),
  removeCommitment: (params) => commitmentAction('removeCommitment', params),
  reduceCommitment: (params) => commitmentAction('reduceCommitment', params),
  reverseInstalledPart: (params) => commitmentAction('reverseInstalledPart', params),
  reversePoolAllocation: (params) => commitmentAction('reversePoolAllocation', params),
  reversePoolCharge: (params) => commitmentAction('reversePoolCharge', params),
  recalculatePoolBalance: (params) => commitmentAction('recalculatePoolBalance', params),
  recalculateProjectExposure: (params) => commitmentAction('recalculateProjectExposure', params),
  getOrCreateCreditPool: (params) => commitmentAction('getOrCreateCreditPool', params),
  closePool: (params) => commitmentAction('closePool', params),
  transferPoolBalance: (params) => commitmentAction('transferPoolBalance', params)
};