/**
 * supplyInvalidation.js - Unified Supply Cache Invalidation Contract
 * 
 * ALL supply mutations MUST use this helper to ensure cross-view consistency.
 * This is the SINGLE point for invalidating supply-related React Query caches.
 * 
 * Usage:
 *   import { invalidateSupplyQueries } from '@/components/supply/supplyInvalidation';
 *   
 *   // After any supply mutation:
 *   invalidateSupplyQueries(queryClient, {
 *     part_ids: ['part_123'],
 *     project_ids: ['project_456'],
 *     order_ids: ['order_789'],
 *     commitment_ids: ['commitment_abc'],
 *   });
 */

/**
 * Invalidate all supply-related queries after a mutation.
 * This ensures all views reflect the same canonical state.
 * 
 * @param {QueryClient} queryClient - React Query client
 * @param {Object} context - Context about what was mutated
 * @param {string[]} [context.part_ids] - Affected part IDs
 * @param {string[]} [context.project_ids] - Affected project IDs  
 * @param {string[]} [context.order_ids] - Affected order IDs
 * @param {string[]} [context.commitment_ids] - Affected commitment IDs
 * @param {boolean} [context.invalidateAll] - If true, invalidate ALL supply queries
 */
export function invalidateSupplyQueries(queryClient, context = {}) {
  const { 
    part_ids = [], 
    project_ids = [], 
    order_ids = [],
    commitment_ids = [],
    invalidateAll = false 
  } = context;

  // === ALWAYS INVALIDATE (Cross-cutting queries) ===
  
  // Global operations view - affects GlobalNeedToOrder, SupplyQueues
  queryClient.invalidateQueries({ queryKey: ['opsSupplyView'] });
  
  // Global supply queues - affects SupplyQueues page
  queryClient.invalidateQueries({ queryKey: ['globalSupplyQueues'] });
  
  // Portfolio state - affects SupplyLanding
  queryClient.invalidateQueries({ queryKey: ['portfolioSupplyState'] });
  
  // Parts inventory view - affects PartsTracker
  queryClient.invalidateQueries({ queryKey: ['partsInventoryView'] });
  
  // Lifecycle action queue - affects PartsActionWorkbench
  queryClient.invalidateQueries({ queryKey: ['lifecycleActionQueue'] });
  
  // Invoice batches - affects invoicing workflow
  queryClient.invalidateQueries({ queryKey: ['invoiceBatches'] });
  queryClient.invalidateQueries({ queryKey: ['draftInvoiceBatches'] });
  
  // Billing/procurement states - affects InvoiceWorkbench
  queryClient.invalidateQueries({ queryKey: ['billingProcurementStates'] });
  
  // Coverage diagnostics
  queryClient.invalidateQueries({ queryKey: ['coverageDiagnostics'] });

  // === PROJECT-SPECIFIC INVALIDATION ===
  
  if (project_ids.length > 0 || invalidateAll) {
    // Project supply view - affects ProjectSupplyManager
    queryClient.invalidateQueries({ queryKey: ['projectSupplyView'] });
    
    // Project commitments - affects various project views
    queryClient.invalidateQueries({ queryKey: ['projectCommitments'] });
    
    // Project financial data
    queryClient.invalidateQueries({ queryKey: ['projectFinancials'] });
    
    // Billing pools
    queryClient.invalidateQueries({ queryKey: ['billingPools'] });
  }

  // === PART-SPECIFIC INVALIDATION ===
  
  if (part_ids.length > 0) {
    // Specific part queries
    part_ids.forEach(partId => {
      queryClient.invalidateQueries({ queryKey: ['part', partId] });
      // partSupplyUsage already invalidated above
    });
  }
  
  // Always invalidate general parts list
  queryClient.invalidateQueries({ queryKey: ['parts'] });
  
  // Part inventory states - used by useSupplyState hooks
  queryClient.invalidateQueries({ 
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && (key[0] === 'partInventoryState' || key[0] === 'partInventoryStates');
    }
  });

  // === ORDER-SPECIFIC INVALIDATION ===
  
  if (order_ids.length > 0 || invalidateAll) {
    // PO receiving view - affects POReceiving
    queryClient.invalidateQueries({ queryKey: ['poReceivingView'] });
    
    // Orders list
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    
    // Line items
    queryClient.invalidateQueries({ queryKey: ['partPurchaseLineItems'] });
  }

  // === COMMITMENT-SPECIFIC INVALIDATION ===
  
  if (commitment_ids.length > 0 || invalidateAll) {
    // All commitment query patterns
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === 'partCommitments';
      }
    });
    queryClient.invalidateQueries({ queryKey: ['commitmentDetails'] });
  }
  
  // Always invalidate partCommitments for safety (used by AddToBuildModal)
  queryClient.invalidateQueries({ queryKey: ['partCommitments'] });

  // === CORE ENTITY INVALIDATION ===
  // These are ALWAYS invalidated on inventory mutations to ensure UI consistency
  
  // InventoryItem is authoritative for location-based stock
  // PHASE 14E-VERIFY: Must use predicate to catch ALL inventory item query key patterns
  // Patterns in use: ['inventoryItems'], ['inventoryItems', partId], ['inventoryItems', 'forPart', partId]
  queryClient.invalidateQueries({ 
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && key[0] === 'inventoryItems';
    }
  });
  
  // Locations - for totals display
  queryClient.invalidateQueries({ queryKey: ['locations'] });
  
  // Part supply usage - used by EditPartDrawer
  if (part_ids.length > 0) {
    part_ids.forEach(partId => {
      queryClient.invalidateQueries({ queryKey: ['partSupplyUsage', partId] });
    });
  }
  // Also invalidate all partSupplyUsage if invalidateAll
  if (invalidateAll) {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === 'partSupplyUsage';
      }
    });
  }
  
  // Commitment state - used by InstallPartModal
  queryClient.invalidateQueries({ 
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && (key[0] === 'commitmentState' || key[0] === 'commitmentStates');
    }
  });

  // partsInventoryView family - used by InventoryManagement
  queryClient.invalidateQueries({ 
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && key[0] === 'partsInventoryView';
    }
  });
  
  // PHASE 15V: Pricing-related queries
  queryClient.invalidateQueries({ 
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && key[0] === 'pricingAudit';
    }
  });
  
  // PHASE 15V: Pricing integrity queries
  queryClient.invalidateQueries({ 
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && key[0] === 'pricingIntegrity';
    }
  });

  // Log invalidation for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('[supplyInvalidation] Invalidated queries:', {
      part_ids,
      project_ids,
      order_ids,
      commitment_ids,
      invalidateAll
    });
  }
}

