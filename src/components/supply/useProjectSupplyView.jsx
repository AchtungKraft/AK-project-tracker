import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { extractRefreshContext } from "./forceAppRefresh";
import { getTieredRefresh } from "./tieredSupplyRefresh";
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
      const response = await base44.functions.invoke('getProjectSupplyView', {
        project_id: normalizedId,
        filters,
      });
      return response.data;
    },
    enabled: Boolean(normalizedId),
    // PHASE 1: Extended caching to prevent refetch storms
    staleTime: 60000,     // 1 minute
    gcTime: 300000,       // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false, // PHASE 1: Don't refetch on every mount
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
    invoices: query.data?.invoices || [],
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
      return response.data;
    },
    // PHASE 1: Extended caching to prevent refetch storms
    staleTime: 60000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
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
 * Two distinct return shapes depending on mode:
 * 
 * DETAIL MODE (orderId provided):
 *   Returns: { po, locations, isLoading, refetch, ... }
 *   po.lines[] contains full per-line detail (parts, projects, quantities).
 * 
 * LIST MODE (orderId = null):
 *   Returns: { orders, summary, locations, filterOptions, isLoading, refetch, ... }
 *   orders[] is SUMMARY-ONLY — no .lines array, no parts/commitments/projects.
 *   Supported order fields: order_id, po_number, vendor_id, vendor_name, status,
 *     order_date, order_number, order_url, total_lines, open_lines,
 *     total_qty_ordered, total_qty_received, total_qty_remaining, progress_pct,
 *     pdf_attachments.
 *   ⚠ Do NOT add per-line data to list mode — it regresses backend latency.
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
    // PHASE 1: No staleTime - trust hard invalidation from forceAppRefresh
    staleTime: 0,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Refetch on mount to get fresh data
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
 * ══════════════════════════════════════════════════════════════════════
 * useSupplyAction - Hook for executing supply mutations through dispatcher
 * 
 * All supply mutations MUST go through this hook or useSupplyAction.js.
 * Components MUST NOT write to commitment/inventory entities directly.
 * Legacy services (commitmentService.*) are hard-deprecated for lifecycle ops.
 * 
 * CANONICAL MUTATION ORDER (server-side):
 *   1. Validate payload
 *   2. Update inventory
 *   3. inlineRecompute(part_id)
 *   4. inlineRebalance(part_id)
 *   5. Update commitment_status
 *   6. Lifecycle events + audit
 * 
 * PHASE 17: Uses forceAppRefresh for deterministic post-mutation refresh.
 * ══════════════════════════════════════════════════════════════════════
 */
export function useSupplyAction(options = {}) {
  const queryClient = useQueryClient();
  const { showSuccessToast = true, onSuccess: customOnSuccess } = options;

  const mutation = useMutation({
    mutationFn: async ({ action_type, commitment_ids, payload, dry_run = false }) => {
      console.log("[useSupplyAction] START", { action_type, commitment_ids, payload, dry_run });
      
      // PHASE: Validate inputs before calling backend
      if (!action_type) {
        throw new Error("action_type is required");
      }
      
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type,
        commitment_ids: commitment_ids || [],
        payload: payload || {},
        dry_run,
      });
      
      console.log("[useSupplyAction] RESPONSE", response?.data);
      
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      return { ...response.data, _action_type: action_type, _payload: payload };
    },
    onSuccess: async (data, variables) => {
      console.log("[useSupplyAction] SUCCESS", { action: variables.action_type, data });
      
      // TIERED REFRESH: Action-specific invalidation replaces monolithic forceAppRefresh
      if (!variables.dry_run) {
        try {
          const context = extractRefreshContext(data, variables.payload);
          const actionType = data._action_type || variables.action_type;
          const refreshFn = getTieredRefresh(actionType);
          await refreshFn(queryClient, context, data);
        } catch (refreshErr) {
          console.error("[useSupplyAction] Refresh error (non-fatal):", refreshErr);
        }
        
        // PHASE 9I: Show toast for auto-reservation
        if (showSuccessToast && data.toast_notification) {
          import('sonner').then(({ toast }) => {
            toast.success(data.toast_notification.message);
          });
        }
      }
      
      // Call custom onSuccess if provided
      if (customOnSuccess) {
        try {
          customOnSuccess(data);
        } catch (callbackErr) {
          console.error("[useSupplyAction] onSuccess callback error:", callbackErr);
        }
      }
    },
    onError: (error, variables) => {
      console.error("[useSupplyAction] ERROR", { 
        action: variables.action_type, 
        error: error?.message || error,
        payload: variables.payload 
      });
    },
  });

  return {
    execute: mutation.mutateAsync,
    executeSync: mutation.mutate,
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
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