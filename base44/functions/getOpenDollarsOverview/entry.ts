import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * getOpenDollarsOverview — READ-ONLY, admin-only portfolio view of money not yet collected.
 *
 *   1. Current Unbilled Value  = uninvoiced parts (received + unreceived) + uninvoiced services (getProjectsBillingSummary)
 *                               + earned uninvoiced labor (laborBillingCore). Items on drafts stay here ("of which on drafts").
 *   2. Outstanding Invoiced    = balance due on sent / partial / overdue invoices (billingAuthorizationCore)
 *   3. Total Open Dollars      = 1 + 2
 *   4. Additional Projected    = advance labor already on drafts that logged hours do not cover yet
 *                               + projected labor still available (laborBillingCore projected_available, the same
 *                                 per-task pool Create Invoice uses: net of sent, drafted and earned hours)
 *   5. Total Expected          = 3 + 4
 *
 * Advance labor already sent but not yet earned is inside Outstanding / paid history and is reported for information only.
 * Confirmed client budgets are an authorization ceiling, listed separately and never added to any total.
 * Non-billable projects: no unbilled or projected value; outstanding sent invoices still count. Never writes.
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

// Splits projected labor still available by authorization. Room = budget left after drafts, minus current unbilled work
// not yet on a draft (it will consume the budget when invoiced). Pure, so it is covered by the self test below.
function splitProjected({ available, budget, remaining, unbilledNotOnDrafts }) {
  if (budget == null) return { within_budget: 0, beyond_budget: 0, no_budget: lr2(available) };
  const room = Math.max(0, (remaining ?? 0) - unbilledNotOnDrafts);
  const within = Math.min(available, room);
  return { within_budget: lr2(within), beyond_budget: lr2(available - within), no_budget: 0 };
}

