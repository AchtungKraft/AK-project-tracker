import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * backfillLegacyReceiving — Converts PO coverage to stock reservations (HARDENED)
 *
 * GUARANTEES:
 *   1. Conversion never exceeds received_qty
 *   2. Conversion never exceeds physical_stock
 *   3. Zero conversion when received_qty = 0
 *   4. Every row returns will_apply + skip_reason (if false)
 *   5. Identical logic for dry_run and apply (single computeConversion function)
 *   6. preview === result (deterministic)
 *
 * Lifecycle resolver identical to getReceivingGapDiagnostics.
 */

function resolveLifecycleState(c) {
  const rawStatus = (c.commitment_status || '').toLowerCase();
  if (rawStatus === 'cancelled') return 'CANCELLED';
  if (rawStatus === 'closed') return 'CLOSED';
  const rt = c.required_total ?? 0;
  const rfs = c.reserved_from_stock ?? 0;
  const cfp = c.covered_from_po ?? 0;
  const qi = c.qty_installed ?? 0;
  const ct = rfs + cfp;
  if (qi >= rt && rt > 0) return 'INSTALLED';
  if (rfs >= rt && rt > 0) return 'INSTALL_READY';
  if (ct >= rt && rt > 0) return 'COVERED';
  if (Math.max(0, rt - ct) > 0) return 'NEEDS_ORDER';
  return 'PLANNED';
}

/**
 * computeConversion — Core conversion logic used by BOTH dry_run and apply.
 * Returns { will_apply, skip_reason, convertible_qty, before, after }.
 *
 * Invariants enforced:
 *   - convertible_qty <= received_qty
 *   - convertible_qty <= physical_stock
 *   - convertible_qty <= covered_from_po
 *   - convertible_qty <= remaining (required - installed)
 *   - after.reserved_from_stock >= 0
 *   - after.covered_from_po >= 0
 *   - after.reserved_from_stock + after.covered_from_po <= required_total
 */
