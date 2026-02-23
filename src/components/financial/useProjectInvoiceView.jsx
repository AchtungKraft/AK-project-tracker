/**
 * useProjectInvoiceView - Canonical Financial Read Model
 * 
 * PHASE 6: Unified Financial State Resolver for Forward Model
 * 
 * This hook provides the ONLY source of truth for invoice tab data.
 * It abstracts all entity queries and returns normalized financial state.
 * 
 * CANONICAL INVOICE STATES:
 * - UNBILLED: Not yet invoiced (ready to bill)
 * - INVOICED: Invoice sent, awaiting payment
 * - PAID: Payment received
 * 
 * NO LIFECYCLE LEAKAGE:
 * - Does NOT inspect commitment_status
 * - Does NOT inspect coverage_status
 * - Does NOT inspect inventory
 * - Does NOT inspect to_order / install progress
 */

import { useQuery } from "@tanstack/react-query";
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
// STATUS NORMALIZATION
// ============================================

/**
 * Normalize any legacy billing_status to canonical values
 * 
 * Legacy values that map to UNBILLED:
 * - null, undefined, ''
 * - 'billable'
 * - 'not_invoiced'
 * - 'NOT_INVOICED'
 * - 'invoice_client'
 * - 'awaiting_invoice'
 * 
 * Legacy values that map to INVOICED:
 * - 'awaiting_pay'
 * - 'AWAITING_PAY'
 * - 'awaiting_payment'
 * - 'sent'
 * - 'invoiced'
 * - 'INVOICED'
 * 
 * Values that map to PAID:
 * - 'paid'
 * - 'PAID'
 * - 'client_paid'
 */
export function normalizeCommitmentBillingStatus(rawStatus, commitment = {}) {
  // First check if commitment is linked to an InvoiceBatch
  if (commitment.invoice_batch_id) {
    // Status derived from batch
    const batchStatus = commitment.invoice_batch_status;
    if (batchStatus === 'paid') return CANONICAL_BILLING_STATUS.PAID;
    if (['sent', 'invoiced'].includes(batchStatus)) return CANONICAL_BILLING_STATUS.INVOICED;
  }
  
  // Normalize raw status string
  const status = (rawStatus || '').toLowerCase().trim();
  
  // PAID states
  if (['paid', 'client_paid'].includes(status)) {
    return CANONICAL_BILLING_STATUS.PAID;
  }
  
  // INVOICED states (awaiting payment)
  if ([
    'invoiced', 
    'awaiting_pay', 
    'awaiting_payment', 
    'sent',
    'client_invoiced'
  ].includes(status)) {
    return CANONICAL_BILLING_STATUS.INVOICED;
  }
  
  // Everything else is UNBILLED
  return CANONICAL_BILLING_STATUS.UNBILLED;
}

/**
 * Get display config for canonical billing status
 */
export function getBillingStatusConfig(status) {
  const configs = {
    [CANONICAL_BILLING_STATUS.UNBILLED]: {
      label: 'Ready to Bill',
      shortLabel: 'Unbilled',
      color: 'text-gray-400',
      bgColor: 'bg-gray-600',
      borderColor: 'border-gray-600',
    },
    [CANONICAL_BILLING_STATUS.INVOICED]: {
      label: 'Awaiting Payment',
      shortLabel: 'Invoiced',
      color: 'text-purple-400',
      bgColor: 'bg-purple-600',
      borderColor: 'border-purple-600',
    },
    [CANONICAL_BILLING_STATUS.PAID]: {
      label: 'Paid',
      shortLabel: 'Paid',
      color: 'text-green-400',
      bgColor: 'bg-green-600',
      borderColor: 'border-green-600',
    },
  };
  return configs[status] || configs[CANONICAL_BILLING_STATUS.UNBILLED];
}

// ============================================
// VIEW MODEL TYPES
// ============================================

/**
 * @typedef {Object} InvoiceCommitmentViewModel
 * @property {string} id - Commitment ID
 * @property {string} part_id
 * @property {string} part_name
 * @property {string} project_id
 * @property {string} billing_status - Canonical: unbilled | invoiced | paid
 * @property {number} unit_cost
 * @property {number} unit_retail
 * @property {number} required_total
 * @property {number} extended_retail - unit_retail * required_total
 * @property {string|null} invoice_batch_id
 * @property {string|null} invoice_number
 */

/**
 * @typedef {Object} InvoiceSummary
 * @property {number} unbilled_count
 * @property {number} unbilled_total
 * @property {number} invoiced_count
 * @property {number} invoiced_total
 * @property {number} paid_count
 * @property {number} paid_total
 * @property {number} outstanding_total - invoiced_total (awaiting payment)
 * @property {number} total_billable - All non-cancelled commitments
 */

