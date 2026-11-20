/**
 * Presentation helpers for a Scope Item card. Totals come from the canonical
 * computeScopeItemPricing — nothing here recalculates estimates.
 */
import { formatDollarRange } from "./scopePricingHelpers";
import { formatHardLine, formatLaborHours, formatLaborCost } from "./scopeEstimate";

/** Header total + pending reason. */
export function getTotalDisplay(pricing) {
  if (pricing.pricing_model === 'legacy_estimate') {
    if (pricing.legacy_budget_tbd) return { totalLabel: null, pendingReason: 'Estimate TBD' };
    return { totalLabel: formatDollarRange(pricing.legacy_budget_min, pricing.legacy_budget_max), pendingReason: null };
  }
  if (pricing.estimate_format === 'flexible') {
    if (pricing.estimate_complete) return { totalLabel: pricing.total_label, pendingReason: null };
    if (pricing.estimate_partial) return { totalLabel: pricing.total_label, pendingReason: 'Partial estimate' };
    if (pricing.estimate_none) return { totalLabel: null, pendingReason: null };
    return { totalLabel: null, pendingReason: 'Estimate TBD' };
  }
  // Legacy single hard cost — unchanged rules
  if (pricing.estimate_complete) return { totalLabel: pricing.total_label, pendingReason: null };
  const hasHardCost = !pricing.hard_cost_tbd && pricing.hard_cost_min != null && pricing.hard_cost_max != null;
  const hasLabor = pricing.labor_estimated;
  if (pricing.hard_cost_tbd) {
    if (hasLabor && pricing.ak_labor_min > 0) return { totalLabel: `From ${formatDollarRange(pricing.ak_labor_min, null).replace('From ', '')}`, pendingReason: 'Final hard cost TBD' };
    return { totalLabel: null, pendingReason: 'Pending hard cost estimate' };
  }
  if (hasHardCost && !hasLabor) return { totalLabel: null, pendingReason: pricing.labor_tbd_count ? 'AK labor TBD' : 'Pending AK labor' };
  if (!hasHardCost && hasLabor) {
    const partialMin = (pricing.hard_cost_min || 0) + (pricing.ak_labor_min || 0);
    if (partialMin > 0) return { totalLabel: `From ${formatDollarRange(partialMin, null).replace('From ', '')}`, pendingReason: 'Hard cost range still TBD' };
    return { totalLabel: null, pendingReason: 'Pending final hard cost' };
  }
  return { totalLabel: null, pendingReason: 'Estimate pending' };
}

/** Hard cost rows: structured lines, or the single legacy hard cost as one row. value null = description only. */
export function getHardCostRows(item) {
  if (item.pricing_model !== 'hard_cost_plus_labor') return [];
  if (Array.isArray(item.hard_cost_lines)) {
    return item.hard_cost_lines
      .filter(l => l.description?.trim() || l.tbd || l.min != null || l.max != null)
      .map(l => ({ description: l.description?.trim() || 'Hard cost', value: formatHardLine(l), tbd: !!l.tbd }));
  }
  if (!item.hard_cost_tbd && item.hard_cost_min == null && item.hard_cost_max == null) return [];
  return [{ description: item.hard_cost_note?.trim() || 'Hard cost', value: item.hard_cost_tbd ? 'TBD' : formatDollarRange(item.hard_cost_min, item.hard_cost_max), tbd: !!item.hard_cost_tbd }];
}

/** Labor rows sorted by the editor's order. hours/cost null = operation description only. */
export function getLaborRows(laborEstimates) {
  return laborEstimates.filter(le => !le.exclude_hours).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((le, i) => ({
    key: le.id || i,
    category: le.labor_group_name_snapshot || le.labor_group_name || 'Labor',
    description: le.description?.trim() || '',
    hours: formatLaborHours(le),
    cost: le.rate_snapshot ? formatLaborCost(le) : null,
    tbd: !!le.hours_tbd,
    rate: le.rate_snapshot,
  }));
}

/** Legacy notes shown only when they add information not already in a row. */
export function getExtraNotes(item, hardCostRows) {
  const shown = new Set(hardCostRows.map(r => r.description.toLowerCase()));
  const notes = [];
  for (const n of [item.hard_cost_note, item.budget_note]) {
    const t = n?.trim();
    if (t && !shown.has(t.toLowerCase())) { shown.add(t.toLowerCase()); notes.push(t); }
  }
  return notes;
}