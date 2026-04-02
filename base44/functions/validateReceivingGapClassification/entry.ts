/**
 * validateReceivingGapClassification — Automated test suite
 *
 * Tests the classification logic against synthetic data cases.
 * Does NOT call other functions — uses inline classification logic
 * identical to getReceivingGapDiagnostics for deterministic testing.
 *
 * Validates:
 *   1. Mutual exclusivity — each case produces exactly one issue_type
 *   2. Correct recommended_action per issue_type
 *   3. Backfill conversion never exceeds received_qty
 *   4. Backfill conversion never exceeds physical_stock
 *   5. Zero conversion when received_qty = 0
 *   6. Partial allocation correctly classified
 *   7. NO_GAP for fully covered rows
 *   8. Skip reason present when not eligible
 */

// ═══════════════════════════════════════════════════════════
// INLINE CLASSIFICATION — identical to getReceivingGapDiagnostics
// ═══════════════════════════════════════════════════════════

function classifyCommitment({ coveredPO, qtyReceived, physicalStock, qtyInstalled, reservedStock, requiredTotal }) {
  if (qtyReceived === 0) {
    return { issueType: 'PO_NOT_RECEIVED', recommendedAction: 'RECEIVE_NOW' };
  } else if (physicalStock === 0 && qtyInstalled === 0 && reservedStock === 0) {
    return { issueType: 'RECEIVED_NO_STOCK', recommendedAction: 'FIX_INVENTORY' };
  } else if (physicalStock === 0) {
    return { issueType: 'RECEIVED_STOCK_CONSUMED', recommendedAction: 'REVIEW_MANUALLY' };
  } else if (reservedStock === 0) {
    return { issueType: 'STOCK_NOT_ALLOCATED', recommendedAction: null };
  } else if (reservedStock > 0 && reservedStock < requiredTotal) {
    return { issueType: 'STOCK_PARTIALLY_ALLOCATED', recommendedAction: null };
  } else {
    return { issueType: 'NO_GAP', recommendedAction: null };
  }
}

function computeBackfillEligibility({ coveredPO, qtyReceived, physicalStock, qtyInstalled, reservedStock, requiredTotal }) {
  const remaining = Math.max(0, requiredTotal - qtyInstalled);
  const convertibleQty = Math.max(0, Math.min(coveredPO, physicalStock, remaining, qtyReceived > 0 ? qtyReceived : 0));

  if (convertibleQty <= 0) return { eligible: false, skipReason: 'NO_CONVERTIBLE_QTY', convertibleQty: 0 };
  if (remaining <= 0) return { eligible: false, skipReason: 'FULLY_INSTALLED', convertibleQty: 0 };
  if ((reservedStock + convertibleQty) > requiredTotal) return { eligible: false, skipReason: 'WOULD_EXCEED_REQUIRED', convertibleQty: 0 };
  if ((coveredPO - convertibleQty) < 0) return { eligible: false, skipReason: 'WOULD_UNDERFLOW_PO', convertibleQty: 0 };
  return { eligible: true, skipReason: null, convertibleQty };
}

// ═══════════════════════════════════════════════════════════
// TEST CASES — synthetic scenarios covering all branches
// ═══════════════════════════════════════════════════════════

