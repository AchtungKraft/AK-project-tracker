import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { extractRefreshContext } from "@/components/supply/forceAppRefresh";
import { getTieredRefresh } from "@/components/supply/tieredSupplyRefresh";

/**
 * ══════════════════════════════════════════════════════════════════════
 * useSupplyAction — Canonical Frontend Supply Mutation Hook
 * 
 * This is the ONLY approved way for UI components to mutate supply state.
 * All actions route through executeSupplyAction (the backend dispatcher).
 * 
 * ARCHITECTURE RULES:
 *   1. Components MUST NOT write to PartCommitment, Part.physical_stock,
 *      InventoryItem, or InstalledPart entities directly.
 *   2. Legacy services (commitmentService.*) are hard-deprecated for
 *      lifecycle mutations and will throw errors if called.
 *   3. Every mutation triggers tiered refresh for action-specific UI update.
 *   4. Recompute + rebalance happen server-side inside executeSupplyAction.
 *      No frontend code should attempt to recompute inventory state.
 * 
 * TIERED REFRESH: Uses getTieredRefresh for action-specific invalidation
 * 
 * Usage:
 *   const { install, reverseInstall, receive, cancelCommitment } = useSupplyAction();
 *   await install(commitmentId, { qty_to_install: 2 });
 * ══════════════════════════════════════════════════════════════════════
 */

// STEP 7 — CONCURRENCY GUARD: Prevents rapid-fire duplicate submissions
const _inflightKeys = new Set();

function makeInflightKey(action_type, commitment_ids, payload) {
  // Key = action + sorted commitment IDs + essential payload fields
  const ids = [...(commitment_ids || [])].sort().join(',');
  const sig = [payload.part_id, payload.project_id, payload.order_id, payload.line_item_id].filter(Boolean).join(':');
  return `${action_type}|${ids}|${sig}`;
}

export function useSupplyAction(options = {}) {
  const queryClient = useQueryClient();
  const { onSuccess, onError, showSuccessToast = false } = options;

  // Base mutation for all supply actions
  const mutation = useMutation({
    mutationFn: async ({ action_type, commitment_ids = [], payload = {}, dry_run = false }) => {
      // STEP 7: Concurrency guard — block duplicate in-flight mutations
      const flightKey = makeInflightKey(action_type, commitment_ids, payload);
      if (!dry_run && _inflightKeys.has(flightKey)) {
        throw new Error(`DUPLICATE_MUTATION_BLOCKED: ${action_type} already in flight`);
      }
      if (!dry_run) _inflightKeys.add(flightKey);
      try {
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
        return { ...result, _payload: payload, _action_type: action_type };
      } finally {
        _inflightKeys.delete(flightKey);
      }
    },
    onSuccess: async (data, variables) => {
      if (!variables.dry_run) {
        // TIERED REFRESH: Action-specific invalidation replaces monolithic forceAppRefresh
        const context = extractRefreshContext(data, variables.payload);
        const actionType = data._action_type || variables.action_type;
        const refreshFn = getTieredRefresh(actionType);
        await refreshFn(queryClient, context, data);
      }
      if (showSuccessToast && data._action_type) {
        toast.success(`${data._action_type} completed`);
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
    // Base mutation - also expose as mutate for compatibility
    execute: mutation.mutateAsync,
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    mutation,
    isPending: mutation.isPending,
    isLoading: mutation.isPending, // Alias for backward compatibility
    
    // Convenience methods
    adjustRequired,
    autoReserve,
    createPO,
    receive,
    install,
    reverseInstall,
    cancelCommitment,
    
    // Manual refresh via tiered refresh (generic fallback)
    forceRefresh: (context = {}) => getTieredRefresh('GENERIC')(queryClient, context)
  };
}

export default useSupplyAction;