// ============================================
// MAIN HOOK
// ============================================

/**
 * useProjectInvoiceView - Canonical read model for invoice tab
 * 
 * @param {string} projectId 
 * @returns {{ 
 *   commitments: InvoiceCommitmentViewModel[], 
 *   summary: InvoiceSummary,
 *   invoiceBatches: Array,
 *   isLoading: boolean,
 *   refetch: Function
 * }}
 */
export function useProjectInvoiceView(projectId) {
  // Fetch commitments for this project
  const { 
    data: rawCommitments = [], 
    isLoading: loadingCommitments,
    refetch: refetchCommitments
  } = useQuery({
    queryKey: ['projectInvoiceCommitments', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      return base44.entities.PartCommitment.filter({ project_id: projectId });
    },
    enabled: !!projectId,
    staleTime: 30000,
  });

  // Fetch parts for names
  const partIds = [...new Set(rawCommitments.map(c => c.part_id).filter(Boolean))];
  const { data: parts = [], isLoading: loadingParts } = useQuery({
    queryKey: ['invoiceViewParts', partIds.sort().join(',')],
    queryFn: async () => {
      if (partIds.length === 0) return [];
      // Batch fetch parts
      const allParts = await base44.entities.Part.list();
      return allParts.filter(p => partIds.includes(p.id));
    },
    enabled: partIds.length > 0,
    staleTime: 60000,
  });

  // Fetch invoice batches
  const { 
    data: invoiceBatches = [], 
    isLoading: loadingBatches,
    refetch: refetchBatches
  } = useQuery({
    queryKey: ['projectInvoiceBatches', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      return base44.entities.InvoiceBatch.filter({ project_id: projectId }, '-created_date');
    },
    enabled: !!projectId,
    staleTime: 30000,
  });

  // PHASE 4: Fetch credit ledger and allocations
  const { data: creditLedgers = [], isLoading: loadingCredits } = useQuery({
    queryKey: ['projectCreditLedger', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      return base44.entities.ProjectCreditLedger.filter({ project_id: projectId });
    },
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: creditAllocations = [], isLoading: loadingAllocations } = useQuery({
    queryKey: ['projectCreditAllocations', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      return base44.entities.CreditAllocation.filter({ project_id: projectId, is_reversed: false });
    },
    enabled: !!projectId,
    staleTime: 30000,
  });

  // Fetch batch lines for mapping
  const batchIds = invoiceBatches.map(b => b.id);
  const { data: batchLines = [], isLoading: loadingLines } = useQuery({
    queryKey: ['invoiceBatchLines', batchIds.sort().join(',')],
    queryFn: async () => {
      if (batchIds.length === 0) return [];
      const allLines = await base44.entities.InvoiceBatchLine.list();
      return allLines.filter(l => batchIds.includes(l.invoice_batch_id));
    },
    enabled: batchIds.length > 0,
    staleTime: 30000,
  });

  // Build lookup maps
  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
  const batchesMap = Object.fromEntries(invoiceBatches.map(b => [b.id, b]));
  
  // Map commitment_id to batch info via batch lines
  const commitmentToBatch = {};
  for (const line of batchLines) {
    if (line.commitment_id) {
      const batch = batchesMap[line.invoice_batch_id];
      if (batch) {
        commitmentToBatch[line.commitment_id] = {
          batch_id: batch.id,
          batch_status: batch.status,
          invoice_number: batch.invoice_number,
        };
      }
    }
  }

  // PHASE 10: Dev mode drift warning for non-canonical billing_status
  if (process.env.NODE_ENV === 'development' && rawCommitments.length > 0) {
    const nonCanonical = rawCommitments.filter(c => 
      c.billing_status && !['unbilled', 'invoiced', 'paid'].includes(c.billing_status.toLowerCase())
    );
    if (nonCanonical.length > 0) {
      console.warn(
        `[BILLING_DRIFT_WARNING] ${nonCanonical.length} commitments have non-canonical billing_status:`,
        nonCanonical.map(c => ({ id: c.id, status: c.billing_status }))
      );
    }
  }

  // PHASE 5: Build credit allocation map by commitment
  const creditByCommitmentLocal = {};
  for (const alloc of creditAllocations) {
    if (alloc.commitment_id) {
      if (!creditByCommitmentLocal[alloc.commitment_id]) {
        creditByCommitmentLocal[alloc.commitment_id] = 0;
      }
      creditByCommitmentLocal[alloc.commitment_id] += alloc.amount_applied || 0;
    }
  }

  // Transform commitments to view models
  // PHASE 5: Include gross/credit/net exposure from backend - NO FRONTEND MATH
  const commitments = rawCommitments
    .filter(c => !c.cancellation_type && c.cancellation_type !== 'full_cancel')
    .map(c => {
      const part = partsMap[c.part_id];
      const batchInfo = commitmentToBatch[c.id] || {};
      
      // Derive canonical billing status
      const canonicalStatus = normalizeCommitmentBillingStatus(
        c.billing_status, 
        { 
          invoice_batch_id: batchInfo.batch_id,
          invoice_batch_status: batchInfo.batch_status 
        }
      );
      
      const unitRetail = c.unit_retail_snapshot ?? c.unit_retail ?? 0;
      const unitCost = c.unit_cost_snapshot ?? c.unit_cost ?? 0;
      const requiredTotal = c.required_total ?? 1;
      
      // PHASE 5: Calculate gross and net exposure - this is display ONLY
      // The canonical source is getBillingAndProcurementStates
      const grossExposure = unitRetail * requiredTotal;
      const creditAppliedLine = creditByCommitmentLocal[c.id] || 0;
      const netExposure = Math.max(0, grossExposure - creditAppliedLine);
      
      return {
        id: c.id,
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown Part',
        project_id: c.project_id,
        billing_status: canonicalStatus,
        unit_cost: unitCost,
        unit_retail: unitRetail,
        required_total: requiredTotal,
        extended_retail: grossExposure, // DEPRECATED: Use gross_exposure
        extended_cost: unitCost * requiredTotal,
        // PHASE 5: Canonical exposure fields
        gross_exposure: grossExposure,
        credit_applied: creditAppliedLine,
        net_exposure: netExposure,
        invoice_batch_id: batchInfo.batch_id || null,
        invoice_number: batchInfo.invoice_number || null,
        // Raw for debugging
        _raw_billing_status: c.billing_status,
      };
    });

  // Compute summary
  const summary = {
    unbilled_count: 0,
    unbilled_total: 0,
    invoiced_count: 0,
    invoiced_total: 0,
    paid_count: 0,
    paid_total: 0,
    outstanding_total: 0,
    total_billable: 0,
  };

  for (const c of commitments) {
    summary.total_billable += c.extended_retail;
    
    switch (c.billing_status) {
      case CANONICAL_BILLING_STATUS.UNBILLED:
        summary.unbilled_count++;
        summary.unbilled_total += c.extended_retail;
        break;
      case CANONICAL_BILLING_STATUS.INVOICED:
        summary.invoiced_count++;
        summary.invoiced_total += c.extended_retail;
        break;
      case CANONICAL_BILLING_STATUS.PAID:
        summary.paid_count++;
        summary.paid_total += c.extended_retail;
        break;
    }
  }
  
  // Outstanding = invoiced but not paid
  summary.outstanding_total = summary.invoiced_total;

  // PHASE 4: Calculate credit summary
  const creditAvailable = creditLedgers.reduce((sum, l) => sum + (l.remaining_amount || 0), 0);
  const creditApplied = creditAllocations.reduce((sum, a) => sum + (a.amount_applied || 0), 0);
  const grossExposure = summary.unbilled_total + summary.invoiced_total;
  const netExposure = Math.max(0, grossExposure - creditApplied);

  // Build credit allocation map by commitment
  const creditByCommitment = {};
  for (const alloc of creditAllocations) {
    if (alloc.commitment_id) {
      if (!creditByCommitment[alloc.commitment_id]) {
        creditByCommitment[alloc.commitment_id] = 0;
      }
      creditByCommitment[alloc.commitment_id] += alloc.amount_applied || 0;
    }
  }

  // Enrich commitments with credit info
  const enrichedCommitments = commitments.map(c => ({
    ...c,
    credit_applied_line: creditByCommitment[c.id] || 0,
    gross_line_total: c.extended_retail,
    net_line_total: Math.max(0, c.extended_retail - (creditByCommitment[c.id] || 0)),
  }));

  const creditSummary = {
    credit_available: creditAvailable,
    credit_applied: creditApplied,
    gross_exposure: grossExposure,
    net_exposure: netExposure,
  };

  return {
    commitments: enrichedCommitments,
    summary,
    creditSummary,
    invoiceBatches: invoiceBatches.filter(b => b.status !== 'voided'),
    isLoading: loadingCommitments || loadingParts || loadingBatches || loadingLines || loadingCredits || loadingAllocations,
    refetch: () => {
      refetchCommitments();
      refetchBatches();
    },
  };
}

export default useProjectInvoiceView;