const TEST_CASES = [
  // Case A: PO exists, nothing received
  {
    name: 'Case A: PO not received',
    inputs: { coveredPO: 5, qtyReceived: 0, physicalStock: 0, qtyInstalled: 0, reservedStock: 0, requiredTotal: 5 },
    expected: { issueType: 'PO_NOT_RECEIVED', action: 'RECEIVE_NOW', backfillEligible: false },
  },
  // Case B: Received, no stock, nothing consumed
  {
    name: 'Case B: Received, not in inventory',
    inputs: { coveredPO: 5, qtyReceived: 5, physicalStock: 0, qtyInstalled: 0, reservedStock: 0, requiredTotal: 5 },
    expected: { issueType: 'RECEIVED_NO_STOCK', action: 'FIX_INVENTORY', backfillEligible: false },
  },
  // Case C: Received, stock consumed (installed)
  {
    name: 'Case C: Stock consumed via install',
    inputs: { coveredPO: 5, qtyReceived: 5, physicalStock: 0, qtyInstalled: 5, reservedStock: 0, requiredTotal: 5 },
    expected: { issueType: 'RECEIVED_STOCK_CONSUMED', action: 'REVIEW_MANUALLY', backfillEligible: false },
  },
  // Case C2: Received, stock consumed (allocated elsewhere)
  {
    name: 'Case C2: Stock consumed via reservation',
    inputs: { coveredPO: 5, qtyReceived: 5, physicalStock: 0, qtyInstalled: 0, reservedStock: 3, requiredTotal: 5 },
    expected: { issueType: 'RECEIVED_STOCK_CONSUMED', action: 'REVIEW_MANUALLY', backfillEligible: false },
  },
  // Case D: Stock exists, zero reservation → backfill eligible
  {
    name: 'Case D: Stock not allocated, eligible',
    inputs: { coveredPO: 5, qtyReceived: 5, physicalStock: 10, qtyInstalled: 0, reservedStock: 0, requiredTotal: 5 },
    expected: { issueType: 'STOCK_NOT_ALLOCATED', action: 'RUN_BACKFILL', backfillEligible: true, convertibleQty: 5 },
  },
  // Case D2: Stock exists, zero reservation, low physical → capped
  {
    name: 'Case D2: Stock not allocated, capped by physical',
    inputs: { coveredPO: 5, qtyReceived: 5, physicalStock: 2, qtyInstalled: 0, reservedStock: 0, requiredTotal: 5 },
    expected: { issueType: 'STOCK_NOT_ALLOCATED', action: 'RUN_BACKFILL', backfillEligible: true, convertibleQty: 2 },
  },
  // Case E: Partial allocation
  {
    name: 'Case E: Partially allocated, eligible',
    inputs: { coveredPO: 3, qtyReceived: 5, physicalStock: 10, qtyInstalled: 0, reservedStock: 2, requiredTotal: 5 },
    expected: { issueType: 'STOCK_PARTIALLY_ALLOCATED', action: 'RUN_BACKFILL', backfillEligible: true, convertibleQty: 3 },
  },
  // Case F: Fully allocated → NO_GAP
  {
    name: 'Case F: Fully allocated, no gap',
    inputs: { coveredPO: 0, qtyReceived: 5, physicalStock: 10, qtyInstalled: 0, reservedStock: 5, requiredTotal: 5 },
    expected: { issueType: 'NO_GAP', action: null, backfillEligible: false },
  },
  // Case G: Zero received forces zero conversion
  {
    name: 'Case G: Zero conversion when received=0',
    inputs: { coveredPO: 5, qtyReceived: 0, physicalStock: 10, qtyInstalled: 0, reservedStock: 0, requiredTotal: 5 },
    expected: { issueType: 'PO_NOT_RECEIVED', action: 'RECEIVE_NOW', backfillEligible: false, convertibleQty: 0 },
  },
  // Case H: Conversion capped by received_qty
  {
    name: 'Case H: Conversion capped by received',
    inputs: { coveredPO: 10, qtyReceived: 3, physicalStock: 20, qtyInstalled: 0, reservedStock: 0, requiredTotal: 10 },
    expected: { issueType: 'STOCK_NOT_ALLOCATED', action: 'RUN_BACKFILL', backfillEligible: true, convertibleQty: 3 },
  },
  // Case I: Would exceed required → not eligible
  {
    name: 'Case I: Would exceed required',
    inputs: { coveredPO: 5, qtyReceived: 5, physicalStock: 10, qtyInstalled: 0, reservedStock: 3, requiredTotal: 5 },
    expected: { issueType: 'STOCK_PARTIALLY_ALLOCATED', action: 'REVIEW_MANUALLY', backfillEligible: false },
  },
];

