/**
 * deriveProjectFinancials — CANONICAL financial derivation layer
 *
 * STRICT LIFECYCLE ACCOUNTING: Every dollar exists in exactly ONE state.
 * No overlapping buckets. No double-counting.
 *
 * PARTS LIFECYCLE (mutually exclusive per unit):
 *   UNORDERED  → planned but no PO yet (planned exposure)
 *   ON_PO      → PO exists, not yet received (ordered exposure / committed)
 *   RECEIVED   → in stock, reserved for project (actual spend, uninvoiced to client)
 *   INSTALLED  → consumed on project (actual spend, operational complete)
 *
 * Installing a received part does NOT add new spend — it was already actual
 * when received. Install is an operational state change, not financial.
 *
 * EXPOSURE SEMANTICS:
 *   plannedExposure   = estimated cost, no commitment (can change)
 *   orderedExposure   = PO exists / vendor order (committed, awaiting delivery)
 *   uninvoicedActuals = cost realized but not yet billed to client
 *   futureLiability   = orderedExposure (money likely owed)
 *
 * RISK SEMANTICS:
 *   operationalRisk   = items not ordered / unresolved procurement
 *   accountingRisk    = actual cost not yet billed to client
 *
 * REVENUE (accrual basis):
 *   Realized Revenue = Invoiced amount
 *
 * MARGIN:
 *   Projected = Planned Revenue − Planned Cost (complete picture)
 *   Realized  = Invoiced Revenue − Actual Spend (current truth)
 *   These are INDEPENDENT views, not comparable.
 */

