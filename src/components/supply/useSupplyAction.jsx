import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * useSupplyAction - Hook for executing canonical supply actions
 * 
 * This is the ONLY way UI components should mutate supply state.
 * All actions go through executeSupplyAction dispatcher.
 * 
 * Usage:
 * const { adjustRequired, createPO, receive, install } = useSupplyAction();
 * 
 * await adjustRequired({ 
 *   project_id, 
 *   part_id, 
 *   required_total_set: 5 
 * });
 */

export function useSupplyAction(options = {}) {
  const queryClient = useQueryClient();
  const { onSuccess, onError, invalidateKeys = [] } = options;

  // Default query keys to invalidate after any supply action
  // CANONICAL: Includes partsInventoryView for Parts Tracker alignment
  const defaultInvalidateKeys = [
    'projectSupplyView',
    'opsSupplyView',
    'partSupplyUsage',
    'partsInventoryView',  // CANONICAL: Parts Tracker read model
    'partCommitments',
    'projectCommitments',
    'commitmentState',
    'commitmentStates',
    'lifecycleActionQueue',
    'globalOrderQueue',
    'globalSupplyQueues',
    'parts',
    'part',  // Individual part queries
    ...invalidateKeys
  ];

  const invalidateQueries = () => {
    for (const key of defaultInvalidateKeys) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  // Base mutation for all supply actions
  const mutation = useMutation({
    mutationFn: async ({ action_type, commitment_ids = [], payload = {}, dry_run = false }) => {
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type,
        commitment_ids,
        payload,
        dry_run
      });

      const result = response.data;
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (data, variables) => {
      if (!variables.dry_run) {
        invalidateQueries();
      }
      onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      toast.error(`Action failed: ${error.message}`);
      onError?.(error, variables);
    }
  });

  // Convenience methods for common actions

  /**
   * ADJUST_REQUIRED - Create or update commitment quantity
   * 
   * @param {Object} params
   * @param {string} params.commitment_id - Existing commitment (optional)
   * @param {string} params.project_id - Project ID (required if no commitment_id)
   * @param {string} params.part_id - Part ID (required if no commitment_id)
   * @param {number} params.required_total_set - Set absolute value
   * @param {number} params.required_total_delta - Add/subtract from current
   * @param {string} params.source_type - SHOP_PURCHASED, CLIENT_SUPPLIED, AK_CUSTOM, TAKE_OFF
   * @param {boolean} params.dry_run - Preview only
   */
  const adjustRequired = async (params) => {
    const { commitment_id, dry_run = false, ...payload } = params;
    return mutation.mutateAsync({
      action_type: 'ADJUST_REQUIRED',
      commitment_ids: commitment_id ? [commitment_id] : [],
      payload,
      dry_run
    });
  };

  /**
   * AUTO_RESERVE - Reserve from available stock
   */
  const autoReserve = async (commitment_ids, dry_run = false) => {
    return mutation.mutateAsync({
      action_type: 'AUTO_RESERVE',
      commitment_ids: Array.isArray(commitment_ids) ? commitment_ids : [commitment_ids],
      payload: {},
      dry_run
    });
  };

  /**
   * CREATE_PO - Create purchase order for commitments
   */
  const createPO = async (commitment_ids, payload = {}, dry_run = false) => {
    return mutation.mutateAsync({
      action_type: 'CREATE_PO',
      commitment_ids: Array.isArray(commitment_ids) ? commitment_ids : [commitment_ids],
      payload,
      dry_run
    });
  };

  /**
   * RECEIVE - Receive inventory from PO
   * 
   * Single line: { line_item_id, qty_received, location_id }
   * Batch: { order_id, lines: [{ line_item_id, qty_received, location_id }] }
   */
  const receive = async (payload, dry_run = false) => {
    return mutation.mutateAsync({
      action_type: 'RECEIVE',
      commitment_ids: [],
      payload,
      dry_run
    });
  };

  /**
   * INSTALL - Consume reserved inventory
   */
  const install = async (commitment_id, payload = {}, dry_run = false) => {
    return mutation.mutateAsync({
      action_type: 'INSTALL',
      commitment_ids: [commitment_id],
      payload,
      dry_run
    });
  };

  /**
   * REVERSE_INSTALL - Undo installation
   */
  const reverseInstall = async (commitment_id, payload = {}, dry_run = false) => {
    return mutation.mutateAsync({
      action_type: 'REVERSE_INSTALL',
      commitment_ids: [commitment_id],
      payload,
      dry_run
    });
  };

  /**
   * CANCEL_COMMITMENT - Cancel a commitment
   */
  const cancelCommitment = async (commitment_id, reason, dry_run = false) => {
    return mutation.mutateAsync({
      action_type: 'CANCEL_COMMITMENT',
      commitment_ids: [commitment_id],
      payload: { reason },
      dry_run
    });
  };

  return {
    // Base mutation
    execute: mutation.mutateAsync,
    mutation,
    isPending: mutation.isPending,
    
    // Convenience methods
    adjustRequired,
    autoReserve,
    createPO,
    receive,
    install,
    reverseInstall,
    cancelCommitment,
    
    // Manual invalidation
    invalidateQueries
  };
}

export default useSupplyAction;