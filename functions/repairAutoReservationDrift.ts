import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * repairAutoReservationDrift - One-time migration to fix auto-reservation drift
 * 
 * Phase 9F: Scans all commitments and ensures stock is properly auto-reserved.
 * 
 * For each commitment where:
 *   - physical_stock > 0
 *   - reserved_from_stock == 0 (or < what's available)
 *   - to_order > 0
 * 
 * Recomputes reservation to: min(available, required_total - covered_from_po)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const dryRun = body.dry_run !== false;
    const targetProjectId = body.project_id || null;

    // Fetch all commitments and parts
    const [allCommitments, allParts] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.Part.list(),
    ]);

    // Build part lookup
    const partMap = new Map(allParts.map(p => [p.id, p]));

    // Filter to active commitments
    const activeCommitments = allCommitments.filter(c => 
      c.commitment_status !== 'cancelled' && 
      c.commitment_status !== 'closed' &&
      (!targetProjectId || c.project_id === targetProjectId)
    );

    // Group commitments by part for allocation calculation
    const commitmentsByPart = {};
    activeCommitments.forEach(c => {
      if (!commitmentsByPart[c.part_id]) {
        commitmentsByPart[c.part_id] = [];
      }
      commitmentsByPart[c.part_id].push(c);
    });

    const scanned = [];
    const repaired = [];
    const skipped = [];
    const errors = [];

    // Process each part's commitments
    for (const [partId, commitments] of Object.entries(commitmentsByPart)) {
      const part = partMap.get(partId);
      if (!part) {
        errors.push({ part_id: partId, error: 'Part not found' });
        continue;
      }

      const physical_stock = part.physical_stock ?? 0;
      if (physical_stock === 0) {
        // No stock to reserve, skip all commitments for this part
        commitments.forEach(c => {
          scanned.push({
            commitment_id: c.id,
            part_id: partId,
            part_name: part.part_name,
            status: 'SKIPPED_NO_STOCK',
            physical_stock: 0
          });
        });
        continue;
      }

      // Sort commitments by created_date to allocate stock fairly (FIFO)
      commitments.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

      let remaining_stock = physical_stock;

      for (const c of commitments) {
        const required_total = c.required_total ?? c.qty_committed ?? 0;
        const current_reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
        const covered_from_po = c.covered_from_po ?? 0;
        const need_from_stock = Math.max(0, required_total - covered_from_po);

        // How much should be reserved for this commitment?
        const ideal_reserved = Math.min(remaining_stock, need_from_stock);
        
        scanned.push({
          commitment_id: c.id,
          part_id: partId,
          part_name: part.part_name,
          required_total,
          current_reserved,
          covered_from_po,
          need_from_stock,
          ideal_reserved,
          remaining_stock_before: remaining_stock
        });

        // Check if repair needed
        if (current_reserved < ideal_reserved) {
          const delta = ideal_reserved - current_reserved;
          
          if (dryRun) {
            repaired.push({
              commitment_id: c.id,
              part_id: partId,
              part_name: part.part_name,
              old_reserved: current_reserved,
              new_reserved: ideal_reserved,
              delta,
              action: 'DRY_RUN'
            });
          } else {
            try {
              const to_order = Math.max(0, required_total - ideal_reserved - covered_from_po);
              
              await base44.asServiceRole.entities.PartCommitment.update(c.id, {
                reserved_from_stock: ideal_reserved,
                qty_reserved: ideal_reserved,
                qty_to_order: to_order,
                commitment_version: (c.commitment_version ?? 0) + 1,
                last_recomputed_at: new Date().toISOString()
              });

              repaired.push({
                commitment_id: c.id,
                part_id: partId,
                part_name: part.part_name,
                old_reserved: current_reserved,
                new_reserved: ideal_reserved,
                new_to_order: to_order,
                delta,
                action: 'REPAIRED'
              });
            } catch (err) {
              errors.push({
                commitment_id: c.id,
                part_id: partId,
                error: err.message
              });
            }
          }

          // Deduct what we reserved (whether dry run or not)
          remaining_stock -= ideal_reserved;
        } else {
          // Already properly reserved
          skipped.push({
            commitment_id: c.id,
            part_id: partId,
            part_name: part.part_name,
            current_reserved,
            reason: 'ALREADY_OPTIMAL'
          });
          // Deduct current reservation from remaining
          remaining_stock -= current_reserved;
        }

        // Clamp remaining_stock to 0
        remaining_stock = Math.max(0, remaining_stock);
      }
    }

    return Response.json({
      success: errors.length === 0,
      mode: dryRun ? 'DRY_RUN' : 'EXECUTED',
      timestamp: new Date().toISOString(),
      repaired_by: dryRun ? null : user.email,
      target_project_id: targetProjectId,
      summary: {
        commitments_scanned: scanned.length,
        commitments_repaired: repaired.length,
        commitments_skipped: skipped.length,
        error_count: errors.length
      },
      repaired,
      skipped,
      errors,
      message: dryRun 
        ? `Would repair ${repaired.length} commitments. Run with dry_run: false to execute.`
        : `Repaired ${repaired.length} commitments`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});