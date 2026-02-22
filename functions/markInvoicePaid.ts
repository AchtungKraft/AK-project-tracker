import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * markInvoicePaid - PHASE 10 Forward Invoice System
 * 
 * Marks a sent invoice as paid, creating credit for overpayment.
 * 
 * Inputs:
 * - invoice_id (required)
 * - payment_date (required)
 * - paid_amount (optional; default invoice.balance_due)
 * 
 * Rules:
 * - status sent->paid only
 * - if paid_amount > balance_due: create ProjectCreditLedger entry
 * 
 * Returns updated invoice + credit_created?
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
    const { invoice_id, payment_date, paid_amount } = payload;

    // Validate required fields
    if (!invoice_id) {
      return Response.json({ error: 'invoice_id required' }, { status: 400 });
    }
    if (!payment_date) {
      return Response.json({ error: 'payment_date required' }, { status: 400 });
    }

    // Fetch invoice
    const invoices = await base44.entities.ProjectInvoice.filter({ id: invoice_id });
    if (invoices.length === 0) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const invoice = invoices[0];

    // Validate status transition
    if (invoice.status !== 'sent') {
      return Response.json({ 
        error: `Cannot mark as paid: invoice is ${invoice.status}, must be sent` 
      }, { status: 400 });
    }

    const balanceDue = invoice.balance_due ?? 0;
    const actualPaidAmount = paid_amount ?? balanceDue;

    // Update invoice
    await base44.asServiceRole.entities.ProjectInvoice.update(invoice_id, {
      status: 'paid',
      payment_date,
      paid_amount: actualPaidAmount,
    });

    let creditCreated = null;

    // Check for overpayment
    if (actualPaidAmount > balanceDue) {
      const overage = actualPaidAmount - balanceDue;

      const credit = await base44.asServiceRole.entities.ProjectCreditLedger.create({
        project_id: invoice.project_id,
        source_invoice_id: invoice_id,
        credit_amount: overage,
        remaining_amount: overage,
        notes: `Overpayment from invoice ${invoice.qb_invoice_number || invoice_id}`,
      });

      creditCreated = {
        credit_id: credit.id,
        amount: overage,
      };
    }

    return Response.json({
      success: true,
      invoice_id,
      status: 'paid',
      payment_date,
      paid_amount: actualPaidAmount,
      credit_created: creditCreated,
    });

  } catch (error) {
    console.error('markInvoicePaid error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});