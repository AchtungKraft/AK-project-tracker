// Pure client-side funding draft logic. No network, no entities.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMoneyToCents, parsePercentToBps, pctOf } from '../src/components/project/financials/funding/fundingFormat.js';
import { evaluateDraft, approvedWarnings, draftFromPlan } from '../src/components/project/financials/funding/fundingDraft.js';

const ms = (o) => ({ id: 'm1', name: 'Deposit', method: 'FIXED_PARTS_FUNDING', amount: '', percent: '', target_date: '', scope_category_id: '', scope_group_id: '', notes: '', ...o });
const draft = (o) => ({ budget: '', confirmed: false, budgetNote: '', notes: '', changeNote: '', milestones: [], ...o });

test('money parsing: cents, commas, $; rejects negative and >2 decimals', () => {
  assert.equal(parseMoneyToCents('1,234.5'), 123450);
  assert.equal(parseMoneyToCents('$0.07'), 7);
  assert.equal(parseMoneyToCents(''), null);
  assert.ok(Number.isNaN(parseMoneyToCents('-5')));
  assert.ok(Number.isNaN(parseMoneyToCents('1.234')));
  assert.equal(parseMoneyToCents('0.1') + parseMoneyToCents('0.2'), 30); // no float drift
});
test('percent parsing bounds', () => {
  assert.equal(parsePercentToBps('33.33'), 3333);
  assert.equal(parsePercentToBps('100'), 10000);
  assert.ok(Number.isNaN(parsePercentToBps('100.01')));
  assert.ok(Number.isNaN(parsePercentToBps('-1')));
});
test('percent rounding matches server (half-up cents)', () => {
  assert.equal(pctOf(1000001, 3333), 333300);
  assert.equal(pctOf(5, 5000), 3); // 2.5 → 3
});
test('percent milestone needs a confirmed budget', () => {
  const unconfirmed = evaluateDraft(draft({ budget: '10000', milestones: [ms({ method: 'PERCENT_OF_AGREED_CLIENT_BUDGET', percent: '30' })] }));
  assert.equal(unconfirmed.rows[0].calc, null);
  assert.equal(unconfirmed.errors.length, 1);
  const ok = evaluateDraft(draft({ budget: '10000', confirmed: true, milestones: [ms({ method: 'PERCENT_OF_AGREED_CLIENT_BUDGET', percent: '30' }), ms({ id: 'm2', amount: '500' })] }));
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.total, 300000 + 50000);
  assert.equal(ok.payload.confirm_agreed_budget, true);
  assert.equal(ok.payload.milestones[0].percent_bps, 3000);
  assert.equal(ok.payload.milestones[1].amount_cents, 50000);
});
test('warnings: over allowance, over 100%, over budget, budget outside approved range', () => {
  const ev = evaluateDraft(draft({ budget: '100', confirmed: true, milestones: [ms({ amount: '5000' }), ms({ id: 'm2', method: 'PERCENT_OF_AGREED_CLIENT_BUDGET', percent: '60' }), ms({ id: 'm3', method: 'PERCENT_OF_AGREED_CLIENT_BUDGET', percent: '50' })] }));
  const w = approvedWarnings(ev, { hard_cost: { min: 1000, max: 2000 }, labor_dollars: { min: 500, max: 900 } });
  assert.equal(w.length, 4);
});
test('round-trip plan → draft keeps values', () => {
  const d = draftFromPlan({ agreed_client_budget_cents: 123456, agreed_budget_confirmed: true, milestones: [{ id: 'x', name: 'A', method: 'PERCENT_OF_AGREED_CLIENT_BUDGET', percent_bps: 1250 }] });
  assert.equal(d.budget, '1234.56');
  assert.equal(d.milestones[0].percent, '12.5');
  assert.equal(evaluateDraft(d).payload.milestones[0].percent_bps, 1250);
});