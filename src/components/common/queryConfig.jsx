/**
 * GLOBAL QUERY CLIENT CONFIGURATION
 * 
 * PHASE 1 Implementation: Query Hardening
 * 
 * This module provides the default configuration for React Query
 * to prevent:
 * - Refetch loops
 * - Burst mounts
 * - Focus-triggered reload storms
 * - Rate limit cascades (429 errors)
 * 
 * USAGE:
 * Import and apply in your QueryClient setup:
 * 
 * import { defaultQueryOptions } from '@/components/common/queryConfig';
 * const queryClient = new QueryClient({ defaultOptions: defaultQueryOptions });
 */

/**
 * Default query options for production stability
 */
export const defaultQueryOptions = {
  queries: {
    // Data considered fresh for 1 minute
    staleTime: 60000,
    
    // Keep data in cache for 5 minutes after all components unmount
    gcTime: 300000,
    
    // CRITICAL: Prevent focus-triggered refetches
    refetchOnWindowFocus: false,
    
    // CRITICAL: Prevent mount-triggered refetches for already-cached data
    refetchOnMount: false,
    
    // Prevent reconnect floods
    refetchOnReconnect: false,
    
    // Limit retries to prevent cascade failures
    retry: 1,
    
    // Retry delay to prevent burst retries
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  },
  mutations: {
    // Retry mutations once on failure
    retry: 1,
  },
};

/**
 * Stable query key builder
 * 
 * PHASE 9: Ensures query keys are stable arrays of primitives
 * Never pass inline objects as query keys.
 * 
 * @param {string} base - Base query key
 * @param {...any} params - Additional primitive parameters
 * @returns {Array} Stable query key array
 */
export function buildQueryKey(base, ...params) {
  // Filter out undefined/null params, convert objects to stable strings
  const stableParams = params
    .filter(p => p !== undefined && p !== null)
    .map(p => {
      if (typeof p === 'object') {
        // Sort keys for stability
        return JSON.stringify(p, Object.keys(p).sort());
      }
      return p;
    });
  
  return [base, ...stableParams];
}

/**
 * Reference data query configuration
 * Extended stale/cache times for rarely-changing reference data
 */
export const referenceDataConfig = {
  staleTime: 300000,    // 5 minutes
  gcTime: 600000,       // 10 minutes
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
  retry: 2,
};

/**
 * Operational data query configuration
 * Shorter stale times for frequently-changing data
 */
export const operationalDataConfig = {
  staleTime: 30000,     // 30 seconds
  gcTime: 120000,       // 2 minutes
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 1,
};

export default defaultQueryOptions;