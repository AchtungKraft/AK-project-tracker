/**
 * deriveBillingLedger — CANONICAL billing truth layer
 *
 * ALL billing metrics derive ONLY from actual ProjectInvoice records.
 * Operational state (installed parts, completed services, lifecycle) NEVER
 * determines billing totals.
 *
 * RULES:
 *   invoicedRevenue  = sum(invoice.total) for non-void/cancelled invoices
 *   paidRevenue      = sum(invoice.paid_amount)
 *   outstandingRevenue = invoicedRevenue - paidRevenue
 *   remainingToBill  = projectedRevenue - invoicedRevenue
 *
 * ACCOUNTING MODE:
 *   ACCRUAL (default): realizedRevenue = invoicedRevenue
 *   CASH:              realizedRevenue = paidRevenue
 */

const ACCOUNTING_MODE = 'ACCRUAL';

// Invoice statuses considered "active" (not voided/cancelled)
const ACTIVE_STATUSES = new Set(['sent', 'partial', 'paid', 'overdue']);
const DRAFT_STATUSES = new Set(['draft']);
const VOID_STATUSES = new Set(['void', 'cancelled']);

/**
 * Derive aging bucket for an invoice based on due_date
 */
function getAgingBucket(invoice) {
  if (!invoice.due_date || invoice.status === 'paid') return null;
  const due = new Date(invoice.due_date);
  const now = new Date();
  const daysPastDue = Math.floor((now - due) / (1000 * 60 * 60 * 24));
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return '0_30';
  if (daysPastDue <= 60) return '31_60';
  if (daysPastDue <= 90) return '61_90';
  return '90_plus';
}

/**
 * Normalize an invoice's effective status based on payment state.
 * The entity status might say "sent" but if partial payment exists, it's "partial".
 */
function resolveEffectiveStatus(invoice) {
  const status = invoice.status || 'draft';
  if (VOID_STATUSES.has(status)) return status;
  if (status === 'paid') return 'paid';

  const total = invoice.total ?? invoice.subtotal ?? 0;
  const paid = invoice.paid_amount ?? 0;
  const balanceDue = invoice.balance_due ?? Math.max(0, total - paid);

  if (total > 0 && paid >= total - 0.01) return 'paid';
  if (paid > 0 && balanceDue > 0.01) return 'partial';

  // Check overdue
  if (ACTIVE_STATUSES.has(status) || status === 'sent') {
    if (invoice.due_date) {
      const due = new Date(invoice.due_date);
      const now = new Date();
      if (now > due && balanceDue > 0.01) return 'overdue';
    }
  }

  return status;
}

/**
 * deriveBillingLedger — THE canonical billing truth function
 *
 * @param {Object} params
 * @param {number} params.projectedRevenue - Total expected revenue from parts + services
 * @param {Array}  params.invoices - Array of ProjectInvoice records for this project
 * @returns {Object} Canonical billing ledger
 */
