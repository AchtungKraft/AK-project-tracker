import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * getOpenDollarsOverview — READ-ONLY, admin-only portfolio view of money not yet collected.
 *
 *   Unbilled Project Value = uninvoiced parts + uninvoiced services (getProjectsBillingSummary, canonical computeItems)
 *                          + earned uninvoiced labor (computeLaborBilling below)
 *   Outstanding Invoiced   = balance_due of sent / partial / overdue invoices
 *   Total Open Dollars     = Unbilled Project Value + Outstanding Invoiced
 *
 * Items sitting on draft invoices are still unbilled (shown as "on drafts", never added twice).
 * Draft face value is never added; differences between drafts and current values are flagged only.
 * Future scope (confirmed agreed budget) and projected remaining labor are reported separately, never in the totals.
 * Never writes.
 */

// ┌─ CANONICAL LABOR BILLING v1 — keep identical in getProjectFinancialOverview, resolveProjectBillableItems,
// │  createProjectInvoiceDraft, markInvoiceSent, getOpenDollarsOverview.
// │  Earned = hours logged on BILLABLE, non-cancelled tasks × (task override ?? project rate). No rate → unpriced, never assumed.
// │  Invoiced hours come from labor lines on sent/partial/paid/overdue invoices (time entries are never modified).
// │  Hours on drafts are "allocated" until sent. Cancelled or deleted invoices release their hours automatically.
const LABOR_FINAL = ['sent', 'partial', 'paid', 'overdue'];
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
  const items = [];
  const T = { earned: 0, invoiced: 0, uninvoiced: 0, allocated: 0, uninvH: 0, unpricedH: 0, unpricedTasks: 0, over: 0 };
  for (const t of tasks || []) {
    if (t.labor_billing_type !== 'BILLABLE') continue;
    if (['cancelled', 'canceled'].includes(statusLabelById.get(t.status_id))) continue;
    const hours = lh(logged.get(t.id) || 0);
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
  }
  return { items, totals: { earned: lr2(T.earned), invoiced_amount: lr2(T.invoiced), uninvoiced: lr2(T.uninvoiced), allocated_to_drafts: lr2(T.allocated),
    available: lr2(T.uninvoiced - T.allocated), uninvoiced_hours: lh(T.uninvH), unpriced_hours: lh(T.unpricedH), unpriced_tasks: T.unpricedTasks, over_invoiced_tasks: T.over } };
}
// └─────────────────────────────────────────────────────────────────────────

