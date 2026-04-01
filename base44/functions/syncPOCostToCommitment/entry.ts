/**
 * syncPOCostToCommitment.js
 * 
 * Syncs PO line item costs back to PartCommitment.
 * Handles weighted average when multiple PO lines exist.
 * Optionally triggers retail recalculation from matrix.
 * 
 * HARD RULE: Does NOT overwrite if commitment has manual pricing override
 * (pricing_integrity_status === 'overridden_retail' indicates manual retail,
 *  but cost sync still applies unless explicitly blocked).
 * 
 * Can be called:
 * - After PO creation (from createPurchaseOrdersFromCommitments)
 * - After PO line edit (from SYNC_PO_COST action)
 * - Standalone for bulk re-sync
 * 
 * Input: { commitment_ids: string[] }  (or single commitment_id)
 * Output: { synced: [...], skipped: [...], errors: [...] }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const commitmentIds = payload.commitment_ids || (payload.commitment_id ? [payload.commitment_id] : []);
    const skipRetailUpdate = payload.skip_retail_update || false;

    if (!commitmentIds.length) {
      return Response.json({ error: 'commitment_ids or commitment_id required' }, { status: 400 });
    }

    const result = await syncCosts(base44, user, commitmentIds, skipRetailUpdate);
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('syncPOCostToCommitment error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});

/**
 * Core sync logic — exported pattern for inline use from other functions
 */
