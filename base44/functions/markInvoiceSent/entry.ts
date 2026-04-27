import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * markInvoiceSent — UNIFIED: Mutate billing state ONLY here
 *
 * PHASE 4 RULES:
 * 1. Transitions draft → sent ONLY
 * 2. For part lines: update PartCommitment.invoiced_qty/invoiced_amount, set billing_status=invoiced
 * 3. For service lines: set ServiceCommitment.is_billed=true, invoice_id
 * 4. Deduct credit from ProjectCreditLedger HERE (single deduction point)
 * 5. This is the ONLY function that mutates source billing state
 */

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

    const { invoice_id, qb_invoice_number, issue_date, due_date } = await req.json();

    if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });
    if (!qb_invoice_number) return Response.json({ error: 'qb_invoice_number required' }, { status: 400 });
    if (!issue_date) return Response.json({ error: 'issue_date required' }, { status: 400 });
    if (!due_date) return Response.json({ error: 'due_date required' }, { status: 400 });

    // Fetch invoice
    const invoices = await base44.entities.ProjectInvoice.filter({ id: invoice_id });
    if (invoices.length === 0) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }
    const invoice = invoices[0];

    if (invoice.status !== 'draft') {
      return Response.json({ error: `Cannot mark as sent: invoice is ${invoice.status}, must be draft` }, { status: 400 });
    }

    // Fetch lines
    const lines = await base44.entities.ProjectInvoiceLine.filter({ invoice_id });

    // ══════════════════════════════════════════════
    // PHASE 1: Mutate source records (billing state)
    // ══════════════════════════════════════════════
    const commitmentUpdates = [];
    const serviceUpdates = [];
    const failures = [];

    for (const line of lines) {
      // ── PART ──
      if (line.type === 'part') {
        const sourceId = line.source_id || line.part_commitment_id;
        if (!sourceId) continue;

        try {
          const commitments = await base44.entities.PartCommitment.filter({ id: sourceId });
          if (commitments.length === 0) {
            failures.push({ source_id: sourceId, type: 'part', error: 'PartCommitment not found' });
            continue;
          }

          const commitment = commitments[0];
          const currentInvoicedQty = commitment.invoiced_qty ?? 0;
          const currentInvoicedAmount = commitment.invoiced_amount ?? 0;
          const newInvoicedQty = currentInvoicedQty + (line.qty ?? 0);
          const newInvoicedAmount = currentInvoicedAmount + (line.line_total ?? 0);

          await base44.asServiceRole.entities.PartCommitment.update(sourceId, {
            invoiced_qty: newInvoicedQty,
            invoiced_amount: newInvoicedAmount,
            billing_status: 'invoiced',
          });

          commitmentUpdates.push({
            source_id: sourceId,
            qty_added: line.qty ?? 0,
            amount_added: line.line_total ?? 0,
            new_invoiced_qty: newInvoicedQty,
            new_invoiced_amount: newInvoicedAmount,
          });
        } catch (err) {
          failures.push({ source_id: sourceId, type: 'part', error: err.message });
        }
      }

      // ── SERVICE ──
      if (line.type === 'service') {
        const sourceId = line.source_id;
        if (!sourceId) continue;

        try {
          await base44.asServiceRole.entities.ServiceCommitment.update(sourceId, {
            is_billed: true,
            invoice_id: invoice_id,
            billed_date: new Date().toISOString().split('T')[0],
            status: 'billed',
          });

          serviceUpdates.push({
            source_id: sourceId,
            amount_billed: line.line_total ?? 0,
          });
        } catch (err) {
          console.error(`[markInvoiceSent] Failed to mark service ${sourceId} as billed:`, err.message);
          failures.push({ source_id: sourceId, type: 'service', error: err.message });
        }
      }
    }

    // If ANY mutation failed, abort (don't partially send)
    if (failures.length > 0) {
      // Rollback part commitment updates
      for (const update of commitmentUpdates) {
        try {
          const commitments = await base44.entities.PartCommitment.filter({ id: update.source_id });
          if (commitments.length > 0) {
            const c = commitments[0];
            await base44.asServiceRole.entities.PartCommitment.update(update.source_id, {
              invoiced_qty: Math.max(0, (c.invoiced_qty ?? 0) - update.qty_added),
              invoiced_amount: Math.max(0, (c.invoiced_amount ?? 0) - update.amount_added),
              billing_status: 'unbilled',
            });
          }
        } catch (rollbackErr) {
          console.error(`Rollback failed for ${update.source_id}:`, rollbackErr);
        }
      }
      // Rollback service updates
      for (const update of serviceUpdates) {
        try {
          await base44.asServiceRole.entities.ServiceCommitment.update(update.source_id, {
            is_billed: false,
            invoice_id: null,
            billed_date: null,
          });
        } catch (rollbackErr) {
          console.error(`Service rollback failed for ${update.source_id}:`, rollbackErr);
        }
      }

      return Response.json({
        success: false,
        error: 'Some source record updates failed — invoice NOT sent, all changes rolled back',
        failures,
      }, { status: 500 });
    }

    // ══════════════════════════════════════════════
    // PHASE 2: Deduct credit (SINGLE deduction point)
    // ══════════════════════════════════════════════
    const creditToApply = invoice.credit_proposed ?? invoice.credit_applied ?? 0;
    let actualCreditApplied = 0;
    const creditIdempotencyKey = `inv_sent_${invoice_id}_${Date.now()}`;

    if (creditToApply > 0) {
      const credits = await base44.entities.ProjectCreditLedger.filter({
        project_id: invoice.project_id,
      });

      const availableCredits = credits
        .filter(c => (c.remaining_amount ?? 0) > 0)
        .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

      let remainingToApply = creditToApply;

      for (const credit of availableCredits) {
        if (remainingToApply <= 0) break;
        const available = credit.remaining_amount ?? 0;
        const toApply = Math.min(available, remainingToApply);
        if (toApply <= 0) continue;

        await base44.asServiceRole.entities.ProjectCreditLedger.update(credit.id, {
          remaining_amount: available - toApply,
          applied_to_invoice_id: invoice_id,
          credit_idempotency_key: creditIdempotencyKey,
        });

        actualCreditApplied += toApply;
        remainingToApply -= toApply;
      }
    }

    const balanceDue = Math.max(0, (invoice.subtotal ?? 0) - actualCreditApplied);

    // ══════════════════════════════════════════════
    // PHASE 3: Update invoice to SENT
    // ══════════════════════════════════════════════
    await base44.asServiceRole.entities.ProjectInvoice.update(invoice_id, {
      status: 'sent',
      qb_invoice_number,
      issue_date,
      due_date,
      credit_applied: actualCreditApplied,
      balance_due: balanceDue,
      credit_idempotency_key: creditIdempotencyKey,
    });

    return Response.json({
      success: true,
      invoice_id,
      status: 'sent',
      qb_invoice_number,
      issue_date,
      due_date,
      credit_proposed: creditToApply,
      credit_applied: actualCreditApplied,
      balance_due: balanceDue,
      commitment_updates: commitmentUpdates,
      service_updates: serviceUpdates,
    });
  } catch (error) {
    console.error('markInvoiceSent error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});