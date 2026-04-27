import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * cancelProjectInvoice — UNIFIED
 *
 * PHASE 6 RULES:
 * - Draft: No source records were mutated, so just cancel invoice + reverse proposed credit (no ledger changes needed since credit wasn't deducted)
 * - Sent: Source records WERE mutated — must reverse commitment billing state AND restore credit ledger
 * - Paid: Cannot cancel (use refund flow)
 */

function generateReversalKey(invoiceId) {
  return `reverse_credit_${invoiceId}`;
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

    const { invoice_id, reason } = await req.json();
    if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });

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

    const lines = await base44.entities.ProjectInvoiceLine.filter({ invoice_id });
    const reversalKey = generateReversalKey(invoice_id);
    const commitmentResults = [];
    const serviceResults = [];
    let creditReversed = 0;

    // ══════════════════════════════════════
    // DRAFT CANCELLATION — No source rollback needed
    // ══════════════════════════════════════
    if (invoice.status === 'draft') {
      // Draft never mutated sources or ledger. Just cancel.
      await base44.asServiceRole.entities.ProjectInvoice.update(invoice_id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.email,
        cancellation_reason: reason || 'Draft cancelled',
      });

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
    // SENT CANCELLATION — Must reverse source mutations + credit
    // ══════════════════════════════════════

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

          await base44.asServiceRole.entities.PartCommitment.update(sourceId, {
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
          await base44.asServiceRole.entities.ServiceCommitment.update(sourceId, {
            is_billed: false,
            invoice_id: null,
            billed_date: null,
          });
          serviceResults.push({ source_id: sourceId, status: 'reverted' });
        } catch (err) {
          serviceResults.push({ source_id: sourceId, status: 'error', error: err.message });
        }
      }
    }

    // Phase 2: Reverse credit deduction (create new credit entry)
    const creditApplied = invoice.credit_applied ?? 0;
    if (creditApplied > 0) {
      const existing = await base44.entities.ProjectCreditLedger.filter({ project_id: invoice.project_id });
      const alreadyReversed = existing.some(c => c.reversal_idempotency_key === reversalKey);

      if (!alreadyReversed) {
        await base44.asServiceRole.entities.ProjectCreditLedger.create({
          project_id: invoice.project_id,
          source_invoice_id: invoice_id,
          credit_amount: creditApplied,
          remaining_amount: creditApplied,
          notes: `Credit reversal from cancelled invoice ${invoice.qb_invoice_number || invoice_id}`,
          reversed_from_invoice_id: invoice_id,
          reversal_idempotency_key: reversalKey,
        });
        creditReversed = creditApplied;
      } else {
        creditReversed = creditApplied; // Already reversed
      }
    }

    // Phase 3: Cancel invoice
    await base44.asServiceRole.entities.ProjectInvoice.update(invoice_id, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.email,
      cancellation_reason: reason || null,
      credit_reversed: creditReversed,
      reversal_idempotency_key: reversalKey,
    });

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
  } catch (error) {
    console.error('cancelProjectInvoice error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});