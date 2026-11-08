import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// getScopeFundingReconciliation — ADMIN-ONLY, READ-ONLY. Never writes.
// Compares the Approved Scope Budget (from getApprovedScopeBudget, the single source for approved values)
// with what is actually linked to each converted scope task. Attribution is EXPLICIT ONLY:
//   scope item → its converted task (ScopeEstimateBaseline.task_id) → TaskPartLink → PartCommitment → PO lines.
// No name/part matching is ever inferred. A commitment counts toward a scope item only when every
// TaskPartLink for it points at that one scope task; otherwise it is reported as unattributed with a reason.
// Each commitment is counted once (attributed XOR unattributed), so totals reconcile to the project.
// Nothing here is billable, invoice eligible or summed into canonical financial totals.

const r2 = (n) => Math.round(n * 100) / 100;
const isId = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(v);
const METRICS = ['planned_cost', 'po_committed_cost', 'received_cost', 'external_received_cost', 'vendor_invoiced_cost', 'planned_retail', 'client_invoiced'];

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
  const chunks = [];
  for (let i = 0; i < uniq.length; i += 100) chunks.push(uniq.slice(i, i + 100));
  const out = [];
  for (let i = 0; i < chunks.length; i += 6) {
    const res = await Promise.all(chunks.slice(i, i + 6).map((c) => listAll(E, { [field]: { $in: c } }, opts)));
    res.forEach((r) => out.push(...r));
  }
  return out;
}
const groupBy = (arr, key) => arr.reduce((m, x) => { const k = x[key]; if (k) { if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }, new Map());

// Metric accumulator: known total + count of contributing records whose value is unknown.
const emptyAcc = () => Object.fromEntries(METRICS.map((k) => [k, { known: 0, unknown: 0 }]));
function addAcc(acc, vals) {
  for (const k of METRICS) {
    const v = vals[k];
    if (v && typeof v === 'object') { acc[k].known = r2(acc[k].known + v.known); acc[k].unknown += v.unknown; }
    else if (v == null) acc[k].unknown++;
    else acc[k].known = r2(acc[k].known + v);
  }
  return acc;
}

function commitmentMetrics(c, poLines, orders, viLinesByPo, viById, externals) {
  const effQty = Math.max((Number(c.required_total) || 0) - (Number(c.qty_removed) || 0), 0);
  const po = { known: 0, unknown: 0 }, rec = { known: 0, unknown: 0 }, vi = { known: 0, unknown: 0 }, ext = { known: 0, unknown: 0 };
  const lines = [];
  // PO lines can order more than this commitment needs (extra goes to stock). Only quantity up to the
  // commitment's effective qty is counted here; the rest is reported as excess, never attributed.
  let ordLeft = effQty, recLeft = effQty, excessQty = 0;
  for (const l of poLines) {
    const o = orders.get(l.order_id);
    if (l.status === 'Cancelled' || o?.status === 'Cancelled') continue;
    const qo = Number(l.qty_ordered) || 0, qr = Number(l.qty_received) || 0;
    const takeO = Math.min(qo, ordLeft), takeR = Math.min(qr, recLeft);
    ordLeft -= takeO; recLeft -= takeR; excessQty += qo - takeO;
    const unit = l.unit_cost ?? null, landed = l.effective_unit_cost ?? l.unit_cost ?? null;
    if (takeO > 0) { if (unit == null) po.unknown++; else po.known = r2(po.known + unit * takeO); }
    if (takeR > 0) { if (landed == null) rec.unknown++; else rec.known = r2(rec.known + landed * takeR); }
    for (const v of viLinesByPo.get(l.id) || []) {
      const inv = viById.get(v.invoice_id);
      if (!inv || inv.invoice_status === 'draft') continue;
      if (v.extended_cost == null) vi.unknown++; else vi.known = r2(vi.known + Number(v.extended_cost));
    }
    lines.push({ id: l.id, po_number: o?.po_number || null, order_status: o?.status || null, line_status: l.status, qty_ordered: qo, qty_received: qr, qty_counted: takeO, unit_cost: unit, landed_unit_cost: landed });
  }
  for (const e of externals) {
    if (e.status === 'cancelled') continue;
    const qr = Number(e.qty_received) || 0;
    if (qr > 0) { if (e.unit_cost == null) ext.unknown++; else ext.known = r2(ext.known + e.unit_cost * qr); }
  }
  return {
    effective_qty: effQty,
    values: {
      planned_cost: c.unit_cost_snapshot != null ? r2(c.unit_cost_snapshot * effQty) : null,
      po_committed_cost: po, received_cost: rec, external_received_cost: ext, vendor_invoiced_cost: vi,
      planned_retail: c.unit_retail_snapshot != null ? r2(c.unit_retail_snapshot * effQty) : null,
      client_invoiced: r2(Number(c.invoiced_amount) || 0),
    },
    po_lines: lines,
    po_excess_qty: excessQty,
  };
}

// Variance vs approved allowance — only when both sides are fully known.
function variance(item, acc, hasParts) {
  if (item.pricing_model !== 'hard_cost_plus_labor') return { state: 'legacy_unsplit' };
  if (item.hard_cost_state === 'tbd') return { state: 'allowance_tbd' };
  if (!item.hard_cost) return { state: 'allowance_not_estimated' };
  if (!hasParts) return { state: 'no_linked_parts' };
  const cmp = (m) => (acc[m].unknown ? { state: 'incomplete', unknown: acc[m].unknown } : cmp2(item.hard_cost, acc[m].known));
  const recUnknown = acc.received_cost.unknown + acc.external_received_cost.unknown;
  const actual = recUnknown ? { state: 'incomplete', unknown: recUnknown } : cmp2(item.hard_cost, r2(acc.received_cost.known + acc.external_received_cost.known));
  return { state: 'compared', planned: cmp('planned_cost'), committed: cmp('po_committed_cost'), actual_received: actual };
}
function cmp2({ min, max }, v) {
  if (v > max) return { state: 'over', amount: r2(v - max), value: v };
  if (v < min) return { state: 'under', amount: r2(min - v), value: v };
  return { state: 'within', amount: 0, value: v };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    if (body.self_test === true) return Response.json(runSelfTest());
    const { project_id } = body;
    if (!isId(project_id)) return Response.json({ error: 'project_id is required' }, { status: 400 });
    const db = base44.asServiceRole.entities;
    const project = (await db.Project.filter({ id: project_id }, { limit: 1 }).catch((e) => (e.status === 400 || e.status === 404 ? { items: [] } : Promise.reject(e)))).items[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const budgetRes = await base44.functions.invoke('getApprovedScopeBudget', { project_id });
    const budget = budgetRes.data;
    if (!budget?.success) return Response.json({ error: budget?.error || 'Approved scope budget unavailable' }, { status: 502 });

    const [tasks, entries, statuses, commitments, services, invoices] = await Promise.all([
      listAll(db.Task, { project_id }, { fields: ['name', 'project_id', 'status_id', 'estimated_hours', 'labor_billing_type', 'labor_rate_override'] }),
      listAll(db.TaskTimeEntry, { project_id }, { fields: ['task_id', 'hours'] }),
      listAll(db.StatusList, { scope: 'Task' }, { fields: ['label'] }),
      listAll(db.PartCommitment, { project_id }),
      listAll(db.ServiceCommitment, { project_id }, { fields: ['description', 'service_id', 'status', 'is_billed', 'planned_cost', 'total_billable', 'invoice_id'] }),
      listAll(db.ProjectInvoice, { project_id }, { fields: ['status', 'total', 'paid_amount', 'invoice_type'] }),
    ]);
    const items = budget.reviews.flatMap((r) => r.categories.flatMap((c) => c.groups.flatMap((g) => g.items.map((i) => ({ ...i, category_name: c.name, group_name: g.name, review_title: r.title })))));
    const scopeTaskIds = items.filter((i) => i.task_id).map((i) => i.task_id);
    const commitIds = commitments.map((c) => c.id);

    const [linksByCommit, linksByTask, poLines, externals] = await Promise.all([
      inChunks(db.TaskPartLink, 'commitment_id', commitIds, { fields: ['task_id', 'commitment_id', 'part_id', 'qty_allocated', 'project_id'] }),
      inChunks(db.TaskPartLink, 'task_id', scopeTaskIds, { fields: ['task_id', 'commitment_id', 'part_id', 'qty_allocated', 'project_id'] }),
      inChunks(db.PartPurchaseLineItem, 'commitment_id', commitIds),
      inChunks(db.ExternalInbound, 'commitment_id', commitIds, { fields: ['commitment_id', 'qty_received', 'unit_cost', 'status'] }),
    ]);
    const allLinks = [...new Map([...linksByCommit, ...linksByTask].map((l) => [l.id, l])).values()];
    const [orders, viLines, parts] = await Promise.all([
      inChunks(db.Order, 'id', poLines.map((l) => l.order_id), { fields: ['po_number', 'status'] }),
      inChunks(db.VendorInvoiceLineItem, 'purchase_line_item_id', poLines.map((l) => l.id), { fields: ['purchase_line_item_id', 'invoice_id', 'extended_cost'] }),
      inChunks(db.Part, 'id', [...commitments.map((c) => c.part_id), ...allLinks.map((l) => l.part_id)], { fields: ['part_name', 'vendor_part_number', 'part_number'] }),
    ]);
    const vInvoices = await inChunks(db.VendorInvoice, 'id', viLines.map((v) => v.invoice_id), { fields: ['invoice_status'] });

    const orphanPoLines = await db.PartPurchaseLineItem.count({ $or: [{ commitment_id: null }, { commitment_id: { $exists: false } }, { commitment_id: '' }] }).catch(() => null);
    return Response.json(computeReconciliation({ project, project_id, budget, tasks, entries, statuses, commitments, services, invoices, linksByCommit, linksByTask, poLines, externals, orders, viLines, parts, vInvoices, orphanPoLines }));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Pure calculation over already-loaded records (no I/O) — exercised by self_test with fixtures.
function computeReconciliation(d) {
    const { project, project_id, budget, tasks, entries, statuses, commitments, services, invoices, linksByCommit, linksByTask, poLines, externals, orders, viLines, parts, vInvoices, orphanPoLines } = d;
    const items = budget.reviews.flatMap((r) => r.categories.flatMap((c) => c.groups.flatMap((g) => g.items.map((i) => ({ ...i, category_name: c.name, group_name: g.name, review_title: r.title })))));
    const scopeTaskIds = items.filter((i) => i.task_id).map((i) => i.task_id);
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const viById = new Map(vInvoices.map((v) => [v.id, v]));
    const viByPo = groupBy(viLines, 'purchase_line_item_id');
    const poByCommit = groupBy(poLines, 'commitment_id');
    const extByCommit = groupBy(externals, 'commitment_id');
    const partById = new Map(parts.map((p) => [p.id, p]));
    const commitById = new Map(commitments.map((c) => [c.id, c]));
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const statusLabel = new Map(statuses.map((s) => [s.id, (s.label || '').toLowerCase().trim()]));
    const itemsByTask = groupBy(items.filter((i) => i.task_id), 'task_id');
    const tasksByCommit = new Map();
    linksByCommit.forEach((l) => { if (!tasksByCommit.has(l.commitment_id)) tasksByCommit.set(l.commitment_id, new Set()); tasksByCommit.get(l.commitment_id).add(l.task_id); });
    const hoursByTask = entries.reduce((m, e) => (e.task_id ? m.set(e.task_id, (m.get(e.task_id) || 0) + (Number(e.hours) || 0)) : m), new Map());

    // ── Attribute each active commitment exactly once ──
    const attributed = new Map(); // scope_item_id -> [commitment rows]
    const unattributed = [];
    let cancelledExcluded = 0;
    const projectAcc = emptyAcc();
    for (const c of commitments) {
      if (c.commitment_status === 'cancelled' || c.cancelled_at) { cancelledExcluded++; continue; }
      const m = commitmentMetrics(c, poByCommit.get(c.id) || [], orderById, viByPo, viById, extByCommit.get(c.id) || []);
      const p = partById.get(c.part_id);
      const row = { commitment_id: c.id, part_id: c.part_id, part_name: p?.part_name || 'Part', part_number: p?.vendor_part_number || p?.part_number || '', supply_source_type: c.supply_source_type || null, billing_status: c.billing_status || 'unbilled', effective_qty: m.effective_qty, ...m.values, po_lines: m.po_lines, po_excess_qty: m.po_excess_qty };
      addAcc(projectAcc, m.values);
      const ts = [...(tasksByCommit.get(c.id) || [])];
      let reason = null, itemId = null;
      if (!ts.length) reason = 'no_task_link';
      else if (ts.length > 1) reason = 'shared_across_tasks';
      else if (!itemsByTask.has(ts[0])) reason = 'linked_to_non_scope_task';
      else if (itemsByTask.get(ts[0]).length > 1) reason = 'task_shared_by_scope_items';
      else itemId = itemsByTask.get(ts[0])[0].scope_item_id;
      if (itemId) { if (!attributed.has(itemId)) attributed.set(itemId, []); attributed.get(itemId).push(row); }
      else unattributed.push({ ...row, reason, task_ids: ts, task_names: ts.map((id) => taskById.get(id)?.name || null) });
    }

    // ── Per scope item ──
    const outItems = items.map((i) => {
      const t = i.task_id ? taskById.get(i.task_id) : null;
      const state = !i.converted ? 'unassigned_not_converted' : !t ? 'task_missing' : 'converted';
      const rows = attributed.get(i.scope_item_id) || [];
      const acc = rows.reduce((a, r) => addAcc(a, r), emptyAcc());
      let labor_projection = null;
      if (t) {
        const lbl = statusLabel.get(t.status_id);
        const done = ['done', 'completed', 'complete'].includes(lbl), cancelled = ['cancelled', 'canceled'].includes(lbl);
        const logged = r2(hoursByTask.get(t.id) || 0), est = t.estimated_hours > 0 ? t.estimated_hours : null;
        const projected = cancelled ? logged : done ? logged : est != null ? Math.max(est, logged) : null;
        const rate = t.labor_rate_override ?? project.labor_billing_rate ?? null;
        labor_projection = { task_status: lbl || null, done, cancelled, estimated_hours: est, logged_hours: logged, projected_hours: projected == null ? null : r2(projected), effective_rate: rate, rate_source: t.labor_rate_override != null ? 'task_override' : project.labor_billing_rate != null ? 'project' : null, billing_type: t.labor_billing_type || 'UNCLASSIFIED', projected_value_at_rate: projected != null && rate != null ? r2(projected * rate) : null };
      }
      const taskLinksNoCommit = t ? linksByTask.filter((l) => l.task_id === t.id && (!l.commitment_id || !commitById.has(l.commitment_id))).length : 0;
      return {
        scope_item_id: i.scope_item_id, request_id: i.request_id, review_title: i.review_title, category_id: i.category_id, category_name: i.category_name, group_id: i.group_id, group_name: i.group_name,
        title: i.title, state, task_id: i.task_id || null, task_name: t?.name || null, provenance: i.provenance,
        approved: { pricing_model: i.pricing_model, hard_cost: i.hard_cost, hard_cost_state: i.hard_cost_state, legacy_budget: i.legacy_budget, legacy_state: i.legacy_state, labor_hours: i.labor_hours, labor_dollars: i.labor_dollars, labor_lines: i.labor_lines },
        labor_projection, parts: rows, parts_totals: acc, task_links_without_project_commitment: taskLinksNoCommit,
        variance: variance(i, acc, rows.length > 0),
      };
    });

    // ── Tree: category → group → items (canonical order preserved from the budget) ──
    const byItem = new Map(outItems.map((x) => [x.scope_item_id, x]));
    const sumItems = (xs) => xs.reduce((a, x) => addAcc(a, x.parts_totals), emptyAcc());
    const tree = budget.reviews.map((r) => ({ request_id: r.request_id, title: r.title, approved: r.totals, categories: r.categories.map((c) => ({ id: c.id, name: c.name, approved: c.totals, groups: c.groups.map((g) => { const xs = g.items.map((i) => byItem.get(i.scope_item_id)); return { id: g.id, name: g.name, approved: g.totals, parts_totals: sumItems(xs), items: xs }; }) })).map((c) => ({ ...c, parts_totals: sumItems(c.groups.flatMap((g) => g.items)) })) }));

    const attributedAcc = sumItems(outItems);
    const unattributedAcc = unattributed.reduce((a, r) => addAcc(a, r), emptyAcc());
    const reconciles = METRICS.every((k) => r2(attributedAcc[k].known + unattributedAcc[k].known) === projectAcc[k].known && attributedAcc[k].unknown + unattributedAcc[k].unknown === projectAcc[k].unknown);
    const unattrByReason = unattributed.reduce((m, r) => { (m[r.reason] = m[r.reason] || emptyAcc()); addAcc(m[r.reason], r); return m; }, {});
    const unattrCount = unattributed.reduce((m, r) => ((m[r.reason] = (m[r.reason] || 0) + 1), m), {});

    // Labor outside converted scope tasks (logged hours only; never priced here)
    const scopeSet = new Set(scopeTaskIds);
    const nonScopeHours = r2(entries.filter((e) => !e.task_id || !scopeSet.has(e.task_id)).reduce((s, e) => s + (Number(e.hours) || 0), 0));
    const proj = outItems.filter((x) => x.labor_projection);

    // Unmatched purchasing records
    const activeIds = new Set(commitments.filter((c) => !(c.commitment_status === 'cancelled' || c.cancelled_at)).map((c) => c.id));
    const poOnCancelled = poLines.filter((l) => !activeIds.has(l.commitment_id) && l.status !== 'Cancelled' && orderById.get(l.order_id)?.status !== 'Cancelled');
    const crossProjectLinks = linksByTask.filter((l) => l.commitment_id && !commitById.has(l.commitment_id));
    const linksNoCommit = linksByTask.filter((l) => !l.commitment_id);

    // Funding actuals (canonical invoices, read only). Separate from any planned funding.
    const live = invoices.filter((v) => ['sent', 'partial', 'paid', 'overdue'].includes(v.status));
    const drafts = invoices.filter((v) => v.status === 'draft');

    return {
      success: true, read_only: true, invoice_eligible: false, billing_enabled: false,
      project_id, generated_at: new Date().toISOString(),
      approved_totals: budget.totals, approved_rates: budget.rates, excluded_from_budget: budget.excluded,
      tree,
      totals: {
        attributed: attributedAcc, unattributed: unattributedAcc, project: projectAcc, reconciles,
        cancelled_commitments_excluded: cancelledExcluded, attributed_commitments: outItems.reduce((s, x) => s + x.parts.length, 0), unattributed_commitments: unattributed.length,
        items_by_state: outItems.reduce((m, x) => ((m[x.state] = (m[x.state] || 0) + 1), m), {}),
        labor: { approved_hours: budget.totals.labor_hours, approved_value: budget.totals.labor_dollars, scope_task_logged_hours: r2(proj.reduce((s, x) => s + x.labor_projection.logged_hours, 0)), scope_task_projected_hours: r2(proj.reduce((s, x) => s + (x.labor_projection.projected_hours || 0), 0)), scope_tasks_without_projection: proj.filter((x) => x.labor_projection.projected_hours == null).length, non_scope_logged_hours: nonScopeHours },
      },
      unattributed: { commitments: unattributed, by_reason: unattrByReason, count_by_reason: unattrCount, services: services.map((s) => ({ id: s.id, description: s.description || 'Service', status: s.status, is_billed: !!s.is_billed, planned_cost: s.planned_cost ?? null, total_billable: s.total_billable ?? null })), services_reason: 'Services have no task link in the data model, so they cannot be attributed to a scope item.' },
      unmatched_purchasing: {
        po_lines_on_cancelled_commitments: poOnCancelled.map((l) => ({ id: l.id, po_number: orderById.get(l.order_id)?.po_number || null, commitment_id: l.commitment_id, qty_ordered: l.qty_ordered, unit_cost: l.unit_cost ?? null })),
        scope_task_links_to_other_project_commitments: crossProjectLinks.map((l) => ({ id: l.id, task_id: l.task_id, commitment_id: l.commitment_id })),
        scope_task_links_without_commitment: linksNoCommit.map((l) => ({ id: l.id, task_id: l.task_id, part_id: l.part_id, part_name: partById.get(l.part_id)?.part_name || null })),
        po_quantity_beyond_commitment: [...[...attributed.values()].flat(), ...unattributed].filter((r) => r.po_excess_qty > 0).map((r) => ({ commitment_id: r.commitment_id, part_name: r.part_name, effective_qty: r.effective_qty, excess_qty: r.po_excess_qty, po_numbers: [...new Set(r.po_lines.map((l) => l.po_number).filter(Boolean))] })),
        global_po_lines_without_commitment: orphanPoLines,
        note: 'PO lines without a commitment carry no project reference, so they cannot be attributed to any project.',
      },
      funding_actuals: { invoiced_total: r2(live.reduce((s, v) => s + (Number(v.total) || 0), 0)), received_total: r2(live.reduce((s, v) => s + (Number(v.paid_amount) || 0), 0)), live_invoices: live.length, draft_invoices: drafts.length, draft_total: r2(drafts.reduce((s, v) => s + (Number(v.total) || 0), 0)) },
    };
}

// ───────────── Fixture self-test (in-memory only, no database access) ─────────────
function runSelfTest() {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, pass: !!ok, ...(ok ? {} : { detail }) });
  const it = (id, task_id, hc, extra = {}) => ({ scope_item_id: id, request_id: 'R1', category_id: 'C1', group_id: 'G1', title: id, converted: !!task_id, task_id, pricing_model: 'hard_cost_plus_labor', hard_cost: hc, hard_cost_state: hc ? 'estimated' : 'not_estimated', labor_hours: { min: 2, max: 3 }, labor_dollars: { min: 250, max: 375 }, labor_lines: [], provenance: {}, ...extra });
  const items = [it('I1', 'T1', { min: 100, max: 150 }), it('I2', 'T2', { min: 50, max: 60 }), it('I3', null, { min: 10, max: 20 }), it('I4', 'T4', null, { hard_cost_state: 'tbd' }), it('I5', 'TX', { min: 1, max: 2 })];
  const budget = { success: true, totals: { labor_hours: { min: 10, max: 15 }, labor_dollars: { min: 1, max: 2 } }, rates: [], excluded: [], reviews: [{ request_id: 'R1', title: 'Scope', totals: {}, categories: [{ id: 'C1', name: 'Cat', totals: {}, groups: [{ id: 'G1', name: 'Grp', totals: {}, items }] }] }] };
  const c = (id, unit, retail, qty, extra = {}) => ({ id, part_id: 'P' + id, required_total: qty, qty_removed: 0, unit_cost_snapshot: unit, unit_retail_snapshot: retail, invoiced_amount: 0, ...extra });
  const commitments = [
    c('A', 40, 60, 3),                     // exclusive to T1
    c('B', 10, 15, 1),                     // shared T1 + T3
    c('C', null, 20, 2),                   // exclusive to T2, unknown cost
    c('D', 5, 8, 4),                       // no task link
    c('E', 7, 9, 1, { commitment_status: 'cancelled' }), // cancelled → excluded
    c('F', 30, 45, 1),                     // linked to non-scope task T3
    c('G', 2, 3, 5, { qty_removed: 2 }),   // exclusive to T1, effective qty 3
  ];
  const L = (id, task_id, commitment_id) => ({ id, task_id, commitment_id, part_id: 'P' + commitment_id, qty_allocated: 1 });
  const linksByCommit = [L('l1', 'T1', 'A'), L('l1b', 'T1', 'A'), L('l2', 'T1', 'B'), L('l3', 'T3', 'B'), L('l4', 'T2', 'C'), L('l5', 'T3', 'F'), L('l6', 'T1', 'G')];
  const linksByTask = [...linksByCommit.filter((l) => ['T1', 'T2'].includes(l.task_id)), { id: 'l7', task_id: 'T2', commitment_id: null, part_id: 'PZ' }, { id: 'l8', task_id: 'T1', commitment_id: 'OTHER', part_id: 'PO' }];
  const poLines = [
    { id: 'pl1', order_id: 'O1', commitment_id: 'A', status: 'Received', qty_ordered: 3, qty_received: 3, unit_cost: 42, effective_unit_cost: 45 },
    { id: 'pl2', order_id: 'O2', commitment_id: 'A', status: 'Ordered', qty_ordered: 1, qty_received: 0, unit_cost: 42 }, // cancelled order → skipped
    { id: 'pl3', order_id: 'O1', commitment_id: 'E', status: 'Ordered', qty_ordered: 1, qty_received: 0, unit_cost: 7 },  // on cancelled commitment
    { id: 'pl4', order_id: 'O1', commitment_id: 'C', status: 'Partial', qty_ordered: 2, qty_received: 1, unit_cost: null },
    { id: 'pl5', order_id: 'O1', commitment_id: 'D', status: 'Partial', qty_ordered: 6, qty_received: 3, unit_cost: 5 }, // D needs 4: 2 extra
    { id: 'pl6', order_id: 'O1', commitment_id: 'D', status: 'Partial', qty_ordered: 0, qty_received: 0, unit_cost: 5 },
  ];
  const orders = [{ id: 'O1', po_number: 'PO-1', status: 'Partial' }, { id: 'O2', po_number: 'PO-2', status: 'Cancelled' }];
  const viLines = [{ id: 'v1', purchase_line_item_id: 'pl1', invoice_id: 'VI1', extended_cost: 130 }, { id: 'v2', purchase_line_item_id: 'pl1', invoice_id: 'VI2', extended_cost: 999 }];
  const vInvoices = [{ id: 'VI1', invoice_status: 'approved' }, { id: 'VI2', invoice_status: 'draft' }];
  const externals = [{ id: 'x1', commitment_id: 'G', qty_received: 3, unit_cost: 2, status: 'received' }, { id: 'x2', commitment_id: 'G', qty_received: 1, unit_cost: 100, status: 'cancelled' }];
  const tasks = [{ id: 'T1', name: 'Task 1', status_id: 'S1', estimated_hours: 4 }, { id: 'T2', name: 'Task 2', status_id: 'S2', estimated_hours: null }, { id: 'T3', name: 'Other', status_id: 'S1' }, { id: 'T4', name: 'Task 4', status_id: 'S1', estimated_hours: 2, labor_rate_override: 200 }];
  const entries = [{ task_id: 'T1', hours: 5 }, { task_id: 'T2', hours: 1 }, { task_id: 'T3', hours: 2 }, { task_id: null, hours: 0.5 }];
  const statuses = [{ id: 'S1', label: 'To Do' }, { id: 'S2', label: 'Done' }];
  const invoices = [{ status: 'paid', total: 500, paid_amount: 500 }, { status: 'sent', total: 200, paid_amount: 0 }, { status: 'draft', total: 300 }, { status: 'void', total: 999 }];
  const out = computeReconciliation({ project: { labor_billing_rate: 100 }, project_id: 'PRJ', budget, tasks, entries, statuses, commitments, services: [{ id: 's1', planned_cost: 80 }], invoices, linksByCommit, linksByTask, poLines, externals, orders, viLines, parts: [{ id: 'PA', part_name: 'Pad' }], vInvoices, orphanPoLines: 0 });
  const flat = out.tree[0].categories[0].groups[0].items;
  const get = (id) => flat.find((x) => x.scope_item_id === id);
  const I1 = get('I1'), I2 = get('I2'), I3 = get('I3'), I4 = get('I4'), I5 = get('I5');
  check('exclusive commitments attributed once (duplicate links deduped)', I1.parts.map((p) => p.commitment_id).sort().join() === 'A,G', I1.parts.map((p) => p.commitment_id));
  check('planned cost uses effective qty (required - removed)', I1.parts_totals.planned_cost.known === 126 && I1.parts_totals.planned_cost.unknown === 0, I1.parts_totals.planned_cost);
  check('cancelled PO order skipped in committed cost', I1.parts_totals.po_committed_cost.known === 126 - 0 + 0 && I1.parts.find((p) => p.commitment_id === 'A').po_committed_cost.known === 126, I1.parts);
  check('received uses landed unit cost', I1.parts_totals.received_cost.known === 135, I1.parts_totals.received_cost);
  check('vendor invoiced ignores draft vendor invoices', I1.parts_totals.vendor_invoiced_cost.known === 130, I1.parts_totals.vendor_invoiced_cost);
  check('non-PO received excludes cancelled inbound', I1.parts_totals.external_received_cost.known === 6, I1.parts_totals.external_received_cost);
  check('retail kept separate from cost', I1.parts_totals.planned_retail.known === 189, I1.parts_totals.planned_retail);
  check('variance planned within allowance', I1.variance.planned.state === 'within', I1.variance);
  check('variance actual = PO received + non-PO received (141) within 100-150', I1.variance.actual_received.state === 'within' && I1.variance.actual_received.value === 141, I1.variance.actual_received);
  check('unknown cost makes variance incomplete, not zero', I2.variance.planned.state === 'incomplete' && I2.parts_totals.planned_cost.unknown === 1, I2.variance);
  check('unconverted approved item kept as unassigned', I3?.state === 'unassigned_not_converted' && I3.parts.length === 0);
  check('TBD allowance not compared', I4.variance.state === 'allowance_tbd');
  check('converted item with missing task flagged', I5.state === 'task_missing');
  const reasons = Object.fromEntries(out.unattributed.commitments.map((u) => [u.commitment_id, u.reason]));
  check('unattributed reasons explicit', reasons.B === 'shared_across_tasks' && reasons.D === 'no_task_link' && reasons.F === 'linked_to_non_scope_task' && !reasons.E, reasons);
  check('cancelled commitment excluded and counted', out.totals.cancelled_commitments_excluded === 1);
  check('attributed + unattributed reconciles to project', out.totals.reconciles === true, out.totals);
  check('project planned cost = sum of active commitments', out.totals.project.planned_cost.known === 120 + 10 + 20 + 30 + 6 && out.totals.project.planned_cost.unknown === 1, out.totals.project.planned_cost);
  check('PO line on cancelled commitment reported unmatched', out.unmatched_purchasing.po_lines_on_cancelled_commitments.map((l) => l.id).join() === 'pl3');
  check('task links without/foreign commitment reported', out.unmatched_purchasing.scope_task_links_without_commitment.length === 1 && out.unmatched_purchasing.scope_task_links_to_other_project_commitments.length === 1);
  check('labor projection: open task uses max(est, logged) at project rate', I1.labor_projection.projected_hours === 5 && I1.labor_projection.projected_value_at_rate === 500, I1.labor_projection);
  check('labor projection: done task uses logged; no estimate still projects logged', I2.labor_projection.projected_hours === 1);
  check('labor projection: task rate override wins', I4.labor_projection.effective_rate === 200 && I4.labor_projection.rate_source === 'task_override');
  check('non-scope logged hours separate', out.totals.labor.non_scope_logged_hours === 2.5, out.totals.labor);
  check('funding actuals exclude drafts and void', out.funding_actuals.invoiced_total === 700 && out.funding_actuals.received_total === 500 && out.funding_actuals.draft_total === 300, out.funding_actuals);
  const D = out.unattributed.commitments.find((u) => u.commitment_id === 'D');
  check('PO quantity beyond commitment not counted, reported as excess', D.po_committed_cost.known === 20 && D.received_cost.known === 15 && D.po_excess_qty === 2 && out.unmatched_purchasing.po_quantity_beyond_commitment.some((x) => x.commitment_id === 'D' && x.excess_qty === 2), { D, ex: out.unmatched_purchasing.po_quantity_beyond_commitment });
  check('services reported unattributed', out.unattributed.services.length === 1);
  check('never billing enabled', out.billing_enabled === false && out.invoice_eligible === false);
  return { self_test: true, passed: results.filter((r) => r.pass).length, total: results.length, results };
}