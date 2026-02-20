/**
 * Financial Model Guard - Forward-Only Write Protection
 * 
 * This module provides helper functions to check project financial model version
 * and block legacy financial writes for forward-model projects.
 * 
 * LEGACY FIELDS (blocked for forward projects):
 * - Order.billing_status
 * - PartCommitment.billing_status (except 'billable' initial default)
 * - PartPurchaseLineItem.billing_status_override
 * - BillingPool.*, PoolAllocation.*, PoolCharge.*
 * - VendorInvoice.*, VendorPayment.*
 * 
 * For forward projects, billing state is derived ONLY from InvoiceBatch (ClientInvoice).
 */

/**
 * Check if project uses forward financial model
 * @param {object} project - Project record
 * @returns {boolean}
 */
export function isForwardFinancialModel(project) {
  // New projects default to 'forward', existing without the field are 'legacy'
  return project?.financial_model_version === 'forward';
}

/**
 * Check if project uses legacy financial model
 * @param {object} project - Project record  
 * @returns {boolean}
 */
export function isLegacyFinancialModel(project) {
  // Explicitly legacy, or undefined (pre-migration projects)
  return !project?.financial_model_version || project.financial_model_version === 'legacy';
}

/**
 * Guard function - throws error if attempting legacy write on forward project
 * @param {object} project - Project record
 * @param {string} operation - Description of operation being attempted
 * @throws {Error} If legacy write blocked
 */
export function guardLegacyWrite(project, operation) {
  if (isForwardFinancialModel(project)) {
    throw new Error(
      `LEGACY_FINANCIAL_WRITE_BLOCKED: ${operation} is not allowed for forward financial model projects. ` +
      `Project '${project.name}' (${project.id}) uses financial_model_version='forward'. ` +
      `Use ClientInvoice (InvoiceBatch) for billing status instead.`
    );
  }
}

/**
 * Guard for billing_status field writes
 */
export function guardBillingStatusWrite(project, entityType, newValue) {
  if (isForwardFinancialModel(project)) {
    // Allow initial 'billable' status on commitment creation
    if (entityType === 'PartCommitment' && newValue === 'billable') {
      return; // Allowed
    }
    throw new Error(
      `LEGACY_FINANCIAL_WRITE_BLOCKED: Writing billing_status='${newValue}' to ${entityType} ` +
      `is not allowed for forward financial model projects.`
    );
  }
}

/**
 * Guard for pool-related entity creation
 */
export function guardPoolWrite(project, entityType) {
  if (isForwardFinancialModel(project)) {
    throw new Error(
      `LEGACY_FINANCIAL_WRITE_BLOCKED: Creating/updating ${entityType} ` +
      `is not allowed for forward financial model projects. ` +
      `Pools are deprecated in the forward model.`
    );
  }
}

/**
 * Guard for vendor invoice/payment entity creation
 */
export function guardVendorInvoiceWrite(project, entityType) {
  if (isForwardFinancialModel(project)) {
    throw new Error(
      `LEGACY_FINANCIAL_WRITE_BLOCKED: Creating/updating ${entityType} ` +
      `is not allowed for forward financial model projects. ` +
      `Vendor invoices are not required in the forward model (PO = paid at order).`
    );
  }
}

/**
 * Get billing status for display - resolves from correct source based on model
 * @param {object} project - Project record
 * @param {object} commitment - Commitment record  
 * @param {object} invoiceBatchLine - InvoiceBatchLine if exists
 * @param {object} invoiceBatch - InvoiceBatch (ClientInvoice) if exists
 * @returns {string} Normalized billing status
 */
export function resolveDisplayBillingStatus(project, commitment, invoiceBatchLine, invoiceBatch) {
  if (isForwardFinancialModel(project)) {
    // Forward model: derive ONLY from ClientInvoice (InvoiceBatch)
    if (!invoiceBatchLine || !invoiceBatch) {
      return 'NOT_INVOICED';
    }
    
    // Map InvoiceBatch.status to billing status
    switch (invoiceBatch.status) {
      case 'paid':
        return 'PAID';
      case 'invoiced':
      case 'exported':
      case 'sent':
        return 'INVOICED';
      case 'voided':
        return 'VOIDED';
      default:
        return 'NOT_INVOICED';
    }
  } else {
    // Legacy model: use commitment.billing_status
    if (!commitment?.billing_status) {
      return 'NOT_INVOICED';
    }
    
    const statusMap = {
      'not_billable': 'NOT_BILLABLE',
      'billable': 'NOT_INVOICED',
      'invoiced': 'INVOICED',
      'paid': 'PAID',
    };
    
    return statusMap[commitment.billing_status.toLowerCase()] || 'NOT_INVOICED';
  }
}

export default {
  isForwardFinancialModel,
  isLegacyFinancialModel,
  guardLegacyWrite,
  guardBillingStatusWrite,
  guardPoolWrite,
  guardVendorInvoiceWrite,
  resolveDisplayBillingStatus,
};