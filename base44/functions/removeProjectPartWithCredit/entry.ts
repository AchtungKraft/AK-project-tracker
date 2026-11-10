import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * removeProjectPartWithCredit — Canonical part removal from a project build.
 *
 * Rules:
 * - Removable qty = required_total - qty_removed - qty_installed - covered_from_po - covered_from_external.
 *   Installed units and units covered by open PO / external inbound cannot be removed here
 *   (reduce/cancel the PO or reverse the install first). POs are never touched.
 * - Reserved stock is released (reservation only; physical stock is NEVER changed — the units
 *   never left the shelf).
 * - Invoiced quantities create a line-level credit (existing protection). Invoices/lines are never modified.
 * - A commitment sitting on an open DRAFT invoice line cannot be removed (remove the line first).
 * - Drift check compares only SENT/PAID part lines vs commitment invoiced_amount
 *   (draft lines and labor/service lines are not part of commitment billing).
 * - Concurrency: compare-and-set on updated_date + client expected_qty_removed.
 * - Idempotency: client action_id; a replay returns the original result without mutating again.
 */

const round2 = (n) => Math.round((n || 0) * 100) / 100;
const BILLED_STATUSES = new Set(['sent', 'partial', 'paid', 'overdue']);
const fail = (error, status, extra = {}) => Response.json({ success: false, error, ...extra }, { status });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail('Unauthorized', 401);

    const sr = base44.asServiceRole.entities;

    // Authorization: admins, or internal (Achtung Kraft) team members. External company users are blocked.
    if (user.role !== 'admin') {
      const tms = await sr.TeamMember.filter({ user_id: user.id });
      if (tms[0] && tms[0].is_achtung_kraft_member === false) {
        return fail('You do not have permission to remove project parts.', 403);
      }
    }

    const { project_id, commitment_id, disposition, reason, quantity_to_remove, action_id, expected_qty_removed } = await req.json();

    if (!project_id || !commitment_id) return fail('project_id and commitment_id are required', 400);
    if (disposition && !['return_to_inventory', 'no_inventory'].includes(disposition)) {
      return fail('disposition must be return_to_inventory or no_inventory', 400);
    }
    if (!Number.isInteger(quantity_to_remove) || quantity_to_remove <= 0) {
      return fail('Quantity to remove must be a whole number greater than 0', 400);
    }

    // ── Idempotent replay ──
    if (action_id) {
      const prior = await sr.LifecycleEvent.filter({ action_id, commitment_id });
      if (prior[0]) {
        const st = JSON.parse(prior[0].new_state || '{}');
        return Response.json({ success: true, idempotent_replay: true, ...st.result });
      }
    }

    const [commitments, projects] = await Promise.all([
      sr.PartCommitment.filter({ id: commitment_id }),
      sr.Project.filter({ id: project_id }),
    ]);
    const commitment = commitments[0];
    if (!projects[0]) return fail('Project not found', 404);
    if (!commitment) return fail('Requirement not found', 404);
    if (commitment.project_id !== project_id) return fail('This requirement does not belong to this project', 400);
    if (commitment.commitment_status === 'cancelled' || commitment.cancelled_at) {
      return fail('This requirement has already been removed', 409);
    }

    const requiredTotal = commitment.required_total ?? 0;
    const existingRemoved = commitment.qty_removed ?? 0;
    if (expected_qty_removed != null && expected_qty_removed !== existingRemoved) {
      return fail('This requirement changed since the dialog was opened. Refresh and try again.', 409);
    }

    const installedQty = commitment.qty_installed ?? 0;
    const invoicedQty = commitment.invoiced_qty ?? 0;
    const reservedFromStock = commitment.reserved_from_stock ?? 0;
    const coveredFromPO = commitment.covered_from_po ?? 0;
    const coveredExternal = commitment.covered_from_external ?? 0;
    const invoicedAmount = commitment.invoiced_amount ?? 0;
    const isInvoiced = invoicedAmount > 0;

    const remaining = requiredTotal - existingRemoved;
    const maxRemovable = Math.max(0, remaining - installedQty - coveredFromPO - coveredExternal);
    if (quantity_to_remove > maxRemovable) {
      const blockers = [];
      if (installedQty > 0) blockers.push(`${installedQty} installed`);
      if (coveredFromPO > 0) blockers.push(`${coveredFromPO} on a purchase order`);
      if (coveredExternal > 0) blockers.push(`${coveredExternal} on an external order`);
      return fail(
        maxRemovable === 0
          ? `Nothing can be removed${blockers.length ? `: ${blockers.join(', ')}` : ''}. Reverse the install or reduce the order first.`
          : `Only ${maxRemovable} can be removed${blockers.length ? ` (${blockers.join(', ')})` : ''}.`,
        400, { max_removable: maxRemovable },
      );
    }

    const qtyToRemove = quantity_to_remove;
    const newQtyRemoved = existingRemoved + qtyToRemove;
    const isFullRemoval = newQtyRemoved >= requiredTotal;
    const unitCost = commitment.unit_cost_snapshot ?? 0;
    const unitRetail = commitment.unit_retail_snapshot ?? 0;

    // ── Invoice lines (sent/paid vs draft) ──
    const [allCommitments, projectInvoices] = await Promise.all([
      sr.PartCommitment.filter({ project_id }),
      sr.ProjectInvoice.filter({ project_id }),
    ]);
    const billedIds = new Set(projectInvoices.filter((i) => BILLED_STATUSES.has(i.status)).map((i) => i.id));
    const draftIds = new Set(projectInvoices.filter((i) => i.status === 'draft').map((i) => i.id));
    const lineGroups = await Promise.all(
      [...billedIds, ...draftIds].map((id) => sr.ProjectInvoiceLine.filter({ invoice_id: id })),
    );
    const allLines = lineGroups.flat();

    if (allLines.some((l) => draftIds.has(l.invoice_id) && l.part_commitment_id === commitment_id)) {
      return fail('This part is on a draft invoice. Remove it from the draft invoice before removing it from the build.', 409);
    }

    const billedPartLines = allLines.filter((l) => billedIds.has(l.invoice_id) && l.part_commitment_id);
    const linesTotal = round2(billedPartLines.reduce((s, l) => s + (l.line_total ?? 0), 0));
    const commInvoiced = round2(allCommitments.reduce((s, c) => s + (c.invoiced_amount ?? 0), 0));
    const preDriftDelta = round2(linesTotal - commInvoiced);
    if (isInvoiced && Math.abs(preDriftDelta) > 0.01) {
      return fail('Financial drift detected on sent invoices. Run drift reconciliation before removing invoiced parts.', 409,
        { drift: { line_vs_commitment_delta: preDriftDelta } });
    }

    // ── Commitment update (compare-and-set) ──
    const timestamp = new Date().toISOString();
    const costReduction = round2(unitCost * qtyToRemove);
    const retailReduction = round2(unitRetail * qtyToRemove);
    const effectiveRemaining = requiredTotal - newQtyRemoved;
    const newReserved = isFullRemoval ? 0 : Math.min(reservedFromStock, effectiveRemaining);
    const releasedStock = reservedFromStock - newReserved;

    const set = isFullRemoval
      ? {
          commitment_status: 'cancelled',
          qty_removed: newQtyRemoved,
          cancelled_at: timestamp,
          cancelled_by: user.id,
          cancelled_reason: reason || 'Part removed from project',
          cancellation_type: isInvoiced ? 'after_invoice' : 'before_invoice',
          reserved_from_stock: 0,
        }
      : {
          qty_removed: newQtyRemoved,
          planned_cost_total: round2(Math.max(0, (commitment.planned_cost_total ?? 0) - costReduction)),
          planned_retail_total: round2(Math.max(0, (commitment.planned_retail_total ?? 0) - retailReduction)),
          reserved_from_stock: newReserved,
        };
    set.state_version = (commitment.state_version ?? 0) + 1;
    set.last_recomputed_at = timestamp;

    const cas = await sr.PartCommitment.updateMany(
      { id: commitment_id, updated_date: commitment.updated_date },
      { $set: set },
    );
    if (cas.updated !== 1) {
      return fail('This requirement was changed by another action. Refresh and try again.', 409);
    }

    // ── Release reservation (no physical stock change) ──
    if (releasedStock > 0 && commitment.part_id) {
      const part = (await sr.Part.filter({ id: commitment.part_id }))[0];
      if (part && (part.allocated_stock ?? 0) > 0) {
        await sr.Part.update(part.id, { allocated_stock: Math.max(0, part.allocated_stock - releasedStock) });
      }
    }

    // ── Credit for invoiced quantities (existing protection) ──
    let creditCreated = false, creditAmount = 0, creditLedgerEntry = null, creditAllocation = null;
    let calculationMethod = 'none', invoiceLineIds = [];
    if (isInvoiced) {
      const myLines = billedPartLines.filter((l) => l.part_commitment_id === commitment_id);
      const lineQty = myLines.reduce((s, l) => s + (l.qty ?? 0), 0);
      if (myLines.length > 0 && lineQty > 0) {
        const lineValue = myLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
        creditAmount = round2(lineValue * (qtyToRemove / lineQty));
        calculationMethod = new Set(myLines.map((l) => round2(l.unit_price ?? 0))).size === 1 ? 'line_based_uniform' : 'line_based_mixed';
        invoiceLineIds = myLines.map((l) => l.id);
      } else {
        creditAmount = round2((invoicedAmount / requiredTotal) * qtyToRemove);
        calculationMethod = 'average_fallback';
      }
      creditAmount = Math.max(0, Math.min(creditAmount, invoicedAmount));

      if (creditAmount > 0) {
        const key = `part_removal:${commitment_id}:${newQtyRemoved}`;
        creditLedgerEntry = await sr.ProjectCreditLedger.create({
          project_id,
          source_invoice_id: myLines[0]?.invoice_id || 'part_removal',
          credit_amount: creditAmount,
          remaining_amount: creditAmount,
          notes: [
            `Credit from part removal [${calculationMethod}]`,
            `Commitment: ${commitment_id} | Part: ${commitment.part_id}`,
            `Qty removed: ${qtyToRemove} (total removed: ${newQtyRemoved} of ${requiredTotal})`,
            `Credit: ${creditAmount} from invoiced: ${invoicedAmount} (invoiced qty ${invoicedQty})`,
            `Invoice lines: ${invoiceLineIds.join(',') || 'none (fallback)'}`,
          ].join(' | '),
          credit_idempotency_key: key,
        });
        creditAllocation = await sr.CreditAllocation.create({
          project_id,
          credit_ledger_id: creditLedgerEntry.id,
          commitment_id,
          amount_applied: creditAmount,
          allocation_mode: 'auto',
          allocation_key: key,
          is_reversed: false,
        });
        creditCreated = true;
        await sr.PartCommitment.update(commitment_id, { scope_reduction_credit_created: true });
      }
    }

    // ── Post-state ──
    const postCommitments = await sr.PartCommitment.filter({ project_id });
    const activePost = postCommitments.filter((c) => !c.cancelled_at && c.commitment_status !== 'cancelled');
    const postDriftDelta = round2(linesTotal - round2(postCommitments.reduce((s, c) => s + (c.invoiced_amount ?? 0), 0)));

    const result = {
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
      reservation_released_qty: releasedStock,
      inventory_returned: false,
      inventory_return_qty: 0,
      installed_qty_at_removal: installedQty,
      disposition: disposition || 'no_inventory',
      part_id: commitment.part_id,
      project_id,
      commitment_id,
      post_state: {
        planned_cost: round2(activePost.reduce((s, c) => s + (c.planned_cost_total ?? 0), 0)),
        planned_retail: round2(activePost.reduce((s, c) => s + (c.planned_retail_total ?? 0), 0)),
        drift_detected: Math.abs(postDriftDelta) > 0.01,
        drift_delta: postDriftDelta,
      },
    };

    await sr.LifecycleEvent.create({
      commitment_id,
      event_type: isFullRemoval ? 'COMMITMENT_CANCELLED' : 'QTY_CANCELLED',
      previous_state: JSON.stringify({
        status: commitment.commitment_status, required_total: requiredTotal, qty_removed: existingRemoved,
        reserved_from_stock: reservedFromStock, covered_from_po: coveredFromPO, qty_installed: installedQty,
        invoiced_amount: invoicedAmount, invoiced_qty: invoicedQty,
        planned_cost_total: commitment.planned_cost_total, planned_retail_total: commitment.planned_retail_total,
      }),
      new_state: JSON.stringify({ status: isFullRemoval ? 'cancelled' : commitment.commitment_status, result }),
      trigger_source: 'USER_ACTION',
      triggered_by: user.email,
      user_id: user.id,
      part_id: commitment.part_id,
      project_id,
      qty_delta: -qtyToRemove,
      event_date: timestamp,
      reason: reason || 'Part removed from project',
      action_id: action_id || undefined,
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('removeProjectPartWithCredit error:', error);
    return fail(error.message || 'Unexpected error removing part', 500);
  }
});