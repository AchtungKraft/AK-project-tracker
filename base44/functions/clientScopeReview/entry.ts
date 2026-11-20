import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * clientScopeReview — canonical client-safe Scope Review contract for the Client Portal
 * (client.achtungkraft.com) and the client report route (/clientscopereport).
 *
 * Auth (re-validated on every call against an active ProjectClientAccess for the review's project):
 *  - credentials: { token } share token and/or { slug } client URL slug + requestId (same rules as publicClientRequestDetail)
 *  - { action: 'create_report_link', ...credentials, scope, report_type } → 15-minute report ticket bound to that review/scope/report
 *  - { ticket } → data for exactly the review/scope/report the ticket was issued for (used by /clientscopereport#ticket=…)
 *
 * Never returned: labor rates, per-line labor dollars, cost/margin/purchasing data, linked tasks,
 * material hashes, staff emails or any other project's data.
 *
 * Pricing mirrors src/components/scope/scopePricingHelpers.js (computeScopeItemPricing /
 * computeScopePricingRollup) exactly — keep in sync.
 */

// CORS allowlist: production portal + this app's own origins + explicitly listed dev origins.
// CORS is browser policy, not authorization: every request is still authorized server-side below.
const ALLOWED_ORIGINS = new Set([
  'https://client.achtungkraft.com',
  'https://projects.achtungkraft.com',
  'https://achtung-kraft-project-tracker-69cc30c4.base44.app',
  // Explicitly authorized development origins (e.g. the Client Portal's own preview URL) go here.
]);
const APP_ID = '6913f39cea91db2169cc30c4';
function originAllowed(origin) {
  if (!origin) return true; // server-to-server / same-origin SDK calls carry no Origin
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try { const h = new URL(origin).hostname; return h.endsWith('.base44.app') && h.includes(APP_ID); } catch { return false; } // this app's editor preview
}
const corsFor = (origin) => (origin && originAllowed(origin)
  ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600' }
  : { 'Vary': 'Origin' });

const TICKET_TTL_MS = 15 * 60 * 1000;
const REPORT_BASE_URL = 'https://projects.achtungkraft.com/clientscopereport';
const sha256 = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, '0')).join('');
const ID_RE = /^[0-9a-fA-F]{24}$/;
const SCOPES = ['all', 'approved', 'pending', 'selected'];
const REPORT_TYPES = ['detailed', 'financial_summary'];
const PENDING = new Set(['needs_review', 'reapproval_required']);

const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status, code, message) => reply({ success: false, error: { code, message } }, status);
const rows = (r) => (Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : []);
const bySort = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);

// ── Canonical estimate engine — MUST MATCH src/components/scope/scopeEstimate.js + scopePricingHelpers.js ──
// Line state: tbd | exact (low only) | up_to (high only) | range | none (description only). Blank is never 0.
const toNum = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
function classify(low, high, tbd) {
  if (tbd) return { state: 'tbd', low: null, high: null };
  const lo = toNum(low), hi = toNum(high);
  if (lo != null && hi != null) return { state: 'range', low: lo, high: hi };
  if (lo != null) return { state: 'exact', low: lo, high: lo };
  if (hi != null) return { state: 'up_to', low: null, high: hi };
  return { state: 'none', low: null, high: null };
}
const scale = (e, f) => ({ state: e.state, low: e.low == null ? null : e.low * f, high: e.high == null ? null : e.high * f });
const emptyAgg = () => ({ lo: 0, hi: 0, lower_open: false, numeric_count: 0, tbd_count: 0 });
function addE(a, e) {
  if (e.state === 'tbd') a.tbd_count++;
  else if (e.state !== 'none') { a.numeric_count++; a.hi += e.high; if (e.low == null) a.lower_open = true; else a.lo += e.low; }
  return a;
}
function merge(...aggs) {
  const r = emptyAgg();
  for (const a of aggs) { if (!a) continue; r.lo += a.lo; r.hi += a.hi; r.numeric_count += a.numeric_count; r.tbd_count += a.tbd_count; r.lower_open = r.lower_open || a.lower_open; }
  return r;
}
const bounds = (a) => (!a.numeric_count ? { min: null, max: null } : { min: a.lower_open ? null : a.lo, max: a.hi });
const money = (v) => '$' + Math.round(v).toLocaleString('en-US');
const hrs = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
function fmtBounds(min, max, kind) {
  const f = kind === 'hours' ? hrs : money, unit = kind === 'hours' ? ' hrs' : '';
  if (min == null) return `Up to ${f(max)}${unit}`;
  if (min === max) return `${f(min)}${unit}`;
  return `${f(min)}–${f(max)}${unit}`;
}
const fmtE = (e, kind = 'money') => (e.state === 'tbd' ? 'TBD' : e.state === 'none' ? null : fmtBounds(e.low, e.high, kind));
function fmtAgg(a, kind = 'money') {
  if (!a.numeric_count) return a.tbd_count ? 'TBD' : null;
  const b = bounds(a);
  const base = fmtBounds(b.min, b.max, kind);
  return a.tbd_count ? `${base} + TBD` : base;
}
function fmtRange(min, max) {
  if (min == null && max == null) return null;
  if (min != null && max != null) return min === max ? money(min) : `${money(min)}–${money(max)}`;
  return min != null ? `From ${money(min)}` : `Up to ${money(max)}`;
}
const isFlexible = (item) => Array.isArray(item.hard_cost_lines);

