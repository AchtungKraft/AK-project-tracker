/**
 * CANONICAL SUPPLY FLOW ENFORCED
 * All project part mutations must go through CommitmentService.
 * Direct entity writes are blocked.
 * 
 * Financial Mutation Guard - Client-Side Enforcement
 * 
 * This module provides client-side guards for UI components.
 * It prevents direct mutations to protected financial and lifecycle entities.
 * 
 * FORWARD MODEL GUARDRAILS:
 * Forward model projects (financial_model_version='forward') CANNOT use:
 * - BillingPool / PoolAllocation / PoolCharge (pool-based billing)
 * - VendorInvoice / VendorPayment (vendor invoice tracking)
 * - Direct commitment billing_status writes
 * 
 * Forward model uses ONLY:
 * - InvoiceBatch / InvoiceBatchLine for client billing
 * - PO header for freight/tariff
 * - Derived billing status from batch status
 * 
 * USAGE:
 * import { guardedUpdate, guardedDelete, isProtectedEntity, CommitmentActions, blockLegacyCreate, assertNotForwardModel } from '@/components/financial/financialMutationGuard';
 * 
 * // Instead of: base44.entities.BillingPool.update(id, data)
 * // Use: await guardedUpdate('BillingPool', id, data) // Will throw if not allowed
 * 
 * // For financial operations, use:
 * await CommitmentActions.allocatePool({ pool_id, commitment_id, amount });
 * 
 * // For forward model guard:
 * assertNotForwardModel(project, 'createPool'); // Throws if forward model
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

// FROZEN entities - NO creates allowed from UI
const FROZEN_ENTITIES = [
  'PartBuildAssignment',  // DEPRECATED: Use PartCommitment
];

// SOFT FROZEN entities - creates only via CommitmentService
const SOFT_FROZEN_ENTITIES = [
  'PartProjectRequirement', // Only CommitmentService can create (for migration/planning artifacts)
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
  Part: ['part_name', 'vendor_part_number', 'category', 'notes', 'photos', 'featured_photo', 'order_url', 'retail_matrix_price', 'retail_override', 'default_retail', 'pricing_mode', 'applied_markup_pct', 'reorder_point', 'reorder_quantity', 'is_active', 'part_type', 'is_archived', 'archived_at', 'archived_by', 'archive_reason', 'archived_context', 'requires_vendor_purchase', 'requires_vendor_payment', 'requires_client_billing', 'affects_inventory', 'affects_margin', 'is_asset_recovery', 'production_cost', 'handling_fee', 'resale_value', 'car_make_id', 'car_model_id', 'car_year_id', 'part_category_id', 'default_vendor_id']
};

/**
 * Check if an entity is protected
 */
export function isProtectedEntity(entityName) {
  return PROTECTED_ENTITIES.includes(entityName);
}

/**
 * Check if an entity is frozen (no creates allowed)
 */
export function isFrozenEntity(entityName) {
  return FROZEN_ENTITIES.includes(entityName);
}

/**
 * Check if an entity is soft-frozen (creates only via CommitmentService)
 */
export function isSoftFrozenEntity(entityName) {
  return SOFT_FROZEN_ENTITIES.includes(entityName);
}

/**
 * Block legacy entity creation - throws error for frozen entities
 * Call this BEFORE any direct .create() call on legacy entities
 * @throws Error if entity is frozen
 */
export function blockLegacyCreate(entityName, callerSurface = 'unknown') {
  if (isFrozenEntity(entityName)) {
    throw new Error(
      `Direct mutation blocked: ${entityName} is deprecated and locked. ` +
      `Use CommitmentService.addPartToProject instead. (caller: ${callerSurface})`
    );
  }
  
  if (isSoftFrozenEntity(entityName)) {
    throw new Error(
      `Direct mutation blocked: ${entityName} creates must go through CommitmentService. ` +
      `Use CommitmentService.addPartToProject instead. (caller: ${callerSurface})`
    );
  }
}

// ============================================
// FORWARD MODEL GUARDRAILS
// ============================================

// Entities that are LEGACY-ONLY (blocked for forward model projects)
const LEGACY_ONLY_ENTITIES = [
  'BillingPool',
  'PoolAllocation',
  'PoolCharge',
  'VendorInvoice',
  'VendorInvoiceLineItem',
  'VendorPayment',
];

// Operations that are LEGACY-ONLY
const LEGACY_ONLY_OPERATIONS = [
  'createPool',
  'allocatePool',
  'createPoolCharge',
  'createVendorInvoice',
  'updateVendorPayment',
  'directCommitmentBillingStatusWrite',
];

/**
 * Check if an entity is legacy-only (not available for forward model)
 */
export function isLegacyOnlyEntity(entityName) {
  return LEGACY_ONLY_ENTITIES.includes(entityName);
}

/**
 * Assert that a project is NOT using the forward financial model
 * Throws LEGACY_FLOW_BLOCKED error if project is forward model
 * 
 * @param {Object} project - Project object with financial_model_version
 * @param {string} operation - Name of the operation being attempted
 * @throws Error with code LEGACY_FLOW_BLOCKED if forward model
 */
