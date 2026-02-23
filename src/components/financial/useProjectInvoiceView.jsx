/**
 * useProjectInvoiceView - Canonical Financial Read Model
 * 
 * PHASE 1 REFACTOR: Unified Invoice State for Forward Model
 * 
 * This hook provides invoice-history data from ProjectInvoice + ProjectInvoiceLine.
 * For exposure/credit calculations, use getBillingAndProcurementStates.
 * 
 * CANONICAL INVOICE STATES:
 * - UNBILLED: Not yet invoiced (ready to bill)
 * - INVOICED: Invoice sent, awaiting payment
 * - PAID: Payment received
 */

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { normalizeProjectId, invoiceKeys } from "./queryKeyFactories";

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
 */
export function normalizeCommitmentBillingStatus(rawStatus, commitment = {}) {
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
// MAIN HOOK
// ============================================

/**
 * useProjectInvoiceView - Invoice history read model
 * 
 * IMPORTANT: This is for INVOICE HISTORY only.
 * For exposure/credit data, use useBillingAndProcurementStates.
 * 
 * CANONICAL: Uses getProjectInvoicesView backend function.
 */
export function useProjectInvoiceView(projectId) {
  // DETERMINISTIC: Normalize projectId once - null if invalid
  const normalizedId = normalizeProjectId(projectId);
  
  // CANONICAL: Use invoiceKeys.view() factory for query key
  const queryKey = invoiceKeys.view(normalizedId);
  
  // DEV diagnostic logging
  if (process.env.NODE_ENV === "development") {
    console.log("[useProjectInvoiceView] Init:", {
      rawProjectId: projectId,
      normalizedId,
      queryKey,
      enabled: Boolean(normalizedId),
    });
  }
  
  // CANONICAL: Single query to backend function
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!normalizedId) return { invoices: [], credit_balances: {}, credit_applied: {}, summary: {} };
      const response = await base44.functions.invoke('getProjectInvoicesView', {
        project_id: normalizedId,
      });
      return response.data || { invoices: [], credit_balances: {}, credit_applied: {}, summary: {} };
    },
    enabled: Boolean(normalizedId),
    staleTime: 30000,
  });

  // Extract data from response
  const invoices = query.data?.invoices ?? [];
  const creditBalances = query.data?.credit_balances ?? {};
  const creditApplied = query.data?.credit_applied ?? {};
  const summary = query.data?.summary ?? {};

  // DEV: Log invoices for debugging
  if (process.env.NODE_ENV === "development") {
    console.log("[useProjectInvoiceView] invoices:", invoices);
  }

  // LEGACY COMPAT: Also fetch commitments for existing consumers
  const { 
    data: rawCommitments = [], 
    isLoading: loadingCommitments,
    refetch: refetchCommitments
  } = useQuery({
    queryKey: ['projectInvoiceCommitments', normalizedId],
    queryFn: async () => {
      if (!normalizedId) return [];
      return base44.entities.PartCommitment.filter({ project_id: normalizedId });
    },
    enabled: Boolean(normalizedId),
    staleTime: 30000,
  });

  // Fetch parts for names
  const partIds = [...new Set(rawCommitments.map(c => c.part_id).filter(Boolean))];
  const { data: parts = [], isLoading: loadingParts } = useQuery({
    queryKey: ['invoiceViewParts', partIds.sort().join(',')],
    queryFn: async () => {
      if (partIds.length === 0) return [];
      const allParts = await base44.entities.Part.list();
      return allParts.filter(p => partIds.includes(p.id));
    },
    enabled: partIds.length > 0,
    staleTime: 60000,
  });

  // Fetch credit allocations for legacy compat
  const { data: creditAllocations = [], isLoading: loadingAllocations } = useQuery({
    queryKey: ['creditAllocations', normalizedId],
    queryFn: async () => {
      if (!normalizedId) return [];
      return base44.entities.CreditAllocation.filter({ project_id: normalizedId, is_reversed: false });
    },
    enabled: Boolean(normalizedId),
    staleTime: 30000,
  });

  // Build lookup maps
  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
  const invoicesMap = Object.fromEntries(invoices.map(inv => [inv.id, inv]));
  
  // Map commitment_id to invoice info via invoice data
  const commitmentToInvoice = {};
  // Note: getProjectInvoicesView doesn't return line-level mapping,
  // so we'll need to use legacy approach for commitment-invoice linking

  // Build credit allocation map by commitment
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
  const commitments = rawCommitments
    .filter(c => !c.cancellation_type && c.cancellation_type !== 'full_cancel')
    .map(c => {
      const part = partsMap[c.part_id];
      const invoiceInfo = commitmentToInvoice[c.id] || {};
      
      // Derive canonical billing status
      const canonicalStatus = normalizeCommitmentBillingStatus(
        c.billing_status || invoiceInfo.invoice_status
      );
      
      const unitRetail = c.unit_retail_snapshot ?? 0;
      const unitCost = c.unit_cost_snapshot ?? 0;
      const requiredTotal = c.required_total ?? 1;
      
      // Calculate exposure
      const grossExposure = unitRetail * requiredTotal;
      const creditAppliedLine = creditByCommitmentLocal[c.id] || 0;
      const netExposure: netExposure,
        invoice_id: invoiceInfo.invoice_id,
        invoice_number: invoiceInfo.invoice_number,
      };
    });

  // Calculate summary
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
    const amount = c.extended_retail || 0;
    summary.total_billable += amount;
    
    switch (c.billing_status) {
      case CANONICAL_BILLING_STATUS.UNBILLED:
        summary.unbilled_count++;
        summary.unbilled_total += amount;
        break;
      case CANONICAL_BILLING_STATUS.INVOICED:
        summary.invoiced_count++;
        summary.invoiced_total += amount;
        summary.outstanding_total += amount;
        break;
      case CANONICAL_BILLING_STATUS.PAID:
        summary.paid_count++;
        summary.paid_total += amount;
        break;
    }
  }

  // Calculate credit summary
  const totalCreditAvailable = creditLedgers.reduce((sum, c) => sum + (c.remaining_amount || 0), 0);
  const totalCreditApplied = creditAllocations.reduce((sum, a) => sum + (a.amount_applied || 0), 0);
  const grossExposureTotal = summary.unbilled_total + summary.invoiced_total;
  const netExposureTotal = Math.max(0, grossExposureTotal - totalCreditApplied);

  const creditSummary = {
    total_credit_available: totalCreditAvailable,
    total_credit_applied: totalCreditApplied,
    gross_exposure: grossExposureTotal,
    net_exposure: netExposureTotal,
  };

  const isLoading = loadingCommitments || loadingParts || loadingInvoices || loadingCredits || loadingAllocations || loadingLines;

  const refetch = async () => {
    await Promise.all([
      refetchCommitments(),
      refetchInvoices(),
    ]);
  };

  return {
    commitments,
    summary,
    invoiceBatches: projectInvoices, // Alias for compatibility
    projectInvoices,
    creditSummary,
    isLoading,
    refetch,
  };
}