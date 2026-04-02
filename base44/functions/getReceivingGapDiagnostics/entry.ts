import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * getReceivingGapDiagnostics — Canonical server-side read model (HARDENED)
 *
 * GUARANTEES:
 *   1. Every row has exactly ONE issue_type (mutual exclusivity via if/else-if)
 *   2. Every issue_type maps to exactly one recommended_action
 *   3. Backfill conversion never exceeds received_qty or physical_stock
 *   4. NO_GAP rows are returned but excluded from counts/total
 *   5. debug=true returns raw classification trace (admin only)
 *
 * Issue types (strict priority order — first match wins):
 *   1. PO_NOT_RECEIVED           — PO exists, nothing received yet
 *   2. RECEIVED_NO_STOCK         — Received, physical_stock=0, nothing consumed
 *   3. RECEIVED_STOCK_CONSUMED   — Received, physical_stock=0, stock was used
 *   4. STOCK_NOT_ALLOCATED       — Stock exists, PO coverage, zero reservation
 *   5. STOCK_PARTIALLY_ALLOCATED — Stock exists, PO coverage, partial reservation
 *   6. NO_GAP                    — No issue detected (omitted from default view)
 *
 * Lifecycle resolver shared with backfillLegacyReceiving for parity.
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
 * classifyCommitment — Strict single-path classification.
 * Uses if/else-if chain to guarantee mutual exclusivity.
 * Returns { issueType, issueLabel, recommendedAction, actionReason, matchedCondition }.
 */
