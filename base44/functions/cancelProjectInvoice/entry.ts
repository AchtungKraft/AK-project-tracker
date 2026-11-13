import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * cancelProjectInvoice — UNIFIED (admin only)
 *
 * PHASE 6 RULES:
 * - Draft: No source records were mutated, so just cancel invoice + reverse proposed credit (no ledger changes needed since credit wasn't deducted)
 * - Sent: Source records WERE mutated — must reverse commitment billing state AND restore credit ledger
 * - Paid: Cannot cancel (use refund flow)
 *
 * PHASE 2U.1 HARDENING (reversal semantics unchanged):
 * - Admin only.
 * - Draft cancel is a conditional update (status must still be 'draft'), so a draft sent concurrently is never
 *   cancelled without its reversal.
 * - Sent cancel runs under the same per-project billing lock markInvoiceSent / markInvoicePaid use, re-reads the
 *   invoice inside the lock, and cancels with a conditional update (status must still be 'sent').
 */

const STALE_MS = 120000;

function generateReversalKey(invoiceId) {
  return `reverse_credit_${invoiceId}`;
}

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
    .catch((e) => console.error('[cancelProjectInvoice] lock release failed', e.message));
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
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { invoice_id, reason } = await req.json().catch(() => ({}));
    if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });

    const sr = base44.asServiceRole.entities;
    const invoices = await base44.entities.ProjectInvoice.filter({ id: invoice_id });
    if (invoices.length === 0) return Response.json({ error: 'Invoice not found' }, { status: 404 });
    const invoice = invoices[0];

    // Idempotent
    if (invoice.status === 'cancelled') {
      return Response.json({ success: true, idempotent: true, message: 'Already cancelled', invoice_id });
    }

    if (invoice.status === 'paid') {
      return Response.json({ error: 'Cannot cancel a paid invoice. Use refund flow.' }, { status: 400 });
    }

    if (!['draft', 'sent'].includes(invoice.status)) {
      return Response.json({ error: `Cannot cancel invoice in status: ${invoice.status}` }, { status: 400 });
    }

    const reversalKey = generateReversalKey(invoice_id);

    // ══════════════════════════════════════
    // DRAFT CANCELLATION — No source rollback needed
    // ══════════════════════════════════════
    if (invoice.status === 'draft') {
      // Draft never mutated sources or ledger. Just cancel — only if it is still a draft.
      const won = (await sr.ProjectInvoice.updateMany({ id: invoice_id, status: 'draft' }, { $set: {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.email,
        cancellation_reason: reason || 'Draft cancelled',
      } })).updated === 1;
      if (!won) {
        return Response.json({ success: false, code: 'INVOICE_CHANGED', error: 'Invoice status changed while cancelling. Refresh and try again.' }, { status: 409 });
      }

      return Response.json({
        success: true,
        invoice_id,
        previous_status: 'draft',
        new_status: 'cancelled',
        source_rollback_needed: false,
        credit_reversed: 0,
      });
    }

    // ══════════════════════════════════════
    // SENT CANCELLATION — Must reverse source mutations + credit (serialized per project)
    // ══════════════════════════════════════
    const release = await acquireBillingLock(sr, invoice.project_id, `cancel_${invoice_id}`);
    if (!release) {
      return Response.json({ success: false, code: 'BILLING_LOCKED', error: 'Another billing action for this project is in progress. Try again in a moment.' }, { status: 409 });
    }

    try {
      const [fresh] = await sr.ProjectInvoice.filter({ id: invoice_id });
      if (!fresh || fresh.status !== 'sent') {
        return Response.json({ success: false, code: 'INVOICE_CHANGED', error: `Invoice is now ${fresh?.status || 'missing'}; nothing was reversed. Refresh and try again.` }, { status: 409 });
      }

      const lines = await base44.entities.ProjectInvoiceLine.filter({ invoice_id });
      const commitmentResults = [];
      const serviceResults = [];
      let creditReversed = 0;

      // Phase 1: Reverse part commitment billing state
      for (const line of lines) {
        if (line.type === 'part') {
          const sourceId = line.source_id || line.part_commitment_id;
          if (!sourceId) continue;

          try {
            const commitments = await base44.entities.PartCommitment.filter({ id: sourceId });
            if (commitments.length === 0) {
              commitmentResults.push({ source_id: sourceId, status: 'skipped', reason: 'not_found' });
              continue;
            }
            const c = commitments[0];

            // Revert invoiced_qty and invoiced_amount
            const revertedQty = Math.max(0, (c.invoiced_qty ?? 0) - (line.qty ?? 0));
            const revertedAmount = Math.max(0, (c.invoiced_amount ?? 0) - (line.line_total ?? 0));
            const newStatus = revertedQty <= 0 ? 'unbilled' : 'invoiced';

            await sr.PartCommitment.update(sourceId, {
              invoiced_qty: revertedQty,
              invoiced_amount: revertedAmount,
              billing_status: newStatus,
            });

            commitmentResults.push({ source_id: sourceId, status: 'reverted', from: c.billing_status, to: newStatus });
          } catch (err) {
            commitmentResults.push({ source_id: sourceId, status: 'error', error: err.message });
          }
        }

        if (line.type === 'service') {
          const sourceId = line.source_id;
          if (!sourceId) continue;

          try {
            const [scCurrent] = await base44.entities.ServiceCommitment.filter({ id: sourceId });
            if (scCurrent && scCurrent.invoice_id && scCurrent.invoice_id !== invoice_id) {
              serviceResults.push({ source_id: sourceId, status: 'skipped', reason: 'billed_on_other_invoice' });
              continue;
            }
            await sr.ServiceCommitment.update(sourceId, {
              is_billed: false,
              invoice_id: null,
              billed_date: null,
              status: 'completed', // PHASE 3 FIX: Reset status from 'billed' back to 'completed'
            });
            serviceResults.push({ source_id: sourceId, status: 'reverted' });
          } catch (err) {
            serviceResults.push({ source_id: sourceId, status: 'error', error: err.message });
          }
        }
      }

      // Phase 2: Reverse credit deduction (create new credit entry)
      const creditApplied = fresh.credit_applied ?? 0;
      if (creditApplied > 0) {
        const existing = await base44.entities.ProjectCreditLedger.filter({ project_id: fresh.project_id });
        const alreadyReversed = existing.some(c => c.reversal_idempotency_key === reversalKey);

        if (!alreadyReversed) {
          await sr.ProjectCreditLedger.create({
            project_id: fresh.project_id,
            source_invoice_id: invoice_id,
            credit_amount: creditApplied,
            remaining_amount: creditApplied,
            notes: `Credit reversal from cancelled invoice ${fresh.qb_invoice_number || invoice_id}`,
            reversed_from_invoice_id: invoice_id,
            reversal_idempotency_key: reversalKey,
          });
        }
        creditReversed = creditApplied;
      }

      // Phase 3: Cancel invoice (still 'sent' — guaranteed by the lock + re-read above)
      await sr.ProjectInvoice.updateMany({ id: invoice_id, status: 'sent' }, { $set: {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.email,
        cancellation_reason: reason || null,
        credit_reversed: creditReversed,
        reversal_idempotency_key: reversalKey,
      } });

      return Response.json({
        success: true,
        invoice_id,
        previous_status: 'sent',
        new_status: 'cancelled',
        source_rollback_needed: true,
        commitment_results: commitmentResults,
        service_results: serviceResults,
        credit_reversed: creditReversed,
      });
    } finally {
      await release();
    }
  } catch (error) {
    console.error('cancelProjectInvoice error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});