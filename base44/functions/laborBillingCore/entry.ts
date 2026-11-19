import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * laborBillingCore — CANONICAL labor billing calculation (read-only, admin-only).
 *
 * The single source of labor eligibility for: createProjectInvoiceDraft, markInvoiceSent,
 * resolveProjectBillableItems, getProjectsBillingSummary, getOpenDollarsOverview, getProjectFinancialOverview
 * (and through it exportProjectFinancialReport). Callers pin LABOR_LOGIC_VERSION and fail closed on mismatch.
 *
 * EARNED (unchanged v1 rules):
 *   Earned = hours logged on BILLABLE, non-cancelled tasks × (task override ?? project rate). No rate → unpriced, never assumed.
 *   Invoiced hours come from labor lines on sent/partial/paid/overdue invoices (time entries are never modified).
 *   Hours on drafts are "allocated" until sent. Cancelled or deleted invoices release their hours automatically.
 * PROJECTED REMAINING (informational, never earned):
 *   BILLABLE, not cancelled, not done, estimate > 0: max(estimate − logged, 0) hours × rate. No rate → hours reported, amount null.
 *
 * PROJECTED BILLING (labor-v2, advance billing against estimates):
 *   A labor invoice line carries metadata.labor_basis 'earned' (default) or 'projected'. All labor lines count as hours
 *   billed for the task, so hours billed in advance are applied first against hours logged later (no double billing).
 *   Cap per task = done ? logged : max(logged, estimate). Billed = hours on sent/paid lines + hours on drafts.
 *   earned_available_hours    = max(0, logged − billed)                  (same eligibility as labor-v1)
 *   projected_available_hours = max(0, cap − max(logged, billed))        (0 when done, cancelled or no rate)
 *   sendable_hours            = max(0, cap − hours on sent/paid lines)   (send-time ceiling for one draft)
 *   over_invoiced             = hours on sent/paid lines > cap
 *
 * Payload: { project_ids: [...] } | { scope: 'all' } | { self_test: true }
 * Normal requests do not run the regression vectors; { self_test: true } runs them (dedicated verification path).
 * Callers pin LABOR_LOGIC_VERSION, so a changed core can never be used silently.
 */

const LABOR_LOGIC_VERSION = 'labor-v2';
const LABOR_FINAL = ['sent', 'partial', 'paid', 'overdue'];
const DONE = ['done', 'completed', 'complete'];
const CANCELLED = ['cancelled', 'canceled'];
const lr2 = (n) => Math.round((n || 0) * 100) / 100;
const lh = (n) => Math.round((n || 0) * 10000) / 10000;

