import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// getApprovedScopeBudget — ADMIN-ONLY, READ-ONLY.
// Approved Scope Budget (planning, not invoice eligible). Never writes anything and is never summed into
// billable, projected billable, profitability, invoice availability or purchasing math.
// Sources (deduplicated by scope_item_id):
//   1. ScopeEstimateBaseline (oldest per item) for converted items — counted only when clean.
//   2. Approval fingerprint (ScopeItem.material_hash) for approved, not-yet-converted items — counted only when
//      the item is unchanged since approval.
// Anything stale or ambiguous is listed under `excluded` with a reason and never counted.

const r2 = (n) => Math.round(n * 100) / 100;
const isId = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(v);
const so = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);

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
async function inChunks(E, field, ids, opts = {}) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = [];
  for (let i = 0; i < uniq.length; i += 100) out.push(...(await listAll(E, { [field]: { $in: uniq.slice(i, i + 100) } }, opts)));
  return out;
}

// Must match scopeHelpers.computeMaterialHash / scopeEstimateBaseline.materialHash exactly.
function materialHash(item, labor) {
  const itemLabor = labor
    .map((le) => ({ gid: le.labor_group_id || '', hmin: le.hours_min, hmax: le.hours_max, rate: le.rate_snapshot }))
    .sort((a, b) => (a.gid || '').localeCompare(b.gid || ''));
  return JSON.stringify({
    title: item.title || '', description: item.description || '',
    budget_min: item.budget_min ?? null, budget_max: item.budget_max ?? null, budget_note: item.budget_note || '',
    hard_cost_min: item.hard_cost_min ?? null, hard_cost_max: item.hard_cost_max ?? null,
    hard_cost_tbd: item.hard_cost_tbd || false, hard_cost_note: item.hard_cost_note || '',
    images: (item.images || []).slice().sort(), labor: itemLabor,
  });
}

// Values from the approval fingerprint (the approved values), same rules as baseline construction.
function fromFingerprint(item, snap, groupNames) {
  const lines = (snap.labor || []).map((l) => {
    const hmin = Number(l.hmin) || 0, hmax = Number(l.hmax) || 0, rate = Number(l.rate) || 0;
    return { labor_group_id: l.gid || '', labor_group_name: groupNames.get(l.gid) || 'Labor', rate, hours_min: hmin, hours_max: hmax, dollars_min: r2(hmin * rate), dollars_max: r2(hmax * rate) };
  });
  const classified = item.pricing_model === 'hard_cost_plus_labor';
  return {
    pricing_model: classified ? 'hard_cost_plus_labor' : 'legacy_estimate',
    hard_cost_min: classified ? (snap.hard_cost_min ?? null) : null,
    hard_cost_max: classified ? (snap.hard_cost_max ?? null) : null,
    hard_cost_tbd: classified ? !!snap.hard_cost_tbd : false,
    legacy_budget_min: classified ? null : (snap.budget_min ?? null),
    legacy_budget_max: classified ? null : (snap.budget_max ?? null),
    legacy_budget_tbd: classified ? false : !!item.budget_tbd,
    labor_lines: lines,
  };
}
const fromBaseline = (b) => ({
  pricing_model: b.pricing_model, hard_cost_min: b.hard_cost_min ?? null, hard_cost_max: b.hard_cost_max ?? null, hard_cost_tbd: !!b.hard_cost_tbd,
  legacy_budget_min: b.legacy_budget_min ?? null, legacy_budget_max: b.legacy_budget_max ?? null, legacy_budget_tbd: !!b.legacy_budget_tbd,
  labor_lines: b.labor_lines || [],
});

