import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * markInvoiceSent - PHASE 10 Forward Invoice System
 * 
 * Marks a draft invoice as sent and applies commitment mutations.
 * 
 * Inputs:
 * - invoice_id (required)
 * - qb_invoice_number (required)
 * - issue_date (required)
 * - due_date (required)
 * 
 * Rules:
 * - status draft->sent only
 * - After marking SENT, update PartCommitment.invoiced_qty/invoiced_amount for part lines
 * 
 * Returns success + updated invoice
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

    const payload = await req.json();
    const { invoice_id, qb_invoice_number, issue_date, due_date } = payload;

    // Validate required fields
    if (!invoice_id) {
      return Response.json({ error: 'invoice_id required' }, { status: 400 });
    }
    if (!qb_invoice_number) {
      return Response.json({ error: 'qb_invoice_number required' }, { status: 400 });
    }
    if (!issue_date) {
      return Response.json({ error: 'issue_date required' }, { status: 400 });
    }
    if (!due_date) {
      return Response.json({ error: 'due_date required' }, { status: 400 });
    }

    // Fetch invoice
    const invoices = await base44.entities.ProjectInvoice.filter({ id: invoice_id });
    if (invoices.length === 0) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const invoice = invoices[0];

    // Validate status transition
    if (invoice.status !== 'draft') {
      return Response.json({ 
        error: `Cannot mark as sent: invoice is ${invoice.status}, must be draft` 
      }, { status: 400 });
    }

    // Fetch invoice lines
    const lines = await base44.entities.ProjectInvoiceLine.filter({ invoice_id });

    // Update invoice status and QB fields
    await base44.asServiceRole.entities.ProjectInvoice.update(invoice_id, {
      status: 'sent',
      qb_invoice_number,
      issue_date,
      due_date,
    });

    // Apply commitment mutations for part AND service lines
    const commitmentUpdates = [];
    const serviceUpdates = [];

    for (const line of lines) {
      // ── PART commitment billing ──
      if (line.type === 'part' && line.part_commitment_id) {
        const commitments = await base44.entities.PartCommitment.filter({ 
          id: line.part_commitment_id 
        });
        
        if (commitments.length > 0) {
          const commitment = commitments[0];
          const currentInvoicedQty = commitment.invoiced_qty ?? 0;
          const currentInvoicedAmount = commitment.invoiced_amount ?? 0;
          
          const newInvoicedQty = currentInvoicedQty + (line.qty ?? 0);
          const newInvoicedAmount = currentInvoicedAmount + (line.line_total ?? 0);

          await base44.asServiceRole.entities.PartCommitment.update(line.part_commitment_id, {
            invoiced_qty: newInvoicedQty,
            invoiced_amount: newInvoicedAmount,
          });

          commitmentUpdates.push({
            commitment_id: line.part_commitment_id,
            qty_added: line.qty ?? 0,
            amount_added: line.line_total ?? 0,
            new_invoiced_qty: newInvoicedQty,
            new_invoiced_amount: newInvoicedAmount,
          });
        }
      }

      // ── SERVICE commitment billing ──
      if (line.type === 'service' && line.part_commitment_id) {
        // part_commitment_id holds the ServiceCommitment.id for service lines
        const serviceCommitmentId = line.part_commitment_id;
        try {
          await base44.asServiceRole.entities.ServiceCommitment.update(serviceCommitmentId, {
            status: 'billed',
            is_billed: true,
            billed_date: new Date().toISOString(),
            invoice_id: invoice_id,
          });

          serviceUpdates.push({
            service_commitment_id: serviceCommitmentId,
            amount_billed: line.line_total ?? 0,
          });
        } catch (svcErr) {
          console.error(`[markInvoiceSent] Failed to mark service ${serviceCommitmentId} as billed:`, svcErr.message);
        }
      }
    }

    // Deduct credits that were applied (if any)
    if (invoice.credit_applied > 0) {
      const credits = await base44.entities.ProjectCreditLedger.filter({
        project_id: invoice.project_id,
      });

      const availableCredits = credits
        .filter(c => (c.remaining_amount ?? 0) > 0)
        .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

      let remainingToDeduct = invoice.credit_applied;

      for (const credit of availableCredits) {
        if (remainingToDeduct <= 0) break;

        const available = credit.remaining_amount ?? 0;
        const toDeduct = Math.min(available, remainingToDeduct);

        await base44.asServiceRole.entities.ProjectCreditLedger.update(credit.id, {
          remaining_amount: available - toDeduct,
          applied_to_invoice_id: invoice_id,
        });

        remainingToDeduct -= toDeduct;
      }
    }

    return Response.json({
      success: true,
      invoice_id,
      status: 'sent',
      qb_invoice_number,
      issue_date,
      due_date,
      commitment_updates: commitmentUpdates,
      service_updates: serviceUpdates,
    });

  } catch (error) {
    console.error('markInvoiceSent error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});