function computeLaborBilling({ project, tasks, timeEntries, statusLabelById, invoiceStatusById, laborLines, baselineByTask = new Map() }) {
  const logged = new Map();
  for (const e of timeEntries || []) if (e.task_id) logged.set(e.task_id, (logged.get(e.task_id) || 0) + (Number(e.hours) || 0));
  const invH = new Map(); const draftH = new Map(); const invAmt = new Map(); const projH = new Map();
  for (const l of laborLines || []) {
    if (l.type !== 'labor' || !l.source_id) continue;
    const st = invoiceStatusById.get(l.invoice_id); const q = Number(l.qty) || 0;
    if (LABOR_FINAL.includes(st)) { invH.set(l.source_id, (invH.get(l.source_id) || 0) + q); invAmt.set(l.source_id, (invAmt.get(l.source_id) || 0) + (l.line_total ?? 0)); }
    else if (st === 'draft') draftH.set(l.source_id, (draftH.get(l.source_id) || 0) + q);
    else continue;
    if (l.metadata?.labor_basis === 'projected') projH.set(l.source_id, (projH.get(l.source_id) || 0) + q);
  }
  const items = []; const projTasks = [];
  const T = { earned: 0, invoiced: 0, uninvoiced: 0, allocated: 0, uninvH: 0, unpricedH: 0, unpricedTasks: 0, over: 0 };
  const P = { remH: 0, remAmt: 0, unpricedRemH: 0, availH: 0, availAmt: 0 };
  for (const t of tasks || []) {
    if (t.labor_billing_type !== 'BILLABLE') continue;
    const label = statusLabelById.get(t.status_id);
    if (CANCELLED.includes(label)) continue;
    const rawLogged = logged.get(t.id) || 0;
    const hours = lh(rawLogged);
    const rate = t.labor_rate_override ?? project?.labor_billing_rate ?? null;
    const invoicedHours = lh(invH.get(t.id) || 0);
    const draftHours = lh(draftH.get(t.id) || 0);
    const uninvoicedHours = lh(Math.max(0, hours - invoicedHours));
    const done = DONE.includes(label);
    const est = t.estimated_hours > 0 ? t.estimated_hours : 0;
    const cap = done ? rawLogged : Math.max(rawLogged, est);
    const overInvoiced = invoicedHours > lh(cap) + 1e-9;
    if (overInvoiced) T.over++;
    const billedAll = invoicedHours + draftHours;
    const earnedAvail = lh(Math.max(0, hours - billedAll));
    const projAvail = rate == null || done ? 0 : lh(Math.max(0, cap - Math.max(rawLogged, billedAll)));
    const sendable = lh(Math.max(0, cap - invoicedHours));
    P.availH += projAvail; if (rate != null) P.availAmt += projAvail * rate;
    const uninvoicedAmount = rate == null ? null : lr2(uninvoicedHours * rate);
    const allocatedAmount = rate == null ? null : lr2(Math.min(uninvoicedHours, draftHours) * rate);
    if (rate == null) { if (uninvoicedHours > 0) { T.unpricedH += uninvoicedHours; T.unpricedTasks++; } }
    else { T.earned += hours * rate; T.uninvoiced += uninvoicedAmount; T.allocated += allocatedAmount; T.uninvH += uninvoicedHours; }
    T.invoiced += invAmt.get(t.id) || 0;
    items.push({ task_id: t.id, task_name: t.name, rate, hours_logged: hours, invoiced_hours: invoicedHours, draft_hours: draftHours,
      uninvoiced_hours: uninvoicedHours, uninvoiced_amount: uninvoicedAmount, allocated_amount: allocatedAmount, over_invoiced: overInvoiced,
      estimated_hours: est || null, done, cap_hours: lh(cap), earned_available_hours: earnedAvail,
      projected_available_hours: projAvail, projected_available_amount: rate == null ? null : lr2(projAvail * rate), sendable_hours: sendable,
      // Reconciliation (tracking only; eligibility above is unchanged). Earned hours above the estimate stay earned.
      ...reconcile({ rawLogged, billedAll, projBilled: projH.get(t.id) || 0, est, baseline: baselineByTask.get(t.id) }) });

    const remH = !done && est ? Math.max(est - rawLogged, 0) : 0;
    const remAmt = rate == null ? null : remH * rate;
    P.remH += remH;
    if (rate == null) P.unpricedRemH += remH; else P.remAmt += remAmt;
    projTasks.push({ task_id: t.id, estimated_hours: est || null, done, rate, remaining_hours: lh(remH), remaining_amount: remAmt == null ? null : lr2(remAmt) });
  }
  return {
    items,
    totals: { earned: lr2(T.earned), invoiced_amount: lr2(T.invoiced), uninvoiced: lr2(T.uninvoiced), allocated_to_drafts: lr2(T.allocated),
      available: lr2(T.uninvoiced - T.allocated), uninvoiced_hours: lh(T.uninvH), unpriced_hours: lh(T.unpricedH), unpriced_tasks: T.unpricedTasks, over_invoiced_tasks: T.over },
    projected: { tasks: projTasks, totals: { remaining_hours: lh(P.remH), remaining_amount: lr2(P.remAmt), unpriced_remaining_hours: lh(P.unpricedRemH),
      available_hours: lh(P.availH), available_amount: lr2(P.availAmt) } },
  };
}

// Projected (advance) hours are applied first against hours logged later. Applied = the part of projected billing
// already covered by logged hours; unapplied = still ahead of logged work. Nothing here changes time entries or tasks.
function reconcile({ rawLogged, billedAll, projBilled, est, baseline }) {
  const earnedBilled = Math.max(0, billedAll - projBilled);
  const applied = Math.min(projBilled, Math.max(0, rawLogged - earnedBilled));
  return {
    original_estimate_hours: baseline ? { min: baseline.labor_hours_min ?? null, max: baseline.labor_hours_max ?? null } : null,
    revised_estimate_hours: est || null,
    earned_billed_hours: lh(earnedBilled), projected_billed_hours: lh(projBilled),
    projected_applied_hours: lh(applied), projected_unapplied_hours: lh(projBilled - applied),
    overrun_hours: est ? lh(Math.max(0, rawLogged - est)) : 0,
    variance_hours: est ? lh(rawLogged - est) : null,
  };
}

