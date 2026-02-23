/**
 * useSupplyState - Centralized Supply State Hook
 * 
 * This hook provides canonical supply state from the backend resolvers.
 * ALL UI components MUST use this hook instead of computing state locally.
 * 
 * Returns:
 * - Commitment state from resolveCommitmentState
 * - Part inventory state from resolvePartInventory
 * - Mutation actions via executeSupplyAction dispatcher
 * 
 * RULES:
 * 1. NO local quantity derivation (gap, coverage, etc.)
 * 2. NO direct entity writes (PartCommitment.update, Part.update, etc.)
 * 3. ALL mutations go through executeSupplyAction
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * Hook for commitment state resolution
 */
export function useCommitmentState(commitmentId, options = {}) {
  return useQuery({
    queryKey: ['commitmentState', commitmentId],
    queryFn: async () => {
      if (!commitmentId) return null;
      const response = await base44.functions.invoke('resolveCommitmentState', {
        commitment_id: commitmentId
      });
      return response.data;
    },
    enabled: !!commitmentId && options.enabled !== false,
    staleTime: 30000,
    ...options
  });
}

/**
 * Hook for batch commitment state resolution
 */
export function useCommitmentStates(commitmentIds, options = {}) {
  return useQuery({
    queryKey: ['commitmentStates', commitmentIds?.sort().join(',')],
    queryFn: async () => {
      if (!commitmentIds?.length) return { commitments: [] };
      const response = await base44.functions.invoke('resolveCommitmentState', {
        commitment_ids: commitmentIds
      });
      return response.data;
    },
    enabled: !!commitmentIds?.length && options.enabled !== false,
    staleTime: 30000,
    ...options
  });
}

/**
 * Hook for part inventory state resolution
 */
export function usePartInventoryState(partId, options = {}) {
  return useQuery({
    queryKey: ['partInventoryState', partId],
    queryFn: async () => {
      if (!partId) return null;
      const response = await base44.functions.invoke('resolvePartInventory', {
        part_id: partId
      });
      return response.data;
    },
    enabled: !!partId && options.enabled !== false,
    staleTime: 30000,
    ...options
  });
}

/**
 * Hook for batch part inventory state resolution
 */
export function usePartInventoryStates(partIds, options = {}) {
  return useQuery({
    queryKey: ['partInventoryStates', partIds?.sort().join(',')],
    queryFn: async () => {
      if (!partIds?.length) return { parts: [] };
      const response = await base44.functions.invoke('resolvePartInventory', {
        part_ids: partIds
      });
      return response.data;
    },
    enabled: !!partIds?.length && options.enabled !== false,
    staleTime: 30000,
    ...options
  });
}

/**
 * Hook for supply action dispatcher
 * This is the ONLY way to mutate supply state from UI
 * 
 * PHASE 17: Uses forceAppRefresh for deterministic post-mutation refresh.
 */
export function useSupplyAction(options = {}) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ action_type, commitment_ids, payload = {}, dry_run = false }) => {
      // Guard against direct entity writes
      if (!action_type) {
        throw new Error('action_type required for supply mutation');
      }
      
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type,
        commitment_ids,
        payload,
        dry_run
      });
      
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      
      return response.data;
    },
    onSuccess: async (data, variables) => {
      // PHASE 17: Use forceAppRefresh for deterministic refresh
      // Import must be dynamic to avoid circular dependency
      const { forceAppRefresh, extractRefreshContext } = await import('@/components/supply/forceAppRefresh');
      const context = extractRefreshContext(data, variables.payload);
      context.commitmentIds = [...(context.commitmentIds || []), ...(variables.commitment_ids || [])];
      await forceAppRefresh(queryClient, context);
      
      if (!variables.dry_run && options.showSuccessToast !== false) {
        const actionLabels = {
          ADJUST_REQUIRED: 'Requirement updated',
          AUTO_RESERVE: 'Stock reserved',
          CREATE_PO: 'Purchase order created',
          RECEIVE: 'Inventory received',
          INSTALL: 'Part installed',
          REVERSE_INSTALL: 'Installation reversed',
          ALLOCATE_POOL: 'Pool allocated',
          CANCEL_COMMITMENT: 'Commitment cancelled'
        };
        toast.success(actionLabels[variables.action_type] || 'Action completed');
      }
      
      if (options.onSuccess) {
        options.onSuccess(data, variables);
      }
    },
    onError: (error, variables) => {
      toast.error(`Supply action failed: ${error.message}`);
      if (options.onError) {
        options.onError(error, variables);
      }
    },
    ...options
  });
}

/**
 * Guard function to block direct entity mutations
 * Call this from any component that might accidentally bypass the dispatcher
 */
export function guardSupplyMutation(entityName, operation) {
  const blockedEntities = ['PartCommitment', 'Part', 'InventoryItem', 'PartPurchaseLineItem'];
  const blockedOperations = ['update', 'create', 'delete'];
  
  if (blockedEntities.includes(entityName) && blockedOperations.includes(operation)) {
    console.error(`Direct supply mutation blocked: ${entityName}.${operation}`);
    throw new Error(
      `Direct supply mutation blocked – use executeSupplyAction dispatcher instead of ${entityName}.${operation}`
    );
  }
}

/**
 * Helper to compute display labels for commitment state
 */
export function getCommitmentDisplayLabels(state) {
  if (!state) return {};
  
  return {
    required: state.required_total ?? 0,
    reserved: state.reserved_from_stock ?? 0,
    onOrder: state.covered_from_po ?? 0,
    toOrder: state.gap ?? 0,
    receivedNotInstalled: Math.max(0, (state.reserved_from_stock ?? 0) + (state.legacy?.qty_received ?? 0) - (state.qty_installed ?? 0)),
    installed: state.qty_installed ?? 0,
    coverageStatus: state.coverage_status ?? 'NOT_COVERED',
    lifecycleState: state.lifecycle_state ?? 'PLANNED'
  };
}

/**
 * Helper to compute display labels for inventory state
 */
export function getInventoryDisplayLabels(state) {
  if (!state) return {};
  
  return {
    inStock: state.physical_stock ?? 0,
    reserved: state.allocated_stock ?? 0,
    available: state.available_stock ?? 0,
    onOrder: state.on_order ?? 0,
    toOrder: state.global_gap ?? 0
  };
}

export default {
  useCommitmentState,
  useCommitmentStates,
  usePartInventoryState,
  usePartInventoryStates,
  useSupplyAction,
  guardSupplyMutation,
  getCommitmentDisplayLabels,
  getInventoryDisplayLabels
};