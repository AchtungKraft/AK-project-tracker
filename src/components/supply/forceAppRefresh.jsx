/**
 * forceAppRefresh.js - Global Deterministic Post-Mutation Refresh
 * 
 * SINGLE CANONICAL REFRESH PATH for all mutations.
 * This replaces scattered invalidateQueries calls with a deterministic
 * invalidate + refetch pattern that guarantees UI consistency.
 * 
 * CANONICAL ARCHITECTURE LOCK - Uses queryKeyFactories
 * 
 * Usage:
 *   import { forceAppRefresh } from '@/components/supply/forceAppRefresh';
 *   
 *   const mutation = useMutation({
 *     mutationFn: ...,
 *     onSuccess: async (result) => {
 *       await forceAppRefresh(queryClient, {
 *         partIds: [result.part_id],
 *         projectIds: [result.project_id],
 *       });
 *     }
 *   });
 * 
 * GUARANTEES:
 * - All related queries are invalidated first
 * - Critical queries are actively refetched
 * - No stale data in PartsTracker, PartModal, Supply views
 * - No reliance on staleTime or refetchOnMount
 * 
 * DETERMINISTIC KEY FORMAT:
 * - All projectIds are normalized to String
 * - Keys are string arrays only (no objects)
 * - No partial/prefix matching - exact keys only
 */

import {
  billingKeys,
  invoiceKeys,
  creditKeys,
  partsKeys,
  supplyKeys,
  commitmentKeys,
  orderKeys,
  inventoryKeys,
  lifecycleKeys,
  normalizeProjectId,
  normalizeId,
} from '@/components/financial/queryKeyFactories';

// Re-export normalizeId for backwards compatibility
export { normalizeId };

/**
 * Force refresh all app queries after a mutation
 * 
 * @param {QueryClient} queryClient - React Query client
 * @param {Object} options - Refresh context
 * @param {string[]} [options.partIds] - Part IDs to scope refresh
 * @param {string[]} [options.projectIds] - Project IDs to scope refresh
 * @param {string[]} [options.commitmentIds] - Commitment IDs to scope refresh
 * @param {string[]} [options.orderIds] - Order IDs to scope refresh
 * @param {boolean} [options.refetchActive] - Only refetch active queries (default: true)
 */
