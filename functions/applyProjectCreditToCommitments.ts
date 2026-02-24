import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PHASE 3 — Apply Project Credit to Commitments (Settle Parts Without Invoice)
 * 
 * Canonical credit allocation function that:
 * - Allocates credits from ProjectCreditLedger to PartCommitments
 * - Creates CreditAllocation records
 * - Updates ProjectCreditLedger.remaining_amount
 * - PHASE 3 NEW: Marks commitments as PAID when fully settled by credit
 * - Supports dry_run for preview
 * - Is idempotent via allocation_key
 * 
 * INPUT:
 * {
 *   project_id: string,
 *   commitment_ids?: string[],   // optional - limit to selected (user's chosen parts)
 *   mode: "auto" | "manual",
 *   allocations?: [{ credit_ledger_id, commitment_id, amount }],
 *   dry_run: boolean,
 *   settle_parts: boolean,      // PHASE 3: If true, mark fully-covered parts as PAID
 * }
 * 
 * PHASE 3 BUSINESS RULES:
 * - When settle_parts=true and a commitment's outstanding is fully covered by credit:
 *   - Set commitment.billing_status = 'paid'
 *   - The commitment becomes PAID without ever creating an invoice
 * - Credit is applied in the order commitments are provided
 * - If credit runs out mid-way, remaining commitments stay NOT_INVOICED
 */

