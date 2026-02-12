import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * useInventoryMutation Hook
 * 
 * Centralized hook for all inventory mutations.
 * Routes all receive, move, install operations through the mutateInventory backend function.
 */
export function useInventoryMutation(options = {}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await base44.functions.invoke('mutateInventory', payload);
      
      // Check for error response
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate relevant queries based on mutation type
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryAuditLogs'] });
      
      if (variables.mutation_type === 'receive') {
        queryClient.invalidateQueries({ queryKey: ['partPurchaseLineItems'] });
      }
      
      if (variables.mutation_type === 'move') {
        queryClient.invalidateQueries({ queryKey: ['inventoryTransfers'] });
      }
      
      if (variables.mutation_type === 'install') {
        queryClient.invalidateQueries({ queryKey: ['installedParts'] });
        queryClient.invalidateQueries({ queryKey: ['taskPartLinks'] });
        queryClient.invalidateQueries({ queryKey: ['partCommitments'] });
        queryClient.invalidateQueries({ queryKey: ['commitments'] });
      }
      
      // Call success callback if provided
      options.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      console.error('Inventory mutation failed:', error);
      
      // Show toast based on error code
      const message = error.message || 'Inventory operation failed';
      toast.error(message);
      
      // Call error callback if provided
      options.onError?.(error, variables);
    },
  });

  // Helper functions for specific mutation types
  const receive = (payload) => mutation.mutate({
    mutation_type: 'receive',
    ...payload,
  });

  const move = (payload) => mutation.mutate({
    mutation_type: 'move',
    ...payload,
  });

  const install = (payload) => mutation.mutate({
    mutation_type: 'install',
    ...payload,
  });

  return {
    ...mutation,
    receive,
    move,
    install,
  };
}

/**
 * Validates if a part can undergo a specific mutation
 */
export function canMutatePart(part, mutationType) {
  if (!part) return { allowed: false, reason: 'Part not found' };
  
  // Check archived status
  if (part.is_archived) {
    if (['receive'].includes(mutationType)) {
      return { allowed: false, reason: 'Cannot receive inventory for archived parts' };
    }
  }
  
  // Check part type behavior
  const partType = part.part_type || 'PURCHASED_VENDOR';
  
  if (mutationType === 'receive') {
    // CLIENT_SUPPLIED can only receive via manual entry, not vendor orders
    if (partType === 'CLIENT_SUPPLIED') {
      return { allowed: true, reason: 'Client-supplied parts require manual entry', requiresManual: true };
    }
  }
  
  return { allowed: true };
}

/**
 * Get inventory availability for a part
 */
export function getInventoryAvailability(inventoryItems, partId, locationId = null) {
  let items = inventoryItems.filter(i => i.part_id === partId);
  
  if (locationId) {
    items = items.filter(i => i.location_id === locationId);
  }
  
  const totalOnHand = items.reduce((sum, i) => sum + (i.quantity_on_hand || 0), 0);
  const totalReserved = items.reduce((sum, i) => sum + (i.quantity_reserved || 0), 0);
  const available = totalOnHand - totalReserved;
  
  return {
    items,
    totalOnHand,
    totalReserved,
    available,
  };
}

export default useInventoryMutation;