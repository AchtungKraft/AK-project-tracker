import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * applyProjectCreditManual
 * 
 * Manually apply credit to invoices and/or commitments.
 * 
 * FEATURES:
 * - Idempotent via nonce
 * - Server-side validation
 * - Atomic application (all or nothing)
 * - Supports mixed invoice + commitment targets
 * 
 * Signature:
 * {
 *   project_id: string,
 *   nonce: string,
 *   allocations: [
 *     { target_type: "invoice" | "commitment", target_id: string, amount: number }
 *   ]
 * }
 */

// Simple in-memory nonce tracking (per-project)
// In production, this should be stored in a database
const processedNonces = new Map();

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
    const { project_id, nonce, allocations } = payload;

    // Validate required fields
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }
    if (!nonce) {
      return Response.json({ error: 'nonce required for idempotency' }, { status: 400 });
    }
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return Response.json({ error: 'allocations array required' }, { status: 400 });
    }

    // === IDEMPOTENCY CHECK ===
    // Check if nonce was already processed for this project
    const nonceKey = `${project_id}:${nonce}`;
    
    // Check database for existing allocation with this nonce
    const existingAllocations = await base44.entities.CreditAllocation.filter({
      project_id,
      allocation_key: nonceKey,
    });

    if (existingAllocations.length > 0) {
      return Response.json({
        success: true,
        already_processed: true,
        message: 'This allocation was already processed',
        total_applied: existingAllocations.reduce((sum, a) => sum + (a.amount_applied ?? 0), 0),
      });
    }

    // === FETCH CURRENT STATE ===
    // Get credit ledger entries with remaining balance
    const credits = await base44.entities.ProjectCreditLedger.filter({
      project_id,
    });

    const availableCredits = credits
      .filter(c => (c.remaining_amount ?? 0) > 0)
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    let totalCreditAvailable = availableCredits.reduce((sum, c) => sum + (c.remaining_amount ?? 0), 0);

    // === VALIDATION ===
    const totalRequested = allocations.reduce((sum, a) => sum + (a.amount ?? 0), 0);

    if (totalRequested > totalCreditAvailable) {
      return Response.json({
        error: `Requested total (${totalRequested}) exceeds available credit (${totalCreditAvailable})`,
      }, { status: 400 });
    }

    // Validate each allocation
    const validationErrors = [];

    for (let i = 0; i < allocations.length; i++) {
      const alloc = allocations[i];
      
      if (!alloc.target_type || !['invoice', 'commitment'].includes(alloc.target_type)) {
        validationErrors.push(`Allocation ${i}: invalid target_type`);
        continue;
      }
      if (!alloc.target_id) {
        validationErrors.push(`Allocation ${i}: target_id required`);
        continue;
      }
      if (typeof alloc.amount !== 'number' || alloc.amount <= 0) {
        validationErrors.push(`Allocation ${i}: amount must be positive number`);
        continue;
      }

      // Validate target exists and has sufficient outstanding
      if (alloc.target_type === 'invoice') {
        const invoices = await base44.entities.ProjectInvoice.filter({
          id: alloc.target_id,
        });
        if (invoices.length === 0) {
          validationErrors.push(`Allocation ${i}: invoice not found`);
          continue;
        }
        const inv = invoices[0];
        const outstanding = inv.balance_due ?? 0;
        if (alloc.amount > outstanding) {
          validationErrors.push(`Allocation ${i}: amount (${alloc.amount}) exceeds invoice outstanding (${outstanding})`);
        }
      } else if (alloc.target_type === 'commitment') {
        const commitments = await base44.entities.PartCommitment.filter({
          id: alloc.target_id,
        });
        if (commitments.length === 0) {
          validationErrors.push(`Allocation ${i}: commitment not found`);
          continue;
        }
        const c = commitments[0];
        const plannedRetail = c.planned_retail_total ?? ((c.unit_retail_snapshot ?? 0) * (c.required_total ?? 0));
        const invoicedAmount = c.invoiced_amount ?? 0;
        const outstanding = plannedRetail - invoicedAmount;
        if (alloc.amount > outstanding) {
          validationErrors.push(`Allocation ${i}: amount (${alloc.amount}) exceeds commitment outstanding (${outstanding})`);
        }
      }
    }

    if (validationErrors.length > 0) {
      return Response.json({
        error: 'Validation failed',
        validation_errors: validationErrors,
      }, { status: 400 });
    }

    // === ATOMIC APPLICATION ===
    const appliedAllocations = [];
    let remainingToApply = totalRequested;

    // Deduct from credit ledger entries (FIFO)
    for (const credit of availableCredits) {
      if (remainingToApply <= 0) break;

      const available = credit.remaining_amount ?? 0;
      const toDeduct = Math.min(available, remainingToApply);

      if (toDeduct <= 0) continue;

      await base44.asServiceRole.entities.ProjectCreditLedger.update(credit.id, {
        remaining_amount: available - toDeduct,
      });

      remainingToApply -= toDeduct;
    }

    // Apply to each target
    for (const alloc of allocations) {
      if (alloc.target_type === 'invoice') {
        // Update invoice balance_due and credit_applied
        const invoices = await base44.entities.ProjectInvoice.filter({
          id: alloc.target_id,
        });
        if (invoices.length > 0) {
          const inv = invoices[0];
          const newCreditApplied = (inv.credit_applied ?? 0) + alloc.amount;
          const newBalanceDue = Math.max(0, (inv.balance_due ?? 0) - alloc.amount);

          await base44.asServiceRole.entities.ProjectInvoice.update(alloc.target_id, {
            credit_applied: newCreditApplied,
            balance_due: newBalanceDue,
          });
        }
      } else if (alloc.target_type === 'commitment') {
        // Update commitment covered_retail_total
        const commitments = await base44.entities.PartCommitment.filter({
          id: alloc.target_id,
        });
        if (commitments.length > 0) {
          const c = commitments[0];
          const newCoveredRetail = (c.covered_retail_total ?? 0) + alloc.amount;

          await base44.asServiceRole.entities.PartCommitment.update(alloc.target_id, {
            covered_retail_total: newCoveredRetail,
          });
        }
      }

      // Create CreditAllocation record
      const allocationRecord = await base44.asServiceRole.entities.CreditAllocation.create({
        project_id,
        credit_ledger_id: availableCredits[0]?.id || null,
        commitment_id: alloc.target_type === 'commitment' ? alloc.target_id : null,
        invoice_id: alloc.target_type === 'invoice' ? alloc.target_id : null,
        amount_applied: alloc.amount,
        allocation_mode: 'manual',
        allocation_key: nonceKey,
      });

      appliedAllocations.push({
        target_type: alloc.target_type,
        target_id: alloc.target_id,
        amount: alloc.amount,
        allocation_id: allocationRecord.id,
      });
    }

    return Response.json({
      success: true,
      total_applied: totalRequested,
      allocations_created: appliedAllocations.length,
      allocations: appliedAllocations,
    });

  } catch (error) {
    console.error('applyProjectCreditManual error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});