import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * deleteDraftInvoice — admin only.
 * Deletes an unused DRAFT invoice. Drafts never mutate PartCommitment/ServiceCommitment billing state
 * (createProjectInvoiceDraft / markInvoiceSent contract), so removing the draft's lines is all it takes
 * for those items to be invoiceable again. Source records are never touched.
 *
 * Audit: the invoice header is kept as a cancelled stub (cancelled_by/at + DRAFT_DELETED reason with a
 * line snapshot), plus an ActivityLog row. Any number on the draft stays recorded and is never reused.
 * Runs under the same per-project billing lock as markInvoiceSent / cancelProjectInvoice.
 * Idempotent: a retry finishes removing lines left by an interrupted run.
 */

const STALE_MS = 120000;
const MARK = 'DRAFT_DELETED';
const r2 = (n) => Math.round((n || 0) * 100) / 100;

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
    .catch((e) => console.error('[deleteDraftInvoice] lock release failed', e.message));
}

async function deleteLines(sr, invoiceId) {
  const lines = await sr.ProjectInvoiceLine.filter({ invoice_id: invoiceId });
  for (let i = 0; i < lines.length; i += 6) {
    await Promise.all(lines.slice(i, i + 6).map((l) => sr.ProjectInvoiceLine.delete(l.id)));
  }
  return lines;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status) ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { invoice_id, check_only = false } = await req.json().catch(() => ({}));
    if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });

    const sr = base44.asServiceRole.entities;
    const invoice = await sr.ProjectInvoice.get(invoice_id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    // Retry of an interrupted delete: finish removing lines.
    if (invoice.status === 'cancelled' && (invoice.cancellation_reason || '').startsWith(MARK)) {
      const removed = await deleteLines(sr, invoice_id);
      return Response.json({ success: true, idempotent: true, invoice_id, lines_removed: removed.length });
    }

    const conflicts = async (inv) => {
      const out = [];
      if (inv.status !== 'draft') out.push({ code: 'NOT_DRAFT', message: `Invoice is ${inv.status}. Only drafts can be deleted.` });
      if ((inv.paid_amount ?? 0) > 0) out.push({ code: 'HAS_PAID_AMOUNT', message: `Invoice shows ${r2(inv.paid_amount)} paid.` });
      if ((inv.credit_applied ?? 0) > 0) out.push({ code: 'CREDIT_APPLIED', message: `Credit of ${r2(inv.credit_applied)} is applied.` });
      if ((inv.credit_application_plan || []).length || inv.credit_plan_state) out.push({ code: 'CREDIT_IN_PROGRESS', message: 'A credit application was started for this invoice (send in progress or interrupted).' });
      const [payments, allocations, services] = await Promise.all([
        sr.ProjectInvoicePayment.filter({ invoice_id }),
        sr.CreditAllocation.filter({ invoice_id }).catch(() => []),
        sr.ServiceCommitment.filter({ invoice_id }),
      ]);
      if (payments.length) out.push({ code: 'HAS_PAYMENTS', message: `${payments.length} payment record(s) are linked (including reversed ones).` });
      if (allocations.length) out.push({ code: 'HAS_CREDIT_ALLOCATIONS', message: `${allocations.length} credit allocation(s) are linked.` });
      if (services.length) out.push({ code: 'SERVICE_BILLED_ON_DRAFT', message: `${services.length} service(s) are marked billed against this draft.` });
      return out;
    };

    const pre = await conflicts(invoice);
    if (pre.length) return Response.json({ success: false, code: 'DELETE_BLOCKED', conflicts: pre, error: pre.map((c) => c.message).join(' ') }, { status: 409 });
    if (check_only) return Response.json({ success: true, can_delete: true, invoice_id });

    const release = await acquireBillingLock(sr, invoice.project_id, `deletedraft_${invoice_id}`);
    if (!release) return Response.json({ success: false, code: 'BILLING_LOCKED', error: 'Another billing action for this project is in progress. Try again in a moment.' }, { status: 409 });

    try {
      const fresh = await sr.ProjectInvoice.get(invoice_id);
      const late = await conflicts(fresh);
      if (late.length) return Response.json({ success: false, code: 'DELETE_BLOCKED', conflicts: late, error: late.map((c) => c.message).join(' ') }, { status: 409 });

      const lines = await sr.ProjectInvoiceLine.filter({ invoice_id });
      const snapshot = {
        number: fresh.qb_invoice_number || null, type: fresh.invoice_type, subtotal: r2(fresh.subtotal), total: r2(fresh.total),
        credit_proposed: r2(fresh.credit_proposed), line_count: lines.length,
        lines: lines.map((l) => ({ type: l.type, source_id: l.source_id || l.part_commitment_id || null, description: (l.description || '').slice(0, 80), qty: l.qty ?? null, line_total: r2(l.line_total) })),
      };
      const now = new Date().toISOString();
      const won = (await sr.ProjectInvoice.updateMany({ id: invoice_id, status: 'draft' }, { $set: {
        status: 'cancelled', cancelled_at: now, cancelled_by: user.email,
        cancellation_reason: `${MARK}: ${JSON.stringify(snapshot)}`.slice(0, 8000),
      } })).updated === 1;
      if (!won) return Response.json({ success: false, code: 'INVOICE_CHANGED', error: 'Invoice changed while deleting. Refresh and try again.' }, { status: 409 });

      await deleteLines(sr, invoice_id);
      await sr.ActivityLog.create({
        action: 'Draft Invoice Deleted', related_project_id: fresh.project_id, user_email: user.email,
        notes: JSON.stringify({ invoice_id, deleted_at: now, ...snapshot, lines: undefined }),
      });

      return Response.json({ success: true, invoice_id, lines_removed: lines.length, subtotal: snapshot.subtotal, deleted_by: user.email, deleted_at: now });
    } finally {
      await release();
    }
  } catch (error) {
    console.error('deleteDraftInvoice error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});