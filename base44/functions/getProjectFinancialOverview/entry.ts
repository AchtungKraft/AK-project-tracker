import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * getProjectFinancialOverview — READ-ONLY, admin-only project financial report.
 * Uses the same parts/services math as resolveProjectFinancialTotals
 * (effective qty = required_total - qty_removed; active commitments only).
 * Never writes. All queries scoped to project_id (invoice lines via that project's invoice ids).
 */

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const FINAL = ['sent', 'paid'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { project_id } = await req.json().catch(() => ({}));
    if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const [projects, commitments, services, invoices, credits, timeEntries] = await Promise.all([
      db.Project.filter({ id: project_id }),
      db.PartCommitment.filter({ project_id }),
      db.ServiceCommitment.filter({ project_id }),
      db.ProjectInvoice.filter({ project_id }),
      db.CreditAllocation.filter({ project_id, is_reversed: false }).catch(() => []),
      db.TaskTimeEntry.filter({ project_id }).catch(() => []),
    ]);
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const invIds = invoices.map((i) => i.id);
    const lines = invIds.length ? await db.ProjectInvoiceLine.filter({ invoice_id: { $in: invIds } }) : [];
    const invById = new Map(invoices.map((i) => [i.id, i]));
    const draftLines = lines.filter((l) => invById.get(l.invoice_id)?.status === 'draft');

    // Draft allocations per source
    const draftPartQty = new Map(); // source -> { qty, invoiceIds:Set }
    const draftSvc = new Map(); // source -> Set(invoiceIds)
    for (const l of draftLines) {
      const sid = l.source_id || l.part_commitment_id;
      if (!sid) continue;
      if (l.type === 'part') {
        const e = draftPartQty.get(sid) || { qty: 0, invoiceIds: new Set() };
        e.qty += l.qty ?? 0; e.invoiceIds.add(l.invoice_id); draftPartQty.set(sid, e);
      } else if (l.type === 'service') {
        const s = draftSvc.get(sid) || new Set(); s.add(l.invoice_id); draftSvc.set(sid, s);
      }
    }

    // ── PARTS ──
    const warnings = [];
    const partLines = [];
    const P = { billable: 0, est_cost: 0, actual_cost: 0, actual_known: 0, uninvoiced: 0, allocated: 0, invoiced_qty_value: 0, missing_cost: 0, stale_stored: 0, duplicate_draft: 0 };
    const activeCount = { active: 0, cancelled: 0 };
    for (const c of commitments) {
      const active = !c.cancelled_at && c.is_archived !== true && c.commitment_status !== 'cancelled';
      if (!active) { activeCount.cancelled++; continue; }
      activeCount.active++;
      const qty = Math.max(0, (c.required_total ?? 0) - (c.qty_removed ?? 0));
      const unitRetail = c.unit_retail_snapshot;
      const unitCost = c.unit_cost_snapshot;
      const billable = (unitRetail ?? 0) * qty;
      const clientSupplied = c.supply_source_type === 'CLIENT_SUPPLIED';
      const missingCost = (unitCost == null || unitCost === 0) && !clientSupplied && qty > 0;
      const missingRetail = (unitRetail == null || unitRetail === 0) && qty > 0;
      const estCost = (unitCost ?? 0) * qty;
      const hasActual = c.actual_unit_cost != null;
      const invoicedQty = c.invoiced_qty ?? 0;
      const availQty = Math.max(0, qty - invoicedQty);
      const d = draftPartQty.get(c.id);
      const allocQty = d ? Math.min(availQty, d.qty) : 0;
      const duplicate = d ? (d.qty > availQty + 1e-9 || d.invoiceIds.size > 1) : false;
      const stale = c.planned_retail_total != null && Math.abs(r2(billable) - r2(c.planned_retail_total)) > 0.01;

      P.billable += billable; P.est_cost += estCost;
      if (hasActual) { P.actual_cost += c.actual_unit_cost * qty; P.actual_known++; }
      P.uninvoiced += availQty * (unitRetail ?? 0);
      P.allocated += allocQty * (unitRetail ?? 0);
      if (missingCost) P.missing_cost++;
      if (stale) P.stale_stored++;
      if (duplicate) P.duplicate_draft++;

      partLines.push({
        id: c.id, part_id: c.part_id, source: c.supply_source_type || null, qty, qty_removed: c.qty_removed ?? 0,
        qty_installed: c.qty_installed ?? 0, unit_retail: unitRetail ?? null, unit_cost: unitCost ?? null,
        billable: r2(billable), est_cost: r2(estCost), actual_unit_cost: c.actual_unit_cost ?? null,
        invoiced_qty: invoicedQty, invoiced_amount: r2(c.invoiced_amount ?? 0), available_qty: availQty,
        draft_qty: d?.qty ?? 0, allocated_qty: allocQty, retail_override: !!c.retail_override,
        stored_retail_total: c.planned_retail_total ?? null,
        flags: [missingCost && 'missing_cost', missingRetail && 'missing_retail', stale && 'stale_stored_total', duplicate && 'duplicate_draft', clientSupplied && 'client_supplied'].filter(Boolean),
      });
    }

    // ── SERVICES ──
    const svcLines = [];
    const S = { billable: 0, est_cost: 0, actual_cost: 0, actual_known: 0, uninvoiced: 0, allocated: 0, missing_cost: 0, duplicate_draft: 0, billed_unlinked: 0 };
    for (const s of services) {
      const billable = s.total_billable ?? 0;
      const cost = s.total_cost;
      const linkedFinal = s.invoice_id && FINAL.includes(invById.get(s.invoice_id)?.status);
      const flaggedBilled = s.is_billed === true || s.status === 'billed' || !!s.invoice_id;
      const billedUnlinked = flaggedBilled && !linkedFinal;
      const isInvoiced = !!linkedFinal;
      const drafts = draftSvc.get(s.id);
      const allocated = !isInvoiced && drafts && drafts.size > 0;
      const duplicate = drafts ? (drafts.size > 1 || isInvoiced) : false;
      const missingCost = (cost == null || cost === 0) && billable > 0;

      S.billable += billable; S.est_cost += cost ?? 0;
      if (s.actual_cost != null) { S.actual_cost += s.actual_cost; S.actual_known++; }
      if (!isInvoiced && !billedUnlinked) S.uninvoiced += billable;
      if (allocated && !billedUnlinked) S.allocated += billable;
      if (missingCost) S.missing_cost++;
      if (duplicate) S.duplicate_draft++;
      if (billedUnlinked) S.billed_unlinked++;

      svcLines.push({
        id: s.id, description: s.description || null, status: s.status || null, billable: r2(billable),
        est_cost: cost ?? null, actual_cost: s.actual_cost ?? null, invoiced: isInvoiced,
        draft_count: drafts?.size ?? 0, allocated: !!allocated,
        flags: [missingCost && 'missing_cost', duplicate && 'duplicate_draft', billedUnlinked && 'billed_without_final_invoice'].filter(Boolean),
      });
    }

    // ── INVOICES (historical) ──
    const inv = { draft: { count: 0, total: 0 }, sent: { count: 0, total: 0 }, paid: { count: 0, total: 0 }, cancelled: { count: 0, total: 0 } };
    let paidAmount = 0; let outstanding = 0;
    for (const i of invoices) {
      const t = i.total ?? i.subtotal ?? 0;
      const k = inv[i.status] ? i.status : (i.status === 'void' ? 'cancelled' : null);
      if (!k) continue;
      inv[k].count++; inv[k].total += t;
      if (FINAL.includes(i.status)) {
        paidAmount += i.paid_amount ?? 0;
        if (i.status === 'sent') outstanding += i.balance_due ?? Math.max(0, t - (i.paid_amount ?? 0));
      }
    }
    const lineSplit = { final: { part: 0, service: 0, other: 0 }, draft: { part: 0, service: 0, other: 0 } };
    for (const l of lines) {
      const st = invById.get(l.invoice_id)?.status;
      const bucket = FINAL.includes(st) ? 'final' : st === 'draft' ? 'draft' : null;
      if (!bucket) continue;
      const key = l.type === 'part' ? 'part' : l.type === 'service' ? 'service' : 'other';
      lineSplit[bucket][key] += l.line_total ?? (l.qty || 0) * (l.unit_price || 0);
    }
    const creditsApplied = credits.reduce((a, c) => a + (c.amount_applied ?? 0), 0);

    // ── LABOR (informational) ──
    const hoursLogged = timeEntries.reduce((a, t) => a + (t.hours ?? 0), 0);
    const wh = project.workflow_health || {};

    // ── WARNINGS ──
    if (P.missing_cost) warnings.push({ code: 'PARTS_MISSING_COST', count: P.missing_cost, message: `${P.missing_cost} part line(s) have no cost — estimated cost and margin are incomplete.` });
    if (S.missing_cost) warnings.push({ code: 'SERVICES_MISSING_COST', count: S.missing_cost, message: `${S.missing_cost} service(s) have no cost — estimated cost and margin are incomplete.` });
    if (P.stale_stored) warnings.push({ code: 'STALE_STORED_TOTALS', count: P.stale_stored, message: `${P.stale_stored} part line(s) have a stored sale total that differs from unit price × quantity. Calculated value is used; stored value not changed.` });
    if (P.duplicate_draft + S.duplicate_draft) warnings.push({ code: 'DUPLICATE_DRAFT', count: P.duplicate_draft + S.duplicate_draft, message: 'Some items appear on more than one draft (or exceed uninvoiced quantity). Only one can be sent; the server blocks the rest.' });
    if (S.billed_unlinked) warnings.push({ code: 'SERVICE_BILLED_UNLINKED', count: S.billed_unlinked, message: `${S.billed_unlinked} service(s) are flagged billed but not linked to a sent or paid invoice. Review manually.` });

    const billable = P.billable + S.billable;
    const estCost = P.est_cost + S.est_cost;
    const costComplete = P.missing_cost + S.missing_cost === 0;
    const remaining = P.uninvoiced + S.uninvoiced;
    const allocated = P.allocated + S.allocated;

    return Response.json({
      success: true,
      project_id, project_name: project.name, generated_at: new Date().toISOString(),
      summary: {
        current_billable: r2(billable), estimated_cost: r2(estCost),
        estimated_gross_profit: r2(billable - estCost),
        estimated_gross_margin_pct: billable > 0 ? r2(((billable - estCost) / billable) * 100) : null,
        cost_complete: costComplete,
        finalized_invoiced: r2(inv.sent.total + inv.paid.total),
        draft_invoice_amount: r2(inv.draft.total),
        paid_amount: r2(paidAmount), outstanding_balance: r2(outstanding), credits_applied: r2(creditsApplied),
        remaining_uninvoiced: r2(remaining), allocated_to_drafts: r2(allocated),
        available_to_invoice: r2(Math.max(0, remaining - allocated)),
      },
      categories: {
        parts: { billable: r2(P.billable), estimated_cost: r2(P.est_cost), actual_cost: P.actual_known ? r2(P.actual_cost) : null, actual_cost_lines: P.actual_known, remaining_uninvoiced: r2(P.uninvoiced), allocated_to_drafts: r2(P.allocated), active_lines: activeCount.active, cancelled_lines: activeCount.cancelled, missing_cost: P.missing_cost },
        services: { billable: r2(S.billable), estimated_cost: r2(S.est_cost), actual_cost: S.actual_known ? r2(S.actual_cost) : null, actual_cost_lines: S.actual_known, remaining_uninvoiced: r2(S.uninvoiced), allocated_to_drafts: r2(S.allocated), lines: services.length, missing_cost: S.missing_cost },
      },
      invoices: {
        by_status: Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, { count: v.count, total: r2(v.total) }])),
        line_split: { final: { part: r2(lineSplit.final.part), service: r2(lineSplit.final.service), other: r2(lineSplit.final.other) }, draft: { part: r2(lineSplit.draft.part), service: r2(lineSplit.draft.service), other: r2(lineSplit.draft.other) } },
      },
      labor: { hours_logged: r2(hoursLogged), entries: timeEntries.length, hours_estimated: wh.hours_estimated ?? null, hours_remaining: wh.hours_remaining ?? null },
      lines: { parts: partLines, services: svcLines },
      warnings,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});