export function deriveBillingLedger({ projectedRevenue = 0, invoices = [] }) {
  // Separate active vs draft vs void
  const enrichedInvoices = invoices.map(inv => ({
    ...inv,
    effectiveStatus: resolveEffectiveStatus(inv),
    agingBucket: getAgingBucket(inv),
    invoiceTotal: inv.total ?? inv.subtotal ?? 0,
    invoicePaid: inv.paid_amount ?? 0,
    invoiceBalance: inv.balance_due ?? Math.max(0, (inv.total ?? inv.subtotal ?? 0) - (inv.paid_amount ?? 0)),
  }));

  const activeInvoices = enrichedInvoices.filter(
    inv => !VOID_STATUSES.has(inv.effectiveStatus) && !DRAFT_STATUSES.has(inv.effectiveStatus)
  );
  const draftInvoices = enrichedInvoices.filter(inv => DRAFT_STATUSES.has(inv.effectiveStatus));
  const voidInvoices = enrichedInvoices.filter(inv => VOID_STATUSES.has(inv.effectiveStatus));

  // ═══════════════════════════════════════════════════════════════
  // CANONICAL LEDGER TOTALS — derived ONLY from invoice records
  // ═══════════════════════════════════════════════════════════════
  let invoicedRevenue = 0;
  let paidRevenue = 0;
  let outstandingRevenue = 0;

  for (const inv of activeInvoices) {
    invoicedRevenue += inv.invoiceTotal;
    paidRevenue += inv.invoicePaid;
    outstandingRevenue += inv.invoiceBalance;
  }

  const remainingToBill = Math.max(0, projectedRevenue - invoicedRevenue);

  // Realized revenue depends on accounting mode
  const realizedRevenue = ACCOUNTING_MODE === 'CASH' ? paidRevenue : invoicedRevenue;

  // ═══════════════════════════════════════════════════════════════
  // INVOICE STATUS BUCKETS
  // ═══════════════════════════════════════════════════════════════
  const unpaidInvoices = activeInvoices.filter(inv => inv.effectiveStatus !== 'paid');
  const partiallyPaidInvoices = activeInvoices.filter(inv => inv.effectiveStatus === 'partial');
  const overdueInvoices = activeInvoices.filter(inv => inv.effectiveStatus === 'overdue');
  const paidInvoicesList = activeInvoices.filter(inv => inv.effectiveStatus === 'paid');

  // ═══════════════════════════════════════════════════════════════
  // INVOICE AGING
  // ═══════════════════════════════════════════════════════════════
  const aging = { current: 0, days_0_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0 };
  for (const inv of unpaidInvoices) {
    switch (inv.agingBucket) {
      case 'current': aging.current += inv.invoiceBalance; break;
      case '0_30': aging.days_0_30 += inv.invoiceBalance; break;
      case '31_60': aging.days_31_60 += inv.invoiceBalance; break;
      case '61_90': aging.days_61_90 += inv.invoiceBalance; break;
      case '90_plus': aging.days_90_plus += inv.invoiceBalance; break;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // BILLING HEALTH STATE
  // ═══════════════════════════════════════════════════════════════
  let billingHealth;
  if (overdueInvoices.length > 0) {
    billingHealth = 'overdue';
  } else if (outstandingRevenue > 0.01) {
    billingHealth = 'outstanding';
  } else if (invoicedRevenue > 0 && remainingToBill < 0.01) {
    billingHealth = 'fully_billed';
  } else if (invoicedRevenue > 0) {
    billingHealth = 'partially_billed';
  } else {
    billingHealth = 'awaiting_billing';
  }

  // ═══════════════════════════════════════════════════════════════
  // INVOICE PROVENANCE — source invoices for each metric
  // ═══════════════════════════════════════════════════════════════
  const provenance = {
    invoiced: activeInvoices.map(inv => ({
      id: inv.id,
      number: inv.qb_invoice_number || `INV-${inv.id?.slice(-6)}`,
      total: inv.invoiceTotal,
      status: inv.effectiveStatus,
      date: inv.issue_date || inv.created_date,
    })),
    outstanding: unpaidInvoices.map(inv => ({
      id: inv.id,
      number: inv.qb_invoice_number || `INV-${inv.id?.slice(-6)}`,
      balance: inv.invoiceBalance,
      status: inv.effectiveStatus,
      due_date: inv.due_date,
    })),
    paid: paidInvoicesList.map(inv => ({
      id: inv.id,
      number: inv.qb_invoice_number || `INV-${inv.id?.slice(-6)}`,
      paid: inv.invoicePaid,
      date: inv.payment_date || inv.updated_date,
    })),
  };

  // ═══════════════════════════════════════════════════════════════
  // RECONCILIATION — projected vs ledger
  // ═══════════════════════════════════════════════════════════════
  const reconciliation = {
    projectedRevenue,
    invoicedRevenue,
    difference: Math.abs(projectedRevenue - invoicedRevenue),
    billingRatio: projectedRevenue > 0 ? (invoicedRevenue / projectedRevenue) * 100 : 0,
    paidRatio: invoicedRevenue > 0 ? (paidRevenue / invoicedRevenue) * 100 : 0,
  };

  return {
    // Core ledger metrics
    projectedRevenue,
    invoicedRevenue,
    paidRevenue,
    outstandingRevenue,
    remainingToBill,
    realizedRevenue,
    accountingMode: ACCOUNTING_MODE,

    // Invoice counts
    invoiceCount: activeInvoices.length,
    draftCount: draftInvoices.length,
    unpaidCount: unpaidInvoices.length,
    partialCount: partiallyPaidInvoices.length,
    overdueCount: overdueInvoices.length,

    // Health
    billingHealth,

    // Aging
    aging,

    // Provenance
    provenance,

    // Reconciliation
    reconciliation,

    // Raw enriched invoices for downstream
    _invoices: enrichedInvoices,
  };
}

/**
 * deriveInvoiceBalances — convenience helper for individual invoice balance
 */
export function deriveInvoiceBalances(invoice) {
  const total = invoice.total ?? invoice.subtotal ?? 0;
  const paid = invoice.paid_amount ?? 0;
  return {
    total,
    paid,
    balance: Math.max(0, total - paid),
    status: resolveEffectiveStatus(invoice),
  };
}

/**
 * BILLING HEALTH DISPLAY CONFIG
 */
export const BILLING_HEALTH_CONFIG = {
  fully_billed: {
    label: 'Fully Billed',
    description: 'All projected revenue has been invoiced.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-900/20 border-emerald-700/30',
  },
  partially_billed: {
    label: 'Partially Billed',
    description: 'Some revenue invoiced, more remains.',
    color: 'text-blue-400',
    bg: 'bg-blue-900/20 border-blue-700/30',
  },
  awaiting_billing: {
    label: 'Awaiting Billing',
    description: 'No invoices sent yet.',
    color: 'text-gray-400',
    bg: 'bg-gray-900/30 border-gray-700/30',
  },
  outstanding: {
    label: 'Outstanding Balance',
    description: 'Invoices sent but not fully paid.',
    color: 'text-amber-400',
    bg: 'bg-amber-900/20 border-amber-700/30',
  },
  overdue: {
    label: 'Overdue Invoices',
    description: 'Invoices past due date.',
    color: 'text-red-400',
    bg: 'bg-red-900/20 border-red-700/30',
  },
};