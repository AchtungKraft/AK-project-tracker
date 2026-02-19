import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

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

  return {
    items: query.data?.items || [],
    summary: query.data?.summary || {},
    pools: query.data?.pools || [],
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

  return {
    items: query.data?.items || [],
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
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all supply-related queries after successful mutation
      if (!variables.dry_run) {
        queryClient.invalidateQueries({ queryKey: ['projectSupplyView'] });
        queryClient.invalidateQueries({ queryKey: ['opsSupplyView'] });
        queryClient.invalidateQueries({ queryKey: ['poReceivingView'] });
        queryClient.invalidateQueries({ queryKey: ['projectCommitments'] });
        queryClient.invalidateQueries({ queryKey: ['parts'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
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