export function deriveProjectFinancials({ enrichedCommitments = [], metrics = {}, servicesSummary = {} }) {
  // ═══════════════════════════════════════════════════════════════
  // PARTS — mutually exclusive lifecycle buckets per unit
  // ═══════════════════════════════════════════════════════════════
  let partsPlannedCost = 0;
  let partsPlannedRetail = 0;
  let partsCostInstalled = 0;
  let partsCostReceived = 0;
  let partsCostOnPO = 0;
  let partsCostUnordered = 0;

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

    partsCostInstalled += installed * uc;
    const receivedNotInstalled = Math.max(0, reserved - installed);
    partsCostReceived += receivedNotInstalled * uc;
    partsCostOnPO += coveredPO * uc;
    partsCostUnordered += toOrder * uc;
  }

  // Aggregates
  const partsActualSpend = partsCostReceived + partsCostInstalled;
  const partsCommitted = partsActualSpend + partsCostOnPO;

  // ═══════════════════════════════════════════════════════════════
  // SERVICES — mutually exclusive lifecycle buckets
  // ═══════════════════════════════════════════════════════════════
  const svcSummary = servicesSummary || {};
  const svcByStatus = svcSummary.by_status || {};
  const servicesTotalCount = svcSummary.total ?? 0;
  const servicesPlannedCost = svcSummary.total_cost ?? metrics.servicesCost ?? 0;
  const servicesBillable = svcSummary.total_billable ?? metrics.servicesRetail ?? 0;

  const svcPlannedCount = svcByStatus.planned ?? 0;
  const svcOrderedCount = svcByStatus.ordered ?? 0;
  const svcCompletedCount = svcByStatus.completed ?? 0;
  const svcBilledCount = svcByStatus.billed ?? 0;

  const svcRatio = (n) => servicesTotalCount > 0 ? n / servicesTotalCount : 0;
  const svcCostPlannedOnly = servicesPlannedCost * svcRatio(svcPlannedCount);
  const svcCostOrdered = servicesPlannedCost * svcRatio(svcOrderedCount);
  const svcCostCompleted = servicesPlannedCost * svcRatio(svcCompletedCount);
  const svcCostBilled = servicesPlannedCost * svcRatio(svcBilledCount);

  const servicesActualCost = svcCostCompleted + svcCostBilled;
  const servicesCommitted = svcCostOrdered + servicesActualCost;

  // ═══════════════════════════════════════════════════════════════
  // REVENUE (ACCRUAL)
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
  // TOTALS
  // ═══════════════════════════════════════════════════════════════
  const totalPlannedCost = partsPlannedCost + servicesPlannedCost;
  const totalActualSpend = partsActualSpend + servicesActualCost;
  const totalCommitted = partsCommitted + servicesCommitted;

  const projectedMargin = plannedRevenue - totalPlannedCost;
  const realizedMargin = invoicedRevenue - totalActualSpend;
  const unrealizedMarginRemaining = Math.max(0, projectedMargin - realizedMargin);

  // ═══════════════════════════════════════════════════════════════
  // EXPOSURE SEMANTICS — distinct operational buckets
  // Each $ appears in at most ONE exposure bucket
  // ═══════════════════════════════════════════════════════════════
  const exposure = {
    // Estimated cost, no vendor engagement (can still change)
    planned: partsCostUnordered + svcCostPlannedOnly,
    // PO/vendor order exists, awaiting delivery/completion
    ordered: partsCostOnPO + svcCostOrdered,
    // Cost realized but not yet billed to client
    uninvoicedActuals: Math.max(0, totalActualSpend - invoicedRevenue),
    // Total unresolved = planned + ordered (NOT actuals — those are spent)
    totalUnresolved: partsCostUnordered + svcCostPlannedOnly + partsCostOnPO + svcCostOrdered,
  };

  // ═══════════════════════════════════════════════════════════════
  // LIABILITY — money likely owed (committed, not just estimated)
  // ═══════════════════════════════════════════════════════════════
  const liability = {
    // Vendor obligations: PO + ordered services (money we will likely owe)
    futureLiability: exposure.ordered,
    // Already spent: actual spend
    realizedLiability: totalActualSpend,
    // Total: future + realized
    totalLiability: exposure.ordered + totalActualSpend,
  };

  // ═══════════════════════════════════════════════════════════════
  // RISK — operational vs accounting
  // ═══════════════════════════════════════════════════════════════
  let negativeMarginItems = 0;
  for (const c of enrichedCommitments) {
    if ((c.actual_margin ?? c.resolved_margin ?? 0) < -0.01) negativeMarginItems++;
  }

  const risk = {
    // OPERATIONAL: items not yet ordered, procurement gaps
    operational: {
      unorderedParts: partsCostUnordered,
      uncommittedServices: svcCostPlannedOnly,
      total: partsCostUnordered + svcCostPlannedOnly,
    },
    // ACCOUNTING: actual cost not yet billed to client
    accounting: {
      unbilledActualSpend: exposure.uninvoicedActuals,
      overspend: Math.max(0, totalActualSpend - totalPlannedCost),
      total: exposure.uninvoicedActuals,
    },
    negativeMarginItems,
  };

  // ═══════════════════════════════════════════════════════════════
  // RECONCILIATION + BUCKET EXCLUSIVITY ASSERTIONS
  // ═══════════════════════════════════════════════════════════════
  const partsBucketSum = partsCostInstalled + partsCostReceived + partsCostOnPO + partsCostUnordered;
  const svcBucketSum = svcCostPlannedOnly + svcCostOrdered + svcCostCompleted + svcCostBilled;
  const recon = {
    partsBucketSum,
    partsPlanned: partsPlannedCost,
    partsDrift: Math.abs(partsBucketSum - partsPlannedCost),
    svcBucketSum,
    svcPlanned: servicesPlannedCost,
    svcDrift: Math.abs(svcBucketSum - servicesPlannedCost),
    exposureNonNeg: exposure.planned >= -0.01 && exposure.ordered >= -0.01,
    liabilityCheck: liability.totalLiability >= -0.01,
    // Every $ in exactly one state: actual + ordered + planned = totalPlannedCost
    totalBucketCheck: Math.abs((totalActualSpend + exposure.ordered + exposure.planned) - totalPlannedCost),
  };

  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    console.groupCollapsed('[PROJECT FINANCIALS] Lifecycle Accounting');
    console.table({
      '📦 Installed': Math.round(partsCostInstalled),
      '📦 Received': Math.round(partsCostReceived),
      '📦 On PO': Math.round(partsCostOnPO),
      '📦 Unordered': Math.round(partsCostUnordered),
      '📦 Planned': Math.round(partsPlannedCost),
      '📦 Drift': recon.partsDrift.toFixed(2),
      '🔧 Svc Planned': Math.round(svcCostPlannedOnly),
      '🔧 Svc Ordered': Math.round(svcCostOrdered),
      '🔧 Svc Completed': Math.round(svcCostCompleted),
      '🔧 Svc Billed': Math.round(svcCostBilled),
      '🔧 Svc Drift': recon.svcDrift.toFixed(2),
    });
    console.table({
      '📊 Actual Spend': Math.round(totalActualSpend),
      '📊 Ordered Exposure': Math.round(exposure.ordered),
      '📊 Planned Exposure': Math.round(exposure.planned),
      '📊 Uninvoiced Actuals': Math.round(exposure.uninvoicedActuals),
      '📊 Future Liability': Math.round(liability.futureLiability),
      '📊 Total Bucket Check': recon.totalBucketCheck.toFixed(2),
      '💰 Projected Margin': Math.round(projectedMargin),
      '💰 Realized Margin': Math.round(realizedMargin),
      '⚠️ Op Risk': Math.round(risk.operational.total),
      '⚠️ Acct Risk': Math.round(risk.accounting.total),
    });
    console.groupEnd();

    if (recon.partsDrift > 1) console.warn(`[RECON] Parts bucket drift: $${recon.partsDrift.toFixed(2)}`);
    if (recon.svcDrift > 1) console.warn(`[RECON] Service bucket drift: $${recon.svcDrift.toFixed(2)}`);
    if (recon.totalBucketCheck > 1) console.warn(`[RECON] Total bucket drift: $${recon.totalBucketCheck.toFixed(2)}`);
    if (!recon.exposureNonNeg) console.error('[ASSERTION] Negative exposure bucket');
  }

  return {
    revenue,

    parts: {
      plannedCost: partsPlannedCost,
      plannedRetail: partsPlannedRetail,
      costInstalled: partsCostInstalled,
      costReceived: partsCostReceived,
      costOnPO: partsCostOnPO,
      costUnordered: partsCostUnordered,
      actualSpend: partsActualSpend,
      committed: partsCommitted,
      commitmentCount: enrichedCommitments.length,
    },

    services: {
      plannedCost: servicesPlannedCost,
      billable: servicesBillable,
      costPlannedOnly: svcCostPlannedOnly,
      costOrdered: svcCostOrdered,
      costCompleted: svcCostCompleted,
      costBilled: svcCostBilled,
      actualCost: servicesActualCost,
      committed: servicesCommitted,
      byStatus: svcByStatus,
      totalCount: servicesTotalCount,
    },

    totals: {
      plannedCost: totalPlannedCost,
      actualSpend: totalActualSpend,
      committed: totalCommitted,
      projectedMargin,
      realizedMargin,
      unrealizedMarginRemaining,
      revenueRemaining: revenue.remainingToBill,
    },

    exposure,
    liability,
    risk,
    _reconciliation: recon,
  };
}

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
    warnings.push({ level: 'warn', msg: `Parts reconciliation drift: $${fin._reconciliation.partsDrift.toFixed(0)}` });
  if (fin._reconciliation?.svcDrift > 1)
    warnings.push({ level: 'warn', msg: `Services reconciliation drift: $${fin._reconciliation.svcDrift.toFixed(0)}` });
  if (fin._reconciliation?.totalBucketCheck > 1)
    warnings.push({ level: 'warn', msg: `Total bucket exclusivity drift: $${fin._reconciliation.totalBucketCheck.toFixed(0)}` });
  if (fin.exposure.planned < -0.01 || fin.exposure.ordered < -0.01)
    warnings.push({ level: 'error', msg: 'Negative exposure bucket detected' });

  return warnings;
}