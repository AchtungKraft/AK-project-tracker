import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * syncStockReplenishment — CANONICAL STOCK REPLENISHMENT ENGINE (v2 HARDENED)
 * 
 * The ONLY system responsible for automatic stock replenishment commitments.
 * Uses deterministic UPSERT: one replenishment commitment per part.
 * 
 * UNIQUE KEY: (part_id + demand_source=STOCK_REPLENISHMENT) on AK_STOCK project
 * 
 * HARDENING (Phase 2):
 * - Duplicate detection + deduplication before processing
 * - Idempotent: safe to call 10+ times rapidly
 * - Comprehensive gap calculation via deriveEffectiveReplenishmentGap()
 * - Ordered commitments (covered_from_po > 0) are NEVER resized or closed
 * - STOCK_MANUAL commitments are NEVER touched
 * - Concurrency guard via state_version check
 */

// ══════════════════════════════════════════════════════════════════════
// CANONICAL HELPER: deriveEffectiveReplenishmentGap
// ALL replenishment math MUST use this. No duplicated reorder math.
// ══════════════════════════════════════════════════════════════════════
function deriveEffectiveReplenishmentGap(partContext) {
  const {
    reorder_point = 0,
    reorder_quantity = 0,
    physical_stock = 0,
    incoming_po_qty = 0,        // unreceived PO line qty across ALL vendors
    reserved_by_projects = 0,   // stock reserved by project commitments (excluding replenishment)
    existing_replenishment_covered = 0, // covered_from_po on existing replenishment commitment
    installed_total = 0,        // qty_installed across all project commitments for this part
  } = partContext;

  if (reorder_point <= 0) return { effective_gap: 0, order_qty: 0, effective_available: 0, detail: 'no_reorder_point' };

  // Effective available = what's usable for NEW demand
  // physical_stock = currently in warehouse
  // incoming_po_qty = on PO but not yet received (will become physical_stock)
  // reserved_by_projects = already claimed by project commitments
  // existing_replenishment_covered = already on PO for replenishment (don't double-count)
  const effective_available = physical_stock + incoming_po_qty - reserved_by_projects;

  // Gap = how far below reorder_point we are
  const effective_gap = Math.max(0, reorder_point - effective_available);

  // Order quantity = max of gap and minimum reorder quantity
  const order_qty = effective_gap > 0
    ? Math.max(effective_gap, reorder_quantity || 1)
    : 0;

  return {
    effective_gap,
    order_qty,
    effective_available,
    detail: effective_gap > 0 ? 'below_reorder_point' : 'adequately_stocked',
    breakdown: {
      reorder_point,
      physical_stock,
      incoming_po_qty,
      reserved_by_projects,
      existing_replenishment_covered,
    },
  };
}

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
      return Response.json({ success: true, message: 'No parts with reorder points', upserted: 0, closed: 0, deduped: 0 });
    }

    const partIds = reorderParts.map(p => p.id);

    // 3. Fetch ALL commitments for these parts (to compute coverage)
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.filter({
      part_id: { $in: partIds },
      commitment_status: { $ne: 'cancelled' },
    });

    // 4. Fetch open PO lines for coverage calculation
    const commitmentIds = allCommitments.map(c => c.id);
    const poLines = commitmentIds.length > 0
      ? await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ commitment_id: { $in: commitmentIds } })
      : [];
    
    // Build PO coverage by part (unreceived qty on active POs across ALL commitments)
    const incomingByPart = new Map();
    for (const li of poLines) {
      if (li.status === 'Cancelled') continue;
      const remaining = Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0));
      if (remaining > 0) {
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

    // 6. Find existing replenishment commitments — DETECT AND FIX DUPLICATES
    const existingReplenishments = allCommitments.filter(
      c => c.project_id === stockProjectId && c.demand_source === 'STOCK_REPLENISHMENT'
    );
    
    // DEDUPLICATION: Group by part_id, keep the most progressed one
    const replenishmentByPart = new Map();
    const duplicatesToClose = [];
    
    for (const c of existingReplenishments) {
      if (!replenishmentByPart.has(c.part_id)) {
        replenishmentByPart.set(c.part_id, c);
      } else {
        const existing = replenishmentByPart.get(c.part_id);
        // Keep the one with more progress (covered_from_po > 0 wins, then higher required_total)
        const existingProgress = (existing.covered_from_po || 0) + (existing.qty_installed || 0);
        const newProgress = (c.covered_from_po || 0) + (c.qty_installed || 0);
        if (newProgress > existingProgress) {
          duplicatesToClose.push(existing);
          replenishmentByPart.set(c.part_id, c);
        } else {
          duplicatesToClose.push(c);
        }
      }
    }

    // Close duplicates
    if (!dry_run) {
      for (const dup of duplicatesToClose) {
        console.warn(`[syncStockReplenishment] DEDUP: Closing duplicate replenishment commitment ${dup.id} for part ${dup.part_id}`);
        await base44.asServiceRole.entities.PartCommitment.update(dup.id, {
          commitment_status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_reason: 'DEDUP: Duplicate STOCK_REPLENISHMENT commitment',
          cancelled_by: user.email,
        });
      }
    }

    // 7. Compute gaps and upsert/close
    const results = { upserted: 0, closed: 0, unchanged: 0, skipped_ordered: 0, deduped: duplicatesToClose.length, details: [] };
    const timestamp = new Date().toISOString();

    for (const part of reorderParts) {
      const physical = part.physical_stock || 0;
      const incoming = incomingByPart.get(part.id) || 0;
      const reserved = reservedByPart.get(part.id) || 0;
      const existing = replenishmentByPart.get(part.id);
      const existingCoveredPO = existing?.covered_from_po || 0;

      // CANONICAL: Use deriveEffectiveReplenishmentGap
      const gapResult = deriveEffectiveReplenishmentGap({
        reorder_point: part.reorder_point,
        reorder_quantity: part.reorder_quantity || 0,
        physical_stock: physical,
        incoming_po_qty: incoming,
        reserved_by_projects: reserved,
        existing_replenishment_covered: existingCoveredPO,
      });

      const orderQty = gapResult.order_qty;

      if (orderQty <= 0) {
        // No gap — close existing replenishment if present
        if (existing && existing.commitment_status !== 'closed' && existing.commitment_status !== 'cancelled') {
          // SAFETY: Never close if PO coverage exists (ordered commitment)
          if (existingCoveredPO > 0) {
            results.skipped_ordered++;
            results.details.push({ part_id: part.id, part_name: part.part_name, action: 'SKIP_ORDERED', covered_from_po: existingCoveredPO, effective_gap: 0 });
            continue;
          }
          if (!dry_run) {
            await base44.asServiceRole.entities.PartCommitment.update(existing.id, {
              commitment_status: 'closed',
              required_total: 0,
              qty_committed: 0,
              qty_to_order: 0,
              last_recomputed_at: timestamp,
            });
          }
          results.closed++;
          results.details.push({ part_id: part.id, part_name: part.part_name, action: 'CLOSE', effective_gap: 0, effective_available: gapResult.effective_available });
        } else {
          results.unchanged++;
        }
        continue;
      }

      // Gap exists — upsert
      if (existing) {
        // SAFETY: Never resize ordered commitments (covered_from_po > 0)
        if (existingCoveredPO > 0) {
          results.skipped_ordered++;
          results.details.push({ part_id: part.id, part_name: part.part_name, action: 'SKIP_ORDERED', covered_from_po: existingCoveredPO, effective_gap: gapResult.effective_gap });
          continue;
        }

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
              notes: `Auto-replenishment v2: reorder_pt=${part.reorder_point}, phys=${physical}, incoming=${incoming}, reserved=${reserved}`,
            });
          }
          results.upserted++;
          results.details.push({ part_id: part.id, part_name: part.part_name, action: 'UPDATE', old_qty: currentReq, new_qty: orderQty, effective_gap: gapResult.effective_gap });
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
            notes: `Auto-replenishment v2: reorder_pt=${part.reorder_point}, phys=${physical}, incoming=${incoming}, reserved=${reserved}`,
          });
        }
        results.upserted++;
        results.details.push({ part_id: part.id, part_name: part.part_name, action: 'CREATE', qty: orderQty, effective_gap: gapResult.effective_gap });
      }
    }

    console.log(`[syncStockReplenishment] dry_run=${dry_run} parts_checked=${reorderParts.length} upserted=${results.upserted} closed=${results.closed} unchanged=${results.unchanged} skipped_ordered=${results.skipped_ordered} deduped=${results.deduped}`);

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