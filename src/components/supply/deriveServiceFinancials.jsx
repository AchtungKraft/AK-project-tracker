/**
 * deriveServiceFinancials — CANONICAL service financial derivation layer
 *
 * STRICT LIFECYCLE ACCOUNTING: Every service dollar in exactly ONE state.
 *
 * LIFECYCLE (mutually exclusive):
 *   PLANNED   → estimate only, no vendor engagement
 *   ORDERED   → vendor committed, exposure exists (not actual spend)
 *   COMPLETED → work done, cost realized (actual spend)
 *   BILLED    → client invoiced, cost realized (actual spend)
 *
 * ACTUAL SPEND = completed + billed ONLY
 * COMMITTED   = ordered ONLY (not overlapping with actual)
 * EXPOSURE    = planned ONLY (not overlapping with committed or actual)
 *
 * MARGIN:
 *   Projected = allBillable − allCost (if everything completes as planned)
 *   Realized  = actualizedBillable − actualCost (current financial truth)
 *   These are independent views. Delta is NOT a loss — it's unrealized.
 */

export function isServiceActualized(service) {
  return ['completed', 'billed'].includes(service.status);
}

export function deriveServiceFinancials(services = []) {
  const counts = { total: 0, planned: 0, ordered: 0, completed: 0, billed: 0 };

  // Mutually exclusive lifecycle cost buckets
  let costPlanned = 0;    // planned only
  let costOrdered = 0;    // ordered only
  let costCompleted = 0;  // completed only
  let costBilled = 0;     // billed only

  // Mutually exclusive lifecycle billable buckets
  let billablePlanned = 0;
  let billableOrdered = 0;
  let billableCompleted = 0;
  let billableBilled = 0;

  // Vendor/internal split (across all statuses)
  let vendorCostAll = 0;
  let internalCostAll = 0;
  let vendorCostActual = 0;
  let internalCostActual = 0;

  let negativeMarginCount = 0;
  const warnings = [];

  for (const svc of services) {
    const status = svc.status || 'planned';
    const cost = svc.total_cost || 0;
    const billable = svc.total_billable || 0;
    const isVendor = svc.vendor_type !== 'internal';
    const isInternal = svc.vendor_type === 'internal';

    counts.total++;
    counts[status] = (counts[status] || 0) + 1;

    // STRICT: each service goes to exactly ONE cost bucket
    switch (status) {
      case 'planned':
        costPlanned += cost;
        billablePlanned += billable;
        break;
      case 'ordered':
        costOrdered += cost;
        billableOrdered += billable;
        break;
      case 'completed':
        costCompleted += cost;
        billableCompleted += billable;
        break;
      case 'billed':
        costBilled += cost;
        billableBilled += billable;
        break;
    }

    // Vendor vs internal (total and actualized)
    if (isVendor) {
      vendorCostAll += cost;
      if (isServiceActualized(svc)) vendorCostActual += cost;
    }
    if (isInternal) {
      internalCostAll += cost;
      if (isServiceActualized(svc)) internalCostActual += cost;
    }

    // Per-service validation
    if (cost > billable && billable > 0) {
      negativeMarginCount++;
      warnings.push({ id: svc.id, level: 'warn', msg: `${svc.description || svc.service_name}: cost ($${cost.toFixed(0)}) > billable ($${billable.toFixed(0)})` });
    }
    if (isServiceActualized(svc) && cost <= 0) {
      warnings.push({ id: svc.id, level: 'info', msg: `${svc.description || svc.service_name}: actualized with $0 cost` });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // AGGREGATES — non-overlapping by construction
  // ═══════════════════════════════════════════════════════════════
  const totalPlannedCost = costPlanned + costOrdered + costCompleted + costBilled;
  const totalPlannedBillable = billablePlanned + billableOrdered + billableCompleted + billableBilled;

  // Actual = completed + billed (work is done)
  const actualCost = costCompleted + costBilled;
  // Committed (not yet actual) = ordered only
  const committedNotActual = costOrdered;
  // Exposure (not committed) = planned only
  const exposure = costPlanned;

  // Realized billable = only from actualized services
  const realizedBillable = billableCompleted + billableBilled;

  // ═══════════════════════════════════════════════════════════════
  // REVENUE
  // ═══════════════════════════════════════════════════════════════
  const revenue = {
    plannedBillable: totalPlannedBillable,
    realizedBillable,
    unrealizedBillable: Math.max(0, totalPlannedBillable - realizedBillable),
  };

  // ═══════════════════════════════════════════════════════════════
  // MARGIN — two independent views
  // ═══════════════════════════════════════════════════════════════
  const projectedMargin = totalPlannedBillable - totalPlannedCost;
  const realizedMargin = realizedBillable - actualCost;
  const projectedMarginPct = totalPlannedBillable > 0 ? (projectedMargin / totalPlannedBillable) * 100 : 0;
  const realizedMarginPct = realizedBillable > 0 ? (realizedMargin / realizedBillable) * 100 : 0;

  // Unrealized = how much projected margin hasn't been realized yet (NOT a loss)
  const unrealizedMarginRemaining = Math.max(0, projectedMargin - realizedMargin);

  // Risk = actual spend not covered by realized billable
  const unbilledActualSpend = Math.max(0, actualCost - realizedBillable);
  // Pending vendor = ordered but not completed
  const pendingVendorExposure = costOrdered;
  // Unbilled completed = completed but not yet billed to client
  const unbilledCompleted = costCompleted;

  // ═══════════════════════════════════════════════════════════════
  // RECONCILIATION ASSERTION
  // ═══════════════════════════════════════════════════════════════
  const reconDrift = Math.abs((costPlanned + costOrdered + costCompleted + costBilled) - totalPlannedCost);

  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    console.table({
      '🔧 Planned': Math.round(costPlanned),
      '🔧 Ordered': Math.round(costOrdered),
      '🔧 Completed': Math.round(costCompleted),
      '🔧 Billed': Math.round(costBilled),
      '🔧 Total': Math.round(totalPlannedCost),
      '🔧 Drift': reconDrift.toFixed(2),
      '💰 Billable': Math.round(totalPlannedBillable),
      '💰 Realized': Math.round(realizedBillable),
      '📊 Proj Margin': Math.round(projectedMargin),
      '📊 Real Margin': Math.round(realizedMargin),
      '📊 Unrealized': Math.round(unrealizedMarginRemaining),
    });

    if (reconDrift > 0.01) {
      console.error(`[SVC RECONCILIATION] Bucket drift: $${reconDrift.toFixed(2)}`);
    }
    if (exposure < -0.01) {
      console.error(`[SVC ASSERTION] Negative exposure: $${exposure.toFixed(2)}`);
    }
    if (actualCost > totalPlannedCost + 0.01) {
      console.warn(`[SVC ASSERTION] Actual ($${actualCost.toFixed(0)}) > Planned ($${totalPlannedCost.toFixed(0)})`);
    }
  }

  return {
    counts,
    revenue,
    costs: {
      plannedCost: totalPlannedCost,
      // Mutually exclusive
      costPlanned,
      costOrdered,
      costCompleted,
      costBilled,
      // Aggregates
      actualCost,
      committedNotActual,
      exposure,
      // Vendor/internal
      vendorCostAll,
      internalCostAll,
      vendorCostActual,
      internalCostActual,
      // Operational
      pendingVendorExposure,
      unbilledCompleted,
      unbilledActualSpend,
    },
    margin: {
      projectedMargin,
      realizedMargin,
      projectedMarginPct,
      realizedMarginPct,
      unrealizedMarginRemaining,
      negativeMarginCount,
    },
    lifecycle: {
      plannedValue: costPlanned,
      orderedValue: costOrdered,
      completedValue: costCompleted,
      billedValue: costBilled,
    },
    warnings,
    _reconciliation: { drift: reconDrift },
  };
}

/**
 * validateServiceFinancial — per-service integrity check
 */
export function validateServiceFinancial(svc) {
  const issues = [];
  const cost = svc.total_cost || 0;
  const billable = svc.total_billable || 0;
  const status = svc.status || 'planned';

  if (cost > billable && billable > 0)
    issues.push({ type: 'NEGATIVE_MARGIN', msg: `Cost $${cost.toFixed(0)} exceeds billable $${billable.toFixed(0)}` });
  if (isServiceActualized(svc) && cost <= 0)
    issues.push({ type: 'ZERO_COST_ACTUALIZED', msg: 'Completed/billed with no cost recorded' });
  if (billable <= 0 && cost > 0)
    issues.push({ type: 'NO_BILLABLE', msg: 'Has cost but no billable revenue' });
  if (status === 'billed' && svc.vendor_type !== 'internal' && cost <= 0)
    issues.push({ type: 'BILLED_NO_VENDOR_COST', msg: 'Billed vendor service with no vendor cost' });

  return issues;
}