function classifyCommitment({ coveredPO, qtyReceived, physicalStock, qtyInstalled, reservedStock, requiredTotal }) {
  // Priority 1: PO exists but nothing received
  if (qtyReceived === 0) {
    return {
      issueType: 'PO_NOT_RECEIVED',
      issueLabel: 'PO not received',
      recommendedAction: 'RECEIVE_NOW',
      actionReason: 'PO line items show 0 qty received',
      matchedCondition: 'qtyReceived === 0',
    };
  }
  // Priority 2: Received but no physical stock — never entered inventory
  else if (physicalStock === 0 && qtyInstalled === 0 && reservedStock === 0) {
    return {
      issueType: 'RECEIVED_NO_STOCK',
      issueLabel: 'Received but not in inventory',
      recommendedAction: 'FIX_INVENTORY',
      actionReason: `${qtyReceived} received on PO but physical stock is 0 with no installs or reservations`,
      matchedCondition: 'physicalStock === 0 && qtyInstalled === 0 && reservedStock === 0',
    };
  }
  // Priority 3: Received but stock consumed (installed/allocated elsewhere)
  else if (physicalStock === 0) {
    return {
      issueType: 'RECEIVED_STOCK_CONSUMED',
      issueLabel: 'Received, stock already consumed',
      recommendedAction: 'REVIEW_MANUALLY',
      actionReason: `${qtyReceived} received, physical stock 0, ${qtyInstalled} installed / ${reservedStock} reserved — stock appears consumed`,
      matchedCondition: 'physicalStock === 0 (with installs or reservations)',
    };
  }
  // Priority 4: Stock exists, zero reservation
  else if (reservedStock === 0) {
    return {
      issueType: 'STOCK_NOT_ALLOCATED',
      issueLabel: 'Stock not allocated',
      recommendedAction: null, // Set after backfill eligibility check
      actionReason: null,
      matchedCondition: 'physicalStock > 0 && reservedStock === 0',
    };
  }
  // Priority 5: Stock exists, partial reservation
  else if (reservedStock > 0 && reservedStock < requiredTotal) {
    return {
      issueType: 'STOCK_PARTIALLY_ALLOCATED',
      issueLabel: 'Stock partially allocated',
      recommendedAction: null, // Set after backfill eligibility check
      actionReason: null,
      matchedCondition: 'physicalStock > 0 && 0 < reservedStock < requiredTotal',
    };
  }
  // No gap — fully allocated or over-allocated
  else {
    return {
      issueType: 'NO_GAP',
      issueLabel: 'No receiving gaps',
      recommendedAction: null,
      actionReason: 'Commitment is fully covered and allocated',
      matchedCondition: 'no condition matched — fully covered',
    };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, debug = false, include_no_gap = false } = body;

    // Debug trace is admin-only
    const includeDebug = debug && user.role === 'admin';

    // ═══════════════════════════════════════════════════════════
    // CONSISTENT DATA SNAPSHOT — all reads within single execution
    // ═══════════════════════════════════════════════════════════

    // Fetch commitments
    const filter = project_id ? { project_id } : {};
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter(filter);

    // Skip terminal states
    const active = commitments.filter(c => {
      const s = (c.commitment_status || '').toLowerCase();
      return s !== 'cancelled' && s !== 'closed';
    });

    // Only examine commitments with PO coverage
    const candidates = active.filter(c => (c.covered_from_po ?? 0) > 0);

    if (candidates.length === 0) {
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
        ...(includeDebug ? { _debug: { candidates_count: 0, active_count: active.length, total_commitments: commitments.length } } : {}),
      });
    }

    // Collect unique IDs
    const partIds = [...new Set(candidates.map(c => c.part_id).filter(Boolean))];
    const projectIds = [...new Set(candidates.map(c => c.project_id).filter(Boolean))];

    // Fetch parts and projects in parallel
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

    // Fetch PO line items for qty_received
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

    // Build qty_received and po_qty maps
    const receivedMap = new Map();
    const poQtyMap = new Map();
    for (const line of allLineItems) {
      const cid = commitmentLineMap.get(line.id) || line.commitment_id;
      if (!cid) continue;
      receivedMap.set(cid, (receivedMap.get(cid) || 0) + (line.qty_received || 0));
      poQtyMap.set(cid, (poQtyMap.get(cid) || 0) + (line.qty_ordered || 0));
    }

    // ═══════════════════════════════════════════════════════════
    // CLASSIFY — single-path, mutually exclusive
    // ═══════════════════════════════════════════════════════════

    const rows = [];
    const debugTraces = [];
    const counts = {
      po_not_received: 0,
      received_no_stock: 0,
      received_stock_consumed: 0,
      stock_not_allocated: 0,
      stock_partially_allocated: 0,
    };

    for (const c of candidates) {
      const part = partsMap.get(c.part_id);
      const project = projectsMap.get(c.project_id);
      const physicalStock = part?.physical_stock ?? 0;
      const qtyReceived = receivedMap.get(c.id) || 0;
      const poQty = poQtyMap.get(c.id) || 0;
      const coveredPO = c.covered_from_po ?? 0;
      const reservedStock = c.reserved_from_stock ?? 0;
      const requiredTotal = c.required_total ?? 0;
      const qtyInstalled = c.qty_installed ?? 0;

      // Raw inputs for classification
      const inputs = { coveredPO, qtyReceived, physicalStock, qtyInstalled, reservedStock, requiredTotal };

      // Single-path classification (if/else-if chain)
      const classification = classifyCommitment(inputs);

      // Debug trace (admin only)
      if (includeDebug) {
        debugTraces.push({
          commitment_id: c.id,
          part_name: part?.part_name || 'Unknown',
          raw_inputs: inputs,
          matched_condition: classification.matchedCondition,
          issue_type: classification.issueType,
        });
      }

      // Skip NO_GAP unless explicitly requested
      if (classification.issueType === 'NO_GAP' && !include_no_gap) continue;

      // Count (NO_GAP excluded from counts)
      if (classification.issueType !== 'NO_GAP') {
        const countKey = classification.issueType.toLowerCase();
        counts[countKey] = (counts[countKey] || 0) + 1;
      }

      // ═══════════════════════════════════════════════════════════
      // BACKFILL ELIGIBILITY (allocation types only)
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
      let { recommendedAction, actionReason } = classification;

      if (classification.issueType === 'STOCK_NOT_ALLOCATED' || classification.issueType === 'STOCK_PARTIALLY_ALLOCATED') {
        if (convertibleQty <= 0) {
          skipReason = 'NO_CONVERTIBLE_QTY';
        } else if (remaining <= 0) {
          skipReason = 'FULLY_INSTALLED';
        } else if ((reservedStock + convertibleQty) > requiredTotal) {
          skipReason = 'WOULD_EXCEED_REQUIRED';
        } else if ((coveredPO - convertibleQty) < 0) {
          skipReason = 'WOULD_UNDERFLOW_PO';
        } else {
          isBackfillEligible = true;
        }

        if (isBackfillEligible) {
          recommendedAction = 'RUN_BACKFILL';
          actionReason = `Can convert ${convertibleQty} from PO coverage → stock reservation`;
        } else {
          recommendedAction = 'REVIEW_MANUALLY';
          actionReason = skipReason;
        }
      } else {
        // Non-allocation types: backfill not applicable
        skipReason = 'WRONG_ISSUE_TYPE';
      }

      // Lifecycle states
      const lifecycleState = resolveLifecycleState(c);
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
        // Classification contract — exactly ONE per row
        issue_type: classification.issueType,
        issue_label: classification.issueLabel,
        recommended_action: recommendedAction,
        action_reason: actionReason,
        // Backfill fields
        convertible_qty: convertibleQty,
        is_backfill_eligible: isBackfillEligible,
        skip_reason: skipReason,
      });
    }

    // Gap rows = everything except NO_GAP
    const gapRows = rows.filter(r => r.issue_type !== 'NO_GAP');

    return Response.json({
      rows,
      counts,
      total: gapRows.length,
      ...(includeDebug ? {
        _debug: {
          total_commitments: commitments.length,
          active_count: active.length,
          candidates_count: candidates.length,
          classification_traces: debugTraces,
          no_gap_count: rows.length - gapRows.length,
        }
      } : {}),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});