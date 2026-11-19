import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/*
 * ═══════════════════════════════════════════════════════════════
 * ⚠️  BILLING LOGIC CONTRACT
 *
 * computeItems() MUST be identical across:
 *   1. functions/computeBillableItemsCore  (CANONICAL SOURCE)
 *   2. functions/resolveProjectBillableItems  ← YOU ARE HERE
 *   3. functions/getProjectsBillingSummary
 *
 * If you change logic:
 *   1. Update computeItems() in ALL 3 files
 *   2. Bump BILLING_LOGIC_VERSION
 *   3. Update EXPECTED_OUTPUT in TEST_VECTOR if behavior changed
 * ═══════════════════════════════════════════════════════════════
 */

// ── Phase 4: Version lock ──
const BILLING_LOGIC_VERSION = "v1.0";

// ── Phase 1+2: Deterministic test vector with expected output ──
// Includes core cases + edge cases for removed, over-invoiced, billed, zero-value
const TEST_VECTOR = {
  partCommitments: [
    { id: "TV_P1", part_id: "TV_PART_1", required_total: 5, qty_removed: 1,
      invoiced_qty: 2, unit_retail_snapshot: 100, unit_cost_snapshot: 50 },
    { id: "TV_P_REMOVED", part_id: "TV_PART_2", required_total: 3, qty_removed: 3,
      invoiced_qty: 0, unit_retail_snapshot: 100, unit_cost_snapshot: 50 },
    { id: "TV_P_OVER", part_id: "TV_PART_3", required_total: 5, qty_removed: 0,
      invoiced_qty: 6, unit_retail_snapshot: 100, unit_cost_snapshot: 50 },
  ],
  serviceCommitments: [
    { id: "TV_S1", service_id: "TV_SVC_1", description: "Test Service",
      total_billable: 500, total_cost: 300, is_billed: false, status: "active", invoice_id: null },
    { id: "TV_S_STATUS", service_id: "TV_SVC_2", description: "Billed By Status",
      total_billable: 400, total_cost: 200, is_billed: false, status: "billed", invoice_id: null },
    { id: "TV_S_INVOICE", service_id: "TV_SVC_3", description: "Billed By Invoice",
      total_billable: 300, total_cost: 150, is_billed: false, status: "active", invoice_id: "inv_123" },
    { id: "TV_S_ZERO", service_id: "TV_SVC_4", description: "Zero Service",
      total_billable: 0, total_cost: 0, is_billed: false, status: "active", invoice_id: null },
  ],
  partMap: {
    "TV_PART_1": { part_name: "Test Part", requires_client_billing: true },
    "TV_PART_2": { part_name: "Removed Part", requires_client_billing: true },
    "TV_PART_3": { part_name: "Over Invoiced", requires_client_billing: true },
  },
  lookups: {},
};

const EXPECTED_OUTPUT = {
  item_count: 2,
  part: { id: "TV_P1", source_entity: "PartCommitment", qty_available_to_bill: 2, line_total: 200 },
  service: { id: "TV_S1", source_entity: "ServiceCommitment", qty_available_to_bill: 1, line_total: 500 },
  excluded_ids: ["TV_P_REMOVED", "TV_P_OVER", "TV_S_STATUS", "TV_S_INVOICE", "TV_S_ZERO"],
};