export async function forceAppRefresh(queryClient, options = {}) {
  const {
    partIds = [],
    projectIds = [],
    commitmentIds = [],
    orderIds = [],
    refetchActive = true,
  } = options;

  // Normalize project IDs to strings - filter out null/undefined/empty
  const normalizedProjectIds = projectIds.map(normalizeId).filter(id => id !== null && id !== undefined);

  // === PHASE 1: Invalidate all related queries ===
  // This marks queries as stale so they'll refetch on next access
  
  // Global invalidation for cross-cutting queries
  const invalidations = [
    // Parts domain
    queryClient.invalidateQueries({ queryKey: ['parts'] }),
    queryClient.invalidateQueries({ queryKey: ['partsInventoryView'] }),
    
    // Supply domain
    queryClient.invalidateQueries({ queryKey: ['opsSupplyView'] }),
    queryClient.invalidateQueries({ queryKey: ['projectSupplyView'] }),
    queryClient.invalidateQueries({ queryKey: ['globalSupplyQueues'] }),
    queryClient.invalidateQueries({ queryKey: ['portfolioSupplyState'] }),
    queryClient.invalidateQueries({ queryKey: ['lifecycleActionQueue'] }),
    
    // Commitments domain
    queryClient.invalidateQueries({ queryKey: ['partCommitments'] }),
    queryClient.invalidateQueries({ queryKey: ['projectCommitments'] }),
    queryClient.invalidateQueries({ queryKey: ['commitmentDetails'] }),
    
    // Inventory domain
    queryClient.invalidateQueries({ queryKey: ['inventoryItems'] }),
    queryClient.invalidateQueries({ queryKey: ['inventoryLocations'] }),
    queryClient.invalidateQueries({ queryKey: ['locations'] }),
    
    // Orders domain
    queryClient.invalidateQueries({ queryKey: ['orders'] }),
    queryClient.invalidateQueries({ queryKey: ['poReceivingView'] }),
    queryClient.invalidateQueries({ queryKey: ['partPurchaseLineItems'] }),
    
    // Pricing domain
    queryClient.invalidateQueries({ queryKey: ['pricingAudit'] }),
    queryClient.invalidateQueries({ queryKey: ['pricingIntegrity'] }),
    
    // Coverage/diagnostics
    queryClient.invalidateQueries({ queryKey: ['coverageDiagnostics'] }),
  ];
  
  // Scoped part invalidations
  partIds.forEach(id => {
    const normalizedPartId = normalizeId(id);
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['part', normalizedPartId] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['partsInventoryView', normalizedPartId] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['partSupplyUsage', normalizedPartId] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['inventoryItems', 'forPart', normalizedPartId] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['inventoryLocations', normalizedPartId] }));
  });
  
  // Scoped project invalidations - DETERMINISTIC STRING KEYS
  normalizedProjectIds.forEach(id => {
    // Supply views
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectSupplyView', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectCommitments', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectFinancials', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectInvoiceCommitments', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectInvoices', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectCreditLedger', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectCreditAllocations', id] }));
    
    // CANONICAL FINANCIAL KEYS - exact string array format
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['billingProcurementStates', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectInvoicesView', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['creditAllocations', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectInvoiceLines', id] }));
  });
  
  // Scoped commitment invalidations
  commitmentIds.forEach(id => {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['commitmentState', normalizeId(id)] }));
  });
  
  // Scoped order invalidations
  orderIds.forEach(id => {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['order', normalizeId(id)] }));
  });
  
  // Wait for all invalidations to complete
  await Promise.all(invalidations);
  
  // === PHASE 2: Deterministic refetch of critical queries ===
  // These are actively refetched to ensure UI updates immediately
  
  const refetches = [];
  
  // Core queries that must always be fresh
  refetches.push(
    queryClient.refetchQueries({ 
      queryKey: ['parts'],
      type: refetchActive ? 'active' : 'all'
    }),
    queryClient.refetchQueries({ 
      queryKey: ['partsInventoryView'],
      type: refetchActive ? 'active' : 'all'
    }),
    queryClient.refetchQueries({ 
      queryKey: ['partCommitments'],
      type: refetchActive ? 'active' : 'all'
    }),
  );
  
  // Supply views - critical for real-time accuracy
  refetches.push(
    queryClient.refetchQueries({ 
      queryKey: ['opsSupplyView'],
      type: refetchActive ? 'active' : 'all'
    }),
    queryClient.refetchQueries({ 
      queryKey: ['projectSupplyView'],
      type: refetchActive ? 'active' : 'all'
    }),
  );
  
  // CANONICAL FINANCIAL REFETCH - scoped by project ID
  // Use exact keys to avoid partial matching issues
  normalizedProjectIds.forEach(id => {
    refetches.push(
      queryClient.refetchQueries({ 
        queryKey: ['billingProcurementStates', id],
        type: 'all'
      }),
      queryClient.refetchQueries({ 
        queryKey: ['projectInvoicesView', id],
        type: 'all'
      }),
      queryClient.refetchQueries({ 
        queryKey: ['creditAllocations', id],
        type: 'all'
      }),
    );
  });
  
  // Global financial queries (no project scope)
  refetches.push(
    queryClient.refetchQueries({ 
      queryKey: ['creditLedger'],
      type: refetchActive ? 'active' : 'all'
    }),
    queryClient.refetchQueries({ 
      queryKey: ['financialProjectsView'],
      type: refetchActive ? 'active' : 'all'
    }),
    queryClient.refetchQueries({ 
      queryKey: ['billablePartsView'],
      type: refetchActive ? 'active' : 'all'
    }),
    // Invoice view internal keys used by ForwardInvoiceDashboard
    queryClient.refetchQueries({ 
      queryKey: ['projectInvoiceCommitments'],
      type: refetchActive ? 'active' : 'all'
    }),
    queryClient.refetchQueries({ 
      queryKey: ['projectInvoices'],
      type: 'all' // Always refetch all invoice lists
    }),
    queryClient.refetchQueries({ 
      queryKey: ['projectInvoiceLines'],
      type: refetchActive ? 'active' : 'all'
    }),
    queryClient.refetchQueries({ 
      queryKey: ['projectCreditLedger'],
      type: refetchActive ? 'active' : 'all'
    }),
    queryClient.refetchQueries({ 
      queryKey: ['projectCreditAllocations'],
      type: refetchActive ? 'active' : 'all'
    }),
  );
  
  // Scoped refetches for affected parts
  partIds.forEach(id => {
    refetches.push(
      queryClient.refetchQueries({ 
        queryKey: ['part', id],
        type: refetchActive ? 'active' : 'all'
      }),
      queryClient.refetchQueries({ 
        queryKey: ['partsInventoryView', id],
        type: refetchActive ? 'active' : 'all'
      }),
    );
  });
  
  // PHASE 5: Scoped refetches for affected projects - DETERMINISTIC
  // When projectId provided, ALWAYS invalidate + refetch these critical keys
  projectIds.forEach(id => {
    refetches.push(
      queryClient.refetchQueries({ 
        queryKey: ['projectSupplyView', id],
        type: 'all' // Deterministic: always refetch
      }),
      // CANONICAL: billingProcurementStates is THE source of truth for exposure
      queryClient.refetchQueries({ 
        queryKey: ['billingProcurementStates', id],
        type: 'all' // Deterministic: always refetch
      }),
      // Invoice history views - must stay in sync
      queryClient.refetchQueries({ 
        queryKey: ['projectInvoicesView', id],
        type: 'all' // Deterministic: always refetch
      }),
      queryClient.refetchQueries({ 
        queryKey: ['projectInvoiceCommitments', id],
        type: 'all' // Deterministic: always refetch
      }),
      queryClient.refetchQueries({ 
        queryKey: ['projectInvoices', id],
        type: 'all' // Deterministic: always refetch
      }),
      queryClient.refetchQueries({ 
        queryKey: ['projectInvoiceLines', id],
        type: 'all' // Deterministic: always refetch
      }),
      // Credit queries must sync immediately
      queryClient.refetchQueries({ 
        queryKey: ['projectCreditLedger', id],
        type: 'all' // Deterministic: always refetch
      }),
      queryClient.refetchQueries({ 
        queryKey: ['projectCreditAllocations', id],
        type: 'all' // Deterministic: always refetch
      }),
      queryClient.refetchQueries({ 
        queryKey: ['creditAllocations', id],
        type: 'all' // Deterministic: always refetch
      }),
    );
  });
  
  // Wait for all refetches to complete
  await Promise.all(refetches);
  
  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[forceAppRefresh] Completed:', {
      partIds,
      projectIds,
      commitmentIds,
      orderIds,
      invalidationsCount: invalidations.length,
      refetchesCount: refetches.length,
    });
  }
}

