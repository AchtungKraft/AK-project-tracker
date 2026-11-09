import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Scope Review approved estimate → Task baseline.
// The ONLY write path for ScopeEstimateBaseline (entity RLS blocks browser writes).
// Read-only with respect to supply, purchasing, invoices and labor billing: this function never
// creates/updates PartCommitment, ServiceCommitment, Order, ProjectInvoice(Line) or labor fields.
//
// Actions:
//   convert            (staff) create Task + immutable baseline for approved, unconverted scope items
//   backfill_preview   (admin) read-only classification of already-converted items
//   backfill_apply     (admin) attach baselines to existing tasks; ambiguous rows need explicit confirm + note
//   task_summary       (Bryan + Matt only) baseline + estimated / committed / actual / billed for one task
//   request_reconciliation (Bryan + Matt only) read-only per-item estimate vs commitments for a scope review
//   estimate_access    (staff) { can_view_task_estimate } for the current user
//   conversion_status  (staff) baseline link fields only (no amounts) for conversion badges

const err = (status, error, extra = {}) => Response.json({ error, ...extra }, { status });
const STAFF = new Set(['admin', 'user']);

// Task-level approved estimate / reconciliation reads are limited to these two people ONLY —
// not all admins. Keyed by stable user id; the account email must also match (deny on any mismatch).
const TASK_ESTIMATE_VIEWERS = Object.freeze({
  '69148cb04f31d0d193adbd02': 'bryan@achtungkraft.com',
  '6917410dacf84fea89fa8ab0': 'matt@achtungkraft.com',
});
const RESTRICTED_ACTIONS = new Set(['task_summary', 'request_reconciliation']);
export function canViewTaskEstimates(user) {
  if (!user || typeof user.id !== 'string' || typeof user.email !== 'string') return false;
  if (!STAFF.has(user.role)) return false;
  const expected = Object.prototype.hasOwnProperty.call(TASK_ESTIMATE_VIEWERS, user.id) ? TASK_ESTIMATE_VIEWERS[user.id] : null;
  return !!expected && expected === user.email.trim().toLowerCase();
}
// Pure request gate: returns an HTTP status to reject with, or null to continue.
export function gate(user, action) {
  if (!user) return 401;
  if (!STAFF.has(user.role)) return 403;
  if (RESTRICTED_ACTIONS.has(action) && !canViewTaskEstimates(user)) return 403;
  return null;
}

function selfTest() {
  const bryan = { id: '69148cb04f31d0d193adbd02', email: 'bryan@achtungkraft.com', role: 'admin' };
  const matt = { id: '6917410dacf84fea89fa8ab0', email: 'matt@achtungkraft.com', role: 'user' };
  const otherAdmin = { id: '6913f39cea91db2169cc30c5', email: 'sales@achtungkraft.com', role: 'admin' };
  const staff = { id: '691741b226ae615eb5aa9301', email: 'staff@example.com', role: 'user' };
  const cases = [];
  const t = (name, ok) => cases.push({ name, pass: !!ok });
  for (const a of RESTRICTED_ACTIONS) {
    t(`Bryan → ${a} allowed`, gate(bryan, a) === null);
    t(`Matt → ${a} allowed`, gate(matt, a) === null);
    t(`other admin → ${a} 403`, gate(otherAdmin, a) === 403);
    t(`ordinary staff → ${a} 403`, gate(staff, a) === 403);
    t(`signed-out → ${a} 401`, gate(null, a) === 401);
    t(`client/unknown role → ${a} 403`, gate({ ...matt, role: 'client' }, a) === 403);
    t(`Matt's id with another email → ${a} 403`, gate({ ...matt, email: 'mpolitowicz@me.com' }, a) === 403);
    t(`Bryan's email on another id → ${a} 403`, gate({ ...otherAdmin, email: 'bryan@achtungkraft.com' }, a) === 403);
  }
  t('email case/whitespace normalised for Bryan', canViewTaskEstimates({ ...bryan, email: ' Bryan@AchtungKraft.com ' }));
  t('prototype key cannot match', !canViewTaskEstimates({ id: '__proto__', email: '[object Object]', role: 'admin' }));
  t('missing id/email denied', !canViewTaskEstimates({ role: 'admin' }));
  for (const a of ['convert', 'convert_preview', 'conversion_status', 'estimate_access', 'backfill_preview', 'image_backfill_preview']) {
    t(`other admin → ${a} not blocked by estimate gate`, gate(otherAdmin, a) === null);
    t(`signed-out → ${a} 401`, gate(null, a) === 401);
  }
  t('ordinary staff → convert not blocked by estimate gate', gate(staff, 'convert') === null);
  t('access flag: Bryan true, Matt true, other admin false, staff false',
    canViewTaskEstimates(bryan) && canViewTaskEstimates(matt) && !canViewTaskEstimates(otherAdmin) && !canViewTaskEstimates(staff));
  const passed = cases.filter((c) => c.pass).length;
  return { pass: passed === cases.length, passed, total: cases.length, results: cases };
}
const r2 = (n) => Math.round(n * 100) / 100;
const isId = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(v);
const keyFor = (scopeItemId) => `scope-baseline:${scopeItemId}`;

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
async function byIds(E, ids, opts = {}) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = [];
  for (let i = 0; i < uniq.length; i += 100) out.push(...(await listAll(E, { id: { $in: uniq.slice(i, i + 100) } }, opts)));
  return out;
}

