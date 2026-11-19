import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * billingAuthorizationCore — CANONICAL project billing authorization (read-only, admin-only).
 *
 * Authorization ceiling = the client-agreed budget on the project's funding plan, only once an admin confirmed it.
 * Internal estimates and unconfirmed amounts are never treated as authorized (authorized = null).
 *
 * Consumption (each dollar counted once):
 *   invoiced_net = Σ sent/partial/paid/overdue subtotals − credit applied on them
 *   drafts_net   = Σ draft subtotals − credit proposed on them
 *   A deposit invoice consumes authorization when issued. When its paid deposit (or any other project credit) is later
 *   applied to an invoice, that invoice's net (subtotal − credit) is what counts, so the same dollars are not consumed again.
 * remaining_authorization = authorized − invoiced_net − drafts_net
 * Separate figures: deposits and credits, earned work value, outstanding receivables. Nothing here writes records.
 *
 * Payload: { project_id, detail?: true } | { self_test: true }. Callers pin AUTH_LOGIC_VERSION.
 */

const AUTH_LOGIC_VERSION = 'auth-v1';
const LABOR_LOGIC_VERSION = 'labor-v2';
const FINAL = ['sent', 'partial', 'paid', 'overdue'];
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const sum = (rows, f) => r2(rows.reduce((s, x) => s + (Number(f(x)) || 0), 0));

function computeAuthorization({ plan, versions = [], invoices = [], credits = [] }) {
  const authorized = plan?.agreed_budget_confirmed && plan.agreed_client_budget_cents != null ? r2(plan.agreed_client_budget_cents / 100) : null;
  // Confirmed amounts over time, from the funding plan's saved versions (originals are never overwritten).
  const revisions = []; let last = null;
  for (const v of [...versions].sort((a, b) => a.version - b.version)) {
    const s = v.snapshot || {};
    if (!s.agreed_budget_confirmed || s.agreed_client_budget_cents == null || s.agreed_client_budget_cents === last) continue;
    last = s.agreed_client_budget_cents;
    revisions.push({ version: v.version, amount: r2(last / 100), confirmed_by: s.agreed_budget_confirmed_by || v.saved_by_email, saved_at: v.saved_at, note: s.agreed_budget_note || v.change_note || '' });
  }
  const final = invoices.filter((i) => FINAL.includes(i.status));
  const drafts = invoices.filter((i) => i.status === 'draft');
  const invoicedGross = sum(final, (i) => i.subtotal ?? i.total);
  const creditsApplied = sum(final, (i) => i.credit_applied);
  const draftsGross = sum(drafts, (i) => i.subtotal ?? i.total);
  const draftsCredit = sum(drafts, (i) => i.credit_proposed);
  const invoicedNet = r2(invoicedGross - creditsApplied);
  const draftsNet = r2(draftsGross - draftsCredit);
  const consumed = r2(invoicedNet + draftsNet);
  const depositIds = new Set(final.filter((i) => i.invoice_type === 'deposit').map((i) => i.id));
  const depCredits = credits.filter((c) => depositIds.has(c.source_invoice_id));
  return {
    authorized, confirmed: authorized != null,
    original_authorized: revisions[0]?.amount ?? null, revisions,
    invoiced_gross: invoicedGross, credits_applied: creditsApplied, invoiced_net: invoicedNet,
    drafts_gross: draftsGross, drafts_credit_proposed: draftsCredit, drafts_net: draftsNet, consumed,
    remaining_authorization: authorized == null ? null : r2(authorized - consumed),
    deposits: {
      invoiced: sum(final.filter((i) => depositIds.has(i.id)), (i) => i.subtotal ?? i.total),
      credit_created: sum(depCredits, (c) => c.credit_amount),
      credit_applied: sum(depCredits, (c) => (c.credit_amount ?? 0) - (c.remaining_amount ?? 0)),
      credit_remaining: sum(depCredits, (c) => c.remaining_amount),
    },
    credit_balance: sum(credits, (c) => c.remaining_amount),
    receivables_outstanding: sum(final.filter((i) => i.status !== 'paid'), (i) => Math.max(0, i.balance_due ?? 0)), // balance_due is already net of payments (recordInvoicePayment)
  };
}

