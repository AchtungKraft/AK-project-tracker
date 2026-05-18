/**
 * resolveFinancialSource — Canonical financial source resolver
 *
 * Normalizes raw commitment/service fields into consistent financial values.
 * Every dashboard MUST consume items through this resolver.
 *
 * RULES:
 * - Never allow actualCost > 0 && plannedCost === 0 without warning
 * - Never allow billableRevenue > 0 && plannedCost === 0 without warning
 * - Every resolved value tracks its source field for debugging
 * - Fallback chains resolve missing values from legacy/alternative fields
 */

// ═══════════════════════════════════════════════════════════════
// PART COMMITMENT RESOLVER
// ═══════════════════════════════════════════════════════════════

export function resolvePartFinancialSource(item) {
  const warnings = [];

  // ── COST: fallback hierarchy ──
  // 1. Backend-resolved unit_cost (already PO-first, then snapshot, then part.cost)
  // 2. actual_unit_cost (alias)
  // 3. planned_unit_cost (snapshot at commitment time)
  // 4. unit_cost_snapshot (raw commitment field)
  // 5. Zero with warning
  let unitCost = 0;
  let costSource = 'missing';

  if ((item.unit_cost ?? 0) > 0) {
    unitCost = item.unit_cost;
    costSource = item.cost_source || 'resolved';
  } else if ((item.actual_unit_cost ?? 0) > 0) {
    unitCost = item.actual_unit_cost;
    costSource = 'actual_unit_cost';
  } else if ((item.planned_unit_cost ?? 0) > 0) {
    unitCost = item.planned_unit_cost;
    costSource = 'planned_unit_cost';
  } else if ((item.unit_cost_snapshot ?? 0) > 0) {
    unitCost = item.unit_cost_snapshot;
    costSource = 'unit_cost_snapshot';
  }

  // ── RETAIL: fallback hierarchy ──
  let unitRetail = 0;
  let retailSource = 'missing';

  if ((item.unit_retail ?? 0) > 0) {
    unitRetail = item.unit_retail;
    retailSource = 'unit_retail';
  } else if ((item.planned_unit_retail ?? 0) > 0) {
    unitRetail = item.planned_unit_retail;
    retailSource = 'planned_unit_retail';
  } else if ((item.unit_retail_snapshot ?? 0) > 0) {
    unitRetail = item.unit_retail_snapshot;
    retailSource = 'unit_retail_snapshot';
  }

  // ── QUANTITIES ──
  const effectiveRequired = item.effective_required ?? item.required_total ?? 0;
  const coveredFromPO = item.covered_from_po ?? 0;
  const reservedFromStock = item.reserved_from_stock ?? 0;
  const qtyInstalled = item.qty_installed ?? 0;
  const toOrder = item.to_order_qty ?? item.to_order ?? 0;

  // ── PLANNED TOTALS: use pre-computed if available, else derive ──
  let plannedCost = 0;
  let plannedCostSource = 'missing';

  if ((item.planned_cost_total ?? 0) > 0) {
    plannedCost = item.planned_cost_total;
    plannedCostSource = 'planned_cost_total';
  } else if (unitCost > 0 && effectiveRequired > 0) {
    plannedCost = unitCost * effectiveRequired;
    plannedCostSource = `${costSource} × effective_required`;
  }

  let plannedRetail = 0;
  let plannedRetailSource = 'missing';

  if ((item.planned_retail_total ?? 0) > 0) {
    plannedRetail = item.planned_retail_total;
    plannedRetailSource = 'planned_retail_total';
  } else if (unitRetail > 0 && effectiveRequired > 0) {
    plannedRetail = unitRetail * effectiveRequired;
    plannedRetailSource = `${retailSource} × effective_required`;
  }

  // ── ACTUAL TOTALS ──
  let actualCost = 0;
  let actualCostSource = 'missing';

  if ((item.actual_cost_total ?? 0) > 0) {
    actualCost = item.actual_cost_total;
    actualCostSource = 'actual_cost_total';
  } else if (unitCost > 0 && effectiveRequired > 0) {
    actualCost = unitCost * effectiveRequired;
    actualCostSource = `${costSource} × effective_required`;
  }

  // ── WARNINGS ──
  if (actualCost > 0 && plannedCost <= 0) {
    // Repair: use actual as planned fallback
    plannedCost = actualCost;
    plannedCostSource = 'fallback_from_actual';
    warnings.push({ type: 'MISSING_PLANNED_COST', msg: `Planned cost was $0 but actual is $${actualCost.toFixed(0)} — using actual as fallback`, severity: 'warn' });
  }

  if (plannedRetail > 0 && plannedCost <= 0) {
    warnings.push({ type: 'REVENUE_WITHOUT_COST', msg: `Has $${plannedRetail.toFixed(0)} revenue but no cost basis`, severity: 'warn' });
  }

  if (unitCost <= 0 && effectiveRequired > 0) {
    warnings.push({ type: 'ZERO_UNIT_COST', msg: 'No cost data available for this item', severity: 'info' });
  }

  if (unitRetail <= 0 && effectiveRequired > 0) {
    warnings.push({ type: 'ZERO_UNIT_RETAIL', msg: 'No retail/revenue data for this item', severity: 'info' });
  }

  return {
    unitCost,
    unitRetail,
    effectiveRequired,
    coveredFromPO,
    reservedFromStock,
    qtyInstalled,
    toOrder,
    plannedCost,
    plannedRetail,
    actualCost,
    warnings,
    _provenance: {
      cost: { value: unitCost, source: costSource },
      retail: { value: unitRetail, source: retailSource },
      plannedCost: { value: plannedCost, source: plannedCostSource },
      plannedRetail: { value: plannedRetail, source: plannedRetailSource },
      actualCost: { value: actualCost, source: actualCostSource },
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// SERVICE COMMITMENT RESOLVER
// ═══════════════════════════════════════════════════════════════

export function resolveServiceFinancialSource(svc) {
  const warnings = [];

  // ── COST: fallback hierarchy ──
  let totalCost = 0;
  let costSource = 'missing';

  if ((svc.total_cost ?? 0) > 0) {
    totalCost = svc.total_cost;
    costSource = 'total_cost';
  } else if ((svc.vendor_cost ?? 0) > 0) {
    totalCost = svc.vendor_cost;
    costSource = 'vendor_cost';
  } else if ((svc.estimated_cost ?? 0) > 0) {
    totalCost = svc.estimated_cost;
    costSource = 'estimated_cost';
  }

  // ── BILLABLE: fallback hierarchy ──
  let totalBillable = 0;
  let billableSource = 'missing';

  if ((svc.total_billable ?? 0) > 0) {
    totalBillable = svc.total_billable;
    billableSource = 'total_billable';
  } else if ((svc.client_price ?? 0) > 0) {
    totalBillable = svc.client_price;
    billableSource = 'client_price';
  } else if ((svc.retail ?? 0) > 0) {
    totalBillable = svc.retail;
    billableSource = 'retail';
  }

  const status = svc.status || 'planned';
  const isActualized = ['completed', 'billed'].includes(status);

  // ── WARNINGS ──
  if (isActualized && totalCost <= 0) {
    warnings.push({ type: 'ZERO_COST_ACTUALIZED', msg: `${svc.description || svc.service_name || 'Service'}: actualized with $0 cost`, severity: 'warn' });
  }

  if (totalCost > totalBillable && totalBillable > 0) {
    warnings.push({ type: 'NEGATIVE_MARGIN', msg: `Cost $${totalCost.toFixed(0)} exceeds billable $${totalBillable.toFixed(0)}`, severity: 'warn' });
  }

  if (totalBillable <= 0 && totalCost > 0) {
    warnings.push({ type: 'NO_BILLABLE', msg: 'Has cost but no billable revenue', severity: 'info' });
  }

  return {
    totalCost,
    totalBillable,
    status,
    vendorType: svc.vendor_type || 'external',
    warnings,
    _provenance: {
      cost: { value: totalCost, source: costSource },
      billable: { value: totalBillable, source: billableSource },
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// BATCH NORMALIZERS — apply to arrays before derivation
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize enriched part commitments for the derivation layer.
 * Ensures unit_cost and unit_retail are populated via fallback chains.
 * Returns items with normalized values + aggregate warnings.
 */
export function normalizePartCommitments(items) {
  const allWarnings = [];
  let missingCostCount = 0;
  let missingRetailCount = 0;
  let fallbackCostCount = 0;

  const normalized = items.map(item => {
    const resolved = resolvePartFinancialSource(item);

    if (resolved._provenance.cost.source === 'missing') missingCostCount++;
    if (resolved._provenance.retail.source === 'missing') missingRetailCount++;
    if (resolved._provenance.plannedCost.source === 'fallback_from_actual') fallbackCostCount++;

    for (const w of resolved.warnings) {
      allWarnings.push({ ...w, itemId: item.commitment_id || item.id, partName: item.part_name });
    }

    // Return original item with patched financial fields
    return {
      ...item,
      unit_cost: resolved.unitCost,
      unit_retail: resolved.unitRetail,
      effective_required: resolved.effectiveRequired,
      planned_cost_total: resolved.plannedCost,
      planned_retail_total: resolved.plannedRetail,
      actual_cost_total: resolved.actualCost,
      _financial_provenance: resolved._provenance,
      _financial_warnings: resolved.warnings,
    };
  });

  // Dev diagnostics
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    if (missingCostCount > 0 || missingRetailCount > 0 || fallbackCostCount > 0) {
      console.groupCollapsed(`[SOURCE RESOLVER] ${items.length} parts — ${missingCostCount} missing cost, ${missingRetailCount} missing retail, ${fallbackCostCount} fallback`);
      for (const w of allWarnings.filter(w => w.severity === 'warn')) {
        console.warn(`  ${w.partName || w.itemId}: ${w.msg}`);
      }
      console.groupEnd();
    }
  }

  return {
    items: normalized,
    sourceWarnings: allWarnings,
    stats: { missingCostCount, missingRetailCount, fallbackCostCount, total: items.length },
  };
}

/**
 * Normalize service commitments for the derivation layer.
 */
export function normalizeServiceCommitments(services) {
  const allWarnings = [];

  const normalized = services.map(svc => {
    const resolved = resolveServiceFinancialSource(svc);

    for (const w of resolved.warnings) {
      allWarnings.push({ ...w, itemId: svc.id, serviceName: svc.description || svc.service_name });
    }

    return {
      ...svc,
      total_cost: resolved.totalCost,
      total_billable: resolved.totalBillable,
      _financial_provenance: resolved._provenance,
      _financial_warnings: resolved.warnings,
    };
  });

  return { items: normalized, sourceWarnings: allWarnings };
}