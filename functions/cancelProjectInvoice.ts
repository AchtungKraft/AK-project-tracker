import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * cancelProjectInvoice - STABILIZATION: Invoice Cancellation with Credit Reversal
 * 
 * Cancels a draft or sent invoice, reversing any credit that was applied.
 * 
 * CRITICAL RULES:
 * 1. Cannot cancel a PAID invoice (use refund flow instead)
 * 2. If credit_applied > 0, credit MUST be reversed to ProjectCreditLedger
 * 3. Idempotent: cancelling twice does not reverse credit twice
 * 4. Linked commitments revert to 'unbilled' status
 * 
 * Inputs:
 * - invoice_id (required)
 * - reason (optional): cancellation reason
 * 
 * Returns:
 * - success, invoice status, credit_reversed, commitments_reverted
 */

// Generate deterministic reversal idempotency key
function generateReversalIdempotencyKey(invoiceId) {
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

    const payload = await req.json();
    const { invoice_id, reason } = payload;

    // Validate required fields
    if (!invoice_id) {
      return Response.json({ error: 'invoice_id required' }, { status: 400 });
    }

    // Fetch invoice
    const invoices = await base44.entities.ProjectInvoice.filter({ id: invoice_id });
    if (invoices.length === 0) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const invoice = invoices[0];

    // IDEMPOTENCY: If already cancelled, return success without changes
    if (invoice.status === 'cancelled') {
      return Response.json({ 
        success: true,
        idempotent: true,
        message: 'Invoice already cancelled - no changes made',
        invoice_id,
        status: 'cancelled',
      });
    }

    // Cannot cancel PAID invoices
    if (invoice.status === 'paid') {
      return Response.json({ 
        error: 'Cannot cancel a paid invoice. Use refund flow instead.',
        invoice_id,
        status: invoice.status,
      }, { status: 400 });
    }

    // Valid states for cancellation: draft, sent
    if (!['draft', 'sent'].includes(invoice.status)) {
      return Response.json({ 
        error: `Cannot cancel invoice in status: ${invoice.status}`,
      }, { status: 400 });
    }

    const reversalIdempotencyKey = generateReversalIdempotencyKey(invoice_id);
    const creditApplied = invoice.credit_applied ?? 0;

    // ===== PHASE 1: Revert linked commitments to 'unbilled' (ATOMIC) =====
    // HARDENING: This phase MUST succeed entirely BEFORE credit reversal or invoice update
    const invoiceLines = await base44.entities.ProjectInvoiceLine.filter({
      invoice_id: invoice_id,
    });

    const commitmentIds = invoiceLines
      .filter(line => line.part_commitment_id)
      .map(line => line.part_commitment_id);

    const uniqueCommitmentIds = [...new Set(commitmentIds)];
    const commitmentRevertResults = [];
    const revertFailures = [];
    const revertedCommitmentIds = []; // Track for rollback if needed

    for (const commitmentId of uniqueCommitmentIds) {
      try {
        const commitments = await base44.entities.PartCommitment.filter({ id: commitmentId });
        if (commitments.length === 0) {
          commitmentRevertResults.push({
            commitment_id: commitmentId,
            status: 'skipped',
            reason: 'not_found',
          });
          continue;
        }

        const commitment = commitments[0];
        
        // Only revert if currently 'invoiced' (not if already paid by another invoice)
        if (commitment.billing_status === 'invoiced') {
          await base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
            billing_status: 'unbilled',
            invoiced_qty: 0,
            invoiced_retail_total: 0,
          });

          revertedCommitmentIds.push(commitmentId);
          commitmentRevertResults.push({
            commitment_id: commitmentId,
            status: 'reverted',
            from: 'invoiced',
            to: 'unbilled',
          });
        } else if (commitment.billing_status === 'paid') {
          // Already paid - do not revert
          commitmentRevertResults.push({
            commitment_id: commitmentId,
            status: 'skipped',
            reason: 'already_paid_by_other_mechanism',
          });
        } else {
          commitmentRevertResults.push({
            commitment_id: commitmentId,
            status: 'skipped',
            reason: `unexpected_status_${commitment.billing_status}`,
          });
        }
      } catch (err) {
        console.error(`Failed to revert commitment ${commitmentId}:`, err);
        revertFailures.push({
          commitment_id: commitmentId,
          error: err.message,
        });
        commitmentRevertResults.push({
          commitment_id: commitmentId,
          status: 'error',
          error: err.message,
        });
      }
    }

    // ===== ATOMICITY CHECK: If ANY commitment revert failed, abort cancel =====
    if (revertFailures.length > 0) {
      // Rollback any commitments we successfully reverted
      for (const rollbackId of revertedCommitmentIds) {
        try {
          await base44.asServiceRole.entities.PartCommitment.update(rollbackId, {
            billing_status: 'invoiced',
          });
          console.log(`Rolled back commitment ${rollbackId} to 'invoiced'`);
        } catch (rollbackErr) {
          console.error(`Rollback failed for commitment ${rollbackId}:`, rollbackErr);
        }
      }

      return Response.json({
        success: false,
        error: 'Cancel aborted - commitment revert failed',
        message: 'One or more commitments could not be reverted. Invoice was NOT cancelled and credit was NOT reversed.',
        revert_failures: revertFailures,
        rolled_back_count: revertedCommitmentIds.length,
        invoice_id,
        invoice_status: invoice.status,
      }, { status: 500 });
    }

    // ===== PHASE 2: Reverse credit (ONLY if commitment revert succeeded) =====
    // ASSERTION: This code only executes if ALL commitment reverts passed above
    let creditReversed = 0;
    const creditReversalDetail = [];

    if (creditApplied > 0) {
      // Check if reversal already done (idempotency)
      const existingReversals = await base44.entities.ProjectCreditLedger.filter({
        project_id: invoice.project_id,
      });
      
      const alreadyReversed = existingReversals.some(
        c => c.reversal_idempotency_key === reversalIdempotencyKey
      );

      if (alreadyReversed) {
        console.log(`Credit reversal already done for invoice ${invoice_id}`);
        creditReversed = creditApplied; // Already reversed in prior call
      } else {
        // Create a NEW credit entry representing the reversal
        const reversalCredit = await base44.asServiceRole.entities.ProjectCreditLedger.create({
          project_id: invoice.project_id,
          source_invoice_id: invoice_id,
          credit_amount: creditApplied,
          remaining_amount: creditApplied,
          notes: `Credit reversal from cancelled invoice ${invoice.qb_invoice_number || invoice_id}`,
          reversed_from_invoice_id: invoice_id,
          reversal_idempotency_key: reversalIdempotencyKey,
        });

        creditReversed = creditApplied;
        creditReversalDetail.push({
          reversal_credit_id: reversalCredit.id,
          amount_reversed: creditApplied,
          reversal_idempotency_key: reversalIdempotencyKey,
        });
      }
    }

    // ===== PHASE 3: Update invoice to cancelled =====
    await base44.asServiceRole.entities.ProjectInvoice.update(invoice_id, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.email,
      cancellation_reason: reason || null,
      credit_reversed: creditReversed,
      reversal_idempotency_key: reversalIdempotencyKey,
    });

    return Response.json({
      success: true,
      invoice_id,
      previous_status: invoice.status,
      new_status: 'cancelled',
      credit_applied_original: creditApplied,
      credit_reversed: creditReversed,
      credit_reversal_detail: creditReversalDetail.length > 0 ? creditReversalDetail : null,
      commitments_reverted: commitmentRevertResults.filter(r => r.status === 'reverted').length,
      commitment_results: commitmentRevertResults,
      reversal_idempotency_key: reversalIdempotencyKey,
      cancelled_by: user.email,
      cancelled_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('cancelProjectInvoice error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});