// Must match src/components/scope/scopeHelpers.js computeMaterialHash exactly (key order matters).
function materialHash(item, labor) {
  const itemLabor = labor
    .map((le) => ({ gid: le.labor_group_id || '', hmin: le.hours_min, hmax: le.hours_max, rate: le.rate_snapshot }))
    .sort((a, b) => (a.gid || '').localeCompare(b.gid || ''));
  return JSON.stringify({
    title: item.title || '',
    description: item.description || '',
    budget_min: item.budget_min ?? null,
    budget_max: item.budget_max ?? null,
    budget_note: item.budget_note || '',
    hard_cost_min: item.hard_cost_min ?? null,
    hard_cost_max: item.hard_cost_max ?? null,
    hard_cost_tbd: item.hard_cost_tbd || false,
    hard_cost_note: item.hard_cost_note || '',
    images: (item.images || []).slice().sort(),
    labor: itemLabor,
  });
}

// Approved snapshot: parsed from the approval fingerprint when present (these ARE the approved values),
// otherwise the current item values (flagged as ambiguous).
function approvedSnapshot(item, labor) {
  if (item.material_hash) {
    try {
      const s = JSON.parse(item.material_hash);
      if (s && typeof s === 'object' && Array.isArray(s.labor)) return { snap: s, fromFingerprint: true };
    } catch (_) { /* fall through */ }
  }
  return { snap: JSON.parse(materialHash(item, labor)), fromFingerprint: false };
}

function buildBaselineValues({ item, snap, groupNames, catName, grpName, request }) {
  const lines = snap.labor.map((l) => {
    const hmin = Number(l.hmin) || 0, hmax = Number(l.hmax) || 0, rate = Number(l.rate) || 0;
    return { labor_group_id: l.gid || '', labor_group_name: groupNames.get(l.gid) || 'Labor', rate, hours_min: hmin, hours_max: hmax, dollars_min: r2(hmin * rate), dollars_max: r2(hmax * rate) };
  });
  const sum = (k) => r2(lines.reduce((s, l) => s + l[k], 0));
  const labor_hours_min = sum('hours_min'), labor_hours_max = sum('hours_max');
  const labor_estimated = lines.length > 0 && (labor_hours_min > 0 || labor_hours_max > 0);
  const model = item.pricing_model === 'hard_cost_plus_labor' ? 'hard_cost_plus_labor' : 'legacy_estimate';
  const classified = model === 'hard_cost_plus_labor';
  const hcMin = classified ? (snap.hard_cost_min ?? null) : null;
  const hcMax = classified ? (snap.hard_cost_max ?? null) : null;
  const hcTbd = classified ? !!snap.hard_cost_tbd : false;
  const hcAvail = classified && !hcTbd && hcMin != null && hcMax != null;
  const complete = hcAvail && labor_estimated;
  return {
    request_title: request.title || '',
    title: snap.title || item.title || '',
    description_snapshot: snap.description || '',
    category_id: item.category_id || '', category_name: catName || '',
    group_id: item.group_id || '', group_name: grpName || '',
    pricing_model: model,
    hard_cost_min: hcMin, hard_cost_max: hcMax, hard_cost_tbd: hcTbd,
    hard_cost_note: classified ? (snap.hard_cost_note || '') : '',
    legacy_budget_min: classified ? null : (snap.budget_min ?? null),
    legacy_budget_max: classified ? null : (snap.budget_max ?? null),
    legacy_budget_tbd: classified ? false : !!item.budget_tbd,
    budget_note: snap.budget_note || '',
    labor_lines: lines,
    labor_hours_min, labor_hours_max,
    labor_dollars_min: sum('dollars_min'), labor_dollars_max: sum('dollars_max'),
    labor_estimated,
    total_estimate_min: complete ? r2(hcMin + sum('dollars_min')) : null,
    total_estimate_max: complete ? r2(hcMax + sum('dollars_max')) : null,
    approved_at: item.decision_at || null,
    approved_by_type: item.decision_actor_type || '',
    approved_by_id: item.decision_actor_id || '',
    approval_fingerprint: item.material_hash || '',
  };
}


