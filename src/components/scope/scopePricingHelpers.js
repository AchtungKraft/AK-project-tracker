/**
 * Canonical Scope Item pricing helpers.
 * 
 * Pricing model: Hard Cost + AK Labor = Total Estimate
 * All components MUST use these helpers — never recalculate pricing inline.
 */

/**
 * Compute canonical pricing for a single Scope Item.
 * @param {object} item - ScopeItem record
 * @param {Array} laborEstimates - ScopeItemLaborEstimate records for THIS item
 * @returns {object} Canonical pricing object
 */
export function computeScopeItemPricing(item, laborEstimates = []) {
  const model = item.pricing_model || 'legacy_estimate';
  const isClassified = model === 'hard_cost_plus_labor';

  // AK Labor — always computed from rate snapshots
  let ak_hours_min = 0, ak_hours_max = 0;
  let ak_labor_min = 0, ak_labor_max = 0;
  for (const le of laborEstimates) {
    ak_hours_min += le.hours_min || 0;
    ak_hours_max += le.hours_max || 0;
    ak_labor_min += (le.hours_min || 0) * (le.rate_snapshot || 0);
    ak_labor_max += (le.hours_max || 0) * (le.rate_snapshot || 0);
  }
  const labor_estimated = laborEstimates.length > 0 && (ak_hours_min > 0 || ak_hours_max > 0);

  if (!isClassified) {
    // Legacy — return budget fields as-is, no total estimate derivation
    return {
      pricing_model: 'legacy_estimate',
      // Legacy fields
      legacy_budget_min: item.budget_min ?? null,
      legacy_budget_max: item.budget_max ?? null,
      legacy_budget_tbd: item.budget_tbd || false,
      // Hard cost — not available for legacy
      hard_cost_min: null,
      hard_cost_max: null,
      hard_cost_tbd: false,
      hard_cost_note: null,
      // AK labor
      ak_hours_min,
      ak_hours_max,
      ak_labor_min,
      ak_labor_max,
      labor_estimated,
      // Total — not derivable for legacy
      total_estimate_min: null,
      total_estimate_max: null,
      estimate_complete: false,
    };
  }

  // hard_cost_plus_labor
  const hard_cost_min = item.hard_cost_min ?? null;
  const hard_cost_max = item.hard_cost_max ?? null;
  const hard_cost_tbd = item.hard_cost_tbd || false;
  const hard_cost_note = item.hard_cost_note || null;
  const hard_cost_available = !hard_cost_tbd && hard_cost_min != null && hard_cost_max != null;

  // Total estimate — only if both components are available
  const estimate_complete = hard_cost_available && labor_estimated;
  let total_estimate_min = null;
  let total_estimate_max = null;

  if (hard_cost_available && labor_estimated) {
    total_estimate_min = (hard_cost_min || 0) + ak_labor_min;
    total_estimate_max = (hard_cost_max || 0) + ak_labor_max;
  } else if (hard_cost_available && !labor_estimated) {
    // Hard cost only — total = hard cost (labor not estimated, don't assume 0)
    total_estimate_min = null;
    total_estimate_max = null;
  }

  return {
    pricing_model: 'hard_cost_plus_labor',
    legacy_budget_min: null,
    legacy_budget_max: null,
    legacy_budget_tbd: false,
    hard_cost_min,
    hard_cost_max,
    hard_cost_tbd,
    hard_cost_note,
    ak_hours_min,
    ak_hours_max,
    ak_labor_min,
    ak_labor_max,
    labor_estimated,
    total_estimate_min,
    total_estimate_max,
    estimate_complete,
  };
}

/**
 * Compute pricing rollup for a collection of items (by disposition or all).
 * @param {Array} items - ScopeItem records
 * @param {Array} laborEstimates - All ScopeItemLaborEstimate records for this request
 * @returns {object} Aggregated pricing rollup
 */
export function computeScopePricingRollup(items, laborEstimates = []) {
  const laborByItem = new Map();
  for (const le of laborEstimates) {
    if (!laborByItem.has(le.scope_item_id)) laborByItem.set(le.scope_item_id, []);
    laborByItem.get(le.scope_item_id).push(le);
  }

  const result = {
    count: items.length,
    hard_cost_min: 0,
    hard_cost_max: 0,
    hard_cost_tbd_count: 0,
    ak_labor_min: 0,
    ak_labor_max: 0,
    ak_hours_min: 0,
    ak_hours_max: 0,
    total_estimate_min: 0,
    total_estimate_max: 0,
    // Legacy items in this set
    legacy_budget_min: 0,
    legacy_budget_max: 0,
    legacy_budget_tbd_count: 0,
    legacy_count: 0,
    classified_count: 0,
    // Completeness
    all_classified: true,
    has_incomplete: false,
  };

  for (const item of items) {
    const pricing = computeScopeItemPricing(item, laborByItem.get(item.id) || []);

    if (pricing.pricing_model === 'legacy_estimate') {
      result.legacy_count++;
      result.all_classified = false;
      if (pricing.legacy_budget_tbd) {
        result.legacy_budget_tbd_count++;
      } else {
        if (pricing.legacy_budget_min != null) result.legacy_budget_min += pricing.legacy_budget_min;
        if (pricing.legacy_budget_max != null) result.legacy_budget_max += pricing.legacy_budget_max;
      }
    } else {
      result.classified_count++;
      if (pricing.hard_cost_tbd) {
        result.hard_cost_tbd_count++;
      } else {
        result.hard_cost_min += pricing.hard_cost_min || 0;
        result.hard_cost_max += pricing.hard_cost_max || 0;
      }
      if (pricing.estimate_complete) {
        result.total_estimate_min += pricing.total_estimate_min || 0;
        result.total_estimate_max += pricing.total_estimate_max || 0;
      } else {
        result.has_incomplete = true;
      }
    }

    // AK labor always contributes regardless of pricing model
    result.ak_labor_min += pricing.ak_labor_min;
    result.ak_labor_max += pricing.ak_labor_max;
    result.ak_hours_min += pricing.ak_hours_min;
    result.ak_hours_max += pricing.ak_hours_max;
  }

  return result;
}

/**
 * Format a dollar range for display.
 */
export function formatDollarRange(min, max) {
  if (min == null && max == null) return null;
  const fmt = (v) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max)}`;
}

/**
 * Format a compact dollar range (k notation).
 */
export function formatDollarCompact(min, max) {
  if (min == null && max == null) return null;
  const fmt = (v) => v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${v}`;
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max)}`;
}