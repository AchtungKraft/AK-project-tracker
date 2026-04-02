import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * getReceivingGapDiagnostics — Canonical server-side read model
 * 
 * Returns fully-computed receiving gap rows with lifecycle states,
 * issue classifications, backfill eligibility, recommended actions,
 * and projected states.
 * 
 * NO UI-side math allowed — this is the single source of truth.
 * 
 * Issue types (5 explicit classifications):
 *   PO_NOT_RECEIVED           — PO exists, nothing received yet
 *   RECEIVED_NO_STOCK         — Received but no physical inventory (never entered)
 *   RECEIVED_STOCK_CONSUMED   — Received but stock already used/installed/allocated
 *   STOCK_NOT_ALLOCATED       — Stock exists, PO coverage, zero reservation
 *   STOCK_PARTIALLY_ALLOCATED — Stock exists, PO coverage, partial reservation
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
        counts: {
          po_not_received: 0,
          received_no_stock: 0,
          received_stock_consumed: 0,
          stock_not_allocated: 0,
          stock_partially_allocated: 0,
        },
        total: 0,
      });
    }

    // Collect unique part IDs and project IDs
    const partIds = [...new Set(active.map(c => c.part_id).filter(Boolean))];
    const projectIds = [...new Set(active.map(c => c.project_id).filter(Boolean))];

    // Fetch parts, projects in parallel
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
    const allLineItemIds = [];
    const commitmentLineMap = new Map();
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
      for (let i = 0; i < allLineItemIds.length; i += 200) {
        const chunk = allLineItemIds.slice(i, i + 200);
        const items = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({
          id: { $in: chunk }
        });
        allLineItems.push(...items);
      }
    }

    // Build qty_received and po_qty maps from PO lines
    const receivedMap = new Map();
    const poQtyMap = new Map();
    for (const line of allLineItems) {
      const cid = commitmentLineMap.get(line.id) || line.commitment_id;
      if (!cid) continue;
      receivedMap.set(cid, (receivedMap.get(cid) || 0) + (line.qty_received || 0));
      poQtyMap.set(cid, (poQtyMap.get(cid) || 0) + (line.qty_ordered || 0));
    }

    // Classify each commitment
    const rows = [];
    const counts = {
      po_not_received: 0,
      received_no_stock: 0,
      received_stock_consumed: 0,
      stock_not_allocated: 0,
      stock_partially_allocated: 0,
    };

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

      // Only examine commitments with PO coverage — no PO means no receiving gap
      if (coveredPO <= 0) continue;

      // ═══════════════════════════════════════════════════════════
      // CLASSIFICATION — 5 mutually exclusive issue types
      // Priority order: most upstream problem first
      // ═══════════════════════════════════════════════════════════
      let issueType = null;
      let issueLabel = null;
      let recommendedAction = null;
      let actionReason = null;

      if (qtyReceived === 0) {
        // CASE A: PO exists but nothing received yet
        issueType = 'PO_NOT_RECEIVED';
        issueLabel = 'PO not received';
        recommendedAction = 'RECEIVE_NOW';
        actionReason = 'PO line items show 0 qty received';
      } else if (qtyReceived > 0 && physicalStock === 0) {
        // Received but no physical stock — why?
        if (qtyInstalled === 0 && reservedStock === 0) {
          // CASE B: Nothing installed or reserved — stock was never entered
          issueType = 'RECEIVED_NO_STOCK';
          issueLabel = 'Received but not in inventory';
          recommendedAction = 'FIX_INVENTORY';
          actionReason = `${qtyReceived} received on PO but physical stock is 0 with no installs`;
        } else {
          // CASE E: Stock was consumed (installed or allocated elsewhere)
          issueType = 'RECEIVED_STOCK_CONSUMED';
          issueLabel = 'Received, stock already consumed';
          recommendedAction = 'REVIEW_MANUALLY';
          actionReason = `${qtyReceived} received, physical stock 0, ${qtyInstalled} installed / ${reservedStock} reserved — stock appears consumed`;
        }
      } else if (physicalStock > 0 && coveredPO > 0) {
        if (reservedStock === 0) {
          // CASE C: Stock exists, PO coverage, zero reservation
          issueType = 'STOCK_NOT_ALLOCATED';
          issueLabel = 'Stock not allocated';
          // Action depends on backfill eligibility (computed below)
        } else if (reservedStock > 0 && reservedStock < requiredTotal) {
          // CASE D: Stock exists, partial reservation
          issueType = 'STOCK_PARTIALLY_ALLOCATED';
          issueLabel = 'Stock partially allocated';
          // Action depends on backfill eligibility (computed below)
        }
      }

      if (!issueType) continue;

      // Count by issue type
      const countKey = issueType.toLowerCase();
      counts[countKey] = (counts[countKey] || 0) + 1;

      // ═══════════════════════════════════════════════════════════
      // BACKFILL ELIGIBILITY — strict invariants (unchanged)
      // convertible_qty = min(coveredPO, physicalStock, remaining, received_qty)
      // ═══════════════════════════════════════════════════════════
      const remaining = Math.max(0, requiredTotal - qtyInstalled);
      const maxConvertible = Math.min(
        coveredPO,
        physicalStock,
        remaining,
        qtyReceived > 0 ? qtyReceived : 0
      );
      const convertibleQty = Math.max(0, maxConvertible);

      let skipReason = null;
      let isBackfillEligible = false;

      if (issueType !== 'STOCK_NOT_ALLOCATED' && issueType !== 'STOCK_PARTIALLY_ALLOCATED') {
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

      // Set recommended_action for allocation types based on eligibility
      if (issueType === 'STOCK_NOT_ALLOCATED' || issueType === 'STOCK_PARTIALLY_ALLOCATED') {
        if (isBackfillEligible) {
          recommendedAction = 'RUN_BACKFILL';
          actionReason = `Can convert ${convertibleQty} from PO coverage → stock reservation`;
        } else {
          recommendedAction = 'REVIEW_MANUALLY';
          actionReason = skipReason;
        }
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
        // Canonical quantities
        required_total: requiredTotal,
        covered_from_po: coveredPO,
        reserved_from_stock: reservedStock,
        qty_installed: qtyInstalled,
        qty_received: qtyReceived,
        physical_stock: physicalStock,
        po_qty: poQty,
        // Lifecycle
        lifecycle_state: lifecycleState,
        projected_lifecycle_state: projectedLifecycleState,
        // Classification contract
        issue_type: issueType,
        issue_label: issueLabel,
        recommended_action: recommendedAction,
        action_reason: actionReason,
        // Backfill fields
        convertible_qty: convertibleQty,
        is_backfill_eligible: isBackfillEligible,
        skip_reason: skipReason,
      });
    }

    return Response.json({
      rows,
      counts,
      total: rows.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});