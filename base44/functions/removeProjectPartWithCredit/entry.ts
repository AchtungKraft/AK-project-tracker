import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * removeProjectPartWithCredit — Canonical Part Removal with Credit Integration
 *
 * Uses resolveProjectFinancialTotals for pre/post validation.
 * Uses analyzeFinancialDrift for post-mutation drift check.
 *
 * RULES:
 * - Never mutate ProjectInvoice or ProjectInvoiceLine
 * - Never reduce commitment.invoiced_amount
 * - If invoiced: create CreditAllocation, soft-remove commitment
 * - If not invoiced: soft-remove commitment, release reservations
 * - Optionally return physical stock to inventory
 */

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      project_id,
      commitment_id,
      disposition,       // "return_to_inventory" | "no_inventory"
      reason,
      quantity_to_remove, // optional — defaults to full required_total
    } = await req.json();

    if (!project_id || !commitment_id) {
      return Response.json({ error: 'project_id and commitment_id are required' }, { status: 400 });
    }
    if (disposition && !['return_to_inventory', 'no_inventory'].includes(disposition)) {
      return Response.json({ error: 'disposition must be return_to_inventory or no_inventory' }, { status: 400 });
    }

    // ── Phase 2: Load and Validate ──
    const [commitments, project] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id }),
      base44.asServiceRole.entities.Project.filter({ id: project_id }),
    ]);

    const commitment = commitments[0];
    if (!commitment) {
      return Response.json({ error: 'Commitment not found' }, { status: 404 });
    }
    if (commitment.project_id !== project_id) {
      return Response.json({ error: 'Commitment does not belong to this project' }, { status: 400 });
    }
    if (commitment.commitment_status === 'cancelled' || commitment.cancelled_at) {
      return Response.json({ error: 'Commitment is already removed/cancelled' }, { status: 400 });
    }

    const qtyToRemove = quantity_to_remove ?? commitment.required_total ?? 0;
    if (qtyToRemove <= 0) {
      return Response.json({ error: 'quantity_to_remove must be positive' }, { status: 400 });
    }
    if (qtyToRemove > (commitment.required_total ?? 0)) {
      return Response.json({ error: 'quantity_to_remove exceeds required_total' }, { status: 400 });
    }

    // Load invoice lines referencing this commitment
    const invoiceLines = await base44.asServiceRole.entities.ProjectInvoiceLine.filter({
      part_commitment_id: commitment_id
    }).catch(() => []);

    const invoicedAmount = commitment.invoiced_amount ?? 0;
    const isInvoiced = invoicedAmount > 0;
    const isFullRemoval = qtyToRemove >= (commitment.required_total ?? 0);

    // ── Pre-mutation drift check (lightweight — compare invoice lines vs commitment invoiced) ──
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.filter({ project_id });
    const projectInvoices = await base44.asServiceRole.entities.ProjectInvoice.filter({ project_id });
    const activeInvoiceIds = projectInvoices
      .filter(inv => inv.status !== 'cancelled' && inv.status !== 'void')
      .map(i => i.id);
    const allInvoiceLines = activeInvoiceIds.length > 0
      ? await base44.asServiceRole.entities.ProjectInvoiceLine.filter({ invoice_id: { $in: activeInvoiceIds } })
      : [];

    const linesTotal = round2(allInvoiceLines.reduce((s, l) => s + (l.line_total ?? 0), 0));
    const allCommInvoiced = round2(allCommitments.reduce((s, c) => s + (c.invoiced_amount ?? 0), 0));
    const preDriftDelta = round2(linesTotal - allCommInvoiced);

    if (Math.abs(preDriftDelta) > 0.01) {
      return Response.json({
        error: 'Financial drift detected. Please run drift reconciliation before removing parts.',
        drift: { line_vs_commitment_delta: preDriftDelta },
      }, { status: 409 });
    }

    const timestamp = new Date().toISOString();
    let creditCreated = false;
    let creditAmount = 0;
    let creditLedgerEntry = null;
    let creditAllocation = null;

    // ── Phase 3/4: Branch on invoiced status ──
    if (isInvoiced) {
      // ── INVOICED REMOVAL ──
      // Calculate proportional credit
      const requiredTotal = commitment.required_total ?? 1;
      creditAmount = round2(invoicedAmount * (qtyToRemove / requiredTotal));

      if (creditAmount > 0) {
        // Create ProjectCreditLedger entry
        creditLedgerEntry = await base44.asServiceRole.entities.ProjectCreditLedger.create({
          project_id,
          source_invoice_id: invoiceLines[0]?.invoice_id || 'part_removal',
          credit_amount: creditAmount,
          remaining_amount: creditAmount,
          notes: `Credit from part removal: ${reason || 'Part removed from project'}. Commitment: ${commitment_id}`,
          credit_idempotency_key: `part_removal:${commitment_id}:${timestamp}`,
        });

        // Create CreditAllocation
        creditAllocation = await base44.asServiceRole.entities.CreditAllocation.create({
          project_id,
          credit_ledger_id: creditLedgerEntry.id,
          commitment_id,
          amount_applied: creditAmount,
          allocation_mode: 'auto',
          allocation_key: `part_removal:${commitment_id}:${timestamp}`,
          is_reversed: false,
        });

        creditCreated = true;
      }

      // Update commitment — NEVER reduce invoiced_amount
      const commitmentUpdate = {
        commitment_status: 'cancelled',
        cancelled_at: timestamp,
        cancelled_by: user.id,
        cancelled_reason: reason || 'Part removed from project',
        cancellation_type: 'after_invoice',
        scope_reduction_credit_created: creditCreated,
      };

      if (!isFullRemoval) {
        // Partial removal — reduce required_total but keep invoiced_amount intact
        commitmentUpdate.required_total = (commitment.required_total ?? 0) - qtyToRemove;
        commitmentUpdate.commitment_status = commitment.commitment_status; // Don't cancel
        delete commitmentUpdate.cancelled_at;
        delete commitmentUpdate.cancelled_by;
        delete commitmentUpdate.cancelled_reason;
        delete commitmentUpdate.cancellation_type;
      }

      await base44.asServiceRole.entities.PartCommitment.update(commitment_id, commitmentUpdate);

    } else {
      // ── NON-INVOICED REMOVAL ──
      // Release reservations
      const reservedFromStock = commitment.reserved_from_stock ?? 0;

      if (isFullRemoval) {
        // Full cancellation
        await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
          commitment_status: 'cancelled',
          cancelled_at: timestamp,
          cancelled_by: user.id,
          cancelled_reason: reason || 'Part removed from project',
          cancellation_type: 'before_invoice',
          reserved_from_stock: 0,
          covered_from_po: 0,
        });

        // Release allocated stock back to part.physical_stock if reserved
        if (reservedFromStock > 0 && commitment.part_id) {
          const parts = await base44.asServiceRole.entities.Part.filter({ id: commitment.part_id });
          const part = parts[0];
          if (part) {
            const newAllocated = Math.max(0, (part.allocated_stock ?? 0) - reservedFromStock);
            await base44.asServiceRole.entities.Part.update(part.id, {
              allocated_stock: newAllocated,
            });
          }
        }
      } else {
        // Partial removal — reduce required_total
        const newRequired = (commitment.required_total ?? 0) - qtyToRemove;
        const newReserved = Math.min(reservedFromStock, newRequired);
        await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
          required_total: newRequired,
          reserved_from_stock: newReserved,
        });
      }
    }

    // ── Phase 5: Inventory Disposition ──
    let inventoryReturned = false;
    const effectiveDisposition = disposition || 'no_inventory';

    if (effectiveDisposition === 'return_to_inventory' && commitment.part_id) {
      const parts = await base44.asServiceRole.entities.Part.filter({ id: commitment.part_id });
      const part = parts[0];
      if (part) {
        const returnQty = isInvoiced
          ? qtyToRemove // Return what's being removed
          : Math.min(qtyToRemove, commitment.reserved_from_stock ?? 0); // Only return what was reserved

        if (returnQty > 0) {
          await base44.asServiceRole.entities.Part.update(part.id, {
            physical_stock: (part.physical_stock ?? 0) + returnQty,
          });
          inventoryReturned = true;
        }
      }
    }

    // ── Phase 6: Lifecycle Event ──
    await base44.asServiceRole.entities.LifecycleEvent.create({
      commitment_id,
      event_type: isInvoiced ? 'COMMITMENT_REMOVED_WITH_CREDIT' : 'COMMITMENT_CANCELLED',
      previous_state: JSON.stringify({
        status: commitment.commitment_status,
        required_total: commitment.required_total,
        invoiced_amount: invoicedAmount,
      }),
      new_state: JSON.stringify({
        status: isFullRemoval ? 'cancelled' : commitment.commitment_status,
        qty_removed: qtyToRemove,
        credit_amount: creditAmount,
        disposition: effectiveDisposition,
        inventory_returned: inventoryReturned,
      }),
      trigger_source: 'USER_ACTION',
      user_id: user.id,
      part_id: commitment.part_id,
      project_id,
      notes: reason || 'Part removed from project',
    });

    // ── Phase 9: Post-Mutation Validation ──
    // Re-read commitments to check post-state
    const postCommitments = await base44.asServiceRole.entities.PartCommitment.filter({ project_id });
    const postCreditAllocations = await base44.asServiceRole.entities.CreditAllocation.filter({ project_id, is_reversed: false }).catch(() => []);

    const activePostComm = postCommitments.filter(c => !c.cancelled_at && c.commitment_status !== 'cancelled');
    const postInvoicedTotal = round2(activePostComm.reduce((s, c) => s + (c.invoiced_amount ?? 0), 0));
    const postAllInvoiced = round2(postCommitments.reduce((s, c) => s + (c.invoiced_amount ?? 0), 0));
    const postCreditTotal = round2(postCreditAllocations.reduce((s, a) => s + (a.amount_applied ?? 0), 0));
    const postPlannedRetail = round2(activePostComm.reduce((s, c) => s + ((c.unit_retail_snapshot ?? 0) * (c.required_total ?? 0)), 0));
    const postRemainingTotal = round2(Math.max(0, postPlannedRetail - postInvoicedTotal - postCreditTotal));
    const postDriftDelta = round2(linesTotal - postAllInvoiced);

    return Response.json({
      success: true,
      removal_type: isInvoiced ? 'invoiced_with_credit' : 'non_invoiced',
      is_full_removal: isFullRemoval,
      qty_removed: qtyToRemove,
      credit_created: creditCreated,
      credit_amount: creditAmount,
      credit_ledger_id: creditLedgerEntry?.id || null,
      credit_allocation_id: creditAllocation?.id || null,
      inventory_returned: inventoryReturned,
      disposition: effectiveDisposition,
      post_resolver: {
        remaining_total: postRemainingTotal,
        credit_total: postCreditTotal,
        invoiced_total: postInvoicedTotal,
        drift_detected: Math.abs(postDriftDelta) > 0.01,
      },
      post_drift: {
        projects_with_drift: Math.abs(postDriftDelta) > 0.01 ? 1 : 0,
        total_delta: postDriftDelta,
      },
    });

  } catch (error) {
    console.error('removeProjectPartWithCredit error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});