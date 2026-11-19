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
 * Payload: { project_ids: [...] } | { scope: 'all' } | { self_test: true }
 * Every request first runs the regression vectors below; if they fail, the request fails (callers then fail closed).
 */

const LABOR_LOGIC_VERSION = 'labor-v1';
const LABOR_FINAL = ['sent', 'partial', 'paid', 'overdue'];
const DONE = ['done', 'completed', 'complete'];
const CANCELLED = ['cancelled', 'canceled'];
const lr2 = (n) => Math.round((n || 0) * 100) / 100;
const lh = (n) => Math.round((n || 0) * 10000) / 10000;

function computeLaborBilling({ project, tasks, timeEntries, statusLabelById, invoiceStatusById, laborLines }) {
  const logged = new Map();
  for (const e of timeEntries || []) if (e.task_id) logged.set(e.task_id, (logged.get(e.task_id) || 0) + (Number(e.hours) || 0));
  const invH = new Map(); const draftH = new Map(); const invAmt = new Map();
  for (const l of laborLines || []) {
    if (l.type !== 'labor' || !l.source_id) continue;
    const st = invoiceStatusById.get(l.invoice_id); const q = Number(l.qty) || 0;
    if (LABOR_FINAL.includes(st)) { invH.set(l.source_id, (invH.get(l.source_id) || 0) + q); invAmt.set(l.source_id, (invAmt.get(l.source_id) || 0) + (l.line_total ?? 0)); }
    else if (st === 'draft') draftH.set(l.source_id, (draftH.get(l.source_id) || 0) + q);
  }
  const items = []; const projTasks = [];
  const T = { earned: 0, invoiced: 0, uninvoiced: 0, allocated: 0, uninvH: 0, unpricedH: 0, unpricedTasks: 0, over: 0 };
  const P = { remH: 0, remAmt: 0, unpricedRemH: 0 };
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
    const overInvoiced = invoicedHours > hours + 1e-9;
    if (overInvoiced) T.over++;
    const uninvoicedAmount = rate == null ? null : lr2(uninvoicedHours * rate);
    const allocatedAmount = rate == null ? null : lr2(Math.min(uninvoicedHours, draftHours) * rate);
    if (rate == null) { if (uninvoicedHours > 0) { T.unpricedH += uninvoicedHours; T.unpricedTasks++; } }
    else { T.earned += hours * rate; T.uninvoiced += uninvoicedAmount; T.allocated += allocatedAmount; T.uninvH += uninvoicedHours; }
    T.invoiced += invAmt.get(t.id) || 0;
    items.push({ task_id: t.id, task_name: t.name, rate, hours_logged: hours, invoiced_hours: invoicedHours, draft_hours: draftHours,
      uninvoiced_hours: uninvoicedHours, uninvoiced_amount: uninvoicedAmount, allocated_amount: allocatedAmount, over_invoiced: overInvoiced });

    const done = DONE.includes(label);
    const est = t.estimated_hours > 0 ? t.estimated_hours : 0;
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
    projected: { tasks: projTasks, totals: { remaining_hours: lh(P.remH), remaining_amount: lr2(P.remAmt), unpriced_remaining_hours: lh(P.unpricedRemH) } },
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
        projected: { remaining_hours: 3, remaining_amount: 300, unpriced_remaining_hours: 0 },
        item_ids: ['t1', 't2', 't5', 't6'],
      },
    },
    {
      name: 'no rate: unpriced, never assumed',
      input: { project: { labor_billing_rate: null }, tasks: [B('t7', { estimated_hours: 5 })], timeEntries: [{ task_id: 't7', hours: 2 }], laborLines: [] },
      expect: {
        totals: { earned: 0, invoiced_amount: 0, uninvoiced: 0, allocated_to_drafts: 0, available: 0, uninvoiced_hours: 0, unpriced_hours: 2, unpriced_tasks: 1, over_invoiced_tasks: 0 },
        projected: { remaining_hours: 3, remaining_amount: 0, unpriced_remaining_hours: 3 },
        item_ids: ['t7'],
      },
    },
  ];
  const results = cases.map((c) => {
    const out = computeLaborBilling({ ...c.input, statusLabelById, invoiceStatusById });
    const got = { totals: out.totals, projected: out.projected.totals, item_ids: out.items.map((i) => i.task_id) };
    const pass = JSON.stringify(got) === JSON.stringify(c.expect);
    return { name: c.name, pass, ...(pass ? {} : { got, expect: c.expect }) };
  });
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
    const vectors = runVectors();
    if (body.self_test) return Response.json({ success: vectors.pass, logic_version: LABOR_LOGIC_VERSION, vectors });
    if (!vectors.pass) return Response.json({ success: false, error: 'Labor billing regression vectors failed', vectors }, { status: 500 });

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
    const laborLines = invoices.length ? await all(db.ProjectInvoiceLine, { invoice_id: { $in: invoices.map((i) => i.id) }, type: 'labor' }) : [];

    const statusLabelById = new Map(statuses.map((s) => [s.id, (s.label || '').toLowerCase().trim()]));
    const invoiceStatusById = new Map(invoices.map((i) => [i.id, i.status]));
    const tasksBy = groupBy(tasks, 'project_id'); const entriesBy = groupBy(entries, 'project_id');
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const out = {};
    for (const id of pids) {
      out[id] = computeLaborBilling({ project: projectById.get(id), tasks: tasksBy.get(id) || [], timeEntries: entriesBy.get(id) || [], statusLabelById, invoiceStatusById, laborLines });
    }
    const empty = computeLaborBilling({ project: null, tasks: [], timeEntries: [], statusLabelById, invoiceStatusById, laborLines: [] });
    return Response.json({ success: true, logic_version: LABOR_LOGIC_VERSION, projects: out, empty });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});