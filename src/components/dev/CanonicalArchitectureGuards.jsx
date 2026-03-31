/**
 * CanonicalArchitectureGuards.js - DEV-only runtime validation
 * 
 * CANONICAL ARCHITECTURE LOCK - Phase 1
 * 
 * These guards run ONLY in development to detect architecture violations:
 * - Invoice history fields used for exposure calculation
 * - Raw query keys instead of factories
 * - projectId normalization returning empty string
 * - Invoice creation outside canonical modal
 * 
 * NO PRODUCTION IMPACT - all checks are wrapped in NODE_ENV checks.
 */

// ============================================
// GLOBAL DEV FLAGS (set by components on mount)
// ============================================

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  // Track which invoice creation surfaces are active
  window.__INVOICE_CREATION_SURFACES__ = window.__INVOICE_CREATION_SURFACES__ || new Set();
  
  // Track detected violations
  window.__ARCHITECTURE_VIOLATIONS__ = window.__ARCHITECTURE_VIOLATIONS__ || [];
  
  // Expected canonical modal
  window.__CANONICAL_INVOICE_MODAL__ = 'CreateProjectInvoiceModal';
  
  // Deprecated ordering function removed
  window.__GLOBAL_ORDER_QUEUE_REMOVED__ = true;
}

// ============================================
// VIOLATION TYPES
// ============================================

export const VIOLATION_TYPES = {
  INVOICE_HISTORY_FOR_EXPOSURE: 'INVOICE_HISTORY_FOR_EXPOSURE',
  RAW_QUERY_KEY: 'RAW_QUERY_KEY',
  EMPTY_STRING_PROJECT_ID: 'EMPTY_STRING_PROJECT_ID',
  NON_CANONICAL_INVOICE_CREATION: 'NON_CANONICAL_INVOICE_CREATION',
  DEPRECATED_FUNCTION_CALL: 'DEPRECATED_FUNCTION_CALL',
};

// ============================================
// VIOLATION LOGGING
// ============================================

/**
 * Log an architecture violation (DEV only)
 */
export function logViolation(type, details) {
  if (!import.meta.env.DEV) return;
  
  const violation = {
    type,
    details,
    timestamp: new Date().toISOString(),
    stack: new Error().stack,
  };
  
  window.__ARCHITECTURE_VIOLATIONS__ = window.__ARCHITECTURE_VIOLATIONS__ || [];
  window.__ARCHITECTURE_VIOLATIONS__.push(violation);
  
  console.error(`[ARCHITECTURE_VIOLATION] ${type}:`, details);
}

// ============================================
// EXPOSURE CALCULATION GUARDS
// ============================================

/**
 * Warn if invoice history fields are used for exposure calculation
 */
export function guardExposureCalculation(source, data, operation) {
  if (!import.meta.env.DEV) return;
  
  const historyFields = [
    'invoices',
    'invoice_count', 
    'total_invoiced_from_history',
    'paid_amount_from_history',
    'invoice_lines_count',
  ];
  
  // Check if data object contains history fields being used for exposure
  for (const field of historyFields) {
    if (data && data[field] !== undefined && operation === 'exposure') {
      logViolation(VIOLATION_TYPES.INVOICE_HISTORY_FOR_EXPOSURE, {
        source,
        field,
        message: `Invoice history field "${field}" should not be used for exposure calculation. Use getBillingAndProcurementStates instead.`,
      });
    }
  }
}

/**
 * Validate that exposure comes from canonical source
 */
export function validateExposureSource(source, exposureValue, sourceFunction) {
  if (!import.meta.env.DEV) return;
  
  const canonicalSources = [
    'getBillingAndProcurementStates',
    'useBillingAndProcurementStates',
  ];
  
  if (!canonicalSources.includes(sourceFunction)) {
    logViolation(VIOLATION_TYPES.INVOICE_HISTORY_FOR_EXPOSURE, {
      source,
      exposureValue,
      providedSource: sourceFunction,
      message: `Exposure value should come from ${canonicalSources.join(' or ')}, not ${sourceFunction}`,
    });
  }
}

// ============================================
// QUERY KEY GUARDS
// ============================================

/**
 * Detect raw query key arrays that should use factories
 */
export function guardQueryKey(key, component) {
  if (!import.meta.env.DEV) return;
  
  // Known factory-managed key prefixes
  const managedPrefixes = [
    'billingProcurementStates',
    'projectInvoicesView',
    'projectInvoiceLines',
    'projectInvoiceCommitments',
    'creditAllocations',
    'creditLedger',
    'projectCreditLedger',
    'financialProjectsView',
    'parts',
    'partsInventoryView',
    'partSupplyUsage',
    'projectSupplyView',
    'opsSupplyView',
    'poReceivingView',
    'projectCommitments',
    'partCommitments',
    'commitmentDetails',
    'orders',
    'partPurchaseLineItems',
    'lifecycleActionQueue',
    'coverageDiagnostics',
    'vendors',
    'inventoryItems',
    'locations',
  ];
  
  if (!Array.isArray(key)) {
    logViolation(VIOLATION_TYPES.RAW_QUERY_KEY, {
      component,
      key,
      message: 'Query key is not an array',
    });
    return;
  }
  
  const prefix = key[0];
  if (managedPrefixes.includes(prefix)) {
    // This key SHOULD be using a factory - log for audit
    // (This is informational, not necessarily a violation)
    console.log(`[QueryKey Audit] ${component} using managed key:`, key);
  }
}

