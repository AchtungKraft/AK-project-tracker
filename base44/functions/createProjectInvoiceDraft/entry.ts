import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * createProjectInvoiceDraft — UNIFIED INVOICE DRAFT CREATION
 *
 * PHASE 3 RULES:
 * 1. Creates ProjectInvoice (status=draft) + ProjectInvoiceLine rows
 * 2. Does NOT mutate PartCommitment (no invoiced_qty, no billing_status)
 * 3. Does NOT mutate ServiceCommitment (no is_billed, no invoice_id)
 * 4. Does NOT deduct credit from ledger — stores credit_proposed only
 * 5. Validates lines against canonical resolver output
 *
 * Supports line types: part, service, labor (earned billable task hours, server-priced), manual, outside_cost
 *
 * Inputs:
 * - project_id (required)
 * - invoice_type: deposit|progress|final (required)
 * - credit_to_apply: number (proposed credit, not deducted yet)
 * - lines: [{ type, source_id?, source_entity?, description, qty, unit_price, labor_basis? }]
 *     labor lines: labor_basis 'earned' (default, logged hours) or 'projected' (advance billing against the task estimate)
 * - notes: string
 * - append_to_invoice_id: add the lines to this existing DRAFT instead of creating a new one (same validation, same lock)
 * - check_only: run every validation under the lock and return what would be written; writes nothing
 *
 * Labor hours are never capped silently: a line asking for more hours than are available (earned or projected) rejects
 * the whole request with requested vs available hours. NON_BILLABLE projects are rejected. Projected lines need a
 * confirmed agreed client budget, and all non-cancelled invoices (drafts included) plus the new lines must fit it.
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
async function loadProjectLabor(base44, project_id) {
  const d = await laborCore(base44, { project_ids: [project_id] });
  return d.projects[project_id] || d.empty;
}
// └─────────────────────────────────────────────────────────────────────────

