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

// ┌─ CANONICAL LABOR BILLING — calculated only in laborBillingCore (regression vectors run via its self_test).
// │  This file pins the logic version and fails closed if the core is unavailable or has changed.
const LABOR_LOGIC_VERSION = 'labor-v2';
const lr2 = (n) => Math.round((n || 0) * 100) / 100;
const lh = (n) => Math.round((n || 0) * 10000) / 10000;
async function laborCore(base44, payload) {
  const d = (await base44.functions.invoke('laborBillingCore', payload)).data;
  if (!d?.success || d.logic_version !== LABOR_LOGIC_VERSION) throw new Error('Labor billing calculation unavailable or version mismatch');
  return d;
}
// └─────────────────────────────────────────────────────────────────────────

const AUTH_LOGIC_VERSION = 'auth-v1';

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
    const [summaryRes, projects, invoices, laborData, authRes] = await Promise.all([
      base44.functions.invoke('getProjectsBillingSummary', {}),
      all(db.Project, {}),
      all(db.ProjectInvoice, {}),
      laborCore(base44, { scope: 'all' }),
      base44.functions.invoke('billingAuthorizationCore', { scope: 'all' }),
    ]);
    const summary = summaryRes.data;
    if (!summary?.success) return Response.json({ error: 'Parts and services summary unavailable' }, { status: 502 });
    // Outstanding, overdue and confirmed budgets come from the canonical invoice position (same as the project screens).
    const auth = authRes.data;
    if (!auth?.success || auth.logic_version !== AUTH_LOGIC_VERSION) return Response.json({ error: 'Invoice position unavailable or version mismatch' }, { status: 502 });

    const psByProject = new Map(summary.projects.map((p) => [p.project_id, p]));
    const invByProject = groupBy(invoices, 'project_id');

    const rows = [];
    for (const project of projects) {
      if (project.is_system_project) continue;
      const ps = psByProject.get(project.id);
      const pInvoices = invByProject.get(project.id) || [];
      const labor = laborData.projects[project.id] || laborData.empty;
      const L = labor.totals;

      // Non-billable: nothing is counted as unbilled (Ready to Invoice skips it too); outstanding sent invoices still count.
      const nonBillable = project.billing_designation === 'NON_BILLABLE';
      const parts = ps?.breakdown?.parts_total ?? 0;
      const services = ps?.breakdown?.services_total ?? 0;
      const unbilled = nonBillable ? 0 : lr2(parts + services + L.uninvoiced);
      const onDrafts = lr2((ps?.allocated_to_drafts ?? 0) + L.allocated_to_drafts);
      const drafts = pInvoices.filter((i) => i.status === 'draft');
      const draftFace = lr2(drafts.reduce((a, i) => a + (i.subtotal ?? i.total ?? 0), 0));
      const A = auth.projects[project.id];
      const outstanding = A?.receivables_outstanding ?? 0;
      const outstandingCount = A?.outstanding_count ?? 0;

      // Separate, never in totals
      const projectedLabor = labor.projected.totals.remaining_amount;
      const agreedBudget = A?.authorized ?? null;

      const flags = [];
      if (L.unpriced_hours > 0) flags.push({ code: 'LABOR_RATE_NOT_SET', message: `${L.unpriced_hours}h of billable labor on ${L.unpriced_tasks} task(s) have no billing rate and are not counted.` });
      if (L.over_invoiced_tasks > 0) flags.push({ code: 'LABOR_OVER_INVOICED', message: `${L.over_invoiced_tasks} task(s) have more hours invoiced than logged or estimated.` });
      if (nonBillable) flags.push({ code: 'PROJECT_NON_BILLABLE', message: 'Project is marked Non-Billable: excluded from unbilled totals and new invoicing.' });
      if (drafts.length && Math.abs(draftFace - onDrafts) > 0.01) flags.push({ code: 'DRAFTS_DIFFER_FROM_CURRENT', message: `Draft invoices total $${draftFace.toFixed(2)}; the current uninvoiced value of the items on them is $${onDrafts.toFixed(2)}. Review the drafts before sending.` });

      const total = lr2(unbilled + outstanding);
      if (total === 0 && !flags.length && !drafts.length) continue;
      rows.push({
        project_id: project.id, project_name: project.name, client_name: project.client_name || null,
        labor_rate: project.labor_billing_rate ?? null, labor_unpriced_hours: L.unpriced_hours,
        billing_designation: nonBillable ? 'NON_BILLABLE' : 'BILLABLE',
        projected_labor_available: nonBillable ? 0 : labor.projected.totals.available_amount,
        unbilled: nonBillable ? { parts: 0, parts_received: 0, parts_unreceived: 0, services: 0, labor: 0, labor_hours: 0, total: 0 } : { parts: lr2(parts), parts_received: ps?.breakdown?.parts_received_total ?? 0, parts_unreceived: ps?.breakdown?.parts_unreceived_total ?? 0, services: lr2(services), labor: L.uninvoiced, labor_hours: L.uninvoiced_hours, total: unbilled },
        on_drafts: onDrafts, draft_count: drafts.length, draft_face_value: draftFace,
        outstanding, outstanding_count: outstandingCount, overdue: A?.overdue_total ?? 0, overdue_count: A?.overdue_count ?? 0,
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
        unbilled_parts: sum((r) => r.unbilled.parts), unbilled_parts_received: sum((r) => r.unbilled.parts_received), unbilled_parts_unreceived: sum((r) => r.unbilled.parts_unreceived),
        overdue: sum((r) => r.overdue), overdue_count: rows.reduce((a, r) => a + r.overdue_count, 0), unbilled_services: sum((r) => r.unbilled.services), unbilled_labor: sum((r) => r.unbilled.labor),
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