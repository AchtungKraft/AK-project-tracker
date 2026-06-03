/**
 * tieredSupplyRefresh.js — Action-Specific Supply Chain Refresh
 *
 * Replaces the monolithic forceAppRefresh (~55 requests) with tiered
 * invalidation strategies scoped to exactly what each action affects.
 *
 * TIER 1 — Core Supply (all actions):       Inventory + Supply + Commitments + NeedToOrder
 * TIER 2 — PO (CREATE_PO, RECEIVE):         + Orders + PO Receiving + Line Items
 * TIER 3 — Inventory Movement (RECEIVE, INSTALL): + InventoryItems + InventoryLocations
 * TIER 4 — Financial (only when billing_status changed): + BillingProcurementStates
 *
 * REMOVED (audit-classified UNRELATED):
 *   locations, pricingAudit, pricingIntegrity, stockReorder (dead key),
 *   akStockProject, projectInvoiceCommitments, projectInvoices,
 *   projectInvoicesView, projectInvoiceLines, projectCreditLedger,
 *   projectCreditAllocations, creditAllocations, creditLedger,
 *   financialProjectsView, billablePartsView
 */

import { normalizeId } from '@/components/financial/queryKeyFactories';
import { bumpSupplyStateVersion } from '@/components/supply/useSupplyStateVersion';

// ════════════════════════════════════════════
// CONTEXT EXTRACTION (shared with forceAppRefresh)
// ════════════════════════════════════════════

export { extractRefreshContext } from './forceAppRefresh';

// ════════════════════════════════════════════
// TIER 1 — Core Supply (always)
// ════════════════════════════════════════════

function tier1CoreSupply(qc, ctx) {
  const inv = [
    qc.invalidateQueries({ queryKey: ['parts'] }),
    qc.invalidateQueries({ queryKey: ['partsInventoryView'] }),
    qc.invalidateQueries({ queryKey: ['opsSupplyView'] }),
    qc.invalidateQueries({ queryKey: ['projectSupplyView'] }),
    qc.invalidateQueries({ queryKey: ['globalSupplyQueues'] }),
    qc.invalidateQueries({ queryKey: ['portfolioSupplyState'] }),
    qc.invalidateQueries({ queryKey: ['lifecycleActionQueue'] }),
    qc.invalidateQueries({ queryKey: ['partCommitments'] }),
    qc.invalidateQueries({ queryKey: ['projectCommitments'] }),
    qc.invalidateQueries({ queryKey: ['commitmentDetails'] }),
    qc.invalidateQueries({ queryKey: ['coverageDiagnostics'] }),
    qc.invalidateQueries({ queryKey: ['stockCommitments'] }),
  ];

  // Scoped part keys
  ctx.partIds.forEach(id => {
    const nid = normalizeId(id);
    inv.push(qc.invalidateQueries({ queryKey: ['part', nid] }));
    inv.push(qc.invalidateQueries({ queryKey: ['partsInventoryView', nid] }));
    inv.push(qc.invalidateQueries({ queryKey: ['partSupplyUsage', nid] }));
  });

  // Scoped project keys
  ctx.projectIds.forEach(id => {
    inv.push(qc.invalidateQueries({ queryKey: ['projectSupplyView', id] }));
    inv.push(qc.invalidateQueries({ queryKey: ['projectCommitments', id] }));
  });

  // Scoped commitment keys
  ctx.commitmentIds.forEach(id => {
    inv.push(qc.invalidateQueries({ queryKey: ['commitmentState', normalizeId(id)] }));
  });

  return inv;
}

function tier1Refetches(qc, ctx) {
  const ref = [
    qc.refetchQueries({ queryKey: ['parts'], type: 'active' }),
    qc.refetchQueries({ queryKey: ['opsSupplyView'], type: 'active' }),
    qc.refetchQueries({ queryKey: ['projectSupplyView'], type: 'active' }),
  ];
  ctx.partIds.forEach(id => {
    ref.push(qc.refetchQueries({ queryKey: ['part', id], type: 'active' }));
    ref.push(qc.refetchQueries({ queryKey: ['partsInventoryView', id], type: 'active' }));
  });
  ctx.projectIds.forEach(id => {
    ref.push(qc.refetchQueries({ queryKey: ['projectSupplyView', id], type: 'active' }));
  });
  return ref;
}

// ════════════════════════════════════════════
// TIER 2 — PO Refresh (CREATE_PO, RECEIVE)
// ════════════════════════════════════════════