function runVectors() {
  const plan = { agreed_budget_confirmed: true, agreed_client_budget_cents: 1000000 };
  const versions = [
    { version: 1, snapshot: { agreed_budget_confirmed: true, agreed_client_budget_cents: 800000 } },
    { version: 2, snapshot: { agreed_budget_confirmed: false, agreed_client_budget_cents: 900000 } },
    { version: 3, snapshot: { agreed_budget_confirmed: true, agreed_client_budget_cents: 1000000 } },
    { version: 4, snapshot: { agreed_budget_confirmed: true, agreed_client_budget_cents: 1000000 } },
  ];
  const checks = [];
  const ck = (name, got, exp) => checks.push({ name, pass: JSON.stringify(got) === JSON.stringify(exp), ...(JSON.stringify(got) === JSON.stringify(exp) ? {} : { got, exp }) });
  // Deposit $3,000 paid → credit; progress $5,000 applies the $3,000 credit. Consumed = 3,000 + 2,000 = 5,000, not 8,000.
  const inv = [
    { id: 'dep', invoice_type: 'deposit', status: 'paid', subtotal: 3000, credit_applied: 0, balance_due: 3000, paid_amount: 3000 },
    { id: 'p1', invoice_type: 'progress', status: 'partial', subtotal: 5000, credit_applied: 3000, balance_due: 1500, paid_amount: 500 },
    { id: 'x', invoice_type: 'progress', status: 'cancelled', subtotal: 9999 },
    { id: 'd1', invoice_type: 'final', status: 'draft', subtotal: 1500, credit_proposed: 0 },
  ];
  const credits = [{ source_invoice_id: 'dep', credit_amount: 3000, remaining_amount: 0 }];
  const a = computeAuthorization({ plan, versions, invoices: inv, credits });
  ck('deposit consumes authorization once when its credit is applied later', [a.invoiced_gross, a.credits_applied, a.invoiced_net, a.drafts_net, a.consumed, a.remaining_authorization], [8000, 3000, 5000, 1500, 6500, 3500]);
  ck('deposit and credit figures kept separately', a.deposits, { invoiced: 3000, credit_created: 3000, credit_applied: 3000, credit_remaining: 0 });
  ck('receivables: only unpaid issued balances', a.receivables_outstanding, 1500);
  ck('original, approved revisions and current authorization (unconfirmed amounts skipped)', [a.original_authorized, a.revisions.map((r) => r.amount), a.authorized], [8000, [8000, 10000], 10000]);
  const b = computeAuthorization({ plan, invoices: [inv[0]], credits: [{ source_invoice_id: 'dep', credit_amount: 3000, remaining_amount: 3000 }] });
  ck('paid deposit not yet applied still consumes its own amount once', [b.consumed, b.deposits.credit_remaining], [3000, 3000]);
  const c = computeAuthorization({ plan: { agreed_budget_confirmed: false, agreed_client_budget_cents: 500000 }, invoices: inv });
  ck('unconfirmed amount is never an authorization', [c.authorized, c.remaining_authorization], [null, null]);
  return { pass: checks.every((x) => x.pass), checks };
}

