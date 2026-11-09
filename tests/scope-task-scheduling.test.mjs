// Pure browser-side logic: scope → task scheduling draft and task estimate panel gating. No network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptySchedule, scheduleError, toTaskDefaults } from '../src/components/scope/scheduleDraft.js';
import { hasEstimateAccess, summaryQueryEnabled, summaryQueryKey, visibleBaselines } from '../src/components/tasks/taskEstimateAccess.js';

test('default schedule → unassigned, no dates, not priority', () => {
  assert.deepEqual(toTaskDefaults(emptySchedule()), { isPriority: false });
  assert.equal(scheduleError(emptySchedule()), null);
});
test('full single-item schedule → TeamMember id + date-only strings + priority', () => {
  const s = { assignedTeamMemberId: '6914974068d873ae2e061f1d', startDate: '2026-11-10', dueDate: '2026-11-20', isPriority: true };
  assert.deepEqual(toTaskDefaults(s), { assignedTeamMemberId: '6914974068d873ae2e061f1d', startDate: '2026-11-10', dueDate: '2026-11-20', isPriority: true });
});
test('bulk defaults are one payload sent once for all selected items', () => {
  const p = toTaskDefaults({ ...emptySchedule(), dueDate: '2026-12-01' });
  assert.deepEqual(p, { dueDate: '2026-12-01', isPriority: false });
});
test('due before start blocks submit; equal allowed', () => {
  assert.ok(scheduleError({ ...emptySchedule(), startDate: '2026-11-10', dueDate: '2026-11-09' }));
  assert.equal(scheduleError({ ...emptySchedule(), startDate: '2026-11-10', dueDate: '2026-11-10' }), null);
});

test('estimate access: only explicit true grants', () => {
  assert.equal(hasEstimateAccess({ can_view_task_estimate: true }), true);
  for (const v of [undefined, null, {}, { can_view_task_estimate: 'true' }, { can_view_task_estimate: 1 }, { can_view_task_estimate: false }]) assert.equal(hasEstimateAccess(v), false);
});
test('unauthorized users never fire the task summary request', () => {
  assert.equal(summaryQueryEnabled(false, 't1'), false);
  assert.equal(summaryQueryEnabled(undefined, 't1'), false);
  assert.equal(summaryQueryEnabled(true, ''), false);
  assert.equal(summaryQueryEnabled(true, 't1'), true);
});
test('task switching: cache key per task, other task data never rendered', () => {
  assert.notDeepEqual(summaryQueryKey('t1'), summaryQueryKey('t2'));
  const d1 = { baselines: [{ id: 'b1', task_id: 't1' }], financials: { task: { id: 't1' } } };
  assert.equal(visibleBaselines(true, 't1', d1).length, 1);
  assert.equal(visibleBaselines(true, 't2', d1), null);
  assert.equal(visibleBaselines(false, 't1', d1), null);
  assert.equal(visibleBaselines(true, 't1', { baselines: [] }), null);
});