function tier2PO(qc, ctx) {
  const inv = [
    qc.invalidateQueries({ queryKey: ['orders'] }),
    qc.invalidateQueries({ queryKey: ['poReceivingView'] }),
    qc.invalidateQueries({ queryKey: ['partPurchaseLineItems'] }),
    qc.invalidateQueries({ queryKey: ['projectPurchaseOrders'] }),
  ];
  ctx.orderIds.forEach(id => {
    const nid = normalizeId(id);
    inv.push(qc.invalidateQueries({ queryKey: ['order', nid] }));
    inv.push(qc.invalidateQueries({ queryKey: ['poReceivingView', nid] }));
  });
  ctx.projectIds.forEach(id => {
    inv.push(qc.invalidateQueries({ queryKey: ['projectPurchaseOrders', id] }));
  });
  return inv;
}

function tier2Refetches(qc) {
  return [
    qc.refetchQueries({ queryKey: ['poReceivingView'], type: 'active' }),
  ];
}

// ════════════════════════════════════════════
// TIER 3 — Inventory Movement (RECEIVE, INSTALL)
// ════════════════════════════════════════════

function tier3Inventory(qc, ctx) {
  const inv = [
    qc.invalidateQueries({ queryKey: ['inventoryItems'] }),
    qc.invalidateQueries({ queryKey: ['inventoryLocations'] }),
  ];
  ctx.partIds.forEach(id => {
    const nid = normalizeId(id);
    inv.push(qc.invalidateQueries({ queryKey: ['inventoryItems', 'forPart', nid] }));
    inv.push(qc.invalidateQueries({ queryKey: ['inventoryLocations', nid] }));
  });
  return inv;
}

// ════════════════════════════════════════════
// TIER 4 — Financial (conditional)
// ════════════════════════════════════════════

function tier4Financial(qc, ctx, result) {
  // Only invalidate if backend signals billing state changed
  const billingChanged = !!(
    result?.billing_status_changed ||
    result?.billing_status ||
    result?.invalidation_context?.billing_changed
  );
  if (!billingChanged && ctx.projectIds.length === 0) return [];

  const inv = [];
  ctx.projectIds.forEach(id => {
    inv.push(qc.invalidateQueries({ queryKey: ['billingProcurementStates', id] }));
    inv.push(qc.invalidateQueries({ queryKey: ['projectFinancials', id] }));
  });
  return inv;
}

function tier4Refetches(qc, ctx) {
  const ref = [];
  ctx.projectIds.forEach(id => {
    ref.push(qc.refetchQueries({ queryKey: ['billingProcurementStates', id], type: 'active' }));
  });
  return ref;
}

// ════════════════════════════════════════════
// NORMALIZE CONTEXT
// ════════════════════════════════════════════

function normalizeCtx(ctx) {
  return {
    partIds: (ctx.partIds || []).map(normalizeId).filter(Boolean),
    projectIds: (ctx.projectIds || []).map(normalizeId).filter(Boolean),
    commitmentIds: (ctx.commitmentIds || []).map(normalizeId).filter(Boolean),
    orderIds: (ctx.orderIds || []).map(normalizeId).filter(Boolean),
  };
}

// ════════════════════════════════════════════
// ACTION-SPECIFIC REFRESH FUNCTIONS
// ════════════════════════════════════════════

/**
 * CREATE_PO: Tier 1 + Tier 2 + Tier 4 (conditional)
 * No Tier 3 — CREATE_PO doesn't move physical inventory
 */
export async function refreshForCreatePO(queryClient, rawCtx, result = {}) {
  const ctx = normalizeCtx(rawCtx);
  const invalidations = [
    ...tier1CoreSupply(queryClient, ctx),
    ...tier2PO(queryClient, ctx),
    ...tier4Financial(queryClient, ctx, result),
  ];
  await Promise.all(invalidations);

  const refetches = [
    ...tier1Refetches(queryClient, ctx),
    ...tier2Refetches(queryClient),
    ...tier4Refetches(queryClient, ctx),
  ];
  await Promise.all(refetches);

  bumpSupplyStateVersion('refreshForCreatePO');

  if (import.meta.env.DEV) {
    console.log(`[PartsPerf] refreshForCreatePO\n  invalidations: ${invalidations.length}\n  refetches: ${refetches.length}\n  parts: ${ctx.partIds.length} | projects: ${ctx.projectIds.length} | orders: ${ctx.orderIds.length}`);
  }
}

/**
 * RECEIVE: Tier 1 + Tier 2 + Tier 3 + Tier 4 (conditional)
 * Full breadth — receiving affects POs, inventory, and potentially billing
 */
