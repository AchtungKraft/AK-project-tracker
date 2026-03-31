/**
 * DEV-ONLY Query Tracing Utilities
 * 
 * Purpose: Identify exact invocation origins of heavy queries
 * that cause modal/page load timeouts.
 * 
 * Usage:
 * import { traceQueryFn, logQueryExecution } from '@/components/dev/traceQuery';
 * 
 * const { data } = useQuery({
 *   queryKey: ['myKey'],
 *   queryFn: traceQueryFn('MyComponent', ['myKey'], async () => { ... }),
 * });
 */

const IS_DEV = import.meta.env.DEV;

// Track active queries to detect duplicates
const activeQueries = new Map();
const queryHistory = [];
const MAX_HISTORY = 100;

/**
 * Wrap a queryFn to add tracing
 */
export function traceQueryFn(componentName, queryKey, queryFn, options = {}) {
  if (!IS_DEV) return queryFn;

  return async (...args) => {
    const keyStr = JSON.stringify(queryKey);
    const traceId = `${componentName}:${keyStr}:${Date.now()}`;
    const startTime = performance.now();

    // Detect reason for execution
    let reason = 'unknown';
    if (!activeQueries.has(keyStr)) {
      reason = 'mount';
    } else if (options.isModalOpen !== undefined && options.isModalOpen) {
      reason = 'modal_open';
    } else if (document.hasFocus && document.hasFocus()) {
      reason = 'possible_focus_refetch';
    } else {
      reason = 'props_change_or_manual';
    }

    activeQueries.set(keyStr, Date.now());

    console.log(`[TRACE:QUERY] START`, {
      component: componentName,
      queryKey: keyStr,
      reason,
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await queryFn(...args);
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      // Estimate payload size
      let payloadHint = 'unknown';
      let resultCounts = {};
      
      if (result !== null && result !== undefined) {
        try {
          const jsonStr = JSON.stringify(result);
          payloadHint = `~${Math.round(jsonStr.length / 1024)}KB`;
          
          // Extract counts from common patterns
          if (Array.isArray(result)) {
            resultCounts.items = result.length;
          } else if (typeof result === 'object') {
            if (result.items) resultCounts.items = result.items.length;
            if (result.parts) resultCounts.parts = result.parts.length;
            if (result.commitments) resultCounts.commitments = result.commitments.length;
            if (result.invoices) resultCounts.invoices = result.invoices.length;
            if (result.count !== undefined) resultCounts.count = result.count;
          }
        } catch (e) {
          payloadHint = 'non-serializable';
        }
      }

      const logEntry = {
        traceId,
        component: componentName,
        queryKey: keyStr,
        reason,
        duration_ms: duration,
        payload_hint: payloadHint,
        result_counts: resultCounts,
        timestamp: new Date().toISOString(),
        success: true,
      };

      console.log(`[TRACE:QUERY] END`, logEntry);
      
      // Store in history
      queryHistory.unshift(logEntry);
      if (queryHistory.length > MAX_HISTORY) queryHistory.pop();

      // Flag slow queries
      if (duration > 2000) {
        console.warn(`[TRACE:SLOW_QUERY] ${componentName} took ${duration}ms`, logEntry);
      }

      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      console.error(`[TRACE:QUERY] ERROR`, {
        component: componentName,
        queryKey: keyStr,
        reason,
        duration_ms: duration,
        error: error.message,
      });

      throw error;
    }
  };
}

/**
 * Log when a query execution happens (for use in existing hooks)
 */
export function logQueryExecution(componentName, queryKey, reason = 'unknown') {
  if (!IS_DEV) return;

  console.log(`[TRACE:QUERY:EXEC]`, {
    component: componentName,
    queryKey: JSON.stringify(queryKey),
    reason,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log modal open/close events
 */
export function logModalEvent(modalName, event, props = {}) {
  if (!IS_DEV) return;

  console.log(`[TRACE:MODAL] ${event}`, {
    modal: modalName,
    props: Object.keys(props).reduce((acc, key) => {
      const val = props[key];
      acc[key] = val === null ? 'null' : val === undefined ? 'undefined' : typeof val;
      return acc;
    }, {}),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log component mount with queries it will trigger
 */
export function logComponentMount(componentName, expectedQueries = []) {
  if (!IS_DEV) return;

  console.log(`[TRACE:MOUNT]`, {
    component: componentName,
    expectedQueries,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get query history for debugging
 */
export function getQueryHistory() {
  return queryHistory;
}

/**
 * Clear query tracking state
 */
export function clearQueryTracking() {
  activeQueries.clear();
  queryHistory.length = 0;
}

/**
 * Dump current state to console
 */
export function dumpQueryState() {
  if (!IS_DEV) return;

  console.group('[TRACE:DUMP] Query State');
  console.log('Active queries:', Object.fromEntries(activeQueries));
  console.log('Recent history:', queryHistory.slice(0, 10));
  console.groupEnd();
}

// Expose to window for debugging
if (IS_DEV && typeof window !== 'undefined') {
  window.__QUERY_TRACE__ = {
    getHistory: getQueryHistory,
    dump: dumpQueryState,
    clear: clearQueryTracking,
  };
}