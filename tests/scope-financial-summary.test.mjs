// Scope Review V3.6C — Financial Summary group/category subtotals from the canonical rollup.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildScopeHierarchy } from '../src/components/scope/scopeHelpers.js';
import { computeScopePricingRollup } from '../src/components/scope/scopePricingHelpers.js';
import { buildFinancialSummarySections, subtotalNotes } from '../src/components/scope/scopeFinancialSummaryModel.js';

const L = (description, min = null, max = null, tbd = false) => ({ description, min, max, tbd });
const I = (id, category_id, group_id, lines, decision_status = 'needs_review') =>
  ({ id, title: id, category_id, group_id, decision_status, pricing_model: 'hard_cost_plus_labor', hard_cost_lines: lines });
const H = (scope_item_id, hours_min, hours_max, rate_snapshot) =>
  ({ id: scope_item_id + hours_min + rate_snapshot, scope_item_id, hours_min, hours_max, hours_tbd: false, rate_snapshot });

// 928 Speaker Production — live data shape
const cats = [{ id: 'prod', name: 'Product Production & Finishing', sort_order: 0 }, { id: 'cad', name: 'Design/Prototype and CAD', sort_order: 1 }];
const groups = [{ id: 'deliv', name: 'Deliverables' }];
const items = [
  I('produce', 'prod', 'deliv', [L('Spacers', 75), L('Trim rings', null, 1075), L('Backer rings - Included'), L('Powder coat - Included')]),
  I('molds', 'prod', 'deliv', [L('Both press molds', 300, 350)]),
  I('protos', 'cad', 'deliv', [L('', 75)]),
  I('tweeter', 'cad', 'deliv', [L('', null, null, true)]),
  I('spacer', 'cad', 'deliv', [L('3D printed testing', 50, 75), L('Test fit', 25, 30)]),
];
const labor = [H('protos', 0.5, 0.75, 125), H('molds', 0.5, 1, 150), H('spacer', 1, 3, 185), H('spacer', 0.5, 1, 150)];
const sections = buildFinancialSummarySections(buildScopeHierarchy(cats, groups, items), labor);

test('928: all five deliverables present, one group per category, no category subtotal', () => {
  assert.equal(sections.length, 2);
  assert.equal(sections.flatMap(c => c.groups.flatMap(g => g.items)).length, 5);
  assert.ok(sections.every(c => c.groups.length === 1 && !c.showCategorySubtotal));
});
test('928: Up to is never given a fabricated minimum', () => {
  assert.equal(sections[0].groups[0].totals.hard_cost_label, 'Up to $1,500');
});
test('928: TBD stays flagged and excluded; known subtotal shown', () => {
  const t = sections[1].groups[0].totals;
  assert.equal(t.hard_cost_tbd_count, 1);
  assert.equal(t.hard_cost_label, '$150–$180 + TBD');
  assert.deepEqual(subtotalNotes(t), ['1 TBD — not included']);
});
test('description-only entries do not create TBD warnings', () => {
  const t = computeScopePricingRollup([I('d', 'c', 'g', [L('Included')])], []);
  assert.deepEqual(subtotalNotes(t), []);
});
test('928: group subtotals reconcile to All Scope', () => {
  const all = computeScopePricingRollup(items, labor);
  const sum = (k) => sections.reduce((s, c) => s + c.groups.reduce((a, g) => a + g.totals[k], 0), 0);
  for (const k of ['hard_cost_max', 'ak_hours_min', 'ak_hours_max', 'ak_labor_min', 'ak_labor_max', 'total_estimate_max']) assert.equal(sum(k), all[k], k);
  assert.equal(sections.reduce((s, c) => s + c.count, 0), all.count);
});
test('flexible sums: exact+exact, range+range, exact+up to', () => {
  const r = (lines) => computeScopePricingRollup(lines.map((l, i) => I('x' + i, 'c', 'g', [l])), []).hard_cost_label;
  assert.equal(r([L('a', 75), L('b', 25)]), '$100');
  assert.equal(r([L('a', 75, 105), L('b', 260, 705)]), '$335–$810');
  assert.equal(r([L('a', 75), L('b', null, 1075)]), 'Up to $1,150');
});
test('larger review: multi-group category gets a category subtotal equal to its groups', () => {
  const c2 = [{ id: 'body', name: 'Body' }, { id: 'eng', name: 'Engine' }];
  const g2 = [{ id: 'paint', name: 'Paint', sort_order: 0 }, { id: 'metal', name: 'Metal', sort_order: 1 }, { id: 'motor', name: 'Motor', sort_order: 2 }];
  const it = [
    I('a', 'body', 'paint', [L('p', 100)], 'approved'), I('b', 'body', 'metal', [L('m', 50, 80)], 'not_now'),
    I('c', 'body', 'metal', [L('m2', null, 40)], 'approved'), I('d', 'eng', 'motor', [L('e', 500)], 'request_changes'),
  ];
  const s = buildFinancialSummarySections(buildScopeHierarchy(c2, g2, it), []);
  assert.equal(s[0].groups.length, 2); assert.ok(s[0].showCategorySubtotal); assert.ok(!s[1].showCategorySubtotal);
  assert.equal(s[0].totals.hard_cost_max, s[0].groups.reduce((a, g) => a + g.totals.hard_cost_max, 0));
  const approved = computeScopePricingRollup(it.filter(i => i.decision_status === 'approved'), []);
  const other = computeScopePricingRollup(it.filter(i => i.decision_status !== 'approved'), []);
  const all = computeScopePricingRollup(it, []);
  assert.equal(approved.hard_cost_max + other.hard_cost_max, all.hard_cost_max);
  assert.equal(approved.count + other.count, all.count);
});