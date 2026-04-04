import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * repairOrphanedReceivedPOLines
 * 
 * Finds commitments where a PO was RECEIVED but coverage was never created.
 * Detection: required_total > 0 AND covered_from_po === 0 AND reserved_from_stock === 0
 *            AND has at least one PO line with qty_received > 0
 * 
 * Repair: Sets reserved_from_stock = min(total_received, gap) where gap = required_total - qty_installed
 * 
 * DOES NOT create inventory or stock — only fixes coverage fields.
 * Skips commitments where qty_installed >= required_total (already satisfied).
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { dry_run = true, project_id = null, limit = 500 } = await req.json();

    // Step 1: Find candidate commitments — zero coverage, non-cancelled
    const filter = {
      required_total: { $gt: 0 },
      covered_from_po: { $in: [0, null] },
      reserved_from_stock: { $in: [0, null] },
      commitment_status: { $nin: ['cancelled'] },
    };
    if (project_id) filter.project_id = project_id;

    const candidates = await base44.asServiceRole.entities.PartCommitment.filter(filter, '-created_date', limit);
    console.log(`[REPAIR] Found ${candidates.length} candidate commitments with zero coverage`);

    if (candidates.length === 0) {
      return Response.json({ success: true, message: 'No orphaned commitments found', candidates: 0, repaired: 0, skipped: 0 });
    }

    // Step 2: For each candidate, check if there are received PO lines
    const repairs = [];
    const skipped = [];
    const already_satisfied = [];

    for (const c of candidates) {
      const required = c.required_total ?? 0;
      const installed = c.qty_installed ?? 0;
      const reserved = c.reserved_from_stock ?? 0;
      const covered = c.covered_from_po ?? 0;

      // Skip if already satisfied by installation
      if (installed >= required && required > 0) {
        already_satisfied.push({
          commitment_id: c.id,
          part_id: c.part_id,
          project_id: c.project_id,
          required_total: required,
          qty_installed: installed,
          reason: 'ALREADY_SATISFIED_BY_INSTALL',
        });
        continue;
      }

      // Find PO lines linked to this commitment
      const poLines = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({
        commitment_id: c.id,
      });

      if (poLines.length === 0) {
        // No PO lines at all — check if there's stock on the part
        const [part] = await base44.asServiceRole.entities.Part.filter({ id: c.part_id });
        const physStock = part?.physical_stock ?? 0;
        
        if (physStock > 0) {
          // Part has stock but commitment has no coverage — allocate from stock
          const gap = Math.max(0, required - installed - reserved - covered);
          const allocation = Math.min(physStock, gap);
          
          if (allocation > 0) {
            repairs.push({
              commitment_id: c.id,
              part_id: c.part_id,
              project_id: c.project_id,
              required_total: required,
              qty_installed: installed,
              current_reserved: reserved,
              current_covered: covered,
              physical_stock: physStock,
              total_received_from_po: 0,
              gap: gap,
              applied_allocation: allocation,
              new_reserved: reserved + allocation,
              new_to_order: Math.max(0, required - (reserved + allocation) - covered - installed),
              repair_source: 'STOCK_ALLOCATION',
              reason: 'Stock exists on part but commitment has no coverage',
            });
          } else {
            skipped.push({
              commitment_id: c.id,
              part_id: c.part_id,
              reason: 'NO_PO_LINES_NO_GAP',
              required_total: required,
              installed,
            });
          }
        } else {
          skipped.push({
            commitment_id: c.id,
            part_id: c.part_id,
            reason: 'NO_PO_LINES_NO_STOCK',
            required_total: required,
          });
        }
        continue;
      }

      // Calculate total received across all PO lines
      const totalReceived = poLines.reduce((sum, l) => sum + (l.qty_received ?? 0), 0);
      const totalOrdered = poLines.reduce((sum, l) => sum + (l.qty_ordered ?? 0), 0);
      const anyReceived = poLines.some(l => (l.qty_received ?? 0) > 0);
      const poStatuses = poLines.map(l => l.status);

      if (!anyReceived && totalReceived === 0) {
        // PO exists but nothing received yet — not an orphan, just pending
        skipped.push({
          commitment_id: c.id,
          part_id: c.part_id,
          reason: 'PO_NOT_YET_RECEIVED',
          po_line_count: poLines.length,
          total_ordered: totalOrdered,
          po_statuses: poStatuses,
        });
        continue;
      }

      // This is the orphan case: PO received but no coverage created
      const gap = Math.max(0, required - installed - reserved - covered);
      const allocation = Math.min(totalReceived, gap);

      if (allocation <= 0) {
        skipped.push({
          commitment_id: c.id,
          part_id: c.part_id,
          reason: 'NO_GAP_TO_FILL',
          required_total: required,
          installed,
          total_received: totalReceived,
        });
        continue;
      }

      repairs.push({
        commitment_id: c.id,
        part_id: c.part_id,
        project_id: c.project_id,
        required_total: required,
        qty_installed: installed,
        current_reserved: reserved,
        current_covered: covered,
        po_line_count: poLines.length,
        po_line_ids: poLines.map(l => l.id),
        total_ordered: totalOrdered,
        total_received: totalReceived,
        po_statuses: poStatuses,
        gap: gap,
        applied_allocation: allocation,
        new_reserved: reserved + allocation,
        new_to_order: Math.max(0, required - (reserved + allocation) - covered - installed),
        repair_source: 'RECEIVED_PO_CONVERT',
        reason: 'PO received but coverage never created (phantom_received)',
      });
    }

    console.log(`[REPAIR] Repairs: ${repairs.length}, Skipped: ${skipped.length}, Already satisfied: ${already_satisfied.length}`);

    // Step 3: Apply repairs (unless dry_run)
    if (!dry_run && repairs.length > 0) {
      const timestamp = new Date().toISOString();
      let applied = 0;
      const errors = [];

      for (const r of repairs) {
        try {
          // Update commitment with reconstructed coverage
          await base44.asServiceRole.entities.PartCommitment.update(r.commitment_id, {
            reserved_from_stock: r.new_reserved,
            qty_reserved: r.new_reserved,
            qty_to_order: r.new_to_order,
            commitment_status: r.new_reserved >= r.required_total ? 'allocated' : 'ordered',
            last_recomputed_at: timestamp,
            commitment_version: (r.commitment_version ?? 0) + 1,
          });

          // Audit log
          await base44.asServiceRole.entities.CommitmentAuditLog.create({
            commitment_id: r.commitment_id,
            action_type: 'update',
            trigger_source: 'migration',
            triggered_by: user.email,
            actor_email: user.email,
            notes: `RECEIVED_PO_REPAIR: ${r.repair_source}. Applied allocation=${r.applied_allocation} to reserved_from_stock. Reason: ${r.reason}`,
            previous_values: {
              reserved_from_stock: r.current_reserved ?? 0,
              covered_from_po: r.current_covered ?? 0,
            },
            new_values: {
              reserved_from_stock: r.new_reserved ?? 0,
              to_order: r.new_to_order ?? 0,
            },
            timestamp,
          });

          // Lifecycle event
          await base44.asServiceRole.entities.LifecycleEvent.create({
            commitment_id: r.commitment_id,
            event_type: 'RECEIVED_PO_REPAIR',
            trigger_source: 'migration',
            triggered_by: user.email,
            actor_email: user.email,
            old_values: { reserved_from_stock: r.current_reserved ?? 0 },
            new_values: { reserved_from_stock: r.new_reserved ?? 0, applied_allocation: r.applied_allocation ?? 0 },
            part_id: r.part_id,
            project_id: r.project_id,
            event_date: timestamp,
          });

          applied++;
          console.log(`[REPAIR_APPLIED] commitment=${r.commitment_id} allocation=${r.applied_allocation} source=${r.repair_source}`);
        } catch (err) {
          console.error(`[REPAIR_ERROR] commitment=${r.commitment_id}: ${err.message}`);
          errors.push({ commitment_id: r.commitment_id, error: err.message });
        }
      }

      return Response.json({
        success: true,
        dry_run: false,
        candidates: candidates.length,
        repairs_proposed: repairs.length,
        repairs_applied: applied,
        repair_errors: errors.length > 0 ? errors : undefined,
        skipped: skipped.length,
        already_satisfied: already_satisfied.length,
        repairs,
        skipped_details: skipped,
        already_satisfied_details: already_satisfied,
      });
    }

    // Dry run response
    return Response.json({
      success: true,
      dry_run: true,
      candidates: candidates.length,
      repairs_proposed: repairs.length,
      skipped: skipped.length,
      already_satisfied: already_satisfied.length,
      repairs,
      skipped_details: skipped,
      already_satisfied_details: already_satisfied,
      message: repairs.length > 0
        ? `Found ${repairs.length} commitments to repair. Run with dry_run=false to apply.`
        : 'No repairs needed — all commitments are either satisfied or have no received PO lines.',
    });

  } catch (error) {
    console.error('[REPAIR_FATAL]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});