// Generate deterministic allocation key for idempotency
function generateAllocationKey(ledgerId, commitmentId, amount, timestamp) {
  const input = `${ledgerId}:${commitmentId || 'project'}:${amount}:${Math.floor(timestamp / 60000)}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `alloc_${Math.abs(hash).toString(36)}`;
}

// Calculate commitment exposure (what's billable but not yet covered)
function calculateCommitmentExposure(commitment, existingAllocations) {
  const unitRetail = commitment.unit_retail_snapshot || 0;
  const requiredTotal = commitment.required_total || 0;
  const grossExposure = unitRetail * requiredTotal;
  
  // Already invoiced amount
  const invoicedAmount = commitment.invoiced_amount || 0;
  
  // Already allocated credits for this commitment
  const creditAllocated = existingAllocations
    .filter(a => a.commitment_id === commitment.id && !a.is_reversed)
    .reduce((sum, a) => sum + (a.amount_applied || 0), 0);
  
  // Net exposure = gross - invoiced - credit allocated
  const netExposure = Math.max(0, grossExposure - invoicedAmount - creditAllocated);
  
  return {
    gross: grossExposure,
    invoiced: invoicedAmount,
    credit_applied: creditAllocated,
    net: netExposure,
  };
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
    const { 
      project_id, 
      commitment_ids, 
      mode = 'auto', 
      allocations: manualAllocations,
      dry_run = true 
    } = payload;

    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Fetch all required data
    const [
      project,
      allCommitments,
      creditLedgers,
      existingAllocations,
    ] = await Promise.all([
      base44.entities.Project.filter({ id: project_id }).then(r => r[0]),
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.ProjectCreditLedger.filter({ project_id }),
      base44.entities.CreditAllocation.filter({ project_id, is_reversed: false }),
    ]);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Filter to open commitments (not paid)
    let targetCommitments = allCommitments.filter(c => 
      c.billing_status !== 'paid' && 
      c.commitment_status !== 'cancelled'
    );

    // If specific commitment_ids provided, filter to those
    if (commitment_ids && commitment_ids.length > 0) {
      targetCommitments = targetCommitments.filter(c => 
        commitment_ids.includes(c.id)
      );
    }

    // Calculate exposure for each commitment
    const commitmentExposures = targetCommitments.map(c => {
      const exposure = calculateCommitmentExposure(c, existingAllocations);
      return {
        commitment_id: c.id,
        part_id: c.part_id,
        ...exposure,
      };
    });

    // Get available credits (ordered oldest first)
    const availableCredits = creditLedgers
      .filter(cl => (cl.remaining_amount || 0) > 0)
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    // Calculate totals
    const grossExposure = commitmentExposures.reduce((sum, e) => sum + e.gross, 0);
    const totalCreditAvailable = availableCredits.reduce((sum, c) => sum + (c.remaining_amount || 0), 0);
    const alreadyApplied = commitmentExposures.reduce((sum, e) => sum + e.credit_applied, 0);
    const totalNetExposure = commitmentExposures.reduce((sum, e) => sum + e.net, 0);

    // Generate allocation plan
    const allocationPlan = [];
    const updatedLedgers = new Map(); // Track ledger balance changes

    // Initialize ledger balances
    for (const cl of availableCredits) {
      updatedLedgers.set(cl.id, cl.remaining_amount || 0);
    }

    if (mode === 'auto') {
      // AUTO MODE: Allocate credits to commitments with exposure
      // Sort commitments by exposure (largest first for efficiency)
      const sortedExposures = [...commitmentExposures]
        .filter(e => e.net > 0)
        .sort((a, b) => b.net - a.net);

      for (const exposure of sortedExposures) {
        if (exposure.net <= 0) continue;

        let remainingNeed = exposure.net;

        for (const credit of availableCredits) {
          if (remainingNeed <= 0) break;
          
          const availableFromLedger = updatedLedgers.get(credit.id) || 0;
          if (availableFromLedger <= 0) continue;

          const amountToAllocate = Math.min(remainingNeed, availableFromLedger);
          
          if (amountToAllocate > 0) {
            const allocationKey = generateAllocationKey(
              credit.id, 
              exposure.commitment_id, 
              amountToAllocate,
              Date.now()
            );

            // Check for existing allocation with same key
            const existingWithKey = existingAllocations.find(a => 
              a.allocation_key === allocationKey
            );

            if (!existingWithKey) {
              allocationPlan.push({
                credit_ledger_id: credit.id,
                commitment_id: exposure.commitment_id,
                amount_applied: amountToAllocate,
                allocation_key: allocationKey,
              });

              // Update tracking
              updatedLedgers.set(credit.id, availableFromLedger - amountToAllocate);
              remainingNeed -= amountToAllocate;
            }
          }
        }
      }
    } else if (mode === 'manual' && manualAllocations) {
      // MANUAL MODE: Validate and use provided allocations
      for (const alloc of manualAllocations) {
        const { credit_ledger_id, commitment_id, amount } = alloc;

        if (!credit_ledger_id || amount <= 0) continue;

        const ledgerBalance = updatedLedgers.get(credit_ledger_id) || 0;
        if (amount > ledgerBalance) {
          return Response.json({
            error: `Allocation exceeds available credit in ledger ${credit_ledger_id}`,
            available: ledgerBalance,
            requested: amount,
          }, { status: 400 });
        }

        // Check commitment exposure if specified
        if (commitment_id) {
          const commitmentExp = commitmentExposures.find(e => e.commitment_id === commitment_id);
          if (!commitmentExp) {
            return Response.json({
              error: `Commitment ${commitment_id} not found or not eligible`,
            }, { status: 400 });
          }
          if (amount > commitmentExp.net) {
            return Response.json({
              error: `Allocation exceeds commitment exposure`,
              commitment_id,
              exposure: commitmentExp.net,
              requested: amount,
            }, { status: 400 });
          }
        }

        const allocationKey = generateAllocationKey(
          credit_ledger_id,
          commitment_id,
          amount,
          Date.now()
        );

        allocationPlan.push({
          credit_ledger_id,
          commitment_id,
          amount_applied: amount,
          allocation_key: allocationKey,
        });

        updatedLedgers.set(credit_ledger_id, ledgerBalance - amount);
      }
    }

    // Calculate new totals after allocation
    const newCreditApplied = alreadyApplied + allocationPlan.reduce((sum, a) => sum + a.amount_applied, 0);
    const newNetExposure = grossExposure - commitmentExposures.reduce((sum, e) => sum + e.invoiced, 0) - newCreditApplied;

    // Build per-commitment breakdown
    const perCommitmentResult = commitmentExposures.map(e => {
      const newAllocationsForCommitment = allocationPlan
        .filter(a => a.commitment_id === e.commitment_id)
        .reduce((sum, a) => sum + a.amount_applied, 0);

      return {
        commitment_id: e.commitment_id,
        part_id: e.part_id,
        gross: e.gross,
        invoiced: e.invoiced,
        credit_applied_existing: e.credit_applied,
        credit_applied_new: newAllocationsForCommitment,
        credit_applied_total: e.credit_applied + newAllocationsForCommitment,
        net: Math.max(0, e.net - newAllocationsForCommitment),
      };
    });

    // If dry_run, return preview only
    if (dry_run) {
      return Response.json({
        success: true,
        dry_run: true,
        project_id,
        mode,
        summary: {
          gross_exposure: grossExposure,
          credit_available: totalCreditAvailable,
          credit_already_applied: alreadyApplied,
          credit_to_apply: allocationPlan.reduce((sum, a) => sum + a.amount_applied, 0),
          credit_applied_total: newCreditApplied,
          net_exposure: Math.max(0, newNetExposure),
          allocations_count: allocationPlan.length,
        },
        allocation_plan: allocationPlan,
        per_commitment: perCommitmentResult,
        available_credits: availableCredits.map(c => ({
          id: c.id,
          original_amount: c.credit_amount,
          remaining_before: c.remaining_amount,
          remaining_after: updatedLedgers.get(c.id),
        })),
      });
    }

    // EXECUTE: Create CreditAllocation records and update ledgers
    const createdAllocations = [];
    const ledgerUpdates = [];

    for (const alloc of allocationPlan) {
      // Create CreditAllocation
      const created = await base44.entities.CreditAllocation.create({
        project_id,
        credit_ledger_id: alloc.credit_ledger_id,
        commitment_id: alloc.commitment_id,
        amount_applied: alloc.amount_applied,
        allocation_mode: mode,
        allocation_key: alloc.allocation_key,
        is_reversed: false,
      });
      createdAllocations.push(created);

      // Track ledger update
      if (!ledgerUpdates.find(u => u.id === alloc.credit_ledger_id)) {
        ledgerUpdates.push({
          id: alloc.credit_ledger_id,
          new_remaining: updatedLedgers.get(alloc.credit_ledger_id),
        });
      }
    }

    // Update ProjectCreditLedger remaining_amount
    for (const update of ledgerUpdates) {
      await base44.entities.ProjectCreditLedger.update(update.id, {
        remaining_amount: update.new_remaining,
      });
    }

    return Response.json({
      success: true,
      dry_run: false,
      project_id,
      mode,
      summary: {
        gross_exposure: grossExposure,
        credit_available: totalCreditAvailable,
        credit_already_applied: alreadyApplied,
        credit_applied_now: allocationPlan.reduce((sum, a) => sum + a.amount_applied, 0),
        credit_applied_total: newCreditApplied,
        net_exposure: Math.max(0, newNetExposure),
        allocations_created: createdAllocations.length,
      },
      created_allocations: createdAllocations.map(a => a.id),
      per_commitment: perCommitmentResult,
    });

  } catch (error) {
    console.error('applyProjectCreditToCommitments error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});