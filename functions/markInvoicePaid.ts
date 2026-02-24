import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * markInvoicePaid - PHASE 10 Forward Invoice System
 * 
 * Marks a sent invoice as paid.
 * THIS IS THE ONLY PLACE WHERE:
 * 1. Credit is actually applied (ledger is mutated)
 * 2. Linked commitments are set to billing_status = 'paid'
 * 
 * Inputs:
 * - invoice_id (required)
 * - payment_date (required)
 * - paid_amount (optional; default invoice.balance_due)
 * - apply_credit: boolean (default true) - whether to apply available credit
 * 
 * Rules:
 * - status sent->paid only (no partial payments)
 * - Apply credit from ProjectCreditLedger (deduct from remaining_amount)
 * - if paid_amount > actual_balance_due: create new ProjectCreditLedger entry for overpayment
 * - ALL linked commitments get billing_status = 'paid'
 * 
 * Returns updated invoice + credits_applied[] + credit_created? + commitments_updated
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
    const { invoice_id, payment_date, paid_amount, apply_credit = true } = payload;

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

    // Validate status transition (sent -> paid only)
    if (invoice.status !== 'sent') {
      return Response.json({ 
        error: `Cannot mark as paid: invoice is ${invoice.status}, must be sent` 
      }, { status: 400 });
    }

    const subtotal = invoice.subtotal ?? 0;
    
    // ===== STEP 1: Apply credit NOW (this is the only place credit is actually applied) =====
    let creditApplied = 0;
    const creditsAppliedDetail = [];

    if (apply_credit && subtotal > 0) {
      // Fetch fresh credit ledger entries
      const credits = await base44.entities.ProjectCreditLedger.filter({
        project_id: invoice.project_id,
      });

      const availableCredits = credits
        .filter(c => (c.remaining_amount ?? 0) > 0 && !c.applied_to_invoice_id)
        .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

      let remainingToApply = subtotal;

      for (const credit of availableCredits) {
        if (remainingToApply <= 0) break;

        const available = credit.remaining_amount ?? 0;
        
        // DEFENSIVE: Cannot apply more than available
        const toApply = Math.min(available, remainingToApply);

        if (toApply <= 0) continue;

        // MUTATE LEDGER: Deduct from remaining_amount
        const newRemaining = available - toApply;
        await base44.asServiceRole.entities.ProjectCreditLedger.update(credit.id, {
          remaining_amount: newRemaining,
          applied_to_invoice_id: newRemaining === 0 ? invoice_id : credit.applied_to_invoice_id,
        });

        creditApplied += toApply;
        remainingToApply -= toApply;

        creditsAppliedDetail.push({
          credit_id: credit.id,
          source_invoice_id: credit.source_invoice_id,
          amount_applied: toApply,
          remaining_after: newRemaining,
        });
      }
    }

    // Calculate actual balance due after credit
    const balanceDueAfterCredit = Math.max(0, subtotal - creditApplied);
    
    // Determine paid amount (default to balance due after credit)
    const actualPaidAmount = paid_amount ?? balanceDueAfterCredit;

    // ===== STEP 2: Update invoice with final credit_applied and paid_amount =====
    await base44.asServiceRole.entities.ProjectInvoice.update(invoice_id, {
      status: 'paid',
      payment_date,
      paid_amount: actualPaidAmount,
      credit_applied: creditApplied,
      balance_due: balanceDueAfterCredit,
    });

    let creditCreated = null;

    // ===== STEP 3: Check for overpayment - create new credit =====
    if (actualPaidAmount > balanceDueAfterCredit) {
      const overage = actualPaidAmount - balanceDueAfterCredit;

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

    // ===== STEP 4: Update ALL linked commitments to billing_status = 'paid' =====
    const invoiceLines = await base44.entities.ProjectInvoiceLine.filter({
      invoice_id: invoice_id,
    });

    const commitmentIds = invoiceLines
      .filter(line => line.part_commitment_id)
      .map(line => line.part_commitment_id);

    // Deduplicate (in case multiple lines reference same commitment)
    const uniqueCommitmentIds = [...new Set(commitmentIds)];

    let commitmentsUpdated = 0;
    for (const commitmentId of uniqueCommitmentIds) {
      try {
        await base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
          billing_status: 'paid',
          // Clear any invoice blocking reasons since payment is complete
          invoice_blocked_reason: null,
        });
        commitmentsUpdated++;
      } catch (err) {
        console.error(`Failed to update commitment ${commitmentId}:`, err);
        // Continue with other commitments
      }
    }

    return Response.json({
      success: true,
      invoice_id,
      status: 'paid',
      payment_date,
      subtotal,
      credit_applied: creditApplied,
      balance_due: balanceDueAfterCredit,
      paid_amount: actualPaidAmount,
      credits_applied: creditsAppliedDetail.length > 0 ? creditsAppliedDetail : null,
      credit_created: creditCreated,
      ledger_mutated: creditApplied > 0 || creditCreated !== null,
      commitments_updated: commitmentsUpdated,
      commitment_ids: uniqueCommitmentIds,
    });

  } catch (error) {
    console.error('markInvoicePaid error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});