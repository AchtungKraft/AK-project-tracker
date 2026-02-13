import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Phase 9.5 — Lifecycle State Hook
 * 
 * GOVERNANCE: This is the ONLY approved hook for accessing lifecycle data in UI.
 * UI components must NOT directly read:
 * - billing_status
 * - order.status
 * - vendor_invoice.invoice_status
 * 
 * Instead, use this hook which consumes:
 * - resolvePartLifecycleState
 * - getLifecycleActionQueue
 */

// Action types available for execution
export const ACTION_TYPES = {
  INVOICE_CLIENT: 'INVOICE_CLIENT',
  RECORD_PAYMENT: 'RECORD_PAYMENT',
  CREATE_ORDER: 'CREATE_ORDER',
  RECEIVE_PART: 'RECEIVE_PART',
  INSTALL_PART: 'INSTALL_PART',
  FIX_DATA: 'FIX_DATA',
};

// Map recommended_action to action_type
const ACTION_MAPPING = {
  'Invoice Client': ACTION_TYPES.INVOICE_CLIENT,
  'Await Client Payment': ACTION_TYPES.RECORD_PAYMENT,
  'Create Vendor Order': ACTION_TYPES.CREATE_ORDER,
  'Track Vendor Delivery': ACTION_TYPES.RECEIVE_PART,
  'Schedule Installation': ACTION_TYPES.INSTALL_PART,
  'Fix Missing Data': ACTION_TYPES.FIX_DATA,
};

// Map action to required modal
export const ACTION_MODALS = {
  INVOICE_CLIENT: 'invoice_batch',
  RECORD_PAYMENT: 'record_payment',
  CREATE_ORDER: 'create_po',
  RECEIVE_PART: 'receive_inventory',
  INSTALL_PART: 'install_part',
  FIX_DATA: 'lifecycle_timeline',
};

/**
 * Hook to get lifecycle action queue data
 * Use this for workbench/dashboard views
 */
export function useLifecycleActionQueue(filters = {}) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['lifecycleActionQueue', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('getLifecycleActionQueue', { filters });
      return response.data;
    },
    staleTime: 30000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['lifecycleActionQueue'] });
  };

  return {
    ...query,
    refresh,
    kpis: query.data?.kpis || {},
    actionGroups: query.data?.action_groups || [],
    allCommitments: query.data?.action_groups?.flatMap(g => g.commitments) || [],
  };
}

/**
 * Hook to get lifecycle state for specific commitments
 * Use this for detail views
 */
export function useLifecycleState(commitmentIds = [], filters = {}) {
  return useQuery({
    queryKey: ['lifecycleState', commitmentIds, filters],
    queryFn: async () => {
      if (!commitmentIds.length) return { results: [] };
      const response = await base44.functions.invoke('resolvePartLifecycleState', {
        commitment_ids: commitmentIds,
        filters,
      });
      return response.data;
    },
    enabled: commitmentIds.length > 0,
    staleTime: 30000,
  });
}

/**
 * Hook to get coverage diagnostics
 */
export function useCoverageDiagnostics(enabled = false) {
  return useQuery({
    queryKey: ['coverageDiagnostics'],
    queryFn: async () => {
      const response = await base44.functions.invoke('diagnoseActionWorkbenchCoverage', {
        options: { limit: 50 }
      });
      return response.data;
    },
    enabled,
    staleTime: 60000,
  });
}

/**
 * Hook to execute lifecycle actions
 */
export function useLifecycleAction() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ commitmentId, actionType, actionData }) => {
      const response = await base44.functions.invoke('executeLifecyclePrimaryAction', {
        commitment_id: commitmentId,
        action_type: actionType,
        action_data: actionData,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lifecycleActionQueue'] });
      queryClient.invalidateQueries({ queryKey: ['lifecycleState'] });
    },
  });

  return {
    executeAction: mutation.mutate,
    executeActionAsync: mutation.mutateAsync,
    isExecuting: mutation.isPending,
    error: mutation.error,
    result: mutation.data,
  };
}

/**
 * Derive action type from recommended action string
 */
export function getActionTypeFromRecommendation(recommendedAction) {
  return ACTION_MAPPING[recommendedAction] || null;
}

/**
 * Get modal type required for an action
 */
export function getModalForAction(actionType) {
  return ACTION_MODALS[actionType] || null;
}

/**
 * Check if an action requires a modal (vs direct execution)
 */
export function actionRequiresModal(actionType) {
  return [
    ACTION_TYPES.CREATE_ORDER,
    ACTION_TYPES.RECEIVE_PART,
    ACTION_TYPES.INSTALL_PART,
    ACTION_TYPES.FIX_DATA,
  ].includes(actionType);
}

export default useLifecycleActionQueue;