/** Returns { pricing (client-safe), _agg (internal, never sent) }. */
function itemPricing(item, labor) {
  const hours = emptyAgg(), dollars = emptyAgg();
  for (const le of labor) { const e = classify(le.hours_min, le.hours_max, le.hours_tbd); addE(hours, e); addE(dollars, scale(e, le.rate_snapshot || 0)); }
  const hb = bounds(hours), db = bounds(dollars);
  const laborEstimated = hours.numeric_count > 0;
  const base = { ak_hours_min: hb.min, ak_hours_max: hb.max, ak_labor_min: db.min, ak_labor_max: db.max, labor_estimated: laborEstimated,
    labor_tbd_count: hours.tbd_count, ak_hours_label: fmtAgg(hours, 'hours'), ak_labor_label: fmtAgg(dollars) };
  const none = { estimate_partial: false, estimate_none: false };
  if ((item.pricing_model || 'legacy_estimate') !== 'hard_cost_plus_labor') {
    return { _agg: { hard: emptyAgg(), legacy: addE(emptyAgg(), classify(item.budget_min, item.budget_max, item.budget_tbd)), hours, dollars, total: emptyAgg() },
      pricing: { pricing_model: 'legacy_estimate', estimate_format: 'legacy', legacy_budget_min: item.budget_min ?? null, legacy_budget_max: item.budget_max ?? null, legacy_budget_tbd: !!item.budget_tbd,
        hard_cost_min: null, hard_cost_max: null, hard_cost_tbd: false, hard_cost_label: null, ...base, total_estimate_min: null, total_estimate_max: null, total_label: null, estimate_complete: false, ...none } };
  }
  if (isFlexible(item)) {
    const hard = emptyAgg();
    for (const l of item.hard_cost_lines) addE(hard, classify(l.min, l.max, l.tbd));
    const total = merge(hard, dollars), hcb = bounds(hard), tb = bounds(total);
    const tbd = hard.tbd_count + hours.tbd_count, numeric = total.numeric_count > 0;
    return { _agg: { hard, legacy: emptyAgg(), hours, dollars, total },
      pricing: { pricing_model: 'hard_cost_plus_labor', estimate_format: 'flexible', legacy_budget_min: null, legacy_budget_max: null, legacy_budget_tbd: false,
        hard_cost_min: hcb.min, hard_cost_max: hcb.max, hard_cost_tbd: hard.tbd_count > 0, hard_cost_label: fmtAgg(hard), ...base,
        total_estimate_min: tb.min, total_estimate_max: tb.max, total_label: fmtAgg({ ...total, tbd_count: tbd }), total_lower_open: total.lower_open,
        estimate_complete: numeric && tbd === 0, estimate_partial: numeric && tbd > 0, estimate_none: !numeric && tbd === 0 } };
  }
  // Legacy single hard cost — unchanged rules
  const hcMin = item.hard_cost_min ?? null, hcMax = item.hard_cost_max ?? null, hcTbd = !!item.hard_cost_tbd;
  const complete = !hcTbd && hcMin != null && hcMax != null && laborEstimated && hours.tbd_count === 0;
  const hard = addE(emptyAgg(), classify(hcMin, hcMax, hcTbd));
  const total = complete ? merge(hard, dollars) : emptyAgg(), tb = bounds(total);
  return { _agg: { hard, legacy: emptyAgg(), hours, dollars, total },
    pricing: { pricing_model: 'hard_cost_plus_labor', estimate_format: 'legacy', legacy_budget_min: null, legacy_budget_max: null, legacy_budget_tbd: false,
      hard_cost_min: hcMin, hard_cost_max: hcMax, hard_cost_tbd: hcTbd, hard_cost_label: hcTbd ? 'TBD' : fmtRange(hcMin, hcMax), ...base,
      total_estimate_min: tb.min, total_estimate_max: tb.max, total_label: complete ? fmtAgg(total) : null, estimate_complete: complete, ...none } };
}

