import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * removeProjectPartWithCredit — Hardened Part Removal with Line-Level Credit
 *
 * PHASE 1: Line-level credit accuracy (mixed pricing support)
 * PHASE 2: qty_removed lock — removed quantities cannot be reused
 * PHASE 3: Inventory return = min(qty_to_remove, allocated - installed), never installed
 * PHASE 4: Audit-grade traceability (calculation_method, invoice_line_ids, snapshots)
 * PHASE 5: Pre-mutation drift check — abort if financial drift exists
 * PHASE 6: Post-mutation validation — surface drift warnings
 * PHASE 9: NEVER modify invoices/lines, NEVER reduce invoiced_amount
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

    // ── Input Validation ──
    if (!project_id || !commitment_id) {
      return Response.json({ error: 'project_id and commitment_id are required' }, { status: 400 });
    }
    if (disposition && !['return_to_inventory', 'no_inventory'].includes(disposition)) {
      return Response.json({ error: 'disposition must be return_to_inventory or no_inventory' }, { status: 400 });
    }
    if (quantity_to_remove == null || quantity_to_remove <= 0) {
      return Response.json({ error: 'quantity_to_remove is required and must be > 0' }, { status: 400 });
    }

    // ── Load Commitment ──
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
    const existingRemoved = commitment.qty_removed ?? 0;
    const installedQty = commitment.qty_installed ?? 0;
    const invoicedQty = commitment.invoiced_qty ?? 0;
    const reservedFromStock = commitment.reserved_from_stock ?? 0;
    const coveredFromPO = commitment.covered_from_po ?? 0;
    const invoicedAmount = commitment.invoiced_amount ?? 0;
    const isInvoiced = invoicedAmount > 0;

    // PHASE 2: available_qty respects already-removed, installed, invoiced
    // The removable pool is: required_total - already_removed
    // We cannot remove more than what's left after prior removals
    const maxRemovable = requiredTotal - existingRemoved;
    if (quantity_to_remove > maxRemovable) {
      return Response.json({
        error: `Cannot remove ${quantity_to_remove}. Max removable: ${maxRemovable} (required: ${requiredTotal}, already removed: ${existingRemoved})`,
      }, { status: 400 });
    }
    if (maxRemovable <= 0) {
      return Response.json({ error: 'Nothing left to remove on this commitment' }, { status: 400 });
    }

    const qtyToRemove = quantity_to_remove;
    const isFullRemoval = (existingRemoved + qtyToRemove) >= requiredTotal;

    // Pricing snapshots for traceability
    const unitCost = commitment.unit_cost_snapshot ?? 0;
    const unitRetail = commitment.unit_retail_snapshot ?? 0;

    // ── PHASE 5: Pre-Mutation Drift Check ──
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.filter({ project_id });
    const projectInvoices = await base44.asServiceRole.entities.ProjectInvoice.filter({ project_id });
    const activeInvoiceIds = projectInvoices
      .filter(inv => inv.status !== 'cancelled' && inv.status !== 'void')
      .map(i => i.id);

    // Load ALL invoice lines for this project (for drift check) and commitment lines (for credit calc)
    const allInvoiceLines = activeInvoiceIds.length > 0
      ? await base44.asServiceRole.entities.ProjectInvoiceLine.filter({ invoice_id: activeInvoiceIds[0] })
        .then(async (first) => {
          // Need to fetch for all invoice IDs
          let all = [];
          for (const invId of activeInvoiceIds) {
            const lines = await base44.asServiceRole.entities.ProjectInvoiceLine.filter({ invoice_id: invId });
            all = all.concat(lines);
          }
          return all;
        })
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

    // ── PHASE 1: Line-Level Credit Calculation ──
    // Find invoice lines specifically for THIS commitment
    const commitmentInvoiceLines = allInvoiceLines.filter(
      l => l.part_commitment_id === commitment_id
    );

    const timestamp = new Date().toISOString();
    let creditCreated = false;
    let creditAmount = 0;
    let creditLedgerEntry = null;
    let creditAllocation = null;
    let calculationMethod = 'none';
    let invoiceLineIds = [];

    if (isInvoiced) {
      const totalQtyInvoicedFromLines = commitmentInvoiceLines.reduce((s, l) => s + (l.qty ?? 0), 0);
      const totalValueFromLines = round2(commitmentInvoiceLines.reduce((s, l) => s + (l.line_total ?? 0), 0));

      if (commitmentInvoiceLines.length > 0 && totalQtyInvoicedFromLines > 0) {
        // ── LINE-BASED CREDIT (MANDATORY when lines exist) ──
        // Check if all lines have the same unit_price (uniform vs mixed)
        const uniquePrices = new Set(commitmentInvoiceLines.map(l => round2(l.unit_price ?? 0)));

        if (uniquePrices.size === 1) {
          // Uniform pricing — simple calculation
          const effectiveUnitPrice = round2(totalValueFromLines / totalQtyInvoicedFromLines);
          creditAmount = round2(effectiveUnitPrice * qtyToRemove);
          calculationMethod = 'line_based_uniform';
        } else {
          // MIXED PRICING — proportional distribution across lines
          // Each line contributes its share: line_total * (qty_to_remove / total_qty_invoiced)
          creditAmount = round2(
            commitmentInvoiceLines.reduce((sum, line) => {
              const lineContribution = (line.line_total ?? 0) * (qtyToRemove / totalQtyInvoicedFromLines);
              return sum + lineContribution;
            }, 0)
          );
          calculationMethod = 'line_based_mixed';
        }

        invoiceLineIds = commitmentInvoiceLines.map(l => l.id);
      } else {
        // ── FALLBACK: Average-based (only if no invoice lines exist) ──
        const unitInvoicedValue = round2(invoicedAmount / requiredTotal);
        creditAmount = round2(unitInvoicedValue * qtyToRemove);
        calculationMethod = 'average_fallback';
      }

      // Safety cap: never credit more than total invoiced for this commitment
      creditAmount = Math.min(creditAmount, invoicedAmount);
      // Never negative
      creditAmount = Math.max(0, creditAmount);

      if (creditAmount > 0) {
        // ── PHASE 4: Audit-Grade Credit Record ──
        const beforeSnapshot = {
          commitment_status: commitment.commitment_status,
          required_total: requiredTotal,
          qty_removed: existingRemoved,
          reserved_from_stock: reservedFromStock,
          covered_from_po: coveredFromPO,
          qty_installed: installedQty,
          invoiced_amount: invoicedAmount,
          invoiced_qty: invoicedQty,
          planned_cost_total: commitment.planned_cost_total,
          planned_retail_total: commitment.planned_retail_total,
        };

        const afterSnapshot = {
          qty_removed: existingRemoved + qtyToRemove,
          is_full_removal: isFullRemoval,
          commitment_status: isFullRemoval ? 'cancelled' : commitment.commitment_status,
          remaining_required: isFullRemoval ? 0 : requiredTotal,
          // For partial: required_total stays same, qty_removed increments
        };

        creditLedgerEntry = await base44.asServiceRole.entities.ProjectCreditLedger.create({
          project_id,
          source_invoice_id: commitmentInvoiceLines[0]?.invoice_id || 'part_removal',
          credit_amount: creditAmount,
          remaining_amount: creditAmount,
          notes: [
            `Credit from part removal [${calculationMethod}]`,
            `Commitment: ${commitment_id} | Part: ${commitment.part_id}`,
            `Qty removed: ${qtyToRemove} (total removed: ${existingRemoved + qtyToRemove} of ${requiredTotal})`,
            `Credit: ${creditAmount} from invoiced: ${invoicedAmount}`,
            `Unit cost: ${unitCost} | Unit retail: ${unitRetail}`,
            `Invoice lines: ${invoiceLineIds.length > 0 ? invoiceLineIds.join(',') : 'none (fallback)'}`,
            `Before: ${JSON.stringify(beforeSnapshot)}`,
            `After: ${JSON.stringify(afterSnapshot)}`,
          ].join(' | '),
          credit_idempotency_key: `part_removal:${commitment_id}:${existingRemoved + qtyToRemove}:${timestamp}`,
        });

        creditAllocation = await base44.asServiceRole.entities.CreditAllocation.create({
          project_id,
          credit_ledger_id: creditLedgerEntry.id,
          commitment_id,
          amount_applied: creditAmount,
          allocation_mode: 'auto',
          allocation_key: `part_removal:${commitment_id}:${existingRemoved + qtyToRemove}:${timestamp}`,
          is_reversed: false,
        });

        creditCreated = true;
      }
    }

    // ── PHASE 2: Commitment State Update + qty_removed Lock ──
    const newQtyRemoved = existingRemoved + qtyToRemove;
    const costReduction = round2(unitCost * qtyToRemove);
    const retailReduction = round2(unitRetail * qtyToRemove);

    if (isFullRemoval) {
      // Full removal — cancel commitment
      await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
        commitment_status: 'cancelled',
        billing_status: creditCreated ? 'credited' : commitment.billing_status,
        qty_removed: newQtyRemoved,
        cancelled_at: timestamp,
        cancelled_by: user.id,
        cancelled_reason: reason || 'Part removed from project',
        cancellation_type: isInvoiced ? 'after_invoice' : 'before_invoice',
        scope_reduction_credit_created: creditCreated,
        // Zero out coverage for full cancellation
        reserved_from_stock: 0,
        covered_from_po: 0,
      });

      // Release allocated stock on full removal (non-installed portion)
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
      // Partial removal — increment qty_removed, reduce planned totals
      // required_total stays the SAME (it's the original scope)
      // qty_removed tracks how much has been taken away
      // Planned cost/retail reduced proportionally to removal
      const newPlannedCost = round2(Math.max(0, (commitment.planned_cost_total ?? 0) - costReduction));
      const newPlannedRetail = round2(Math.max(0, (commitment.planned_retail_total ?? 0) - retailReduction));

      // Clamp coverage to not exceed effective remaining qty
      const effectiveRemaining = requiredTotal - newQtyRemoved;
      const newReserved = Math.min(reservedFromStock, effectiveRemaining);
      const newCovered = Math.min(coveredFromPO, effectiveRemaining);

      await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
        qty_removed: newQtyRemoved,
        planned_cost_total: newPlannedCost,
        planned_retail_total: newPlannedRetail,
        reserved_from_stock: newReserved,
        covered_from_po: newCovered,
        // NEVER modify: invoiced_amount, invoiced_qty, billing_status, required_total
        scope_reduction_credit_created: creditCreated || (commitment.scope_reduction_credit_created ?? false),
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

    // ── PHASE 3: Inventory Disposition (Safety-First) ──
    let inventoryReturned = false;
    let inventoryReturnQty = 0;
    const effectiveDisposition = disposition || 'no_inventory';

    if (effectiveDisposition === 'return_to_inventory' && commitment.part_id) {
      const parts = await base44.asServiceRole.entities.Part.filter({ id: commitment.part_id });
      const part = parts[0];
      if (part) {
        // PHASE 3: returnable = min(qty_to_remove, allocated - installed), clamped >= 0
        // "allocated" here = reserved_from_stock (what was set aside for this commitment)
        const returnableQty = Math.max(0, Math.min(qtyToRemove, reservedFromStock - installedQty));

        if (returnableQty > 0) {
          await base44.asServiceRole.entities.Part.update(part.id, {
            physical_stock: (part.physical_stock ?? 0) + returnableQty,
          });
          inventoryReturned = true;
          inventoryReturnQty = returnableQty;
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
        qty_removed_before: existingRemoved,
        reserved_from_stock: reservedFromStock,
        covered_from_po: coveredFromPO,
        qty_installed: installedQty,
        invoiced_amount: invoicedAmount,
        invoiced_qty: invoicedQty,
        planned_cost_total: commitment.planned_cost_total,
        planned_retail_total: commitment.planned_retail_total,
      }),
      new_state: JSON.stringify({
        status: isFullRemoval ? 'cancelled' : commitment.commitment_status,
        is_full_removal: isFullRemoval,
        qty_removed_now: qtyToRemove,
        qty_removed_cumulative: newQtyRemoved,
        credit_amount: creditAmount,
        credit_created: creditCreated,
        credit_ledger_id: creditLedgerEntry?.id || null,
        calculation_method: calculationMethod,
        invoice_line_ids: invoiceLineIds,
        disposition: effectiveDisposition,
        inventory_returned: inventoryReturned,
        inventory_return_qty: inventoryReturnQty,
        cost_reduction: costReduction,
        retail_reduction: retailReduction,
      }),
      trigger_source: 'USER_ACTION',
      user_id: user.id,
      part_id: commitment.part_id,
      project_id,
      notes: reason || 'Part removed from project',
    });

    // ── PHASE 6: Post-Mutation Validation ──
    const postCommitments = await base44.asServiceRole.entities.PartCommitment.filter({ project_id });
    const postCreditAllocations = await base44.asServiceRole.entities.CreditAllocation.filter({ project_id }).catch(() => []);
    const activeCreditAllocations = (postCreditAllocations || []).filter(a => !a.is_reversed);

    const activePostComm = postCommitments.filter(c => !c.cancelled_at && c.commitment_status !== 'cancelled');
    const postInvoicedTotal = round2(activePostComm.reduce((s, c) => s + (c.invoiced_amount ?? 0), 0));
    const postAllInvoiced = round2(postCommitments.reduce((s, c) => s + (c.invoiced_amount ?? 0), 0));
    const postCreditTotal = round2(activeCreditAllocations.reduce((s, a) => s + (a.amount_applied ?? 0), 0));
    const postPlannedCost = round2(activePostComm.reduce((s, c) => s + (c.planned_cost_total ?? 0), 0));
    const postPlannedRetail = round2(activePostComm.reduce((s, c) => s + (c.planned_retail_total ?? 0), 0));
    const postDriftDelta = round2(linesTotal - postAllInvoiced);

    return Response.json({
      success: true,
      removal_type: isInvoiced ? 'invoiced_with_credit' : 'non_invoiced',
      is_full_removal: isFullRemoval,
      qty_removed: qtyToRemove,
      qty_removed_cumulative: newQtyRemoved,
      qty_remaining: requiredTotal - newQtyRemoved,
      credit_created: creditCreated,
      credit_amount: creditAmount,
      credit_ledger_id: creditLedgerEntry?.id || null,
      credit_allocation_id: creditAllocation?.id || null,
      calculation_method: calculationMethod,
      invoice_line_ids: invoiceLineIds,
      cost_reduction: costReduction,
      retail_reduction: retailReduction,
      inventory_returned: inventoryReturned,
      inventory_return_qty: inventoryReturnQty,
      installed_qty_at_removal: installedQty,
      disposition: effectiveDisposition,
      post_state: {
        planned_cost: postPlannedCost,
        planned_retail: postPlannedRetail,
        invoiced_total: postInvoicedTotal,
        credit_total: postCreditTotal,
        drift_detected: Math.abs(postDriftDelta) > 0.01,
        drift_delta: postDriftDelta,
      },
    });

  } catch (error) {
    console.error('removeProjectPartWithCredit error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});