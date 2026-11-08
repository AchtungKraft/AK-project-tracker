import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// scopeFundingPlanAction — ADMIN-ONLY. The ONLY write path for ScopeFundingPlan / ScopeFundingPlanVersion
// (entity RLS blocks all browser writes). DRAFT ONLY: no lock/activate, no invoices, no payments, no credits,
// no part/PO changes. Planned amounts are never cash and never invoice eligible.
// Money: integer cents. Percent: integer basis points (0–10000). Server computes every calculated amount.
// Actions: get | save_draft | self_test

const MAX_CENTS = 100_000_000_00; // $100M sanity cap
const MAX_MILESTONES = 50;
const METHODS = ['FIXED_PARTS_FUNDING', 'PERCENT_OF_AGREED_CLIENT_BUDGET'];
const isId = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(v);
const isCents = (v) => Number.isSafeInteger(v) && v >= 0 && v <= MAX_CENTS;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pctOf = (cents, bps) => Math.round((cents * bps) / 10000); // half-up for nonnegative values

async function listAll(E, query, opts = {}) {
  const out = [];
  let cursor;
  do {
    const page = await E.filter(query, { limit: 500, cursor, ...opts });
    out.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return out;
}

// Intrinsic plan warnings (display only; never block, never trigger billing).
function planWarnings(p) {
  const w = [];
  const pctMs = p.milestones.filter((m) => m.method === 'PERCENT_OF_AGREED_CLIENT_BUDGET');
  const bpsSum = pctMs.reduce((s, m) => s + (m.percent_bps || 0), 0);
  if (bpsSum > 10000) w.push({ code: 'PERCENT_OVER_100', message: `Percentage milestones add up to ${(bpsSum / 100).toFixed(2)}% of the agreed client budget.` });
  if (p.agreed_client_budget_cents != null && p.total_planned_cents > p.agreed_client_budget_cents) w.push({ code: 'PLAN_OVER_AGREED_BUDGET', message: 'Total planned funding is higher than the agreed client budget.' });
  if (p.agreed_client_budget_cents != null && !p.agreed_budget_confirmed) w.push({ code: 'BUDGET_NOT_CONFIRMED', message: 'Agreed client budget is entered but not confirmed.' });
  if (!p.milestones.length) w.push({ code: 'NO_MILESTONES', message: 'No milestones yet.' });
  return w;
}

// Validate + normalize a save request. Returns { errors } or { plan } (content only, no audit fields).
function buildPlan(input, existing, ctx) {
  const errors = [];
  let budget = existing?.agreed_client_budget_cents ?? null;
  if ('agreed_client_budget_cents' in input) {
    const b = input.agreed_client_budget_cents;
    if (b === null) budget = null;
    else if (!isCents(b)) errors.push('Agreed client budget must be a whole number of cents between $0 and $100,000,000.');
    else budget = b;
  }
  const budgetChanged = budget !== (existing?.agreed_client_budget_cents ?? null);
  let confirmed = budget == null ? false : budgetChanged ? false : !!existing?.agreed_budget_confirmed;
  let confirmedBy = confirmed ? existing.agreed_budget_confirmed_by : null, confirmedAt = confirmed ? existing.agreed_budget_confirmed_at : null;
  if (input.confirm_agreed_budget === true) {
    if (budget == null) errors.push('Enter an agreed client budget before confirming it.');
    else { confirmed = true; if (budgetChanged || !existing?.agreed_budget_confirmed) { confirmedBy = ctx.email; confirmedAt = ctx.now; } }
  }
  if (input.confirm_agreed_budget === false) { confirmed = false; confirmedBy = null; confirmedAt = null; }

  const raw = Array.isArray(input.milestones) ? input.milestones : null;
  if (!raw) errors.push('milestones must be a list.');
  else if (raw.length > MAX_MILESTONES) errors.push(`At most ${MAX_MILESTONES} milestones.`);
  const seen = new Set();
  const milestones = (raw || []).slice(0, MAX_MILESTONES).map((m, idx) => {
    const n = idx + 1, e = (msg) => errors.push(`Milestone ${n}: ${msg}`);
    const name = str(m?.name, 120);
    if (!name) e('name is required.');
    const method = m?.method;
    if (!METHODS.includes(method)) e('choose a valid basis.');
    let amount = null, bps = null, calc = null;
    if (method === 'FIXED_PARTS_FUNDING') {
      if (!isCents(m.amount_cents)) e('amount must be a whole number of cents, $0 or more.');
      else { amount = m.amount_cents; calc = amount; }
    } else if (method === 'PERCENT_OF_AGREED_CLIENT_BUDGET') {
      if (!Number.isSafeInteger(m.percent_bps) || m.percent_bps < 0 || m.percent_bps > 10000) e('percentage must be between 0% and 100% (up to 2 decimals).');
      else bps = m.percent_bps;
      if (budget == null) e('percentage basis requires an agreed client budget.');
      else if (!confirmed) e('percentage basis requires the agreed client budget to be confirmed.');
      if (bps != null && budget != null && confirmed) calc = pctOf(budget, bps);
    }
    const target = m?.target_date == null || m.target_date === '' ? null : m.target_date;
    if (target != null && !isDate(target)) e('target date is invalid.');
    const cat = m?.scope_category_id || null, grp = m?.scope_group_id || null;
    if (cat && !ctx.categories.has(cat)) e('scope category is not part of this project.');
    if (grp && !ctx.groups.has(grp)) e('scope group is not part of this project.');
    if (cat && grp && ctx.categories.get(cat)?.request_id !== ctx.groups.get(grp)?.request_id) e('scope category and group belong to different scope reviews.');
    let id = typeof m?.id === 'string' && /^[a-zA-Z0-9-]{8,40}$/.test(m.id) && !seen.has(m.id) ? m.id : crypto.randomUUID();
    seen.add(id);
    return { id, name, method, amount_cents: amount, percent_bps: bps, calculated_amount_cents: calc, target_date: target, scope_category_id: cat, scope_group_id: grp, notes: str(m?.notes, 2000), status: 'draft', sort_order: idx };
  });
  if (errors.length) return { errors };
  const total = milestones.reduce((s, m) => s + (m.calculated_amount_cents || 0), 0);
  if (total > MAX_CENTS) return { errors: ['Total planned funding exceeds the $100,000,000 cap.'] };
  return {
    plan: {
      status: 'draft', agreed_client_budget_cents: budget, agreed_budget_confirmed: confirmed, agreed_budget_confirmed_by: confirmedBy, agreed_budget_confirmed_at: confirmedAt,
      agreed_budget_note: 'agreed_budget_note' in input ? str(input.agreed_budget_note, 1000) : existing?.agreed_budget_note || '',
      notes: 'notes' in input ? str(input.notes, 4000) : existing?.notes || '', milestones, total_planned_cents: total,
    },
  };
}

// Compare-and-set save. expected_version 0 = create. Version snapshot written first, removed if the CAS loses.
async function saveDraft(store, ctx, input) {
  const plans = await store.findPlans(ctx.project_id);
  const existing = plans.sort((a, b) => (a.created_date || '').localeCompare(b.created_date || ''))[0] || null;
  const expected = input.expected_version;
  if (!Number.isSafeInteger(expected) || expected < 0) return { status: 400, body: { error: 'expected_version is required.' } };
  if ((existing?.version || 0) !== expected) return { status: 409, body: { error: 'This funding plan was changed by someone else. Reload to see the latest draft.', current_version: existing?.version || 0 } };
  const built = buildPlan(input, existing, ctx);
  if (built.errors) return { status: 400, body: { error: built.errors[0], errors: built.errors } };
  const version = expected + 1;
  const audit = { updated_by_email: ctx.email, updated_at: ctx.now };
  const changeNote = str(input.change_note, 500);
  if (!existing) {
    const created = await store.createPlan({ project_id: ctx.project_id, version, ...built.plan, created_by_email: ctx.email, ...audit });
    const all = await store.findPlans(ctx.project_id);
    if (all.length > 1) { await store.deletePlan(created.id); return { status: 409, body: { error: 'A funding plan was just created by someone else. Reload to see it.' } }; }
    await store.createVersion({ plan_id: created.id, project_id: ctx.project_id, version, snapshot: built.plan, change_note: changeNote, saved_by_email: ctx.email, saved_at: ctx.now });
    return { status: 200, body: { success: true, plan: created, warnings: planWarnings(built.plan) } };
  }
  const snap = await store.createVersion({ plan_id: existing.id, project_id: ctx.project_id, version, snapshot: built.plan, change_note: changeNote, saved_by_email: ctx.email, saved_at: ctx.now });
  const updated = await store.casPlan(existing.id, expected, { version, ...built.plan, ...audit });
  if (!updated) { await store.deleteVersion(snap.id); return { status: 409, body: { error: 'This funding plan was changed by someone else. Reload to see the latest draft.' } }; }
  const plan = await store.getPlan(existing.id);
  return { status: 200, body: { success: true, plan, warnings: planWarnings(plan) } };
}

function realStore(db) {
  return {
    findPlans: (project_id) => listAll(db.ScopeFundingPlan, { project_id }),
    getPlan: async (id) => (await db.ScopeFundingPlan.filter({ id }, { limit: 1 })).items[0] || null,
    createPlan: (d) => db.ScopeFundingPlan.create(d),
    deletePlan: (id) => db.ScopeFundingPlan.delete(id),
    casPlan: async (id, version, set) => (await db.ScopeFundingPlan.updateMany({ id, version }, { $set: set })).updated > 0,
    createVersion: (d) => db.ScopeFundingPlanVersion.create(d),
    deleteVersion: (id) => db.ScopeFundingPlanVersion.delete(id),
  };
}

async function scopeIndex(db, project_id) {
  const reqs = (await listAll(db.ClientFeedbackRequest, { project_id, request_type: 'client_scope_review' }, { fields: ['title', 'status', 'project_id'] })).filter((r) => r.project_id === project_id && r.status !== 'archived');
  const ids = reqs.map((r) => r.id);
  const [cats, grps] = ids.length ? await Promise.all([listAll(db.ScopeCategory, { request_id: { $in: ids } }, { fields: ['name', 'request_id', 'sort_order'] }), listAll(db.ScopeGroup, { request_id: { $in: ids } }, { fields: ['name', 'request_id', 'sort_order'] })]) : [[], []];
  const title = new Map(reqs.map((r) => [r.id, r.title]));
  return { categories: new Map(cats.map((c) => [c.id, c])), groups: new Map(grps.map((g) => [g.id, g])), options: { categories: cats.map((c) => ({ id: c.id, name: c.name, request_id: c.request_id, review_title: title.get(c.request_id) || '' })), groups: grps.map((g) => ({ id: g.id, name: g.name, request_id: g.request_id, review_title: title.get(g.request_id) || '' })) } };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    if (body.action === 'self_test') return Response.json(await runSelfTest());
    const { action, project_id } = body;
    if (!isId(project_id)) return Response.json({ error: 'project_id is required' }, { status: 400 });
    const db = base44.asServiceRole.entities;
    const project = (await db.Project.filter({ id: project_id }, { limit: 1 }).catch((e) => (e.status === 400 || e.status === 404 ? { items: [] } : Promise.reject(e)))).items[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
    const idx = await scopeIndex(db, project_id);

    if (action === 'get') {
      const plans = (await listAll(db.ScopeFundingPlan, { project_id })).sort((a, b) => (a.created_date || '').localeCompare(b.created_date || ''));
      const plan = plans[0] || null;
      const versions = plan ? (await db.ScopeFundingPlanVersion.filter({ plan_id: plan.id }, { sort: '-version', limit: 25, fields: ['version', 'saved_at', 'saved_by_email', 'change_note', 'snapshot'] })).items : [];
      return Response.json({
        success: true, plan, warnings: plan ? planWarnings(plan) : [], duplicate_plans: Math.max(plans.length - 1, 0),
        versions: versions.map((v) => ({ version: v.version, saved_at: v.saved_at, saved_by_email: v.saved_by_email, change_note: v.change_note || '', total_planned_cents: v.snapshot?.total_planned_cents ?? null, milestone_count: v.snapshot?.milestones?.length ?? 0, agreed_client_budget_cents: v.snapshot?.agreed_client_budget_cents ?? null })),
        scope_options: idx.options, billing_enabled: false, lock_enabled: false,
      });
    }
    if (action === 'save_draft') {
      const r = await saveDraft(realStore(db), { project_id, email: user.email, now: new Date().toISOString(), categories: idx.categories, groups: idx.groups }, body);
      return Response.json(r.body, { status: r.status });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ───────────── In-memory self-test (never touches real records) ─────────────
function memStore(opts = {}) {
  const plans = [], versions = [];
  let n = 0;
  const s = {
    plans, versions,
    findPlans: async (pid) => plans.filter((p) => p.project_id === pid).map((p) => ({ ...p })),
    getPlan: async (id) => ({ ...plans.find((p) => p.id === id) }),
    createPlan: async (d) => { const p = { id: 'p' + ++n, created_date: String(n).padStart(4, '0'), ...d }; plans.push(p); if (opts.raceCreate) { opts.raceCreate = false; plans.unshift({ id: 'race', created_date: '0000', project_id: d.project_id, version: 1, milestones: [] }); } return { ...p }; },
    deletePlan: async (id) => { const i = plans.findIndex((p) => p.id === id); if (i >= 0) plans.splice(i, 1); },
    casPlan: async (id, version, set) => { if (opts.bumpBeforeCas) { opts.bumpBeforeCas = false; plans.find((p) => p.id === id).version++; } const p = plans.find((x) => x.id === id && x.version === version); if (!p) return false; Object.assign(p, set); return true; },
    createVersion: async (d) => { const v = { id: 'v' + ++n, ...d }; versions.push(v); return v; },
    deleteVersion: async (id) => { const i = versions.findIndex((v) => v.id === id); if (i >= 0) versions.splice(i, 1); },
  };
  return s;
}
async function runSelfTest() {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, pass: !!ok, ...(ok ? {} : { detail }) });
  const ctx = { project_id: 'PRJ', email: 'admin@test', now: '2026-01-01T00:00:00.000Z', categories: new Map([['CAT1', { request_id: 'R1' }], ['CAT2', { request_id: 'R2' }]]), groups: new Map([['GRP1', { request_id: 'R1' }]]) };
  const fixed = (amount_cents, extra = {}) => ({ name: 'Parts deposit', method: 'FIXED_PARTS_FUNDING', amount_cents, ...extra });
  const pct = (percent_bps, extra = {}) => ({ name: 'Deposit', method: 'PERCENT_OF_AGREED_CLIENT_BUDGET', percent_bps, ...extra });

  let s = memStore();
  let r = await saveDraft(s, ctx, { expected_version: 0, milestones: [fixed(250000, { target_date: '2026-12-01', scope_category_id: 'CAT1', scope_group_id: 'GRP1' })] });
  check('create draft (version 1, status draft, audit fields)', r.status === 200 && r.body.plan.version === 1 && r.body.plan.status === 'draft' && r.body.plan.created_by_email === 'admin@test' && s.versions.length === 1, r);
  check('fixed amount calculated = entered', r.body.plan?.milestones?.[0]?.calculated_amount_cents === 250000 && r.body.plan.total_planned_cents === 250000);
  r = await saveDraft(s, ctx, { expected_version: 0, milestones: [] });
  check('stale version rejected (409), nothing written', r.status === 409 && s.versions.length === 1 && s.plans[0].version === 1, r);
  r = await saveDraft(s, ctx, { expected_version: 1, milestones: [fixed(-1)] });
  check('negative money rejected', r.status === 400 && s.plans[0].version === 1, r.body);
  r = await saveDraft(s, ctx, { expected_version: 1, milestones: [fixed(100.5)] });
  check('fractional cents rejected', r.status === 400, r.body);
  r = await saveDraft(s, ctx, { expected_version: 1, milestones: [pct(2000)] });
  check('percent without agreed budget rejected', r.status === 400 && /requires an agreed client budget/.test(r.body.error), r.body);
  r = await saveDraft(s, ctx, { expected_version: 1, agreed_client_budget_cents: 1000001, milestones: [pct(2000)] });
  check('percent with unconfirmed budget rejected', r.status === 400 && /confirmed/.test(r.body.error), r.body);
  r = await saveDraft(s, ctx, { expected_version: 1, agreed_client_budget_cents: 1000001, confirm_agreed_budget: true, milestones: [pct(10001)] });
  check('percent over 100% rejected', r.status === 400, r.body);
  r = await saveDraft(s, ctx, { expected_version: 1, agreed_client_budget_cents: 1000001, confirm_agreed_budget: true, milestones: [pct(3333), pct(3333), fixed(5000)] });
  check('percent rounding to cents (half-up): 1,000,001 × 33.33% = 333,300', r.status === 200 && r.body.plan.milestones[0].calculated_amount_cents === 333300 && r.body.plan.total_planned_cents === 333300 * 2 + 5000, r.body);
  check('budget confirmation stamped with user and time', r.body.plan?.agreed_budget_confirmed === true && r.body.plan.agreed_budget_confirmed_by === 'admin@test');
  check('every save writes a version snapshot', s.versions.length === 2 && s.versions[1].version === 2);
  r = await saveDraft(s, ctx, { expected_version: 2, agreed_client_budget_cents: 500000, milestones: [fixed(5000)] });
  check('changing budget without re-confirming clears confirmation', r.status === 200 && r.body.plan.agreed_budget_confirmed === false && r.body.plan.agreed_budget_confirmed_by === null, r.body.plan);
  check('unconfirmed budget warning', r.body.warnings.some((w) => w.code === 'BUDGET_NOT_CONFIRMED'));
  r = await saveDraft(s, ctx, { expected_version: 3, agreed_client_budget_cents: 100000, confirm_agreed_budget: true, milestones: [pct(6000), pct(5000), fixed(1)] });
  check('sum over 100% and over budget only warn', r.status === 200 && r.body.warnings.some((w) => w.code === 'PERCENT_OVER_100') && r.body.warnings.some((w) => w.code === 'PLAN_OVER_AGREED_BUDGET'), r.body.warnings);
  r = await saveDraft(s, ctx, { expected_version: 4, milestones: [fixed(1, { scope_category_id: 'NOPE' })] });
  check('foreign scope category rejected', r.status === 400, r.body);
  r = await saveDraft(s, ctx, { expected_version: 4, milestones: [fixed(1, { scope_category_id: 'CAT2', scope_group_id: 'GRP1' })] });
  check('category/group from different reviews rejected', r.status === 400, r.body);
  r = await saveDraft(s, ctx, { expected_version: 4, milestones: [fixed(1, { target_date: '2026-02-30' })] });
  check('invalid date rejected', r.status === 400, r.body);
  r = await saveDraft(s, ctx, { expected_version: 4, milestones: [fixed(1, { status: 'locked', method: 'FIXED_PARTS_FUNDING' })], status: 'active' });
  check('status always forced to draft', r.status === 200 && r.body.plan.status === 'draft' && r.body.plan.milestones[0].status === 'draft', r.body.plan);
  check('client-sent calculated amounts ignored', (await saveDraft(s, ctx, { expected_version: 5, milestones: [fixed(100, { calculated_amount_cents: 999999 })] })).body.plan.milestones[0].calculated_amount_cents === 100);
  s = memStore({ bumpBeforeCas: true });
  await saveDraft(s, ctx, { expected_version: 0, milestones: [] });
  const before = s.versions.length;
  r = await saveDraft(s, ctx, { expected_version: 1, milestones: [fixed(10)] });
  check('concurrent edit loses CAS → 409 and its snapshot is removed', r.status === 409 && s.versions.length === before, { r, versions: s.versions.length });
  s = memStore({ raceCreate: true });
  r = await saveDraft(s, ctx, { expected_version: 0, milestones: [] });
  check('simultaneous create → loser removed, one plan remains', r.status === 409 && s.plans.length === 1 && s.plans[0].id === 'race' && s.versions.length === 0, { r, plans: s.plans.length });
  const fresh = memStore();
  const many = Array.from({ length: 51 }, () => fixed(1));
  check('milestone count capped', (await saveDraft(fresh, ctx, { expected_version: 0, milestones: many })).status === 400 && fresh.plans.length === 0);
  return { self_test: true, passed: results.filter((x) => x.pass).length, total: results.length, results };
}