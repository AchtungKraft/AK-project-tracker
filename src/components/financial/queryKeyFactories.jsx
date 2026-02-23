/**
 * queryKeyFactories.jsx - Centralized Query Key Factories
 * 
 * ============================================================
 * ARCHITECTURAL RULE (PERMANENT - DO NOT MODIFY):
 * ============================================================
 * - All React Query keys must contain ONLY primitive segments.
 * - Filters must be serialized inside factories using serializeFilters().
 * - Hooks must NEVER stringify filters.
 * - Dev guard (assertPrimitiveQueryKey) enforces this permanently.
 * 
 * ALLOWED KEY SEGMENTS:
 * - string, number, boolean, null
 * 
 * FORBIDDEN KEY SEGMENTS:
 * - object, array, function, undefined, symbol
 * ============================================================
 * 
 * SINGLE SOURCE OF TRUTH for ALL domain query keys.
 * All useQuery calls MUST use these factories to prevent key drift.
 * 
 * RULES:
 * - Keys are always string arrays (no object keys)
 * - projectId is always normalized to String OR null (never empty string)
 * - Empty string keys broke loading because useQuery enabled: Boolean("") is false
 *   but the query key still contained "" which caused cache key mismatches
 * - ALL FILTERS MUST BE SERIALIZED INSIDE FACTORIES ONLY
 * - Hooks pass raw objects, factories serialize to ensure key stability
 * 
 * DOMAINS COVERED:
 * - Billing/Procurement (exposure, credit)
 * - Invoices (history, lines)
 * - Credit (ledger, allocations)
 * - Financial Projects
 * - Parts (catalog, inventory)
 * - Supply (project view, ops view, receiving)
 * - Orders (PO management)
 * - Commitments
 * - Lifecycle
 * - Vendors
 */

import { assertPrimitiveQueryKey } from "@/components/dev/queryKeyGuard";

// ============================================
// NORMALIZATION HELPERS
// ============================================

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
    // DEV GUARDRAIL: Warn if empty string was passed
    if (process.env.NODE_ENV === 'development' && projectId === '') {
      console.warn('[QUERY_KEY_GUARDRAIL] normalizeProjectId received empty string - returning null');
    }
    return null;
  }
  return String(projectId);
};

/**
 * Normalize any entity ID to string format OR null
 */
export const normalizeId = (id) => {
  if (id === null || id === undefined || id === '') {
    return null;
  }
  return String(id);
};

// ============================================
// DEV GUARDRAILS
// ============================================

/**
 * DEV: Validate query key is using factory (not raw array)
 * Call this in useQuery hooks to detect drift
 */
export const validateQueryKeyFactory = (key, factoryName, component) => {
  if (process.env.NODE_ENV === 'development') {
    // Check if key looks like a factory-generated key
    if (!Array.isArray(key)) {
      console.error(`[QUERY_KEY_VIOLATION] ${component}: Key is not an array:`, key);
    }
    // Log usage for traceability
    console.log(`[QueryKey] ${component} using ${factoryName}:`, key);
  }
};

/**
 * DEV: Warn if invoice history fields are used for exposure calculation
 */
export const warnIfInvoiceHistoryUsedForExposure = (source, field) => {
  if (process.env.NODE_ENV === 'development') {
    const historyFields = ['invoices', 'invoice_count', 'total_invoiced', 'paid_amount'];
    if (historyFields.includes(field)) {
      console.warn(
        `[EXPOSURE_VIOLATION] ${source}: Using invoice history field "${field}" for exposure calculation. ` +
        `Use getBillingAndProcurementStates instead.`
      );
    }
  }
};

/**
 * DEV: Warn if raw query key array is detected
 */
