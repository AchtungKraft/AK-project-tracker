import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { forceAppRefresh, extractRefreshContext } from "./forceAppRefresh";
import { 
  normalizeProjectId, 
  normalizeId,
  supplyKeys,
  partsKeys,
  commitmentKeys,
  orderKeys,
  receivingKeys,
  inventoryKeys,
  lifecycleKeys,
} from "@/components/financial/queryKeyFactories";

// Re-export supplyKeys for backwards compatibility
export { supplyKeys };

/**
 * useProjectSupplyView - Hook for consuming project supply read model
 * 
 * This is the ONLY way project components should access supply state.
 * Components MUST NOT compute coverage, to_order, or next_action locally.
 * 
 * Returns: { items, summary, pools, tabCounts, isLoading, refetch }
 */
export function useProjectSupplyView(projectId, filters = {}) {
  const queryClient = useQueryClient();
  // DETERMINISTIC: Normalize projectId once
  const normalizedId = normalizeProjectId(projectId);

  // CANONICAL: Pass raw filters to factory - serialization happens ONLY in factory
  const queryKey = supplyKeys.projectView(normalizedId, filters);
  
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      // Defensive: prevent query if no valid projectId
      if (!normalizedId) return null;
      const _start = Date.now();
      if (process.env.NODE_ENV === 'development') {
        console.log('[useProjectSupplyView] queryFn EXECUTING for projectId:', normalizedId);
      }
      const response = await base44.functions.invoke('getProjectSupplyView', {
        project_id: normalizedId,
        filters,
      });
      if (process.env.NODE_ENV === 'development') {
        console.log(`[PERF] getProjectSupplyView ${Date.now() - _start}ms`, {
          items: response.data?.items?.length,
          projectId: normalizedId
        });
      }
      return response.data;
    },
    enabled: Boolean(normalizedId),
    // PERF: Safe caching - 15s stale, 60s cache, no refetch on focus
    staleTime: 15000,
    gcTime: 60000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: 'always',
    retry: (failureCount, error) => {
      if (error?.status === 429) return false;
      return failureCount < 1;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: supplyKeys.projectView(normalizedId) });
  };

  // PERF FIX: Trust backend canonical values - NO frontend re-derivation
  // Backend is the single source of truth for to_order, coverage_status, gap_qty
  const items = query.data?.items || [];
  
  // PHASE 3: Detect stuck loading state
  // isLoading is true only on initial load. isFetching can stay true longer.
  // If error exists, loading is done (even if failed)
  const effectiveLoading = query.isLoading && !query.isError;
  
  return {
    items,
    summary: query.data?.summary || {},
    categories: query.data?.categories || [],
    tabCounts: query.data?.tab_counts || {},
    project: query.data?.project || null,
    isLoading: effectiveLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    invalidate,
  };
}

/**
 * useOpsSupplyView - Hook for consuming global/ops supply read model
 * 
 * Modes: 'ORDERING' | 'RECEIVING' | 'INSTALL' | 'ALL'
 */
export function useOpsSupplyView(mode = 'ORDERING', filters = {}) {
  const queryClient = useQueryClient();
  const queryKey = supplyKeys.opsView(mode, filters);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const _start = Date.now();
      const response = await base44.functions.invoke('getOpsSupplyView', {
        mode,
        filters,
      });
      if (process.env.NODE_ENV === 'development') {
        console.log(`[PERF] getOpsSupplyView ${Date.now() - _start}ms`, {
          mode,
          items: response.data?.items?.length
        });
      }
      return response.data;
    },
    // PERF: Safe caching - 15s stale, 60s cache, no refetch on focus
    staleTime: 15000,
    gcTime: 60000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: 'always',
    retry: (failureCount, error) => {
      if (error?.status === 429) return false;
      return failureCount < 1;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: supplyKeys.opsView(mode) });
  };

  // Normalize filter_options to always have array properties
  const rawFilterOptions = query.data?.filter_options || {};
  const filterOptions = {
    vendors: rawFilterOptions.vendors || [],
    projects: rawFilterOptions.projects || [],
    statuses: rawFilterOptions.statuses || [],
    categories: rawFilterOptions.categories || [],
  };

  // PERF FIX: Trust backend canonical values - NO frontend re-derivation
  const items = query.data?.items || [];
  
  // PHASE 3: Detect stuck loading state
  const effectiveLoading = query.isLoading && !query.isError;
  
  return {
    items,
    summary: query.data?.summary || {},
    filterOptions,
    isLoading: effectiveLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    invalidate,
  };
}

/**
 * usePOReceivingView - Hook for PO-centric receiving
 * 
 * If orderId provided, returns single PO detail.
 * Otherwise returns list of receivable POs.
 */
export function usePOReceivingView(orderId = null, filters = {}) {
  const queryClient = useQueryClient();
  const queryKey = supplyKeys.poReceiving(orderId, filters);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await base44.functions.invoke('getPOReceivingView', {
        order_id: orderId,
        filters,
      });
      return response.data;
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: supplyKeys.poReceiving(orderId) });
  };

  // For single PO detail
  if (orderId) {
    return {
      po: query.data?.po || null,
      locations: query.data?.locations || [],
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
      refetch: query.refetch,
      invalidate,
    };
  }

  // For list of POs
  return {
    orders: query.data?.orders || [],
    summary: query.data?.summary || {},
    locations: query.data?.locations || [],
    filterOptions: query.data?.filter_options || {},
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    invalidate,
  };
}

/**
 * useSupplyAction - Hook for executing supply mutations through dispatcher
 * 
 * All supply mutations MUST go through this hook.
 * Components MUST NOT write to commitment/inventory entities directly.
 * 
 * PHASE 17: Uses forceAppRefresh for deterministic post-mutation refresh.
 */
export function useSupplyAction() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ action_type, commitment_ids, payload, dry_run = false }) => {
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type,
        commitment_ids,
        payload,
        dry_run,
      });
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      return { ...response.data, _action_type: action_type, _payload: payload };
    },
    onSuccess: async (data, variables) => {
      // PHASE 17: Use forceAppRefresh for deterministic refresh
      if (!variables.dry_run) {
        const context = extractRefreshContext(data, variables.payload);
        await forceAppRefresh(queryClient, context);
        
        // PHASE 9I: Show toast for auto-reservation
        if (data.toast_notification) {
          // Import toast dynamically to avoid circular deps
          import('sonner').then(({ toast }) => {
            toast.success(data.toast_notification.message);
          });
        }
      }
    },
  });

  return {
    execute: mutation.mutateAsync,
    executeSync: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
  };
}

/**
 * useSupplyActionPreview - Execute dry_run to preview action results
 */
export function useSupplyActionPreview() {
  const mutation = useMutation({
    mutationFn: async ({ action_type, commitment_ids, payload }) => {
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type,
        commitment_ids,
        payload,
        dry_run: true,
      });
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      return response.data;
    },
  });

  return {
    preview: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
  };
}

// Re-export diagnostic functions for external use
export { 
  diagnoseSupplyItems, 
  diagnoseCommitment, 
  compareViews, 
  runCrossViewComparison, 
  runFullDiagnosticReport 
} from "./supplyDiagnostics";