/**
 * Get query keys that should be invalidated for a specific action type.
 * Useful for understanding dependencies.
 */
export function getInvalidationKeysForAction(actionType) {
  const baseKeys = [
    'opsSupplyView',
    'partsInventoryView',
    'parts',
  ];

  const actionKeys = {
    ADJUST_REQUIRED: [
      ...baseKeys,
      'projectSupplyView',
      'projectCommitments',
      'partSupplyUsage',
      'globalSupplyQueues',
      'portfolioSupplyState',
    ],
    AUTO_RESERVE: [
      ...baseKeys,
      'projectSupplyView',
      'partSupplyUsage',
      'inventoryItems',
    ],
    CREATE_PO: [
      ...baseKeys,
      'projectSupplyView',
      'orders',
      'partPurchaseLineItems',
      'poReceivingView',
    ],
    RECEIVE: [
      ...baseKeys,
      'projectSupplyView',
      'orders',
      'partPurchaseLineItems',
      'poReceivingView',
      'inventoryItems',
    ],
    INSTALL: [
      ...baseKeys,
      'projectSupplyView',
      'lifecycleActionQueue',
    ],
    REVERSE_INSTALL: [
      ...baseKeys,
      'projectSupplyView',
      'lifecycleActionQueue',
    ],
    ALLOCATE_POOL: [
      ...baseKeys,
      'projectSupplyView',
      'billingPools',
      'projectFinancials',
    ],
    CANCEL_COMMITMENT: [
      ...baseKeys,
      'projectSupplyView',
      'projectCommitments',
      'globalSupplyQueues',
    ],
    ADD_STOCK: [
      ...baseKeys,
      'partSupplyUsage',
      'inventoryItems',
      'inventoryAuditLog',
    ],
    RECEIVE_STOCK: [
      ...baseKeys,
      'partSupplyUsage',
      'inventoryItems',
      'inventoryAuditLog',
    ],
  };

  return actionKeys[actionType] || baseKeys;
}

/**
 * Helper to extract context from a supply action result for invalidation.
 */
export function extractInvalidationContext(actionResult, actionPayload = {}) {
  const context = {
    part_ids: [],
    project_ids: [],
    order_ids: [],
    commitment_ids: [],
  };

  // Extract from result
  if (actionResult?.commitment) {
    context.commitment_ids.push(actionResult.commitment.id);
    if (actionResult.commitment.part_id) {
      context.part_ids.push(actionResult.commitment.part_id);
    }
    if (actionResult.commitment.project_id) {
      context.project_ids.push(actionResult.commitment.project_id);
    }
  }

  if (actionResult?.commitments) {
    actionResult.commitments.forEach(c => {
      context.commitment_ids.push(c.id);
      if (c.part_id) context.part_ids.push(c.part_id);
      if (c.project_id) context.project_ids.push(c.project_id);
    });
  }

  if (actionResult?.order_id) {
    context.order_ids.push(actionResult.order_id);
  }

  if (actionResult?.part_id) {
    context.part_ids.push(actionResult.part_id);
  }

  // Extract from payload
  if (actionPayload?.project_id) {
    context.project_ids.push(actionPayload.project_id);
  }
  if (actionPayload?.part_id) {
    context.part_ids.push(actionPayload.part_id);
  }
  if (actionPayload?.commitment_ids) {
    context.commitment_ids.push(...actionPayload.commitment_ids);
  }

  // Deduplicate
  context.part_ids = [...new Set(context.part_ids)];
  context.project_ids = [...new Set(context.project_ids)];
  context.order_ids = [...new Set(context.order_ids)];
  context.commitment_ids = [...new Set(context.commitment_ids)];

  return context;
}

export default {
  invalidateSupplyQueries,
  getInvalidationKeysForAction,
  extractInvalidationContext,
};