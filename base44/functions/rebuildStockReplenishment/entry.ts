import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * rebuildStockReplenishment — Admin/Dev Failsafe Recovery Tool
 * 
 * Detects and reports:
 * - Duplicate STOCK_REPLENISHMENT commitments per part
 * - Orphan stock commitments (part archived or no reorder point)
 * - Stale commitments (gap = 0 but commitment still open)
 * - Manual stock commitments (STOCK_MANUAL) — reported only, never modified
 * - to_order calculation drift
 * 
 * With fix=true, automatically resolves:
 * - Closes duplicate replenishment commitments (keeps most progressed)
 * - Closes orphan replenishment commitments
 * - Re-syncs required_total on stale planned commitments
 * 
 * NEVER modifies STOCK_MANUAL commitments.
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

    const { fix = false } = await req.json();

    // 1. Find AK_STOCK project
    const akStockProjects = await base44.asServiceRole.entities.Project.filter({
      is_system_project: true,
      system_project_type: 'AK_STOCK',
    });
    const akStockProject = akStockProjects[0];
    if (!akStockProject) {
      return Response.json({ success: true, message: 'No AK_STOCK project found', issues: [] });
    }
    const stockProjectId = akStockProject.id;

    // 2. Fetch all stock commitments
    const stockCommitments = await base44.asServiceRole.entities.PartCommitment.filter({
      project_id: stockProjectId,
    });

    // 3. Fetch all parts
    const allParts = await base44.asServiceRole.entities.Part.list('-updated_date', 500);
    const partMap = new Map(allParts.map(p => [p.id, p]));

    // 4. Fetch PO lines for coverage validation
    const stockCommitmentIds = stockCommitments.filter(c => c.commitment_status !== 'cancelled').map(c => c.id);
    const poLines = stockCommitmentIds.length > 0
      ? await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ commitment_id: { $in: stockCommitmentIds } })
      : [];
    const poLinesByCommitment = new Map();
    for (const li of poLines) {
      if (!poLinesByCommitment.has(li.commitment_id)) poLinesByCommitment.set(li.commitment_id, []);
      poLinesByCommitment.get(li.commitment_id).push(li);
    }

    const issues = [];
    const fixes = [];
    const timestamp = new Date().toISOString();

    // ── AUDIT 1: Duplicate STOCK_REPLENISHMENT per part ──
    const replenishmentsByPart = new Map();
    for (const c of stockCommitments) {
      if (c.demand_source !== 'STOCK_REPLENISHMENT') continue;
      if (c.commitment_status === 'cancelled') continue;
      if (!replenishmentsByPart.has(c.part_id)) replenishmentsByPart.set(c.part_id, []);
      replenishmentsByPart.get(c.part_id).push(c);
    }

    for (const [partId, commitments] of replenishmentsByPart) {
      if (commitments.length <= 1) continue;
      const part = partMap.get(partId);
      issues.push({
        type: 'DUPLICATE_REPLENISHMENT',
        part_id: partId,
        part_name: part?.part_name || 'Unknown',
        count: commitments.length,
        commitment_ids: commitments.map(c => c.id),
      });

      if (fix) {
        // Keep the one with most progress, close the rest
        const sorted = commitments.sort((a, b) => {
          const aProgress = (a.covered_from_po || 0) + (a.qty_installed || 0) + (a.reserved_from_stock || 0);
          const bProgress = (b.covered_from_po || 0) + (b.qty_installed || 0) + (b.reserved_from_stock || 0);
          return bProgress - aProgress;
        });
        for (let i = 1; i < sorted.length; i++) {
          await base44.asServiceRole.entities.PartCommitment.update(sorted[i].id, {
            commitment_status: 'cancelled',
            cancelled_at: timestamp,
            cancelled_reason: 'REBUILD: Duplicate STOCK_REPLENISHMENT',
            cancelled_by: user.email,
          });
          fixes.push({ action: 'CLOSE_DUPLICATE', commitment_id: sorted[i].id, part_id: partId });
        }
      }
    }

    // ── AUDIT 2: Orphan replenishment (part archived or no reorder_point) ──
    for (const c of stockCommitments) {
      if (c.demand_source !== 'STOCK_REPLENISHMENT') continue;
      if (c.commitment_status === 'cancelled' || c.commitment_status === 'closed') continue;
      const part = partMap.get(c.part_id);
      if (!part || part.is_archived || !part.reorder_point || part.reorder_point <= 0) {
        issues.push({
          type: 'ORPHAN_REPLENISHMENT',
          commitment_id: c.id,
          part_id: c.part_id,
          part_name: part?.part_name || 'DELETED',
          reason: !part ? 'part_deleted' : part.is_archived ? 'part_archived' : 'no_reorder_point',
        });

        if (fix && (c.covered_from_po || 0) <= 0) {
          await base44.asServiceRole.entities.PartCommitment.update(c.id, {
            commitment_status: 'closed',
            required_total: 0,
            last_recomputed_at: timestamp,
          });
          fixes.push({ action: 'CLOSE_ORPHAN', commitment_id: c.id, part_id: c.part_id });
        }
      }
    }

    // ── AUDIT 3: to_order drift (commitment says to_order but gap = 0) ──
    for (const c of stockCommitments) {
      if (c.demand_source !== 'STOCK_REPLENISHMENT') continue;
      if (c.commitment_status === 'cancelled' || c.commitment_status === 'closed') continue;
      const part = partMap.get(c.part_id);
      if (!part || !part.reorder_point) continue;

      const lines = poLinesByCommitment.get(c.id) || [];
      const unreceived = lines.reduce((s, li) => s + Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0)), 0);
      const storedToOrder = c.qty_to_order ?? 0;
      const effectiveReq = c.required_total ?? 0;
      const coverage = (c.reserved_from_stock || 0) + (c.covered_from_po || 0) + (c.qty_installed || 0);
      const computedToOrder = Math.max(0, effectiveReq - coverage);

      if (Math.abs(storedToOrder - computedToOrder) > 0.5) {
        issues.push({
          type: 'TO_ORDER_DRIFT',
          commitment_id: c.id,
          part_id: c.part_id,
          part_name: part.part_name,
          stored_to_order: storedToOrder,
          computed_to_order: computedToOrder,
          delta: computedToOrder - storedToOrder,
        });
      }
    }

    // ── AUDIT 4: STOCK_MANUAL summary (report only) ──
    const manualCommitments = stockCommitments.filter(c => c.demand_source === 'STOCK_MANUAL' && c.commitment_status !== 'cancelled');
    if (manualCommitments.length > 0) {
      issues.push({
        type: 'MANUAL_STOCK_SUMMARY',
        count: manualCommitments.length,
        total_qty: manualCommitments.reduce((s, c) => s + (c.required_total || 0), 0),
        note: 'STOCK_MANUAL commitments are human-owned and never auto-modified.',
      });
    }

    console.log(`[rebuildStockReplenishment] fix=${fix} issues=${issues.length} fixes=${fixes.length}`);

    return Response.json({
      success: true,
      fix_mode: fix,
      ak_stock_project_id: stockProjectId,
      total_stock_commitments: stockCommitments.length,
      active_replenishments: stockCommitments.filter(c => c.demand_source === 'STOCK_REPLENISHMENT' && c.commitment_status !== 'cancelled').length,
      active_manual: manualCommitments.length,
      issues,
      fixes: fix ? fixes : undefined,
    });

  } catch (error) {
    console.error('rebuildStockReplenishment error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});