async function syncCosts(base44, user, commitmentIds, skipRetailUpdate = false) {
  const synced = [];
  const skipped = [];
  const errors = [];

  // Fetch all commitments
  const commitments = await base44.asServiceRole.entities.PartCommitment.filter({
    id: { $in: commitmentIds }
  });
  const commitmentMap = new Map(commitments.map(c => [c.id, c]));

  // Fetch all PO line items linked to these commitments
  const allLineItems = [];
  for (const cid of commitmentIds) {
    const lines = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({
      commitment_id: cid
    });
    allLineItems.push(...lines);
  }

  // Group line items by commitment
  const linesByCommitment = new Map();
  for (const li of allLineItems) {
    if (!li.commitment_id) continue;
    if (!linesByCommitment.has(li.commitment_id)) {
      linesByCommitment.set(li.commitment_id, []);
    }
    linesByCommitment.get(li.commitment_id).push(li);
  }

  // Fetch markup matrix for retail calculation
  let matrixTiers = null;
  if (!skipRetailUpdate) {
    const allTiers = await base44.asServiceRole.entities.RetailMarkupMatrix.list();
    matrixTiers = allTiers.filter(t => t.active).sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0));
  }

  for (const cid of commitmentIds) {
    const commitment = commitmentMap.get(cid);
    if (!commitment) {
      errors.push({ commitment_id: cid, reason: 'NOT_FOUND' });
      continue;
    }

    // Skip cancelled/closed
    if (['cancelled', 'closed'].includes(commitment.commitment_status)) {
      skipped.push({ commitment_id: cid, reason: 'STATUS_EXCLUDED', status: commitment.commitment_status });
      continue;
    }

    // Skip if billing is already invoiced/paid (cost is locked)
    if (['invoiced', 'paid'].includes(commitment.billing_status)) {
      skipped.push({ commitment_id: cid, reason: 'BILLING_LOCKED', billing_status: commitment.billing_status });
      continue;
    }

    // Skip if user has manually overridden cost
    if (commitment.cost_override === true) {
      skipped.push({ commitment_id: cid, reason: 'COST_OVERRIDE_ACTIVE' });
      continue;
    }

    const lines = linesByCommitment.get(cid) || [];
    
    // No PO lines — nothing to sync
    if (lines.length === 0) {
      skipped.push({ commitment_id: cid, reason: 'NO_PO_LINES' });
      continue;
    }

    // Filter to non-cancelled lines with valid cost
    const activePOLines = lines.filter(li => li.status !== 'Cancelled');
    if (activePOLines.length === 0) {
      skipped.push({ commitment_id: cid, reason: 'ALL_LINES_CANCELLED' });
      continue;
    }

    // Compute weighted average cost
    let totalCost = 0;
    let totalQty = 0;
    for (const li of activePOLines) {
      const qty = li.qty_ordered || 0;
      const cost = li.unit_cost || 0;
      totalCost += qty * cost;
      totalQty += qty;
    }

    const weightedAvgCost = totalQty > 0 ? Math.round((totalCost / totalQty) * 100) / 100 : 0;

    // Skip if cost is zero (nothing useful to sync)
    if (weightedAvgCost <= 0) {
      skipped.push({ commitment_id: cid, reason: 'ZERO_COST', computed_cost: 0 });
      continue;
    }

    const oldCost = commitment.unit_cost_snapshot ?? 0;
    const updates = {};
    let costChanged = false;

    // Always sync cost from PO (cost is authoritative from vendor)
    if (Math.abs(weightedAvgCost - oldCost) > 0.001) {
      updates.unit_cost_snapshot = weightedAvgCost;
      updates.planned_cost_total = weightedAvgCost * (commitment.required_total || 0);
      costChanged = true;
    }

    // Update retail if null/zero AND cost changed AND matrix available
    const currentRetail = commitment.unit_retail_snapshot ?? 0;
    let retailUpdated = false;
    
    if (!skipRetailUpdate && costChanged && matrixTiers && matrixTiers.length > 0) {
      // Only auto-set retail if it's currently missing/zero OR if pricing_integrity_status suggests it's estimated
      const shouldUpdateRetail = currentRetail <= 0 || 
        commitment.pricing_integrity_status === 'estimated_cost' ||
        commitment.pricing_integrity_status === 'missing_cost' ||
        commitment.pricing_integrity_status === 'missing_retail';

      if (shouldUpdateRetail) {
        const retailResult = computeRetailFromTiers(weightedAvgCost, matrixTiers);
        if (retailResult) {
          updates.unit_retail_snapshot = retailResult.retail;
          updates.planned_retail_total = retailResult.retail * (commitment.required_total || 0);
          updates.margin_pct = retailResult.retail > 0
            ? Math.round(((retailResult.retail - weightedAvgCost) / retailResult.retail) * 10000) / 100
            : 0;
          retailUpdated = true;
        }
      }
    }

    // Update pricing integrity status
    if (costChanged || retailUpdated) {
      const finalCost = updates.unit_cost_snapshot ?? oldCost;
      const finalRetail = updates.unit_retail_snapshot ?? currentRetail;
      
      if (finalCost > 0 && finalRetail > 0 && finalRetail >= finalCost) {
        updates.pricing_integrity_status = 'ok';
      } else if (finalCost > 0 && finalRetail > 0 && finalRetail < finalCost) {
        updates.pricing_integrity_status = 'margin_negative';
      } else if (finalCost > 0 && finalRetail <= 0) {
        updates.pricing_integrity_status = 'missing_retail';
      } else {
        updates.pricing_integrity_status = 'estimated_cost';
      }
    }

    if (Object.keys(updates).length === 0) {
      skipped.push({ commitment_id: cid, reason: 'NO_CHANGE', current_cost: oldCost });
      continue;
    }

    // Apply updates
    await base44.asServiceRole.entities.PartCommitment.update(cid, updates);

    console.log(`[SYNC_PO_COST] commitment=${cid} old_cost=${oldCost} new_cost=${updates.unit_cost_snapshot ?? oldCost} retail_updated=${retailUpdated} by=${user.email}`);

    synced.push({
      commitment_id: cid,
      old_cost: oldCost,
      new_cost: updates.unit_cost_snapshot ?? oldCost,
      old_retail: currentRetail,
      new_retail: updates.unit_retail_snapshot ?? currentRetail,
      po_line_count: activePOLines.length,
      weighted_avg: weightedAvgCost,
      retail_updated: retailUpdated,
      pricing_integrity_status: updates.pricing_integrity_status,
    });
  }

  return { synced, skipped, errors, total: commitmentIds.length };
}

/**
 * Compute retail from markup matrix tiers (inline version)
 */
function computeRetailFromTiers(cost, tiers) {
  if (!cost || cost <= 0 || !tiers || tiers.length === 0) return null;

  for (const tier of tiers) {
    const min = tier.min_cost ?? 0;
    const max = tier.max_cost;
    if (cost >= min && (max === null || max === undefined || cost < max)) {
      const markup_pct = tier.markup_pct ?? 0;
      const retail = Math.round(cost * (1 + markup_pct));
      return { retail, markup_pct, tier_label: tier.label || `${Math.round(markup_pct * 100)}%` };
    }
  }
  return null;
}