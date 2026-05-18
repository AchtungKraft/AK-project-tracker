/**
 * deriveCanonicalInvoiceState — SINGLE canonical reconciliation layer
 *
 * This is the ONE function ALL financial views must use for invoice truth.
 * Derives ONLY from ProjectInvoice entity records.
 *
 * NO procurement snapshots.
 * NO commitment.invoiced_amount.
 * NO local frontend math outside this function.
 *
 * USAGE:
 *   import { deriveCanonicalInvoiceState } from '@/components/financial/deriveCanonicalInvoiceState';
 *   const state = deriveCanonicalInvoiceState({ invoices, projectedRevenue });
 */

const ACTIVE_STATUSES = new Set(['sent', 'partial', 'paid', 'overdue']);
const VOID_STATUSES = new Set(['void', 'cancelled']);
const DRAFT_STATUSES = new Set(['draft']);

/**
 * Resolve effective status from invoice record (handles partial payments, overdue)
 */
function resolveEffectiveStatus(invoice) {
  const status = invoice.status || 'draft';
  if (VOID_STATUSES.has(status)) return status;
  if (status === 'paid') return 'paid';

  const total = invoice.total ?? invoice.subtotal ?? 0;
  const paid = invoice.paid_amount ?? 0;

  if (total > 0 && paid >= total - 0.01) return 'paid';
  if (paid > 0 && (total - paid) > 0.01) return 'partial';

  if (invoice.due_date && ACTIVE_STATUSES.has(status)) {
    const due = new Date(invoice.due_date);
    if (new Date() > due && (total - paid) > 0.01) return 'overdue';
  }

  return status;
}

/**
 * deriveCanonicalInvoiceState
 *
 * @param {Object} params
 * @param {Array}  params.invoices - ProjectInvoice entity records
 * @param {number} params.projectedRevenue - Total planned revenue (parts retail + services billable)
 * @param {number} params.operationalCost - Optional: operational cost for "needs billing" calculation
 * @returns {Object} Canonical invoice state — the ONLY source of billing truth
 */
export function deriveCanonicalInvoiceState({
  invoices = [],
  projectedRevenue = 0,
  operationalCost = 0,
}) {
  // Classify invoices
  const enriched = invoices.map(inv => {
    const effectiveStatus = resolveEffectiveStatus(inv);
    const invoiceTotal = inv.total ?? inv.subtotal ?? 0;
    const invoicePaid = inv.paid_amount ?? 0;
    // CANONICAL: Always compute balance from total - paid. Entity balance_due may be stale.
    const invoiceBalance = Math.max(0, invoiceTotal - invoicePaid);
    return { ...inv, effectiveStatus, invoiceTotal, invoicePaid, invoiceBalance };
  });

  const active = enriched.filter(inv =>
    !VOID_STATUSES.has(inv.effectiveStatus) && !DRAFT_STATUSES.has(inv.effectiveStatus)
  );
  const drafts = enriched.filter(inv => DRAFT_STATUSES.has(inv.effectiveStatus));
  const voided = enriched.filter(inv => VOID_STATUSES.has(inv.effectiveStatus));

  // ═══════════════════════════════════════════════════════════════
  // CORE INVOICE METRICS — derived ONLY from invoice records
  // ═══════════════════════════════════════════════════════════════
  let invoicedAmount = 0;
  let paidAmount = 0;
  let outstandingAmount = 0;

  for (const inv of active) {
    invoicedAmount += inv.invoiceTotal;
    paidAmount += inv.invoicePaid;
    outstandingAmount += inv.invoiceBalance;
  }

  const remainingToBill = Math.max(0, projectedRevenue - invoicedAmount);

  // "Needs Billing" = operational costs incurred but NOT yet covered by ANY invoice
  // This is NOT "invoice unpaid". This is "work done, no invoice exists yet."
  const uninvoicedOperationalCost = Math.max(0, operationalCost - invoicedAmount);

  // ═══════════════════════════════════════════════════════════════
  // INVOICE COUNTS
  // ═══════════════════════════════════════════════════════════════
  const paidInvoices = active.filter(inv => inv.effectiveStatus === 'paid');
  const unpaidInvoices = active.filter(inv => inv.effectiveStatus !== 'paid');
  const overdueInvoices = active.filter(inv => inv.effectiveStatus === 'overdue');
  const partialInvoices = active.filter(inv => inv.effectiveStatus === 'partial');

  // ═══════════════════════════════════════════════════════════════
  // INVOICE STATUS — single health indicator
  // ═══════════════════════════════════════════════════════════════
  let invoiceStatus;
  if (overdueInvoices.length > 0) invoiceStatus = 'overdue';
  else if (outstandingAmount > 0.01) invoiceStatus = 'outstanding';
  else if (invoicedAmount > 0 && remainingToBill < 0.01) invoiceStatus = 'fully_billed';
  else if (invoicedAmount > 0) invoiceStatus = 'partially_billed';
  else invoiceStatus = 'not_billed';

  // ═══════════════════════════════════════════════════════════════
  // QB SYNC STATE
  // ═══════════════════════════════════════════════════════════════
  const qbSyncState = {
    exported: enriched.filter(inv => inv.qb_exported || inv.qb_invoice_number).length,
    pending: active.filter(inv => !inv.qb_exported && !inv.qb_invoice_number).length,
    total: active.length,
    synced: active.every(inv => inv.qb_exported || inv.qb_invoice_number),
  };

  return {
    // ── Core metrics (the ONLY source) ──
    invoicedAmount,
    paidAmount,
    outstandingAmount,
    remainingToBill,
    uninvoicedOperationalCost,

    // ── Counts ──
    invoiceCount: active.length,
    paidInvoiceCount: paidInvoices.length,
    openInvoiceCount: unpaidInvoices.length,
    overdueCount: overdueInvoices.length,
    partialCount: partialInvoices.length,
    draftCount: drafts.length,

    // ── Flags ──
    hasOutstandingBalance: outstandingAmount > 0.01,
    needsBilling: uninvoicedOperationalCost > 0.01,
    isFullyBilled: invoicedAmount > 0 && remainingToBill < 0.01,
    isFullyPaid: invoicedAmount > 0 && outstandingAmount < 0.01,

    // ── Status ──
    invoiceStatus,

    // ── QB Sync ──
    qbSyncState,

    // ── Projected context ──
    projectedRevenue,
    billingRatio: projectedRevenue > 0 ? (invoicedAmount / projectedRevenue) * 100 : 0,
    paidRatio: invoicedAmount > 0 ? (paidAmount / invoicedAmount) * 100 : 0,

    // ── Raw for downstream ──
    _invoices: enriched,
    _active: active,
    _drafts: drafts,
    _voided: voided,
  };
}

/**
 * INVOICE STATUS DISPLAY CONFIG
 */
export const INVOICE_STATUS_CONFIG = {
  fully_billed: { label: 'Fully Billed', color: 'text-emerald-400', bg: 'bg-emerald-900/20 border-emerald-700/30' },
  partially_billed: { label: 'Partially Billed', color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-700/30' },
  not_billed: { label: 'Not Yet Billed', color: 'text-gray-400', bg: 'bg-gray-900/30 border-gray-700/30' },
  outstanding: { label: 'Unpaid Invoices', color: 'text-amber-400', bg: 'bg-amber-900/20 border-amber-700/30' },
  overdue: { label: 'Overdue', color: 'text-red-400', bg: 'bg-red-900/20 border-red-700/30' },
};