// ── Task execution draft (single-item review) limits + sanitizers ──
const MAX_DESC = 20000, MAX_CHECK = 100, MAX_CHECK_LEN = 500, MAX_IMAGES = 50;
// eslint-disable-next-line no-control-regex
const clean = (s, max) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const isHttpsUrl = (u) => typeof u === 'string' && u.length <= 2000 && /^https:\/\/[^\s<>"'`]+$/.test(u);
// Approved images only (from the approval fingerprint snapshot), in the item's display order.
function approvedImages(item, snap) {
  const ok = new Set((snap.images || []).filter(isHttpsUrl));
  const ordered = (item.images || []).filter((u) => ok.has(u));
  for (const u of ok) if (!ordered.includes(u)) ordered.push(u);
  return [...new Set(ordered)];
}
const imageRefs = (urls, itemId, email) => {
  const at = new Date().toISOString();
  return urls.map((url) => ({ url, source_type: 'scope_item', source_id: itemId, added_by: email, added_at: at }));
};

// Task description = the approved ScopeItem narrative only. Provenance, cost, labor and estimate
// values live in the immutable ScopeEstimateBaseline (shown in the Approved Scope Estimate panel);
// images live on Task.reference_images.
function taskDescription(v) {
  return (v.description_snapshot || '').trim();
}

// Converge concurrent creates for the same scope item: oldest baseline wins.
async function resolveWinner(db, scopeItemId) {
  const all = (await db.ScopeEstimateBaseline.filter({ baseline_key: keyFor(scopeItemId) }, { sort: 'created_date', limit: 20 })).items;
  return all;
}

async function loadRequestContext(db, request) {
  const [items, labor, cats, grps, baselines, confs] = await Promise.all([
    listAll(db.ScopeItem, { request_id: request.id }),
    listAll(db.ScopeItemLaborEstimate, { request_id: request.id }),
    listAll(db.ScopeCategory, { request_id: request.id }),
    listAll(db.ScopeGroup, { request_id: request.id }),
    listAll(db.ScopeEstimateBaseline, { request_id: request.id }),
    db.ScopeConfirmation.filter({ request_id: request.id }, { sort: '-confirmed_at', limit: 1 }).then((p) => p.items),
  ]);
  const gids = [...new Set(labor.map((l) => l.labor_group_id).filter(Boolean))];
  items.forEach((i) => { try { JSON.parse(i.material_hash || '{}').labor?.forEach((l) => l.gid && gids.push(l.gid)); } catch (_) { /* ignore */ } });
  const lgs = await byIds(db.ScopeLaborGroup, gids, { fields: ['name'] });
  const laborByItem = new Map();
  labor.forEach((l) => { if (!laborByItem.has(l.scope_item_id)) laborByItem.set(l.scope_item_id, []); laborByItem.get(l.scope_item_id).push(l); });
  const baselineByItem = new Map();
  baselines.slice().sort((a, b) => (a.created_date || '').localeCompare(b.created_date || '')).forEach((b) => { if (!baselineByItem.has(b.scope_item_id)) baselineByItem.set(b.scope_item_id, b); });
  const latestConf = confs[0] || null;
  return {
    items, laborByItem, baselineByItem, baselines,
    catName: new Map(cats.map((c) => [c.id, c.name])),
    grpName: new Map(grps.map((g) => [g.id, g.name])),
    groupNames: new Map(lgs.map((g) => [g.id, g.name])),
    confRevisionFor: (itemId) => (latestConf && (latestConf.approved_item_ids || []).includes(itemId) ? latestConf.revision ?? null : null),
  };
}

function classify(item, ctx, taskMap, projectId) {
  const base = { scope_item_id: item.id, title: item.title, decision_status: item.decision_status, linked_task_ids: item.linked_task_ids || [] };
  const existing = ctx.baselineByItem.get(item.id);
  if (existing) return { ...base, status: 'baselined', baseline_id: existing.id, task_id: existing.task_id };
  const linked = item.linked_task_ids || [];
  if (!linked.length) return { ...base, status: item.decision_status === 'approved' ? 'not_converted' : 'not_applicable' };
  const blocking = [], ambiguous = [];
  if (item.decision_status !== 'approved') blocking.push('not_currently_approved');
  const found = linked.map((id) => taskMap.get(id)).filter(Boolean);
  if (found.length < linked.length) (found.length ? ambiguous : blocking).push('linked_task_missing');
  const inProject = found.filter((t) => t.project_id === projectId);
  if (found.length && !inProject.length) blocking.push('task_in_other_project');
  const taken = new Set(ctx.baselines.map((b) => b.task_id));
  const candidates = inProject.filter((t) => !taken.has(t.id));
  if (inProject.length && !candidates.length) blocking.push('task_already_has_baseline');
  if (candidates.length > 1) ambiguous.push('multiple_linked_tasks');
  if (!item.material_hash) ambiguous.push('no_approval_fingerprint');
  else if (materialHash(item, ctx.laborByItem.get(item.id) || []) !== item.material_hash) ambiguous.push('edited_since_approval');
  const status = blocking.length ? 'blocked' : ambiguous.length ? 'needs_confirmation' : 'ready';
  return { ...base, status, reasons: [...blocking, ...ambiguous], candidate_tasks: candidates.map((t) => ({ id: t.id, name: t.name })) };
}

// ── Read-only per-task financial view. Never writes. ──
async function taskFinancials(db, taskIds, project) {
  const tasks = await byIds(db.Task, taskIds, { fields: ['name', 'project_id', 'estimated_hours', 'labor_billing_type', 'labor_rate_override'] });
  const links = [];
  for (let i = 0; i < taskIds.length; i += 100) links.push(...(await listAll(db.TaskPartLink, { task_id: { $in: taskIds.slice(i, i + 100) } })));
  const commitIds = [...new Set(links.map((l) => l.commitment_id).filter(Boolean))];
  const [commitments, sharedLinks, parts, entries] = await Promise.all([
    byIds(db.PartCommitment, commitIds),
    commitIds.length ? listAll(db.TaskPartLink, { commitment_id: { $in: commitIds } }, { fields: ['task_id', 'commitment_id'] }) : [],
    byIds(db.Part, links.map((l) => l.part_id), { fields: ['part_name', 'vendor_part_number'] }),
    listAll(db.TaskTimeEntry, { task_id: { $in: taskIds } }, { fields: ['task_id', 'hours'] }),
  ]);
  const cMap = new Map(commitments.map((c) => [c.id, c]));
  const pMap = new Map(parts.map((p) => [p.id, p]));
  const result = {};
  for (const t of tasks) {
    const tl = links.filter((l) => l.task_id === t.id);
    const acc = { committed: [0, 0], actual: [0, 0], retail: [0, 0], billed: [0, 0] }; // [known_total, unknown_count]
    const add = (k, v) => (v == null ? acc[k][1]++ : (acc[k][0] += v));
    let excluded = 0;
    const lines = tl.map((l) => {
      const c = l.commitment_id ? cMap.get(l.commitment_id) : null;
      const qty = Number(l.qty_allocated) || 0;
      const line = { link_id: l.id, part_id: l.part_id, part_name: pMap.get(l.part_id)?.part_name || 'Part', part_number: pMap.get(l.part_id)?.vendor_part_number || '', commitment_id: l.commitment_id || null, qty };
      if (!c) { Object.assign(line, { state: 'no_commitment', committed_cost: null, actual_cost: null, planned_retail: null, billed: null }); ['committed', 'actual', 'retail', 'billed'].forEach((k) => add(k, null)); return line; }
      if (c.commitment_status === 'cancelled' || c.cancelled_at) { excluded++; return { ...line, state: 'cancelled' }; }
      const committed = c.unit_cost_snapshot != null ? r2(c.unit_cost_snapshot * qty) : null;
      const actual = c.actual_unit_cost != null ? r2(c.actual_unit_cost * qty) : null;
      const retail = c.unit_retail_snapshot != null ? r2(c.unit_retail_snapshot * qty) : null;
      const exclusive = sharedLinks.filter((s) => s.commitment_id === c.id).every((s) => s.task_id === t.id);
      const billed = !exclusive ? null : (c.billing_status === 'invoiced' || c.billing_status === 'paid') ? (c.invoiced_amount ?? null) : c.billing_status === 'not_billable' ? 0 : (c.invoiced_amount || 0);
      add('committed', committed); add('actual', actual); add('retail', retail); add('billed', billed);
      return { ...line, state: 'committed', billing_status: c.billing_status || 'unbilled', shared_commitment: !exclusive, committed_cost: committed, actual_cost: actual, planned_retail: retail, billed };
    });
    const pack = (k) => ({ known_total: r2(acc[k][0]), unknown_count: acc[k][1] });
    const myEntries = entries.filter((e) => e.task_id === t.id);
    const logged = r2(myEntries.reduce((s, e) => s + (Number(e.hours) || 0), 0));
    const rate = t.labor_rate_override ?? project?.labor_billing_rate ?? null;
    const billingType = t.labor_billing_type || 'UNCLASSIFIED';
    result[t.id] = {
      task: { id: t.id, name: t.name, project_id: t.project_id, estimated_hours: t.estimated_hours ?? null },
      parts: { link_count: tl.length, cancelled_excluded: excluded, lines, committed_cost: pack('committed'), actual_cost: pack('actual'), planned_retail: pack('retail'), billed: pack('billed') },
      labor: {
        logged_hours: logged, entry_count: myEntries.length, billing_type: billingType,
        rate, rate_source: t.labor_rate_override != null ? 'task_override' : project?.labor_billing_rate != null ? 'project' : null,
        charge_at_rate: billingType === 'BILLABLE' && rate != null ? r2(logged * rate) : null,
      },
    };
  }
  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    const denied = gate(user, action);
    if (denied === 401) return err(401, 'Unauthorized');
    if (denied) return err(403, 'Not authorized.');
    const isAdmin = user.role === 'admin';
    const db = base44.asServiceRole.entities;

    if (action === 'estimate_access') return Response.json({ can_view_task_estimate: canViewTaskEstimates(user) });
    if (action === 'self_test') {
      if (!isAdmin && !canViewTaskEstimates(user)) return err(403, 'Not authorized.');
      return Response.json(selfTest());
    }
    const one = async (E, id) => (isId(id) ? (await db[E].filter({ id }, { limit: 1 })).items[0] || null : null);

    const loadRequest = async () => {
      const request = await one('ClientFeedbackRequest', body.requestId);
      if (!request) return { error: err(404, 'Scope review not found.') };
      if (request.request_type !== 'client_scope_review') return { error: err(400, 'Not a scope review.') };
      if (body.projectId && body.projectId !== request.project_id) return { error: err(400, 'Scope review does not belong to this project.') };
      const project = await one('Project', request.project_id);
      if (!project) return { error: err(404, 'Project not found.') };
      return { request, project };
    };

    // ── CONVERT ──
    if (action === 'convert') {
      const { request, project, error } = await loadRequest();
      if (error) return error;
      if (project.is_system_project) return err(400, 'Cannot convert scope into a system project.');
      const ids = body.scopeItemIds;
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(isId)) return err(400, 'scopeItemIds must be 1–100 ids.');
      if (body.bucketId) {
        const b = await one('ProjectKanbanBucket', body.bucketId);
        if (!b || b.project_id !== project.id) return err(400, 'Phase does not belong to this project.');
      }
      if (body.statusId) {
        const s = await one('StatusList', body.statusId);
        if (!s || s.scope !== 'Task') return err(400, 'Invalid task status.');
      }
      // Optional execution draft — single-item conversion only. Affects the Task's description,
      // checklist and reference images; never the baseline (built from the approval snapshot) or the ScopeItem.
      let overrides = null;
      if (body.taskOverrides != null) {
        if (ids.length !== 1) return err(400, 'Task edits are only allowed when converting a single item.');
        const o = body.taskOverrides;
        if (typeof o !== 'object' || Array.isArray(o)) return err(400, 'Invalid taskOverrides.');
        if (o.description != null && (typeof o.description !== 'string' || o.description.length > MAX_DESC)) return err(400, `Description must be text up to ${MAX_DESC} characters.`);
        if (o.checklist != null && (!Array.isArray(o.checklist) || o.checklist.length > MAX_CHECK || !o.checklist.every((c) => typeof c === 'string' && c.length <= MAX_CHECK_LEN))) return err(400, `Checklist must be up to ${MAX_CHECK} rows of up to ${MAX_CHECK_LEN} characters.`);
        if (o.imageUrls != null && (!Array.isArray(o.imageUrls) || o.imageUrls.length > MAX_IMAGES || !o.imageUrls.every(isHttpsUrl))) return err(400, 'Invalid reference images.');
        overrides = {
          description: o.description != null ? clean(o.description, MAX_DESC) : null,
          checklist: (o.checklist || []).map((c) => clean(c, MAX_CHECK_LEN)).filter(Boolean),
          imageUrls: o.imageUrls != null ? [...new Set(o.imageUrls)] : null,
        };
      }
      const ctx = await loadRequestContext(db, request);
      const itemMap = new Map(ctx.items.map((i) => [i.id, i]));
      const results = [];
      for (const id of [...new Set(ids)]) {
        const item = itemMap.get(id);
        if (!item) { results.push({ scope_item_id: id, status: 'rejected', reason: 'not_in_this_review' }); continue; }
        if (item.decision_status !== 'approved') { results.push({ scope_item_id: id, status: 'rejected', reason: 'not_approved' }); continue; }
        const existingBaseline = ctx.baselineByItem.get(id);
        if ((item.linked_task_ids || []).length || existingBaseline) {
          // Reconcile: a prior run created task + baseline but failed to link the ScopeItem. Repair the link only.
          if (existingBaseline && !(item.linked_task_ids || []).length && existingBaseline.project_id === project.id) {
            const t = await one('Task', existingBaseline.task_id);
            if (t && t.project_id === project.id) {
              await db.ScopeItem.update(id, { linked_task_ids: [t.id] });
              results.push({ scope_item_id: id, status: 'skipped', reason: 'already_converted_link_repaired', task_id: t.id });
              continue;
            }
          }
          results.push({ scope_item_id: id, status: 'skipped', reason: 'already_converted' });
          continue;
        }
        const labor = ctx.laborByItem.get(id) || [];
        const reasons = [];
        if (!item.material_hash) reasons.push('no_approval_fingerprint');
        else if (materialHash(item, labor) !== item.material_hash) { results.push({ scope_item_id: id, status: 'rejected', reason: 'edited_since_approval' }); continue; }
        const { snap } = approvedSnapshot(item, labor);
        const v = buildBaselineValues({ item, snap, groupNames: ctx.groupNames, catName: ctx.catName.get(item.category_id), grpName: ctx.grpName.get(item.group_id), request });
        const sourceImgs = approvedImages(item, snap);
        if (overrides?.imageUrls && !overrides.imageUrls.every((u) => sourceImgs.includes(u))) { results.push({ scope_item_id: id, status: 'rejected', reason: 'image_not_from_source' }); continue; }
        const images = overrides?.imageUrls ?? sourceImgs;
        const description = overrides?.description != null ? overrides.description : taskDescription(v);
        const checklist = overrides?.checklist || [];
        const hours = v.labor_hours_max || v.labor_hours_min;

        // All-or-nothing: task (+images), checklist and baseline. Any failure rolls back what this call created.
        let task = null, mine = null;
        const rollback = async () => {
          if (mine) await db.ScopeEstimateBaseline.delete(mine.id).catch(() => null);
          if (task) {
            const rows = (await base44.entities.TaskChecklistItem.filter({ task_id: task.id }, { limit: 500 }).catch(() => ({ items: [] }))).items || [];
            await Promise.allSettled(rows.map((r) => base44.entities.TaskChecklistItem.delete(r.id)));
            await base44.entities.Task.delete(task.id).catch(() => null);
          }
        };
        try {
          // Task + checklist use the caller's token so normal Task permissions apply.
          task = await base44.entities.Task.create({
            name: v.title, description, project_id: project.id,
            ...(images.length ? { reference_images: imageRefs(images, id, user.email) } : {}),
            ...(body.bucketId ? { kanban_bucket_id: body.bucketId } : {}),
            ...(body.statusId ? { status_id: body.statusId } : {}),
            ...(hours ? { estimated_hours: hours } : {}),
          });
          if (checklist.length) {
            await base44.entities.TaskChecklistItem.bulkCreate(checklist.map((title, i) => ({ task_id: task.id, title, sort_order: i, is_complete: false, visibility: 'internal' })));
            const saved = (await base44.entities.TaskChecklistItem.filter({ task_id: task.id }, { limit: 500 })).items || [];
            if (saved.length !== checklist.length) throw new Error('Checklist was not fully saved.');
          }
          mine = await db.ScopeEstimateBaseline.create({
            ...v, baseline_key: keyFor(id), scope_item_id: id, request_id: request.id, project_id: project.id, task_id: task.id,
            baseline_version: 1, source: 'conversion', fingerprint_match: reasons.length === 0, ambiguity_reasons: reasons,
            scope_confirmation_revision: ctx.confRevisionFor(id), captured_by_email: user.email, captured_at: new Date().toISOString(),
          });
        } catch (e) {
          await rollback();
          results.push({ scope_item_id: id, status: 'error', reason: 'persistence_failed', detail: String(e?.message || e).slice(0, 300) });
          continue;
        }
        const all = await resolveWinner(db, id);
        const winner = all[0];
        if (winner.id !== mine.id) {
          // A concurrent conversion won; remove only what this call just created.
          await rollback();
          results.push({ scope_item_id: id, status: 'skipped', reason: 'concurrent_conversion', task_id: winner.task_id });
          continue;
        }
        try {
          await db.ScopeItem.update(id, { linked_task_ids: [winner.task_id] });
        } catch (e) {
          // Task + baseline are committed; re-running convert on this item repairs the link.
          results.push({ scope_item_id: id, status: 'error', reason: 'scope_link_failed', task_id: task.id });
          continue;
        }
        results.push({ scope_item_id: id, status: 'created', task_id: task.id, baseline_id: mine.id, ambiguity_reasons: reasons, images: images.length, checklist: checklist.length });
      }
      return Response.json({ results, created: results.filter((r) => r.status === 'created').length });
    }

    // ── CONVERT PREVIEW (read-only): defaults for the single-item review modal ──
    if (action === 'convert_preview') {
      const { request, error } = await loadRequest();
      if (error) return error;
      const ctx = await loadRequestContext(db, request);
      const item = ctx.items.find((i) => i.id === body.scopeItemId);
      if (!item) return err(404, 'Scope item not in this review.');
      const labor = ctx.laborByItem.get(item.id) || [];
      let reason = null;
      if (item.decision_status !== 'approved') reason = 'not_approved';
      else if ((item.linked_task_ids || []).length || ctx.baselineByItem.has(item.id)) reason = 'already_converted';
      else if (item.material_hash && materialHash(item, labor) !== item.material_hash) reason = 'edited_since_approval';
      const { snap } = approvedSnapshot(item, labor);
      const v = buildBaselineValues({ item, snap, groupNames: ctx.groupNames, catName: ctx.catName.get(item.category_id), grpName: ctx.grpName.get(item.group_id), request });
      return Response.json({ eligible: !reason, reason, title: v.title, description: taskDescription(v), images: approvedImages(item, snap), limits: { description: MAX_DESC, checklist: MAX_CHECK, checklist_row: MAX_CHECK_LEN } });
    }

    // ── CONVERSION STATUS (staff, read-only): link fields only — never estimate amounts ──
    if (action === 'conversion_status') {
      const { request, error } = await loadRequest();
      if (error) return error;
      const rows = await listAll(db.ScopeEstimateBaseline, { request_id: request.id }, { fields: ['scope_item_id', 'task_id', 'project_id'] });
      return Response.json({ baselines: rows.map((b) => ({ id: b.id, scope_item_id: b.scope_item_id, task_id: b.task_id, project_id: b.project_id })) });
    }

    // ── IMAGE BACKFILL (admin): attach approved ScopeItem images to already-converted tasks ──
    // Only sets Task.reference_images when it is empty. Never touches description or any other field.
    if (action === 'image_backfill_preview' || action === 'image_backfill_apply') {
      if (!isAdmin) return err(403, 'Only admins can backfill task images.');
      const { request, project, error } = await loadRequest();
      if (error) return error;
      const ctx = await loadRequestContext(db, request);
      const winners = [...ctx.baselineByItem.values()];
      const tasks = new Map((await byIds(db.Task, winners.map((b) => b.task_id), { fields: ['name', 'project_id', 'reference_images'] })).map((t) => [t.id, t]));
      const itemMap = new Map(ctx.items.map((i) => [i.id, i]));
      const rows = winners.map((b) => {
        const item = itemMap.get(b.scope_item_id);
        const t = tasks.get(b.task_id);
        const imgs = item ? approvedImages(item, approvedSnapshot(item, ctx.laborByItem.get(item.id) || []).snap) : [];
        const row = { scope_item_id: b.scope_item_id, task_id: b.task_id, title: b.title, task_name: t?.name || null, images: imgs };
        if (!item) return { ...row, status: 'item_missing' };
        if (!t) return { ...row, status: 'task_missing' };
        if (t.project_id !== project.id || b.project_id !== project.id) return { ...row, status: 'other_project' };
        if ((t.reference_images || []).length) return { ...row, status: 'has_images', existing: t.reference_images.length };
        if (!imgs.length) return { ...row, status: 'no_images' };
        return { ...row, status: 'ready' };
      });
      if (action === 'image_backfill_preview') return Response.json({ rows });
      if (body.confirm !== true) return err(400, 'Explicit confirmation required.');
      const pick = body.scopeItemIds;
      if (!Array.isArray(pick) || !pick.length || pick.length > 100 || !pick.every(isId)) return err(400, 'scopeItemIds must be 1–100 ids.');
      const results = [];
      for (const sid of [...new Set(pick)]) {
        const row = rows.find((r) => r.scope_item_id === sid);
        if (!row) { results.push({ scope_item_id: sid, status: 'rejected', reason: 'not_in_this_review' }); continue; }
        if (row.status === 'has_images') { results.push({ scope_item_id: sid, status: 'skipped', reason: 'already_has_images' }); continue; }
        if (row.status !== 'ready') { results.push({ scope_item_id: sid, status: 'rejected', reason: row.status }); continue; }
        const fresh = await one('Task', row.task_id);
        if (!fresh || (fresh.reference_images || []).length) { results.push({ scope_item_id: sid, status: 'skipped', reason: 'already_has_images' }); continue; }
        await db.Task.update(row.task_id, { reference_images: imageRefs(row.images, sid, user.email) });
        results.push({ scope_item_id: sid, status: 'created', task_id: row.task_id, images: row.images.length });
      }
      return Response.json({ results, created: results.filter((r) => r.status === 'created').length });
    }

    // ── BACKFILL (admin) ──
    if (action === 'backfill_preview' || action === 'backfill_apply') {
      if (!isAdmin) return err(403, 'Only admins can backfill scope baselines.');
      const { request, project, error } = await loadRequest();
      if (error) return error;
      const ctx = await loadRequestContext(db, request);
      const taskMap = new Map((await byIds(db.Task, ctx.items.flatMap((i) => i.linked_task_ids || []), { fields: ['name', 'project_id'] })).map((t) => [t.id, t]));
      const rows = ctx.items.map((i) => classify(i, ctx, taskMap, project.id)).filter((r) => r.status !== 'not_applicable');
      if (action === 'backfill_preview') {
        const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
        return Response.json({ request: { id: request.id, title: request.title }, project: { id: project.id, name: project.name }, counts, rows });
      }
      const picks = body.items;
      if (!Array.isArray(picks) || !picks.length || picks.length > 100) return err(400, 'items must be 1–100 entries.');
      const rowMap = new Map(rows.map((r) => [r.scope_item_id, r]));
      const itemMap = new Map(ctx.items.map((i) => [i.id, i]));
      const results = [];
      for (const p of picks) {
        const row = rowMap.get(p?.scope_item_id);
        if (!row) { results.push({ scope_item_id: p?.scope_item_id, status: 'rejected', reason: 'not_in_this_review' }); continue; }
        if (row.status === 'baselined') { results.push({ scope_item_id: row.scope_item_id, status: 'skipped', reason: 'already_baselined' }); continue; }
        if (row.status !== 'ready' && row.status !== 'needs_confirmation') { results.push({ scope_item_id: row.scope_item_id, status: 'rejected', reason: row.status, reasons: row.reasons }); continue; }
        const note = typeof p.note === 'string' ? p.note.trim() : '';
        if (row.status === 'needs_confirmation' && (p.confirm !== true || note.length < 5)) { results.push({ scope_item_id: row.scope_item_id, status: 'rejected', reason: 'confirmation_and_note_required', reasons: row.reasons }); continue; }
        const taskId = row.candidate_tasks.length === 1 ? row.candidate_tasks[0].id : p.task_id;
        if (!row.candidate_tasks.some((t) => t.id === taskId) || (p.task_id && p.task_id !== taskId)) { results.push({ scope_item_id: row.scope_item_id, status: 'rejected', reason: 'invalid_task_choice' }); continue; }
        const item = itemMap.get(row.scope_item_id);
        const { snap } = approvedSnapshot(item, ctx.laborByItem.get(item.id) || []);
        const v = buildBaselineValues({ item, snap, groupNames: ctx.groupNames, catName: ctx.catName.get(item.category_id), grpName: ctx.grpName.get(item.group_id), request });
        const mine = await db.ScopeEstimateBaseline.create({
          ...v, baseline_key: keyFor(item.id), scope_item_id: item.id, request_id: request.id, project_id: project.id, task_id: taskId,
          baseline_version: 1, source: 'backfill', fingerprint_match: !(row.reasons || []).some((r) => r === 'no_approval_fingerprint' || r === 'edited_since_approval'),
          ambiguity_reasons: row.reasons || [], reconciliation_note: note, scope_confirmation_revision: ctx.confRevisionFor(item.id),
          captured_by_email: user.email, captured_at: new Date().toISOString(),
        });
        const all = await resolveWinner(db, item.id);
        if (all[0].id !== mine.id) { await db.ScopeEstimateBaseline.delete(mine.id); results.push({ scope_item_id: item.id, status: 'skipped', reason: 'concurrent_backfill' }); continue; }
        results.push({ scope_item_id: item.id, status: 'created', baseline_id: mine.id, task_id: taskId });
      }
      return Response.json({ results, created: results.filter((r) => r.status === 'created').length });
    }

    // ── TASK SUMMARY (read-only) ──
    if (action === 'task_summary') {
      const task = await one('Task', body.taskId);
      if (!task) return err(404, 'Task not found.');
      const baselines = (await db.ScopeEstimateBaseline.filter({ task_id: task.id }, { sort: 'created_date', limit: 20 })).items.filter((b) => b.project_id === task.project_id);
      if (!baselines.length) return Response.json({ baselines: [] });
      const project = await one('Project', task.project_id);
      const fin = (await taskFinancials(db, [task.id], project))[task.id];
      const serviceCount = (await db.ServiceCommitment.filter({ project_id: task.project_id }, { limit: 200, fields: ['status'] })).items.length;
      return Response.json({ baselines, financials: fin, services: { project_service_count: serviceCount, attributable_to_task: false } });
    }

    // ── REQUEST RECONCILIATION (read-only) ──
    if (action === 'request_reconciliation') {
      const { request, project, error } = await loadRequest();
      if (error) return error;
      const ctx = await loadRequestContext(db, request);
      const winners = [...ctx.baselineByItem.values()];
      const fin = winners.length ? await taskFinancials(db, winners.map((b) => b.task_id), project) : {};
      const rows = winners.map((b) => ({
        baseline_id: b.id, scope_item_id: b.scope_item_id, task_id: b.task_id, title: b.title, category_name: b.category_name, group_name: b.group_name,
        source: b.source, fingerprint_match: b.fingerprint_match, pricing_model: b.pricing_model,
        hard_cost_min: b.hard_cost_min, hard_cost_max: b.hard_cost_max, hard_cost_tbd: b.hard_cost_tbd,
        labor_hours_min: b.labor_hours_min, labor_hours_max: b.labor_hours_max, labor_dollars_min: b.labor_dollars_min, labor_dollars_max: b.labor_dollars_max,
        task_found: !!fin[b.task_id], parts: fin[b.task_id]?.parts ? { link_count: fin[b.task_id].parts.link_count, committed_cost: fin[b.task_id].parts.committed_cost, actual_cost: fin[b.task_id].parts.actual_cost, planned_retail: fin[b.task_id].parts.planned_retail, billed: fin[b.task_id].parts.billed } : null,
        labor: fin[b.task_id]?.labor || null,
      }));
      const approved = ctx.items.filter((i) => i.decision_status === 'approved');
      return Response.json({
        request: { id: request.id, title: request.title }, rows,
        coverage: {
          approved_items: approved.length,
          baselined: winners.length,
          converted_without_baseline: ctx.items.filter((i) => (i.linked_task_ids || []).length && !ctx.baselineByItem.has(i.id)).length,
          approved_not_converted: approved.filter((i) => !(i.linked_task_ids || []).length).length,
          duplicate_baseline_records: ctx.baselines.length - winners.length,
        },
        estimate_billing: { enabled: false, reason: 'Estimate-based client billing is disabled until canonical coverage reconciliation is verified.' },
      });
    }

    return err(400, 'Unknown action.');
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});