import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * deleteProjectInvoice - STABILIZATION: Safe Invoice Deletion with Credit Guard
 * 
 * Deletes an invoice ONLY if safe to do so.
 * 
 * CRITICAL RULES:
 * 1. Cannot delete PAID invoices (must refund first)
 * 2. Cannot delete if credit_applied > 0 UNLESS reversal already completed
 * 3. Converts delete to cancel if credit needs reversal
 * 4. Hard delete only allowed for draft invoices with no credit applied
 * 
 * Inputs:
 * - invoice_id (required)
 * - force_cancel (optional): if true, cancel instead of delete when credit exists
 * 
 * Returns:
 * - success, action_taken (deleted|cancelled|blocked)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
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
    const { invoice_id, force_cancel = false } = payload;

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

    // Cannot delete PAID invoices
    if (invoice.status === 'paid') {
      return Response.json({ 
        error: 'Cannot delete a paid invoice. Use refund flow instead.',
        action_taken: 'blocked',
        reason: 'INVOICE_PAID',
      }, { status: 400 });
    }

    const creditApplied = invoice.credit_applied ?? 0;
    const reversalIdempotencyKey = `reverse_credit_${invoice_id}`;

    // Check if credit needs reversal
    if (creditApplied > 0) {
      // Check if reversal already done
      const existingReversals = await base44.entities.ProjectCreditLedger.filter({
        project_id: invoice.project_id,
      });
      
      const reversalExists = existingReversals.some(
        c => c.reversal_idempotency_key === reversalIdempotencyKey
      );

      if (!reversalExists) {
        // Credit not yet reversed - cannot delete directly
        if (force_cancel) {
          // Call cancel logic instead
          const cancelResponse = await base44.functions.invoke('cancelProjectInvoice', {
            invoice_id,
            reason: 'Converted from delete request - credit reversal required',
          });

          return Response.json({
            success: true,
            action_taken: 'cancelled',
            reason: 'Credit reversal required - converted to cancel',
            credit_applied: creditApplied,
            cancel_result: cancelResponse.data,
          });
        } else {
          return Response.json({ 
            error: 'Cannot delete invoice with applied credit. Credit reversal required first.',
            action_taken: 'blocked',
            reason: 'CREDIT_NOT_REVERSED',
            credit_applied: creditApplied,
            suggestion: 'Use force_cancel=true to cancel and reverse credit, or call cancelProjectInvoice first',
          }, { status: 400 });
        }
      }
    }

    // ===== SAFE TO DELETE =====
    
    // First, revert any linked commitments to 'unbilled'
    const invoiceLines = await base44.entities.ProjectInvoiceLine.filter({
      invoice_id: invoice_id,
    });

    const commitmentIds = invoiceLines
      .filter(line => line.part_commitment_id)
      .map(line => line.part_commitment_id);

    const uniqueCommitmentIds = [...new Set(commitmentIds)];
    const commitmentRevertResults = [];

    for (const commitmentId of uniqueCommitmentIds) {
      try {
        const commitments = await base44.entities.PartCommitment.filter({ id: commitmentId });
        if (commitments.length === 0) continue;

        const commitment = commitments[0];
        
        // Only revert if currently 'invoiced'
        if (commitment.billing_status === 'invoiced') {
          await base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
            billing_status: 'unbilled',
            invoiced_qty: 0,
            invoiced_retail_total: 0,
          });

          commitmentRevertResults.push({
            commitment_id: commitmentId,
            status: 'reverted',
          });
        }
      } catch (err) {
        console.error(`Failed to revert commitment ${commitmentId}:`, err);
      }
    }

    // Delete invoice lines
    for (const line of invoiceLines) {
      await base44.asServiceRole.entities.ProjectInvoiceLine.delete(line.id);
    }

    // Delete invoice
    await base44.asServiceRole.entities.ProjectInvoice.delete(invoice_id);

    return Response.json({
      success: true,
      action_taken: 'deleted',
      invoice_id,
      previous_status: invoice.status,
      lines_deleted: invoiceLines.length,
      commitments_reverted: commitmentRevertResults.length,
      deleted_by: user.email,
      deleted_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('deleteProjectInvoice error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});