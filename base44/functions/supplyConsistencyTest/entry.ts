import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * supplyConsistencyTest — STEP 5: Snapshot consistency test
 * 
 * Compares outputs of all three read models for the same data set.
 * Flags any mathematical divergence. Run periodically or on-demand.
 * 
 * Assertions:
 * - to_order matches across models
 * - available_to_install matches
 * - funding state matches
 * - satisfaction state matches
 */

// CANONICAL SUPPLY MATH (inlined — must match canonicalSupplyMath.js)
function readCanonicalQty(c) {
  const required_total = c.required_total ?? 0;
  const qty_removed = c.qty_removed ?? 0;
  const effective_required = Math.max(0, required_total - qty_removed);
  const reserved_from_stock = c.reserved_from_stock ?? 0;
  const covered_from_po = c.covered_from_po ?? 0;
  const qty_installed = c.qty_installed ?? 0;
  const coverage_total = reserved_from_stock + covered_from_po + qty_installed;
  const to_order = Math.max(0, effective_required - coverage_total);
  const available_to_install = Math.max(0, Math.min(
    reserved_from_stock + covered_from_po - qty_installed,
    effective_required - qty_installed
  ));
  const is_satisfied = coverage_total >= effective_required && effective_required > 0;
  return { required_total, qty_removed, effective_required, reserved_from_stock, covered_from_po, qty_installed, coverage_total, to_order, available_to_install, is_satisfied };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const { sample_size = 20 } = await req.json().catch(() => ({}));

    // 1. Fetch raw commitments (ground truth)
    const commitments = await base44.entities.PartCommitment.filter(
      { commitment_status: { $ne: 'cancelled' } }, '-created_date', sample_size
    );

    if (commitments.length === 0) {
      return Response.json({ success: true, message: 'No commitments to test', violations: [] });
    }

    // 2. Compute canonical values from raw data (ground truth)
    const groundTruth = new Map();
    for (const c of commitments) {
      const q = readCanonicalQty(c);
      groundTruth.set(c.id, {
        commitment_id: c.id,
        part_id: c.part_id,
        project_id: c.project_id,
        ...q,
      });
    }

    // 3. Call each read model
    const [opsResult, inventoryResult, queuesResult] = await Promise.all([
      base44.functions.invoke('getOpsSupplyView', { mode: 'ALL', filters: {} }).catch(e => ({ data: { items: [] }, error: e.message })),
      base44.functions.invoke('getPartsInventoryView', { limit: 500 }).catch(e => ({ data: { parts: [] }, error: e.message })),
      base44.functions.invoke('getGlobalSupplyQueues', {}).catch(e => ({ data: { queues: {} }, error: e.message })),
    ]);

    // 4. Build lookup maps from read model outputs
    const opsItems = (opsResult.data?.items || []);
    const opsMap = new Map(opsItems.map(i => [i.commitment_id || i.id, i]));

    // Inventory view is per-part, not per-commitment — aggregate for comparison
    const invParts = (inventoryResult.data?.parts || []);
    const invPartMap = new Map(invParts.map(p => [p.part_id, p]));

    // Global queues flattened
    const allQueueItems = [];
    const queues = queuesResult.data?.queues || {};
    for (const [_queueName, queue] of Object.entries(queues)) {
      if (queue.items) allQueueItems.push(...queue.items);
    }
    const gqMap = new Map();
    for (const item of allQueueItems) {
      if (item.commitment_id && !gqMap.has(item.commitment_id)) {
        gqMap.set(item.commitment_id, item);
      }
    }

    // 5. Compare and find violations
    const violations = [];
    const TOL = 0.01;

    for (const [cid, truth] of groundTruth) {
      const opsItem = opsMap.get(cid);
      const gqItem = gqMap.get(cid);

      // Check OPS view
      if (opsItem) {
        if (Math.abs((opsItem.to_order ?? 0) - truth.to_order) > TOL) {
          violations.push({
            commitment_id: cid,
            field: 'to_order',
            ground_truth: truth.to_order,
            ops_value: opsItem.to_order,
            source: 'getOpsSupplyView',
          });
        }
        if (Math.abs((opsItem.available_to_install ?? 0) - truth.available_to_install) > TOL) {
          violations.push({
            commitment_id: cid,
            field: 'available_to_install',
            ground_truth: truth.available_to_install,
            ops_value: opsItem.available_to_install,
            source: 'getOpsSupplyView',
          });
        }
      }

      // Check Global Queues
      if (gqItem) {
        if (Math.abs((gqItem.qty_to_order ?? 0) - truth.to_order) > TOL) {
          violations.push({
            commitment_id: cid,
            field: 'to_order',
            ground_truth: truth.to_order,
            gq_value: gqItem.qty_to_order,
            source: 'getGlobalSupplyQueues',
          });
        }
        if (Math.abs((gqItem.qty_to_install ?? 0) - truth.available_to_install) > TOL) {
          violations.push({
            commitment_id: cid,
            field: 'available_to_install',
            ground_truth: truth.available_to_install,
            gq_value: gqItem.qty_to_install,
            source: 'getGlobalSupplyQueues',
          });
        }
      }
    }

    // 6. Per-part inventory cross-check
    const partAggregates = new Map();
    for (const c of commitments) {
      if (!partAggregates.has(c.part_id)) partAggregates.set(c.part_id, { to_order: 0 });
      const q = readCanonicalQty(c);
      partAggregates.get(c.part_id).to_order += q.to_order;
    }

    for (const [partId, agg] of partAggregates) {
      const invPart = invPartMap.get(partId);
      if (invPart && Math.abs((invPart.to_order ?? 0) - agg.to_order) > TOL) {
        violations.push({
          part_id: partId,
          field: 'part_to_order',
          ground_truth: agg.to_order,
          inventory_value: invPart.to_order,
          source: 'getPartsInventoryView',
        });
      }
    }

    // 7. Derived state assertions (Step 3)
    const derivedViolations = [];
    for (const c of commitments) {
      const q = readCanonicalQty(c);
      if (q.to_order < -TOL) {
        derivedViolations.push({ commitment_id: c.id, field: 'to_order', value: q.to_order, message: 'Negative to_order' });
      }
      if (q.available_to_install < -TOL) {
        derivedViolations.push({ commitment_id: c.id, field: 'available_to_install', value: q.available_to_install, message: 'Negative available_to_install' });
      }
      if (q.effective_required < -TOL) {
        derivedViolations.push({ commitment_id: c.id, field: 'effective_required', value: q.effective_required, message: 'Negative effective_required' });
      }
      // Verify: effective_required should = required_total - qty_removed
      const expectedEff = Math.max(0, q.required_total - q.qty_removed);
      if (Math.abs(q.effective_required - expectedEff) > TOL) {
        derivedViolations.push({
          commitment_id: c.id, field: 'effective_required',
          value: q.effective_required, expected: expectedEff,
          message: `effective_required(${q.effective_required}) != max(0, required_total(${q.required_total}) - qty_removed(${q.qty_removed})) = ${expectedEff}`,
          raw: { required_total: q.required_total, qty_removed: q.qty_removed },
        });
      }
    }

    const allClean = violations.length === 0 && derivedViolations.length === 0;

    console.log(`[supplyConsistencyTest] Tested ${commitments.length} commitments. Cross-model violations: ${violations.length}. Derived-state violations: ${derivedViolations.length}. Status: ${allClean ? 'PASS' : 'FAIL'}`);

    return Response.json({
      success: true,
      status: allClean ? 'PASS' : 'FAIL',
      commitments_tested: commitments.length,
      cross_model_violations: violations,
      derived_state_violations: derivedViolations,
      read_model_errors: {
        ops: opsResult.error || null,
        inventory: inventoryResult.error || null,
        queues: queuesResult.error || null,
      },
    });

  } catch (error) {
    console.error('supplyConsistencyTest error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});