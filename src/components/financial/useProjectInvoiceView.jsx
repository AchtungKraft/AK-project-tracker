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
import { useEffect } from "react";
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
 * CANONICAL: Uses invoiceKeys.view() factory for query key.
 * Returns invoices exactly as backend returns - NO local filtering.
 */
export function useProjectInvoiceView(projectId) {
  // DETERMINISTIC: Normalize projectId once - null if invalid
  const normalizedId = normalizeProjectId(projectId);
  
  // CANONICAL: Use invoiceKeys.view() factory for query key
  const queryKey = invoiceKeys.view(normalizedId);
  
  // DEV diagnostic logging
  useEffect(() => {
    console.log("[useProjectInvoiceView] Init:", {
      rawProjectId: projectId,
      normalizedId,
      queryKey,
      enabled: Boolean(normalizedId),
    });
  }, [projectId, normalizedId]);
  
  // CANONICAL: Single query to backend function for invoice history
  const invoiceQuery = useQuery({
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

  // Extract invoices from response - NO FILTERING
  const invoices = invoiceQuery.data?.invoices ?? [];
  const creditBalances = invoiceQuery.data?.credit_balances ?? {};
  const creditAppliedMap = invoiceQuery.data?.credit_applied ?? {};
  const backendSummary = invoiceQuery.data?.summary ?? {};

  // DEBUG: Log invoices array
  useEffect(() => {
    console.log("[useProjectInvoiceView] invoices:", invoices);
  }, [invoices]);

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

  // Fetch credit ledger for summary
  const { data: creditLedgers = [], isLoading: loadingCredits } = useQuery({
    queryKey: ['projectCreditLedger', normalizedId],
    queryFn: async () => {
      if (!normalizedId) return [];
      return base44.entities.ProjectCreditLedger.filter({ project_id: normalizedId });
    },
    enabled: Boolean(normalizedId),
    staleTime: 30000,
  });

  // Build lookup maps
  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));

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

  // Transform commitments to view models (LEGACY COMPAT)
  const commitments = rawCommitments
    .filter(c => !c.cancellation_type && c.cancellation_type !== 'full_cancel')
    .map(c => {
      const part = partsMap[c.part_id];
      
      // Derive canonical billing status
      const canonicalStatus = normalizeCommitmentBillingStatus(c.billing_status);
      
      const unitRetail = c.unit_retail_snapshot ?? 0;
      const unitCost = c.unit_cost_snapshot ?? 0;
      const requiredTotal = c.required_total ?? 1;
      
      // Calculate exposure
      const grossExposure = unitRetail * requiredTotal;
      const creditAppliedLine = creditByCommitmentLocal[c.id] || 0;
      const netExposure = Math.max(0, grossExposure - creditAppliedLine);
      
      return {
        id: c.id,
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown Part',
        part_number: part?.vendor_part_number,
        project_id: c.project_id,
        billing_status: canonicalStatus,
        invoice_status: canonicalStatus,
        unit_cost: unitCost,
        unit_retail: unitRetail,
        required_total: requiredTotal,
        extended_retail: grossExposure,
        gross_exposure: grossExposure,
        credit_applied: creditAppliedLine,
        net_exposure: netExposure,
      };
    });

  // Calculate commitment-based summary (LEGACY COMPAT)
  const commitmentSummary = {
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
    commitmentSummary.total_billable += amount;
    
    switch (c.billing_status) {
      case CANONICAL_BILLING_STATUS.UNBILLED:
        commitmentSummary.unbilled_count++;
        commitmentSummary.unbilled_total += amount;
        break;
      case CANONICAL_BILLING_STATUS.INVOICED:
        commitmentSummary.invoiced_count++;
        commitmentSummary.invoiced_total += amount;
        commitmentSummary.outstanding_total += amount;
        break;
      case CANONICAL_BILLING_STATUS.PAID:
        commitmentSummary.paid_count++;
        commitmentSummary.paid_total += amount;
        break;
    }
  }

  // Calculate credit summary
  const totalCreditAvailable = creditLedgers.reduce((sum, c) => sum + (c.remaining_amount || 0), 0);
  const totalCreditApplied = creditAllocations.reduce((sum, a) => sum + (a.amount_applied || 0), 0);
  const grossExposureTotal = commitmentSummary.unbilled_total + commitmentSummary.invoiced_total;
  const netExposureTotal = Math.max(0, grossExposureTotal - totalCreditApplied);

  const creditSummary = {
    total_credit_available: totalCreditAvailable,
    total_credit_applied: totalCreditApplied,
    gross_exposure: grossExposureTotal,
    net_exposure: netExposureTotal,
  };

  const isLoading = invoiceQuery.isLoading || loadingCommitments || loadingParts || loadingCredits || loadingAllocations;
  const isFetching = invoiceQuery.isFetching;

  const refetch = async () => {
    await Promise.all([
      invoiceQuery.refetch(),
      refetchCommitments(),
    ]);
  };

  return {
    // CANONICAL: Invoice history from backend - NO filtering
    invoices,
    invoiceBatches: invoices, // Alias for compatibility
    projectInvoices: invoices, // Alias for compatibility
    
    // LEGACY COMPAT: Commitment data
    commitments,
    summary: commitmentSummary,
    
    // Credit data
    creditSummary,
    creditBalances,
    
    // Query state
    isLoading,
    isFetching,
    refetch,
  };
}