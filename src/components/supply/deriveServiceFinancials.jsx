/**
 * deriveServiceFinancials — CANONICAL service financial derivation layer
 *
 * Single source of truth for ALL ServicesDashboard financial numbers.
 * No inline calculations in UI components.
 *
 * LIFECYCLE RULES:
 *   PLANNED   → estimate exists, no vendor commitment yet
 *   ORDERED   → vendor committed, financial exposure exists
 *   COMPLETED → service done, actual cost realized
 *   BILLED    → client invoiced
 *
 * ACTUAL SPEND = only completed + billed services (NOT planned/ordered)
 */

export function isServiceActualized(service) {
  return ['completed', 'billed'].includes(service.status);
}

export function isServiceCommitted(service) {
  return ['ordered', 'completed', 'billed'].includes(service.status);
}

export function deriveServiceFinancials(services = []) {
  const counts = { total: 0, planned: 0, ordered: 0, completed: 0, billed: 0 };
  
  // Lifecycle-bucketed values
  const lifecycle = { plannedValue: 0, orderedValue: 0, completedValue: 0, billedValue: 0 };
  
  let plannedCostTotal = 0;
  let committedCost = 0;   // ordered + completed + billed
  let actualCost = 0;       // completed + billed ONLY
  let vendorCost = 0;
  let internalCost = 0;
  let vendorActual = 0;
  let internalActual = 0;
  let plannedBillable = 0;
  let actualBillable = 0;   // billable on actualized services only
  let pendingVendorExposure = 0;  // ordered but not completed
  let unbilledCompleted = 0;      // completed but not billed
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

    // Planned = all services regardless of status
    plannedCostTotal += cost;
    plannedBillable += billable;

    // Lifecycle value buckets
    switch (status) {
      case 'planned':
        lifecycle.plannedValue += cost;
        break;
      case 'ordered':
        lifecycle.orderedValue += cost;
        committedCost += cost;
        pendingVendorExposure += cost;
        break;
      case 'completed':
        lifecycle.completedValue += cost;
        committedCost += cost;
        actualCost += cost;
        unbilledCompleted += cost;
        actualBillable += billable;
        break;
      case 'billed':
        lifecycle.billedValue += cost;
        committedCost += cost;
        actualCost += cost;
        actualBillable += billable;
        break;
    }

    // Vendor vs internal split
    if (isVendor) {
      vendorCost += cost;
      if (isServiceActualized(svc)) vendorActual += cost;
    }
    if (isInternal) {
      internalCost += cost;
      if (isServiceActualized(svc)) internalActual += cost;
    }

    // Per-service validation
    const margin = billable > 0 ? billable - cost : 0;
    if (margin < -0.01 && billable > 0) negativeMarginCount++;
    if (cost > billable && billable > 0) {
      warnings.push({ id: svc.id, level: 'warn', msg: `${svc.description || svc.service_name}: cost ($${cost.toFixed(0)}) > billable ($${billable.toFixed(0)})` });
    }
    if (status === 'billed' && !['completed', 'billed'].includes(status)) {
      // billed before completed — impossible state, but check
    }
    if (isServiceActualized(svc) && cost <= 0) {
      warnings.push({ id: svc.id, level: 'info', msg: `${svc.description || svc.service_name}: actualized with $0 cost` });
    }
  }

  // Revenue
  const revenue = {
    plannedBillable,
    invoiced: actualBillable, // approximation: billable on billed+completed services
    outstanding: Math.max(0, actualBillable - lifecycle.billedValue), // simplified
  };

  // Margin
  const projectedMargin = plannedBillable - plannedCostTotal;
  const realizedMargin = actualBillable - actualCost;
  const projectedMarginPct = plannedBillable > 0 ? (projectedMargin / plannedBillable) * 100 : 0;
  const realizedMarginPct = actualBillable > 0 ? (realizedMargin / actualBillable) * 100 : 0;

  // Exposure = cost committed but not covered by billing
  const pendingExposure = Math.max(0, plannedCostTotal - actualCost);
  const costAtRisk = Math.max(0, committedCost - actualBillable);

  // Dev reconciliation
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    console.table({
      svc_plannedCost: Math.round(plannedCostTotal),
      svc_committedCost: Math.round(committedCost),
      svc_actualCost: Math.round(actualCost),
      svc_vendorCost: Math.round(vendorCost),
      svc_internalCost: Math.round(internalCost),
      svc_plannedBillable: Math.round(plannedBillable),
      svc_actualBillable: Math.round(actualBillable),
      svc_projectedMargin: Math.round(projectedMargin),
      svc_realizedMargin: Math.round(realizedMargin),
    });
  }

  return {
    counts,
    revenue,
    costs: {
      plannedCost: plannedCostTotal,
      committedCost,
      actualCost,
      vendorCost,
      internalCost,
      vendorActual,
      internalActual,
      pendingExposure,
      pendingVendorExposure,
      unbilledCompleted,
      costAtRisk,
    },
    margin: {
      projectedMargin,
      realizedMargin,
      projectedMarginPct,
      realizedMarginPct,
      marginDelta: realizedMargin - projectedMargin,
      negativeMarginCount,
    },
    lifecycle,
    warnings,
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
  if (status === 'billed' && (svc.vendor_type !== 'internal') && cost <= 0)
    issues.push({ type: 'BILLED_NO_VENDOR_COST', msg: 'Billed vendor service with no vendor cost' });

  return issues;
}