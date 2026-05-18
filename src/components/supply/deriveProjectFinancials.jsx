/**
 * deriveProjectFinancials — CANONICAL financial derivation layer
 *
 * Single source of truth for all project financial summary numbers.
 * PSMFinancialSummary MUST derive ALL displayed values from this helper.
 * No inline calculations in UI components.
 *
 * RULES:
 * - Parts financials derive ONLY from enrichedCommitments (inventory parts)
 * - Services financials derive ONLY from servicesSummary (non-inventory)
 * - Actual Spend = only realized cost (ordered/received/installed), NOT planned
 * - Projected Margin = Revenue - Planned Cost (best case)
 * - Realized Margin = Revenue - Actual Spend (current truth)
 */

export function deriveProjectFinancials({ enrichedCommitments = [], metrics = {}, servicesSummary = {} }) {
  // ═══════════════════════════════════════════════════════════════
  // PARTS — lifecycle-aware cost derivation
  // ═══════════════════════════════════════════════════════════════
  let partsPlannedCost = 0;
  let partsOrderedCost = 0;
  let partsReceivedCost = 0;    // received = stock allocated from received PO
  let partsInstalledCost = 0;
  let partsUnorderedCost = 0;   // planned but not yet on PO
  let partsPlannedRetail = 0;

  for (const c of enrichedCommitments) {
    const uc = c.unit_cost ?? 0;
    const ur = c.unit_retail ?? 0;
    const effReq = c.effective_required ?? c.required_total ?? 0;
    const coveredPO = c.covered_from_po ?? 0;
    const reserved = c.reserved_from_stock ?? 0;
    const installed = c.qty_installed ?? 0;
    const toOrder = c.to_order_qty ?? c.to_order ?? 0;

    // Planned = full commitment cost
    partsPlannedCost += effReq * uc;
    partsPlannedRetail += effReq * ur;

    // Ordered = on PO (not yet received/installed)
    partsOrderedCost += coveredPO * uc;

    // Received/Allocated = in stock reserved for this project
    partsReceivedCost += reserved * uc;

    // Installed = consumed
    partsInstalledCost += installed * uc;

    // Unordered = gap still needing PO
    partsUnorderedCost += toOrder * uc;
  }

  // Actual Spend for parts = only money actually committed via PO or consumed
  // = ordered + received + installed (received is subset of ordered in lifecycle,
  //   but reserved_from_stock may come from existing inventory not PO)
  // Conservative: actual = ordered (PO exists) + stock allocated (reserved)
  const partsActualSpend = partsOrderedCost + partsReceivedCost + partsInstalledCost;
  // Exposure = planned but not yet on PO
  const partsExposure = partsUnorderedCost;

  // ═══════════════════════════════════════════════════════════════
  // SERVICES — from services read model summary
  // ═══════════════════════════════════════════════════════════════
  const svcSummary = servicesSummary || {};
  const svcByStatus = svcSummary.by_status || {};

  const servicesPlannedCost = svcSummary.total_cost ?? metrics.servicesCost ?? 0;
  const servicesBillable = svcSummary.total_billable ?? metrics.servicesRetail ?? 0;
  // Actual spend for services = ordered + completed + billed (not planned)
  // We approximate from status counts if available
  const servicesOrderedCount = svcByStatus.ordered ?? 0;
  const servicesCompletedCount = svcByStatus.completed ?? 0;
  const servicesBilledCount = svcByStatus.billed ?? 0;
  const servicesPlannedCount = svcByStatus.planned ?? 0;
  const servicesTotalCount = svcSummary.total ?? 0;

  // Best approximation: actual = total - planned portion
  // If we have counts, ratio = (ordered + completed + billed) / total
  const servicesActualRatio = servicesTotalCount > 0
    ? Math.min(1, (servicesOrderedCount + servicesCompletedCount + servicesBilledCount) / servicesTotalCount)
    : (servicesPlannedCost > 0 ? 1 : 0); // if no breakdown, assume all committed
  const servicesActualCost = servicesPlannedCost * servicesActualRatio;
  const servicesExposure = Math.max(0, servicesPlannedCost - servicesActualCost);

  // ═══════════════════════════════════════════════════════════════
  // REVENUE + BILLING — from metrics (backend resolver)
  // ═══════════════════════════════════════════════════════════════
  const revenue = {
    planned: (metrics.totalPlannedRetail ?? 0) + servicesBillable,
    invoiced: metrics.totalInvoiced ?? 0,
    paid: metrics.totalPaid ?? 0,
    outstanding: metrics.invoiceOutstanding ?? 0,
    remainingToBill: Math.max(0, ((metrics.totalPlannedRetail ?? 0) + servicesBillable) - (metrics.totalInvoiced ?? 0)),
  };

  // ═══════════════════════════════════════════════════════════════
  // TOTALS — combined parts + services
  // ═══════════════════════════════════════════════════════════════
  const totalPlannedCost = partsPlannedCost + servicesPlannedCost;
  const totalActualSpend = partsActualSpend + servicesActualCost;
  const totalExposure = partsExposure + servicesExposure;

  const projectedMargin = revenue.planned - totalPlannedCost;
  const realizedMargin = revenue.invoiced - totalActualSpend;
  const marginDelta = realizedMargin - projectedMargin;

  // ═══════════════════════════════════════════════════════════════
  // RISK — operational exposure analysis
  // ═══════════════════════════════════════════════════════════════
  const unbilledCommitted = Math.max(0, totalActualSpend - revenue.invoiced);
  const overspendRisk = Math.max(0, totalActualSpend - totalPlannedCost);

  let negativeMarginItems = 0;
  for (const c of enrichedCommitments) {
    const margin = (c.actual_margin ?? c.resolved_margin ?? 0);
    if (margin < -0.01) negativeMarginItems++;
  }

  // ═══════════════════════════════════════════════════════════════
  // DEV RECONCILIATION LOG
  // ═══════════════════════════════════════════════════════════════
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    console.table({
      partsPlannedCost: Math.round(partsPlannedCost),
      partsOrderedCost: Math.round(partsOrderedCost),
      partsReceivedCost: Math.round(partsReceivedCost),
      partsInstalledCost: Math.round(partsInstalledCost),
      partsUnorderedCost: Math.round(partsUnorderedCost),
      partsActualSpend: Math.round(partsActualSpend),
      servicesPlannedCost: Math.round(servicesPlannedCost),
      servicesActualCost: Math.round(servicesActualCost),
      revenueInvoiced: Math.round(revenue.invoiced),
      revenuePaid: Math.round(revenue.paid),
      projectedMargin: Math.round(projectedMargin),
      realizedMargin: Math.round(realizedMargin),
    });
  }

  return {
    revenue,

    parts: {
      plannedCost: partsPlannedCost,
      orderedCost: partsOrderedCost,
      receivedCost: partsReceivedCost,
      installedCost: partsInstalledCost,
      unorderedCost: partsUnorderedCost,
      actualSpend: partsActualSpend,
      exposure: partsExposure,
      plannedRetail: partsPlannedRetail,
      commitmentCount: enrichedCommitments.length,
    },

    services: {
      plannedCost: servicesPlannedCost,
      billable: servicesBillable,
      actualCost: servicesActualCost,
      exposure: servicesExposure,
      byStatus: svcByStatus,
      totalCount: servicesTotalCount,
    },

    totals: {
      plannedCost: totalPlannedCost,
      actualSpend: totalActualSpend,
      exposure: totalExposure,
      projectedMargin,
      realizedMargin,
      marginDelta,
      revenueRemaining: revenue.remainingToBill,
    },

    risk: {
      unbilledCommitted,
      overspendRisk,
      negativeMarginItems,
      costAtRisk: Math.max(0, totalActualSpend - revenue.invoiced),
    },
  };
}

/**
 * validateProjectFinancials — diagnostics for financial integrity
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

  if (fin.parts.installedCost > 0 && fin.parts.orderedCost <= 0 && fin.parts.receivedCost <= 0)
    warnings.push({ level: 'info', msg: 'Installed parts without purchase history (may be stock-sourced)' });

  return warnings;
}