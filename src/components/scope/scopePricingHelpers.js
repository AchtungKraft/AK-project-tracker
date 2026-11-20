/**
 * Canonical Scope Item pricing helpers.
 *
 * Pricing model: Hard Cost + AK Labor = Total Estimate
 * All components MUST use these helpers — never recalculate pricing inline.
 * Line interpretation (TBD / exact / up to / range / description only) lives in scopeEstimate.js.
 *
 * Two hard-cost formats:
 *  - flexible: item.hard_cost_lines is an array (every item saved by the current editor).
 *  - legacy:   older items with only item-level hard_cost_min/max/tbd. Interpreted exactly as
 *              before (both bounds required, labor required for a complete total) so existing
 *              estimates keep their meaning until someone edits and saves them.
 * MUST MATCH base44/functions/clientScopeReview itemPricing/rollup.
 */
import { classifyEstimate, emptyAgg, addEstimate, mergeAgg, aggBounds, formatAgg, hardLinesAgg, laborAgg } from "./scopeEstimate.js";

export const isFlexibleEstimate = (item) => item?.estimate_format ? item.estimate_format === 'flexible' : Array.isArray(item?.hard_cost_lines);

/**
 * Compute canonical pricing for a single Scope Item.
 * @param {object} item - ScopeItem record
 * @param {Array} laborEstimates - ScopeItemLaborEstimate records for THIS item
 */
export function computeScopeItemPricing(item, laborEstimates = []) {
  const model = item.pricing_model || 'legacy_estimate';
  const labor = laborAgg(laborEstimates);
  const hoursB = aggBounds(labor.hours), laborB = aggBounds(labor.dollars);
  const labor_estimated = labor.hours.numeric_count > 0 || labor.dollars.numeric_count > 0;
  const laborFields = {
    ak_hours_min: hoursB.min, ak_hours_max: hoursB.max,
    ak_labor_min: laborB.min, ak_labor_max: laborB.max,
    labor_estimated,
    labor_tbd_count: labor.hours.tbd_count,
    ak_hours_label: formatAgg(labor.hours, 'hours'),
    ak_labor_label: formatAgg(labor.dollars),
    _labor: labor,
  };

  if (model !== 'hard_cost_plus_labor') {
    const legacy = classifyEstimate(item.budget_min, item.budget_max, item.budget_tbd);
    return {
      pricing_model: 'legacy_estimate', estimate_format: 'legacy',
      legacy_budget_min: item.budget_min ?? null,
      legacy_budget_max: item.budget_max ?? null,
      legacy_budget_tbd: item.budget_tbd || false,
      hard_cost_min: null, hard_cost_max: null, hard_cost_tbd: false, hard_cost_note: null, hard_cost_label: null,
      ...laborFields,
      total_estimate_min: null, total_estimate_max: null, total_label: null,
      estimate_complete: false, estimate_partial: false, estimate_none: false,
      _hard: emptyAgg(), _legacy: addEstimate(emptyAgg(), legacy),
    };
  }

  if (isFlexibleEstimate(item)) {
    const hard = hardLinesAgg(item.hard_cost_lines || []);
    const total = mergeAgg(hard, labor.dollars);
    const hardB = aggBounds(hard), totalB = aggBounds(total);
    const tbd = hard.tbd_count + labor.hours.tbd_count;
    const numeric = total.numeric_count > 0;
    return {
      pricing_model: 'hard_cost_plus_labor', estimate_format: 'flexible',
      legacy_budget_min: null, legacy_budget_max: null, legacy_budget_tbd: false,
      hard_cost_min: hardB.min, hard_cost_max: hardB.max,
      hard_cost_tbd: hard.tbd_count > 0,
      hard_cost_note: item.hard_cost_note || null,
      hard_cost_label: formatAgg(hard),
      ...laborFields,
      total_estimate_min: totalB.min, total_estimate_max: totalB.max,
      total_label: formatAgg({ ...total, tbd_count: tbd }),
      total_lower_open: total.lower_open,
      estimate_complete: numeric && tbd === 0,
      estimate_partial: numeric && tbd > 0,
      estimate_none: !numeric && tbd === 0,
      _hard: hard, _legacy: emptyAgg(), _total: total,
    };
  }

  // Legacy single hard cost (unchanged rules)
  const hard_cost_min = item.hard_cost_min ?? null;
  const hard_cost_max = item.hard_cost_max ?? null;
  const hard_cost_tbd = item.hard_cost_tbd || false;
  const hard_cost_available = !hard_cost_tbd && hard_cost_min != null && hard_cost_max != null;
  const estimate_complete = hard_cost_available && labor_estimated && labor.hours.tbd_count === 0;
  const hard = addEstimate(emptyAgg(), classifyEstimate(hard_cost_min, hard_cost_max, hard_cost_tbd));
  const total = estimate_complete ? mergeAgg(hard, labor.dollars) : null;
  const totalB = total ? aggBounds(total) : { min: null, max: null };
  return {
    pricing_model: 'hard_cost_plus_labor', estimate_format: 'legacy',
    legacy_budget_min: null, legacy_budget_max: null, legacy_budget_tbd: false,
    hard_cost_min, hard_cost_max, hard_cost_tbd,
    hard_cost_note: item.hard_cost_note || null,
    hard_cost_label: hard_cost_tbd ? 'TBD' : formatDollarRange(hard_cost_min, hard_cost_max),
    ...laborFields,
    total_estimate_min: totalB.min,
    total_estimate_max: totalB.max,
    total_label: total ? formatAgg(total) : null,
    estimate_complete,
    estimate_partial: false,
    estimate_none: false,
    _hard: hard, _legacy: emptyAgg(), _total: total || emptyAgg(),
  };
}

