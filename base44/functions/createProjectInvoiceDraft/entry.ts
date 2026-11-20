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
    // Line metadata is the primary audit record; the activity log copy never undoes a committed append.
    await logPriceOverrides(sr, user, target.project_id, target.id, validatedLines).catch((e) => console.error('[appendLines] override log failed', e.message));
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
const DEPOSIT_LOGIC_VERSION = 'dep-v2';
async function loadBudget(base44, project_id) {
  const d = (await base44.functions.invoke('billingAuthorizationCore', { project_id })).data;
  if (!d?.success || d.logic_version !== AUTH_LOGIC_VERSION) throw new Error('Billing authorization unavailable or version mismatch');
  return { budget: d.authorization.authorized, billed: d.authorization.consumed };
}

// ── PART SELLING PRICE ── Canonical price = the commitment's frozen retail snapshot. A caller price that differs is an
// explicit administrator override: whole cents, 0 to 10,000,000, a reason (5-500 chars), and below-cost approval when it
// is under the unit cost. Only the invoice line carries the override; catalog, commitment, PO and inventory are untouched.
const MAX_PRICE = 10000000;
function resolvePartPrice(line, canonical, unitCost) {
  if (line.unit_price == null || line.unit_price === '') return { price: canonical, override: null };
  const p = typeof line.unit_price === 'number' ? line.unit_price : (typeof line.unit_price === 'string' && /^\d+(\.\d+)?$/.test(line.unit_price.trim()) ? Number(line.unit_price) : NaN);
  if (!Number.isFinite(p) || p < 0 || p > MAX_PRICE) return { code: 'PRICE_INVALID', message: `selling price must be a number from 0 to ${MAX_PRICE}` };
  if (Math.abs(Math.round(p * 100) - p * 100) > 1e-6) return { code: 'PRICE_PRECISION', message: 'selling price must be in whole cents' };
  if (Math.abs(p - canonical) < 0.005) return { price: canonical, override: null };
  const o = line.price_override && typeof line.price_override === 'object' ? line.price_override : null;
  const reason = typeof o?.reason === 'string' ? o.reason.trim() : '';
  if (reason.length < 5) return { code: 'PRICE_OVERRIDE_REASON_REQUIRED', message: `$${p.toFixed(2)} differs from the canonical $${canonical.toFixed(2)}; an override reason (at least 5 characters) is required` };
  if (reason.length > 500) return { code: 'PRICE_OVERRIDE_REASON_TOO_LONG', message: 'override reason must be 500 characters or fewer' };
  const belowCost = unitCost > 0 && p < unitCost - 0.005;
  if (belowCost && o.below_cost_approved !== true) return { code: 'BELOW_COST_APPROVAL_REQUIRED', message: `$${p.toFixed(2)} is below the unit cost $${unitCost.toFixed(2)}; explicit below-cost approval is required` };
  return { price: lr2(p), override: { original_unit_price: canonical, override_unit_price: lr2(p), reason, below_cost: belowCost, below_cost_approved: belowCost, unit_cost_at_override: unitCost,
    margin_pct: p > 0 ? lr2(((p - unitCost) / p) * 100) : null } };
}