function finishItem(v) {
  const hmin = r2(v.labor_lines.reduce((s, l) => s + (Number(l.hours_min) || 0), 0));
  const hmax = r2(v.labor_lines.reduce((s, l) => s + (Number(l.hours_max) || 0), 0));
  const laborKnown = v.labor_lines.length > 0 && (hmin > 0 || hmax > 0);
  const hc = v.pricing_model === 'hard_cost_plus_labor';
  const hcKnown = hc && !v.hard_cost_tbd && v.hard_cost_min != null && v.hard_cost_max != null;
  const lgKnown = !hc && !v.legacy_budget_tbd && v.legacy_budget_min != null && v.legacy_budget_max != null;
  return {
    ...v,
    hard_cost: hcKnown ? { min: v.hard_cost_min, max: v.hard_cost_max } : null,
    hard_cost_state: !hc ? 'not_applicable' : v.hard_cost_tbd ? 'tbd' : hcKnown ? 'estimated' : 'not_estimated',
    legacy_budget: lgKnown ? { min: v.legacy_budget_min, max: v.legacy_budget_max } : null,
    legacy_state: hc ? 'not_applicable' : v.legacy_budget_tbd ? 'tbd' : lgKnown ? 'estimated' : 'not_estimated',
    labor_hours: laborKnown ? { min: hmin, max: hmax } : null,
    labor_dollars: laborKnown ? { min: r2(v.labor_lines.reduce((s, l) => s + (Number(l.dollars_min) || 0), 0)), max: r2(v.labor_lines.reduce((s, l) => s + (Number(l.dollars_max) || 0), 0)) } : null,
  };
}