function validateTestVector(callerName) {
  const result = computeItems(TEST_VECTOR);
  const errs = [];
  if (result.items.length !== EXPECTED_OUTPUT.item_count)
    errs.push(`item_count: got ${result.items.length}, expected ${EXPECTED_OUTPUT.item_count}`);
  const part = result.items.find(i => i.id === EXPECTED_OUTPUT.part.id);
  const svc = result.items.find(i => i.id === EXPECTED_OUTPUT.service.id);
  if (!part) errs.push('valid part item (TV_P1) missing');
  else {
    if (part.source_entity !== EXPECTED_OUTPUT.part.source_entity)
      errs.push(`part.source_entity: got ${part.source_entity}, expected ${EXPECTED_OUTPUT.part.source_entity}`);
    if (part.qty_available_to_bill !== EXPECTED_OUTPUT.part.qty_available_to_bill)
      errs.push(`part.qty_available_to_bill: got ${part.qty_available_to_bill}, expected ${EXPECTED_OUTPUT.part.qty_available_to_bill}`);
    if (part.line_total !== EXPECTED_OUTPUT.part.line_total)
      errs.push(`part.line_total: got ${part.line_total}, expected ${EXPECTED_OUTPUT.part.line_total}`);
  }
  if (!svc) errs.push('valid service item (TV_S1) missing');
  else {
    if (svc.source_entity !== EXPECTED_OUTPUT.service.source_entity)
      errs.push(`svc.source_entity: got ${svc.source_entity}, expected ${EXPECTED_OUTPUT.service.source_entity}`);
    if (svc.qty_available_to_bill !== EXPECTED_OUTPUT.service.qty_available_to_bill)
      errs.push(`svc.qty_available_to_bill: got ${svc.qty_available_to_bill}, expected ${EXPECTED_OUTPUT.service.qty_available_to_bill}`);
    if (svc.line_total !== EXPECTED_OUTPUT.service.line_total)
      errs.push(`svc.line_total: got ${svc.line_total}, expected ${EXPECTED_OUTPUT.service.line_total}`);
  }
  for (const excludedId of EXPECTED_OUTPUT.excluded_ids) {
    const leaked = result.items.find(i => i.id === excludedId);
    if (leaked) errs.push(`EDGE CASE LEAK: ${excludedId} should be excluded but appeared in output`);
  }
  for (const item of result.items) {
    if (item.qty_available_to_bill < 0)
      errs.push(`INVARIANT: ${item.id} has negative qty_available_to_bill (${item.qty_available_to_bill})`);
    if (item.line_total < 0)
      errs.push(`INVARIANT: ${item.id} has negative line_total (${item.line_total})`);
  }
  const warns = [];
  if (errs.length > 0) {
    console.error(`🚨 CRITICAL: Billing logic edge case failure in ${callerName}!`, {
      caller: callerName,
      error_count: errs.length,
      failures: errs,
      test_vector_item_count: result.items.length,
      expected_item_count: EXPECTED_OUTPUT.item_count,
    });
  }
  return { ok: errs.length === 0, errors: errs, warnings: warns };
}

// ┌──────────────────────────────────────────────────────────────┐
// │  CANONICAL COMPUTE — v1.0 — COPY FROM computeBillableItemsCore │
// └──────────────────────────────────────────────────────────────┘
function computeItems({ partCommitments, serviceCommitments, partMap, lookups }) {
  const items = [];
  const warnings = [];
  const parts = partMap || {};
  const vendorLookup = lookups?.vendorMap || {};
  const categoryLookup = lookups?.categoryMap || {};
  const serviceLookup = lookups?.serviceMap || {};
  const serviceVendorLookup = lookups?.serviceVendorMap || {};

  for (const c of (partCommitments || [])) {
    if (c.cancelled_at || c.is_archived === true) continue;
    const part = parts[c.part_id];
    if (!part) continue;
    if (part.requires_client_billing === false) continue;
    if (part.part_type === 'WARRANTY_REPLACEMENT') continue;
    const requiredTotal = c.required_total ?? 0;
    const qtyRemoved = c.qty_removed ?? 0;
    const effectiveRequired = Math.max(0, requiredTotal - qtyRemoved);
    const invoicedQty = c.invoiced_qty ?? 0;
    const qtyAvailableToBill = Math.max(0, effectiveRequired - invoicedQty);
    if (qtyAvailableToBill <= 0) continue;
    const unitPrice = c.unit_retail_snapshot ?? 0;
    const unitCost = c.unit_cost_snapshot ?? 0;
    const lineTotal = qtyAvailableToBill * unitPrice;
    const costTotal = qtyAvailableToBill * unitCost;
    let needsReview = false;
    let reviewReason = null;
    if (unitPrice <= 0) {
      needsReview = true;
      reviewReason = 'MISSING_RETAIL: unit_retail_snapshot is 0 or missing.';
      warnings.push({ source_id: c.id, code: 'MISSING_RETAIL', message: reviewReason });
    }
    const vendor = part.default_vendor_id ? vendorLookup[part.default_vendor_id] : null;
    const category = part.part_category_id ? categoryLookup[part.part_category_id] : null;
    items.push({
      id: c.id, source_entity: 'PartCommitment', source_id: c.id, type: 'part',
      description: part.part_name || 'Unknown Part',
      part_id: c.part_id, part_name: part.part_name,
      part_number: part.vendor_part_number || null,
      vendor_id: part.default_vendor_id || null,
      vendor_name: vendor?.vendor_name || 'Unknown Vendor',
      category_id: part.part_category_id || null,
      category_name: category?.name || 'Uncategorized',
      required_total: requiredTotal, qty_removed: qtyRemoved,
      effective_required: effectiveRequired, invoiced_qty: invoicedQty,
      qty_available_to_bill: qtyAvailableToBill,
      unit_price: unitPrice, unit_cost: unitCost,
      line_total: lineTotal, cost_total: costTotal,
      already_billed_amount: c.invoiced_amount ?? 0,
      billing_locked: false, needs_review: needsReview, review_reason: reviewReason,
      metadata: { billing_status: c.billing_status, supply_source_type: c.supply_source_type },
    });
  }

  for (const sc of (serviceCommitments || [])) {
    const isServiceBilled = sc.is_billed === true || sc.status === 'billed' || !!sc.invoice_id;
    const totalBillable = sc.total_billable ?? 0;
    if (isServiceBilled || totalBillable <= 0) continue;
    const svc = serviceLookup[sc.service_id];
    const svcVendor = sc.vendor_id ? serviceVendorLookup[sc.vendor_id] : null;
    const effectiveCost = sc.total_cost ?? 0;
    items.push({
      id: sc.id, source_entity: 'ServiceCommitment', source_id: sc.id, type: 'service',
      description: sc.description || svc?.name || 'Unknown Service',
      part_id: null, part_name: null, part_number: null,
      service_id: sc.service_id, service_name: svc?.name || 'Unknown Service',
      vendor_id: sc.vendor_id || null, vendor_name: svcVendor?.name || null,
      category_id: null, category_name: svc?.name || 'Service',
      required_total: 1, qty_removed: 0, effective_required: 1, invoiced_qty: 0,
      qty_available_to_bill: 1,
      unit_price: totalBillable, unit_cost: effectiveCost,
      line_total: totalBillable, cost_total: effectiveCost,
      already_billed_amount: 0, billing_locked: false,
      needs_review: false, review_reason: null,
      metadata: { service_status: sc.status, service_commitment_id: sc.id },
    });
  }

  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'part' ? -1 : 1;
    return (a.description || '').localeCompare(b.description || '');
  });
  return { items, warnings };
}
// └──────────────────────────────────────────────────────────────┘

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