export function assertNotForwardModel(project, operation) {
  if (project?.financial_model_version === 'forward') {
    const error = new Error(
      `LEGACY_FLOW_BLOCKED: This flow is legacy-only and not available in forward financial model projects. ` +
      `Operation: ${operation}. ` +
      `Forward model uses InvoiceBatch for client billing.`
    );
    error.code = 'LEGACY_FLOW_BLOCKED';
    throw error;
  }
}

/**
 * Assert that an entity can be created/updated for the given project
 * Throws if entity is legacy-only and project is forward model
 * 
 * @param {string} entityName - Entity being mutated
 * @param {Object} project - Project object with financial_model_version
 * @throws Error with code LEGACY_FLOW_BLOCKED if blocked
 */
export function assertEntityAllowedForProject(entityName, project) {
  if (isLegacyOnlyEntity(entityName) && project?.financial_model_version === 'forward') {
    const error = new Error(
      `LEGACY_FLOW_BLOCKED: ${entityName} is a legacy-only entity and cannot be used in forward financial model projects. ` +
      `Forward model uses InvoiceBatch for client billing.`
    );
    error.code = 'LEGACY_FLOW_BLOCKED';
    throw error;
  }
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
 * Validate Part creation has required category
 * @throws Error if Part.category is missing or empty on create
 */
export function validatePartCreate(data) {
  if (!data.category || (typeof data.category === 'string' && data.category.trim() === '')) {
    throw new Error('Part.category is required. Please provide a category for this part.');
  }
}

/**
 * Validate Part category is not empty
 * @throws Error if Part.category is empty
 */
function validatePartCategory(entityName, data) {
  if (entityName === 'Part') {
    // Check if category is being set to empty/null
    if (data.hasOwnProperty('category')) {
      if (!data.category || (typeof data.category === 'string' && data.category.trim() === '')) {
        throw new Error('Part.category is required and cannot be empty.');
      }
    }
  }
}

/**
 * Validate an update operation before executing
 * @throws Error if mutation is not allowed
 */
export async function validateUpdate(entityName, recordId, updates, userRole = null) {
  // Validate Part category constraint
  validatePartCategory(entityName, updates);
  
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

/**
 * Guarded legacy action - wraps legacy operations with forward model check
 * Throws LEGACY_FLOW_BLOCKED if project is forward model
 * 
 * @param {string} actionName - Action being performed
 * @param {Object} params - Action parameters (must include project or project_id)
 * @param {Function} actionFn - The actual action function to execute
 */
async function guardedLegacyAction(actionName, params, actionFn) {
  // If project object is passed, check directly
  if (params.project?.financial_model_version === 'forward') {
    const error = new Error(
      `LEGACY_FLOW_BLOCKED: This flow is legacy-only and not available in forward financial model projects. ` +
      `Operation: ${actionName}. Use InvoiceBatch for client billing.`
    );
    error.code = 'LEGACY_FLOW_BLOCKED';
    throw error;
  }
  
  // If only project_id passed, the backend will validate
  return actionFn();
}

// Export action helpers for common operations
export const CommitmentActions = {
  // CANONICAL ENTRY POINT for adding parts to projects
  addPartToProject: (params) => commitmentAction('addPartToProject', params),
  createPO: (params) => commitmentAction('createPO', params),
  createDeltaOrder: (params) => commitmentAction('createDeltaOrder', params),
  
  // LEGACY-ONLY: Pool operations (blocked for forward model)
  createBillingPool: (params) => guardedLegacyAction(
    'createBillingPool', 
    params, 
    () => commitmentAction('createBillingPool', params)
  ),
  allocatePool: (params) => guardedLegacyAction(
    'allocatePool', 
    params, 
    () => commitmentAction('allocatePool', params)
  ),
  recordVendorInvoiceCharge: (params) => guardedLegacyAction(
    'recordVendorInvoiceCharge', 
    params, 
    () => commitmentAction('recordVendorInvoiceCharge', params)
  ),
  reversePoolAllocation: (params) => guardedLegacyAction(
    'reversePoolAllocation', 
    params, 
    () => commitmentAction('reversePoolAllocation', params)
  ),
  reversePoolCharge: (params) => guardedLegacyAction(
    'reversePoolCharge', 
    params, 
    () => commitmentAction('reversePoolCharge', params)
  ),
  recalculatePoolBalance: (params) => guardedLegacyAction(
    'recalculatePoolBalance', 
    params, 
    () => commitmentAction('recalculatePoolBalance', params)
  ),
  recalculateProjectExposure: (params) => guardedLegacyAction(
    'recalculateProjectExposure', 
    params, 
    () => commitmentAction('recalculateProjectExposure', params)
  ),
  getOrCreateCreditPool: (params) => guardedLegacyAction(
    'getOrCreateCreditPool', 
    params, 
    () => commitmentAction('getOrCreateCreditPool', params)
  ),
  closePool: (params) => guardedLegacyAction(
    'closePool', 
    params, 
    () => commitmentAction('closePool', params)
  ),
  transferPoolBalance: (params) => guardedLegacyAction(
    'transferPoolBalance', 
    params, 
    () => commitmentAction('transferPoolBalance', params)
  ),
  
  // Non-legacy operations (available for all models)
  removeCommitment: (params) => commitmentAction('removeCommitment', params),
  reduceCommitment: (params) => commitmentAction('reduceCommitment', params),
  reverseInstalledPart: (params) => commitmentAction('reverseInstalledPart', params),
};