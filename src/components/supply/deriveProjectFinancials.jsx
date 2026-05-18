/**
 * deriveProjectFinancials — CANONICAL financial derivation layer
 *
 * STRICT LIFECYCLE ACCOUNTING: Every dollar exists in exactly ONE state.
 * No overlapping buckets. No double-counting.
 *
 * PARTS LIFECYCLE (mutually exclusive per unit):
 *   UNORDERED  → planned but no PO yet (exposure)
 *   ON_PO      → PO exists, not yet received (committed)
 *   RECEIVED   → in stock, reserved for project (actual spend)
 *   INSTALLED  → consumed on project (actual spend, operational complete)
 *
 * Installing a received part does NOT add new spend — it was already actual
 * when received. Install is an operational state change, not financial.
 *
 * REVENUE (accrual basis):
 *   Realized Revenue = Invoiced amount (accrual default)
 *   NOT projected billable value
 *
 * MARGIN:
 *   Projected = Planned Revenue − Planned Cost (complete picture)
 *   Realized  = Invoiced Revenue − Actual Spend (current truth)
 *   These are INDEPENDENT views, not comparable. Delta is NOT a loss.
 */

export function deriveProjectFinancials({ enrichedCommitments = [], metrics = {}, servicesSummary = {} }) {
  // ═══════════════════════════════════════════════════════════════
  // PARTS — mutually exclusive lifecycle buckets per unit
  // Each unit of qty is in exactly ONE of: unordered, onPO, received, installed
  // ═══════════════════════════════════════════════════════════════
  let partsPlannedCost = 0;
  let partsPlannedRetail = 0;
  // Mutually exclusive cost buckets
  let partsCostInstalled = 0;   // qty_installed × uc
  let partsCostReceived = 0;    // (reserved_from_stock - qty_installed) × uc — received but not yet installed
  let partsCostOnPO = 0;        // covered_from_po × uc — on PO but not yet received
  let partsCostUnordered = 0;   // to_order × uc — no PO yet

  for (const c of enrichedCommitments) {
    const uc = c.unit_cost ?? 0;
    const ur = c.unit_retail ?? 0;
    const effReq = c.effective_required ?? c.required_total ?? 0;
    const coveredPO = c.covered_from_po ?? 0;
    const reserved = c.reserved_from_stock ?? 0;
    const installed = c.qty_installed ?? 0;
    const toOrder = c.to_order_qty ?? c.to_order ?? 0;

    partsPlannedCost += effReq * uc;
    partsPlannedRetail += effReq * ur;

    // STRICT: each qty unit goes to exactly one bucket
    // installed: these units are consumed (subset of reserved)
    partsCostInstalled += installed * uc;
    // received but not installed: reserved minus what's already installed
    const receivedNotInstalled = Math.max(0, reserved - installed);
    partsCostReceived += receivedNotInstalled * uc;
    // on PO but not yet received/reserved
    partsCostOnPO += coveredPO * uc;
    // not yet on PO
    partsCostUnordered += toOrder * uc;
  }

  // Actual Spend = money irreversibly committed (received into inventory + installed)
  // On PO is committed but not yet actual (can still be cancelled)
  const partsActualSpend = partsCostReceived + partsCostInstalled;
  // Committed = actual + on PO (money we owe or have spent)
  const partsCommitted = partsActualSpend + partsCostOnPO;
  // Exposure = planned cost not yet secured by any PO
  const partsExposure = partsCostUnordered;

  // ═══════════════════════════════════════════════════════════════
  // SERVICES — mutually exclusive lifecycle buckets
  // Each service is in exactly ONE of: planned, ordered, completed, billed
  // ═══════════════════════════════════════════════════════════════
  const svcSummary = servicesSummary || {};
  const svcByStatus = svcSummary.by_status || {};
  const servicesTotalCount = svcSummary.total ?? 0;
  const servicesPlannedCost = svcSummary.total_cost ?? metrics.servicesCost ?? 0;
  const servicesBillable = svcSummary.total_billable ?? metrics.servicesRetail ?? 0;

  // Approximate lifecycle split from count ratios
  const svcPlannedCount = svcByStatus.planned ?? 0;
  const svcOrderedCount = svcByStatus.ordered ?? 0;
  const svcCompletedCount = svcByStatus.completed ?? 0;
  const svcBilledCount = svcByStatus.billed ?? 0;

  // Proportional cost split (best approximation without per-service data in PSM)
  const svcRatio = (statCount) => servicesTotalCount > 0 ? statCount / servicesTotalCount : 0;
  const svcCostPlannedOnly = servicesPlannedCost * svcRatio(svcPlannedCount);
  const svcCostOrdered = servicesPlannedCost * svcRatio(svcOrderedCount);
  const svcCostCompleted = servicesPlannedCost * svcRatio(svcCompletedCount);
  const svcCostBilled = servicesPlannedCost * svcRatio(svcBilledCount);

  // Actual = completed + billed (work is done, cost is real)
  const servicesActualCost = svcCostCompleted + svcCostBilled;
  // Committed = ordered + actual (vendor is engaged)
  const servicesCommitted = svcCostOrdered + servicesActualCost;
  // Exposure = planned only (no vendor engagement yet)
  const servicesExposure = svcCostPlannedOnly;

  // ═══════════════════════════════════════════════════════════════
  // REVENUE (ACCRUAL BASIS)
  // Realized = invoiced (not just projected)
  // ═══════════════════════════════════════════════════════════════
  const plannedRevenue = (metrics.totalPlannedRetail ?? 0) + servicesBillable;
  const invoicedRevenue = metrics.totalInvoiced ?? 0;
  const paidRevenue = metrics.totalPaid ?? 0;

  const revenue = {
    planned: plannedRevenue,
    invoiced: invoicedRevenue,
    paid: paidRevenue,
    outstanding: metrics.invoiceOutstanding ?? 0,
    remainingToBill: Math.max(0, plannedRevenue - invoicedRevenue),
  };

  // ═══════════════════════════════════════════════════════════════
  // TOTALS — strict non-overlapping
  // ═══════════════════════════════════════════════════════════════
  const totalPlannedCost = partsPlannedCost + servicesPlannedCost;
  const totalActualSpend = partsActualSpend + servicesActualCost;
  const totalCommitted = partsCommitted + servicesCommitted;
  const totalExposure = partsExposure + servicesExposure;

  // PROJECTED VIEW: if everything goes to plan
  const projectedMargin = plannedRevenue - totalPlannedCost;

  // REALIZED VIEW: what has actually happened (accrual)
  const realizedMargin = invoicedRevenue - totalActualSpend;

  // NOT a "delta" or "loss" — this is the unrealized portion
  const unrealizedMarginRemaining = Math.max(0, projectedMargin - realizedMargin);

  // ═══════════════════════════════════════════════════════════════
  // RISK — strictly unbilled actual spend
  // ═══════════════════════════════════════════════════════════════
  const unbilledActualSpend = Math.max(0, totalActualSpend - invoicedRevenue);
  const overspendRisk = Math.max(0, totalActualSpend - totalPlannedCost);

  let negativeMarginItems = 0;
  for (const c of enrichedCommitments) {
    if ((c.actual_margin ?? c.resolved_margin ?? 0) < -0.01) negativeMarginItems++;
  }

  // ═══════════════════════════════════════════════════════════════
  // RECONCILIATION ASSERTION
  // Planned = Actual + Committed(pending) + Exposure + rounding
  // ═══════════════════════════════════════════════════════════════
  const reconCheck = {
    partsSum: partsCostInstalled + partsCostReceived + partsCostOnPO + partsCostUnordered,
    partsPlanned: partsPlannedCost,
    partsDrift: Math.abs((partsCostInstalled + partsCostReceived + partsCostOnPO + partsCostUnordered) - partsPlannedCost),
    revenueCheck: invoicedRevenue <= plannedRevenue + 0.01,
    exposureNonNeg: totalExposure >= -0.01,
  };

  // DEV diagnostics
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    console.table({
      '📦 Parts Installed': Math.round(partsCostInstalled),
      '📦 Parts Received': Math.round(partsCostReceived),
      '📦 Parts On PO': Math.round(partsCostOnPO),
      '📦 Parts Unordered': Math.round(partsCostUnordered),
      '📦 Parts Planned': Math.round(partsPlannedCost),
      '📦 Parts Drift': reconCheck.partsDrift.toFixed(2),
      '🔧 Svc Actual': Math.round(servicesActualCost),
      '🔧 Svc Committed': Math.round(servicesCommitted),
      '🔧 Svc Exposure': Math.round(servicesExposure),
      '💰 Revenue Invoiced': Math.round(invoicedRevenue),
      '💰 Revenue Planned': Math.round(plannedRevenue),
      '📊 Projected Margin': Math.round(projectedMargin),
      '📊 Realized Margin': Math.round(realizedMargin),
      '📊 Unrealized Remaining': Math.round(unrealizedMarginRemaining),
    });

    // Hard assertions
    if (reconCheck.partsDrift > 1) {
      console.warn(`[RECONCILIATION] Parts cost buckets drift: $${reconCheck.partsDrift.toFixed(2)}`);
    }
    if (totalExposure < -0.01) {
      console.error(`[ASSERTION] Negative exposure: $${totalExposure.toFixed(2)}`);
    }
  }

  return {
    revenue,

    parts: {
      plannedCost: partsPlannedCost,
      plannedRetail: partsPlannedRetail,
      // Mutually exclusive buckets
      costInstalled: partsCostInstalled,
      costReceived: partsCostReceived,
      costOnPO: partsCostOnPO,
      costUnordered: partsCostUnordered,
      // Aggregates
      actualSpend: partsActualSpend,
      committed: partsCommitted,
      exposure: partsExposure,
      commitmentCount: enrichedCommitments.length,
    },

    services: {
      plannedCost: servicesPlannedCost,
      billable: servicesBillable,
      // Mutually exclusive buckets
      costPlannedOnly: svcCostPlannedOnly,
      costOrdered: svcCostOrdered,
      costCompleted: svcCostCompleted,
      costBilled: svcCostBilled,
      // Aggregates
      actualCost: servicesActualCost,
      committed: servicesCommitted,
      exposure: servicesExposure,
      byStatus: svcByStatus,
      totalCount: servicesTotalCount,
    },

    totals: {
      plannedCost: totalPlannedCost,
      actualSpend: totalActualSpend,
      committed: totalCommitted,
      exposure: totalExposure,
      projectedMargin,
      realizedMargin,
      unrealizedMarginRemaining,
      revenueRemaining: revenue.remainingToBill,
    },

    risk: {
      unbilledActualSpend,
      overspendRisk,
      negativeMarginItems,
    },

    _reconciliation: reconCheck,
  };
}