function computeConversion(c, part, qtyReceived) {
  const physicalStock = part?.physical_stock ?? 0;
  const coveredPO = c.covered_from_po ?? 0;
  const reservedStock = c.reserved_from_stock ?? 0;
  const requiredTotal = c.required_total ?? 0;
  const qtyInstalled = c.qty_installed ?? 0;
  const remaining = Math.max(0, requiredTotal - qtyInstalled);
  const received = qtyReceived ?? 0;

  const beforeState = resolveLifecycleState(c);
  const mkBefore = () => ({
    covered_from_po: coveredPO,
    reserved_from_stock: reservedStock,
    lifecycle_state: beforeState,
  });

  // Invariant: zero conversion when received_qty = 0
  if (received <= 0) {
    return { will_apply: false, skip_reason: 'ZERO_RECEIVED_QTY', convertible_qty: 0, before: mkBefore(), after: null };
  }
  if (physicalStock <= 0) {
    return { will_apply: false, skip_reason: 'NO_PHYSICAL_STOCK', convertible_qty: 0, before: mkBefore(), after: null };
  }
  if (remaining <= 0) {
    return { will_apply: false, skip_reason: 'FULLY_INSTALLED', convertible_qty: 0, before: mkBefore(), after: null };
  }
  if (coveredPO <= 0) {
    return { will_apply: false, skip_reason: 'NO_PO_COVERAGE', convertible_qty: 0, before: mkBefore(), after: null };
  }

  // Conversion capped at minimum of all bounds
  const convertibleQty = Math.min(coveredPO, physicalStock, remaining, received);
  if (convertibleQty <= 0) {
    return { will_apply: false, skip_reason: 'NO_CONVERTIBLE_QTY', convertible_qty: 0, before: mkBefore(), after: null };
  }

  const afterCoveredPO = coveredPO - convertibleQty;
  const afterReservedStock = reservedStock + convertibleQty;

  // Post-conversion invariant checks
  if (afterReservedStock < 0) {
    return { will_apply: false, skip_reason: 'WOULD_UNDERFLOW_RESERVED', convertible_qty: 0, before: mkBefore(), after: null };
  }
  if (afterCoveredPO < 0) {
    return { will_apply: false, skip_reason: 'WOULD_UNDERFLOW_PO', convertible_qty: 0, before: mkBefore(), after: null };
  }
  if ((afterReservedStock + afterCoveredPO) > requiredTotal) {
    return { will_apply: false, skip_reason: 'WOULD_EXCEED_REQUIRED', convertible_qty: 0, before: mkBefore(), after: null };
  }

  const projectedState = resolveLifecycleState({
    ...c,
    covered_from_po: afterCoveredPO,
    reserved_from_stock: afterReservedStock,
  });

  return {
    will_apply: true,
    skip_reason: null,
    convertible_qty: convertibleQty,
    before: mkBefore(),
    after: {
      covered_from_po: afterCoveredPO,
      reserved_from_stock: afterReservedStock,
      projected_lifecycle_state: projectedState,
    },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { dry_run = true, project_id, commitment_ids } = body;

    // ═══════════════════════════════════════════════════════════
    // CONSISTENT DATA SNAPSHOT — all reads in single execution
    // ═══════════════════════════════════════════════════════════

    // Fetch commitments
    let commitments;
    if (commitment_ids?.length > 0) {
      commitments = await base44.asServiceRole.entities.PartCommitment.filter({
        id: { $in: commitment_ids }
      });
    } else if (project_id) {
      commitments = await base44.asServiceRole.entities.PartCommitment.filter({ project_id });
    } else {
      commitments = await base44.asServiceRole.entities.PartCommitment.filter({});
    }

    // Skip terminal states
    const active = commitments.filter(c => {
      const s = (c.commitment_status || '').toLowerCase();
      return s !== 'cancelled' && s !== 'closed';
    });

    // Candidates: covered_from_po > 0
    const candidates = active.filter(c => (c.covered_from_po ?? 0) > 0);

    // Fetch parts
    const partIds = [...new Set(candidates.map(c => c.part_id).filter(Boolean))];
    let allParts = [];
    if (partIds.length > 0) {
      for (let i = 0; i < partIds.length; i += 200) {
        const chunk = partIds.slice(i, i + 200);
        const items = await base44.asServiceRole.entities.Part.filter({ id: { $in: chunk } });
        allParts.push(...items);
      }
    }
    const partsMap = new Map(allParts.map(p => [p.id, p]));

    // Fetch projects
    const projIds = [...new Set(candidates.map(c => c.project_id).filter(Boolean))];
    let allProjects = [];
    if (projIds.length > 0) {
      for (let i = 0; i < projIds.length; i += 100) {
        const chunk = projIds.slice(i, i + 100);
        const items = await base44.asServiceRole.entities.Project.filter({ id: { $in: chunk } });
        allProjects.push(...items);
      }
    }
    const projectsMap = new Map(allProjects.map(p => [p.id, p]));

    // Fetch PO line items for received_qty
    const allLineItemIds = [];
    const commitmentLineMap = new Map();
    for (const c of candidates) {
      if (c.order_line_item_ids?.length > 0) {
        for (const lid of c.order_line_item_ids) {
          allLineItemIds.push(lid);
          commitmentLineMap.set(lid, c.id);
        }
      }
    }

    let allLineItems = [];
    if (allLineItemIds.length > 0) {
      for (let i = 0; i < allLineItemIds.length; i += 200) {
        const chunk = allLineItemIds.slice(i, i + 200);
        const items = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({
          id: { $in: chunk }
        });
        allLineItems.push(...items);
      }
    }

    const receivedMap = new Map();
    for (const line of allLineItems) {
      const cid = commitmentLineMap.get(line.id) || line.commitment_id;
      if (!cid) continue;
      receivedMap.set(cid, (receivedMap.get(cid) || 0) + (line.qty_received || 0));
    }

    // ═══════════════════════════════════════════════════════════
    // PROCESS — identical logic for dry_run and apply
    // ═══════════════════════════════════════════════════════════

    const conversions = [];
    const skipped = [];
    const errors = [];
    const auditEntries = [];
    const timestamp = new Date().toISOString();

    for (const c of candidates) {
      const part = partsMap.get(c.part_id);
      const project = projectsMap.get(c.project_id);
      const qtyReceived = receivedMap.get(c.id) || 0;
      const result = computeConversion(c, part, qtyReceived);

      const row = {
        commitment_id: c.id,
        project_id: c.project_id,
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown',
        project_name: project?.name || 'Unknown',
        convertible_qty: result.convertible_qty,
        before: result.before,
        after: result.after,
        skip_reason: result.skip_reason,
        will_apply: result.will_apply,
      };

      if (!result.will_apply) {
        skipped.push(row);
        auditEntries.push({
          commitment_id: c.id,
          project_id: c.project_id,
          part_id: c.part_id,
          part_name: part?.part_name || 'Unknown',
          actor: user.email,
          timestamp,
          reason: 'legacy_receive_backfill',
          action: 'skipped',
          skip_reason: result.skip_reason,
          convertible_qty: 0,
          before_covered_from_po: result.before.covered_from_po,
          before_reserved_from_stock: result.before.reserved_from_stock,
          before_lifecycle_state: result.before.lifecycle_state,
          after_lifecycle_state: null,
        });
        continue;
      }

      if (!dry_run) {
        try {
          await base44.asServiceRole.entities.PartCommitment.update(c.id, {
            covered_from_po: result.after.covered_from_po,
            reserved_from_stock: result.after.reserved_from_stock,
            last_recomputed_at: timestamp,
          });

          row.applied = true;

          auditEntries.push({
            commitment_id: c.id,
            project_id: c.project_id,
            part_id: c.part_id,
            part_name: part?.part_name || 'Unknown',
            actor: user.email,
            timestamp,
            reason: 'legacy_receive_backfill',
            action: 'applied',
            convertible_qty: result.convertible_qty,
            before_covered_from_po: result.before.covered_from_po,
            after_covered_from_po: result.after.covered_from_po,
            before_reserved_from_stock: result.before.reserved_from_stock,
            after_reserved_from_stock: result.after.reserved_from_stock,
            before_lifecycle_state: result.before.lifecycle_state,
            after_lifecycle_state: result.after.projected_lifecycle_state,
            skip_reason: null,
          });

          try {
            await base44.asServiceRole.entities.CommitmentAuditLog.create({
              commitment_id: c.id,
              action_type: 'status_change',
              previous_values: {
                covered_from_po: result.before.covered_from_po,
                reserved_from_stock: result.before.reserved_from_stock,
              },
              new_values: {
                covered_from_po: result.after.covered_from_po,
                reserved_from_stock: result.after.reserved_from_stock,
              },
              trigger_source: 'migration',
              triggered_by: 'backfillLegacyReceiving',
              actor_email: user.email,
              timestamp,
              notes: `Backfill: converted ${result.convertible_qty} from PO coverage → stock reservation. ${result.before.lifecycle_state} → ${result.after.projected_lifecycle_state}`,
            });
          } catch (_) { /* audit log failure is non-fatal */ }
        } catch (err) {
          row.applied = false;
          row.error = err.message;
          errors.push({ commitment_id: c.id, part_name: part?.part_name || 'Unknown', error: err.message });

          auditEntries.push({
            commitment_id: c.id,
            project_id: c.project_id,
            part_id: c.part_id,
            part_name: part?.part_name || 'Unknown',
            actor: user.email,
            timestamp,
            reason: 'legacy_receive_backfill',
            action: 'error',
            convertible_qty: result.convertible_qty,
            before_covered_from_po: result.before.covered_from_po,
            before_reserved_from_stock: result.before.reserved_from_stock,
            before_lifecycle_state: result.before.lifecycle_state,
            after_lifecycle_state: null,
            skip_reason: null,
            error: err.message,
          });
        }
      }

      conversions.push(row);
    }

    const applied = dry_run ? 0 : conversions.filter(c => c.applied).length;

    return Response.json({
      success: true,
      dry_run,
      timestamp,
      summary: {
        candidates: candidates.length,
        planned: conversions.length,
        applied,
        skipped: skipped.length,
        errors: errors.length,
      },
      conversions,
      skipped,
      errors,
      audit: auditEntries,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});