export async function refreshForReceive(queryClient, rawCtx, result = {}) {
  const ctx = normalizeCtx(rawCtx);
  const invalidations = [
    ...tier1CoreSupply(queryClient, ctx),
    ...tier2PO(queryClient, ctx),
    ...tier3Inventory(queryClient, ctx),
    ...tier4Financial(queryClient, ctx, result),
  ];
  await Promise.all(invalidations);

  const refetches = [
    ...tier1Refetches(queryClient, ctx),
    ...tier2Refetches(queryClient),
    ...tier4Refetches(queryClient, ctx),
  ];
  await Promise.all(refetches);

  bumpSupplyStateVersion('refreshForReceive');

  if (import.meta.env.DEV) {
    console.log(`[PartsPerf] refreshForReceive\n  invalidations: ${invalidations.length}\n  refetches: ${refetches.length}\n  parts: ${ctx.partIds.length} | projects: ${ctx.projectIds.length} | orders: ${ctx.orderIds.length}`);
  }
}

/**
 * INSTALL: Tier 1 + Tier 3 + Tier 4 (conditional)
 * No Tier 2 — INSTALL doesn't create/modify POs
 */
export async function refreshForInstall(queryClient, rawCtx, result = {}) {
  const ctx = normalizeCtx(rawCtx);
  const invalidations = [
    ...tier1CoreSupply(queryClient, ctx),
    ...tier3Inventory(queryClient, ctx),
    ...tier4Financial(queryClient, ctx, result),
  ];
  await Promise.all(invalidations);

  const refetches = [
    ...tier1Refetches(queryClient, ctx),
    ...tier4Refetches(queryClient, ctx),
  ];
  await Promise.all(refetches);

  bumpSupplyStateVersion('refreshForInstall');

  if (import.meta.env.DEV) {
    console.log(`[PartsPerf] refreshForInstall\n  invalidations: ${invalidations.length}\n  refetches: ${refetches.length}\n  parts: ${ctx.partIds.length} | projects: ${ctx.projectIds.length}`);
  }
}

/**
 * ADJUST_STOCK (PO-linked): Tier 1 + Tier 3 + Tier 4 (conditional)
 * Same as INSTALL but for stock adjustments with cross-domain refs
 */
export async function refreshForAdjustStock(queryClient, rawCtx, result = {}) {
  const ctx = normalizeCtx(rawCtx);
  const invalidations = [
    ...tier1CoreSupply(queryClient, ctx),
    ...tier3Inventory(queryClient, ctx),
    ...tier4Financial(queryClient, ctx, result),
  ];
  await Promise.all(invalidations);

  const refetches = [
    ...tier1Refetches(queryClient, ctx),
    ...tier4Refetches(queryClient, ctx),
  ];
  await Promise.all(refetches);

  bumpSupplyStateVersion('refreshForAdjustStock');

  if (import.meta.env.DEV) {
    console.log(`[PartsPerf] refreshForAdjustStock\n  invalidations: ${invalidations.length}\n  refetches: ${refetches.length}\n  parts: ${ctx.partIds.length} | projects: ${ctx.projectIds.length}`);
  }
}

/**
 * Generic supply action (fallback for unknown action types): Tier 1 only
 */
export async function refreshForGenericSupply(queryClient, rawCtx, result = {}) {
  const ctx = normalizeCtx(rawCtx);
  const invalidations = [
    ...tier1CoreSupply(queryClient, ctx),
    ...tier4Financial(queryClient, ctx, result),
  ];
  await Promise.all(invalidations);

  const refetches = [
    ...tier1Refetches(queryClient, ctx),
    ...tier4Refetches(queryClient, ctx),
  ];
  await Promise.all(refetches);

  bumpSupplyStateVersion('refreshForGenericSupply');

  if (import.meta.env.DEV) {
    console.log(`[PartsPerf] refreshForGenericSupply\n  invalidations: ${invalidations.length}\n  refetches: ${refetches.length}`);
  }
}

/**
 * Route to the correct tiered refresh based on action_type
 */
export function getTieredRefresh(actionType) {
  switch (actionType) {
    case 'CREATE_PO':
      return refreshForCreatePO;
    case 'RECEIVE':
    case 'RECEIVE_BATCH':
      return refreshForReceive;
    case 'INSTALL':
    case 'INSTALL_BATCH':
      return refreshForInstall;
    case 'ADJUST_STOCK':
      return refreshForAdjustStock;
    default:
      return refreshForGenericSupply;
  }
}