/** complete | partial | hard_cost_tbd | pending | description_only | legacy | legacy_tbd */
function estimateStatus(p) {
  if (p.pricing_model === 'legacy_estimate') return p.legacy_budget_tbd ? 'legacy_tbd' : 'legacy';
  if (p.estimate_complete) return 'complete';
  if (p.estimate_format === 'flexible') return p.estimate_partial ? 'partial' : p.estimate_none ? 'description_only' : 'pending';
  if (p.labor_estimated) return p.hard_cost_tbd ? 'hard_cost_tbd' : 'partial';
  return 'pending';
}

function rollup(entries) {
  const r = { count: entries.length, hard_cost_tbd_count: 0, labor_tbd_count: 0, legacy_budget_tbd_count: 0, legacy_count: 0, classified_count: 0, all_classified: true, has_incomplete: false };
  let hard = emptyAgg(), legacy = emptyAgg(), hours = emptyAgg(), dollars = emptyAgg(), total = emptyAgg();
  for (const { pricing: p, _agg: a } of entries) {
    if (p.pricing_model === 'legacy_estimate') { r.legacy_count++; r.all_classified = false; if (p.legacy_budget_tbd) r.legacy_budget_tbd_count++; legacy = merge(legacy, a.legacy); }
    else {
      r.classified_count++;
      if (p.hard_cost_tbd) r.hard_cost_tbd_count++;
      hard = merge(hard, a.hard);
      if (p.estimate_complete) total = merge(total, a.total); else if (!p.estimate_none) r.has_incomplete = true;
    }
    if (p.labor_tbd_count) r.labor_tbd_count++;
    hours = merge(hours, a.hours); dollars = merge(dollars, a.dollars);
  }
  const z = (b) => (b.max == null ? { min: 0, max: 0 } : b);
  const hb = z(bounds(hard)), lb = z(bounds(legacy)), hrb = z(bounds(hours)), db = z(bounds(dollars)), tb = z(bounds(total));
  return { ...r, hard_cost_min: hb.min, hard_cost_max: hb.max, legacy_budget_min: lb.min, legacy_budget_max: lb.max, ak_hours_min: hrb.min, ak_hours_max: hrb.max,
    ak_labor_min: db.min, ak_labor_max: db.max, total_estimate_min: tb.min, total_estimate_max: tb.max,
    hard_cost_label: fmtAgg(hard), legacy_budget_label: fmtAgg(legacy), ak_hours_label: fmtAgg(hours, 'hours'), ak_labor_label: fmtAgg(dollars),
    total_label: total.numeric_count ? fmtAgg(total) : null, combined_label: fmtAgg(merge(legacy, hard, dollars)) };
}