// ── Regression vectors (earned v1 behavior must never change silently) ──
function runVectors() {
  const statusLabelById = new Map([['todo', 'to do'], ['done', 'done'], ['cx', 'cancelled']]);
  const invoiceStatusById = new Map([['A', 'sent'], ['D', 'draft'], ['C', 'cancelled'], ['P', 'paid']]);
  const B = (id, extra) => ({ id, name: id, labor_billing_type: 'BILLABLE', status_id: 'todo', ...extra });
  const cases = [
    {
      name: 'earned, invoiced, drafts, cancelled task/invoice, override, over-invoiced, projected',
      input: {
        project: { labor_billing_rate: 100 },
        tasks: [B('t1', { estimated_hours: 5 }), B('t2', { status_id: 'done', labor_rate_override: 150, estimated_hours: 2 }), B('t3', { status_id: 'cx', estimated_hours: 9 }),
          { id: 't4', labor_billing_type: 'NON_BILLABLE', status_id: 'todo', estimated_hours: 3 }, B('t5', { estimated_hours: 1 }), B('t6')],
        timeEntries: [{ task_id: 't1', hours: 2 }, { task_id: 't1', hours: 1 }, { task_id: 't2', hours: 4 }, { task_id: 't3', hours: 5 }, { task_id: 't4', hours: 2 }, { task_id: 't6', hours: 1 }, { hours: 7 }],
        laborLines: [{ type: 'labor', source_id: 't1', invoice_id: 'A', qty: 1, line_total: 100 }, { type: 'labor', source_id: 't1', invoice_id: 'D', qty: 1, line_total: 100 },
          { type: 'labor', source_id: 't5', invoice_id: 'C', qty: 1, line_total: 100 }, { type: 'labor', source_id: 't6', invoice_id: 'P', qty: 2, line_total: 200 },
          { type: 'part', source_id: 't1', invoice_id: 'A', qty: 5, line_total: 999 }],
      },
      expect: {
        totals: { earned: 1000, invoiced_amount: 300, uninvoiced: 800, allocated_to_drafts: 100, available: 700, uninvoiced_hours: 6, unpriced_hours: 0, unpriced_tasks: 0, over_invoiced_tasks: 1 },
        projected: { remaining_hours: 3, remaining_amount: 300, unpriced_remaining_hours: 0, available_hours: 3, available_amount: 300 },
        item_ids: ['t1', 't2', 't5', 't6'],
        items: { t1: [1, 2, 4], t2: [4, 0, 4], t5: [0, 1, 1], t6: [0, 0, 0] },
      },
    },
    {
      name: 'advance (projected) billing applied first against later logged hours; done task capped at logged',
      input: {
        project: { labor_billing_rate: 100 },
        tasks: [B('a', { estimated_hours: 10 }), B('b', { status_id: 'done', estimated_hours: 9 })],
        timeEntries: [{ task_id: 'a', hours: 4 }, { task_id: 'b', hours: 5 }],
        laborLines: [{ type: 'labor', source_id: 'a', invoice_id: 'A', qty: 4, line_total: 400 }, { type: 'labor', source_id: 'a', invoice_id: 'A', qty: 3, line_total: 300, metadata: { labor_basis: 'projected' } },
          { type: 'labor', source_id: 'b', invoice_id: 'A', qty: 7, line_total: 700, metadata: { labor_basis: 'projected' } }],
      },
      expect: {
        totals: { earned: 900, invoiced_amount: 1400, uninvoiced: 0, allocated_to_drafts: 0, available: 0, uninvoiced_hours: 0, unpriced_hours: 0, unpriced_tasks: 0, over_invoiced_tasks: 1 },
        projected: { remaining_hours: 6, remaining_amount: 600, unpriced_remaining_hours: 0, available_hours: 3, available_amount: 300 },
        item_ids: ['a', 'b'],
        items: { a: [0, 3, 3], b: [0, 0, 0] },
      },
    },
    {
      name: 'no rate: unpriced, never assumed',
      input: { project: { labor_billing_rate: null }, tasks: [B('t7', { estimated_hours: 5 })], timeEntries: [{ task_id: 't7', hours: 2 }], laborLines: [] },
      expect: {
        totals: { earned: 0, invoiced_amount: 0, uninvoiced: 0, allocated_to_drafts: 0, available: 0, uninvoiced_hours: 0, unpriced_hours: 2, unpriced_tasks: 1, over_invoiced_tasks: 0 },
        projected: { remaining_hours: 3, remaining_amount: 0, unpriced_remaining_hours: 3, available_hours: 0, available_amount: 0 },
        item_ids: ['t7'],
        items: { t7: [2, 0, 5] },
      },
    },
  ];
  const results = cases.map((c) => {
    const out = computeLaborBilling({ ...c.input, statusLabelById, invoiceStatusById });
    // items: task_id → [earned_available_hours, projected_available_hours, sendable_hours]
    const got = { totals: out.totals, projected: out.projected.totals, item_ids: out.items.map((i) => i.task_id),
      items: Object.fromEntries(out.items.map((i) => [i.task_id, [i.earned_available_hours, i.projected_available_hours, i.sendable_hours]])) };
    const pass = JSON.stringify(got) === JSON.stringify(c.expect);
    return { name: c.name, pass, ...(pass ? {} : { got, expect: c.expect }) };
  });
  // Reconciliation: r1 billed 4h in advance (estimate 5), then 7h logged → 4h applied, 3h overrun stays earned and billable.
  // r2 billed 4h in advance, only 2h logged → 2h applied, 2h still ahead of work, nothing earned available.
  const rec = computeLaborBilling({ project: { labor_billing_rate: 100 }, statusLabelById, invoiceStatusById,
    tasks: [B('r1', { estimated_hours: 5 }), B('r2', { estimated_hours: 5 })],
    timeEntries: [{ task_id: 'r1', hours: 7 }, { task_id: 'r2', hours: 2 }],
    baselineByTask: new Map([['r1', { labor_hours_min: 3, labor_hours_max: 4 }]]),
    laborLines: [{ type: 'labor', source_id: 'r1', invoice_id: 'A', qty: 4, line_total: 400, metadata: { labor_basis: 'projected' } },
      { type: 'labor', source_id: 'r2', invoice_id: 'P', qty: 4, line_total: 400, metadata: { labor_basis: 'projected' } }] });
  const pickR = (i) => [i.earned_available_hours, i.projected_available_hours, i.projected_billed_hours, i.projected_applied_hours, i.projected_unapplied_hours, i.overrun_hours, i.variance_hours, i.revised_estimate_hours, i.original_estimate_hours?.max ?? null];
  const gotR = Object.fromEntries(rec.items.map((i) => [i.task_id, pickR(i)]));
  const expR = { r1: [3, 0, 4, 4, 0, 2, 2, 5, 4], r2: [0, 1, 4, 2, 2, 0, -3, 5, null] };
  const recPass = JSON.stringify(gotR) === JSON.stringify(expR) && rec.totals.available === 300;
  results.push({ name: 'projected billing reconciles against later hours; overrun above estimate stays earned and billable', pass: recPass, ...(recPass ? {} : { got: gotR, expect: expR, available: rec.totals.available }) });
  return { pass: results.every((r) => r.pass), results };
}

