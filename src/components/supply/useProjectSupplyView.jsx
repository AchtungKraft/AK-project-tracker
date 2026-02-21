import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { invalidateSupplyQueries, extractInvalidationContext } from "./supplyInvalidation";

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

  const query = useQuery({
    queryKey: ['projectSupplyView', projectId, filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('getProjectSupplyView', {
        project_id: projectId,
        filters,
      });
      return response.data;
    },
    enabled: !!projectId,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['projectSupplyView', projectId] });
  };

  const items = query.data?.items || [];
  
  // DEV ONLY: Runtime schema validation and coverage invariant check
  if (process.env.NODE_ENV === 'development' && items.length > 0) {
    const sample = items[0];
    console.log('[DEV] Project Supply View - Sample commitment shape:', sample);
    
    // FAIL-FAST: Check canonical fields
    const required = ['commitment_id', 'required_total', 'to_order', 'coverage_status', 'reserved_from_stock', 'covered_from_po'];
    const missing = required.filter(f => sample[f] === undefined);
    if (missing.length > 0) {
      console.error('[CANONICAL VIOLATION] Missing required fields:', missing);
    }
    
    // COVERAGE INVARIANT CHECK: required_total MUST equal sum of coverage + to_order
    items.forEach(item => {
      const { commitment_id, required_total, reserved_from_stock, covered_from_po, to_order } = item;
      const sum = (reserved_from_stock || 0) + (covered_from_po || 0) + (to_order || 0);
      
      // Allow small floating point differences
      if (Math.abs(sum - required_total) > 0.01) {
        console.error(
          `[COVERAGE INVARIANT BROKEN] commitment=${commitment_id}: ` +
          `required_total(${required_total}) !== reserved(${reserved_from_stock}) + covered(${covered_from_po}) + to_order(${to_order}) = ${sum}`
        );
      }
    });
  }
  
  return {
    items,
    summary: query.data?.summary || {},
    categories: query.data?.categories || [],
    tabCounts: query.data?.tab_counts || {},
    project: query.data?.project || null,
    isLoading: query.isLoading,
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

  const query = useQuery({
    queryKey: ['opsSupplyView', mode, filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('getOpsSupplyView', {
        mode,
        filters,
      });
      return response.data;
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['opsSupplyView'] });
  };

  // Normalize filter_options to always have array properties
  const rawFilterOptions = query.data?.filter_options || {};
  const filterOptions = {
    vendors: rawFilterOptions.vendors || [],
    projects: rawFilterOptions.projects || [],
    statuses: rawFilterOptions.statuses || [],
    categories: rawFilterOptions.categories || [],
  };

  const items = query.data?.items || [];
  
  // DEV ONLY: Runtime schema validation
  if (process.env.NODE_ENV === 'development' && items.length > 0) {
    const sample = items[0];
    console.log('[DEV] Ops Supply View - Sample commitment shape:', sample);
    
    // FAIL-FAST: Check canonical fields
    const required = ['commitment_id', 'to_order', 'coverage_status'];
    const missing = required.filter(f => sample[f] === undefined);
    if (missing.length > 0) {
      console.error('[CANONICAL VIOLATION] Missing required fields:', missing);
    }
    
    // COVERAGE INVARIANT CHECK for ops view
    items.forEach(item => {
      const { commitment_id, required_total, reserved_from_stock, covered_from_po, to_order } = item;
      if (required_total !== undefined) {
        const sum = (reserved_from_stock || 0) + (covered_from_po || 0) + (to_order || 0);
        if (Math.abs(sum - required_total) > 0.01) {
          console.error(
            `[COVERAGE INVARIANT BROKEN] commitment=${commitment_id}: ` +
            `required_total(${required_total}) !== sum(${sum})`
          );
        }
      }
    });
  }
  
  return {
    items,
    summary: query.data?.summary || {},
    filterOptions,
    isLoading: query.isLoading,
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

  const query = useQuery({
    queryKey: ['poReceivingView', orderId, filters],
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
    queryClient.invalidateQueries({ queryKey: ['poReceivingView'] });
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
 * Uses unified invalidation helper to ensure all views stay in sync.
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
    onSuccess: (data, variables) => {
      // Use unified invalidation helper for consistent cache management
      if (!variables.dry_run) {
        const context = extractInvalidationContext(data, variables.payload);
        // Always do full invalidation for supply actions to ensure consistency
        invalidateSupplyQueries(queryClient, {
          ...context,
          invalidateAll: true,
        });
        
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