function hardCostLines(item) {
  if (item.pricing_model !== 'hard_cost_plus_labor') return [];
  if (isFlexible(item)) {
    return item.hard_cost_lines.map(l => { const e = classify(l.min, l.max, l.tbd); return { description: l.description || '', min: l.min ?? null, max: l.max ?? null, tbd: !!l.tbd, estimate_state: e.state, display: fmtE(e) }; });
  }
  if (!item.hard_cost_tbd && item.hard_cost_min == null && item.hard_cost_max == null) return [];
  return [{ description: item.hard_cost_note || '', min: item.hard_cost_min ?? null, max: item.hard_cost_max ?? null, tbd: !!item.hard_cost_tbd,
    estimate_state: 'legacy', display: item.hard_cost_tbd ? 'TBD' : fmtRange(item.hard_cost_min ?? null, item.hard_cost_max ?? null) }];
}

const deny = () => fail(403, 'ACCESS_DENIED', 'Access denied');

async function loadReview(db, requestId) {
  const request = rows(await db.ClientFeedbackRequest.filter({ id: requestId }))[0];
  return request && request.request_type === 'client_scope_review' && request.status !== 'draft' ? request : null;
}

/** Ticket mode: short-lived, bound to one review + scope + report type. Access is re-checked on every use. */
async function authorizeTicket(db, ticket) {
  if (typeof ticket !== 'string' || !/^[0-9a-f]{64}$/.test(ticket)) return { error: deny() };
  const t = rows(await db.ClientReportTicket.filter({ ticket_hash: await sha256(ticket) }))[0];
  if (!t) return { error: deny() };
  if (new Date(t.expires_at).getTime() <= Date.now()) return { error: fail(401, 'TICKET_EXPIRED', 'This report link has expired. Open the report again from the Client Portal.') };
  const request = await loadReview(db, t.request_id);
  const access = rows(await db.ProjectClientAccess.filter({ id: t.access_id }))[0];
  if (!request || !access || access.access_status !== 'active' || access.project_id !== request.project_id || request.project_id !== t.project_id) return { error: deny() };
  if (access.client_contact_id) {
    const contact = rows(await db.ClientContact.filter({ id: access.client_contact_id }))[0];
    if (!contact || contact.active === false) return { error: deny() };
  }
  await db.ClientReportTicket.update(t.id, { use_count: (t.use_count || 0) + 1, last_used_at: new Date().toISOString() });
  return { request, access, scope: t.scope, reportType: t.report_type, selectedIds: t.scope === 'selected' ? (t.item_ids || []) : null };
}

/** Credential mode: existing client share token and/or client slug (same rules as publicClientRequestDetail). */
async function authorizeCredentials(db, body) {
  const { token, slug, requestId } = body;
  const scope = body.scope || 'all';
  const reportType = body.report_type || null;
  if (typeof requestId !== 'string' || !ID_RE.test(requestId)) return { error: fail(400, 'INVALID_REQUEST', 'requestId is required') };
  if (!(typeof token === 'string' && token.length >= 8) && !(typeof slug === 'string' && slug.length > 0)) return { error: fail(400, 'MISSING_CREDENTIALS', 'token or slug is required') };
  if (!SCOPES.includes(scope)) return { error: fail(400, 'INVALID_SCOPE', `scope must be one of ${SCOPES.join(', ')}`) };
  if (reportType && !REPORT_TYPES.includes(reportType)) return { error: fail(400, 'INVALID_REPORT_TYPE', `report_type must be one of ${REPORT_TYPES.join(', ')}`) };
  const selectedIds = scope === 'selected' ? (Array.isArray(body.item_ids) ? [...new Set(body.item_ids.filter(id => typeof id === 'string' && ID_RE.test(id)))] : []) : null;
  if (scope === 'selected' && (!selectedIds.length || selectedIds.length > 500)) return { error: fail(400, 'INVALID_SELECTION', 'item_ids must list 1-500 scope item ids') };

  const request = await loadReview(db, requestId);
  if (!request) return { error: fail(404, 'NOT_FOUND', 'Scope review not found') };
  const accessFilter = { project_id: request.project_id, access_status: 'active' };
  if (slug) {
    const contact = rows(await db.ClientContact.filter({ url_slug: slug, active: true }))[0];
    if (!contact) return { error: deny() };
    accessFilter.client_contact_id = contact.id;
  }
  if (token) accessFilter.share_token = token;
  const access = rows(await db.ProjectClientAccess.filter(accessFilter))[0];
  if (!access) return { error: deny() };
  return { request, access, scope, reportType, selectedIds };
}

