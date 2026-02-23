import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { forceAppRefresh, extractRefreshContext } from "./forceAppRefresh";
import { validateSupplyModelDrift } from "./ExecutionDataBlock";
import { diagnoseSupplyItems, storePSMDiagnostics, storeGNODiagnostics } from "./supplyDiagnostics";
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
  validateQueryKeyFactory,
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

  const queryKey = supplyKeys.projectView(normalizedId, filters);
  
  // DIAGNOSTIC: Log query configuration
  if (process.env.NODE_ENV === 'development') {
    console.log('[useProjectSupplyView] DIAGNOSTIC:', {
      rawProjectId: projectId,
      normalizedId,
      enabled: Boolean(normalizedId),
      queryKey,
      filters,
    });
  }
  
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      console.log('[useProjectSupplyView] queryFn EXECUTING for projectId:', normalizedId);
      const response = await base44.functions.invoke('getProjectSupplyView', {
        project_id: normalizedId,
        filters,
      });
      console.log('[useProjectSupplyView] queryFn RESPONSE:', {
        hasData: !!response.data,
        itemsCount: response.data?.items?.length ?? 0,
        projectName: response.data?.project?.name ?? 'null',
        error: response.data?.error ?? null,
      });
      return response.data;
    },
    enabled: Boolean(normalizedId),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: supplyKeys.projectView(normalizedId) });
  };

  const rawItems = query.data?.items || [];
  
  // PHASE 1: CANONICAL INVENTORY INVARIANT ENFORCEMENT
  // Enforce to_order consistency based on inventory_snapshot.available
  const items = rawItems.map(item => {
    const inv = item.inventory_snapshot || {};
    const availableGlobal = inv.available_global_active ?? inv.available ?? 0;
    const requiredTotal = item.required_total ?? 0;
    
    let correctedToOrder = item.to_order ?? 0;
    let correctedCoverageStatus = item.coverage_status;
    let correctedGapQty = item.gap_qty ?? correctedToOrder;
    
    // Enforce canonical invariants
    if (availableGlobal >= requiredTotal && requiredTotal > 0) {
      // FULL coverage - stock can cover everything
      correctedToOrder = 0;
      correctedCoverageStatus = 'FULL';
      correctedGapQty = 0;
    } else if (availableGlobal > 0 && availableGlobal < requiredTotal) {
      // PARTIAL coverage
      correctedCoverageStatus = 'PARTIAL';
      correctedGapQty = requiredTotal - availableGlobal;
      correctedToOrder = correctedGapQty;
    } else if (availableGlobal === 0 && requiredTotal > 0) {
      // NO coverage
      correctedCoverageStatus = 'NONE';
      correctedGapQty = requiredTotal;
      correctedToOrder = requiredTotal;
    }
    
    // Also factor in already reserved + on_order
    const reservedProject = item.reserved_from_stock ?? 0;
    const coveredPO = item.covered_from_po ?? 0;
    const alreadyCovered = reservedProject + coveredPO;
    
    // Final to_order is gap minus what's already covered
    const finalToOrder = Math.max(0, requiredTotal - alreadyCovered);
    
    // If finalToOrder differs from corrected, use finalToOrder (it accounts for existing coverage)
    if (finalToOrder !== correctedToOrder) {
      correctedToOrder = finalToOrder;
      correctedGapQty = finalToOrder;
      if (finalToOrder === 0) {
        correctedCoverageStatus = 'FULL';
      } else if (finalToOrder < requiredTotal) {
        correctedCoverageStatus = 'PARTIAL';
      }
    }
    
    return {
      ...item,
      to_order: correctedToOrder,
      coverage_status: correctedCoverageStatus,
      gap_qty: correctedGapQty,
      // Add coverage block for UI consistency
      coverage: {
        ...item.coverage,
        gap_qty: correctedGapQty,
        coverage_status: correctedCoverageStatus,
      },
    };
  });
  
  // PHASE 2: DEV DRIFT GUARD - Use shared validation function
  // DIAGNOSTIC: Full diagnostic report for PSM
  let diagnosticReport = null;
  if (process.env.NODE_ENV === 'development' && items.length > 0) {
    const sample = items[0];
    console.log('[DEV] Project Supply View - Sample commitment shape:', sample);
    
    // FAIL-FAST: Check canonical fields
    const required = ['commitment_id', 'required_total', 'to_order', 'coverage_status', 'reserved_from_stock', 'covered_from_po'];
    const missing = required.filter(f => sample[f] === undefined);
    if (missing.length > 0) {
      console.error('[CANONICAL VIOLATION] Missing required fields:', missing);
    }
    
    // Use shared drift validation
    validateSupplyModelDrift(items, 'useProjectSupplyView');
    
    // DIAGNOSTIC: Run full diagnostic and store for cross-view comparison
    diagnosticReport = diagnoseSupplyItems(items, 'useProjectSupplyView');
    storePSMDiagnostics(normalizedId, items);
  }
  
  return {
    items,
    summary: query.data?.summary || {},
    categories: query.data?.categories || [],
    tabCounts: query.data?.tab_counts || {},
    project: query.data?.project || null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    invalidate,
    // DIAGNOSTIC: Expose diagnostic data in dev mode only
    _diagnostics: process.env.NODE_ENV === 'development' ? diagnosticReport : null,
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

  const rawItems = query.data?.items || [];
  
  // PHASE 1: CANONICAL INVENTORY INVARIANT ENFORCEMENT (same logic as project view)
  const items = rawItems.map(item => {
    const inv = item.inventory_snapshot || {};
    const availableGlobal = inv.available_global_active ?? inv.available ?? 0;
    const requiredTotal = item.required_total ?? 0;
    const reservedProject = item.reserved_from_stock ?? 0;
    const coveredPO = item.covered_from_po ?? 0;
    const alreadyCovered = reservedProject + coveredPO;
    
    // Final to_order is gap minus what's already covered
    const finalToOrder = Math.max(0, requiredTotal - alreadyCovered);
    
    let correctedCoverageStatus = item.coverage_status;
    if (finalToOrder === 0 && requiredTotal > 0) {
      correctedCoverageStatus = 'FULL';
    } else if (finalToOrder > 0 && finalToOrder < requiredTotal) {
      correctedCoverageStatus = 'PARTIAL';
    } else if (finalToOrder === requiredTotal && requiredTotal > 0) {
      correctedCoverageStatus = 'NONE';
    }
    
    return {
      ...item,
      to_order: finalToOrder,
      coverage_status: correctedCoverageStatus,
      gap_qty: finalToOrder,
      coverage: {
        ...item.coverage,
        gap_qty: finalToOrder,
        coverage_status: correctedCoverageStatus,
      },
    };
  });
  
  // PHASE 2: DEV DRIFT GUARD - Use shared validation function
  // DIAGNOSTIC: Full diagnostic report for GNO
  let diagnosticReport = null;
  if (process.env.NODE_ENV === 'development' && items.length > 0) {
    const sample = items[0];
    console.log('[DEV] Ops Supply View - Sample commitment shape:', sample);
    
    // FAIL-FAST: Check canonical fields
    const required = ['commitment_id', 'to_order', 'coverage_status'];
    const missing = required.filter(f => sample[f] === undefined);
    if (missing.length > 0) {
      console.error('[CANONICAL VIOLATION] Missing required fields:', missing);
    }
    
    // Use shared drift validation
    validateSupplyModelDrift(items, 'useOpsSupplyView');
    
    // DIAGNOSTIC: Run full diagnostic and store for cross-view comparison
    diagnosticReport = diagnoseSupplyItems(items, 'useOpsSupplyView');
    storeGNODiagnostics(items);
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
    // DIAGNOSTIC: Expose diagnostic data in dev mode only
    _diagnostics: process.env.NODE_ENV === 'development' ? diagnosticReport : null,
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