import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * syncStockReplenishment — CANONICAL STOCK REPLENISHMENT ENGINE
 * 
 * The ONLY system responsible for automatic stock replenishment commitments.
 * Uses deterministic UPSERT: one replenishment commitment per part.
 * 
 * UNIQUE KEY: (part_id + demand_source=STOCK_REPLENISHMENT) on AK_STOCK project
 * 
 * Effective gap logic:
 *   effective_available = physical_stock + covered_from_po (incoming) - reserved_from_stock (allocated)
 *   effective_gap = reorder_point - effective_available
 *   if gap <= 0: close/remove replenishment commitment
 *   if gap > 0: upsert replenishment commitment
 * 
 * NEVER touches STOCK_MANUAL commitments (human-owned).
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const { part_ids, dry_run = false } = await req.json();

    // 1. Get or create AK_STOCK project
    let akStockProjects = await base44.asServiceRole.entities.Project.filter({
      is_system_project: true,
      system_project_type: 'AK_STOCK',
    });
    let akStockProject = akStockProjects[0];
    if (!akStockProject) {
      akStockProject = await base44.asServiceRole.entities.Project.create({
        name: 'AK STOCK',
        is_system_project: true,
        system_project_type: 'AK_STOCK',
        financial_model_version: 'forward',
      });
    }
    const stockProjectId = akStockProject.id;

    // 2. Fetch all parts with reorder_point > 0
    const allParts = await base44.asServiceRole.entities.Part.list('-updated_date', 500);
    let reorderParts = allParts.filter(p => !p.is_archived && p.reorder_point > 0);

    // Optionally scope to specific part_ids
    if (part_ids?.length > 0) {
      const idSet = new Set(part_ids);
      reorderParts = reorderParts.filter(p => idSet.has(p.id));
    }

    if (reorderParts.length === 0) {
      return Response.json({ success: true, message: 'No parts with reorder points', upserted: 0, closed: 0 });
    }

    const partIds = reorderParts.map(p => p.id);

    // 3. Fetch ALL open commitments for these parts (to compute coverage)
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.filter({
      part_id: { $in: partIds },
      commitment_status: { $ne: 'cancelled' },
    });

    // 4. Fetch open PO lines for coverage calculation
    const commitmentIds = allCommitments.map(c => c.id);
    const poLines = commitmentIds.length > 0
      ? await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ commitment_id: { $in: commitmentIds } })
      : [];
    
    // Build PO coverage by part (unreceived qty on active POs)
    const incomingByPart = new Map();
    for (const li of poLines) {
      const remaining = Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0));
      if (remaining > 0 && li.status !== 'Cancelled') {
        // Find which part this line belongs to
        const commitment = allCommitments.find(c => c.id === li.commitment_id);
        if (commitment) {
          incomingByPart.set(commitment.part_id, (incomingByPart.get(commitment.part_id) || 0) + remaining);
        }
      }
    }

    // 5. Build per-part reservation totals (excluding AK_STOCK replenishment commitments)
    const reservedByPart = new Map();
    for (const c of allCommitments) {
      // Skip AK_STOCK replenishment commitments — they don't consume from stock availability
      if (c.project_id === stockProjectId && c.demand_source === 'STOCK_REPLENISHMENT') continue;
      reservedByPart.set(c.part_id, (reservedByPart.get(c.part_id) || 0) + (c.reserved_from_stock || 0));
    }

    // 6. Find existing replenishment commitments (STOCK_REPLENISHMENT on AK_STOCK)
    const existingReplenishments = allCommitments.filter(
      c => c.project_id === stockProjectId && c.demand_source === 'STOCK_REPLENISHMENT'
    );
    const replenishmentByPart = new Map();
    for (const c of existingReplenishments) {
      replenishmentByPart.set(c.part_id, c);
    }

    // 7. Compute gaps and upsert/close
    const results = { upserted: 0, closed: 0, unchanged: 0, details: [] };
    const timestamp = new Date().toISOString();

    for (const part of reorderParts) {
      const physical = part.physical_stock || 0;
      const incoming = incomingByPart.get(part.id) || 0;
      const reserved = reservedByPart.get(part.id) || 0;

      // Effective available = what we actually have + what's coming - what's allocated
      const effectiveAvailable = physical + incoming - reserved;
      const effectiveGap = Math.max(0, part.reorder_point - effectiveAvailable);

      // Use reorder_quantity as minimum order if gap exists
      const orderQty = effectiveGap > 0
        ? Math.max(effectiveGap, part.reorder_quantity || 1)
        : 0;

      const existing = replenishmentByPart.get(part.id);

      if (orderQty <= 0) {
        // No gap — close existing replenishment if present
        if (existing && existing.commitment_status !== 'closed' && existing.commitment_status !== 'cancelled') {
          if (!dry_run) {
            // Only close if no PO coverage (don't close ordered commitments)
            if ((existing.covered_from_po || 0) <= 0) {
              await base44.asServiceRole.entities.PartCommitment.update(existing.id, {
                commitment_status: 'closed',
                required_total: 0,
                qty_committed: 0,
                qty_to_order: 0,
                last_recomputed_at: timestamp,
              });
            }
          }
          results.closed++;
          results.details.push({ part_id: part.id, part_name: part.part_name, action: 'CLOSE', effective_gap: 0, effective_available: effectiveAvailable });
        } else {
          results.unchanged++;
        }
        continue;
      }

      // Gap exists — upsert
      if (existing) {
        // Update existing if qty changed and it's still in planned state
        const currentReq = existing.required_total || 0;
        if (Math.abs(currentReq - orderQty) > 0.5 && existing.commitment_status === 'planned') {
          if (!dry_run) {
            const uc = part.cost || 0;
            await base44.asServiceRole.entities.PartCommitment.update(existing.id, {
              required_total: orderQty,
              qty_committed: orderQty,
              qty_to_order: Math.max(0, orderQty - (existing.reserved_from_stock || 0) - (existing.covered_from_po || 0)),
              unit_cost_snapshot: uc,
              planned_cost_total: uc * orderQty,
              last_recomputed_at: timestamp,
              commitment_version: (existing.commitment_version || 0) + 1,
            });
          }
          results.upserted++;
          results.details.push({ part_id: part.id, part_name: part.part_name, action: 'UPDATE', old_qty: currentReq, new_qty: orderQty, effective_gap: effectiveGap });
        } else {
          results.unchanged++;
        }
      } else {
        // Create new replenishment commitment
        if (!dry_run) {
          const uc = part.cost || 0;
          await base44.asServiceRole.entities.PartCommitment.create({
            project_id: stockProjectId,
            part_id: part.id,
            required_total: orderQty,
            reserved_from_stock: 0,
            covered_from_po: 0,
            qty_installed: 0,
            demand_source: 'STOCK_REPLENISHMENT',
            stock_reason: 'reorder_gap',
            supply_source_type: 'VENDOR',
            billing_status: 'not_billable',
            requires_prepay: false,
            commitment_status: 'planned',
            coverage_status: 'NOT_COVERED',
            source_type: 'manual_attachment',
            unit_cost_snapshot: uc,
            unit_retail_snapshot: 0,
            planned_cost_total: uc * orderQty,
            planned_retail_total: 0,
            qty_committed: orderQty,
            qty_to_order: orderQty,
            qty_ordered: 0,
            qty_received: 0,
            qty_reserved: 0,
            commitment_version: 1,
            state_version: 1,
            last_recomputed_at: timestamp,
            notes: `Auto-replenishment: reorder_point=${part.reorder_point}, physical=${physical}, incoming=${incoming}, reserved=${reserved}`,
          });
        }
        results.upserted++;
        results.details.push({ part_id: part.id, part_name: part.part_name, action: 'CREATE', qty: orderQty, effective_gap: effectiveGap });
      }
    }

    console.log(`[syncStockReplenishment] dry_run=${dry_run} parts_checked=${reorderParts.length} upserted=${results.upserted} closed=${results.closed} unchanged=${results.unchanged}`);

    return Response.json({
      success: true,
      dry_run,
      ak_stock_project_id: stockProjectId,
      parts_checked: reorderParts.length,
      ...results,
    });

  } catch (error) {
    console.error('syncStockReplenishment error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});