/**
 * Compute pricing rollup for a collection of items (by disposition or all).
 * Total = sum of complete items only; has_incomplete flags the rest.
 * Any "Up to" component makes the matching rollup minimum null (lower bound unspecified).
 */
export function computeScopePricingRollup(items, laborEstimates = []) {
  const laborByItem = new Map();
  for (const le of laborEstimates) {
    if (!laborByItem.has(le.scope_item_id)) laborByItem.set(le.scope_item_id, []);
    laborByItem.get(le.scope_item_id).push(le);
  }

  let hard = emptyAgg(), legacy = emptyAgg(), hours = emptyAgg(), dollars = emptyAgg(), total = emptyAgg();
  const result = {
    count: items.length,
    hard_cost_tbd_count: 0,
    labor_tbd_count: 0,
    legacy_budget_tbd_count: 0,
    legacy_count: 0,
    classified_count: 0,
    all_classified: true,
    has_incomplete: false,
  };

  for (const item of items) {
    const p = computeScopeItemPricing(item, laborByItem.get(item.id) || []);
    if (p.pricing_model === 'legacy_estimate') {
      result.legacy_count++;
      result.all_classified = false;
      if (p.legacy_budget_tbd) result.legacy_budget_tbd_count++;
      legacy = mergeAgg(legacy, p._legacy);
    } else {
      result.classified_count++;
      if (p.hard_cost_tbd) result.hard_cost_tbd_count++;
      hard = mergeAgg(hard, p._hard);
      if (p.estimate_complete) {
        total = mergeAgg(total, p._total);
      } else if (!p.estimate_none) {
        result.has_incomplete = true;
      }
    }
    if (p.labor_tbd_count) result.labor_tbd_count++;
    hours = mergeAgg(hours, p._labor.hours);
    dollars = mergeAgg(dollars, p._labor.dollars);
  }

  const hb = aggBounds(hard), lb = aggBounds(legacy), hrb = aggBounds(hours), db = aggBounds(dollars), tb = aggBounds(total);
  const zero = (b) => (b.max == null ? { min: 0, max: 0 } : b); // numeric fields keep 0 when nothing is estimated
  Object.assign(result, {
    hard_cost_min: zero(hb).min, hard_cost_max: zero(hb).max,
    legacy_budget_min: zero(lb).min, legacy_budget_max: zero(lb).max,
    ak_hours_min: zero(hrb).min, ak_hours_max: zero(hrb).max,
    ak_labor_min: zero(db).min, ak_labor_max: zero(db).max,
    total_estimate_min: zero(tb).min, total_estimate_max: zero(tb).max,
    hard_cost_label: formatAgg(hard),
    legacy_budget_label: formatAgg(legacy),
    ak_hours_label: formatAgg(hours, 'hours'),
    ak_labor_label: formatAgg(dollars),
    total_label: total.numeric_count ? formatAgg(total) : null,
    combined_label: formatAgg(mergeAgg(legacy, hard, dollars)),
    combined_compact_label: formatAgg(mergeAgg(legacy, hard, dollars), 'money', { compact: true }),
  });
  return result;
}

/**
 * Format a dollar range for display (stored/snapshot min/max pairs).
 * min null + max → "Up to"; equal bounds → single amount.
 */
export function formatDollarRange(min, max) {
  if (min == null && max == null) return null;
  const fmt = (v) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max)}`;
}

/**
 * Format a compact dollar range (k notation).
 */
export function formatDollarCompact(min, max) {
  if (min == null && max == null) return null;
  const fmt = (v) => v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${v}`;
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max)}`;
}