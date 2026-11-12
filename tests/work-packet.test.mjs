// Work Packet regression + Weekly layout tests.
// Run: node --test tests/work-packet.test.mjs  (also under TZ=Asia/Tokyo / TZ=America/Chicago)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: buildStandard } = await import(path.join(root, 'src/components/workload/buildProjectWorkPacketHTML.js'));
const weeklyMod = await import(path.join(root, 'src/components/workload/buildWeeklyWorkPacketHTML.js'));
const buildWeekly = weeklyMod.default;
const DONE = '6913f57422230d8c7ee2ef54';

const stripTime = (h) => h.replace(/Printed [^<·]+/g, 'Printed X');
const taskBox = /border:2px solid #9ca3af;border-radius:3px/g;
const count = (s, re) => (s.match(re) || []).length;
const OPTION_SETS = [
  {},
  { includeChecklists: true },
  { includeChecklists: true, includeCompletedChecklists: true },
  { includeCompletionMarks: false, includeNotes: false },
  { includeChecklists: true, includeCompletionMarks: false, includeNotes: true },
];

function ctxFrom(d, opts) {
  const checklistsByTaskId = {};
  d.checklists.forEach(c => { (checklistsByTaskId[c.task_id] ||= []).push(c); });
  return {
    project: d.project, tasks: d.tasks, buckets: d.buckets,
    teamMemberMap: new Map(d.teamMembers.map(m => [m.id, m])),
    checklistsByTaskId: opts.includeChecklists ? checklistsByTaskId : {},
    options: opts,
  };
}

// ── Synthetic fixture ──
const buckets = [
  { id: 'b2', name: 'Mechanical', order: 2, color: '#f00' },
  { id: 'b1', name: 'Planning', order: 1, color: '#0f0' },
];
const T = (id, due, extra = {}) => ({ id, name: `Task ${id}`, project_id: 'p', due_date: due, ...extra });
const synth = [
  T('a', '2026-11-16', { kanban_bucket_id: 'b2', estimated_hours: 2 }),     // Monday
  T('b', '2026-11-22', { kanban_bucket_id: 'b2', estimated_hours: 1.5 }),   // Sunday, same week
  T('c', '2026-11-15', { kanban_bucket_id: 'b1' }),                         // Sunday, previous week, no estimate
  T('d', '2026-11-17', { kanban_bucket_id: 'b1', estimated_hours: 0 }),     // zero = missing
  T('e', '2026-11-03', { kanban_bucket_id: 'b2', estimated_hours: 4 }),     // overdue
  T('f', '2026-11-04', { kanban_bucket_id: 'b2', status_id: DONE, estimated_hours: 1 }), // past but done
  T('g', null, { kanban_bucket_id: 'b1', estimated_hours: 3 }),             // unscheduled
  T('h', undefined, { estimated_hours: 1 }),                                // unscheduled, no phase
  T('i', '2026-11-16T00:00:00.000Z', { kanban_bucket_id: 'b2' }),           // timestamp form — date part only
];
const today = new Date(2026, 10, 12);

test('weekly grouping: Monday–Sunday weeks, no UTC shift', () => {
  const { weeks, unscheduled } = weeklyMod.groupTasksByWeek(synth);
  const map = Object.fromEntries(weeks.map(w => [w.key, w.tasks.map(t => t.id).sort().join('')]));
  assert.deepEqual(map, { '2026-11-02': 'ef', '2026-11-09': 'c', '2026-11-16': 'abdi' });
  assert.deepEqual(unscheduled.map(t => t.id), ['g', 'h']);
  weeks.forEach(w => { assert.equal(w.start.getDay(), 1); assert.equal(w.end.getDay(), 0); });
});

test('weekly summary: missing estimates not counted as zero-hour', () => {
  const wk = weeklyMod.groupTasksByWeek(synth).weeks.find(w => w.key === '2026-11-16');
  assert.deepEqual(weeklyMod.summarizeWeek(wk.tasks, today), { total: 4, estHours: 3.5, missing: 2, overdue: 0 });
  const past = weeklyMod.groupTasksByWeek(synth).weeks.find(w => w.key === '2026-11-02');
  assert.equal(weeklyMod.summarizeWeek(past.tasks, today).overdue, 1); // done task not overdue
});

