/**
 * Invoice Readiness Helper - Single Source of Truth
 * Phase 6.1: Centralized logic for determining if a commitment is invoice-ready
 * 
 * Used by:
 * - InvoiceWorkbench (filtering invoice-ready items)
 * - createInvoiceBatch (validation gate)
 * 
 * Criteria:
 * 1. qty > 0
 * 2. Has retail price (unit_retail or unit_retail_override or retail_matrix_price)
 * 3. Not already linked to an InvoiceBatchLine (billing_status !== 'invoiced' && !== 'paid')
 * 4. Not archived
 * 5. Not a non-billable part type
 */

/**
 * Check if a commitment is ready for invoicing
 * @param {Object} commitment - The commitment object
 * @param {Object} options - Optional overrides for checking
 * @returns {{ ready: boolean, reasons: string[] }}
 */
export function isInvoiceReady(commitment, options = {}) {
  const reasons = [];
  
  if (!commitment) {
    return { ready: false, reasons: ['No commitment provided'] };
  }

  // 1. Check quantity
  const qty = commitment.required_total || commitment.assigned_qty || commitment.qty || 0;
  if (qty <= 0) {
    reasons.push('Quantity must be greater than 0');
  }

  // 2. Check retail pricing exists
  const hasRetailPrice = Boolean(
    (commitment.unit_retail && commitment.unit_retail > 0) ||
    (commitment.unit_retail_override && commitment.unit_retail_override > 0) ||
    (commitment.retail_matrix_price && commitment.retail_matrix_price > 0) ||
    (commitment.unit_price && commitment.unit_price > 0) // fallback for line items
  );
  
  if (!hasRetailPrice) {
    reasons.push('Missing retail pricing');
  }

  // 3. Check not already invoiced/paid
  const billingStatus = commitment.billing_status || commitment.client_billing_status;
  if (billingStatus === 'invoiced' || billingStatus === 'paid') {
    reasons.push('Already invoiced or paid');
  }

  // 4. Check if already linked to InvoiceBatchLine (via invoice_batch_line_id)
  if (commitment.invoice_batch_line_id) {
    reasons.push('Already linked to an invoice batch');
  }

  // 5. Check archived status
  if (commitment.is_archived) {
    reasons.push('Part is archived');
  }

  // 6. Check financial role (non-billable parts)
  if (commitment.financial_role === 'NON_BILLABLE') {
    reasons.push('Part is marked non-billable');
  }

  // 7. Check part type for client-supplied without billing
  if (commitment.effective_part_type === 'CLIENT_SUPPLIED' && commitment.requires_client_billing === false) {
    reasons.push('Client-supplied part not billable');
  }

  return {
    ready: reasons.length === 0,
    reasons,
  };
}

/**
 * Get the effective retail price for a commitment
 * Priority: unit_retail_override > unit_retail > retail_matrix_price
 * @param {Object} commitment
 * @returns {number}
 */
export function getEffectiveRetailPrice(commitment) {
  if (!commitment) return 0;
  
  return commitment.unit_retail_override ||
         commitment.unit_retail ||
         commitment.retail_matrix_price ||
         commitment.unit_price ||
         0;
}

/**
 * Filter an array of commitments to only invoice-ready items
 * @param {Array} commitments
 * @returns {Array} - Only invoice-ready commitments
 */
export function filterInvoiceReady(commitments) {
  if (!Array.isArray(commitments)) return [];
  return commitments.filter(c => isInvoiceReady(c).ready);
}

/**
 * Summarize invoice readiness for a batch of commitments
 * @param {Array} commitments
 * @returns {{ ready: number, blocked: number, blockedReasons: Object }}
 */
export function summarizeInvoiceReadiness(commitments) {
  if (!Array.isArray(commitments)) {
    return { ready: 0, blocked: 0, blockedReasons: {} };
  }

  const blockedReasons = {};
  let ready = 0;
  let blocked = 0;

  for (const c of commitments) {
    const result = isInvoiceReady(c);
    if (result.ready) {
      ready++;
    } else {
      blocked++;
      for (const reason of result.reasons) {
        blockedReasons[reason] = (blockedReasons[reason] || 0) + 1;
      }
    }
  }

  return { ready, blocked, blockedReasons };
}

export default {
  isInvoiceReady,
  getEffectiveRetailPrice,
  filterInvoiceReady,
  summarizeInvoiceReadiness,
};