import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * markInvoicePaid — UNIFIED: Payment mutation only
 *
 * PHASE 5 RULES:
 * 1. Transitions sent → paid ONLY
 * 2. Updates PartCommitment.billing_status to 'paid' for linked part lines
 * 3. Does NOT re-deduct credits (already done at sent time)
 * 4. Creates credit for deposit invoices or overpayment
 * 5. Idempotent: if already paid, returns success without changes
 */

function generatePaymentIdempotencyKey(invoiceId, timestamp) {
  const input = `payment:${invoiceId}:${Math.floor(timestamp / 60000)}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  return `pay_${Math.abs(hash).toString(36)}`;
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

    const { invoice_id, payment_date, paid_amount } = await req.json();

    if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });
    if (!payment_date) return Response.json({ error: 'payment_date required' }, { status: 400 });

    const invoices = await base44.entities.ProjectInvoice.filter({ id: invoice_id });
    if (invoices.length === 0) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }
    const invoice = invoices[0];

    // Idempotent
    if (invoice.status === 'paid') {
      return Response.json({
        success: true,
        idempotent: true,
        message: 'Invoice already paid — no changes made',
        invoice_id,
        status: 'paid',
      });
    }

    if (invoice.status !== 'sent') {
      return Response.json({ error: `Cannot mark as paid: invoice is ${invoice.status}, must be sent` }, { status: 400 });
    }

    const idempotencyKey = generatePaymentIdempotencyKey(invoice_id, Date.now());
    const subtotal = invoice.subtotal ?? 0;
    const creditApplied = invoice.credit_applied ?? 0;
    const balanceAfterCredit = Math.max(0, subtotal - creditApplied);
    const actualPaidAmount = paid_amount ?? balanceAfterCredit;

    // ── Fetch lines ──
    const invoiceLines = await base44.entities.ProjectInvoiceLine.filter({ invoice_id });

    // ══════════════════════════════════════
    // PHASE 1: Update source records to PAID
    // ══════════════════════════════════════
    const commitmentResults = [];

    for (const line of invoiceLines) {
      // Part commitments → paid
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
          if (c.billing_status === 'paid') {
            commitmentResults.push({ source_id: sourceId, status: 'skipped', reason: 'already_paid' });
            continue;
          }

          await base44.asServiceRole.entities.PartCommitment.update(sourceId, {
            billing_status: 'paid',
            invoice_blocked_reason: null,
          });
          commitmentResults.push({ source_id: sourceId, status: 'updated' });
        } catch (err) {
          console.error(`Failed to mark commitment ${sourceId} as paid:`, err);
          commitmentResults.push({ source_id: sourceId, status: 'error', error: err.message });
        }
      }

      // Services are already marked is_billed at sent time — no further update needed
    }

    // ══════════════════════════════════════
    // PHASE 2: Update invoice to PAID
    // ══════════════════════════════════════
    await base44.asServiceRole.entities.ProjectInvoice.update(invoice_id, {
      status: 'paid',
      payment_date,
      paid_amount: actualPaidAmount,
      balance_due: Math.max(0, balanceAfterCredit - actualPaidAmount),
      payment_idempotency_key: idempotencyKey,
    });

    // ══════════════════════════════════════
    // PHASE 3: Credit from deposit/overpayment
    // ══════════════════════════════════════
    let creditCreated = null;
    const isDeposit = invoice.invoice_type === 'deposit';
    const hasOverpayment = actualPaidAmount > balanceAfterCredit;

    if (isDeposit && actualPaidAmount > 0) {
      // Check idempotency
      const existing = await base44.entities.ProjectCreditLedger.filter({ source_invoice_id: invoice_id });
      if (existing.length > 0) {
        creditCreated = { credit_id: existing[0].id, amount: existing[0].credit_amount, type: 'deposit', already_existed: true };
      } else {
        const credit = await base44.asServiceRole.entities.ProjectCreditLedger.create({
          project_id: invoice.project_id,
          source_invoice_id: invoice_id,
          credit_amount: actualPaidAmount,
          remaining_amount: actualPaidAmount,
          notes: `Deposit payment from invoice ${invoice.qb_invoice_number || invoice_id}`,
        });
        creditCreated = { credit_id: credit.id, amount: actualPaidAmount, type: 'deposit' };
      }
    } else if (hasOverpayment) {
      const overage = actualPaidAmount - balanceAfterCredit;
      const credit = await base44.asServiceRole.entities.ProjectCreditLedger.create({
        project_id: invoice.project_id,
        source_invoice_id: invoice_id,
        credit_amount: overage,
        remaining_amount: overage,
        notes: `Overpayment from invoice ${invoice.qb_invoice_number || invoice_id}`,
      });
      creditCreated = { credit_id: credit.id, amount: overage, type: 'overpayment' };
    }

    return Response.json({
      success: true,
      invoice_id,
      status: 'paid',
      payment_date,
      subtotal,
      credit_applied: creditApplied,
      balance_due: Math.max(0, balanceAfterCredit - actualPaidAmount),
      paid_amount: actualPaidAmount,
      credit_created: creditCreated,
      commitments_updated: commitmentResults.filter(r => r.status === 'updated').length,
      commitment_results: commitmentResults,
      idempotency_key: idempotencyKey,
    });
  } catch (error) {
    console.error('markInvoicePaid error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});