async function all(entity, q) {
  let out = []; let cursor = null;
  do {
    const page = await entity.filter(q, { limit: 1000, ...(cursor ? { cursor } : {}) });
    out = out.concat(page.items); cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return out;
}

// Detail view: earned work value, labor reconciliation and projected-part cost tracking (display only).
async function loadDetail(base44, db, project_id, invoices) {
  const lab = (await base44.functions.invoke('laborBillingCore', { project_ids: [project_id] })).data;
  if (!lab?.success || lab.logic_version !== LABOR_LOGIC_VERSION) throw new Error('Labor billing calculation unavailable or version mismatch');
  const labor = lab.projects[project_id] || lab.empty;
  const [commitments, services, parts] = await Promise.all([all(db.PartCommitment, { project_id }), all(db.ServiceCommitment, { project_id }), db.Part.list('-created_date', 5000)]);
  const partById = new Map(parts.map((p) => [p.id, p]));
  const billable = commitments.filter((c) => !c.cancelled_at && c.is_archived !== true && partById.get(c.part_id)?.requires_client_billing !== false);
  const receivedValue = sum(billable, (c) => Math.min(Math.max(0, (c.required_total ?? 0) - (c.qty_removed ?? 0)), (c.reserved_from_stock ?? 0) + (c.qty_installed ?? 0)) * (c.unit_retail_snapshot ?? 0));
  const serviceValue = sum(services.filter((s) => s.status !== 'cancelled'), (s) => s.total_billable);
  const finalIds = invoices.filter((i) => FINAL.includes(i.status)).map((i) => i.id);
  const projLines = finalIds.length ? (await all(db.ProjectInvoiceLine, { invoice_id: { $in: finalIds }, type: 'part' })).filter((l) => l.metadata?.part_basis === 'projected') : [];
  const cById = new Map(commitments.map((c) => [c.id, c]));
  const partTracking = projLines.map((l) => {
    const c = cById.get(l.source_id) || {};
    const actualUnit = c.actual_unit_cost ?? null;
    const received = Math.min(l.qty ?? 0, (c.reserved_from_stock ?? 0) + (c.qty_installed ?? 0));
    const actualCost = actualUnit == null ? null : r2(actualUnit * (l.qty ?? 0));
    return { line_id: l.id, invoice_id: l.invoice_id, source_id: l.source_id, description: l.description, qty: l.qty, received_qty: received,
      unit_price: l.unit_price, line_total: r2(l.line_total), estimated_cost: r2(l.cost_total ?? (l.unit_cost ?? 0) * (l.qty ?? 0)),
      actual_cost: actualCost, final_margin: actualCost == null ? null : r2((l.line_total ?? 0) - actualCost) };
  });
  const reconciliation = labor.items.filter((i) => i.projected_billed_hours > 0 || i.overrun_hours > 0).map((i) => ({
    task_id: i.task_id, task_name: i.task_name, rate: i.rate, original_estimate_hours: i.original_estimate_hours, revised_estimate_hours: i.revised_estimate_hours,
    hours_logged: i.hours_logged, projected_billed_hours: i.projected_billed_hours, projected_applied_hours: i.projected_applied_hours,
    projected_unapplied_hours: i.projected_unapplied_hours, earned_billed_hours: i.earned_billed_hours, earned_available_hours: i.earned_available_hours,
    overrun_hours: i.overrun_hours, variance_hours: i.variance_hours }));
  return {
    earned_value: { labor: labor.totals.earned, parts_received: receivedValue, services: serviceValue, total: r2(labor.totals.earned + receivedValue + serviceValue) },
    labor_reconciliation: reconciliation, projected_parts_tracking: partTracking,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status ?? e.response?.status) || /authentication required/i.test(e.message) ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    if (body.self_test) { const v = runVectors(); return Response.json({ success: v.pass, logic_version: AUTH_LOGIC_VERSION, vectors: v }); }
    const { project_id } = body;
    if (typeof project_id !== 'string' || !project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });
    const db = base44.asServiceRole.entities;
    const [plans, invoices, credits] = await Promise.all([db.ScopeFundingPlan.filter({ project_id }), all(db.ProjectInvoice, { project_id }), all(db.ProjectCreditLedger, { project_id })]);
    const plan = plans[0] || null;
    const versions = plan ? await all(db.ScopeFundingPlanVersion, { plan_id: plan.id }) : [];
    const authorization = computeAuthorization({ plan, versions, invoices, credits });
    const detail = body.detail ? await loadDetail(base44, db, project_id, invoices) : null;
    return Response.json({ success: true, logic_version: AUTH_LOGIC_VERSION, project_id, authorization, ...(detail || {}) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});