/**
 * queryKeyFactories.js - Centralized Query Key Factories
 * 
 * SINGLE SOURCE OF TRUTH for all financial query keys.
 * All useQuery calls MUST use these factories to prevent key drift.
 * 
 * RULES:
 * - Keys are always string arrays (no object keys)
 * - projectId is always normalized to String
 * - Empty/null projectId normalizes to empty string
 */

/**
 * Normalize projectId to string format
 * @param {string|number|null|undefined} projectId 
 * @returns {string}
 */
export const normalizeProjectId = (projectId) => {
  if (projectId === null || projectId === undefined || projectId === 'all') {
    return '';
  }
  return String(projectId);
};

/**
 * Billing/Procurement state query keys
 */
export const billingKeys = {
  all: () => ['billingProcurementStates'],
  states: (projectId) => ['billingProcurementStates', normalizeProjectId(projectId)],
};

/**
 * Invoice view query keys
 */
export const invoiceKeys = {
  all: () => ['projectInvoicesView'],
  view: (projectId) => ['projectInvoicesView', normalizeProjectId(projectId)],
  lines: (projectId) => ['projectInvoiceLines', normalizeProjectId(projectId)],
};

/**
 * Credit allocation query keys
 */
export const creditKeys = {
  all: () => ['creditAllocations'],
  allocations: (projectId) => ['creditAllocations', normalizeProjectId(projectId)],
  ledger: () => ['creditLedger'],
  projectBalance: (projectId) => ['projectCreditBalance', normalizeProjectId(projectId)],
};

/**
 * Financial projects view (global list)
 */
export const financialProjectKeys = {
  all: () => ['financialProjectsView'],
};

/**
 * DEV diagnostic logger - logs query key usage for debugging
 */
export const logQueryKeyUsage = (component, keyName, key, dataUpdatedAt, canonicalTotals) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[QueryKey] ${component}:`, {
      keyName,
      queryKey: key,
      dataUpdatedAt: dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null,
      netExposure: canonicalTotals?.net_exposure ?? 'N/A',
    });
  }
};