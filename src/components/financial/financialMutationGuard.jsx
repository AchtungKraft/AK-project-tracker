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
  'InvoiceBatchLine',
  'Part' // Added for cost field protection
];

// Sensitive fields that should NEVER be directly modified from UI
// INCLUDES: Financial fields + Lifecycle-impacting fields + Cost fields (ADMIN ONLY)
const SENSITIVE_FIELDS = {
  BillingPool: ['balance', 'allocated_total', 'charges_total', 'paid_amount', 'invoiced_amount', 'pool_version', 'status'],
  PoolAllocation: ['amount_allocated', 'is_reversed', 'reversed_at', 'reversed_by'],
  PoolCharge: ['amount', 'is_reversed', 'reversed_at', 'reversed_by', 'reversal_reason'],
  PartCommitment: ['covered_retail_total', 'exposure_gap', 'planned_retail_total', 'planned_cost_total', 'invoiced_retail_total', 'commitment_version', 'qty_committed', 'commitment_status', 'qty_cancelled', 'cancelled_at', 'cancelled_by', 'cancelled_reason', 'unit_cost_snapshot', 'unit_retail_snapshot', 'actual_unit_cost', 'actual_extended_cost'],
  PartPurchaseLineItem: ['unit_cost', 'extended_cost', 'line_total', 'status', 'unit_price', 'cost_source_reference'],
  InstalledPart: ['extended_cost', 'is_reversed', 'reversed_at', 'reversed_by', 'reversal_reason', 'reversal_type', 'qty_consumed'],
  InvoiceBatch: ['status', 'total_amount', 'line_count', 'qb_export_id', 'qb_exported_at', 'qb_invoice_number', 'voided_at', 'payment_received_at', 'payment_sync_status'],
  InvoiceBatchLine: ['line_total', 'qb_status', 'qb_line_id'],
  Part: ['cost', 'default_cost', 'is_cost_verified', 'needs_cost_review', 'cost_source', 'last_cost_update_at', 'last_cost_update_by']
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
  InvoiceBatchLine: ['description', 'notes'],
  Part: ['part_name', 'vendor_part_number', 'notes', 'photos', 'featured_photo', 'order_url', 'retail_matrix_price', 'retail_override', 'default_retail', 'pricing_mode', 'applied_markup_pct', 'reorder_point', 'reorder_quantity', 'is_active', 'part_type', 'is_archived', 'archived_at', 'archived_by', 'archive_reason', 'archived_context', 'requires_vendor_purchase', 'requires_vendor_payment', 'requires_client_billing', 'affects_inventory', 'affects_margin', 'is_asset_recovery', 'production_cost', 'handling_fee', 'resale_value', 'car_make_id', 'car_model_id', 'car_year_id', 'part_category_id', 'default_vendor_id']
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
export async function validateUpdate(entityName, recordId, updates, userRole = null) {
  if (!isProtectedEntity(entityName)) {
    return { allowed: true };
  }

  const sensitiveAttempted = Object.keys(updates).filter(f => isSensitiveField(entityName, f));
  
  // Special handling for Part cost fields - requires admin role
  const partCostFields = ['cost', 'default_cost', 'is_cost_verified', 'needs_cost_review', 'cost_source', 'last_cost_update_at', 'last_cost_update_by'];
  if (entityName === 'Part') {
    const costFieldsAttempted = sensitiveAttempted.filter(f => partCostFields.includes(f));
    if (costFieldsAttempted.length > 0) {
      if (userRole !== 'admin') {
        throw new Error(
          `Part cost fields can only be modified by administrators. ` +
          `Contact an admin to update: ${costFieldsAttempted.join(', ')}`
        );
      }
      // Admin can update cost - filter out cost fields for remaining check
      const nonCostSensitive = sensitiveAttempted.filter(f => !partCostFields.includes(f));
      if (nonCostSensitive.length === 0) {
        return { allowed: true, adminCostUpdate: true };
      }
    }
  }
  
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