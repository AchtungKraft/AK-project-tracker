// Pure "Need funding before ordering" logic + funding target draft payload. No network, no entities.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fundingStatus, addAcc } from '../src/components/project/financials/funding/fundingStatus.js';
import { evaluateDraft, draftFromPlan } from '../src/components/project/financials/funding/fundingDraft.js';

const fa = (dep = {}) => ({ by_type: { deposit: { received: 0, live_count: 0, paid_count: 0, draft_count: 0, ...dep } } });

test('no target → not set (never a false $0 / funded)', () => {
  const s = fundingStatus({ funding_target_cents: null, total_planned_cents: 500000 }, fa({ received: 9999 }));
  assert.equal(s.state, 'not_set');
  assert.equal(s.short, null);
  assert.equal(fundingStatus(null, fa()).state, 'not_set');
});
test('target $0 explicitly set → funded', () => {
  assert.equal(fundingStatus({ funding_target_cents: 0 }, fa()).state, 'funded');
});
test('received below target → need funding with exact shortfall in cents', () => {
  const s = fundingStatus({ funding_target_cents: 1500000 }, fa({ received: 10000.1 }));
  assert.equal(s.state, 'need_funding');
  assert.equal(s.short, 499990);
});
test('only received deposit payments count — planned milestones and drafts do not', () => {
  const s = fundingStatus({ funding_target_cents: 100000, total_planned_cents: 999999 }, fa({ received: 0, draft_count: 1, live_count: 1, paid_count: 0 }));
  assert.equal(s.state, 'need_funding');
  assert.deepEqual(s.pending, { drafted: 1, sent_unpaid: 1 });
});
test('received at or above target → funded', () => {
  assert.equal(fundingStatus({ funding_target_cents: 100000 }, fa({ received: 1000 })).state, 'funded');
});
test('addAcc keeps unknown counts', () => {
  assert.deepEqual(addAcc({ known: 0.1, unknown: 1 }, { known: 0.2, unknown: 2 }), { known: 0.3, unknown: 3 });
});
test('funding target in draft payload: empty → null, value → cents, invalid → error', () => {
  const base = draftFromPlan(null);
  assert.equal(evaluateDraft(base).payload.funding_target_cents, null);
  assert.equal(evaluateDraft({ ...base, target: '15,000' }).payload.funding_target_cents, 1500000);
  assert.equal(evaluateDraft({ ...base, target: '-1' }).errors.length, 1);
  assert.equal(draftFromPlan({ funding_target_cents: 123456 }).target, '1234.56');
});