// ============================================
// PROJECT ID NORMALIZATION GUARDS
// ============================================

/**
 * Warn if projectId normalization returns empty string
 */
export function guardProjectIdNormalization(input, output, source) {
  if (!import.meta.env.DEV) return;
  
  if (output === '') {
    logViolation(VIOLATION_TYPES.EMPTY_STRING_PROJECT_ID, {
      source,
      input,
      output,
      message: 'normalizeProjectId should return null, not empty string. This causes cache key mismatches.',
    });
  }
}

// ============================================
// INVOICE CREATION GUARDS
// ============================================

/**
 * Register an invoice creation surface (call on component mount)
 */
export function registerInvoiceCreationSurface(surfaceName) {
  if (!import.meta.env.DEV) return;
  
  window.__INVOICE_CREATION_SURFACES__ = window.__INVOICE_CREATION_SURFACES__ || new Set();
  window.__INVOICE_CREATION_SURFACES__.add(surfaceName);
  
  const canonical = window.__CANONICAL_INVOICE_MODAL__;
  if (surfaceName !== canonical) {
    logViolation(VIOLATION_TYPES.NON_CANONICAL_INVOICE_CREATION, {
      surfaceName,
      canonicalModal: canonical,
      message: `Invoice creation should ONLY happen via ${canonical}. Found: ${surfaceName}`,
    });
  }
}

/**
 * Guard against direct invoice mutation calls
 */
export function guardInvoiceMutation(functionName, callingComponent) {
  if (!import.meta.env.DEV) return;
  
  const invoiceMutationFunctions = [
    'createProjectInvoiceDraft',
    'markInvoiceSent',
    'markInvoicePaid',
  ];
  
  const allowedCallers = [
    'CreateProjectInvoiceModal',
    'ProjectInvoiceDetailDrawer', // For mark sent/paid actions
  ];
  
  if (invoiceMutationFunctions.includes(functionName)) {
    if (!allowedCallers.includes(callingComponent)) {
      logViolation(VIOLATION_TYPES.NON_CANONICAL_INVOICE_CREATION, {
        functionName,
        callingComponent,
        allowedCallers,
        message: `Invoice mutation "${functionName}" called from non-canonical component "${callingComponent}". Should be called from: ${allowedCallers.join(', ')}`,
      });
    }
  }
}

// ============================================
// DEPRECATED FUNCTION GUARDS
// ============================================

/**
 * Guard against calling deprecated functions
 */
export function guardDeprecatedFunction(functionName, replacement, callingComponent) {
  if (!import.meta.env.DEV) return;
  
  const deprecatedFunctions = {
    'getGlobalOrderQueue': 'getOpsSupplyView',
    'InvoiceBatch': 'ProjectInvoice',
    'createInvoiceBatch': 'createProjectInvoiceDraft',
  };
  
  if (deprecatedFunctions[functionName]) {
    logViolation(VIOLATION_TYPES.DEPRECATED_FUNCTION_CALL, {
      functionName,
      replacement: replacement || deprecatedFunctions[functionName],
      callingComponent,
      message: `Deprecated function "${functionName}" called. Use "${deprecatedFunctions[functionName]}" instead.`,
    });
  }
}

// ============================================
// VIOLATION SUMMARY (for dev console)
// ============================================

/**
 * Print violation summary to console
 */
export function printViolationSummary() {
  if (!import.meta.env.DEV) return;
  
  const violations = window.__ARCHITECTURE_VIOLATIONS__ || [];
  
  if (violations.length === 0) {
    console.log('[ARCHITECTURE] ✅ No violations detected');
    return;
  }
  
  console.group(`[ARCHITECTURE] ⚠️ ${violations.length} violations detected`);
  
  const byType = violations.reduce((acc, v) => {
    acc[v.type] = acc[v.type] || [];
    acc[v.type].push(v);
    return acc;
  }, {});
  
  for (const [type, items] of Object.entries(byType)) {
    console.group(`${type} (${items.length})`);
    items.forEach(v => console.log(v.details));
    console.groupEnd();
  }
  
  console.groupEnd();
}

// ============================================
// AUTO-RUN SUMMARY ON PAGE LOAD (DEV)
// ============================================

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  // Print summary after page settles
  setTimeout(() => {
    printViolationSummary();
  }, 5000);
}

export default {
  logViolation,
  guardExposureCalculation,
  validateExposureSource,
  guardQueryKey,
  guardProjectIdNormalization,
  registerInvoiceCreationSurface,
  guardInvoiceMutation,
  guardDeprecatedFunction,
  printViolationSummary,
  VIOLATION_TYPES,
};