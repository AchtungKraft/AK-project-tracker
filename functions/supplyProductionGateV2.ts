import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SUPPLY PRODUCTION GATE V2
 * Final validation before allowing mutations
 * Returns detailed pass/fail status with blocking rules
 * 
 * INCLUDES: pricingSemanticGate for cost/retail contamination detection
 */

// Inline integrity audit to avoid cross-function call issues
async function runIntegrityAudit(base44) {
  const [parts, commitments, pools, allocations, charges, installedParts, lineItems, vendors] = await Promise.all([
    base44.asServiceRole.entities.Part.list(),
    base44.asServiceRole.entities.PartCommitment.list(),
    base44.asServiceRole.entities.BillingPool.list(),
    base44.asServiceRole.entities.PoolAllocation.list(),
    base44.asServiceRole.entities.PoolCharge.list(),
    base44.asServiceRole.entities.InstalledPart.list(),
    base44.asServiceRole.entities.PartPurchaseLineItem.list(),
    base44.asServiceRole.entities.Vendor.list()
  ]);

  const partsMap = new Map(parts.map(p => [p.id, p]));
  const poolsMap = new Map(pools.map(p => [p.id, p]));
  const commitmentsMap = new Map(commitments.map(c => [c.id, c]));
  const vendorsMap = new Map(vendors.map(v => [v.id, v]));

  const audit = {
    pricingIntegrity: { status: 'PASS', violations: [] },
    commitmentTotalsIntegrity: { status: 'PASS', violations: [] },
    poolIntegrity: { status: 'PASS', violations: [] },
    lifecycleIntegrity: { status: 'PASS', violations: [] },
    orphanIntegrity: { status: 'PASS', violations: [] },
    pricingSemanticIntegrity: { status: 'PASS', violations: [], metrics: {} }
  };

  // ========================================
  // PRICING SEMANTIC GATE (NEW)
  // ========================================
  const pricingMetrics = {
    cost_equals_retail_parts: [],
    commitments_with_zero_retail: [],
    commitments_missing_cost_reference: [],
    invalid_line_item_cost_source: [],
    parts_needing_manual_review: []
  };

  // Check parts for cost=retail contamination
  for (const part of parts) {
    // Skip archived/inactive parts
    if (part.is_archived || !part.is_active) continue;
    
    // cost_equals_retail_parts: cost === retail AND retail > 0 AND NOT verified
    if (part.default_cost && part.default_retail &&
        Math.abs(part.default_cost - part.default_retail) < 0.01 &&
        part.default_retail > 0 &&
        part.is_cost_verified !== true) {
      pricingMetrics.cost_equals_retail_parts.push({
        part_id: part.id,
        part_name: part.part_name,
        cost: part.default_cost,
        retail: part.default_retail
      });
    }

    // Track parts needing manual review
    if (part.needs_manual_cost_review) {
      pricingMetrics.parts_needing_manual_review.push({
        part_id: part.id,
        part_name: part.part_name
      });
    }
  }

  // Check commitments
  for (const commitment of commitments) {
    if (commitment.commitment_status === 'cancelled') continue;

    const part = partsMap.get(commitment.part_id);

    // commitments_with_zero_retail: qty_committed > 0 AND planned_retail_total <= 0
    if ((commitment.qty_committed || 0) > 0 && 
        (commitment.planned_retail_total === null || 
         commitment.planned_retail_total === undefined || 
         commitment.planned_retail_total <= 0)) {
      pricingMetrics.commitments_with_zero_retail.push({
        commitment_id: commitment.id,
        project_id: commitment.project_id,
        part_name: part?.part_name,
        qty_committed: commitment.qty_committed,
        planned_retail_total: commitment.planned_retail_total
      });
    }

    // commitments_missing_cost_reference: qty_committed > 0 AND part has no cost
    if ((commitment.qty_committed || 0) > 0 && 
        (part?.default_cost === null || part?.default_cost === undefined)) {
      pricingMetrics.commitments_missing_cost_reference.push({
        commitment_id: commitment.id,
        project_id: commitment.project_id,
        part_id: commitment.part_id,
        part_name: part?.part_name
      });
    }
  }

  // Check line items for cost source validity
  for (const lineItem of lineItems) {
    const commitment = commitmentsMap.get(lineItem.commitment_id);
    const part = commitment ? partsMap.get(commitment.part_id) : null;

    // invalid_line_item_cost_source: unit_cost !== part.cost (with tolerance)
    if (part && lineItem.unit_price !== null && lineItem.unit_price !== undefined &&
        part.default_cost !== null && part.default_cost !== undefined) {
      // Only flag if significant mismatch (> $0.01 difference)
      if (Math.abs(lineItem.unit_price - part.default_cost) > 0.01) {
        pricingMetrics.invalid_line_item_cost_source.push({
          line_item_id: lineItem.id,
          part_id: part.id,
          part_name: part.part_name,
          line_unit_cost: lineItem.unit_price,
          part_cost: part.default_cost,
          diff: lineItem.unit_price - part.default_cost
        });
      }
    }
  }

  // Determine pricing semantic status
  audit.pricingSemanticIntegrity.metrics = {
    cost_equals_retail_count: pricingMetrics.cost_equals_retail_parts.length,
    zero_retail_commitments_count: pricingMetrics.commitments_with_zero_retail.length,
    missing_cost_reference_count: pricingMetrics.commitments_missing_cost_reference.length,
    invalid_line_item_cost_count: pricingMetrics.invalid_line_item_cost_source.length,
    parts_needing_manual_review_count: pricingMetrics.parts_needing_manual_review.length
  };

  // FAIL conditions (blocking)
  if (pricingMetrics.commitments_missing_cost_reference.length > 0) {
    audit.pricingSemanticIntegrity.status = 'FAIL';
    audit.pricingSemanticIntegrity.violations.push({
      type: 'commitments_missing_cost_reference',
      count: pricingMetrics.commitments_missing_cost_reference.length,
      sample: pricingMetrics.commitments_missing_cost_reference.slice(0, 5)
    });
  }

  if (pricingMetrics.invalid_line_item_cost_source.length > 0) {
    audit.pricingSemanticIntegrity.status = 'FAIL';
    audit.pricingSemanticIntegrity.violations.push({
      type: 'invalid_line_item_cost_source',
      count: pricingMetrics.invalid_line_item_cost_source.length,
      sample: pricingMetrics.invalid_line_item_cost_source.slice(0, 5)
    });
  }

  // WARN conditions (non-blocking)
  if (audit.pricingSemanticIntegrity.status !== 'FAIL') {
    if (pricingMetrics.cost_equals_retail_parts.length > 0) {
      audit.pricingSemanticIntegrity.status = 'WARN';
      audit.pricingSemanticIntegrity.violations.push({
        type: 'cost_equals_retail_parts',
        count: pricingMetrics.cost_equals_retail_parts.length,
        sample: pricingMetrics.cost_equals_retail_parts.slice(0, 5)
      });
    }

    if (pricingMetrics.commitments_with_zero_retail.length > 0) {
      audit.pricingSemanticIntegrity.status = 'WARN';
      audit.pricingSemanticIntegrity.violations.push({
        type: 'commitments_with_zero_retail',
        count: pricingMetrics.commitments_with_zero_retail.length,
        sample: pricingMetrics.commitments_with_zero_retail.slice(0, 5)
      });
    }
  }

  // ========================================
  // EXISTING INTEGRITY CHECKS
  // ========================================

  // Pricing (basic)
  for (const part of parts) {
    if (part.is_archived || !part.is_active) continue;
    if (part.default_cost === null || part.default_cost === undefined) {
      audit.pricingIntegrity.violations.push({ type: 'part_missing_cost', part_id: part.id });
    }
  }
  if (audit.pricingIntegrity.violations.length > 0) audit.pricingIntegrity.status = 'FAIL';

  // Allocations lookup
  const allocationsByCommitment = new Map();
  for (const alloc of allocations) {
    if (alloc.is_reversed) continue;
    const existing = allocationsByCommitment.get(alloc.commitment_id) || [];
    existing.push(alloc);
    allocationsByCommitment.set(alloc.commitment_id, existing);
  }

  // Commitment totals & lifecycle
  for (const commitment of commitments) {
    if (commitment.commitment_status === 'cancelled') continue;
    
    const commitmentAllocations = allocationsByCommitment.get(commitment.id) || [];
    const calculatedCovered = commitmentAllocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);
    
    if (Math.abs((commitment.covered_retail_total || 0) - calculatedCovered) > 1) {
      audit.commitmentTotalsIntegrity.violations.push({ type: 'covered_mismatch', commitment_id: commitment.id });
    }

    const committed = commitment.qty_committed || 0;
    const ordered = commitment.qty_ordered || 0;
    const received = commitment.qty_received || 0;
    const installed = commitment.qty_installed || 0;

    if (installed > received) audit.lifecycleIntegrity.violations.push({ type: 'installed>received', commitment_id: commitment.id });
    if (received > ordered) audit.lifecycleIntegrity.violations.push({ type: 'received>ordered', commitment_id: commitment.id });
    if (ordered > committed) audit.lifecycleIntegrity.violations.push({ type: 'ordered>committed', commitment_id: commitment.id });
  }
  if (audit.commitmentTotalsIntegrity.violations.length > 0) audit.commitmentTotalsIntegrity.status = 'FAIL';
  if (audit.lifecycleIntegrity.violations.length > 0) audit.lifecycleIntegrity.status = 'FAIL';

  // Pool balance
  for (const pool of pools) {
    const poolAllocations = allocations.filter(a => a.pool_id === pool.id && !a.is_reversed);
    const calculatedAllocated = poolAllocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);
    const poolCharges = charges.filter(c => c.pool_id === pool.id && !c.is_reversed);
    const calculatedCharges = poolCharges.reduce((sum, c) => sum + (c.amount || 0), 0);
    const paidAmount = pool.paid_amount || pool.invoiced_amount || 0;
    const expectedBalance = paidAmount - calculatedAllocated - calculatedCharges;

    if (Math.abs((pool.balance || 0) - expectedBalance) > 1) {
      audit.poolIntegrity.violations.push({ type: 'balance_mismatch', pool_id: pool.id });
    }
  }
  if (audit.poolIntegrity.violations.length > 0) audit.poolIntegrity.status = 'FAIL';

  // Orphans
  for (const alloc of allocations) {
    if (!poolsMap.has(alloc.pool_id)) audit.orphanIntegrity.violations.push({ type: 'invalid_pool', id: alloc.id });
    if (!commitmentsMap.has(alloc.commitment_id)) audit.orphanIntegrity.violations.push({ type: 'invalid_commitment', id: alloc.id });
  }
  if (audit.orphanIntegrity.violations.length > 0) audit.orphanIntegrity.status = 'FAIL';

  return audit;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Run inline integrity audit
    const audit = await runIntegrityAudit(base44);
    
    // Build gate result
    const gates = {
      timestamp: new Date().toISOString(),
      
      // Gate 1: Pricing must be valid
      pricingGate: {
        description: 'All parts must have valid cost, all commitments must have valid pricing',
        status: audit.pricingIntegrity.status,
        violations_count: audit.pricingIntegrity.violations.length,
        blocking: audit.pricingIntegrity.status === 'FAIL'
      },
      
      // Gate 2: Pricing Semantic Gate (NEW)
      pricingSemanticGate: {
        description: 'Cost and retail must be semantically independent - no contamination',
        status: audit.pricingSemanticIntegrity.status,
        metrics: audit.pricingSemanticIntegrity.metrics,
        violations: audit.pricingSemanticIntegrity.violations,
        blocking: audit.pricingSemanticIntegrity.status === 'FAIL'
      },
      
      // Gate 3: Commitment totals must match
      totalsGate: {
        description: 'Commitment financial totals must be derived correctly',
        status: audit.commitmentTotalsIntegrity.status,
        violations_count: audit.commitmentTotalsIntegrity.violations.length,
        blocking: audit.commitmentTotalsIntegrity.status === 'FAIL'
      },
      
      // Gate 4: Pool balances must be correct
      poolGate: {
        description: 'Pool balances must equal paid - allocated - charges',
        status: audit.poolIntegrity.status,
        violations_count: audit.poolIntegrity.violations.length,
        blocking: audit.poolIntegrity.status === 'FAIL'
      },
      
      // Gate 5: Lifecycle quantities must be valid
      lifecycleGate: {
        description: 'Quantity chain: installed ≤ received ≤ ordered ≤ committed',
        status: audit.lifecycleIntegrity.status,
        violations_count: audit.lifecycleIntegrity.violations.length,
        blocking: audit.lifecycleIntegrity.status === 'FAIL'
      },
      
      // Gate 6: No orphan references
      orphanGate: {
        description: 'All references must point to valid entities',
        status: audit.orphanIntegrity.status,
        violations_count: audit.orphanIntegrity.violations.length,
        blocking: audit.orphanIntegrity.status === 'FAIL'
      }
    };

    // Determine overall status
    const blocking_gates = Object.entries(gates)
      .filter(([key, gate]) => gate.blocking)
      .map(([key]) => key);
    
    const warning_gates = Object.entries(gates)
      .filter(([key, gate]) => gate.status === 'WARN' && !gate.blocking)
      .map(([key]) => key);
    
    const all_passed = blocking_gates.length === 0;
    
    // Generate recommendations
    const recommendations = [];
    
    if (gates.pricingGate.blocking) {
      recommendations.push({
        priority: 1,
        action: 'Run normalizeSupplyData with dry_run=true to preview fixes',
        command: "base44.functions.invoke('normalizeSupplyData', { dry_run: true })"
      });
    }
    
    if (gates.pricingSemanticGate.blocking) {
      recommendations.push({
        priority: 1,
        action: 'Critical pricing contamination detected - run repair',
        command: "base44.functions.invoke('normalizeSupplyData', { dry_run: false, repair_pricing_semantics: true })"
      });
    }
    
    if (gates.pricingSemanticGate.status === 'WARN') {
      recommendations.push({
        priority: 3,
        action: 'Potential cost/retail contamination - review flagged parts',
        command: "base44.functions.invoke('verifyLegacyPricingIntegrity', { limit: 50 })"
      });
    }
    
    if (gates.totalsGate.blocking) {
      recommendations.push({
        priority: 2,
        action: 'Commitment totals are out of sync - normalization required',
        command: "base44.functions.invoke('normalizeSupplyData', { dry_run: false })"
      });
    }
    
    if (gates.poolGate.blocking) {
      recommendations.push({
        priority: 3,
        action: 'Pool balances need reconciliation',
        command: "base44.functions.invoke('normalizeSupplyData', { dry_run: false })"
      });
    }
    
    if (gates.lifecycleGate.blocking) {
      recommendations.push({
        priority: 4,
        action: 'Lifecycle quantities are invalid - needs correction',
        command: "base44.functions.invoke('normalizeSupplyData', { dry_run: false })"
      });
    }
    
    if (gates.orphanGate.blocking) {
      recommendations.push({
        priority: 5,
        action: 'Orphan records detected - manual review required',
        manual: true
      });
    }

    return Response.json({
      success: true,
      gate_status: all_passed ? (warning_gates.length > 0 ? 'WARN' : 'PASS') : 'FAIL',
      execution_surface_ready: all_passed,
      
      gates,
      blocking_gates,
      warning_gates,
      
      recommendations: recommendations.sort((a, b) => a.priority - b.priority),
      
      summary: {
        total_gates: 6,
        passed: Object.values(gates).filter(g => g.status === 'PASS').length,
        warned: Object.values(gates).filter(g => g.status === 'WARN').length,
        failed: blocking_gates.length,
        message: all_passed 
          ? (warning_gates.length > 0 
              ? `All gates passed with ${warning_gates.length} warning(s). Review recommended.`
              : 'All gates passed. Execution surface is ready for mutations.')
          : `${blocking_gates.length} gate(s) failed. Run normalizeSupplyData to repair data.`
      },
      
      // Include raw audit for debugging
      raw_audit_summary: audit.summary
    });

  } catch (error) {
    console.error('Production gate error:', error);
    return Response.json({ 
      success: false,
      gate_status: 'ERROR',
      error: error.message 
    }, { status: 500 });
  }
});