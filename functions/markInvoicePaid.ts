import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * markInvoicePaid - PHASE 10 Forward Invoice System (STABILIZATION HARDENED)
 * 
 * Marks a sent invoice as paid.
 * 
 * STABILIZATION FIXES:
 * 1. ATOMIC: All commitment updates must succeed before invoice is marked paid
 * 2. IDEMPOTENT: Credit application uses payment_idempotency_key
 * 3. SAFE: If credit was applied at invoice creation, do not re-apply
 * 
 * Inputs:
 * - invoice_id (required)
 * - payment_date (required)
 * - paid_amount (optional; default invoice.balance_due)
 * 
 * Rules:
 * - status sent->paid only (no partial payments)
 * - If invoice.credit_applied > 0, credit was applied at creation - skip credit application
 * - If invoice.credit_applied === 0 and apply_credit=true, apply credit now
 * - ALL linked commitments MUST update to 'paid' or the entire operation fails
 * - if paid_amount > balance_due: create new ProjectCreditLedger entry for overpayment
 * 
 * Returns updated invoice + credits_applied[] + credit_created? + commitments_updated
 */

// Generate idempotency key for payment credit application
function generatePaymentIdempotencyKey(invoiceId, timestamp) {
  const input = `payment:${invoiceId}:${Math.floor(timestamp / 60000)}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
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

    // IDEMPOTENCY: If already paid, return success without changes
    if (invoice.status === 'paid') {
      return Response.json({ 
        success: true,
        idempotent: true,
        message: 'Invoice already paid - no changes made',
        invoice_id,
        status: 'paid',
      });
    }

    // Validate status transition (sent -> paid only)
    if (invoice.status !== 'sent') {
      return Response.json({ 
        error: `Cannot mark as paid: invoice is ${invoice.status}, must be sent` 
      }, { status: 400 });
    }

    // ===== PREFLIGHT: Validate all linked commitments exist and are eligible =====
    const invoiceLines = await base44.entities.ProjectInvoiceLine.filter({
      invoice_id: invoice_id,
    });

    const commitmentIds = invoiceLines
      .filter(line => line.part_commitment_id)
      .map(line => line.part_commitment_id);

    const uniqueCommitmentIds = [...new Set(commitmentIds)];

    // Fetch all commitments in parallel
    const commitmentFetches = uniqueCommitmentIds.map(id => 
      base44.entities.PartCommitment.filter({ id })
    );
    const commitmentResults = await Promise.all(commitmentFetches);
    
    const commitmentMap = new Map();
    const preflightErrors = [];
    
    for (let i = 0; i < uniqueCommitmentIds.length; i++) {
      const commitments = commitmentResults[i];
      const commitmentId = uniqueCommitmentIds[i];
      
      if (!commitments || commitments.length === 0) {
        preflightErrors.push({
          commitment_id: commitmentId,
          error: 'Commitment not found',
        });
        continue;
      }
      
      const commitment = commitments[0];
      commitmentMap.set(commitmentId, commitment);
      
      // Validate commitment is in valid state
      if (commitment.billing_status === 'paid') {
        // Already paid - this is OK, we'll skip updating it
        continue;
      }
      
      if (commitment.billing_status !== 'invoiced' && commitment.billing_status !== 'unbilled') {
        preflightErrors.push({
          commitment_id: commitmentId,
          error: `Commitment in unexpected state: ${commitment.billing_status}`,
        });
      }
    }
    
    // FAIL FAST: If any commitment is invalid, abort entire operation
    if (preflightErrors.length > 0) {
      return Response.json({
        success: false,
        error: 'Preflight validation failed - some commitments are invalid',
        preflight_errors: preflightErrors,
      }, { status: 400 });
    }

    const subtotal = invoice.subtotal ?? 0;
    
    // ===== PHASE 1: Update ALL commitments FIRST (before invoice/credit changes) =====
    // This ensures we fail early if any commitment update fails
    const commitmentUpdateResults = [];
    const commitmentsToUpdate = [];
    
    for (const commitmentId of uniqueCommitmentIds) {
      const commitment = commitmentMap.get(commitmentId);
      
      // Skip already paid commitments
      if (commitment?.billing_status === 'paid') {
        commitmentUpdateResults.push({
          commitment_id: commitmentId,
          status: 'skipped',
          reason: 'already_paid',
        });
        continue;
      }
      
      commitmentsToUpdate.push(commitmentId);
    }
    
    // Update all commitments - fail if ANY fails
    for (const commitmentId of commitmentsToUpdate) {
      try {
        await base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
          billing_status: 'paid',
          invoice_blocked_reason: null,
        });
        commitmentUpdateResults.push({
          commitment_id: commitmentId,
          status: 'updated',
        });
      } catch (err) {
        // CRITICAL FAILURE: A commitment failed to update
        // Roll back any commitments we already updated
        console.error(`CRITICAL: Failed to update commitment ${commitmentId}:`, err);
        
        // Attempt rollback of previously updated commitments
        const updatedCommitments = commitmentUpdateResults
          .filter(r => r.status === 'updated')
          .map(r => r.commitment_id);
        
        for (const rollbackId of updatedCommitments) {
          try {
            await base44.asServiceRole.entities.PartCommitment.update(rollbackId, {
              billing_status: 'invoiced',
            });
          } catch (rollbackErr) {
            console.error(`Rollback failed for commitment ${rollbackId}:`, rollbackErr);
          }
        }
        
        return Response.json({
          success: false,
          error: `Failed to update commitment ${commitmentId}: ${err.message}`,
          rolled_back: updatedCommitments.length,
          failed_at: commitmentId,
        }, { status: 500 });
      }
    }

    // ===== PHASE 2: Apply credit (HARDENED - explicit flag only) =====
    let creditApplied = invoice.credit_applied ?? 0;
    const creditsAppliedDetail = [];
    const idempotencyKey = generatePaymentIdempotencyKey(invoice_id, Date.now());

    // Check if credit was already applied at invoice creation
    const creditAlreadyAppliedAtCreation = (invoice.credit_applied ?? 0) > 0;
    
    // HARDENING: Payment-time credit application ONLY if explicit flag is set
    // Legacy heuristic REMOVED - no more checking for missing credit_idempotency_key
    // This prevents accidental credit application on old invoices
    const shouldApplyCreditAtPayment = !creditAlreadyAppliedAtCreation && 
                                        invoice.apply_credit_at_payment === true;
    
    if (shouldApplyCreditAtPayment && subtotal > 0) {
      // Credit not applied at creation AND explicitly requested at payment time
      console.log(`Applying credit at payment time (explicit flag) for invoice ${invoice_id}`);
      
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
        const toApply = Math.min(available, remainingToApply);

        if (toApply <= 0) continue;

        const newRemaining = available - toApply;
        await base44.asServiceRole.entities.ProjectCreditLedger.update(credit.id, {
          remaining_amount: newRemaining,
          applied_to_invoice_id: newRemaining === 0 ? invoice_id : credit.applied_to_invoice_id,
          payment_idempotency_key: idempotencyKey,
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
    } else if (!creditAlreadyAppliedAtCreation && subtotal > 0 && !shouldApplyCreditAtPayment) {
      console.log(`Skipping payment-time credit for invoice ${invoice_id} (apply_credit_at_payment !== true)`);
    }

    // Calculate actual balance due after credit
    const balanceDueAfterCredit = Math.max(0, subtotal - creditApplied);
    
    // Determine paid amount (default to balance due after credit)
    const actualPaidAmount = paid_amount ?? balanceDueAfterCredit;

    // ===== PHASE 3: Update invoice to PAID =====
    await base44.asServiceRole.entities.ProjectInvoice.update(invoice_id, {
      status: 'paid',
      payment_date,
      paid_amount: actualPaidAmount,
      credit_applied: creditApplied,
      balance_due: balanceDueAfterCredit,
      payment_idempotency_key: idempotencyKey,
    });

    let creditCreated = null;

    // ===== PHASE 4: Check for overpayment - create new credit =====
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

    return Response.json({
      success: true,
      invoice_id,
      status: 'paid',
      payment_date,
      subtotal,
      credit_applied: creditApplied,
      credit_already_applied_at_creation: creditAlreadyAppliedAtCreation,
      balance_due: balanceDueAfterCredit,
      paid_amount: actualPaidAmount,
      credits_applied: creditsAppliedDetail.length > 0 ? creditsAppliedDetail : null,
      credit_created: creditCreated,
      ledger_mutated: creditsAppliedDetail.length > 0 || creditCreated !== null,
      commitments_updated: commitmentUpdateResults.filter(r => r.status === 'updated').length,
      commitment_results: commitmentUpdateResults,
      idempotency_key: idempotencyKey,
    });

  } catch (error) {
    console.error('markInvoicePaid error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});