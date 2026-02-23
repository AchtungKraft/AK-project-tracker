/**
 * queryKeyFactories.js - Centralized Query Key Factories
 * 
 * SINGLE SOURCE OF TRUTH for ALL domain query keys.
 * All useQuery calls MUST use these factories to prevent key drift.
 * 
 * CANONICAL ARCHITECTURE LOCK - Phase 1
 * 
 * RULES:
 * - Keys are always string arrays (no object keys)
 * - projectId is always normalized to String OR null (never empty string)
 * - Empty string keys broke loading because useQuery enabled: Boolean("") is false
 *   but the query key still contained "" which caused cache key mismatches
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
  all: () => ['billingProcurementStates'],
  states: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['billingProcurementStates', normalized];
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
  all: () => ['projectInvoicesView'],
  view: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['projectInvoicesView', normalized];
  },
  lines: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['projectInvoiceLines', normalized];
  },
  commitments: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['projectInvoiceCommitments', normalized];
  },
  detail: (invoiceId) => {
    const normalized = normalizeId(invoiceId);
    return ['projectInvoice', normalized];
  },
};

// ============================================
// CREDIT KEYS
// ============================================

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
  projectLedger: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['projectCreditLedger', normalized];
  },
  projectBalance: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['projectCreditBalance', normalized];
  },
};

// ============================================
// FINANCIAL PROJECTS KEYS
// ============================================

/**
 * Financial projects view (global list)
 */
export const financialProjectKeys = {
  all: () => ['financialProjectsView'],
};

// ============================================
// PARTS KEYS
// ============================================

/**
 * Parts catalog and inventory query keys
 */
export const partsKeys = {
  all: () => ['parts'],
  list: () => ['parts'],
  detail: (partId) => {
    const normalized = normalizeId(partId);
    return ['part', normalized];
  },
  inventory: () => ['partsInventoryView'],
  inventoryForPart: (partId) => {
    const normalized = normalizeId(partId);
    return ['partsInventoryView', normalized];
  },
  supplyUsage: (partId) => {
    const normalized = normalizeId(partId);
    return ['partSupplyUsage', normalized];
  },
  categories: () => ['partCategories'],
};

// ============================================
// SUPPLY KEYS
// ============================================

/**
 * Supply view query keys
 * SOURCE: getProjectSupplyView, getOpsSupplyView
 */
export const supplyKeys = {
  // FIX: filters param should already be serialized string for key stability
  // If object passed, serialize it to prevent new object identity on each call
  projectView: (projectId, filters = '{}') => {
    const normalized = normalizeProjectId(projectId);
    // Accept either string (serialized) or object (legacy) - normalize to string
    const filtersKey = typeof filters === 'string' ? filters : JSON.stringify(filters ?? {});
    return ['projectSupplyView', normalized, filtersKey];
  },
  opsView: (mode, filters = {}) => {
    const filtersKey = typeof filters === 'string' ? filters : JSON.stringify(filters ?? {});
    return ['opsSupplyView', mode, filtersKey];
  },
  poReceiving: (orderId, filters = {}) => {
    const normalized = normalizeId(orderId);
    const filtersKey = typeof filters === 'string' ? filters : JSON.stringify(filters ?? {});
    return ['poReceivingView', normalized, filtersKey];
  },
  portfolio: () => ['portfolioSupplyState'],
  globalQueues: () => ['globalSupplyQueues'],
};

// ============================================
// COMMITMENT KEYS
// ============================================

/**
 * Commitment query keys
 */
export const commitmentKeys = {
  all: () => ['partCommitments'],
  forProject: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['projectCommitments', normalized];
  },
  forPart: (partId) => {
    const normalized = normalizeId(partId);
    return ['partCommitments', normalized];
  },
  detail: (commitmentId) => {
    const normalized = normalizeId(commitmentId);
    return ['commitmentDetails', normalized];
  },
  state: (commitmentId) => {
    const normalized = normalizeId(commitmentId);
    return ['commitmentState', normalized];
  },
};

// ============================================
// ORDER KEYS
// ============================================

/**
 * Order/PO query keys
 */
export const orderKeys = {
  all: () => ['orders'],
  list: () => ['orders'],
  detail: (orderId) => {
    const normalized = normalizeId(orderId);
    return ['order', normalized];
  },
  lineItems: () => ['partPurchaseLineItems'],
  forOrder: (orderId) => {
    const normalized = normalizeId(orderId);
    return ['orderLineItems', normalized];
  },
};

// ============================================
// RECEIVING KEYS
// ============================================

/**
 * Receiving/inventory query keys
 */
export const receivingKeys = {
  poList: (filters = {}) => ['poReceivingView', null, filters],
  poDetail: (orderId, filters = {}) => {
    const normalized = normalizeId(orderId);
    return ['poReceivingView', normalized, filters];
  },
};

// ============================================
// VENDOR KEYS
// ============================================

/**
 * Vendor query keys
 */
export const vendorKeys = {
  all: () => ['vendors'],
  list: () => ['vendors'],
  detail: (vendorId) => {
    const normalized = normalizeId(vendorId);
    return ['vendor', normalized];
  },
};

// ============================================
// INVENTORY KEYS
// ============================================

/**
 * Inventory query keys
 */
export const inventoryKeys = {
  items: () => ['inventoryItems'],
  forPart: (partId) => {
    const normalized = normalizeId(partId);
    return ['inventoryItems', 'forPart', normalized];
  },
  locations: () => ['locations'],
  partLocations: (partId) => {
    const normalized = normalizeId(partId);
    return ['inventoryLocations', normalized];
  },
};

// ============================================
// LIFECYCLE KEYS
// ============================================

/**
 * Lifecycle action queue query keys
 */
export const lifecycleKeys = {
  actionQueue: () => ['lifecycleActionQueue'],
  diagnostics: () => ['coverageDiagnostics'],
  timeline: (partId) => {
    const normalized = normalizeId(partId);
    return ['partLifecycleTimeline', normalized];
  },
};

// ============================================
// PROJECT KEYS
// ============================================

/**
 * Project query keys
 */
export const projectKeys = {
  all: () => ['projects'],
  list: () => ['projects'],
  detail: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['project', normalized];
  },
  types: () => ['projectTypes'],
  financials: (projectId) => {
    const normalized = normalizeProjectId(projectId);
    return ['projectFinancials', normalized];
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