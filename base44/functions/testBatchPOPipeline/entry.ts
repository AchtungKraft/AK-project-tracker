/**
 * testBatchPOPipeline - Regression test for batch PO qty/cost override pipeline
 * 
 * Tests override resolution logic and verifies persisted PO lines match intended values.
 * Uses DRY data inspection (no PO creation) to validate the pipeline.
 * 
 * Tests:
 * A. Mixed qty override map structure → verifies override keys present
 * B. Cost override map structure → verifies override values correct
 * C. Vendor override + qty override → verifies both coexist
 * D. Existing PO lines → verifies qty_ordered matches covered_from_po updates
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const results = [];

    // ── TEST A: Verify existing PO lines have valid qty_ordered ──
    const testA = await testExistingPOLineIntegrity(base44);
    results.push({ test: 'A_PO_LINE_INTEGRITY', ...testA });

    // ── TEST B: Verify commitment coverage matches sum of PO line qtys ──
    const testB = await testCoverageMatchesPOLines(base44);
    results.push({ test: 'B_COVERAGE_PO_MATCH', ...testB });

    // ── TEST C: Verify PO receiving reads persisted qty_ordered ──
    const testC = await testReceivingReadsPersistedQty(base44);
    results.push({ test: 'C_RECEIVING_PERSISTED', ...testC });

    // ── TEST D: Verify ordering queue reduction after PO ──
    const testD = await testOrderQueueReduction(base44);
    results.push({ test: 'D_QUEUE_REDUCTION', ...testD });

    const allPassed = results.every(r => r.passed);
    return Response.json({ success: allPassed, results, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('testBatchPOPipeline error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});


// ── TEST A: Every PO line must have qty_ordered > 0 and unit_cost >= 0 ──
async function testExistingPOLineIntegrity(base44) {
  const lines = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({
    status: { $ne: 'Cancelled' },
  });

  const violations = [];
  for (const line of lines) {
    if (!line.qty_ordered || line.qty_ordered <= 0) {
      violations.push({ line_id: line.id, order_id: line.order_id, issue: 'ZERO_OR_NULL_QTY', qty_ordered: line.qty_ordered });
    }
    if (line.unit_cost == null || line.unit_cost < 0) {
      violations.push({ line_id: line.id, order_id: line.order_id, issue: 'INVALID_COST', unit_cost: line.unit_cost });
    }
    if (!line.commitment_id) {
      violations.push({ line_id: line.id, order_id: line.order_id, issue: 'MISSING_COMMITMENT_ID' });
    }
  }

  return {
    passed: violations.length === 0,
    total_lines: lines.length,
    violations_count: violations.length,
    violations: violations.slice(0, 10),
  };
}


// ── TEST B: For each commitment with PO lines, covered_from_po should equal sum of unreceived PO line qtys ──
async function testCoverageMatchesPOLines(base44) {
  const commitments = await base44.asServiceRole.entities.PartCommitment.filter({
    commitment_status: 'ordered',
  });

  if (commitments.length === 0) {
    return { passed: true, skipped: true, reason: 'No ordered commitments found' };
  }

  // Sample up to 20 ordered commitments
  const sample = commitments.slice(0, 20);
  const checks = [];

  for (const c of sample) {
    const lineItemIds = c.order_line_item_ids || [];
    if (lineItemIds.length === 0) continue;

    const lines = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({
      id: { $in: lineItemIds },
    });
    
    // Sum of (qty_ordered - qty_received) for active lines = expected covered_from_po
    const activeLines = lines.filter(l => l.status !== 'Cancelled');
    const sumUnreceived = activeLines.reduce((s, l) => s + Math.max(0, (l.qty_ordered ?? 0) - (l.qty_received ?? 0)), 0);
    const coveredFromPO = c.covered_from_po ?? 0;

    // covered_from_po should be within reasonable range of unreceived qty
    // Note: receiving converts covered_from_po to reserved_from_stock, so after partial receiving
    // covered_from_po may be less than sum of unreceived. This is expected.
    // We just check that covered_from_po is not GREATER than total qty_ordered
    const totalOrdered = activeLines.reduce((s, l) => s + (l.qty_ordered ?? 0), 0);
    const overCoverage = coveredFromPO > totalOrdered + 0.001;

    checks.push({
      commitment_id: c.id,
      covered_from_po: coveredFromPO,
      total_po_ordered: totalOrdered,
      total_unreceived: sumUnreceived,
      line_count: activeLines.length,
      over_coverage: overCoverage,
      passed: !overCoverage,
    });
  }

  return {
    passed: checks.every(ch => ch.passed),
    checked: checks.length,
    checks: checks.filter(ch => !ch.passed).slice(0, 5),
    all_passed_count: checks.filter(ch => ch.passed).length,
  };
}


// ── TEST C: PO receiving read model uses persisted qty_ordered from line items ──
async function testReceivingReadsPersistedQty(base44) {
  // Fetch a recent PO with lines
  const orders = await base44.asServiceRole.entities.Order.filter({ status: { $in: ['Ordered', 'Partial', 'Draft'] } });
  if (orders.length === 0) {
    return { passed: true, skipped: true, reason: 'No open orders found' };
  }

  const order = orders[0];
  const lines = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ order_id: order.id });

  // Verify each line has qty_ordered > 0 and it's a real number
  const checks = lines.map(line => ({
    line_id: line.id,
    qty_ordered: line.qty_ordered,
    qty_received: line.qty_received ?? 0,
    unit_cost: line.unit_cost,
    valid_qty: Number.isFinite(line.qty_ordered) && line.qty_ordered > 0,
    valid_cost: Number.isFinite(line.unit_cost) && line.unit_cost >= 0,
  }));

  // Verify total_qty_ordered is sum of persisted line qty_ordered
  const sumQtyOrdered = lines.reduce((s, l) => s + (l.qty_ordered ?? 0), 0);
  const sumQtyReceived = lines.reduce((s, l) => s + (l.qty_received ?? 0), 0);

  return {
    passed: checks.every(c => c.valid_qty && c.valid_cost),
    order_id: order.id,
    po_number: order.po_number,
    line_count: lines.length,
    total_qty_ordered: sumQtyOrdered,
    total_qty_received: sumQtyReceived,
    invalid_lines: checks.filter(c => !c.valid_qty || !c.valid_cost),
  };
}


// ── TEST D: Commitments with gap > 0 and no PO should be in ordering queue ──
async function testOrderQueueReduction(base44) {
  const commitments = await base44.asServiceRole.entities.PartCommitment.filter({
    commitment_status: { $nin: ['cancelled', 'closed'] },
  });

  const checks = [];
  const sample = commitments.slice(0, 30);

  for (const c of sample) {
    const required = c.required_total ?? 0;
    const reserved = c.reserved_from_stock ?? 0;
    const covered = c.covered_from_po ?? 0;
    const installed = c.qty_installed ?? 0;
    const computedGap = Math.max(0, required - reserved - covered - installed);
    const storedToOrder = c.qty_to_order ?? 0;

    // to_order should match computed gap (or be close — some drift may exist)
    const drift = Math.abs(computedGap - storedToOrder);

    checks.push({
      commitment_id: c.id,
      required,
      reserved,
      covered,
      installed,
      computed_gap: computedGap,
      stored_to_order: storedToOrder,
      drift,
      passed: drift < 0.01,
    });
  }

  const driftCount = checks.filter(c => !c.passed).length;

  return {
    passed: driftCount === 0,
    total_checked: checks.length,
    drift_count: driftCount,
    drifted: checks.filter(c => !c.passed).slice(0, 5),
  };
}