const STALE_LOCK_MS = 120000;
async function acquireBillingLock(sr, projectId, owner) {
  const token = `${owner}_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const cas = async (q, set) => (await sr.Project.updateMany(q, { $set: set })).updated;
  let ok = (await cas({ id: projectId, billing_lock_token: null }, { billing_lock_token: token, billing_lock_at: now })) === 1;
  if (!ok) {
    const p = await sr.Project.get(projectId).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (p?.billing_lock_token && p.billing_lock_at && Date.now() - new Date(p.billing_lock_at).getTime() > STALE_LOCK_MS) {
      ok = (await cas({ id: projectId, billing_lock_token: p.billing_lock_token }, { billing_lock_token: token, billing_lock_at: now })) === 1;
    }
  }
  if (!ok) return null;
  return () => cas({ id: projectId, billing_lock_token: token }, { billing_lock_token: null, billing_lock_at: null })
    .catch((e) => console.error('[createProjectInvoiceDraft] lock release failed', e.message));
}

// Quantities already on ACTIVE drafts (status=draft) for a project. Parts: summed qty. Services: 1 per draft.
async function loadDraftAllocations(db, project_id) {
  const drafts = await db.ProjectInvoice.filter({ project_id, status: 'draft' });
  const lines = drafts.length ? await db.ProjectInvoiceLine.filter({ invoice_id: { $in: drafts.map((d) => d.id) } }, 'sort_order', 5000) : [];
  const qtyBySource = new Map(); const svcSeen = new Set();
  for (const l of lines) {
    const sid = l.source_id || l.part_commitment_id;
    if (!sid || !['part', 'service'].includes(l.type)) continue;
    if (l.type === 'service') { const k = `${l.invoice_id}:${sid}`; if (svcSeen.has(k)) continue; svcSeen.add(k); qtyBySource.set(sid, (qtyBySource.get(sid) || 0) + 1); }
    else qtyBySource.set(sid, (qtyBySource.get(sid) || 0) + (Number(l.qty) || 0));
  }
  return { qtyBySource };
}

const LINE_FIELDS = ['type', 'source_entity', 'source_id', 'part_commitment_id', 'part_id', 'part_name', 'part_number', 'description', 'qty', 'unit_price',
  'line_total', 'unit_cost', 'cost_total', 'vendor_id', 'vendor_name', 'category_id', 'category_name', 'needs_review', 'review_reason'];

// Add validated lines to an existing draft (runs under the caller's billing lock). Header is updated with a
// compare-and-set on its current subtotal; if that fails the new lines are removed again. Source records untouched.
async function appendLines({ base44, user, target, validatedLines, subtotal, blockedLines, warnings, budgetCheck, summarize }) {
  const sr = base44.asServiceRole.entities;
  const existing = await sr.ProjectInvoiceLine.filter({ invoice_id: target.id });
  const base = existing.reduce((m, l) => Math.max(m, l.sort_order ?? 0), 0) + 1;
  const created = [];
  try {
    for (const [k, l] of validatedLines.entries()) {
      created.push(await sr.ProjectInvoiceLine.create({ invoice_id: target.id, ...Object.fromEntries(LINE_FIELDS.map((f) => [f, l[f] ?? null])), sort_order: base + k, metadata: l.metadata || null }));
    }
    const newSubtotal = lr2((target.subtotal ?? 0) + subtotal);
    const won = (await sr.ProjectInvoice.updateMany({ id: target.id, status: 'draft', subtotal: target.subtotal ?? 0 }, { $set: {
      subtotal: newSubtotal, total: newSubtotal, balance_due: lr2(Math.max(0, newSubtotal - (target.credit_proposed ?? 0))),
    } })).updated === 1;
    if (!won) throw Object.assign(new Error('Draft changed while adding lines. Refresh and try again.'), { code: 'INVOICE_CHANGED' });
    await sr.ActivityLog.create({ action: 'Draft Invoice Lines Added', related_project_id: target.project_id, user_email: user.email,
      notes: JSON.stringify({ invoice_id: target.id, at: new Date().toISOString(), before_subtotal: lr2(target.subtotal ?? 0), after_subtotal: newSubtotal, added: validatedLines.map(summarize), budget: budgetCheck }).slice(0, 8000) });
    return Response.json({ success: true, mode: 'append', invoice_id: target.id, lines_added: created.length, added_subtotal: lr2(subtotal), subtotal: newSubtotal,
      blocked_lines: blockedLines.length ? blockedLines : null, warnings: warnings.length ? warnings : null, budget: budgetCheck, source_records_mutated: false, credit_ledger_mutated: false });
  } catch (e) {
    for (const c of created) await sr.ProjectInvoiceLine.delete(c.id).catch((x) => console.error('[appendLines] cleanup failed', c.id, x.message));
    return Response.json({ success: false, code: e.code || 'APPEND_FAILED', error: e.message }, { status: e.code ? 409 : 500 });
  }
}

// Billing authorization — calculated only in billingAuthorizationCore. budget = confirmed agreed amount (null = none);
// billed = invoiced + drafted, net of applied/proposed credit (a deposit applied as credit is not consumed twice).
const AUTH_LOGIC_VERSION = 'auth-v1';
async function loadBudget(base44, project_id) {
  const d = (await base44.functions.invoke('billingAuthorizationCore', { project_id })).data;
  if (!d?.success || d.logic_version !== AUTH_LOGIC_VERSION) throw new Error('Billing authorization unavailable or version mismatch');
  return { budget: d.authorization.authorized, billed: d.authorization.consumed };
}

// Physically received qty (reserved from stock + installed). Invoiced and draft qty are applied against it first;
// the rest of the canonical cap is "projected" (not yet purchased or received). Total cap is unchanged.
function partPools(c, effectiveRequired, invoicedQty, onDrafts) {
  const total = Math.max(0, effectiveRequired - invoicedQty - onDrafts);
  const physical = Math.min(effectiveRequired, (c.reserved_from_stock ?? 0) + (c.qty_installed ?? 0));
  const current = Math.min(total, Math.max(0, physical - invoicedQty - onDrafts));
  return { total: lh(total), current: lh(current), projected: lh(total - current) };
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
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status ?? e.response?.status) || /authentication required/i.test(e.message) ? null : Promise.reject(e)));
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const {
      project_id,
      invoice_type,
      credit_to_apply = 0,
      lines = [],
      notes,
      append_to_invoice_id = null,
      check_only = false,
    } = payload;
    const appending = typeof append_to_invoice_id === 'string' && !!append_to_invoice_id;

    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }
    if (!appending && (!invoice_type || !['deposit', 'progress', 'final'].includes(invoice_type))) {
      return Response.json({ error: 'invoice_type must be deposit|progress|final' }, { status: 400 });
    }
    if (!lines || lines.length === 0) {
      return Response.json({ error: 'At least one line is required' }, { status: 400 });
    }

    // Verify project exists
    const projects = await base44.entities.Project.filter({ id: project_id });
    if (projects.length === 0) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Per-project billing lock: draft creation, line removal, deletion and sending are serialized per project,
    // so two concurrent creates can never allocate the same part, service or labor hours.
    const release = await acquireBillingLock(base44.asServiceRole.entities, project_id, 'create_draft');
    if (!release) return Response.json({ success: false, code: 'BILLING_LOCKED', error: 'Another billing action is in progress for this project. Try again in a moment.' }, { status: 409 });
    try {

    // ── PROJECT DESIGNATION ── Non-billable projects never get new invoice lines.
    const lockedProject = (await base44.asServiceRole.entities.Project.filter({ id: project_id }))[0];
    if (lockedProject?.billing_designation === 'NON_BILLABLE') {
      return Response.json({ success: false, code: 'PROJECT_NON_BILLABLE', error: 'This project is marked Non-Billable. Change it to Billable before invoicing.' }, { status: 409 });
    }

    // ── APPEND TARGET ── must be an untouched draft on this project (re-read under the billing lock).
    let target = null;
    if (appending) {
      target = (await base44.asServiceRole.entities.ProjectInvoice.filter({ id: append_to_invoice_id }))[0] || null;
      const why = !target ? 'Draft not found.' : target.project_id !== project_id ? 'Draft belongs to another project.'
        : target.status !== 'draft' ? `Invoice is ${target.status}. Lines can only be added to drafts.`
        : ((target.credit_application_plan || []).length || target.credit_plan_state) ? 'A send is in progress for this draft.'
        : (target.paid_amount ?? 0) > 0 || (target.credit_applied ?? 0) > 0 ? 'This draft already has payments or applied credit.' : null;
      if (why) return Response.json({ success: false, code: 'APPEND_BLOCKED', error: why }, { status: 409 });
    }

    // ── DUPLICATE DRAFT PROTECTION ──
    // Canonical uniqueness boundary: project_id + invoice_type + status=draft
    const existingDrafts = appending ? [] : await base44.entities.ProjectInvoice.filter({
      project_id,
      invoice_type,
      status: 'draft',
    });

    if (existingDrafts.length > 0) {
      const existing = existingDrafts[0];
      // Count lines for context
      const existingLines = await base44.entities.ProjectInvoiceLine.filter({ invoice_id: existing.id });
      return Response.json({
        success: false,
        existing_draft: true,
        existing_invoice_id: existing.id,
        existing_invoice: {
          id: existing.id,
          project_id: existing.project_id,
          invoice_type: existing.invoice_type,
          status: existing.status,
          subtotal: existing.subtotal ?? 0,
          credit_proposed: existing.credit_proposed ?? 0,
          balance_due: existing.balance_due ?? 0,
          created_date: existing.created_date,
          line_count: existingLines.length,
        },
        error: `An active ${invoice_type} draft already exists for this project.`,
      });
    }

    // ── Prefetch source records for validation ──
    const partCommitmentIds = lines
      .filter(l => l.type === 'part' && l.source_id)
      .map(l => l.source_id);

    const serviceCommitmentIds = lines
      .filter(l => l.type === 'service' && l.source_id)
      .map(l => l.source_id);

    const [allPartCommitments, allServiceCommitments, allParts, allVendors, allCategories] = await Promise.all([
      partCommitmentIds.length > 0
        ? base44.entities.PartCommitment.filter({ project_id })
        : [],
      serviceCommitmentIds.length > 0
        ? base44.entities.ServiceCommitment.filter({ project_id }).catch(() => [])
        : [],
      base44.entities.Part.list(),
      base44.entities.Vendor.list(),
      base44.entities.PartCategory.list(),
    ]);

    const pcMap = new Map(allPartCommitments.map(c => [c.id, c]));
    const scMap = new Map(allServiceCommitments.map(s => [s.id, s]));
    const partMap = new Map(allParts.map(p => [p.id, p]));
    const vendorMap = new Map(allVendors.map(v => [v.id, v]));
    const catMap = new Map(allCategories.map(c => [c.id, c]));

    const warnings = [];
    const blockedLines = [];
    const validatedLines = [];
    const laborByTask = lines.some(l => l.type === 'labor')
      ? new Map((await loadProjectLabor(base44, project_id)).items.map(l => [l.task_id, l]))
      : new Map();
    // Disjoint per-task pools (earned vs projected), so the result never depends on line order.
    const laborUsed = { earned: new Map(), projected: new Map() };
    const laborRejections = [];
    let hasProjected = false;
    // Allocation to other ACTIVE drafts (read under the billing lock). Prevents the same source on two drafts.
    const { qtyBySource: draftQty } = await loadDraftAllocations(base44.asServiceRole.entities, project_id);
    const partQtyUsed = new Map();
    const partRejections = [];
    let hasProjectedParts = false;
    const servicesUsed = new Set();

    // ── Validate each line ──
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!line.type || !['part', 'service', 'labor', 'manual', 'outside_cost'].includes(line.type)) {
        return Response.json({ error: `Line ${i}: type must be part|service|labor|manual|outside_cost` }, { status: 400 });
      }
      if (!line.description) {
        return Response.json({ error: `Line ${i}: description required` }, { status: 400 });
      }

      // ── PART LINE ──
      if (line.type === 'part') {
        if (!line.source_id) {
          return Response.json({ error: `Line ${i}: source_id required for part lines` }, { status: 400 });
        }

        const commitment = pcMap.get(line.source_id);
        if (!commitment) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'NOT_FOUND', message: 'PartCommitment not found' });
          continue;
        }
        if (commitment.project_id !== project_id) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'WRONG_PROJECT', message: 'Commitment does not belong to this project' });
          continue;
        }
        if (commitment.cancelled_at || commitment.is_archived === true) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'CANCELLED_OR_ARCHIVED', message: 'Commitment is cancelled or archived' });
          continue;
        }

        // CANONICAL: effective_required = required_total - qty_removed
        const requiredTotal = commitment.required_total ?? 0;
        const qtyRemoved = commitment.qty_removed ?? 0;
        const effectiveRequired = Math.max(0, requiredTotal - qtyRemoved);
        const invoicedQty = commitment.invoiced_qty ?? 0;
        const uninvoicedQty = Math.max(0, effectiveRequired - invoicedQty);
        const onOtherDrafts = draftQty.get(line.source_id) || 0;
        const pools = partPools(commitment, effectiveRequired, invoicedQty, onOtherDrafts);
        const used = partQtyUsed.get(line.source_id) || { total: 0, current: 0, projected: 0 };
        const basis = ['current', 'projected'].includes(line.part_basis) ? line.part_basis : null; // null = legacy caller, total cap only
        const qtyAvailable = lh(Math.max(0, pools.total - used.total));

        if (qtyAvailable <= 0) {
          const allocated = uninvoicedQty > 0 && onOtherDrafts > 0;
          blockedLines.push({ line: i, source_id: line.source_id, reason: allocated ? 'ALLOCATED_TO_OTHER_DRAFT' : 'NO_OUTSTANDING',
            message: allocated ? `Already on an active draft (${onOtherDrafts} of ${uninvoicedQty} uninvoiced)` : `No qty available (effective: ${effectiveRequired}, invoiced: ${invoicedQty})` });
          continue;
        }

        const basisAvailable = basis ? lh(Math.min(qtyAvailable, Math.max(0, pools[basis] - used[basis]))) : qtyAvailable;
        // Legacy callers without part_basis (e.g. the Invoice Workbench) keep the historical cap-to-available behavior.
        const effectiveQty = line.qty == null ? basisAvailable : basis ? lh(Number(line.qty)) : Math.min(lh(Number(line.qty)), basisAvailable);
        if (!(effectiveQty > 0)) {
          return Response.json({ error: `Line ${i}: part quantity must be greater than 0` }, { status: 400 });
        }
        // Never capped silently: asking for more than is available rejects the whole request.
        if (effectiveQty > basisAvailable + 1e-6) {
          partRejections.push({ line: i, source_id: line.source_id, basis: basis || 'any', requested_qty: effectiveQty, available_qty: basisAvailable,
            message: `${line.description || 'Part'}: requested ${effectiveQty} ${basis || ''} qty, ${basisAvailable} available`.replace('  ', ' ') });
          continue;
        }
        partQtyUsed.set(line.source_id, { ...used, total: used.total + effectiveQty, ...(basis ? { [basis]: used[basis] + effectiveQty } : {}) });
        if (basis === 'projected') hasProjectedParts = true;
        const unitPrice = line.unit_price ?? commitment.unit_retail_snapshot ?? 0;
        const unitCost = commitment.unit_cost_snapshot ?? 0;
        const lineTotal = effectiveQty * unitPrice;

        const part = partMap.get(commitment.part_id);
        const vendor = part?.default_vendor_id ? vendorMap.get(part.default_vendor_id) : null;
        const category = part?.part_category_id ? catMap.get(part.part_category_id) : null;

        let needsReview = false;
        let reviewReason = null;
        if (unitPrice <= 0) {
          needsReview = true;
          reviewReason = 'MISSING_RETAIL: Unit retail is 0.';
          warnings.push({ line: i, code: 'MISSING_RETAIL', message: `Line ${i}: Retail price is $0.` });
        }

        validatedLines.push({
          type: 'part',
          source_entity: 'PartCommitment',
          source_id: line.source_id,
          part_commitment_id: line.source_id, // backward compat
          part_id: commitment.part_id,
          part_name: part?.part_name || line.description,
          part_number: part?.vendor_part_number || null,
          description: line.description || part?.part_name || 'Part',
          qty: effectiveQty,
          unit_price: unitPrice,
          line_total: lineTotal,
          unit_cost: unitCost,
          cost_total: effectiveQty * unitCost,
          vendor_id: vendor?.id || null,
          vendor_name: vendor?.vendor_name || null,
          category_id: category?.id || null,
          category_name: category?.name || null,
          needs_review: needsReview,
          review_reason: reviewReason,
          sort_order: i,
          // Estimated selling price and estimated cost are snapshotted on the line; actual cost is tracked on the commitment.
          metadata: basis ? { part_basis: basis, received_qty_at_draft: lh(Math.min(effectiveRequired, (commitment.reserved_from_stock ?? 0) + (commitment.qty_installed ?? 0))),
            ...(basis === 'projected' ? { estimated_unit_cost_at_draft: unitCost, on_order_qty_at_draft: commitment.covered_from_po ?? 0 } : {}) } : null,
        });
      }

      // ── SERVICE LINE ──
      else if (line.type === 'service') {
        if (!line.source_id) {
          return Response.json({ error: `Line ${i}: source_id required for service lines` }, { status: 400 });
        }

        const sc = scMap.get(line.source_id);
        if (!sc) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'NOT_FOUND', message: 'ServiceCommitment not found' });
          continue;
        }
        if (sc.project_id !== project_id) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'WRONG_PROJECT', message: 'ServiceCommitment does not belong to this project' });
          continue;
        }
        // CANONICAL: Unified billing lock — must match all resolvers
        const isServiceBilled = sc.is_billed === true || sc.status === 'billed' || !!sc.invoice_id;
        if (isServiceBilled) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'ALREADY_BILLED', message: 'Service is already billed' });
          continue;
        }
        if ((draftQty.get(line.source_id) || 0) > 0 || servicesUsed.has(line.source_id)) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'ALLOCATED_TO_OTHER_DRAFT', message: 'Service is already on an active draft' });
          continue;
        }
        servicesUsed.add(line.source_id);

        const totalBillable = sc.total_billable ?? 0;
        const totalCost = sc.total_cost ?? 0;

        if (totalBillable <= 0) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'ZERO_BILLABLE', message: 'Service has $0 billable amount' });
          continue;
        }

        // ── SERVICE EXPANSION: If expanded_lines provided, create child lines ──
        const expandedLines = line.expanded_lines;
        if (expandedLines && Array.isArray(expandedLines) && expandedLines.length > 0) {
          // Validate children sum matches parent total
          const childrenSum = expandedLines.reduce((s, cl) => s + (cl.amount ?? 0), 0);
          if (Math.abs(childrenSum - totalBillable) > 0.01) {
            console.error("Service children total mismatch", {
              service_commitment_id: line.source_id,
              parent_total: totalBillable,
              children_sum: childrenSum,
              diff: childrenSum - totalBillable,
            });
            warnings.push({
              line: i,
              code: 'SERVICE_CHILDREN_MISMATCH',
              message: `Service children sum (${childrenSum}) != parent total (${totalBillable}). Using children as-is.`,
            });
          }

          for (let ci = 0; ci < expandedLines.length; ci++) {
            const child = expandedLines[ci];
            const childAmount = child.amount ?? 0;
            if (childAmount <= 0) continue; // skip zero-value children
            const childCost = child.cost_amount ?? 0;

            validatedLines.push({
              type: 'service',
              source_entity: 'ServiceCommitment',
              source_id: line.source_id,
              part_commitment_id: null,
              part_id: null,
              part_name: null,
              part_number: null,
              description: child.description || 'Service Line Item',
              qty: child.quantity ?? 1,
              unit_price: child.billing_rate ?? childAmount,
              line_total: childAmount,
              unit_cost: child.cost ?? 0,
              cost_total: childCost,
              vendor_id: null,
              vendor_name: child.vendor_name || null,
              category_id: null,
              category_name: child.type || 'Service',
              needs_review: false,
              review_reason: null,
              sort_order: i + (ci * 0.01), // preserve ordering within parent
              metadata: {
                service_id: sc.service_id,
                service_commitment_id: sc.id,
                service_status: sc.status,
                service_line_item_id: child.id || null,
                service_line_type: child.type || null,
                parent_service_description: sc.description || line.description || null,
              },
            });
          }
        } else {
          // ── FALLBACK: No children — existing single-line behavior ──
          validatedLines.push({
            type: 'service',
            source_entity: 'ServiceCommitment',
            source_id: line.source_id,
            part_commitment_id: null,
            part_id: null,
            part_name: null,
            part_number: null,
            description: line.description || sc.description || 'Service',
            qty: 1,
            unit_price: totalBillable,
            line_total: totalBillable,
            unit_cost: totalCost,
            cost_total: totalCost,
            vendor_id: sc.vendor_id || null,
            vendor_name: null,
            category_id: null,
            category_name: 'Service',
            needs_review: false,
            review_reason: null,
            sort_order: i,
            metadata: {
              service_id: sc.service_id,
              service_commitment_id: sc.id,
              service_status: sc.status,
            },
          });
        }
      }

      // ── LABOR LINE ── earned billable hours on a task; price is always the server-resolved rate
      else if (line.type === 'labor') {
        if (!line.source_id) {
          return Response.json({ error: `Line ${i}: source_id (task) required for labor lines` }, { status: 400 });
        }
        const lab = laborByTask.get(line.source_id);
        if (!lab) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'NOT_BILLABLE_LABOR', message: 'Task is not billable labor on this project' });
          continue;
        }
        if (lab.rate == null) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'RATE_NOT_SET', message: 'No billing rate is set for this task or project' });
          continue;
        }
        const basis = line.labor_basis === 'projected' ? 'projected' : 'earned';
        const pool = basis === 'projected' ? lab.projected_available_hours : lab.earned_available_hours;
        const used = laborUsed[basis].get(line.source_id) || 0;
        const available = lh(Math.max(0, pool - used));
        const requested = line.qty == null ? available : lh(Number(line.qty));
        if (!(requested > 0)) {
          return Response.json({ error: `Line ${i}: labor hours must be greater than 0` }, { status: 400 });
        }
        if (requested > available + 1e-6) {
          laborRejections.push({ line: i, task_id: line.source_id, task_name: lab.task_name, basis, requested_hours: requested, available_hours: available,
            hours_logged: lab.hours_logged, invoiced_hours: lab.invoiced_hours, draft_hours: lab.draft_hours, estimated_hours: lab.estimated_hours,
            message: `${lab.task_name || 'Task'}: requested ${requested}h ${basis} labor, ${available}h available` });
          continue;
        }
        const hours = requested;
        laborUsed[basis].set(line.source_id, used + hours);
        if (basis === 'projected') hasProjected = true;
        validatedLines.push({
          type: 'labor', source_entity: 'Task', source_id: line.source_id,
          part_commitment_id: null, part_id: null, part_name: null, part_number: null,
          description: line.description || `${basis === 'projected' ? 'Projected labor' : 'Labor'}: ${lab.task_name || 'Task'}`,
          qty: hours, unit_price: lab.rate, line_total: lr2(hours * lab.rate),
          unit_cost: null, cost_total: null, vendor_id: null, vendor_name: null,
          category_id: null, category_name: 'Labor', needs_review: false, review_reason: null, sort_order: i,
          metadata: { task_id: line.source_id, labor_basis: basis, hours_logged_at_draft: lab.hours_logged, invoiced_hours_at_draft: lab.invoiced_hours,
            ...(basis === 'projected' ? { estimated_hours_at_draft: lab.estimated_hours } : {}) },
        });
      }

      // ── MANUAL / OUTSIDE_COST LINE ──
      else {
        const qty = line.qty ?? 1;
        const unitPrice = line.unit_price ?? 0;
        const lineTotal = qty * unitPrice;

        validatedLines.push({
          type: line.type,
          source_entity: 'Manual',
          source_id: null,
          part_commitment_id: null,
          part_id: null,
          part_name: null,
          part_number: null,
          description: line.description,
          qty,
          unit_price: unitPrice,
          line_total: lineTotal,
          unit_cost: null,
          cost_total: null,
          vendor_id: null,
          vendor_name: null,
          category_id: null,
          category_name: null,
          needs_review: false,
          review_reason: null,
          sort_order: i,
        });
      }
    }

    // ── Phase 3: Line-level validation ──
    for (const vl of validatedLines) {
      const expectedLineTotal = (vl.qty ?? 0) * (vl.unit_price ?? 0);
      if (Math.abs((vl.line_total ?? 0) - expectedLineTotal) > 0.01) {
        console.error("Retail mismatch", { description: vl.description, line_total: vl.line_total, expected: expectedLineTotal });
      }
      const expectedCostTotal = (vl.qty ?? 0) * (vl.unit_cost ?? 0);
      if (vl.cost_total != null && vl.unit_cost != null && Math.abs((vl.cost_total ?? 0) - expectedCostTotal) > 0.01) {
        console.error("Cost mismatch", { description: vl.description, cost_total: vl.cost_total, expected: expectedCostTotal });
      }
      if ((vl.unit_cost ?? 0) > (vl.unit_price ?? 0) && vl.unit_price > 0) {
        console.warn("Negative margin line", { description: vl.description, cost: vl.unit_cost, retail: vl.unit_price });
        warnings.push({ line: vl.sort_order, code: 'NEGATIVE_MARGIN', message: `${vl.description}: cost ($${vl.unit_cost}) > retail ($${vl.unit_price})` });
      }
    }

    // Labor hours are never capped: any over-request rejects the whole request.
    if (laborRejections.length) {
      return Response.json({ success: false, code: 'LABOR_HOURS_EXCEEDED', error: laborRejections.map((r) => r.message).join('; '), labor_rejections: laborRejections }, { status: 409 });
    }
    if (partRejections.length) {
      return Response.json({ success: false, code: 'PART_QTY_EXCEEDED', error: partRejections.map((r) => r.message).join('; '), part_rejections: partRejections }, { status: 409 });
    }

    // All blocked?
    if (validatedLines.length === 0 && blockedLines.length > 0) {
      return Response.json({
        success: false,
        error: 'All lines were blocked',
        blocked_lines: blockedLines,
        warnings,
      }, { status: 400 });
    }

    // ── Compute totals ── (when appending, subtotal = the added lines only)
    const subtotal = validatedLines.reduce((s, l) => s + (l.line_total || 0), 0);

    // ── Validate proposed credit ── (append keeps the draft's existing proposed credit)
    const proposedCredit = appending ? (target.credit_proposed ?? 0) : Math.max(0, parseFloat(credit_to_apply) || 0);

    // ── Billing authorization ── (confirmed agreed client budget; consumption is net of credit so deposits count once)
    // Projected labor: needs a confirmed authorization and must fit it. Projected parts: must fit it when one is confirmed
    // (parts were always billable before purchase, so without one they are allowed and flagged). Earned/current items are
    // never blocked by the ceiling; exceeding it is reported as a warning.
    const { budget, billed } = await loadBudget(base44, project_id);
    const addingNet = lr2(subtotal - (appending ? 0 : proposedCredit));
    const after = lr2(billed + addingNet);
    const budgetCheck = budget == null ? null : { agreed_budget: lr2(budget), billed_and_drafted: billed, adding: addingNet, after, remaining_after: lr2(budget - after) };
    if (hasProjected && budget == null) {
      return Response.json({ success: false, code: 'BUDGET_NOT_CONFIRMED', error: 'Projected labor needs a confirmed agreed client budget on this project.' }, { status: 409 });
    }
    if (budget != null && after > budget + 0.005) {
      const msg = `Agreed client budget is $${budget.toFixed(2)}; $${billed.toFixed(2)} is already invoiced or on drafts (net of credits), so $${lr2(budget - billed).toFixed(2)} remains. This adds $${addingNet.toFixed(2)}.`;
      if (hasProjected || hasProjectedParts) return Response.json({ success: false, code: 'BUDGET_EXCEEDED', budget: budgetCheck, error: msg }, { status: 409 });
      warnings.push({ code: 'AUTHORIZATION_EXCEEDED', message: msg });
    }
    if (hasProjectedParts && budget == null) {
      warnings.push({ code: 'PROJECTED_PARTS_WITHOUT_AUTHORIZATION', message: 'Projected (not yet received) parts are being billed without a confirmed agreed client budget.' });
    }
    if (proposedCredit > 0 && !appending) {
      const credits = await base44.entities.ProjectCreditLedger.filter({ project_id });
      const totalAvailable = credits.reduce((s, c) => s + (c.remaining_amount ?? 0), 0);
      if (proposedCredit > totalAvailable) {
        return Response.json({ error: `Proposed credit (${proposedCredit}) exceeds available (${totalAvailable})` }, { status: 400 });
      }
      if (proposedCredit > subtotal) {
        return Response.json({ error: `Proposed credit (${proposedCredit}) exceeds subtotal (${subtotal})` }, { status: 400 });
      }
    }

    const summarize = (l) => ({ type: l.type, source_id: l.source_id, labor_basis: l.metadata?.labor_basis, part_basis: l.metadata?.part_basis, description: l.description, qty: l.qty, unit_price: l.unit_price, line_total: lr2(l.line_total) });
    if (check_only) {
      return Response.json({ success: true, check_only: true, mode: appending ? 'append' : 'create', would_add: validatedLines.map(summarize),
        adding_subtotal: lr2(subtotal), blocked_lines: blockedLines.length ? blockedLines : null, budget: budgetCheck, warnings: warnings.length ? warnings : null });
    }

    if (appending) return await appendLines({ base44, user, target, validatedLines, subtotal, blockedLines, warnings, budgetCheck, summarize });

    const balanceDue = Math.max(0, subtotal - proposedCredit);

    // ── Create invoice (DRAFT — NO source mutations) ──
    const invoice = await base44.asServiceRole.entities.ProjectInvoice.create({
      project_id,
      invoice_type,
      status: 'draft',
      subtotal,
      credit_proposed: proposedCredit,
      credit_applied: 0, // NOT applied yet — only at sent
      credit_preview: proposedCredit, // backward compat
      total: subtotal,
      balance_due: balanceDue,
      notes: notes || null,
    });

    // ── Create line items ──
    const createdLines = [];
    for (const line of validatedLines) {
      const created = await base44.asServiceRole.entities.ProjectInvoiceLine.create({
        invoice_id: invoice.id,
        type: line.type,
        source_entity: line.source_entity,
        source_id: line.source_id,
        part_commitment_id: line.part_commitment_id, // backward compat for parts
        part_id: line.part_id,
        part_name: line.part_name,
        part_number: line.part_number,
        description: line.description,
        qty: line.qty,
        unit_price: line.unit_price,
        line_total: line.line_total,
        unit_cost: line.unit_cost,
        cost_total: line.cost_total,
        vendor_id: line.vendor_id,
        vendor_name: line.vendor_name,
        category_id: line.category_id,
        category_name: line.category_name,
        needs_review: line.needs_review,
        review_reason: line.review_reason,
        sort_order: line.sort_order,
        metadata: line.metadata || null,
      });
      createdLines.push(created);
    }

    // ── Phase 5: Invoice Integrity Summary ──
    const partsTotal = validatedLines.filter(l => l.type === 'part').reduce((s, l) => s + (l.line_total || 0), 0);
    const servicesTotal = validatedLines.filter(l => l.type === 'service').reduce((s, l) => s + (l.line_total || 0), 0);
    const manualTotal = validatedLines.filter(l => l.type === 'manual' || l.type === 'outside_cost').reduce((s, l) => s + (l.line_total || 0), 0);
    const laborTotal = validatedLines.filter(l => l.type === 'labor').reduce((s, l) => s + (l.line_total || 0), 0);
    const computedTotal = partsTotal + servicesTotal + manualTotal + laborTotal;

    console.log("Invoice Integrity Summary", {
      invoice_id: invoice.id,
      line_count: createdLines.length,
      total_amount: subtotal,
      parts_total: partsTotal,
      services_total: servicesTotal,
      manual_total: manualTotal,
    });

    // ── Phase 6: Total Validation Guard ──
    if (Math.abs(computedTotal - subtotal) > 0.01) {
      console.error("Invoice total mismatch", {
        invoice_id: invoice.id,
        expected: computedTotal,
        actual: subtotal,
        diff: computedTotal - subtotal,
      });
    }

    // ── Phase 8: Debug summary log ──
    const totalCostAll = validatedLines.reduce((s, l) => s + (l.cost_total ?? 0), 0);
    const totalRetailAll = subtotal;
    const totalMarginAll = totalRetailAll - totalCostAll;
    console.log("INVOICE SUMMARY", {
      invoice_id: invoice.id,
      lines: createdLines.length,
      retail_total: totalRetailAll,
      cost_total: totalCostAll,
      margin_total: totalMarginAll,
      margin_pct: totalRetailAll > 0 ? ((totalMarginAll / totalRetailAll) * 100).toFixed(1) + '%' : 'N/A',
    });

    return Response.json({
      success: true,
      invoice_id: invoice.id,
      invoice: {
        id: invoice.id,
        project_id,
        invoice_type,
        status: 'draft',
        subtotal,
        credit_proposed: proposedCredit,
        credit_applied: 0,
        total: subtotal,
        balance_due: balanceDue,
      },
      lines_created: createdLines.length,
      lines_needing_review: validatedLines.filter(l => l.needs_review).length,
      blocked_lines: blockedLines.length > 0 ? blockedLines : null,
      warnings: warnings.length > 0 ? warnings : null,
      // CANONICAL: Draft does NOT mutate any source records
      source_records_mutated: false,
      credit_ledger_mutated: false,
      // Phase 8: Cost/margin summary
      cost_summary: {
        total_cost: totalCostAll,
        total_retail: totalRetailAll,
        total_margin: totalMarginAll,
        margin_pct: totalRetailAll > 0 ? Math.round((totalMarginAll / totalRetailAll) * 1000) / 10 : 0,
      },
      // Phase 5: Integrity breakdown
      integrity: {
        parts_total: partsTotal,
        services_total: servicesTotal,
        manual_total: manualTotal,
        labor_total: laborTotal,
        computed_total: computedTotal,
        invoice_total: subtotal,
        totals_match: Math.abs(computedTotal - subtotal) <= 0.01,
      },
    });
    } finally {
      await release();
    }
  } catch (error) {
    console.error('createProjectInvoiceDraft error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});