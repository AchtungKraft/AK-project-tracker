/**
 * useProjectInvoiceView - Canonical Invoice History Read Model
 * 
 * HARD-LOCKED: Returns EXACTLY what backend returns.
 * NO mapping. NO transformation. NO renaming.
 * 
 * For exposure/credit calculations, use getBillingAndProcurementStates.
 * 
 * CANONICAL INVOICE STATES:
 * - draft: Not yet sent
 * - sent/invoiced: Awaiting payment
 * - paid: Payment received
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
// STATUS NORMALIZATION (for commitment display)
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
// MAIN HOOK - HARD-LOCKED TO BACKEND OUTPUT
// ============================================

/**
 * useProjectInvoiceView - Invoice history read model
 * 
 * HARD-LOCKED: Returns EXACTLY what getProjectInvoicesView returns.
 * NO additional mapping. NO transformation. NO renaming.
 * 
 * CANONICAL: Uses invoiceKeys.view() factory for query key.
 */
export function useProjectInvoiceView(projectId) {
  // DETERMINISTIC: Normalize projectId once - null if invalid
  const normalizedProjectId = normalizeProjectId(projectId);
  
  // CANONICAL: Use invoiceKeys.view() factory for query key - NO inline arrays
  const queryKey = invoiceKeys.view(normalizedProjectId);
  
  // CANONICAL: Single query to backend function for invoice history
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!normalizedProjectId) return { invoices: [], credit_balances: {}, credit_applied: 0, summary: {} };
      const response = await base44.functions.invoke('getProjectInvoicesView', {
        project_id: normalizedProjectId,
      });
      return response.data || { invoices: [], credit_balances: {}, credit_applied: 0, summary: {} };
    },
    enabled: Boolean(normalizedProjectId),
    // PERF: Safe caching - 15s stale, 60s cache, no refetch on focus
    staleTime: 15000,
    gcTime: 60000,
    refetchOnWindowFocus: false,
  });

  // HARD-LOCKED: Return EXACTLY what backend returns - NO transformation
  return {
    invoices: query.data?.invoices ?? [],
    creditBalances: query.data?.credit_balances ?? {},
    creditApplied: query.data?.credit_applied ?? 0,
    summary: query.data?.summary ?? {},
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}