async function all(entity, q) {
  let out = []; let cursor = null;
  do {
    const page = await entity.filter(q, { limit: 1000, ...(cursor ? { cursor } : {}) });
    out = out.concat(page.items); cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return out;
}
const groupBy = (rows, key) => { const m = new Map(); for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (body.self_test) { const vectors = runVectors(); return Response.json({ success: vectors.pass, logic_version: LABOR_LOGIC_VERSION, vectors }); }

    const isAll = body.scope === 'all';
    const ids = Array.isArray(body.project_ids) ? [...new Set(body.project_ids.filter((x) => typeof x === 'string' && x))] : [];
    if (!isAll && !ids.length) return Response.json({ error: 'project_ids or scope "all" is required' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const scope = isAll ? {} : { project_id: { $in: ids } };
    const [tasks, statuses] = await Promise.all([
      all(db.Task, { ...scope, labor_billing_type: 'BILLABLE' }),
      db.StatusList.filter({ scope: 'Task' }),
    ]);
    const pids = isAll ? [...new Set(tasks.map((t) => t.project_id).filter(Boolean))] : ids;
    const [projects, entries, invoices] = pids.length ? await Promise.all([
      all(db.Project, { id: { $in: pids } }),
      all(db.TaskTimeEntry, { project_id: { $in: pids } }),
      all(db.ProjectInvoice, { project_id: { $in: pids } }),
    ]) : [[], [], []];
    const [laborLines, baselines] = await Promise.all([
      invoices.length ? all(db.ProjectInvoiceLine, { invoice_id: { $in: invoices.map((i) => i.id) }, type: 'labor' }) : [],
      tasks.length ? all(db.ScopeEstimateBaseline, { task_id: { $in: tasks.map((t) => t.id) } }) : [],
    ]);
    const baselineByTask = new Map(baselines.map((b) => [b.task_id, b]));

    const statusLabelById = new Map(statuses.map((s) => [s.id, (s.label || '').toLowerCase().trim()]));
    const invoiceStatusById = new Map(invoices.map((i) => [i.id, i.status]));
    const tasksBy = groupBy(tasks, 'project_id'); const entriesBy = groupBy(entries, 'project_id');
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const out = {};
    for (const id of pids) {
      out[id] = computeLaborBilling({ project: projectById.get(id), tasks: tasksBy.get(id) || [], timeEntries: entriesBy.get(id) || [], statusLabelById, invoiceStatusById, laborLines, baselineByTask });
    }
    const empty = computeLaborBilling({ project: null, tasks: [], timeEntries: [], statusLabelById, invoiceStatusById, laborLines: [] });
    return Response.json({ success: true, logic_version: LABOR_LOGIC_VERSION, projects: out, empty });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});