import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * backfillLegacyReceiving — Converts PO coverage to stock reservations
 * 
 * For commitments where physical stock exists but allocation is via
 * covered_from_po instead of reserved_from_stock, this function
 * transfers the coverage to match the current receiving model.
 * 
 * Supports dry_run for preview with projected lifecycle states.
 * Supports commitment_ids filter for targeted execution.
 */

// Mirrors resolveCommitmentStateLocal exactly
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { dry_run = true, project_id, commitment_ids } = body;

    // Fetch commitments
    const filter = project_id ? { project_id } : {};
    let commitments = await base44.asServiceRole.entities.PartCommitment.filter(filter);

    // Filter by commitment_ids if provided
    if (commitment_ids?.length > 0) {
      const idSet = new Set(commitment_ids);
      commitments = commitments.filter(c => idSet.has(c.id));
    }

    // Skip terminal states
    const active = commitments.filter(c => {
      const s = (c.commitment_status || '').toLowerCase();
      return s !== 'cancelled' && s !== 'closed';
    });

    // Candidates: covered_from_po > 0 AND reserved_from_stock === 0
    const candidates = active.filter(c =>
      (c.covered_from_po ?? 0) > 0 && (c.reserved_from_stock ?? 0) === 0
    );

    // Fetch parts for physical_stock check
    const partIds = [...new Set(candidates.map(c => c.part_id).filter(Boolean))];
    const parts = await Promise.all(
      partIds.map(id => base44.asServiceRole.entities.Part.get(id).catch(() => null))
    );
    const partsMap = new Map();
    for (const p of parts) {
      if (p) partsMap.set(p.id, p);
    }

    const conversions = [];
    const skipped = [];
    const errors = [];

    for (const c of candidates) {
      const part = partsMap.get(c.part_id);
      const physicalStock = part?.physical_stock ?? 0;
      const coveredPO = c.covered_from_po ?? 0;
      const reservedStock = c.reserved_from_stock ?? 0;
      const requiredTotal = c.required_total ?? 0;
      const qtyInstalled = c.qty_installed ?? 0;
      const remaining = requiredTotal - qtyInstalled;

      if (physicalStock <= 0) {
        skipped.push({ id: c.id, part_name: part?.part_name || 'Unknown', reason: 'NO_PHYSICAL_STOCK' });
        continue;
      }
      if (remaining <= 0) {
        skipped.push({ id: c.id, part_name: part?.part_name || 'Unknown', reason: 'FULLY_INSTALLED' });
        continue;
      }

      const convertibleQty = Math.min(coveredPO, physicalStock, Math.max(0, remaining));
      if (convertibleQty <= 0) {
        skipped.push({ id: c.id, part_name: part?.part_name || 'Unknown', reason: 'NO_CONVERTIBLE_QTY' });
        continue;
      }

      const beforeState = resolveLifecycleState(c);
      const afterValues = {
        covered_from_po: coveredPO - convertibleQty,
        reserved_from_stock: reservedStock + convertibleQty,
      };
      const projectedState = resolveLifecycleState({
        ...c,
        ...afterValues,
      });

      const conversion = {
        commitment_id: c.id,
        part_name: part?.part_name || 'Unknown',
        convertible_qty: convertibleQty,
        before: {
          covered_from_po: coveredPO,
          reserved_from_stock: reservedStock,
          lifecycle_state: beforeState,
        },
        after: {
          covered_from_po: afterValues.covered_from_po,
          reserved_from_stock: afterValues.reserved_from_stock,
          projected_lifecycle_state: projectedState,
        },
      };

      if (!dry_run) {
        // Execute the conversion
        try {
          await base44.asServiceRole.entities.PartCommitment.update(c.id, {
            covered_from_po: afterValues.covered_from_po,
            reserved_from_stock: afterValues.reserved_from_stock,
            last_recomputed_at: new Date().toISOString(),
          });

          // Audit log
          try {
            await base44.asServiceRole.entities.CommitmentAuditLog.create({
              commitment_id: c.id,
              action_type: 'status_change',
              previous_values: { covered_from_po: coveredPO, reserved_from_stock: reservedStock },
              new_values: afterValues,
              trigger_source: 'migration',
              triggered_by: 'backfillLegacyReceiving',
              actor_email: user.email,
              timestamp: new Date().toISOString(),
              notes: `Backfill: converted ${convertibleQty} from PO coverage to stock reservation. ${beforeState} → ${projectedState}`,
            });
          } catch (_) { /* audit log failure is non-fatal */ }

          conversion.applied = true;
        } catch (err) {
          errors.push({ id: c.id, part_name: part?.part_name || 'Unknown', error: err.message });
          conversion.applied = false;
          conversion.error = err.message;
        }
      }

      conversions.push(conversion);
    }

    return Response.json({
      success: true,
      dry_run,
      timestamp: new Date().toISOString(),
      summary: {
        candidates: candidates.length,
        planned: conversions.length,
        applied: dry_run ? 0 : conversions.filter(c => c.applied).length,
        skipped: skipped.length,
        errors: errors.length,
      },
      conversions,
      skipped,
      errors,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});