// Range over known values only; null (not zero) when nothing is known.
function rng(items, key) {
  const known = items.filter((i) => i[key]);
  return { min: known.length ? r2(known.reduce((s, i) => s + i[key].min, 0)) : null, max: known.length ? r2(known.reduce((s, i) => s + i[key].max, 0)) : null, known_count: known.length };
}
function totals(items) {
  const cnt = (f) => items.filter(f).length;
  return {
    items: items.length,
    converted: cnt((i) => i.converted), not_converted: cnt((i) => !i.converted),
    hard_cost: rng(items, 'hard_cost'), hard_cost_tbd: cnt((i) => i.hard_cost_state === 'tbd'), hard_cost_not_estimated: cnt((i) => i.hard_cost_state === 'not_estimated'),
    legacy_items: cnt((i) => i.pricing_model === 'legacy_estimate'), legacy_budget: rng(items, 'legacy_budget'), legacy_tbd: cnt((i) => i.legacy_state === 'tbd'),
    labor_hours: rng(items, 'labor_hours'), labor_dollars: rng(items, 'labor_dollars'), labor_not_estimated: cnt((i) => !i.labor_hours),
    converted_hard_cost: rng(items.filter((i) => i.converted), 'hard_cost'), not_converted_hard_cost: rng(items.filter((i) => !i.converted), 'hard_cost'),
    converted_labor_dollars: rng(items.filter((i) => i.converted), 'labor_dollars'), not_converted_labor_dollars: rng(items.filter((i) => !i.converted), 'labor_dollars'),
    // Hard-cost allowance on items with no parts linked to a task yet (not-converted items have no task).
    unlinked_hard_cost: rng(items.filter((i) => !i.linked_parts), 'hard_cost'),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { project_id } = await req.json().catch(() => ({}));
    if (!isId(project_id)) return Response.json({ error: 'project_id is required' }, { status: 400 });
    const db = base44.asServiceRole.entities;
    const project = (await db.Project.filter({ id: project_id }, { limit: 1 }).catch((e) => (e.status === 400 || e.status === 404 ? { items: [] } : Promise.reject(e)))).items[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allReqs = await listAll(db.ClientFeedbackRequest, { project_id, request_type: 'client_scope_review' }, { fields: ['title', 'status', 'project_id'] });
    const reqs = allReqs.filter((r) => r.project_id === project_id && r.status !== 'archived');
    const reqIds = reqs.map((r) => r.id);
    const [items, labor, cats, grps, baselines] = reqIds.length ? await Promise.all([
      inChunks(db.ScopeItem, 'request_id', reqIds),
      inChunks(db.ScopeItemLaborEstimate, 'request_id', reqIds),
      inChunks(db.ScopeCategory, 'request_id', reqIds),
      inChunks(db.ScopeGroup, 'request_id', reqIds),
      inChunks(db.ScopeEstimateBaseline, 'request_id', reqIds),
    ]) : [[], [], [], [], []];

    const laborByItem = new Map();
    labor.forEach((l) => { if (!laborByItem.has(l.scope_item_id)) laborByItem.set(l.scope_item_id, []); laborByItem.get(l.scope_item_id).push(l); });
    const baselineByItem = new Map();
    baselines.slice().sort((a, b) => (a.created_date || '').localeCompare(b.created_date || '')).forEach((b) => { if (!baselineByItem.has(b.scope_item_id)) baselineByItem.set(b.scope_item_id, b); });
    const gids = [];
    items.forEach((i) => { try { JSON.parse(i.material_hash || '{}').labor?.forEach((l) => l.gid && gids.push(l.gid)); } catch (_) { /* ignore */ } });
    const lgs = await inChunks(db.ScopeLaborGroup, 'id', gids, { fields: ['name'] });
    const groupNames = new Map(lgs.map((g) => [g.id, g.name]));

    const included = [], excluded = [];
    for (const item of items) {
      const st = item.decision_status;
      if (st !== 'approved' && st !== 'reapproval_required') continue;
      const base = { scope_item_id: item.id, request_id: item.request_id, category_id: item.category_id, group_id: item.group_id, title: item.title };
      if (st === 'reapproval_required') { excluded.push({ ...base, reason: 'awaiting_reapproval' }); continue; }
      const b = baselineByItem.get(item.id);
      const linked = item.linked_task_ids || [];
      if (b) {
        if (b.project_id !== project_id) { excluded.push({ ...base, reason: 'baseline_other_project' }); continue; }
        if (b.fingerprint_match === false || (b.ambiguity_reasons || []).length) { excluded.push({ ...base, reason: 'baseline_needs_review', detail: b.ambiguity_reasons || [] }); continue; }
        if (item.material_hash && b.approval_fingerprint && item.material_hash !== b.approval_fingerprint) { excluded.push({ ...base, reason: 'baseline_stale_reapproved' }); continue; }
        included.push({ ...base, ...finishItem(fromBaseline(b)), converted: true, task_id: b.task_id, provenance: { source: `baseline_${b.source || 'conversion'}`, baseline_id: b.id, captured_at: b.captured_at || null, approved_at: b.approved_at || null, fingerprint_match: b.fingerprint_match !== false } });
        continue;
      }
      if (linked.length) { excluded.push({ ...base, reason: 'converted_without_baseline' }); continue; }
      if (!item.material_hash) { excluded.push({ ...base, reason: 'no_approval_fingerprint' }); continue; }
      if (materialHash(item, laborByItem.get(item.id) || []) !== item.material_hash) { excluded.push({ ...base, reason: 'edited_since_approval' }); continue; }
      let snap;
      try { snap = JSON.parse(item.material_hash); } catch (_) { snap = null; }
      if (!snap || !Array.isArray(snap.labor)) { excluded.push({ ...base, reason: 'no_approval_fingerprint' }); continue; }
      included.push({ ...base, ...finishItem(fromFingerprint(item, snap, groupNames)), converted: false, task_id: null, provenance: { source: 'approval_fingerprint', approved_at: item.decision_at || null, fingerprint_match: true } });
    }

    // Parts linked to converted tasks (one batched read). Services can't be attributed to a task.
    const links = await inChunks(db.TaskPartLink, 'task_id', included.map((i) => i.task_id), { fields: ['task_id'] });
    const linkCount = links.reduce((m, l) => m.set(l.task_id, (m.get(l.task_id) || 0) + 1), new Map());
    included.forEach((i) => { i.linked_parts = i.task_id ? linkCount.get(i.task_id) || 0 : 0; });

    // Rate snapshots by labor group
    const rateMap = new Map();
    included.forEach((i) => i.labor_lines.forEach((l) => {
      const k = `${l.labor_group_id}|${l.rate}`;
      const e = rateMap.get(k) || { labor_group_name: l.labor_group_name, rate: l.rate, hours_min: 0, hours_max: 0, dollars_min: 0, dollars_max: 0, items: 0 };
      e.hours_min = r2(e.hours_min + (Number(l.hours_min) || 0)); e.hours_max = r2(e.hours_max + (Number(l.hours_max) || 0));
      e.dollars_min = r2(e.dollars_min + (Number(l.dollars_min) || 0)); e.dollars_max = r2(e.dollars_max + (Number(l.dollars_max) || 0)); e.items++;
      rateMap.set(k, e);
    }));

    // Breakdown: review → category → group in canonical sort_order
    const reviews = reqs.map((r) => {
      const rItems = included.filter((i) => i.request_id === r.id);
      const rCats = cats.filter((c) => c.request_id === r.id).sort(so);
      const rGrps = grps.filter((g) => g.request_id === r.id).sort(so);
      const categories = rCats.map((c) => {
        const cItems = rItems.filter((i) => i.category_id === c.id);
        const groups = rGrps.map((g) => ({ id: g.id, name: g.name, item_list: cItems.filter((i) => i.group_id === g.id) })).filter((g) => g.item_list.length).map((g) => ({ id: g.id, name: g.name, totals: totals(g.item_list), items: g.item_list }));
        const placed = new Set(groups.flatMap((g) => g.items.map((i) => i.scope_item_id)));
        const rest = cItems.filter((i) => !placed.has(i.scope_item_id));
        if (rest.length) groups.push({ id: null, name: 'Unassigned group', totals: totals(rest), items: rest });
        return { id: c.id, name: c.name, totals: totals(cItems), groups };
      }).filter((c) => c.groups.length);
      const placed = new Set(categories.flatMap((c) => c.groups.flatMap((g) => g.items.map((i) => i.scope_item_id))));
      const rest = rItems.filter((i) => !placed.has(i.scope_item_id));
      if (rest.length) categories.push({ id: null, name: 'Other', totals: totals(rest), groups: [{ id: null, name: 'Unassigned group', totals: totals(rest), items: rest }] });
      return { request_id: r.id, title: r.title, totals: totals(rItems), categories };
    }).filter((r) => r.totals.items || excluded.some((e) => e.request_id === r.id));

    const exclReason = excluded.reduce((m, e) => ((m[e.reason] = (m[e.reason] || 0) + 1), m), {});
    return Response.json({
      success: true, read_only: true, invoice_eligible: false,
      project_id, generated_at: new Date().toISOString(),
      label: 'Approved Scope Budget (planning, not invoice eligible)',
      totals: totals(included), rates: [...rateMap.values()].sort((a, b) => a.labor_group_name.localeCompare(b.labor_group_name) || a.rate - b.rate),
      reviews, excluded, excluded_by_reason: exclReason,
      archived_reviews_skipped: allReqs.length - reqs.length,
      provenance: {
        converted: 'ScopeEstimateBaseline (immutable, captured at conversion/backfill; oldest per scope item)',
        not_converted: 'ScopeItem approval fingerprint (values the client approved), only when unchanged since approval',
        hard_cost: 'Approved hard-cost allowance (parts, materials, outside services) as estimated in scope. Not commitment cost and not invoice retail.',
        labor: 'Approved labor hours × rate snapshot captured on the scope estimate. Estimate of labor value; not logged or invoiced labor.',
        legacy: 'Legacy items carry one unclassified budget range (not split into hard cost vs labor); shown separately and never added to hard cost or labor.',
      },
      funding: { enabled: false, note: 'Funding and progress billing: not enabled yet.' },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});