/**
 * Extract refresh context from mutation result
 * Use this to automatically determine what to refresh based on action result
 * 
 * @param {Object} result - Mutation result from executeSupplyAction
 * @param {Object} payload - Original mutation payload
 * @returns {Object} Context for forceAppRefresh
 */
export function extractRefreshContext(result, payload = {}) {
  const context = {
    partIds: [],
    projectIds: [],
    commitmentIds: [],
    orderIds: [],
  };
  
  // Extract from result
  if (result?.part_id) context.partIds.push(result.part_id);
  if (result?.project_id) context.projectIds.push(result.project_id);
  if (result?.commitment_id) context.commitmentIds.push(result.commitment_id);
  if (result?.commitment?.id) context.commitmentIds.push(result.commitment.id);
  if (result?.order_id) context.orderIds.push(result.order_id);
  
  // Extract from invalidation_context if provided by backend
  if (result?.invalidation_context) {
    const ic = result.invalidation_context;
    if (ic.part_ids) context.partIds.push(...ic.part_ids);
    if (ic.project_ids) context.projectIds.push(...ic.project_ids);
    if (ic.commitment_ids) context.commitmentIds.push(...ic.commitment_ids);
    if (ic.order_ids) context.orderIds.push(...ic.order_ids);
  }
  
  // Extract from payload
  if (payload?.part_id) context.partIds.push(payload.part_id);
  if (payload?.project_id) context.projectIds.push(payload.project_id);
  if (payload?.commitment_id) context.commitmentIds.push(payload.commitment_id);
  
  // Deduplicate
  context.partIds = [...new Set(context.partIds)];
  context.projectIds = [...new Set(context.projectIds)];
  context.commitmentIds = [...new Set(context.commitmentIds)];
  context.orderIds = [...new Set(context.orderIds)];
  
  return context;
}

export default forceAppRefresh;