/**
 * validateProjectFinancials — integrity assertions
 */
export function validateProjectFinancials(fin) {
  const warnings = [];

  if (fin.totals.projectedMargin < -0.01)
    warnings.push({ level: 'error', msg: `Negative projected margin: $${Math.round(fin.totals.projectedMargin)}` });

  if (fin.totals.actualSpend > fin.totals.plannedCost + 0.01)
    warnings.push({ level: 'warn', msg: `Actual spend ($${Math.round(fin.totals.actualSpend)}) exceeds planned ($${Math.round(fin.totals.plannedCost)})` });

  if (fin.revenue.invoiced > fin.revenue.planned + 0.01)
    warnings.push({ level: 'warn', msg: `Invoiced ($${Math.round(fin.revenue.invoiced)}) exceeds planned revenue ($${Math.round(fin.revenue.planned)})` });

  if (fin.revenue.planned <= 0 && fin.totals.plannedCost > 0)
    warnings.push({ level: 'warn', msg: 'Cost committed but no planned revenue' });

  if (fin.risk.negativeMarginItems > 0)
    warnings.push({ level: 'warn', msg: `${fin.risk.negativeMarginItems} item(s) with negative margin` });

  if (fin._reconciliation?.partsDrift > 1)
    warnings.push({ level: 'warn', msg: `Parts cost reconciliation drift: $${fin._reconciliation.partsDrift.toFixed(0)}` });

  if (fin.totals.exposure < -0.01)
    warnings.push({ level: 'error', msg: `Negative exposure: $${Math.round(fin.totals.exposure)}` });

  return warnings;
}