// Price-override audit entries (one ActivityLog row per overridden line). Called only after the lines are written.
async function logPriceOverrides(sr, user, projectId, invoiceId, lines) {
  for (const l of lines) {
    const o = l.metadata?.price_override;
    if (!o) continue;
    await sr.ActivityLog.create({ action: 'Invoice Line Price Override', related_project_id: projectId, user_email: user.email,
      notes: JSON.stringify({ invoice_id: invoiceId, source_id: l.source_id, description: l.description, qty: l.qty, ...o }).slice(0, 4000) });
  }
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
    if (payload?.self_test) return Response.json(await runSelfTest());
    return await handleDraft(base44, user, payload);
  } catch (error) {
    console.error('createProjectInvoiceDraft error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// The whole validation + write path. `base44` is the real client, or the in-memory mock used by self_test.
async function handleDraft(base44, user, payload) {
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

    // ── INTERRUPTED PARTS CREDIT SETTLEMENT ── credit moved but part billed qty not yet updated: never draft over it.
    const pendingSettle = await base44.asServiceRole.entities.CreditAllocation.filter({ project_id, settlement_state: 'pending_commitment' });
    if (pendingSettle.length) {
      return Response.json({ success: false, code: 'SETTLEMENT_INCOMPLETE', error: 'A parts credit settlement for this project did not finish. Finish it in Parts Action Workbench before invoicing.' }, { status: 409 });
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
    const priceRejections = [];
    let overridden = false;
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
        const unitCost = commitment.unit_cost_snapshot ?? 0;
        const priced = resolvePartPrice(line, lr2(commitment.unit_retail_snapshot ?? 0), unitCost);
        if (priced.code) {
          priceRejections.push({ line: i, source_id: line.source_id, code: priced.code, message: `${line.description || 'Part'}: ${priced.message}` });
          continue;
        }
        if (priced.override && user.role !== 'admin') return Response.json({ error: 'Forbidden: price overrides are admin only' }, { status: 403 });
        const unitPrice = priced.price;
        const lineTotal = lr2(effectiveQty * unitPrice);
        if (priced.override) {
          overridden = true;
          warnings.push({ line: i, code: priced.override.below_cost ? 'BELOW_COST_OVERRIDE' : 'PRICE_OVERRIDDEN',
            message: `${line.description || 'Part'}: selling price $${unitPrice.toFixed(2)} instead of $${priced.override.original_unit_price.toFixed(2)}` +
              (priced.override.margin_pct != null ? ` (margin ${priced.override.margin_pct}%${priced.override.below_cost ? ', below cost, approved' : ''})` : '') });
        }

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
          metadata: (basis || priced.override) ? {
            ...(basis ? { part_basis: basis, received_qty_at_draft: lh(Math.min(effectiveRequired, (commitment.reserved_from_stock ?? 0) + (commitment.qty_installed ?? 0))),
              ...(basis === 'projected' ? { estimated_unit_cost_at_draft: unitCost, on_order_qty_at_draft: commitment.covered_from_po ?? 0 } : {}) } : {}),
            ...(priced.override ? { price_override: { ...priced.override, by: user.email, at: new Date().toISOString() } } : {}),
          } : null,
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
        // Component lines are rebuilt from the stored ServiceLineItem records; caller-supplied amounts are never used.
        const expandedLines = Array.isArray(line.expanded_lines) && line.expanded_lines.length
          ? (await base44.asServiceRole.entities.ServiceLineItem.filter({ service_commitment_id: sc.id }))
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((sli) => ({ id: sli.id, type: sli.type || 'vendor_cost', description: sli.description || sli.type || 'Line Item', cost: sli.cost ?? 0,
              billing_rate: sli.billing_rate ?? 0, quantity: sli.quantity ?? 1, amount: (sli.billing_rate ?? 0) * (sli.quantity ?? 1), cost_amount: (sli.cost ?? 0) * (sli.quantity ?? 1), vendor_name: null }))
          : null;
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
    if (priceRejections.length) {
      return Response.json({ success: false, code: 'PRICE_OVERRIDE_INVALID', error: priceRejections.map((r) => r.message).join('; '), price_rejections: priceRejections }, { status: 400 });
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
    // Credit is chosen explicitly per kind (deposit / general) and never combined automatically. The old single
    // credit_to_apply (drawn from any credit) is refused for new drafts; existing drafts keep what they were created with.
    const money = (v) => { const n = Number(v ?? 0); return Number.isFinite(n) && n >= 0 && Math.abs(Math.round(n * 100) - n * 100) < 1e-6 ? n : NaN; };
    const creditSel = { deposit: money(payload.credit_deposit), general: money(payload.credit_general) };
    if (!appending) {
      if ((parseFloat(credit_to_apply) || 0) > 0) return Response.json({ success: false, code: 'CREDIT_KIND_REQUIRED', error: 'Choose how much deposit credit and how much general project credit to apply; they are not combined automatically.' }, { status: 400 });
      if (Number.isNaN(creditSel.deposit) || Number.isNaN(creditSel.general)) return Response.json({ success: false, code: 'BAD_CREDIT', error: 'Credit amounts must be zero or more, in whole cents.' }, { status: 400 });
      if (invoice_type === 'deposit' && creditSel.deposit + creditSel.general > 0) return Response.json({ success: false, code: 'CREDIT_ON_DEPOSIT', error: 'Credit cannot be applied to a deposit invoice.' }, { status: 400 });
    }
    const proposedCredit = appending ? (target.credit_proposed ?? 0) : lr2(creditSel.deposit + creditSel.general);

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
      // Availability per kind comes from the canonical deposit handler (net of what other drafts reserve).
      const av = (await base44.functions.invoke('projectDepositAction', { action: 'credit_availability', project_id })).data;
      if (!av?.success || av.logic_version !== DEPOSIT_LOGIC_VERSION) throw new Error('Credit availability unavailable or version mismatch');
      if (creditSel.deposit > av.available_deposit + 0.005) {
        return Response.json({ success: false, code: 'EXCEEDS_DEPOSIT_CREDIT', error: `Deposit credit selected ($${creditSel.deposit.toFixed(2)}) exceeds available deposit credit ($${av.available_deposit.toFixed(2)}).` }, { status: 400 });
      }
      if (creditSel.general > av.available_general + 0.005) {
        return Response.json({ success: false, code: 'EXCEEDS_GENERAL_CREDIT', error: `General credit selected ($${creditSel.general.toFixed(2)}) exceeds available general project credit ($${av.available_general.toFixed(2)}).` }, { status: 400 });
      }
      if (proposedCredit > subtotal + 0.005) {
        return Response.json({ error: `Proposed credit (${proposedCredit}) exceeds subtotal (${subtotal})` }, { status: 400 });
      }
    }

    const summarize = (l) => ({ type: l.type, source_id: l.source_id, labor_basis: l.metadata?.labor_basis, part_basis: l.metadata?.part_basis, description: l.description, qty: l.qty, unit_price: l.unit_price, line_total: lr2(l.line_total),
      ...(l.metadata?.price_override ? { price_override: l.metadata.price_override } : {}) });
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
      credit_selection_mode: 'split',
      credit_proposed_deposit: creditSel.deposit,
      credit_proposed_general: creditSel.general,
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

    if (overridden) await logPriceOverrides(base44.asServiceRole.entities, user, project_id, invoice.id, validatedLines).catch((e) => console.error('[createProjectInvoiceDraft] override log failed', e.message));

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
        credit_proposed_deposit: creditSel.deposit,
        credit_proposed_general: creditSel.general,
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
}

// ── SELF TEST ── { self_test: true } (admin only). Runs Add Lines scenarios through handleDraft against an in-memory
// database. Never reads or writes real records.
function mockDb(seed) {
  let n = 0;
  const tables = {};
  for (const [k, rows] of Object.entries(seed)) tables[k] = rows.map((r) => ({ ...r }));
  const match = (row, q) => Object.entries(q).every(([k, v]) => (v && typeof v === 'object' && '$in' in v) ? v.$in.includes(row[k]) : (row[k] ?? null) === v);
  const api = (name) => {
    const rows = (tables[name] ||= []);
    return {
      filter: async (q = {}) => rows.filter((r) => match(r, q)).map((r) => ({ ...r })),
      list: async () => rows.map((r) => ({ ...r })),
      get: async (id) => { const r = rows.find((x) => x.id === id); if (!r) throw Object.assign(new Error('not found'), { status: 404 }); return { ...r }; },
      create: async (d) => { const r = { id: `${name}_${++n}`, created_date: new Date().toISOString(), ...d }; rows.push(r); return { ...r }; },
      updateMany: async (q, { $set }) => { const hit = rows.filter((r) => match(r, q)); hit.forEach((r) => Object.assign(r, $set)); return { updated: hit.length }; },
      delete: async (id) => { const i = rows.findIndex((x) => x.id === id); if (i >= 0) rows.splice(i, 1); },
    };
  };
  const entities = new Proxy({}, { get: (_, name) => api(String(name)) });
  // Labor availability and budget consumption are derived from the mock rows, like the real cores derive them.
  const functions = { invoke: async (fn, p) => {
    if (fn === 'laborBillingCore') {
      const pid = p.project_ids[0];
      const drafts = tables.ProjectInvoice.filter((i) => i.project_id === pid && !['cancelled', 'void'].includes(i.status)).map((i) => i.id);
      const onDraft = (tid, basis) => (tables.ProjectInvoiceLine || []).filter((l) => drafts.includes(l.invoice_id) && l.type === 'labor' && l.source_id === tid && (l.metadata?.labor_basis || 'earned') === basis).reduce((s, l) => s + l.qty, 0);
      const items = (tables.LaborFixture || []).filter((t) => t.project_id === pid).map((t) => ({ task_id: t.id, task_name: t.name, rate: t.rate, hours_logged: t.earned, estimated_hours: t.earned + t.projected,
        invoiced_hours: 0, draft_hours: onDraft(t.id, 'earned'), earned_available_hours: Math.max(0, t.earned - onDraft(t.id, 'earned')), projected_available_hours: Math.max(0, t.projected - onDraft(t.id, 'projected')) }));
      return { data: { success: true, logic_version: LABOR_LOGIC_VERSION, projects: { [pid]: { items } } } };
    }
    if (fn === 'billingAuthorizationCore') {
      const pr = tables.Project.find((x) => x.id === p.project_id);
      const consumed = lr2(tables.ProjectInvoice.filter((i) => i.project_id === p.project_id && !['cancelled', 'void'].includes(i.status)).reduce((s, i) => s + (i.subtotal || 0) - (i.credit_proposed || 0), 0));
      return { data: { success: true, logic_version: AUTH_LOGIC_VERSION, authorization: { authorized: pr.budget ?? null, consumed } } };
    }
    if (fn === 'projectDepositAction' && p.action === 'credit_availability') {
      // Same rule as the canonical handler: deposit credit = row from a deposit invoice payment; drafts reserve per kind.
      const inv = tables.ProjectInvoice.filter((i) => i.project_id === p.project_id);
      const dep = new Set(inv.filter((i) => i.invoice_type === 'deposit').map((i) => i.id));
      const rows = (tables.ProjectCreditLedger || []).filter((c) => c.project_id === p.project_id && (c.remaining_amount || 0) >= 0.01);
      const pool = (k) => lr2(rows.filter((c) => (dep.has(c.source_invoice_id) && !c.reversed_from_invoice_id) === (k === 'deposit')).reduce((s, c) => s + c.remaining_amount, 0));
      const drafts = inv.filter((i) => i.status === 'draft' && i.credit_selection_mode === 'split');
      const res = (k) => drafts.reduce((s, i) => s + (i[`credit_proposed_${k}`] || 0), 0);
      return { data: { success: true, logic_version: DEPOSIT_LOGIC_VERSION, available_deposit: lr2(pool('deposit') - res('deposit')), available_general: lr2(pool('general') - res('general')) } };
    }
    throw new Error(`unexpected invoke ${fn}`);
  } };
  return { base44: { entities, asServiceRole: { entities }, functions }, tables };
}

function seedProject({ budget = 5000, designation = null } = {}) {
  return mockDb({
    Project: [{ id: 'P', name: 'Test', budget, billing_designation: designation, billing_lock_token: null }, { id: 'P2', name: 'Other', billing_lock_token: null }],
    ProjectInvoice: [{ id: 'D', project_id: 'P', invoice_type: 'progress', status: 'draft', subtotal: 300, total: 300, balance_due: 300, credit_proposed: 0 },
      { id: 'S', project_id: 'P', invoice_type: 'final', status: 'sent', subtotal: 0 }, { id: 'D2', project_id: 'P2', invoice_type: 'progress', status: 'draft', subtotal: 0 }],
    ProjectInvoiceLine: [{ id: 'L0', invoice_id: 'D', type: 'part', source_entity: 'PartCommitment', source_id: 'c1', description: 'Existing part', qty: 1, unit_price: 300, line_total: 300, sort_order: 0, metadata: { part_basis: 'current' } }],
    PartCommitment: [
      { id: 'c1', project_id: 'P', part_id: 'p1', required_total: 3, reserved_from_stock: 3, unit_retail_snapshot: 300, unit_cost_snapshot: 150, invoiced_qty: 0 },
      { id: 'c2', project_id: 'P', part_id: 'p2', required_total: 2, reserved_from_stock: 0, covered_from_po: 2, unit_retail_snapshot: 100, unit_cost_snapshot: 60, invoiced_qty: 0 },
    ],
    ServiceCommitment: [{ id: 's1', project_id: 'P', service_id: 'sv', description: 'Plating', total_billable: 500, total_cost: 300, status: 'completed' }],
    ServiceLineItem: [{ id: 'sl1', service_commitment_id: 's1', description: 'Vendor', type: 'vendor_cost', cost: 100, billing_rate: 200, quantity: 1, sort_order: 0 },
      { id: 'sl2', service_commitment_id: 's1', description: 'Labor', type: 'labor', cost: 100, billing_rate: 150, quantity: 2, sort_order: 1 }],
    LaborFixture: [{ id: 't1', project_id: 'P', name: 'Task', rate: 120, earned: 5, projected: 3 }],
  });
}

async function runSelfTest() {
  const user = { email: 'selftest@local', role: 'admin' };
  const call = async (m, body) => { const r = await handleDraft(m.base44, user, { project_id: 'P', append_to_invoice_id: 'D', ...body }); return { status: r.status, ...(await r.json()) }; };
  const lab = (qty, basis = 'earned') => ({ type: 'labor', source_entity: 'Task', source_id: 't1', description: 'Labor', qty, labor_basis: basis });
  const part = (id, qty, basis, extra = {}) => ({ type: 'part', source_entity: 'PartCommitment', source_id: id, description: id, qty, part_basis: basis, ...extra });
  const svc = { type: 'service', source_entity: 'ServiceCommitment', source_id: 's1', description: 'Plating', expanded_lines: [{ id: 'sl1', amount: 1 }] };
  const linesOf = (m, inv = 'D') => m.tables.ProjectInvoiceLine.filter((l) => l.invoice_id === inv);
  const draft = (m) => m.tables.ProjectInvoice.find((i) => i.id === 'D');
  const unlocked = (m) => m.tables.Project.every((p) => p.billing_lock_token == null);
  const results = [];
  const t = async (name, fn) => { try { const detail = await fn(); results.push({ name, pass: detail.pass === true, detail }); } catch (e) { results.push({ name, pass: false, detail: e.message }); } };

  await t('append earned labor, projected labor, received part, unreceived part and service: all added at server prices', async () => {
    const m = seedProject();
    const r = await call(m, { lines: [lab(2), lab(1, 'projected'), part('c1', 1, 'current'), part('c2', 2, 'projected'), svc] });
    const L = linesOf(m); const L0 = L.find((l) => l.id === 'L0');
    const svcLines = L.filter((l) => l.type === 'service');
    return { pass: r.success && r.lines_added === 6 && draft(m).subtotal === 1660 && L0.unit_price === 300 && L0.qty === 1 && svcLines.length === 2 && lr2(svcLines.reduce((s, l) => s + l.line_total, 0)) === 500
      && L.find((l) => l.metadata?.labor_basis === 'projected')?.unit_price === 120 && L.find((l) => l.source_id === 'c2')?.metadata?.part_basis === 'projected' && unlocked(m)
      && m.tables.PartCommitment.every((c) => c.invoiced_qty === 0), subtotal: draft(m).subtotal, added: r.lines_added };
  });
  await t('partial quantities: 1 of 2 received parts and 2 of 5 earned hours, remainder still available', async () => {
    const m = seedProject();
    await call(m, { lines: [part('c1', 1, 'current'), lab(2)] });
    const again = await call(m, { lines: [part('c1', 1, 'current'), lab(3)] });
    return { pass: again.success && linesOf(m).filter((l) => l.source_id === 'c1').reduce((s, l) => s + l.qty, 0) === 3 && linesOf(m).filter((l) => l.type === 'labor').reduce((s, l) => s + l.qty, 0) === 5 };
  });
  await t('administrator price override with reason: added, audit metadata and activity log written', async () => {
    const m = seedProject();
    const r = await call(m, { lines: [part('c1', 1, 'current', { unit_price: 250, price_override: { reason: 'Loyalty discount' } })] });
    const l = linesOf(m).find((x) => x.id !== 'L0'); const o = l?.metadata?.price_override;
    const log = (m.tables.ActivityLog || []).find((a) => a.action === 'Invoice Line Price Override');
    return { pass: r.success && l.unit_price === 250 && o?.original_unit_price === 300 && o?.override_unit_price === 250 && o?.reason === 'Loyalty discount' && o?.margin_pct === 40 && o?.by === user.email && !!log
      && m.tables.PartCommitment.find((c) => c.id === 'c1').unit_retail_snapshot === 300 && r.warnings?.some((w) => w.code === 'PRICE_OVERRIDDEN') };
  });
  await t('standard price sent explicitly or omitted: no override recorded', async () => {
    const m = seedProject();
    const r = await call(m, { lines: [part('c1', 1, 'current', { unit_price: 300 }), part('c2', 1, 'projected')] });
    return { pass: r.success && linesOf(m).every((l) => !l.metadata?.price_override) && !(m.tables.ActivityLog || []).some((a) => a.action === 'Invoice Line Price Override') };
  });
  await t('override without reason, below cost without approval, bad cents: rejected, nothing written', async () => {
    const m = seedProject();
    const a = await call(m, { lines: [part('c1', 1, 'current', { unit_price: 250 })] });
    const b = await call(m, { lines: [part('c1', 1, 'current', { unit_price: 100, price_override: { reason: 'Clearance' } })] });
    const c = await call(m, { lines: [part('c1', 1, 'current', { unit_price: 250.005, price_override: { reason: 'Clearance' } })] });
    return { pass: a.code === 'PRICE_OVERRIDE_INVALID' && b.price_rejections?.[0]?.code === 'BELOW_COST_APPROVAL_REQUIRED' && c.price_rejections?.[0]?.code === 'PRICE_PRECISION' && linesOf(m).length === 1 && draft(m).subtotal === 300 && unlocked(m) };
  });
  await t('below cost with explicit approval: added with below-cost warning', async () => {
    const m = seedProject();
    const r = await call(m, { lines: [part('c1', 1, 'current', { unit_price: 100, price_override: { reason: 'Warranty goodwill', below_cost_approved: true } })] });
    return { pass: r.success && r.warnings?.some((w) => w.code === 'BELOW_COST_OVERRIDE') && linesOf(m).find((l) => l.id !== 'L0')?.metadata?.price_override?.below_cost === true };
  });
  await t('duplicate allocations after a successful add: part, service, earned and projected labor all rejected', async () => {
    const m = seedProject();
    await call(m, { lines: [part('c1', 2, 'current'), part('c2', 2, 'projected'), svc, lab(5), lab(3, 'projected')] });
    const before = linesOf(m).length; const sub = draft(m).subtotal;
    const p = await call(m, { lines: [part('c1', 1, 'current')] });
    const s = await call(m, { lines: [svc] });
    const e = await call(m, { lines: [lab(1)] });
    const j = await call(m, { lines: [lab(1, 'projected')] });
    return { pass: !p.success && !s.success && s.blocked_lines?.[0]?.reason === 'ALLOCATED_TO_OTHER_DRAFT' && e.code === 'LABOR_HOURS_EXCEEDED' && j.code === 'LABOR_HOURS_EXCEEDED' && linesOf(m).length === before && draft(m).subtotal === sub,
      codes: [p.blocked_lines?.[0]?.reason, s.blocked_lines?.[0]?.reason, e.code, j.code] };
  });
  await t('over-request is never capped: 3 received when 2 available rejects the whole request', async () => {
    const m = seedProject();
    const r = await call(m, { lines: [part('c1', 3, 'current'), lab(1)] });
    return { pass: r.code === 'PART_QTY_EXCEEDED' && linesOf(m).length === 1 };
  });
  await t('budget limit: projected labor beyond remaining authorization rejected, nothing written', async () => {
    const m = seedProject({ budget: 400 });
    const r = await call(m, { lines: [lab(1, 'projected')] });
    const ok = await call(m, { lines: [lab(0.5, 'projected')] });
    return { pass: r.code === 'BUDGET_EXCEEDED' && ok.success && draft(m).subtotal === 360, after: draft(m).subtotal };
  });
  await t('projected labor without a confirmed budget: rejected', async () => {
    const m = seedProject({ budget: null });
    const r = await call(m, { lines: [lab(1, 'projected')] });
    return { pass: r.code === 'BUDGET_NOT_CONFIRMED' && linesOf(m).length === 1 };
  });
  await t('3 concurrent adds of the same hour: one wins, others told to retry, hours added once', async () => {
    const m = seedProject();
    const rs = await Promise.all([1, 2, 3].map(() => call(m, { lines: [lab(1)] })));
    return { pass: rs.filter((r) => r.success).length === 1 && rs.filter((r) => r.code === 'BILLING_LOCKED').length === 2 && linesOf(m).filter((l) => l.type === 'labor').length === 1 && draft(m).subtotal === 420 && unlocked(m),
      codes: rs.map((r) => r.code || 'ok') };
  });
  await t('append target must be a draft on this project', async () => {
    const m = seedProject();
    const sent = await call(m, { append_to_invoice_id: 'S', lines: [lab(1)] });
    const other = await call(m, { append_to_invoice_id: 'D2', lines: [lab(1)] });
    return { pass: sent.code === 'APPEND_BLOCKED' && other.code === 'APPEND_BLOCKED' && unlocked(m) };
  });
  await t('check_only append validates and writes nothing', async () => {
    const m = seedProject();
    const r = await call(m, { check_only: true, lines: [lab(2), part('c1', 1, 'current', { unit_price: 250, price_override: { reason: 'Loyalty discount' } })] });
    return { pass: r.success && r.check_only && r.would_add.length === 2 && linesOf(m).length === 1 && draft(m).subtotal === 300 && !(m.tables.ActivityLog || []).length && unlocked(m) };
  });
  await t('interrupted parts credit settlement blocks new draft lines; nothing written', async () => {
    const m = seedProject();
    m.tables.CreditAllocation = [{ id: 'a1', project_id: 'P', settlement_state: 'pending_commitment' }];
    const before = linesOf(m).length;
    const r = await call(m, { lines: [part('c1', 1, 'current')] });
    return { pass: r.code === 'SETTLEMENT_INCOMPLETE' && linesOf(m).length === before && draft(m).subtotal === 300 && unlocked(m) };
  });
  await t('non-billable project: rejected', async () => {
    const m = seedProject({ designation: 'NON_BILLABLE' });
    const r = await call(m, { lines: [lab(1)] });
    return { pass: r.code === 'PROJECT_NON_BILLABLE' && linesOf(m).length === 1 && unlocked(m) };
  });
  // ── Explicit deposit / general credit selection on new drafts ──
  const credSeed = () => {
    const m = seedProject();
    m.tables.ProjectInvoice.push({ id: 'DEP', project_id: 'P', invoice_type: 'deposit', status: 'paid', subtotal: 400 });
    m.tables.ProjectCreditLedger = [
      { id: 'cg', project_id: 'P', source_invoice_id: 'removal', credit_amount: 80, remaining_amount: 80 },
      { id: 'cd', project_id: 'P', source_invoice_id: 'DEP', credit_amount: 400, remaining_amount: 400 },
    ];
    return m;
  };
  const create = async (m, body) => { const r = await handleDraft(m.base44, user, { project_id: 'P', invoice_type: 'final', lines: [part('c1', 1, 'current')], ...body }); return { status: r.status, ...(await r.json()) }; };
  await t('new draft records deposit and general credit separately; ledger untouched', async () => {
    const m = credSeed(); const r = await create(m, { credit_deposit: 200, credit_general: 50 });
    const d = m.tables.ProjectInvoice.find((i) => i.id === r.invoice_id);
    return { pass: r.success && d.credit_selection_mode === 'split' && d.credit_proposed === 250 && d.credit_proposed_deposit === 200 && d.credit_proposed_general === 50 && d.balance_due === 50 && m.tables.ProjectCreditLedger.every((c) => c.remaining_amount === c.credit_amount) };
  });
  await t('general credit beyond general balance refused even when deposit credit could cover it', async () => {
    const m = credSeed(); const r = await create(m, { credit_general: 81 });
    return { pass: r.status === 400 && r.code === 'EXCEEDS_GENERAL_CREDIT' && !m.tables.ProjectInvoice.some((i) => i.invoice_type === 'final' && i.status === 'draft') };
  });
  await t('deposit credit already reserved by another draft is not offered twice', async () => {
    const m = credSeed(); m.tables.ProjectInvoice.push({ id: 'DR2', project_id: 'P', invoice_type: 'progress', status: 'draft', credit_selection_mode: 'split', credit_proposed: 300, credit_proposed_deposit: 300, credit_proposed_general: 0, subtotal: 300 });
    const r = await create(m, { credit_deposit: 101 }); const ok = await create(m, { credit_deposit: 100 });
    return { pass: r.status === 400 && r.code === 'EXCEEDS_DEPOSIT_CREDIT' && ok.success };
  });
  await t('old single credit amount refused; no credit on deposit invoices; zero credit is the default', async () => {
    const m = credSeed();
    const a = await create(m, { credit_to_apply: 100 });
    const b = await handleDraft(m.base44, user, { project_id: 'P', invoice_type: 'deposit', lines: [{ type: 'manual', description: 'Deposit', qty: 1, unit_price: 500 }], credit_deposit: 10 }).then(async (x) => ({ status: x.status, ...(await x.json()) }));
    const c = await create(m, {}); const d = m.tables.ProjectInvoice.find((i) => i.id === c.invoice_id);
    return { pass: a.status === 400 && a.code === 'CREDIT_KIND_REQUIRED' && b.status === 400 && b.code === 'CREDIT_ON_DEPOSIT' && c.success && d.credit_proposed === 0 && d.balance_due === 300 };
  });
  return { function: 'createProjectInvoiceDraft', mock_only: true, passed: results.filter((r) => r.pass).length, total: results.length, results };
}