async function createReportTicket(db, auth) {
  if (!auth.reportType) return fail(400, 'INVALID_REPORT_TYPE', `report_type is required: ${REPORT_TYPES.join(', ')}`);
  if (auth.scope === 'selected') {
    const ids = new Set(rows(await db.ScopeItem.filter({ request_id: auth.request.id }, 'sort_order', 2000)).map(i => i.id));
    if (!auth.selectedIds.every(id => ids.has(id))) return fail(400, 'INVALID_SELECTION', 'One or more item_ids do not belong to this scope review');
  }
  const ticket = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS).toISOString();
  await db.ClientReportTicket.create({
    ticket_hash: await sha256(ticket), request_id: auth.request.id, project_id: auth.request.project_id, access_id: auth.access.id,
    client_contact_id: auth.access.client_contact_id || null, scope: auth.scope, report_type: auth.reportType,
    item_ids: auth.selectedIds || [], expires_at: expiresAt, use_count: 0,
  });
  // Ticket goes in the URL fragment: never sent to servers, proxies or Referer headers.
  return reply({ success: true, contract_version: '1.1', ticket, expires_at: expiresAt, scope: auth.scope, report_type: auth.reportType, report_url: `${REPORT_BASE_URL}#ticket=${ticket}` });
}

Deno.serve(async (req) => {
  const res = await handle(req);
  for (const [k, v] of Object.entries(corsFor(req.headers.get('origin')))) res.headers.set(k, v);
  return res;
});

