// Scope Review V3.6A — empty Hard Cost / Labor sections are hidden; real lines (TBD, description-only, zero) stay.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getComponentDetailRows, getHardCostRows, getLaborRows } from '../src/components/scope/scopeItemDisplay.js';

const item = (lines) => ({ id: 'i', pricing_model: 'hard_cost_plus_labor', hard_cost_lines: lines });
const L = (description, min = null, max = null, tbd = false) => ({ description, min, max, tbd });
const H = (o) => ({ scope_item_id: 'i', labor_group_name_snapshot: 'Fabrication', rate_snapshot: 185, hours_min: null, hours_max: null, hours_tbd: false, ...o });
const rows = (lines, labor = []) => getComponentDetailRows(item(lines), labor);

test('1. hard cost and labor', () => {
  const r = rows([L('Speakers', 250, 500)], [H({ hours_min: 2 })]);
  assert.equal(r.hardRows.length, 1); assert.equal(r.laborRows.length, 1);
  assert.equal(r.hardRows[0].value, '$250–$500'); assert.equal(r.laborRows[0].hours, '2 hrs');
});
test('2. hard cost only / 3. labor only / 4. neither', () => {
  assert.deepEqual(rows([L('Wire', 50)]).laborRows, []);
  assert.deepEqual(rows([], [H({ hours_max: 5 })]).hardRows, []);
  const n = rows([]); assert.equal(n.hardRows.length + n.laborRows.length, 0);
  const missing = getComponentDetailRows({ id: 'i', pricing_model: 'hard_cost_plus_labor' }, []);
  assert.equal(missing.hardRows.length + missing.laborRows.length, 0);
});
test('blank placeholder hard cost lines do not create a section', () => {
  assert.deepEqual(rows([L(''), L('   ')]).hardRows, []);
});
test('5. description-only hard cost / 6. description-only labor stay visible', () => {
  const r = rows([L('Included with kit')], [H({ description: 'Route harness' })]);
  assert.equal(r.hardRows[0].value, null); assert.equal(r.laborRows[0].hours, null);
  assert.equal(r.laborRows[0].description, 'Route harness');
});
test('7. TBD hard cost / 8. TBD labor stay visible', () => {
  const r = rows([L('', null, null, true)], [H({ hours_tbd: true })]);
  assert.equal(r.hardRows[0].value, 'TBD'); assert.equal(r.laborRows[0].hours, 'TBD');
});
test('9. exact, up to, range, explicit zero', () => {
  const r = rows([L('A', 25), L('B', null, 100), L('C', 10, 20), L('D', 0)], [H({ hours_min: 0 })]);
  assert.deepEqual(r.hardRows.map(x => x.value), ['$25', 'Up to $100', '$10–$20', '$0']);
  assert.equal(r.laborRows[0].hours, '0 hrs');
});
test('client-safe dollar-only labor rows are not counted as operations', () => {
  assert.equal(getLaborRows([{ scope_item_id: 'i', exclude_hours: true, labor_cost_min: 370, labor_cost_max: 370 }]).length, 0);
});
test('card: legacy single hard cost still renders one row; empty legacy renders none', () => {
  const legacy = { pricing_model: 'hard_cost_plus_labor', hard_cost_min: 200, hard_cost_max: 300 };
  assert.equal(getHardCostRows(legacy).length, 1);
  assert.equal(getHardCostRows({ pricing_model: 'hard_cost_plus_labor', hard_cost_min: null, hard_cost_max: null }).length, 0);
});