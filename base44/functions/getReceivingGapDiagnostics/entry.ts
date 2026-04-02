import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * getReceivingGapDiagnostics — Canonical server-side read model
 * 
 * Returns fully-computed receiving gap rows with lifecycle states,
 * issue classifications, backfill eligibility, and projected states.
 * 
 * NO UI-side math allowed — this is the single source of truth.
 * 
 * Uses the authoritative resolveLifecycleState function shared with
 * backfillLegacyReceiving for parity.
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

    // Fetch parts, projects, and line items in parallel
    const [allParts, allProjects] = await Promise.all([
      partIds.length > 0
        ? base44.asServiceRole.entities.Part.filter({ id: { $in: partIds.slice(0, 200) } })
        : Promise.resolve([]),
      projectIds.length > 0
        ? base44.asServiceRole.entities.Project.filter({ id: { $in: projectIds.slice(0, 100) } })
        : Promise.resolve([]),
    ]);

    const partsMap = new Map(allParts.map(p => [p.id, p]));
    const projectsMap = new Map(allProjects.map(p => [p.id, p]));

    // Fetch PO line items for qty_received + po_qty computation
    // Batch: collect all order_line_item_ids, fetch in one query
    const allLineItemIds = [];
    const commitmentLineMap = new Map(); // lineItemId -> commitmentId
    for (const c of active) {
      if (c.order_line_item_ids?.length > 0) {
        for (const lid of c.order_line_item_ids) {
          allLineItemIds.push(lid);
          commitmentLineMap.set(lid, c.id);
        }
      }
    }

    let allLineItems = [];
    if (allLineItemIds.length > 0) {
      // Batch fetch in chunks of 200
      for (let i = 0; i < allLineItemIds.length; i += 200) {
        const chunk = allLineItemIds.slice(i, i + 200);
        const items = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({
          id: { $in: chunk }
        });
        allLineItems.push(...items);
      }
    }

    // Build qty_received and po_qty maps from PO lines
    const receivedMap = new Map(); // commitmentId -> total qty_received
    const poQtyMap = new Map(); // commitmentId -> total qty_ordered on PO
    for (const line of allLineItems) {
      const cid = commitmentLineMap.get(line.id) || line.commitment_id;
      if (!cid) continue;
      receivedMap.set(cid, (receivedMap.get(cid) || 0) + (line.qty_received || 0));
      poQtyMap.set(cid, (poQtyMap.get(cid) || 0) + (line.qty_ordered || 0));
    }

    // Classify each commitment
    const rows = [];
    const counts = { po_not_received: 0, received_no_stock: 0, stock_not_allocated: 0 };

    for (const c of active) {
      const part = partsMap.get(c.part_id);
      const project = projectsMap.get(c.project_id);
      const physicalStock = part?.physical_stock ?? 0;
      const qtyReceived = receivedMap.get(c.id) || 0;
      const poQty = poQtyMap.get(c.id) || 0;
      const coveredPO = c.covered_from_po ?? 0;
      const reservedStock = c.reserved_from_stock ?? 0;
      const requiredTotal = c.required_total ?? 0;
      const qtyInstalled = c.qty_installed ?? 0;

      // Classify issue type — mutually exclusive, priority order
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

      // Compute backfill eligibility with safety invariants
      const remaining = Math.max(0, requiredTotal - qtyInstalled);
      const maxConvertible = Math.min(coveredPO, physicalStock, remaining, qtyReceived > 0 ? qtyReceived : coveredPO);
      const convertibleQty = Math.max(0, maxConvertible);

      // Safety checks for eligibility
      let skipReason = null;
      let isBackfillEligible = false;

      if (issueType !== 'STOCK_NOT_ALLOCATED') {
        skipReason = 'WRONG_ISSUE_TYPE';
      } else if (convertibleQty <= 0) {
        skipReason = 'NO_CONVERTIBLE_QTY';
      } else if (physicalStock <= 0) {
        skipReason = 'NO_PHYSICAL_STOCK';
      } else if (remaining <= 0) {
        skipReason = 'FULLY_INSTALLED';
      } else if ((reservedStock + convertibleQty) > requiredTotal) {
        skipReason = 'WOULD_EXCEED_REQUIRED';
      } else if ((coveredPO - convertibleQty) < 0) {
        skipReason = 'WOULD_UNDERFLOW_PO';
      } else {
        isBackfillEligible = true;
      }

      // Current lifecycle state via authoritative resolver
      const lifecycleState = resolveLifecycleState(c);

      // Projected lifecycle state after backfill (server-side resolver)
      let projectedLifecycleState = lifecycleState;
      if (isBackfillEligible && convertibleQty > 0) {
        projectedLifecycleState = resolveLifecycleState({
          ...c,
          covered_from_po: coveredPO - convertibleQty,
          reserved_from_stock: reservedStock + convertibleQty,
        });
      }

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
        po_qty: poQty,
        lifecycle_state: lifecycleState,
        projected_lifecycle_state: projectedLifecycleState,
        issue_type: issueType,
        convertible_qty: convertibleQty,
        is_backfill_eligible: isBackfillEligible,
        skip_reason: skipReason,
      });
    }

    return Response.json({
      rows,
      counts: {
        po_not_received: counts.po_not_received || 0,
        received_no_stock: counts.received_no_stock || 0,
        stock_not_allocated: counts.stock_not_allocated || 0,
      },
      total: rows.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});