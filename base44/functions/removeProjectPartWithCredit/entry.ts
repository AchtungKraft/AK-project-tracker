import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * removeProjectPartWithCredit — Canonical Part Removal with Credit Integration
 *
 * PHASES 1-11 HARDENED:
 * - Quantity-aware partial/full removal
 * - Proportional credit: unit_invoiced × qty_removed
 * - Inventory safety: installed items never auto-returned
 * - Pre/post drift validation
 * - Full traceability metadata on credit records
 * - NEVER mutate invoice/invoice lines
 * - NEVER reduce invoiced_amount
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
      disposition,          // "return_to_inventory" | "no_inventory"
      reason,
      quantity_to_remove,   // REQUIRED — explicit qty
    } = await req.json();

    // ── PHASE 1: Input Validation ──
    if (!project_id || !commitment_id) {
      return Response.json({ error: 'project_id and commitment_id are required' }, { status: 400 });
    }
    if (disposition && !['return_to_inventory', 'no_inventory'].includes(disposition)) {
      return Response.json({ error: 'disposition must be return_to_inventory or no_inventory' }, { status: 400 });
    }
    if (quantity_to_remove == null || quantity_to_remove <= 0) {
      return Response.json({ error: 'quantity_to_remove is required and must be > 0' }, { status: 400 });
    }

    // ── Load Commitment + Project ──
    const [commitments, projects] = await Promise.all([
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

    const requiredTotal = commitment.required_total ?? 0;
    const qtyToRemove = Math.min(quantity_to_remove, requiredTotal);

    if (qtyToRemove <= 0) {
      return Response.json({ error: 'Nothing to remove (required_total is 0)' }, { status: 400 });
    }
    if (quantity_to_remove > requiredTotal) {
      return Response.json({ error: `quantity_to_remove (${quantity_to_remove}) exceeds required_total (${requiredTotal})` }, { status: 400 });
    }

    const isFullRemoval = qtyToRemove >= requiredTotal;
    const invoicedAmount = commitment.invoiced_amount ?? 0;
    const isInvoiced = invoicedAmount > 0;
    const installedQty = commitment.qty_installed ?? 0;
    const reservedFromStock = commitment.reserved_from_stock ?? 0;
    const coveredFromPO = commitment.covered_from_po ?? 0;

    // Snapshot pricing for traceability
    const unitCost = commitment.unit_cost_snapshot ?? 0;
    const unitRetail = commitment.unit_retail_snapshot ?? 0;

    // ── PHASE 5: Pre-Mutation Drift Check ──
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

    // Load invoice lines for this commitment (for traceability)
    const commitmentInvoiceLines = await base44.asServiceRole.entities.ProjectInvoiceLine.filter({
      part_commitment_id: commitment_id
    }).catch(() => []);

    const timestamp = new Date().toISOString();
    let creditCreated = false;
    let creditAmount = 0;
    let creditLedgerEntry = null;
    let creditAllocation = null;

    // ── PHASE 1+2: Credit Calculation & Commitment Update ──
    if (isInvoiced) {
      // ── INVOICED REMOVAL ──
      // PHASE 1: Proportional credit = (invoiced_amount / required_total) × qty_removed
      const unitInvoicedValue = round2(invoicedAmount / requiredTotal);
      creditAmount = round2(unitInvoicedValue * qtyToRemove);

      // Safety: never credit more than total invoiced
      creditAmount = Math.min(creditAmount, invoicedAmount);

      if (creditAmount > 0) {
        // PHASE 4: Full traceability metadata
        creditLedgerEntry = await base44.asServiceRole.entities.ProjectCreditLedger.create({
          project_id,
          source_invoice_id: commitmentInvoiceLines[0]?.invoice_id || 'part_removal',
          credit_amount: creditAmount,
          remaining_amount: creditAmount,
          notes: [
            `Credit from part removal: ${reason || 'Part removed from project'}`,
            `Commitment: ${commitment_id}`,
            `Part: ${commitment.part_id}`,
            `Qty removed: ${qtyToRemove} of ${requiredTotal}`,
            `Unit invoiced value: ${unitInvoicedValue}`,
            `Unit cost snapshot: ${unitCost}`,
            `Unit retail snapshot: ${unitRetail}`,
          ].join(' | '),
          credit_idempotency_key: `part_removal:${commitment_id}:${qtyToRemove}:${timestamp}`,
        });

        creditAllocation = await base44.asServiceRole.entities.CreditAllocation.create({
          project_id,
          credit_ledger_id: creditLedgerEntry.id,
          commitment_id,
          amount_applied: creditAmount,
          allocation_mode: 'auto',
          allocation_key: `part_removal:${commitment_id}:${qtyToRemove}:${timestamp}`,
          is_reversed: false,
        });

        creditCreated = true;
      }

      // ── PHASE 2: Commitment State Update ──
      if (isFullRemoval) {
        // Full removal — cancel commitment, set billing_status to credited
        await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
          commitment_status: 'cancelled',
          billing_status: creditCreated ? 'credited' : commitment.billing_status,
          cancelled_at: timestamp,
          cancelled_by: user.id,
          cancelled_reason: reason || 'Part removed from project',
          cancellation_type: 'after_invoice',
          scope_reduction_credit_created: creditCreated,
        });
      } else {
        // Partial removal — reduce quantities proportionally, NEVER touch invoiced_amount
        const remainingQty = requiredTotal - qtyToRemove;
        const proportionRemaining = remainingQty / requiredTotal;

        await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
          required_total: remainingQty,
          planned_cost_total: round2((commitment.planned_cost_total ?? 0) * proportionRemaining),
          planned_retail_total: round2((commitment.planned_retail_total ?? 0) * proportionRemaining),
          // Clamp coverage fields to not exceed new required_total
          reserved_from_stock: Math.min(reservedFromStock, remainingQty),
          covered_from_po: Math.min(coveredFromPO, remainingQty),
          // NEVER modify: invoiced_amount, invoiced_qty, billing_status
          scope_reduction_credit_created: creditCreated,
        });
      }

    } else {
      // ── NON-INVOICED REMOVAL ──
      if (isFullRemoval) {
        await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
          commitment_status: 'cancelled',
          cancelled_at: timestamp,
          cancelled_by: user.id,
          cancelled_reason: reason || 'Part removed from project',
          cancellation_type: 'before_invoice',
          reserved_from_stock: 0,
          covered_from_po: 0,
        });

        // Release allocated stock
        if (reservedFromStock > 0 && commitment.part_id) {
          const parts = await base44.asServiceRole.entities.Part.filter({ id: commitment.part_id });
          const part = parts[0];
          if (part) {
            await base44.asServiceRole.entities.Part.update(part.id, {
              allocated_stock: Math.max(0, (part.allocated_stock ?? 0) - reservedFromStock),
            });
          }
        }
      } else {
        // Partial removal — reduce required_total + proportional financials
        const remainingQty = requiredTotal - qtyToRemove;
        const proportionRemaining = remainingQty / requiredTotal;
        const newReserved = Math.min(reservedFromStock, remainingQty);
        const newCovered = Math.min(coveredFromPO, remainingQty);

        await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
          required_total: remainingQty,
          planned_cost_total: round2((commitment.planned_cost_total ?? 0) * proportionRemaining),
          planned_retail_total: round2((commitment.planned_retail_total ?? 0) * proportionRemaining),
          reserved_from_stock: newReserved,
          covered_from_po: newCovered,
        });

        // Release excess allocation
        const releasedStock = reservedFromStock - newReserved;
        if (releasedStock > 0 && commitment.part_id) {
          const parts = await base44.asServiceRole.entities.Part.filter({ id: commitment.part_id });
          const part = parts[0];
          if (part) {
            await base44.asServiceRole.entities.Part.update(part.id, {
              allocated_stock: Math.max(0, (part.allocated_stock ?? 0) - releasedStock),
            });
          }
        }
      }
    }

    // ── PHASE 3: Inventory Disposition (Safety-First) ──
    let inventoryReturned = false;
    let inventoryReturnQty = 0;
    const effectiveDisposition = disposition || 'no_inventory';

    if (effectiveDisposition === 'return_to_inventory' && commitment.part_id) {
      const parts = await base44.asServiceRole.entities.Part.filter({ id: commitment.part_id });
      const part = parts[0];
      if (part) {
        // PHASE 3 SAFETY: Never auto-return installed items
        // returnableQty = min(qty_removed, reserved_from_stock) - installed_qty (clamped ≥ 0)
        const maxReturnableFromReservation = Math.min(qtyToRemove, reservedFromStock);
        const safeReturnQty = Math.max(0, maxReturnableFromReservation - installedQty);

        if (safeReturnQty > 0) {
          await base44.asServiceRole.entities.Part.update(part.id, {
            physical_stock: (part.physical_stock ?? 0) + safeReturnQty,
          });
          inventoryReturned = true;
          inventoryReturnQty = safeReturnQty;
        }
      }
    }

    // ── PHASE 4: Lifecycle Event with Full Traceability ──
    await base44.asServiceRole.entities.LifecycleEvent.create({
      commitment_id,
      event_type: isInvoiced ? 'COMMITMENT_REMOVED_WITH_CREDIT' : 'COMMITMENT_CANCELLED',
      previous_state: JSON.stringify({
        status: commitment.commitment_status,
        required_total: requiredTotal,
        reserved_from_stock: reservedFromStock,
        covered_from_po: coveredFromPO,
        qty_installed: installedQty,
        invoiced_amount: invoicedAmount,
        planned_cost_total: commitment.planned_cost_total,
        planned_retail_total: commitment.planned_retail_total,
      }),
      new_state: JSON.stringify({
        status: isFullRemoval ? 'cancelled' : commitment.commitment_status,
        is_full_removal: isFullRemoval,
        qty_removed: qtyToRemove,
        credit_amount: creditAmount,
        credit_created: creditCreated,
        credit_ledger_id: creditLedgerEntry?.id || null,
        disposition: effectiveDisposition,
        inventory_returned: inventoryReturned,
        inventory_return_qty: inventoryReturnQty,
        installed_qty_at_removal: installedQty,
      }),
      trigger_source: 'USER_ACTION',
      user_id: user.id,
      part_id: commitment.part_id,
      project_id,
      notes: reason || 'Part removed from project',
    });

    // ── PHASE 6: Post-Mutation Validation ──
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
      qty_remaining: isFullRemoval ? 0 : (requiredTotal - qtyToRemove),
      credit_created: creditCreated,
      credit_amount: creditAmount,
      credit_ledger_id: creditLedgerEntry?.id || null,
      credit_allocation_id: creditAllocation?.id || null,
      inventory_returned: inventoryReturned,
      inventory_return_qty: inventoryReturnQty,
      installed_qty_at_removal: installedQty,
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