async function loadProjectLabor(base44, project_id) {
  const db = base44.asServiceRole.entities;
  const [projects, tasks, timeEntries, statuses, invoices] = await Promise.all([
    db.Project.filter({ id: project_id }),
    db.Task.filter({ project_id, labor_billing_type: 'BILLABLE' }, '-created_date', 5000),
    db.TaskTimeEntry.filter({ project_id }, '-created_date', 5000),
    db.StatusList.filter({ scope: 'Task' }),
    db.ProjectInvoice.filter({ project_id }),
  ]);
  const laborLines = invoices.length ? await db.ProjectInvoiceLine.filter({ invoice_id: { $in: invoices.map((i) => i.id) }, type: 'labor' }) : [];
  return computeLaborBilling({
    project: projects[0], tasks, timeEntries,
    statusLabelById: new Map(statuses.map((s) => [s.id, (s.label || '').toLowerCase().trim()])),
    invoiceStatusById: new Map(invoices.map((i) => [i.id, i.status])), laborLines,
  });
}

// Quantities already placed on ACTIVE drafts (status=draft) for a project, keyed by source id.
// Parts/labor: summed qty/hours. Services: 1 per draft that carries the service (child lines collapse to one).
async function loadDraftAllocations(db, project_id, excludeInvoiceId = null) {
  const drafts = (await db.ProjectInvoice.filter({ project_id, status: 'draft' })).filter((d) => d.id !== excludeInvoiceId);
  const lines = drafts.length ? await db.ProjectInvoiceLine.filter({ invoice_id: { $in: drafts.map((d) => d.id) } }, 'sort_order', 5000) : [];
  const qtyBySource = new Map(); const draftsBySource = new Map(); const svcSeen = new Set();
  for (const l of lines) {
    const sid = l.source_id || l.part_commitment_id;
    if (!sid || !['part', 'service', 'labor'].includes(l.type)) continue;
    if (!draftsBySource.has(sid)) draftsBySource.set(sid, new Set());
    draftsBySource.get(sid).add(l.invoice_id);
    if (l.type === 'service') { const k = `${l.invoice_id}:${sid}`; if (svcSeen.has(k)) continue; svcSeen.add(k); qtyBySource.set(sid, (qtyBySource.get(sid) || 0) + 1); }
    else qtyBySource.set(sid, (qtyBySource.get(sid) || 0) + (Number(l.qty) || 0));
  }
  return { qtyBySource, draftsBySource };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Phase 3: Run test vector validation on every call ──
    const _test_vector_validation = validateTestVector('resolveProjectBillableItems');

    const { project_id } = await req.json();
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    const [
      commitments, serviceCommitments, parts, vendors, categories, services, serviceVendors,
      serviceLineItems,
    ] = await Promise.all([
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.ServiceCommitment.filter({ project_id }).catch(() => []),
      base44.entities.Part.list(),
      base44.entities.Vendor.list(),
      base44.entities.PartCategory.list(),
      base44.entities.Service.list().catch(() => []),
      base44.entities.ServiceVendor.list().catch(() => []),
      base44.entities.ServiceLineItem.list().catch(() => []),
    ]);

    const partMap = Object.fromEntries(parts.map(p => [p.id, p]));
    const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v]));
    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const serviceMap = Object.fromEntries(services.map(s => [s.id, s]));
    const serviceVendorMap = Object.fromEntries(serviceVendors.map(v => [v.id, v]));

    // Group service line items by service_commitment_id
    const sliByCommitment = {};
    for (const sli of serviceLineItems) {
      if (!sli.service_commitment_id) continue;
      if (!sliByCommitment[sli.service_commitment_id]) sliByCommitment[sli.service_commitment_id] = [];
      sliByCommitment[sli.service_commitment_id].push(sli);
    }

    const { items, warnings } = computeItems({
      partCommitments: commitments,
      serviceCommitments,
      partMap,
      lookups: { vendorMap, categoryMap, serviceMap, serviceVendorMap },
    });

    // Phase 4: Attach service line item children to service items
    for (const item of items) {
      if (item.type === 'service' && item.source_id) {
        const childLines = sliByCommitment[item.source_id];
        if (childLines && childLines.length > 0) {
          item.children = childLines
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map(sli => {
              const sliVendor = sli.vendor_id ? serviceVendorMap[sli.vendor_id] : null;
              return {
                id: sli.id,
                type: sli.type || 'vendor_cost',
                description: sli.description || sli.type || 'Line Item',
                cost: sli.cost ?? 0,
                billing_rate: sli.billing_rate ?? 0,
                quantity: sli.quantity ?? 1,
                amount: (sli.billing_rate ?? 0) * (sli.quantity ?? 1),
                cost_amount: (sli.cost ?? 0) * (sli.quantity ?? 1),
                vendor_name: sliVendor?.name || null,
              };
            });
        }
      }
    }

    // Earned, uninvoiced billable labor (admin only — invoicing is admin only). Unpriced hours are reported, never priced.
    let laborTotals = null;
    if (user.role === 'admin') {
      const labor = await loadProjectLabor(base44, project_id);
      laborTotals = labor.totals;
      for (const l of labor.items) {
        if (l.rate == null || l.uninvoiced_hours <= 0) continue;
        items.push({
          id: l.task_id, source_entity: 'Task', source_id: l.task_id, type: 'labor',
          description: `Labor: ${l.task_name || 'Task'}`, task_name: l.task_name,
          part_id: null, part_name: null, part_number: null, vendor_id: null, vendor_name: null,
          category_id: null, category_name: 'Labor',
          required_total: l.hours_logged, qty_removed: 0, effective_required: l.hours_logged, invoiced_qty: l.invoiced_hours,
          qty_available_to_bill: l.uninvoiced_hours, unit_price: l.rate, unit_cost: 0,
          line_total: l.uninvoiced_amount, cost_total: 0, already_billed_amount: 0, billing_locked: false,
          needs_review: false, review_reason: null,
          metadata: { draft_hours: l.draft_hours, hours_logged: l.hours_logged },
        });
      }
    }

    // ── Draft allocation split ── An item already on an active draft is "allocated", not available for a new draft.
    // Parts/labor: min(uninvoiced qty, qty on drafts). Services: whole service if on any draft. Prices are unchanged.
    const { qtyBySource, draftsBySource } = await loadDraftAllocations(base44.asServiceRole.entities, project_id);
    const allocatedItems = [];
    const availableItems = [];
    for (const it of items) {
      const onDrafts = it.type === 'labor' ? (it.metadata?.draft_hours || 0) : (qtyBySource.get(it.source_id) || 0);
      const allocQty = it.type === 'service' ? (onDrafts > 0 ? 1 : 0) : lh(Math.min(it.qty_available_to_bill, onDrafts));
      const remaining = lh(it.qty_available_to_bill - allocQty);
      if (allocQty > 0) {
        allocatedItems.push({ ...it, qty_allocated: allocQty, allocated_amount: lr2(allocQty * it.unit_price), draft_invoice_ids: [...(draftsBySource.get(it.source_id) || [])] });
      }
      if (remaining > 1e-9) {
        availableItems.push(allocQty > 0 ? { ...it, qty_uninvoiced: it.qty_available_to_bill, qty_allocated: allocQty, qty_available_to_bill: remaining,
          line_total: lr2(remaining * it.unit_price), cost_total: lr2(remaining * (it.unit_cost || 0)), children: it.type === 'service' ? it.children : undefined } : it);
      }
    }

    // ── Excluded / blocked (never selectable) ──
    const excludedItems = [];
    for (const sc of serviceCommitments) {
      const flagged = sc.is_billed === true || sc.status === 'billed';
      if (flagged && !sc.invoice_id && (sc.total_billable ?? 0) > 0) excludedItems.push({ type: 'service', source_id: sc.id, description: sc.description || 'Service', amount: lr2(sc.total_billable), reason: 'BILLED_WITHOUT_INVOICE', message: 'Marked billed but not linked to any AK invoice' });
      else if (!flagged && !sc.invoice_id && !((sc.total_billable ?? 0) > 0)) excludedItems.push({ type: 'service', source_id: sc.id, description: sc.description || 'Service', amount: 0, reason: 'ZERO_BILLABLE', message: 'Service has no billable amount' });
    }
    let needsClassificationHours = 0;
    if (user.role === 'admin') {
      if (laborTotals?.unpriced_hours > 0) excludedItems.push({ type: 'labor', source_id: null, description: 'Billable labor without a rate', amount: null, hours: laborTotals.unpriced_hours, reason: 'RATE_NOT_SET', message: 'Set a labor billing rate to invoice these hours' });
      const [allTasks, entries] = await Promise.all([
        base44.asServiceRole.entities.Task.filter({ project_id }, '-created_date', 5000),
        base44.asServiceRole.entities.TaskTimeEntry.filter({ project_id }, '-created_date', 5000),
      ]);
      const unclassified = new Set(allTasks.filter((t) => !t.labor_billing_type || t.labor_billing_type === 'UNCLASSIFIED').map((t) => t.id));
      needsClassificationHours = lh(entries.reduce((s, e) => s + (unclassified.has(e.task_id) ? (Number(e.hours) || 0) : 0), 0));
      if (needsClassificationHours > 0) excludedItems.push({ type: 'labor', source_id: null, description: 'Logged hours on unclassified tasks', amount: null, hours: needsClassificationHours, reason: 'NEEDS_CLASSIFICATION', message: 'Classify these tasks before their hours can be invoiced' });
    }
    items.length = 0;
    items.push(...availableItems);

    const partItems = items.filter(i => i.type === 'part');
    const serviceItems = items.filter(i => i.type === 'service');
    const laborItems = items.filter(i => i.type === 'labor');
    const allocatedTotal = lr2(allocatedItems.reduce((s, i) => s + i.allocated_amount, 0));
    const availableTotal = lr2(items.reduce((s, i) => s + i.line_total, 0));
    const excludedTotal = lr2(excludedItems.reduce((s, i) => s + (i.amount || 0), 0));

    return Response.json({
      success: true,
      project_id,
      BILLING_LOGIC_VERSION,
      _test_vector_validation,
      items,
      summary: {
        total_items: items.length,
        part_count: partItems.length,
        service_count: serviceItems.length,
        parts_total: partItems.reduce((s, i) => s + i.line_total, 0),
        services_total: serviceItems.reduce((s, i) => s + i.line_total, 0),
        labor_count: laborItems.length,
        labor_total: lr2(laborItems.reduce((s, i) => s + i.line_total, 0)),
        labor_unpriced_hours: laborTotals?.unpriced_hours ?? 0,
        grand_total: availableTotal,
        items_needing_review: items.filter(i => i.needs_review).length,
        // Eligibility breakdown: available now + on active drafts = uninvoiced; excluded is never selectable.
        available_total: availableTotal,
        allocated_to_drafts_total: allocatedTotal,
        uninvoiced_total: lr2(availableTotal + allocatedTotal),
        excluded_total: excludedTotal,
        total_unbilled: lr2(availableTotal + allocatedTotal + excludedTotal),
        needs_classification_hours: needsClassificationHours,
      },
      allocated_items: allocatedItems,
      excluded_items: excludedItems,
      warnings: warnings.length > 0 ? warnings : null,
    });
  } catch (error) {
    console.error('resolveProjectBillableItems error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});