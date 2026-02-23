/**
 * forceAppRefresh.js - Global Deterministic Post-Mutation Refresh
 * 
 * SINGLE CANONICAL REFRESH PATH for all mutations.
 * This replaces scattered invalidateQueries calls with a deterministic
 * invalidate + refetch pattern that guarantees UI consistency.
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
 */

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
    
    // Financial domain
    queryClient.invalidateQueries({ queryKey: ['projectFinancials'] }),
    queryClient.invalidateQueries({ queryKey: ['billingPools'] }),
    queryClient.invalidateQueries({ queryKey: ['billingPool'] }),
    queryClient.invalidateQueries({ queryKey: ['poolAllocations'] }),
    queryClient.invalidateQueries({ queryKey: ['poolCharges'] }),
    queryClient.invalidateQueries({ queryKey: ['invoiceBatches'] }),
    queryClient.invalidateQueries({ queryKey: ['billingProcurementStates'] }),
    queryClient.invalidateQueries({ queryKey: ['projectInvoicesView'] }),
    queryClient.invalidateQueries({ queryKey: ['financialProjectsView'] }),
    queryClient.invalidateQueries({ queryKey: ['projectRevenueSummary'] }),
    queryClient.invalidateQueries({ queryKey: ['projectCostSummary'] }),
    queryClient.invalidateQueries({ queryKey: ['creditLedger'] }),
    queryClient.invalidateQueries({ queryKey: ['projectCreditBalance'] }),
    queryClient.invalidateQueries({ queryKey: ['creditAllocations'] }),
    queryClient.invalidateQueries({ queryKey: ['invoiceReadyItems'] }),
    
    // Pricing domain
    queryClient.invalidateQueries({ queryKey: ['pricingAudit'] }),
    queryClient.invalidateQueries({ queryKey: ['pricingIntegrity'] }),
    
    // Coverage/diagnostics
    queryClient.invalidateQueries({ queryKey: ['coverageDiagnostics'] }),
  ];
  
  // Scoped part invalidations
  partIds.forEach(id => {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['part', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['partsInventoryView', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['partSupplyUsage', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['inventoryItems', 'forPart', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['inventoryLocations', id] }));
  });
  
  // Scoped project invalidations
  projectIds.forEach(id => {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectSupplyView', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectCommitments', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectFinancials', id] }));
    // PHASE 4: Invoice and credit queries
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectInvoiceCommitments', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectInvoiceBatches', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectCreditLedger', id] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectCreditAllocations', id] }));
  });
  
  // Scoped commitment invalidations
  commitmentIds.forEach(id => {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['commitmentState', id] }));
  });
  
  // Scoped order invalidations
  orderIds.forEach(id => {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['order', id] }));
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
    // PHASE 4: Deterministic refetch for billing & invoice queries
    queryClient.refetchQueries({ 
      queryKey: ['billingProcurementStates'],
      type: refetchActive ? 'active' : 'all'
    }),
    queryClient.refetchQueries({ 
      queryKey: ['creditLedger'],
      type: refetchActive ? 'active' : 'all'
    }),
    queryClient.refetchQueries({ 
      queryKey: ['projectInvoicesView'],
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
  
  // Scoped refetches for affected projects
  projectIds.forEach(id => {
    refetches.push(
      queryClient.refetchQueries({ 
        queryKey: ['projectSupplyView', id],
        type: refetchActive ? 'active' : 'all'
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