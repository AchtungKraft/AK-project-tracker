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
    const [projects, commitments, services, invoices, credits, timeEntries, tasks, taskStatuses] = await Promise.all([
      db.Project.filter({ id: project_id }),
      db.PartCommitment.filter({ project_id }),
      db.ServiceCommitment.filter({ project_id }),
      db.ProjectInvoice.filter({ project_id }),
      db.CreditAllocation.filter({ project_id, is_reversed: false }).catch(() => []),
      db.TaskTimeEntry.filter({ project_id }, '-created_date', 5000),
      db.Task.filter({ project_id }, '-created_date', 5000),
      db.StatusList.filter({ scope: 'Task' }),
    ]);
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const invIds = invoices.map((i) => i.id);
    const lines = invIds.length ? await db.ProjectInvoiceLine.filter({ invoice_id: { $in: invIds } }) : [];
    const invById = new Map(invoices.map((i) => [i.id, i]));
    const draftLines = lines.filter((l) => invById.get(l.invoice_id)?.status === 'draft');
    const partIds = [...new Set(commitments.map((c) => c.part_id).filter(Boolean))];
    const parts = partIds.length ? await db.Part.filter({ id: { $in: partIds } }) : [];
    const partById = new Map(parts.map((p) => [p.id, p]));

    // Draft allocations per source
    const draftPartQty = new Map(); // source -> { qty, invoiceIds:Set }
    const draftSvc = new Map(); // source -> Set(invoiceIds)
    const draftAmt = new Map(); // source -> sum of draft line_total (display/reconciliation only)
    for (const l of draftLines) {
      const sid = l.source_id || l.part_commitment_id;
      if (!sid) continue;
      draftAmt.set(sid, (draftAmt.get(sid) || 0) + (l.line_total ?? (l.qty || 0) * (l.unit_price || 0)));
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
    const P = { billable: 0, est_cost: 0, actual_cost: 0, actual_known: 0, uninvoiced: 0, allocated: 0, invoiced_qty_value: 0, missing_cost: 0, stale_stored: 0, duplicate_draft: 0, estimated_only: 0, zero_legit: 0 };
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

      // Cost state — never presents a missing cost as zero
      const costState = hasActual
        ? (c.actual_unit_cost === 0 ? 'actual_zero' : 'actual')
        : clientSupplied && !unitCost ? 'zero_client_supplied'
        : unitCost ? 'estimated_only' : 'missing';
      if (costState === 'estimated_only') P.estimated_only++;
      if (costState === 'zero_client_supplied') P.zero_legit++;
      const part = partById.get(c.part_id);

      partLines.push({
        id: c.id, part_id: c.part_id, part_name: part?.part_name || null, part_number: part?.vendor_part_number || part?.part_number || null,
        cost_state: costState,
        stale_detail: stale ? {
          stored: r2(c.planned_retail_total), calculated: r2(billable), difference: r2(billable - c.planned_retail_total),
          qty_source: `required_total ${c.required_total ?? 0} − qty_removed ${c.qty_removed ?? 0} = ${qty}`,
          price_source: `unit_retail_snapshot ${unitRetail ?? 'missing'}${c.retail_override ? ' (manual override)' : ''}`,
          // stored $0 with a real price = price entered after creation; stored = price × an older qty = quantity changed
          kind: (c.planned_retail_total === 0 && unitRetail > 0) ? 'price_entered_later'
            : (unitRetail > 0 && Math.abs(c.planned_retail_total / unitRetail - Math.round(c.planned_retail_total / unitRetail)) < 1e-6 && Math.round(c.planned_retail_total / unitRetail) !== qty) ? 'quantity_changed'
            : 'other',
          stored_qty_implied: unitRetail > 0 ? r2(c.planned_retail_total / unitRetail) : null,
        } : null,
        source: c.supply_source_type || null, qty, qty_removed: c.qty_removed ?? 0,
        qty_installed: c.qty_installed ?? 0, unit_retail: unitRetail ?? null, unit_cost: unitCost ?? null,
        billable: r2(billable), est_cost: r2(estCost), actual_unit_cost: c.actual_unit_cost ?? null,
        invoiced_qty: invoicedQty, invoiced_amount: r2(c.invoiced_amount ?? 0), available_qty: availQty,
        draft_qty: d?.qty ?? 0, allocated_qty: allocQty, retail_override: !!c.retail_override,
        draft_amount: r2(draftAmt.get(c.id) ?? 0), allocated_current_value: r2(allocQty * (unitRetail ?? 0)),
        stored_retail_total: c.planned_retail_total ?? null,
        flags: [missingCost && 'missing_cost', missingRetail && 'missing_retail', stale && 'stale_stored_total', duplicate && 'duplicate_draft', clientSupplied && 'client_supplied'].filter(Boolean),
      });
    }

    // ── SERVICES ──
    const svcLines = [];
    const S = { billable: 0, est_cost: 0, actual_cost: 0, actual_known: 0, uninvoiced: 0, allocated: 0, missing_cost: 0, duplicate_draft: 0, billed_unlinked: 0, estimated_only: 0 };
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

      const svcCostState = s.actual_cost != null ? (s.actual_cost === 0 ? 'actual_zero' : 'actual') : cost ? 'estimated_only' : billable > 0 ? 'missing' : 'zero_no_charge';
      if (svcCostState === 'estimated_only') S.estimated_only++;
      svcLines.push({
        id: s.id, cost_state: svcCostState, description: s.description || null, status: s.status || null, billable: r2(billable),
        est_cost: cost ?? null, actual_cost: s.actual_cost ?? null, invoiced: isInvoiced,
        draft_count: drafts?.size ?? 0, allocated: !!allocated, draft_amount: r2(draftAmt.get(s.id) ?? 0),
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
    // Live from current time entries + tasks (same rules as the workflow resolver; never the stored snapshot).
    const statusLabel = new Map(taskStatuses.map((s) => [s.id, (s.label || '').toLowerCase().trim()]));
    const isCancelled = (t) => ['cancelled', 'canceled'].includes(statusLabel.get(t.status_id));
    const isDone = (t) => ['done', 'completed', 'complete'].includes(statusLabel.get(t.status_id));
    const hoursByTask = new Map();
    for (const e of timeEntries) if (e.task_id) hoursByTask.set(e.task_id, (hoursByTask.get(e.task_id) || 0) + (Number(e.hours) || 0));
    const hoursLogged = timeEntries.reduce((a, t) => a + (Number(t.hours) || 0), 0);
    const L = { est: 0, logEst: 0, logUnest: 0, remaining: 0, openEst: 0, overrun: 0, cancelledHrs: 0 };
    const taskIds = new Set(tasks.map((t) => t.id));
    for (const t of tasks) {
      const logged = hoursByTask.get(t.id) || 0;
      if (isCancelled(t)) { L.cancelledHrs += logged; continue; }
      const est = t.estimated_hours > 0 ? t.estimated_hours : 0;
      if (est) { L.est += est; L.logEst += logged; } else L.logUnest += logged;
      if (est && !isDone(t)) { L.openEst++; L.remaining += Math.max(est - logged, 0); if (logged > est) L.overrun++; }
    }
    const unlinkedHrs = timeEntries.filter((e) => !e.task_id || !taskIds.has(e.task_id)).reduce((a, e) => a + (Number(e.hours) || 0), 0);

    // ── LABOR BILLING ── only BILLABLE tasks with an explicit rate (task override, else project rate) earn value.
    const projectRate = project.labor_billing_rate ?? null;
    const svcById = new Map(services.map((s) => [s.id, s]));
    const entriesByTask = new Map();
    for (const e of timeEntries) if (e.task_id) { const a = entriesByTask.get(e.task_id) || []; a.push({ id: e.id, work_date: e.work_date, hours: Number(e.hours) || 0, by: e.performed_by_name || null }); entriesByTask.set(e.task_id, a); }
    const LB = { billable: 0, included: 0, nonbill: 0, unclass: unlinkedHrs, cancelled: 0, toDate: 0, remHrs: 0, remAmt: 0, unpricedHrs: 0, unpricedTasks: 0, invalidLinks: 0, unclassTasks: 0 };
    const laborTasks = tasks.map((t) => {
      const logged = hoursByTask.get(t.id) || 0;
      const type = t.labor_billing_type || 'UNCLASSIFIED';
      const cancelled = isCancelled(t); const done = isDone(t);
      const rate = t.labor_rate_override ?? projectRate;
      const est = t.estimated_hours > 0 ? t.estimated_hours : 0;
      const remHrs = !cancelled && !done && est ? Math.max(est - logged, 0) : 0;
      const issues = [];
      let toDate = null, remAmt = null;
      if (cancelled) LB.cancelled += logged;
      else if (type === 'BILLABLE') {
        LB.billable += logged; LB.remHrs += remHrs;
        if (rate == null) { issues.push('rate_not_set'); LB.unpricedHrs += logged; LB.unpricedTasks++; }
        else { toDate = logged * rate; remAmt = remHrs * rate; LB.toDate += toDate; LB.remAmt += remAmt; }
      } else if (type === 'INCLUDED_IN_SERVICE') {
        LB.included += logged;
        if (!t.labor_service_commitment_id || !svcById.has(t.labor_service_commitment_id)) { issues.push('invalid_service_link'); LB.invalidLinks++; }
      } else if (type === 'NON_BILLABLE') LB.nonbill += logged;
      else { LB.unclass += logged; if (logged > 0 || remHrs > 0) LB.unclassTasks++; }
      return {
        id: t.id, name: t.name, status: statusLabel.get(t.status_id) || null, cancelled, done, estimated_hours: est || null,
        logged: r2(logged), remaining_hours: r2(remHrs), billing_type: type, service_commitment_id: t.labor_service_commitment_id || null,
        rate_override: t.labor_rate_override ?? null, effective_rate: rate, billable_to_date: toDate == null ? null : r2(toDate),
        projected_remaining: remAmt == null ? null : r2(remAmt), issues, entries: entriesByTask.get(t.id) || [],
      };
    });

    // ── WARNINGS ──
    if (P.missing_cost) warnings.push({ code: 'PARTS_MISSING_COST', count: P.missing_cost, message: `${P.missing_cost} part line(s) have no cost — estimated cost and margin are incomplete.` });
    if (S.missing_cost) warnings.push({ code: 'SERVICES_MISSING_COST', count: S.missing_cost, message: `${S.missing_cost} service(s) have no cost — estimated cost and margin are incomplete.` });
    // Stale stored totals are data-quality info only (calculated values are always used) — not a billing warning.
    const staleLines = partLines.filter((l) => l.stale_detail);
    const dataQuality = {
      stale_stored_totals: {
        count: staleLines.length,
        price_entered_later: staleLines.filter((l) => l.stale_detail.kind === 'price_entered_later').length,
        quantity_changed: staleLines.filter((l) => l.stale_detail.kind === 'quantity_changed').length,
        other: staleLines.filter((l) => l.stale_detail.kind === 'other').length,
      },
    };
    if (P.duplicate_draft + S.duplicate_draft) warnings.push({ code: 'DUPLICATE_DRAFT', count: P.duplicate_draft + S.duplicate_draft, message: 'Some items appear on more than one draft (or exceed uninvoiced quantity). Only one can be sent; the server blocks the rest.' });
    if (LB.invalidLinks) warnings.push({ code: 'LABOR_INVALID_SERVICE_LINK', count: LB.invalidLinks, message: `${LB.invalidLinks} task(s) are marked "included in service" but the linked service is missing. Review classification; the hours are not billed.` });
    if (LB.unpricedTasks) warnings.push({ code: 'LABOR_RATE_NOT_SET', count: LB.unpricedTasks, message: `${LB.unpricedTasks} billable task(s) have no billing rate — their ${r2(LB.unpricedHrs)}h are not priced.` });
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
        // Parts & Services figures above are unchanged; labor is additive and kept separate.
        labor_billable_to_date: r2(LB.toDate), labor_projected_remaining: r2(LB.remAmt),
        total_current_billable: r2(billable + LB.toDate),
        total_projected_billable: r2(billable + LB.toDate + LB.remAmt),
        labor_cost_configured: false,
      },
      labor_billing: {
        project_rate: projectRate, rate_set_by: project.labor_rate_set_by || null, rate_set_at: project.labor_rate_set_at || null,
        hours: { logged: r2(hoursLogged), billable: r2(LB.billable), included_in_service: r2(LB.included), non_billable: r2(LB.nonbill), unclassified: r2(LB.unclass), cancelled_tasks: r2(LB.cancelled), billable_unpriced: r2(LB.unpricedHrs) },
        billable_to_date: r2(LB.toDate), remaining_billable_hours: r2(LB.remHrs), projected_remaining: r2(LB.remAmt), projected_total: r2(LB.toDate + LB.remAmt),
        unclassified_tasks: LB.unclassTasks, invalid_service_links: LB.invalidLinks, unpriced_tasks: LB.unpricedTasks,
        tasks: laborTasks,
        services: services.map((s) => ({ id: s.id, description: s.description || '(no description)', status: s.status || null })),
      },
      categories: {
        parts: { billable: r2(P.billable), estimated_cost: r2(P.est_cost), actual_cost: P.actual_known ? r2(P.actual_cost) : null, actual_cost_lines: P.actual_known, estimated_only_lines: P.estimated_only, zero_cost_legit_lines: P.zero_legit, remaining_uninvoiced: r2(P.uninvoiced), allocated_to_drafts: r2(P.allocated), active_lines: activeCount.active, cancelled_lines: activeCount.cancelled, missing_cost: P.missing_cost },
        services: { billable: r2(S.billable), estimated_cost: r2(S.est_cost), actual_cost: S.actual_known ? r2(S.actual_cost) : null, actual_cost_lines: S.actual_known, estimated_only_lines: S.estimated_only, zero_cost_legit_lines: 0, remaining_uninvoiced: r2(S.uninvoiced), allocated_to_drafts: r2(S.allocated), lines: services.length, missing_cost: S.missing_cost },
      },
      invoices: {
        by_status: Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, { count: v.count, total: r2(v.total) }])),
        line_split: { final: { part: r2(lineSplit.final.part), service: r2(lineSplit.final.service), other: r2(lineSplit.final.other) }, draft: { part: r2(lineSplit.draft.part), service: r2(lineSplit.draft.service), other: r2(lineSplit.draft.other) } },
      },
      // Definitions: hours_logged = sum of TaskTimeEntry.hours; hours_estimated = sum of estimates on non-cancelled tasks;
      // hours_remaining = Σ over OPEN tasks of max(estimate − logged on that task, 0) (done tasks and overruns contribute 0).
      labor: {
        hours_logged: r2(hoursLogged), entries: timeEntries.length,
        hours_estimated: r2(L.est), hours_remaining: r2(L.remaining),
        hours_logged_estimated_tasks: r2(L.logEst), hours_logged_unestimated_tasks: r2(L.logUnest),
        hours_on_cancelled_tasks: r2(L.cancelledHrs), hours_unlinked: r2(unlinkedHrs),
        open_estimated_tasks: L.openEst, open_tasks_over_estimate: L.overrun,
        source: 'live',
      },
      lines: { parts: partLines, services: svcLines },
      warnings, data_quality: dataQuality,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});