import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * clientScopeReview — canonical client-safe Scope Review contract for the Client Portal
 * (client.achtungkraft.com) and the client report route (/clientscopereport).
 *
 * Auth: the same client credentials publicClientRequestDetail accepts ({ token } share token or
 * { slug } client URL slug) + requestId. Access is re-validated on every call against an active
 * ProjectClientAccess for the request's project. Nothing from the browser is trusted beyond those.
 *
 * Never returned: labor rates, per-line labor dollars, cost/margin/purchasing data, linked tasks,
 * material hashes, staff emails or any other project's data.
 *
 * Pricing mirrors src/components/scope/scopePricingHelpers.js (computeScopeItemPricing /
 * computeScopePricingRollup) exactly — keep in sync.
 */

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const ID_RE = /^[0-9a-fA-F]{24}$/;
const SCOPES = ['all', 'approved', 'pending', 'selected'];
const REPORT_TYPES = ['detailed', 'financial_summary'];
const PENDING = new Set(['needs_review', 'reapproval_required']);

const reply = (body, status = 200) => Response.json(body, { status, headers: CORS });
const fail = (status, code, message) => reply({ success: false, error: { code, message } }, status);
const rows = (r) => (Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : []);
const bySort = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);

function itemPricing(item, labor) {
  let hMin = 0, hMax = 0, lMin = 0, lMax = 0;
  for (const le of labor) {
    hMin += le.hours_min || 0; hMax += le.hours_max || 0;
    lMin += (le.hours_min || 0) * (le.rate_snapshot || 0);
    lMax += (le.hours_max || 0) * (le.rate_snapshot || 0);
  }
  const laborEstimated = labor.length > 0 && (hMin > 0 || hMax > 0);
  const base = { ak_hours_min: hMin, ak_hours_max: hMax, ak_labor_min: lMin, ak_labor_max: lMax, labor_estimated: laborEstimated };
  if ((item.pricing_model || 'legacy_estimate') !== 'hard_cost_plus_labor') {
    return { pricing_model: 'legacy_estimate', legacy_budget_min: item.budget_min ?? null, legacy_budget_max: item.budget_max ?? null, legacy_budget_tbd: !!item.budget_tbd,
      hard_cost_min: null, hard_cost_max: null, hard_cost_tbd: false, ...base, total_estimate_min: null, total_estimate_max: null, estimate_complete: false };
  }
  const hcMin = item.hard_cost_min ?? null, hcMax = item.hard_cost_max ?? null, hcTbd = !!item.hard_cost_tbd;
  const complete = !hcTbd && hcMin != null && hcMax != null && laborEstimated;
  return { pricing_model: 'hard_cost_plus_labor', legacy_budget_min: null, legacy_budget_max: null, legacy_budget_tbd: false,
    hard_cost_min: hcMin, hard_cost_max: hcMax, hard_cost_tbd: hcTbd, ...base,
    total_estimate_min: complete ? (hcMin || 0) + lMin : null, total_estimate_max: complete ? (hcMax || 0) + lMax : null, estimate_complete: complete };
}

/** complete | partial | hard_cost_tbd | pending | legacy | legacy_tbd — same rules as the Scope Review header. */
function estimateStatus(p) {
  if (p.pricing_model === 'legacy_estimate') return p.legacy_budget_tbd ? 'legacy_tbd' : 'legacy';
  if (p.estimate_complete) return 'complete';
  if (p.labor_estimated) return p.hard_cost_tbd ? 'hard_cost_tbd' : 'partial';
  return 'pending';
}

