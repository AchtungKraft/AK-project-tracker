// Scope Review V3.6 — flexible estimate states. Pure logic, no network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyEstimate, formatEstimate, formatHardLine, formatLaborHours, formatLaborCost, hardLinesAgg, laborAgg, formatAgg } from '../src/components/scope/scopeEstimate.js';
import { computeScopeItemPricing, computeScopePricingRollup } from '../src/components/scope/scopePricingHelpers.js';

const L = (min, max, tbd = false, description = 'x') => ({ description, min, max, tbd });
const H = (hours_min, hours_max, hours_tbd = false, rate = 185, id = 'i') => ({ scope_item_id: id, hours_min, hours_max, hours_tbd, rate_snapshot: rate });
const flex = (lines, id = 'i') => ({ id, pricing_model: 'hard_cost_plus_labor', hard_cost_lines: lines });

test('five states classify and display', () => {
  assert.equal(classifyEstimate(null, null, true).state, 'tbd');
  assert.equal(classifyEstimate(250, null).state, 'exact');
  assert.equal(classifyEstimate('', 500).state, 'up_to');
  assert.equal(classifyEstimate(250, 500).state, 'range');
  assert.equal(classifyEstimate('', '').state, 'none');
  assert.equal(formatHardLine(L(null, null, true)), 'TBD');
  assert.equal(formatHardLine(L(250, null)), '$250');
  assert.equal(formatHardLine(L(null, 500)), 'Up to $500');
  assert.equal(formatHardLine(L(250, 500)), '$250–$500');
  assert.equal(formatHardLine(L(null, null)), null);
});

test('zero is a real value, blank is not', () => {
  assert.equal(formatHardLine(L(0, null)), '$0');
  assert.equal(classifyEstimate(0, 0).state, 'range');
  assert.equal(formatEstimate(classifyEstimate(0, 0)), '$0');
  assert.equal(hardLinesAgg([L(null, null)]).numeric_count, 0);
});

test('labor at $185/hr', () => {
  assert.deepEqual([formatLaborHours(H(2, null)), formatLaborCost(H(2, null))], ['2 hrs', '$370']);
  assert.deepEqual([formatLaborHours(H(null, 5)), formatLaborCost(H(null, 5))], ['Up to 5 hrs', 'Up to $925']);
  assert.deepEqual([formatLaborHours(H(2, 5)), formatLaborCost(H(2, 5))], ['2–5 hrs', '$370–$925']);
  assert.equal(formatLaborHours(H(null, null, true)), 'TBD');
  assert.equal(formatLaborHours(H(null, null)), null);
});

test('subtotals', () => {
  assert.equal(formatAgg(hardLinesAgg([L(50, null), L(25, null)])), '$75');
  assert.equal(formatAgg(hardLinesAgg([L(50, null), L(25, 30)])), '$75–$80');
  assert.equal(formatAgg(hardLinesAgg([L(50, null), L(null, 100)])), 'Up to $150');
  assert.equal(formatAgg(laborAgg([H(2, null), H(1, null)]).hours, 'hours'), '3 hrs');
  assert.equal(formatAgg(hardLinesAgg([L(50, null), L(null, null, true)])), '$50 + TBD');
  assert.equal(formatAgg(hardLinesAgg([L(null, null, true)])), 'TBD');
  assert.equal(formatAgg(hardLinesAgg([L(null, null)])), null);
});

test('item totals: complete / up to / partial / description only', () => {
  let p = computeScopeItemPricing(flex([L(50, null)]), [H(2, null)]);
  assert.equal(p.total_label, '$420'); assert.equal(p.estimate_complete, true);
  p = computeScopeItemPricing(flex([L(50, null), L(null, 100)]), []);
  assert.equal(p.total_label, 'Up to $150'); assert.equal(p.total_estimate_min, null); assert.equal(p.estimate_complete, true);
  p = computeScopeItemPricing(flex([L(50, null)]), [H(null, null, true)]);
  assert.equal(p.total_label, '$50 + TBD'); assert.equal(p.estimate_partial, true); assert.equal(p.estimate_complete, false);
  p = computeScopeItemPricing(flex([L(null, null, false, 'Included')]), []);
  assert.equal(p.estimate_none, true); assert.equal(p.total_label, null); assert.equal(p.hard_cost_label, null);
  p = computeScopeItemPricing(flex([L(null, null, false, 'Included'), L(300, 350)]), [H(0.5, 1, false, 150)]);
  assert.equal(p.total_label, '$375–$500'); assert.equal(p.estimate_complete, true);
});

test('legacy single hard cost keeps previous meaning', () => {
  const legacy = { id: 'a', pricing_model: 'hard_cost_plus_labor', hard_cost_min: null, hard_cost_max: null, hard_cost_tbd: false };
  let p = computeScopeItemPricing(legacy, [H(4, 6, false, 125, 'a')]);
  assert.equal(p.estimate_format, 'legacy'); assert.equal(p.estimate_complete, false); assert.equal(p.total_label, null);
  p = computeScopeItemPricing({ ...legacy, hard_cost_min: 200, hard_cost_max: 300 }, [H(4, 12, false, 125, 'a')]);
  assert.equal(p.total_label, '$700–$1,800'); assert.equal(p.estimate_complete, true);
  p = computeScopeItemPricing({ ...legacy, hard_cost_min: 25, hard_cost_max: null }, []);
  assert.equal(p.hard_cost_label, 'From $25'); assert.equal(p.estimate_complete, false);
});

test('rollup: only complete items in total; up-to keeps lower bound open; TBD flags incomplete', () => {
  const items = [flex([L(50, null)], 'a'), flex([L(null, 100)], 'b'), flex([L(null, null, true)], 'c'), flex([L(null, null)], 'd')];
  const r = computeScopePricingRollup(items, []);
  assert.equal(r.total_label, 'Up to $150');
  assert.equal(r.total_estimate_min, null);
  assert.equal(r.hard_cost_label, 'Up to $150 + TBD');
  assert.equal(r.has_incomplete, true);
  assert.equal(r.hard_cost_tbd_count, 1);
  const r2 = computeScopePricingRollup([items[0], items[3]], []);
  assert.equal(r2.has_incomplete, false); assert.equal(r2.total_label, '$50');
});

test('client-safe data (no rates) gives the same labels', () => {
  const lines = [{ scope_item_id: 'a', hours_min: 2, hours_max: null, exclude_dollars: true }, { scope_item_id: 'a', hours_min: null, hours_max: null, hours_tbd: true }, { scope_item_id: 'a', exclude_hours: true, labor_cost_min: 370, labor_cost_max: 370 }];
  const p = computeScopeItemPricing(flex([L(50, null)], 'a'), lines);
  assert.equal(p.ak_hours_label, '2 hrs + TBD');
  assert.equal(p.ak_labor_label, '$370 + TBD');
  assert.equal(p.total_label, '$420 + TBD');
});