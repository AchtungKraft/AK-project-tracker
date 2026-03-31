/**
 * billingStatusTransitions.js - Centralized Billing Status Mutations
 * 
 * PHASE 10: Canonical Billing Status Transitions
 * 
 * This is the ONLY module that should modify PartCommitment.billing_status.
 * All other code must call these helpers instead of directly updating billing_status.
 * 
 * CANONICAL BILLING STATES:
 * - 'unbilled' (default) - Not yet invoiced
 * - 'invoiced' - Invoice sent, awaiting payment
 * - 'paid' - Payment received
 * 
 * ENFORCEMENT:
 * - Supply flows (executeSupplyAction) MUST NOT call these functions
 * - Only invoice workflows (createInvoiceBatch, updatePaymentStatus) may call these
 */

import { base44 } from "@/api/base44Client";

// ============================================
// CANONICAL BILLING STATUS ENUM
// ============================================

export const CANONICAL_BILLING_STATUS = {
  UNBILLED: 'unbilled',
  INVOICED: 'invoiced',
  PAID: 'paid',
};

// ============================================
// VALIDATION
// ============================================

/**
 * Validate that a billing_status value is canonical
 */
export function isCanonicalBillingStatus(status) {
  return Object.values(CANONICAL_BILLING_STATUS).includes(status);
}

/**
 * Normalize legacy billing_status to canonical value
 * Use this for read-side normalization only
 */
export function normalizeToCanonical(rawStatus) {
  if (!rawStatus) return CANONICAL_BILLING_STATUS.UNBILLED;
  
  const status = rawStatus.toLowerCase().trim();
  
  // Already canonical
  if (isCanonicalBillingStatus(status)) {
    return status;
  }
  
  // PAID states
  if (['client_paid'].includes(status)) {
    return CANONICAL_BILLING_STATUS.PAID;
  }
  
  // INVOICED states
  if (['awaiting_pay', 'awaiting_payment', 'sent', 'client_invoiced'].includes(status)) {
    return CANONICAL_BILLING_STATUS.INVOICED;
  }
  
  // Everything else maps to UNBILLED (including 'billable', 'not_billable', 'not_invoiced')
  return CANONICAL_BILLING_STATUS.UNBILLED;
}

// ============================================
// BILLING STATUS TRANSITIONS (WRITE OPERATIONS)
// ============================================

/**
 * Set commitment to UNBILLED status
 * Use case: Voiding an invoice, reverting invoiced status
 * 
 * @param {string} commitment_id 
 * @param {Object} options - { reason?: string, actor_email?: string }
 * @returns {Promise<{success: boolean, commitment_id: string}>}
 */
export async function setUnbilled(commitment_id, options = {}) {
  const { reason, actor_email } = options;
  
  await base44.entities.PartCommitment.update(commitment_id, {
    billing_status: CANONICAL_BILLING_STATUS.UNBILLED,
  });
  
  console.log(`[BillingTransition] ${commitment_id} → UNBILLED by ${actor_email || 'system'}. Reason: ${reason || 'none'}`);
  
  return { success: true, commitment_id, new_status: CANONICAL_BILLING_STATUS.UNBILLED };
}

/**
 * Set commitment to INVOICED status
 * Use case: Creating/sending invoice batch
 * 
 * @param {string} commitment_id 
 * @param {string} invoice_batch_id - Reference to InvoiceBatch
 * @param {Object} options - { actor_email?: string }
 * @returns {Promise<{success: boolean, commitment_id: string}>}
 */
export async function setInvoiced(commitment_id, invoice_batch_id, options = {}) {
  const { actor_email } = options;
  
  if (!invoice_batch_id) {
    console.warn(`[BillingTransition] setInvoiced called without invoice_batch_id for ${commitment_id}`);
  }
  
  await base44.entities.PartCommitment.update(commitment_id, {
    billing_status: CANONICAL_BILLING_STATUS.INVOICED,
  });
  
  console.log(`[BillingTransition] ${commitment_id} → INVOICED by ${actor_email || 'system'}. Batch: ${invoice_batch_id}`);
  
  return { success: true, commitment_id, new_status: CANONICAL_BILLING_STATUS.INVOICED, invoice_batch_id };
}

/**
 * Set commitment to PAID status
 * Use case: Recording payment received
 * 
 * @param {string} commitment_id 
 * @param {string} invoice_batch_id - Reference to InvoiceBatch
 * @param {Object} options - { payment_reference?: string, actor_email?: string }
 * @returns {Promise<{success: boolean, commitment_id: string}>}
 */
export async function setPaid(commitment_id, invoice_batch_id, options = {}) {
  const { payment_reference, actor_email } = options;
  
  await base44.entities.PartCommitment.update(commitment_id, {
    billing_status: CANONICAL_BILLING_STATUS.PAID,
  });
  
  console.log(`[BillingTransition] ${commitment_id} → PAID by ${actor_email || 'system'}. Batch: ${invoice_batch_id}, Ref: ${payment_reference || 'none'}`);
  
  return { success: true, commitment_id, new_status: CANONICAL_BILLING_STATUS.PAID, invoice_batch_id, payment_reference };
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Set multiple commitments to INVOICED status
 * @param {string[]} commitment_ids 
 * @param {string} invoice_batch_id 
 * @param {Object} options 
 */
export async function bulkSetInvoiced(commitment_ids, invoice_batch_id, options = {}) {
  const results = [];
  for (const id of commitment_ids) {
    try {
      const result = await setInvoiced(id, invoice_batch_id, options);
      results.push(result);
    } catch (error) {
      results.push({ success: false, commitment_id: id, error: error.message });
    }
  }
  return results;
}

/**
 * Set multiple commitments to PAID status
 * @param {string[]} commitment_ids 
 * @param {string} invoice_batch_id 
 * @param {Object} options 
 */
export async function bulkSetPaid(commitment_ids, invoice_batch_id, options = {}) {
  const results = [];
  for (const id of commitment_ids) {
    try {
      const result = await setPaid(id, invoice_batch_id, options);
      results.push(result);
    } catch (error) {
      results.push({ success: false, commitment_id: id, error: error.message });
    }
  }
  return results;
}

// ============================================
// DEV MODE GUARD
// ============================================

/**
 * Dev-only validator to detect billing_status drift
 * Call this in useProjectInvoiceView to warn on non-canonical values
 */
export function warnOnNonCanonicalStatus(commitments, source = 'unknown') {
  if (!import.meta.env.DEV) return;
  
  const nonCanonical = commitments.filter(c => !isCanonicalBillingStatus(c.billing_status));
  
  if (nonCanonical.length > 0) {
    console.warn(
      `[BILLING_DRIFT_WARNING] ${nonCanonical.length} commitments have non-canonical billing_status in ${source}:`,
      nonCanonical.map(c => ({ id: c.id, status: c.billing_status }))
    );
  }
}