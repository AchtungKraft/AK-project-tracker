import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * getReceivingGapDiagnostics — Canonical server-side read model
 * 
 * Returns fully-computed receiving gap rows with lifecycle states,
 * issue classifications, backfill eligibility, and projected states.
 * 
 * NO UI-side math allowed — this is the single source of truth.
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
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id } = body;

    // Fetch commitments — optionally scoped to project
    const filter = project_id ? { project_id } : {};
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter(filter);

    // Skip terminal states
    const active = commitments.filter(c => {
      const s = (c.commitment_status || '').toLowerCase();
      return s !== 'cancelled' && s !== 'closed';
    });

    if (active.length === 0) {
      return Response.json({
        rows: [],
        counts: { po_not_received: 0, received_no_stock: 0, stock_not_allocated: 0 },
        total: 0,
      });
    }

    // Collect unique part IDs and project IDs
    const partIds = [...new Set(active.map(c => c.part_id).filter(Boolean))];
    const projectIds = [...new Set(active.map(c => c.project_id).filter(Boolean))];

    // Fetch parts and projects in parallel
    const [allParts, allProjects] = await Promise.all([
      Promise.all(partIds.map(id =>
        base44.asServiceRole.entities.Part.get(id).catch(() => null)
      )),
      Promise.all(projectIds.map(id =>
        base44.asServiceRole.entities.Project.get(id).catch(() => null)
      )),
    ]);

    const partsMap = new Map();
    for (const p of allParts) {
      if (p) partsMap.set(p.id, p);
    }
    const projectsMap = new Map();
    for (const p of allProjects) {
      if (p) projectsMap.set(p.id, p);
    }

    // Fetch PO line items for qty_received computation
    const commitmentIds = active.map(c => c.id);
    let allLineItems = [];
    // Batch fetch — filter by commitment_id
    for (const c of active) {
      if (c.order_line_item_ids?.length > 0) {
        try {
          const lines = await Promise.all(
            c.order_line_item_ids.map(lid =>
              base44.asServiceRole.entities.PartPurchaseLineItem.get(lid).catch(() => null)
            )
          );
          allLineItems.push(...lines.filter(Boolean).map(l => ({ ...l, _commitment_id: c.id })));
        } catch (_) { /* skip */ }
      }
    }

    // Build qty_received map from PO lines
    const receivedMap = new Map();
    for (const line of allLineItems) {
      const cid = line._commitment_id || line.commitment_id;
      if (!cid) continue;
      receivedMap.set(cid, (receivedMap.get(cid) || 0) + (line.qty_received || 0));
    }

    // Classify each commitment
    const rows = [];
    const counts = { po_not_received: 0, received_no_stock: 0, stock_not_allocated: 0 };

    for (const c of active) {
      const part = partsMap.get(c.part_id);
      const project = projectsMap.get(c.project_id);
      const physicalStock = part?.physical_stock ?? 0;
      const qtyReceived = receivedMap.get(c.id) || 0;
      const coveredPO = c.covered_from_po ?? 0;
      const reservedStock = c.reserved_from_stock ?? 0;
      const requiredTotal = c.required_total ?? 0;
      const qtyInstalled = c.qty_installed ?? 0;

      // Classify issue type
      let issueType = null;

      if (coveredPO > 0 && qtyReceived === 0) {
        issueType = 'PO_NOT_RECEIVED';
      } else if (qtyReceived > 0 && physicalStock === 0) {
        issueType = 'RECEIVED_NO_STOCK';
      } else if (physicalStock > 0 && coveredPO > 0 && reservedStock === 0) {
        issueType = 'STOCK_NOT_ALLOCATED';
      }

      if (!issueType) continue;

      counts[issueType.toLowerCase()] = (counts[issueType.toLowerCase()] || 0) + 1;

      // Compute backfill eligibility (same logic as backfill function)
      const remaining = requiredTotal - qtyInstalled;
      const convertibleQty = Math.min(coveredPO, physicalStock, Math.max(0, remaining));
      const isBackfillEligible = convertibleQty > 0 && physicalStock > 0 && remaining > 0;

      // Current lifecycle state
      const lifecycleState = resolveLifecycleState(c);

      // Projected lifecycle state after backfill
      let projectedLifecycleState = lifecycleState;
      if (isBackfillEligible) {
        projectedLifecycleState = resolveLifecycleState({
          ...c,
          covered_from_po: coveredPO - convertibleQty,
          reserved_from_stock: reservedStock + convertibleQty,
        });
      }

      // Last backfill info from audit or commitment fields
      const lastBackfillAt = c.last_recomputed_at || null;

      rows.push({
        commitment_id: c.id,
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown',
        vendor_part_number: part?.vendor_part_number || null,
        project_id: c.project_id,
        project_name: project?.name || 'Unknown',
        required_total: requiredTotal,
        covered_from_po: coveredPO,
        reserved_from_stock: reservedStock,
        qty_installed: qtyInstalled,
        qty_received: qtyReceived,
        physical_stock: physicalStock,
        lifecycle_state: lifecycleState,
        projected_lifecycle_state: projectedLifecycleState,
        issue_type: issueType,
        convertible_qty: convertibleQty,
        is_backfill_eligible: isBackfillEligible,
        last_backfill_at: lastBackfillAt,
      });
    }

    return Response.json({
      rows,
      counts: {
        po_not_received: counts['po_not_received'] || 0,
        received_no_stock: counts['received_no_stock'] || 0,
        stock_not_allocated: counts['stock_not_allocated'] || 0,
      },
      total: rows.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});