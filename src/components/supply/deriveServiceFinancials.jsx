/**
 * deriveServiceFinancials — CANONICAL service financial derivation layer
 *
 * STRICT LIFECYCLE ACCOUNTING: Every service dollar in exactly ONE state.
 *
 * LIFECYCLE (mutually exclusive):
 *   PLANNED   → estimate only, no vendor engagement
 *   ORDERED   → vendor committed, awaiting completion
 *   COMPLETED → work done, cost realized, not yet billed
 *   BILLED    → client invoiced, revenue recognized
 *
 * EXPOSURE SEMANTICS:
 *   plannedExposure   = planned-only services (uncommitted estimates)
 *   orderedExposure   = ordered services (vendor committed, awaiting delivery)
 *   uninvoicedActuals = completed but not yet billed to client
 *   futureLiability   = orderedExposure (money likely owed to vendors)
 *
 * RISK SEMANTICS:
 *   operationalRisk   = planned services not yet ordered (procurement gap)
 *   accountingRisk    = actual cost not yet covered by client billing
 */

export function isServiceActualized(service) {
  return ['completed', 'billed'].includes(service.status);
}

export function deriveServiceFinancials(services = []) {
  const counts = { total: 0, planned: 0, ordered: 0, completed: 0, billed: 0 };

  // Mutually exclusive lifecycle cost/billable buckets
  let costPlanned = 0;
  let costOrdered = 0;
  let costCompleted = 0;
  let costBilled = 0;
  let billablePlanned = 0;
  let billableOrdered = 0;
  let billableCompleted = 0;
  let billableBilled = 0;

  // Vendor/internal splits
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

    if (isVendor) {
      vendorCostAll += cost;
      if (isServiceActualized(svc)) vendorCostActual += cost;
    }
    if (isInternal) {
      internalCostAll += cost;
      if (isServiceActualized(svc)) internalCostActual += cost;
    }

    if (cost > billable && billable > 0) {
      negativeMarginCount++;
      warnings.push({ id: svc.id, level: 'warn', msg: `${svc.description || svc.service_name}: cost ($${cost.toFixed(0)}) > billable ($${billable.toFixed(0)})` });
    }
    if (isServiceActualized(svc) && cost <= 0) {
      warnings.push({ id: svc.id, level: 'info', msg: `${svc.description || svc.service_name}: actualized with $0 cost` });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // AGGREGATES
  // ═══════════════════════════════════════════════════════════════
  const totalPlannedCost = costPlanned + costOrdered + costCompleted + costBilled;
  const totalPlannedBillable = billablePlanned + billableOrdered + billableCompleted + billableBilled;
  const actualCost = costCompleted + costBilled;
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
  const unrealizedMarginRemaining = Math.max(0, projectedMargin - realizedMargin);

  // ═══════════════════════════════════════════════════════════════
  // EXPOSURE SEMANTICS — distinct operational buckets
  // ═══════════════════════════════════════════════════════════════
  const exposure = {
    planned: costPlanned,           // estimates, no vendor commitment
    ordered: costOrdered,           // vendor committed, awaiting completion
    uninvoicedActuals: costCompleted, // work done but not billed to client
    totalUnresolved: costPlanned + costOrdered,
  };

  // ═══════════════════════════════════════════════════════════════
  // LIABILITY — money likely owed
  // ═══════════════════════════════════════════════════════════════
  const liability = {
    futureLiability: costOrdered,     // vendor obligations
    realizedLiability: actualCost,    // already spent
    totalLiability: costOrdered + actualCost,
  };

  // ═══════════════════════════════════════════════════════════════
  // RISK — operational vs accounting
  // ═══════════════════════════════════════════════════════════════
  const risk = {
    operational: {
      uncommittedServices: costPlanned,
      total: costPlanned,
    },
    accounting: {
      unbilledActualSpend: Math.max(0, actualCost - realizedBillable),
      unbilledCompleted: costCompleted,
      total: Math.max(0, actualCost - realizedBillable),
    },
  };

  // ═══════════════════════════════════════════════════════════════
  // RECONCILIATION + EXCLUSIVITY ASSERTION
  // ═══════════════════════════════════════════════════════════════
  const bucketSum = costPlanned + costOrdered + costCompleted + costBilled;
  const reconDrift = Math.abs(bucketSum - totalPlannedCost);
  const totalBucketCheck = Math.abs((actualCost + exposure.ordered + exposure.planned) - totalPlannedCost);

  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    console.groupCollapsed('[SERVICE FINANCIALS] Lifecycle Accounting');
    console.table({
      '🔧 Planned': Math.round(costPlanned),
      '🔧 Ordered': Math.round(costOrdered),
      '🔧 Completed': Math.round(costCompleted),
      '🔧 Billed': Math.round(costBilled),
      '🔧 Bucket Sum': Math.round(bucketSum),
      '🔧 Drift': reconDrift.toFixed(2),
    });
    console.table({
      '📊 Actual Cost': Math.round(actualCost),
      '📊 Planned Exposure': Math.round(exposure.planned),
      '📊 Ordered Exposure': Math.round(exposure.ordered),
      '📊 Uninvoiced Actuals': Math.round(exposure.uninvoicedActuals),
      '📊 Future Liability': Math.round(liability.futureLiability),
      '📊 Bucket Check': totalBucketCheck.toFixed(2),
      '💰 Proj Margin': Math.round(projectedMargin),
      '💰 Real Margin': Math.round(realizedMargin),
      '⚠️ Op Risk': Math.round(risk.operational.total),
      '⚠️ Acct Risk': Math.round(risk.accounting.total),
    });
    console.groupEnd();

    if (reconDrift > 0.01) console.error(`[SVC RECON] Bucket drift: $${reconDrift.toFixed(2)}`);
    if (totalBucketCheck > 1) console.warn(`[SVC RECON] Total bucket exclusivity drift: $${totalBucketCheck.toFixed(2)}`);
    if (exposure.planned < -0.01) console.error('[SVC ASSERTION] Negative planned exposure');
    if (exposure.ordered < -0.01) console.error('[SVC ASSERTION] Negative ordered exposure');
  }

  return {
    counts,
    revenue,
    costs: {
      plannedCost: totalPlannedCost,
      costPlanned,
      costOrdered,
      costCompleted,
      costBilled,
      actualCost,
      vendorCostAll,
      internalCostAll,
      vendorCostActual,
      internalCostActual,
    },
    margin: {
      projectedMargin,
      realizedMargin,
      projectedMarginPct,
      realizedMarginPct,
      unrealizedMarginRemaining,
      negativeMarginCount,
    },
    exposure,
    liability,
    risk,
    lifecycle: {
      plannedValue: costPlanned,
      orderedValue: costOrdered,
      completedValue: costCompleted,
      billedValue: costBilled,
    },
    warnings,
    _reconciliation: { drift: reconDrift, totalBucketCheck },
  };
}

export function validateServiceFinancial(svc) {
  const issues = [];
  const cost = svc.total_cost || 0;
  const billable = svc.total_billable || 0;

  if (cost > billable && billable > 0)
    issues.push({ type: 'NEGATIVE_MARGIN', msg: `Cost $${cost.toFixed(0)} exceeds billable $${billable.toFixed(0)}` });
  if (isServiceActualized(svc) && cost <= 0)
    issues.push({ type: 'ZERO_COST_ACTUALIZED', msg: 'Completed/billed with no cost recorded' });
  if (billable <= 0 && cost > 0)
    issues.push({ type: 'NO_BILLABLE', msg: 'Has cost but no billable revenue' });
  if (svc.status === 'billed' && svc.vendor_type !== 'internal' && cost <= 0)
    issues.push({ type: 'BILLED_NO_VENDOR_COST', msg: 'Billed vendor service with no vendor cost' });

  return issues;
}