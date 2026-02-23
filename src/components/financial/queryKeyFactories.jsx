/**
 * queryKeyFactories.js - Centralized Query Key Factories
 * 
 * SINGLE SOURCE OF TRUTH for all financial query keys.
 * All useQuery calls MUST use these factories to prevent key drift.
 * 
 * RULES:
 * - Keys are always string arrays (no object keys)
 * - projectId is always normalized to String OR null (never empty string)
 * - Empty string keys broke loading because useQuery enabled: Boolean("") is false
 *   but the query key still contained "" which caused cache key mismatches
 */

/**
 * Normalize projectId to string format OR null
 * 
 * IMPORTANT: Returns null (not empty string) for invalid inputs.
 * This ensures:
 * - enabled: Boolean(normalizedProjectId) works correctly
 * - Query keys never contain empty strings
 * - Cache invalidation matches correctly
 * 
 * @param {string|number|null|undefined} projectId 
 * @returns {string|null}
 */
export const normalizeProjectId = (projectId) => {
  if (projectId === null || projectId === undefined || projectId === '' || projectId === 'all') {
    return null;
  }
  return String(projectId);
};

/**
 * Billing/Procurement state query keys
 * NOTE: Returns key with null if projectId is invalid - callers must check enabled
 */
export const billingKeys = {
  all: () => ['billingProcurementStates'],
  states: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['billingProcurementStates', normalized];
  },
};

/**
 * Invoice view query keys
 */
export const invoiceKeys = {
  all: () => ['projectInvoicesView'],
  view: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['projectInvoicesView', normalized];
  },
  lines: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['projectInvoiceLines', normalized];
  },
};

/**
 * Credit allocation query keys
 */
export const creditKeys = {
  all: () => ['creditAllocations'],
  allocations: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['creditAllocations', normalized];
  },
  ledger: () => ['creditLedger'],
  projectBalance: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['projectCreditBalance', normalized];
  },
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