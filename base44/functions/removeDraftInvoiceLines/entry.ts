import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * removeDraftInvoiceLines — admin only. Removes specific lines from an unused DRAFT invoice.
 * Narrow by design: only the listed line ids are deleted; other lines are never rewritten;
 * credits are never recalculated (blocked if the draft carries any proposed/applied credit).
 * Source records (PartCommitment / ServiceCommitment) are never touched — drafts don't mutate them.
 * Same protected-transaction checks and per-project billing lock as deleteDraftInvoice.
 * Audit: ActivityLog rows with the before snapshot (written first) and the after result.
 * Payload: { invoice_id, line_ids: [], expected_line_totals?: {id: amount}, expected_remaining_total?, reason?, check_only? }
 */

const STALE_MS = 120000;
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const lineSnap = (l) => ({ id: l.id, type: l.type, source_entity: l.source_entity || null, source_id: l.source_id || l.part_commitment_id || null,
  description: (l.description || '').slice(0, 80), qty: l.qty ?? null, unit_price: l.unit_price ?? null, line_total: r2(l.line_total) });

async function acquireBillingLock(sr, projectId, owner) {
  const token = `${owner}_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const cas = async (q, set) => (await sr.Project.updateMany(q, { $set: set })).updated;
  let ok = (await cas({ id: projectId, billing_lock_token: null }, { billing_lock_token: token, billing_lock_at: now })) === 1;
  if (!ok) {
    const p = await sr.Project.get(projectId).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (p?.billing_lock_token && p.billing_lock_at && Date.now() - new Date(p.billing_lock_at).getTime() > STALE_MS) {
      ok = (await cas({ id: projectId, billing_lock_token: p.billing_lock_token }, { billing_lock_token: token, billing_lock_at: now })) === 1;
    }
  }
  if (!ok) return null;
  return () => cas({ id: projectId, billing_lock_token: token }, { billing_lock_token: null, billing_lock_at: null })
    .catch((e) => console.error('[removeDraftInvoiceLines] lock release failed', e.message));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status) ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { invoice_id, line_ids, expected_line_totals = {}, expected_remaining_total, reason = '', check_only = false } = await req.json().catch(() => ({}));
    if (!invoice_id || !Array.isArray(line_ids) || !line_ids.length) return Response.json({ error: 'invoice_id and line_ids[] required' }, { status: 400 });
    const targetIds = [...new Set(line_ids)];

    const sr = base44.asServiceRole.entities;
    const invoice = await sr.ProjectInvoice.get(invoice_id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    const validate = async (inv) => {
      const out = [];
      if (inv.status !== 'draft') out.push({ code: 'NOT_DRAFT', message: `Invoice is ${inv.status}.` });
      if ((inv.paid_amount ?? 0) > 0) out.push({ code: 'HAS_PAID_AMOUNT', message: `Invoice shows ${r2(inv.paid_amount)} paid.` });
      if ((inv.credit_applied ?? 0) > 0) out.push({ code: 'CREDIT_APPLIED', message: 'Credit is applied.' });
      if ((inv.credit_proposed ?? 0) > 0) out.push({ code: 'CREDIT_PROPOSED', message: 'Draft carries proposed credit; this action never recalculates credit.' });
      if ((inv.credit_application_plan || []).length || inv.credit_plan_state) out.push({ code: 'CREDIT_IN_PROGRESS', message: 'A credit application was started.' });
      const [payments, allocations, services, lines] = await Promise.all([
        sr.ProjectInvoicePayment.filter({ invoice_id }),
        sr.CreditAllocation.filter({ invoice_id }).catch(() => []),
        sr.ServiceCommitment.filter({ invoice_id }),
        sr.ProjectInvoiceLine.filter({ invoice_id }),
      ]);
      if (payments.length) out.push({ code: 'HAS_PAYMENTS', message: `${payments.length} payment record(s) linked.` });
      if (allocations.length) out.push({ code: 'HAS_CREDIT_ALLOCATIONS', message: `${allocations.length} credit allocation(s) linked.` });
      if (services.length) out.push({ code: 'SERVICE_BILLED_ON_DRAFT', message: `${services.length} service(s) marked billed against this draft.` });
      const byId = Object.fromEntries(lines.map((l) => [l.id, l]));
      const targets = targetIds.map((id) => byId[id]).filter(Boolean);
      const missing = targetIds.filter((id) => !byId[id]);
      const remaining = lines.filter((l) => !targetIds.includes(l.id));
      const remainingTotal = r2(remaining.reduce((a, l) => a + (l.line_total || 0), 0));
      // Resume after an interrupted run: header already reflects the removal and only target lines are left over.
      const resuming = missing.length > 0 && r2(inv.subtotal) === remainingTotal;
      if (!targets.length) out.push({ code: 'NO_MATCHING_LINES', message: 'None of the requested lines are on this draft; nothing would be removed.' });
      else if (missing.length && !resuming) out.push({ code: 'LINES_NOT_ON_INVOICE', message: `Line(s) not on this invoice: ${missing.join(', ')}` });
      for (const t of targets) {
        if (expected_line_totals[t.id] !== undefined && r2(expected_line_totals[t.id]) !== r2(t.line_total)) {
          out.push({ code: 'LINE_AMOUNT_MISMATCH', message: `Line ${t.id} is ${r2(t.line_total)}, expected ${r2(expected_line_totals[t.id])}.` });
        }
      }
      if (!resuming && r2(inv.subtotal) !== r2(lines.reduce((a, l) => a + (l.line_total || 0), 0))) out.push({ code: 'HEADER_LINE_MISMATCH', message: 'Invoice subtotal does not match its lines.' });
      if (expected_remaining_total !== undefined && r2(expected_remaining_total) !== remainingTotal) out.push({ code: 'REMAINING_TOTAL_MISMATCH', message: `Remaining total would be ${remainingTotal}, expected ${r2(expected_remaining_total)}.` });
      return { conflicts: out, targets, remaining, remainingTotal, resuming };
    };

    const pre = await validate(invoice);
    if (pre.conflicts.length) return Response.json({ success: false, code: 'REMOVE_BLOCKED', conflicts: pre.conflicts }, { status: 409 });
    if (check_only) return Response.json({ success: true, can_remove: true, invoice_id, removing: pre.targets.map(lineSnap), remaining_total: pre.remainingTotal, remaining_line_count: pre.remaining.length });

    const release = await acquireBillingLock(sr, invoice.project_id, `rmlines_${invoice_id}`);
    if (!release) return Response.json({ success: false, code: 'BILLING_LOCKED', error: 'Another billing action for this project is in progress. Try again in a moment.' }, { status: 409 });

    try {
      const fresh = await sr.ProjectInvoice.get(invoice_id);
      const v = await validate(fresh);
      if (v.conflicts.length) return Response.json({ success: false, code: 'REMOVE_BLOCKED', conflicts: v.conflicts }, { status: 409 });

      const now = new Date().toISOString();
      const before = { invoice_id, subtotal: r2(fresh.subtotal), total: r2(fresh.total), balance_due: r2(fresh.balance_due),
        line_count: v.targets.length + v.remaining.length, removing: v.targets.map(lineSnap), kept_line_ids: v.remaining.map((l) => l.id), reason };
      const beforeLog = await sr.ActivityLog.create({ action: 'Draft Invoice Lines Removal Started', related_project_id: fresh.project_id, user_email: user.email,
        notes: JSON.stringify({ at: now, ...before }).slice(0, 20000) });

      if (!v.resuming) {
        const won = (await sr.ProjectInvoice.updateMany({ id: invoice_id, status: 'draft', subtotal: fresh.subtotal, total: fresh.total },
          { $set: { subtotal: v.remainingTotal, total: v.remainingTotal, balance_due: r2(v.remainingTotal - (fresh.credit_proposed || 0)) } })).updated === 1;
        if (!won) return Response.json({ success: false, code: 'INVOICE_CHANGED', error: 'Invoice changed during the update. Refresh and try again.' }, { status: 409 });
      }
      for (const t of v.targets) await sr.ProjectInvoiceLine.delete(t.id);

      const after = { invoice_id, subtotal: v.remainingTotal, total: v.remainingTotal, line_count: v.remaining.length, removed_line_ids: v.targets.map((t) => t.id), resumed: v.resuming };
      const afterLog = await sr.ActivityLog.create({ action: 'Draft Invoice Lines Removed', related_project_id: fresh.project_id, user_email: user.email,
        notes: JSON.stringify({ at: new Date().toISOString(), before_log_id: beforeLog.id, before: { subtotal: before.subtotal, line_count: before.line_count }, after }) });

      return Response.json({ success: true, invoice_id, before, after, audit_ids: { before: beforeLog.id, after: afterLog.id }, by: user.email });
    } finally {
      await release();
    }
  } catch (error) {
    console.error('removeDraftInvoiceLines error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});