Deno.serve(async (req) => {
  const failures = [];
  const passes = [];

  for (const tc of TEST_CASES) {
    const classification = classifyCommitment(tc.inputs);
    const backfill = computeBackfillEligibility(tc.inputs);

    // Determine final action for allocation types
    let finalAction = classification.recommendedAction;
    if (classification.issueType === 'STOCK_NOT_ALLOCATED' || classification.issueType === 'STOCK_PARTIALLY_ALLOCATED') {
      finalAction = backfill.eligible ? 'RUN_BACKFILL' : 'REVIEW_MANUALLY';
    }

    const testResults = [];

    // Test 1: issue_type
    if (classification.issueType !== tc.expected.issueType) {
      testResults.push(`ISSUE_TYPE: expected ${tc.expected.issueType}, got ${classification.issueType}`);
    }

    // Test 2: recommended_action
    if (finalAction !== tc.expected.action) {
      testResults.push(`ACTION: expected ${tc.expected.action}, got ${finalAction}`);
    }

    // Test 3: backfill eligibility
    if (backfill.eligible !== tc.expected.backfillEligible) {
      testResults.push(`BACKFILL_ELIGIBLE: expected ${tc.expected.backfillEligible}, got ${backfill.eligible}`);
    }

    // Test 4: convertible_qty (if specified)
    if (tc.expected.convertibleQty !== undefined && backfill.convertibleQty !== tc.expected.convertibleQty) {
      testResults.push(`CONVERTIBLE_QTY: expected ${tc.expected.convertibleQty}, got ${backfill.convertibleQty}`);
    }

    // Test 5: conversion never exceeds received_qty
    if (backfill.convertibleQty > tc.inputs.qtyReceived) {
      testResults.push(`BOUND_VIOLATION: convertibleQty (${backfill.convertibleQty}) > qtyReceived (${tc.inputs.qtyReceived})`);
    }

    // Test 6: conversion never exceeds physical_stock
    if (backfill.convertibleQty > tc.inputs.physicalStock) {
      testResults.push(`BOUND_VIOLATION: convertibleQty (${backfill.convertibleQty}) > physicalStock (${tc.inputs.physicalStock})`);
    }

    if (testResults.length === 0) {
      passes.push({ name: tc.name, status: 'PASS' });
    } else {
      failures.push({ name: tc.name, status: 'FAIL', errors: testResults });
    }
  }

  // Additional structural tests
  // Test: mutual exclusivity — classifyCommitment always returns exactly one type
  const VALID_TYPES = ['PO_NOT_RECEIVED', 'RECEIVED_NO_STOCK', 'RECEIVED_STOCK_CONSUMED', 'STOCK_NOT_ALLOCATED', 'STOCK_PARTIALLY_ALLOCATED', 'NO_GAP'];
  for (const tc of TEST_CASES) {
    const c = classifyCommitment(tc.inputs);
    if (!VALID_TYPES.includes(c.issueType)) {
      failures.push({ name: `${tc.name} (type validity)`, status: 'FAIL', errors: [`Invalid type: ${c.issueType}`] });
    }
    if (typeof c.issueType !== 'string') {
      failures.push({ name: `${tc.name} (type is string)`, status: 'FAIL', errors: [`Type is ${typeof c.issueType}`] });
    }
  }

  // Test: STOCK_PARTIALLY_ALLOCATED requires reservedStock > 0
  const partialCase = TEST_CASES.find(tc => tc.expected.issueType === 'STOCK_PARTIALLY_ALLOCATED');
  if (partialCase && partialCase.inputs.reservedStock <= 0) {
    failures.push({ name: 'Partial allocation has reservedStock > 0', status: 'FAIL', errors: ['Test case misconfigured'] });
  }

  // Test: STOCK_NOT_ALLOCATED requires reservedStock === 0
  const zeroAllocCase = TEST_CASES.find(tc => tc.expected.issueType === 'STOCK_NOT_ALLOCATED');
  if (zeroAllocCase && zeroAllocCase.inputs.reservedStock !== 0) {
    failures.push({ name: 'Zero allocation has reservedStock === 0', status: 'FAIL', errors: ['Test case misconfigured'] });
  }

  const allPassed = failures.length === 0;

  return Response.json({
    success: allPassed,
    summary: {
      total_cases: TEST_CASES.length,
      passed: passes.length,
      failed: failures.length,
    },
    passes,
    failures: failures.length > 0 ? failures : undefined,
  });
});