const OUTSTANDING = ['sent', 'partial', 'overdue'];

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

    const db = base44.asServiceRole.entities;
    const [summaryRes, projects, invoices, laborLines, tasks, entries, statuses, plans] = await Promise.all([
      base44.functions.invoke('getProjectsBillingSummary', {}),
      all(db.Project, {}),
      all(db.ProjectInvoice, {}),
      all(db.ProjectInvoiceLine, { type: 'labor' }),
      all(db.Task, { labor_billing_type: 'BILLABLE' }),
      all(db.TaskTimeEntry, {}),
      db.StatusList.filter({ scope: 'Task' }),
      all(db.ScopeFundingPlan, {}),
    ]);
    const summary = summaryRes.data;
    if (!summary?.success) return Response.json({ error: 'Parts and services summary unavailable' }, { status: 502 });

    const psByProject = new Map(summary.projects.map((p) => [p.project_id, p]));
    const statusLabelById = new Map(statuses.map((s) => [s.id, (s.label || '').toLowerCase().trim()]));
    const isDone = (t) => ['done', 'completed', 'complete'].includes(statusLabelById.get(t.status_id));
    const invoiceStatusById = new Map(invoices.map((i) => [i.id, i.status]));
    const invByProject = groupBy(invoices, 'project_id');
    const tasksByProject = groupBy(tasks, 'project_id');
    const billableTaskIds = new Set(tasks.map((t) => t.id));
    const entriesByProject = groupBy(entries.filter((e) => billableTaskIds.has(e.task_id)), 'project_id');
    const laborLinesByInvoice = groupBy(laborLines, 'invoice_id');
    const planByProject = new Map(plans.map((p) => [p.project_id, p]));

    const rows = [];
    for (const project of projects) {
      if (project.is_system_project) continue;
      const ps = psByProject.get(project.id);
      const pInvoices = invByProject.get(project.id) || [];
      const pTasks = tasksByProject.get(project.id) || [];
      const pEntries = entriesByProject.get(project.id) || [];
      const pLaborLines = pInvoices.flatMap((i) => laborLinesByInvoice.get(i.id) || []);
      const labor = computeLaborBilling({ project, tasks: pTasks, timeEntries: pEntries, statusLabelById, invoiceStatusById, laborLines: pLaborLines });
      const L = labor.totals;

      const parts = ps?.breakdown?.parts_total ?? 0;
      const services = ps?.breakdown?.services_total ?? 0;
      const unbilled = lr2(parts + services + L.uninvoiced);
      const onDrafts = lr2((ps?.allocated_to_drafts ?? 0) + L.allocated_to_drafts);
      const drafts = pInvoices.filter((i) => i.status === 'draft');
      const draftFace = lr2(drafts.reduce((a, i) => a + (i.subtotal ?? i.total ?? 0), 0));
      const outstandingInv = pInvoices.filter((i) => OUTSTANDING.includes(i.status));
      const outstanding = lr2(outstandingInv.reduce((a, i) => a + (i.balance_due ?? Math.max(0, (i.total ?? 0) - (i.paid_amount ?? 0))), 0));

      // Separate, never in totals
      let projectedLabor = 0;
      for (const t of pTasks) {
        if (['cancelled', 'canceled'].includes(statusLabelById.get(t.status_id)) || isDone(t)) continue;
        const rate = t.labor_rate_override ?? project.labor_billing_rate ?? null;
        const loggedH = pEntries.filter((e) => e.task_id === t.id).reduce((a, e) => a + (Number(e.hours) || 0), 0);
        if (rate != null && t.estimated_hours > 0) projectedLabor += Math.max(t.estimated_hours - loggedH, 0) * rate;
      }
      const plan = planByProject.get(project.id);
      const agreedBudget = plan?.agreed_budget_confirmed && plan.agreed_client_budget_cents != null ? lr2(plan.agreed_client_budget_cents / 100) : null;

      const flags = [];
      if (L.unpriced_hours > 0) flags.push({ code: 'LABOR_RATE_NOT_SET', message: `${L.unpriced_hours}h of billable labor on ${L.unpriced_tasks} task(s) have no billing rate and are not counted.` });
      if (L.over_invoiced_tasks > 0) flags.push({ code: 'LABOR_OVER_INVOICED', message: `${L.over_invoiced_tasks} task(s) have more hours invoiced than logged.` });
      if (drafts.length && Math.abs(draftFace - onDrafts) > 0.01) flags.push({ code: 'DRAFTS_DIFFER_FROM_CURRENT', message: `Draft invoices total $${draftFace.toFixed(2)}; the current uninvoiced value of the items on them is $${onDrafts.toFixed(2)}. Review the drafts before sending.` });

      const total = lr2(unbilled + outstanding);
      if (total === 0 && !flags.length && !drafts.length) continue;
      rows.push({
        project_id: project.id, project_name: project.name, client_name: project.client_name || null,
        labor_rate: project.labor_billing_rate ?? null, labor_unpriced_hours: L.unpriced_hours,
        unbilled: { parts: lr2(parts), services: lr2(services), labor: L.uninvoiced, labor_hours: L.uninvoiced_hours, total: unbilled },
        on_drafts: onDrafts, draft_count: drafts.length, draft_face_value: draftFace,
        outstanding, outstanding_count: outstandingInv.length,
        total_open: total,
        future: { agreed_budget: agreedBudget, projected_labor_remaining: lr2(projectedLabor) },
        flags,
      });
    }
    rows.sort((a, b) => b.total_open - a.total_open);

    const sum = (f) => lr2(rows.reduce((a, r) => a + f(r), 0));
    return Response.json({
      success: true, generated_at: new Date().toISOString(),
      totals: {
        unbilled_parts: sum((r) => r.unbilled.parts), unbilled_services: sum((r) => r.unbilled.services), unbilled_labor: sum((r) => r.unbilled.labor),
        unbilled_total: sum((r) => r.unbilled.total), on_drafts: sum((r) => r.on_drafts), draft_face_value: sum((r) => r.draft_face_value),
        outstanding: sum((r) => r.outstanding), total_open: sum((r) => r.total_open),
        future_agreed_budget: sum((r) => r.future.agreed_budget ?? 0), future_projected_labor: sum((r) => r.future.projected_labor_remaining),
        projects_needing_rate: rows.filter((r) => r.flags.some((f) => f.code === 'LABOR_RATE_NOT_SET')).length,
        unpriced_labor_hours: lh(rows.reduce((a, r) => a + r.labor_unpriced_hours, 0)),
      },
      projects: rows,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});