function selfTest() {
  const cases = [
    { in: { available: 4785, budget: 30000, remaining: 30000, unbilledNotOnDrafts: 21797 }, out: { within_budget: 4785, beyond_budget: 0, no_budget: 0 } },
    { in: { available: 5000, budget: 10000, remaining: 3000, unbilledNotOnDrafts: 1000 }, out: { within_budget: 2000, beyond_budget: 3000, no_budget: 0 } },
    { in: { available: 800, budget: null, remaining: null, unbilledNotOnDrafts: 50 }, out: { within_budget: 0, beyond_budget: 0, no_budget: 800 } },
    { in: { available: 300, budget: 1000, remaining: -50, unbilledNotOnDrafts: 0 }, out: { within_budget: 0, beyond_budget: 300, no_budget: 0 } },
  ];
  const results = cases.map((c) => ({ pass: JSON.stringify(splitProjected(c.in)) === JSON.stringify(c.out), got: splitProjected(c.in), expect: c.out }));
  return { pass: results.every((r) => r.pass), results };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    if (body.self_test) return Response.json({ success: true, self_test: selfTest() });

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
    const auth = authRes.data;
    if (!auth?.success || auth.logic_version !== AUTH_LOGIC_VERSION) return Response.json({ error: 'Invoice position unavailable or version mismatch' }, { status: 502 });

    const psByProject = new Map(summary.projects.map((p) => [p.project_id, p]));
    const invByProject = groupBy(invoices, 'project_id');

    const rows = [];
    const authorization = [];
    for (const project of projects) {
      if (project.is_system_project) continue;
      const ps = psByProject.get(project.id);
      const pInvoices = invByProject.get(project.id) || [];
      const labor = laborData.projects[project.id] || laborData.empty;
      const L = labor.totals;
      const ADV = labor.advance || {};
      const A = auth.projects[project.id];
      const nonBillable = project.billing_designation === 'NON_BILLABLE';

      // 1. Current unbilled (non-billable: nothing; Ready to Invoice skips it too)
      const bd = ps?.breakdown || {};
      const parts = nonBillable ? 0 : lr2(bd.parts_total ?? 0);
      const partsReceived = nonBillable ? 0 : lr2(bd.parts_uninvoiced_received_total ?? 0);
      const partsUnreceived = nonBillable ? 0 : lr2(bd.parts_uninvoiced_unreceived_total ?? 0);
      const services = nonBillable ? 0 : lr2(bd.services_total ?? 0);
      const laborEarned = nonBillable ? 0 : lr2(L.uninvoiced);
      const unbilled = lr2(parts + services + laborEarned);
      // Already includes earned labor on drafts (getProjectsBillingSummary adds it); never added a second time.
      const onDrafts = nonBillable ? 0 : lr2(ps?.allocated_to_drafts ?? 0);

      // 2. Outstanding
      const outstanding = A?.receivables_outstanding ?? 0;
      const total = lr2(unbilled + outstanding);

      // 4. Additional projected work (not in 1 or 2)
      const projOnDrafts = nonBillable ? 0 : lr2(ADV.unapplied_draft_amount ?? 0);
      const projAvailable = nonBillable ? 0 : lr2(labor.projected.totals.available_amount);
      const split = splitProjected({ available: projAvailable, budget: A?.authorized ?? null, remaining: A?.remaining_authorization ?? null, unbilledNotOnDrafts: Math.max(0, unbilled - onDrafts) });
      const additional = lr2(projOnDrafts + projAvailable);

      const drafts = pInvoices.filter((i) => i.status === 'draft');
      const draftFace = lr2(drafts.reduce((a, i) => a + (i.subtotal ?? i.total ?? 0), 0));
      const flags = [];
      if (L.unpriced_hours > 0) flags.push({ code: 'LABOR_RATE_NOT_SET', message: `${L.unpriced_hours}h of billable labor on ${L.unpriced_tasks} task(s) have no billing rate and are not counted.` });
      if (L.over_invoiced_tasks > 0) flags.push({ code: 'LABOR_OVER_INVOICED', message: `${L.over_invoiced_tasks} task(s) have more hours invoiced than logged or estimated.` });
      if (nonBillable) flags.push({ code: 'PROJECT_NON_BILLABLE', message: 'Project is marked Non-Billable: excluded from unbilled, projected and new invoicing.' });
      if (split.beyond_budget > 0) flags.push({ code: 'PROJECTED_BEYOND_BUDGET', message: `$${split.beyond_budget.toFixed(2)} of projected labor is beyond the confirmed client budget.` });
      if (!nonBillable && drafts.length && Math.abs(draftFace - (onDrafts + projOnDrafts)) > 0.01) flags.push({ code: 'DRAFTS_DIFFER_FROM_CURRENT', message: `Draft invoices total $${draftFace.toFixed(2)}; the current value of the items on them is $${lr2(onDrafts + projOnDrafts).toFixed(2)}. Review the drafts before sending.` });

      if (A?.authorized != null) {
        authorization.push({ project_id: project.id, project_name: project.name, client_name: project.client_name || null,
          budget: A.authorized, invoiced_net: A.invoiced_net, drafts_net: A.drafts_net, consumed: A.consumed, remaining: A.remaining_authorization,
          unbilled_not_on_drafts: lr2(Math.max(0, unbilled - onDrafts)), projected_within_budget: split.within_budget, projected_beyond_budget: split.beyond_budget,
          billing_designation: nonBillable ? 'NON_BILLABLE' : 'BILLABLE' });
      }

      if (total === 0 && additional === 0 && !flags.length && !drafts.length) continue;
      rows.push({
        project_id: project.id, project_name: project.name, client_name: project.client_name || null,
        labor_rate: project.labor_billing_rate ?? null, labor_unpriced_hours: L.unpriced_hours,
        billing_designation: nonBillable ? 'NON_BILLABLE' : 'BILLABLE',
        unbilled: { parts, parts_received: partsReceived, parts_unreceived: partsUnreceived, services, labor: laborEarned, labor_hours: nonBillable ? 0 : L.uninvoiced_hours, total: unbilled },
        on_drafts: onDrafts, draft_count: drafts.length, draft_face_value: draftFace,
        outstanding, outstanding_count: A?.outstanding_count ?? 0, overdue: A?.overdue_total ?? 0, overdue_count: A?.overdue_count ?? 0,
        total_open: total,
        projected: { on_drafts: projOnDrafts, available: projAvailable, ...split, additional,
          invoiced_unearned: lr2(ADV.unapplied_invoiced_amount ?? 0), unpriced_remaining_hours: labor.projected.totals.unpriced_remaining_hours },
        expected_total: lr2(total + additional),
        agreed_budget: A?.authorized ?? null,
        flags,
      });
    }
    rows.sort((a, b) => b.expected_total - a.expected_total);
    authorization.sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0));

    const sum = (list, f) => lr2(list.reduce((a, r) => a + (f(r) || 0), 0));
    return Response.json({
      success: true, generated_at: new Date().toISOString(),
      totals: {
        unbilled_parts: sum(rows, (r) => r.unbilled.parts), unbilled_parts_received: sum(rows, (r) => r.unbilled.parts_received), unbilled_parts_unreceived: sum(rows, (r) => r.unbilled.parts_unreceived),
        unbilled_services: sum(rows, (r) => r.unbilled.services), unbilled_labor: sum(rows, (r) => r.unbilled.labor),
        unbilled_total: sum(rows, (r) => r.unbilled.total), on_drafts: sum(rows, (r) => r.on_drafts), draft_face_value: sum(rows, (r) => r.draft_face_value),
        outstanding: sum(rows, (r) => r.outstanding), overdue: sum(rows, (r) => r.overdue), overdue_count: rows.reduce((a, r) => a + r.overdue_count, 0),
        total_open: sum(rows, (r) => r.total_open),
        projected_on_drafts: sum(rows, (r) => r.projected.on_drafts), projected_available: sum(rows, (r) => r.projected.available),
        projected_within_budget: sum(rows, (r) => r.projected.within_budget), projected_beyond_budget: sum(rows, (r) => r.projected.beyond_budget),
        projected_no_budget: sum(rows, (r) => r.projected.no_budget), additional_projected: sum(rows, (r) => r.projected.additional),
        projected_invoiced_unearned: sum(rows, (r) => r.projected.invoiced_unearned),
        unpriced_projected_hours: lh(rows.reduce((a, r) => a + (r.projected.unpriced_remaining_hours || 0), 0)),
        expected_total: sum(rows, (r) => r.expected_total),
        projects_needing_rate: rows.filter((r) => r.flags.some((f) => f.code === 'LABOR_RATE_NOT_SET')).length,
        unpriced_labor_hours: lh(rows.reduce((a, r) => a + r.labor_unpriced_hours, 0)),
      },
      projects: rows,
      authorization: {
        totals: { budget: sum(authorization, (a) => a.budget), consumed: sum(authorization, (a) => a.consumed), remaining: sum(authorization, (a) => a.remaining), projects: authorization.length },
        projects: authorization,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});