test('weekly HTML: order, overdue, unscheduled last, each task once', () => {
  const html = buildWeekly({ project: { name: 'P' }, tasks: synth, buckets, today });
  assert.equal(count(html, taskBox), synth.length);
  synth.forEach(t => assert.equal(count(html, new RegExp(`Task ${t.id}\\b`, 'g')), 1, t.id));
  const pos = (s) => html.indexOf(s);
  // weeks ascending, unscheduled last
  assert.ok(pos('Week of Mon 11/2') < pos('Week of Mon 11/9') && pos('Week of Mon 11/9') < pos('Week of Mon 11/16'));
  assert.ok(pos('Week of Mon 11/16') < pos('Unscheduled / No Due Date'));
  assert.ok(html.includes('Week of Mon 11/16 – Sun 11/22, 2026'));
  // within week of 11/16: Planning (order 1) before Mechanical, Mechanical sorted by due
  const wk = html.slice(pos('Week of Mon 11/16'), pos('Unscheduled'));
  assert.ok(wk.indexOf('>Planning<') < wk.indexOf('>Mechanical<'));
  assert.ok(wk.indexOf('Task a') < wk.indexOf('Task b'));
  // unphased goes last within section
  const un = html.slice(pos('Unscheduled'));
  assert.ok(un.indexOf('Task g') < un.indexOf('GENERAL / NO PHASE') && un.indexOf('GENERAL / NO PHASE') < un.indexOf('Task h'));
  // overdue: e only (f is done); kept in its own week
  assert.equal(count(html, />OVERDUE</g), 1);
  const e = html.indexOf('Task e');
  assert.ok(html.lastIndexOf('OVERDUE', e) > html.lastIndexOf('Week of', e));
  assert.ok(html.slice(pos('Week of Mon 11/2'), pos('Week of Mon 11/9')).includes('1 overdue'));
  // summaries
  assert.ok(wk.includes('4 tasks · 3h 30m est. labor · 2 missing estimates'));
  assert.ok(html.includes('1 task · 0h est. labor · 1 missing estimate'));
  // week heading glued to first phase heading + first task
  assert.match(html, /<section[^>]*>\s*<div style="margin-bottom:8px;">\s*<div style="page-break-inside:avoid;break-inside:avoid;">\s*<div style="margin-top:6px[^]*?Week of/);
  // input not mutated
  assert.equal(synth[0].due_date, '2026-11-16');
});

const realPath = path.join(root, 'node_modules/.cache/packet-real.json');
const origPath = path.join(root, 'node_modules/.cache/origPacket.mjs');
const haveReal = fs.existsSync(realPath) && fs.existsSync(origPath);

test('Standard Work Packet output identical to pre-change generator (real project, all options)', { skip: !haveReal }, async () => {
  const { default: buildOrig } = await import(origPath);
  const d = JSON.parse(fs.readFileSync(realPath, 'utf8'));
  for (const opts of OPTION_SETS) {
    for (const tasks of [d.tasks, d.tasks.slice(0, 7), []]) {
      const ctx = { ...ctxFrom(d, opts), tasks, weekLabel: 'Wk' };
      assert.equal(stripTime(buildStandard(ctx)), stripTime(buildOrig(ctx)), JSON.stringify(opts));
    }
  }
});

test('Weekly layout on real project: every task once, correct weeks, options honored, no money', { skip: !haveReal }, () => {
  const d = JSON.parse(fs.readFileSync(realPath, 'utf8'));
  for (const opts of OPTION_SETS) {
    const html = buildWeekly({ ...ctxFrom(d, opts), today });
    const std = buildStandard(ctxFrom(d, opts));
    assert.equal(count(html, taskBox), d.tasks.length);
    // Same task blocks as Standard (overdue badge aside)
    assert.equal(count(html, /&#9744; Completed/g), count(std, /&#9744; Completed/g));
    assert.equal(count(html, /Notes:</g), count(std, /Notes:</g));
    assert.equal(count(html, /&#9745;/g), count(std, /&#9745;/g));
    assert.equal(count(html, /margin-left:20px;font-size:11px;">&#9744;/g), count(std, /margin-left:20px;font-size:11px;">&#9744;/g));
    const visible = html.replace(/<style>[^]*?<\/style>|<script>[^]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    assert.ok(!visible.includes('$'));
    assert.equal(visible.match(/\b(cost|price|retail|margin|rate|budget|invoice)\b/i), null);
  }
  const html = buildWeekly({ ...ctxFrom(d, {}), today });
  // each task under its correct week heading
  const sections = html.split('<section').slice(1);
  const { weeks } = weeklyMod.groupTasksByWeek(d.tasks);
  assert.equal(sections.length, weeks.length);
  weeks.forEach((w, i) => {
    assert.equal(count(sections[i], taskBox), w.tasks.length);
    const s = weeklyMod.summarizeWeek(w.tasks);
    assert.ok(sections[i].includes(`${s.total} task${s.total !== 1 ? 's' : ''} · `), w.key);
  });
  console.log('REAL', weeks.map(w => `${w.key}:${w.tasks.length} est=${weeklyMod.summarizeWeek(w.tasks).estHours} missing=${weeklyMod.summarizeWeek(w.tasks).missing} overdue=${w.tasks.filter(t => t.due_date < '2026-11-12' && t.status_id !== DONE).length}`).join(' | '));
});