export const warnIfRawQueryKey = (key, component) => {
  if (process.env.NODE_ENV === 'development') {
    // This would be called from a linting step or manual audit
    console.warn(
      `[RAW_KEY_VIOLATION] ${component}: Using raw query key instead of factory:`, key
    );
  }
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

// ============================================
// BILLING & PROCUREMENT KEYS
// ============================================

/**
 * Billing/Procurement state query keys
 * SOURCE: getBillingAndProcurementStates (CANONICAL exposure source)
 */
export const billingKeys = {
  all: () => {
    const key = ['billingProcurementStates'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  states: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    const key = ['billingProcurementStates', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// INVOICE KEYS
// ============================================

/**
 * Invoice view query keys
 * SOURCE: getProjectInvoicesView (HISTORY ONLY - NOT for exposure)
 */
export const invoiceKeys = {
  all: () => {
    const key = ['projectInvoicesView'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  view: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    const key = ['projectInvoicesView', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  lines: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    const key = ['projectInvoiceLines', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  commitments: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    const key = ['projectInvoiceCommitments', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  detail: (invoiceId) => {
    const normalized = normalizeId(invoiceId);
    const key = ['projectInvoice', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// CREDIT KEYS
// ============================================

/**
 * Credit allocation query keys
 */
export const creditKeys = {
  all: () => {
    const key = ['creditAllocations'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  allocations: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    const key = ['creditAllocations', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  ledger: () => {
    const key = ['creditLedger'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  projectLedger: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    const key = ['projectCreditLedger', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  projectBalance: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    const key = ['projectCreditBalance', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// FINANCIAL PROJECTS KEYS
// ============================================

/**
 * Financial projects view (global list)
 */
export const financialProjectKeys = {
  all: () => {
    const key = ['financialProjectsView'];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// PARTS KEYS
// ============================================

/**
 * Parts catalog and inventory query keys
 */
export const partsKeys = {
  all: () => {
    const key = ['parts'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  list: () => {
    const key = ['parts'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  detail: (partId) => {
    const normalized = normalizeId(partId);
    const key = ['part', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  inventory: () => {
    const key = ['partsInventoryView'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  inventoryForPart: (partId) => {
    const normalized = normalizeId(partId);
    const key = ['partsInventoryView', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  supplyUsage: (partId) => {
    const normalized = normalizeId(partId);
    const key = ['partSupplyUsage', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  categories: () => {
    const key = ['partCategories'];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// SUPPLY KEYS
// ============================================

/**
 * Supply view query keys
 * SOURCE: getProjectSupplyView, getOpsSupplyView
 */
/**
 * Serialize filters with sorted keys for stable cache keys
 * ONLY used inside factories - hooks must pass raw objects
 */
const serializeFilters = (filters) => {
  const obj = filters ?? {};
  return JSON.stringify(obj, Object.keys(obj).sort());
};

export const supplyKeys = {
  // CANONICAL: Filters serialized HERE, not in hooks
  projectView: (projectId, filters = {}) => {
    const normalized = normalizeProjectId(projectId);
    const filtersKey = serializeFilters(filters);
    const key = ['projectSupplyView', normalized, filtersKey];
    assertPrimitiveQueryKey(key);
    return key;
  },
  opsView: (mode, filters = {}) => {
    const filtersKey = serializeFilters(filters);
    const key = ['opsSupplyView', mode, filtersKey];
    assertPrimitiveQueryKey(key);
    return key;
  },
  poReceiving: (orderId, filters = {}) => {
    const normalized = normalizeId(orderId);
    const filtersKey = serializeFilters(filters);
    const key = ['poReceivingView', normalized, filtersKey];
    assertPrimitiveQueryKey(key);
    return key;
  },
  portfolio: () => {
    const key = ['portfolioSupplyState'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  globalQueues: () => {
    const key = ['globalSupplyQueues'];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// COMMITMENT KEYS
// ============================================

/**
 * Commitment query keys
 */
export const commitmentKeys = {
  all: () => {
    const key = ['partCommitments'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  forProject: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    const key = ['projectCommitments', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  forPart: (partId) => {
    const normalized = normalizeId(partId);
    const key = ['partCommitments', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  detail: (commitmentId) => {
    const normalized = normalizeId(commitmentId);
    const key = ['commitmentDetails', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  state: (commitmentId) => {
    const normalized = normalizeId(commitmentId);
    const key = ['commitmentState', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// ORDER KEYS
// ============================================

/**
 * Order/PO query keys
 */
export const orderKeys = {
  all: () => {
    const key = ['orders'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  list: () => {
    const key = ['orders'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  detail: (orderId) => {
    const normalized = normalizeId(orderId);
    const key = ['order', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  lineItems: () => {
    const key = ['partPurchaseLineItems'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  forOrder: (orderId) => {
    const normalized = normalizeId(orderId);
    const key = ['orderLineItems', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// RECEIVING KEYS
// ============================================

/**
 * Receiving/inventory query keys
 */
export const receivingKeys = {
  poList: (filters = {}) => {
    const filtersKey = serializeFilters(filters);
    const key = ['poReceivingView', null, filtersKey];
    assertPrimitiveQueryKey(key);
    return key;
  },
  poDetail: (orderId, filters = {}) => {
    const normalized = normalizeId(orderId);
    const filtersKey = serializeFilters(filters);
    const key = ['poReceivingView', normalized, filtersKey];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// VENDOR KEYS
// ============================================

/**
 * Vendor query keys
 */
export const vendorKeys = {
  all: () => {
    const key = ['vendors'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  list: () => {
    const key = ['vendors'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  detail: (vendorId) => {
    const normalized = normalizeId(vendorId);
    const key = ['vendor', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// INVENTORY KEYS
// ============================================

/**
 * Inventory query keys
 */
export const inventoryKeys = {
  items: () => {
    const key = ['inventoryItems'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  forPart: (partId) => {
    const normalized = normalizeId(partId);
    const key = ['inventoryItems', 'forPart', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  locations: () => {
    const key = ['locations'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  partLocations: (partId) => {
    const normalized = normalizeId(partId);
    const key = ['inventoryLocations', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// LIFECYCLE KEYS
// ============================================

/**
 * Lifecycle action queue query keys
 */
export const lifecycleKeys = {
  actionQueue: () => {
    const key = ['lifecycleActionQueue'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  diagnostics: () => {
    const key = ['coverageDiagnostics'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  timeline: (partId) => {
    const normalized = normalizeId(partId);
    const key = ['partLifecycleTimeline', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// PROJECT KEYS
// ============================================

/**
 * Project query keys
 */
export const projectKeys = {
  all: () => {
    const key = ['projects'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  list: () => {
    const key = ['projects'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  detail: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    const key = ['project', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
  types: () => {
    const key = ['projectTypes'];
    assertPrimitiveQueryKey(key);
    return key;
  },
  financials: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    const key = ['projectFinancials', normalized];
    assertPrimitiveQueryKey(key);
    return key;
  },
};

// ============================================
// EXPORT ALL FACTORIES
// ============================================

export const queryKeyFactories = {
  billing: billingKeys,
  invoice: invoiceKeys,
  credit: creditKeys,
  financialProjects: financialProjectKeys,
  parts: partsKeys,
  supply: supplyKeys,
  commitment: commitmentKeys,
  order: orderKeys,
  receiving: receivingKeys,
  vendor: vendorKeys,
  inventory: inventoryKeys,
  lifecycle: lifecycleKeys,
  project: projectKeys,
};

export default queryKeyFactories;