function rollup(pricings) {
  const r = { count: pricings.length, hard_cost_min: 0, hard_cost_max: 0, hard_cost_tbd_count: 0, ak_labor_min: 0, ak_labor_max: 0, ak_hours_min: 0, ak_hours_max: 0,
    total_estimate_min: 0, total_estimate_max: 0, legacy_budget_min: 0, legacy_budget_max: 0, legacy_budget_tbd_count: 0, legacy_count: 0, classified_count: 0, all_classified: true, has_incomplete: false };
  for (const p of pricings) {
    if (p.pricing_model === 'legacy_estimate') {
      r.legacy_count++; r.all_classified = false;
      if (p.legacy_budget_tbd) r.legacy_budget_tbd_count++;
      else { if (p.legacy_budget_min != null) r.legacy_budget_min += p.legacy_budget_min; if (p.legacy_budget_max != null) r.legacy_budget_max += p.legacy_budget_max; }
    } else {
      r.classified_count++;
      if (p.hard_cost_tbd) r.hard_cost_tbd_count++; else { r.hard_cost_min += p.hard_cost_min || 0; r.hard_cost_max += p.hard_cost_max || 0; }
      if (p.estimate_complete) { r.total_estimate_min += p.total_estimate_min || 0; r.total_estimate_max += p.total_estimate_max || 0; } else r.has_incomplete = true;
    }
    r.ak_labor_min += p.ak_labor_min; r.ak_labor_max += p.ak_labor_max; r.ak_hours_min += p.ak_hours_min; r.ak_hours_max += p.ak_hours_max;
  }
  return r;
}

function hardCostLines(item) {
  if (item.pricing_model !== 'hard_cost_plus_labor') return [];
  if (Array.isArray(item.hard_cost_lines) && item.hard_cost_lines.length) {
    return item.hard_cost_lines.map(l => ({ description: l.description || '', min: l.min ?? null, max: l.max ?? null, tbd: !!l.tbd }));
  }
  if (!item.hard_cost_tbd && item.hard_cost_min == null && item.hard_cost_max == null) return [];
  return [{ description: item.hard_cost_note || '', min: item.hard_cost_min ?? null, max: item.hard_cost_max ?? null, tbd: !!item.hard_cost_tbd }];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const { token, slug, requestId } = body;
    const scope = body.scope || 'all';
    const reportType = body.report_type || null;

    if (typeof requestId !== 'string' || !ID_RE.test(requestId)) return fail(400, 'INVALID_REQUEST', 'requestId is required');
    if (!(typeof token === 'string' && token.length >= 8) && !(typeof slug === 'string' && slug.length > 0)) return fail(400, 'MISSING_CREDENTIALS', 'token or slug is required');
    if (!SCOPES.includes(scope)) return fail(400, 'INVALID_SCOPE', `scope must be one of ${SCOPES.join(', ')}`);
    if (reportType && !REPORT_TYPES.includes(reportType)) return fail(400, 'INVALID_REPORT_TYPE', `report_type must be one of ${REPORT_TYPES.join(', ')}`);
    const selectedIds = scope === 'selected' ? (Array.isArray(body.item_ids) ? body.item_ids.filter(id => typeof id === 'string' && ID_RE.test(id)) : []) : null;
    if (scope === 'selected' && (!selectedIds.length || selectedIds.length > 500)) return fail(400, 'INVALID_SELECTION', 'item_ids must list 1-500 scope item ids');

    // ── Authorization: request → project → active client access (same rules as publicClientRequestDetail) ──
    const request = rows(await db.ClientFeedbackRequest.filter({ id: requestId }))[0];
    if (!request || request.request_type !== 'client_scope_review' || request.status === 'draft') return fail(404, 'NOT_FOUND', 'Scope review not found');
    const accessFilter = { project_id: request.project_id, access_status: 'active' };
    if (slug) {
      const contact = rows(await db.ClientContact.filter({ url_slug: slug, active: true }))[0];
      if (!contact) return fail(403, 'ACCESS_DENIED', 'Access denied');
      accessFilter.client_contact_id = contact.id;
    }
    if (token) accessFilter.share_token = token;
    const access = rows(await db.ProjectClientAccess.filter(accessFilter))[0];
    if (!access) return fail(403, 'ACCESS_DENIED', 'Access denied');

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

    const allItems = items.filter(i => i.request_id === requestId).sort(bySort).map(item => {
      const itemLabor = (laborByItem.get(item.id) || []).sort(bySort);
      const pricing = itemPricing(item, itemLabor);
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
        labor_lines: itemLabor.map(le => ({ id: le.id, labor_category: le.labor_group_name_snapshot || 'Labor', description: le.description || '', hours_min: le.hours_min || 0, hours_max: le.hours_max || 0, sort_order: le.sort_order || 0 })),
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
    const sum = (list) => rollup(list.map(i => i.pricing));

    return reply({
      success: true,
      contract_version: '1.0',
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
});