async function handle(req) {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: originAllowed(origin) ? 204 : 403 });
  if (!originAllowed(origin)) return fail(403, 'ORIGIN_NOT_ALLOWED', 'Origin not allowed');
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST');
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));

    // ── Authorization: ticket, or request → project → active client access ──
    const auth = body.ticket ? await authorizeTicket(db, body.ticket) : await authorizeCredentials(db, body);
    if (auth.error) return auth.error;
    if (body.action === 'create_report_link') {
      if (body.ticket) return fail(400, 'INVALID_REQUEST', 'Report links are created with client credentials, not a ticket');
      return await createReportTicket(db, auth);
    }
    const { request, access, scope, reportType, selectedIds } = auth;
    const requestId = request.id;

    const q = { request_id: requestId };
    const [project, categories, groups, items, labor, comments, confirmations] = await Promise.all([
      db.Project.filter({ id: request.project_id }).then(r => rows(r)[0] || null),
      db.ScopeCategory.filter(q, 'sort_order', 2000).then(rows),
      db.ScopeGroup.filter(q, 'sort_order', 2000).then(rows),
      db.ScopeItem.filter(q, 'sort_order', 2000).then(rows),
      db.ScopeItemLaborEstimate.filter(q, 'sort_order', 5000).then(rows),
      db.ScopeItemComment.filter(q, 'created_date', 5000).then(rows),
      db.ScopeConfirmation.filter(q, '-confirmed_at', 50).then(rows),
    ]);

    const catMap = new Map(categories.map(c => [c.id, c]));
    const grpMap = new Map(groups.map(g => [g.id, g]));
    const laborByItem = new Map();
    for (const le of labor) { if (!laborByItem.has(le.scope_item_id)) laborByItem.set(le.scope_item_id, []); laborByItem.get(le.scope_item_id).push(le); }
    const commentsByItem = new Map();
    for (const c of comments) { if (!commentsByItem.has(c.scope_item_id)) commentsByItem.set(c.scope_item_id, []); commentsByItem.get(c.scope_item_id).push(c); }

    const aggById = new Map(); // internal aggregates for rollups; never sent
    const allItems = items.filter(i => i.request_id === requestId).sort(bySort).map(item => {
      const itemLabor = (laborByItem.get(item.id) || []).sort(bySort);
      const priced = itemPricing(item, itemLabor);
      const pricing = priced.pricing;
      aggById.set(item.id, priced._agg);
      const status = item.decision_status || 'needs_review';
      return {
        id: item.id, project_id: request.project_id, request_id: requestId,
        category_id: item.category_id || null, category_name: catMap.get(item.category_id)?.name || null,
        group_id: item.group_id || null, group_name: grpMap.get(item.group_id)?.name || null,
        title: item.title || '', description: item.description || '', images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
        sort_order: item.sort_order || 0, pricing_model: pricing.pricing_model,
        hard_costs: hardCostLines(item),
        hard_cost_lines: Array.isArray(item.hard_cost_lines) ? item.hard_cost_lines.map(l => ({ description: l.description || '', min: l.min ?? null, max: l.max ?? null, tbd: !!l.tbd })) : [],
        hard_cost_note: item.hard_cost_note || '', budget_note: item.budget_note || '',
        labor_lines: itemLabor.map(le => ({ id: le.id, labor_category: le.labor_group_name_snapshot || 'Labor', description: le.description || '', hours_min: le.hours_min ?? null, hours_max: le.hours_max ?? null, hours_tbd: !!le.hours_tbd,
          estimate_state: classify(le.hours_min, le.hours_max, le.hours_tbd).state, hours_display: fmtE(classify(le.hours_min, le.hours_max, le.hours_tbd), 'hours'), sort_order: le.sort_order || 0 })),
        estimate_format: pricing.estimate_format,
        pricing, estimate_status: estimateStatus(pricing),
        decision_status: status, decision_at: item.decision_at || null, reapproval_required: status === 'reapproval_required',
        comments: (commentsByItem.get(item.id) || []).map(c => ({ id: c.id, author_type: c.author_type, author_name: c.author_name || null, body: c.body || '', posted_at: c.posted_at || c.created_date })),
      };
    });

    const inScope = (i) => scope === 'all' || (scope === 'approved' && i.decision_status === 'approved') || (scope === 'pending' && PENDING.has(i.decision_status)) || (scope === 'selected' && selectedIds.includes(i.id));
    const scoped = allItems.filter(inScope);
    if (scope === 'selected' && scoped.length !== new Set(selectedIds).size) return fail(400, 'INVALID_SELECTION', 'One or more item_ids do not belong to this scope review');

    const latest = confirmations.sort((a, b) => new Date(b.confirmed_at || b.created_date) - new Date(a.confirmed_at || a.created_date))[0] || null;
    const approvedIds = allItems.filter(i => i.decision_status === 'approved').map(i => i.id).sort();
    const snapIds = (latest?.approved_item_ids || []).slice().sort();
    const confirmationStale = !!latest && (approvedIds.length !== snapIds.length || approvedIds.some((id, i) => id !== snapIds[i]));
    const sum = (list) => rollup(list.map(i => ({ pricing: i.pricing, _agg: aggById.get(i.id) })));

    return reply({
      success: true,
      contract_version: '1.2',
      access: { access_role: access.access_role || 'viewer', can_decide: access.access_role === 'approver' },
      request: { id: request.id, title: request.title, body: request.body || '', status: request.status, posted_at: request.posted_at || null, created_date: request.created_date, project_id: request.project_id },
      project: project ? { id: project.id, name: project.name, client_name: project.client_name || null } : null,
      scope, report_type: reportType,
      categories: categories.sort(bySort).map(c => ({ id: c.id, name: c.name, sort_order: c.sort_order || 0 })),
      groups: groups.sort(bySort).map(g => ({ id: g.id, name: g.name, sort_order: g.sort_order || 0 })),
      items: scoped,
      totals: { scoped: sum(scoped), all: sum(allItems), approved: sum(allItems.filter(i => i.decision_status === 'approved')), pending: sum(allItems.filter(i => PENDING.has(i.decision_status))) },
      confirmation: {
        state: !latest ? 'not_confirmed' : confirmationStale ? 'stale' : 'confirmed',
        latest: latest ? { confirmed_at: latest.confirmed_at, confirmed_by_name: latest.confirmed_by_name || null, revision: latest.revision ?? null, approved_item_ids: latest.approved_item_ids || [], summary_snapshot: latest.summary_snapshot || null } : null,
      },
    });
  } catch (error) {
    console.error('[clientScopeReview]', error?.message);
    return fail(500, 'SERVER_ERROR', 'Unable to load scope review');
  }
}