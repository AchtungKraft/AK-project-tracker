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
  // PRICING SEMANTIC GATE (V2 - Cost vs Retail Independence)
  // ========================================
  const pricingMetrics = {
    cost_equals_retail_parts: [],
    commitments_missing_cost_snapshot: [],
    commitments_missing_retail_snapshot: [],
    commitments_with_zero_retail: [],
    commitments_missing_cost_reference: [],
    invalid_line_item_cost_source: [],
    parts_needing_manual_review: [],
    line_items_cost_equals_retail: []
  };

  // Helper to get effective values
  const getCostEffective = (part) => part.cost || part.default_cost || 0;
  const getRetailEffective = (part) => part.retail_override || part.retail_matrix_price || part.default_retail || 0;

  // Check parts for cost=retail contamination
  for (const part of parts) {
    if (part.is_archived || !part.is_active) continue;
    
    const cost = getCostEffective(part);
    const retail = getRetailEffective(part);
    
    // cost_equals_retail_parts: cost === retail AND retail > 0 AND NOT verified
    if (cost > 10 && retail > 0 &&
        Math.abs(cost - retail) < 0.01 &&
        part.is_cost_verified !== true) {
      pricingMetrics.cost_equals_retail_parts.push({
        part_id: part.id,
        part_name: part.part_name,
        cost: cost,
        retail: retail
      });
    }

    // Track parts needing manual review
    if (part.needs_cost_review) {
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
    const qty = commitment.qty_committed || 0;

    // commitments_missing_cost_snapshot: qty > 0 AND snapshot null/0
    if (qty > 0 && (!commitment.unit_cost_snapshot || commitment.unit_cost_snapshot <= 0)) {
      pricingMetrics.commitments_missing_cost_snapshot.push({
        commitment_id: commitment.id,
        project_id: commitment.project_id,
        part_name: part?.part_name,
        qty_committed: qty
      });
    }

    // commitments_missing_retail_snapshot: qty > 0 AND snapshot null/0
    if (qty > 0 && (!commitment.unit_retail_snapshot || commitment.unit_retail_snapshot <= 0)) {
      pricingMetrics.commitments_missing_retail_snapshot.push({
        commitment_id: commitment.id,
        project_id: commitment.project_id,
        part_name: part?.part_name,
        qty_committed: qty
      });
    }

    // commitments_with_zero_retail: qty > 0 AND planned_retail_total <= 0
    if (qty > 0 && 
        (commitment.planned_retail_total === null || 
         commitment.planned_retail_total === undefined || 
         commitment.planned_retail_total <= 0)) {
      pricingMetrics.commitments_with_zero_retail.push({
        commitment_id: commitment.id,
        project_id: commitment.project_id,
        part_name: part?.part_name,
        qty_committed: qty,
        planned_retail_total: commitment.planned_retail_total
      });
    }

    // commitments_missing_cost_reference: part has no cost at all
    if (qty > 0 && part) {
      const partCost = getCostEffective(part);
      if (partCost <= 0) {
        pricingMetrics.commitments_missing_cost_reference.push({
          commitment_id: commitment.id,
          project_id: commitment.project_id,
          part_id: commitment.part_id,
          part_name: part?.part_name
        });
      }
    }
  }

  // Track legacy line item status
  pricingMetrics.legacy_line_items_unlinked = [];
  pricingMetrics.extended_cost_mismatch = [];

  // Check line items for cost source validity
  for (const lineItem of lineItems) {
    const commitment = commitmentsMap.get(lineItem.commitment_id);
    const part = commitment ? partsMap.get(commitment.part_id) : partsMap.get(lineItem.part_id);

    const lineCost = lineItem.unit_cost || lineItem.unit_price || 0;

    // FAIL CONDITION: line item with commitment_id where unit_cost != commitment.unit_cost_snapshot
    // Only check if commitment_id is set (legacy items may not have it)
    if (lineItem.commitment_id && commitment && commitment.unit_cost_snapshot > 0 && lineCost > 0) {
      if (Math.abs(lineCost - commitment.unit_cost_snapshot) > 0.01) {
        pricingMetrics.invalid_line_item_cost_source.push({
          line_item_id: lineItem.id,
          commitment_id: commitment.id,
          part_name: part?.part_name,
          line_unit_cost: lineCost,
          commitment_cost_snapshot: commitment.unit_cost_snapshot,
          diff: lineCost - commitment.unit_cost_snapshot
        });
      }
      
      // FAIL CONDITION: extended_cost != unit_cost * qty
      const expectedExtended = commitment.unit_cost_snapshot * (lineItem.qty_ordered || 1);
      if (Math.abs((lineItem.extended_cost || 0) - expectedExtended) > 0.01) {
        pricingMetrics.extended_cost_mismatch.push({
          line_item_id: lineItem.id,
          commitment_id: commitment.id,
          part_name: part?.part_name,
          expected_extended: expectedExtended,
          actual_extended: lineItem.extended_cost
        });
      }
    }

    // WARN: line items with legacy_link_status != 'linked'
    if (lineItem.is_legacy && lineItem.legacy_link_status !== 'linked') {
      pricingMetrics.legacy_line_items_unlinked.push({
        line_item_id: lineItem.id,
        part_name: part?.part_name,
        legacy_link_status: lineItem.legacy_link_status,
        legacy_reason: lineItem.legacy_reason
      });
    }

    // WARN: line_items_cost_equals_retail (can happen legitimately)
    if (part && lineCost > 10) {
      const partRetail = getRetailEffective(part);
      if (partRetail > 0 && Math.abs(lineCost - partRetail) < 0.01) {
        pricingMetrics.line_items_cost_equals_retail.push({
          line_item_id: lineItem.id,
          part_name: part?.part_name,
          line_cost: lineCost,
          part_retail: partRetail
        });
      }
    }
  }

  // Determine pricing semantic status
  audit.pricingSemanticIntegrity.metrics = {
    cost_equals_retail_count: pricingMetrics.cost_equals_retail_parts.length,
    missing_cost_snapshot_count: pricingMetrics.commitments_missing_cost_snapshot.length,
    missing_retail_snapshot_count: pricingMetrics.commitments_missing_retail_snapshot.length,
    zero_retail_commitments_count: pricingMetrics.commitments_with_zero_retail.length,
    missing_cost_reference_count: pricingMetrics.commitments_missing_cost_reference.length,
    invalid_line_item_cost_count: pricingMetrics.invalid_line_item_cost_source.length,
    extended_cost_mismatch_count: pricingMetrics.extended_cost_mismatch.length,
    line_items_cost_equals_retail_count: pricingMetrics.line_items_cost_equals_retail.length,
    legacy_line_items_unlinked_count: pricingMetrics.legacy_line_items_unlinked.length,
    parts_needing_manual_review_count: pricingMetrics.parts_needing_manual_review.length
  };

  // ========================================
  // FAIL conditions (blocking) - TIGHTENED SEMANTICS
  // ========================================
  
  // FAIL: Commitment missing cost snapshot when qty_committed > 0
  if (pricingMetrics.commitments_missing_cost_snapshot.length > 0) {
    audit.pricingSemanticIntegrity.status = 'FAIL';
    audit.pricingSemanticIntegrity.violations.push({
      type: 'commitments_missing_cost_snapshot',
      count: pricingMetrics.commitments_missing_cost_snapshot.length,
      sample: pricingMetrics.commitments_missing_cost_snapshot.slice(0, 5),
      severity: 'BLOCKING'
    });
  }

  // FAIL: Commitment missing retail snapshot when qty_committed > 0
  if (pricingMetrics.commitments_missing_retail_snapshot.length > 0) {
    audit.pricingSemanticIntegrity.status = 'FAIL';
    audit.pricingSemanticIntegrity.violations.push({
      type: 'commitments_missing_retail_snapshot',
      count: pricingMetrics.commitments_missing_retail_snapshot.length,
      sample: pricingMetrics.commitments_missing_retail_snapshot.slice(0, 5),
      severity: 'BLOCKING'
    });
  }

  // FAIL: PO line item unit_cost mismatches commitment.unit_cost_snapshot (authoritative)
  // Only for line items that HAVE a commitment_id
  if (pricingMetrics.invalid_line_item_cost_source.length > 0) {
    audit.pricingSemanticIntegrity.status = 'FAIL';
    audit.pricingSemanticIntegrity.violations.push({
      type: 'line_item_cost_mismatch_commitment_snapshot',
      description: 'PO line item unit_cost does not match commitment.unit_cost_snapshot',
      count: pricingMetrics.invalid_line_item_cost_source.length,
      sample: pricingMetrics.invalid_line_item_cost_source.slice(0, 5),
      severity: 'BLOCKING',
      repair_action: "base44.functions.invoke('repairLineItemCostFromCommitments', { dry_run: false })"
    });
  }

  // FAIL: PO line item extended_cost mismatches unit_cost * qty
  if (pricingMetrics.extended_cost_mismatch.length > 0) {
    audit.pricingSemanticIntegrity.status = 'FAIL';
    audit.pricingSemanticIntegrity.violations.push({
      type: 'line_item_extended_cost_mismatch',
      description: 'PO line item extended_cost does not match unit_cost * qty_ordered',
      count: pricingMetrics.extended_cost_mismatch.length,
      sample: pricingMetrics.extended_cost_mismatch.slice(0, 5),
      severity: 'BLOCKING',
      repair_action: "base44.functions.invoke('repairLineItemCostFromCommitments', { dry_run: false })"
    });
  }

  // ========================================
  // WARN conditions (non-blocking)
  // ========================================
  
  // WARN: line_items_cost_equals_retail - NOT a fail, can happen legitimately
  if (pricingMetrics.line_items_cost_equals_retail.length > 0 && audit.pricingSemanticIntegrity.status !== 'FAIL') {
    audit.pricingSemanticIntegrity.status = 'WARN';
    audit.pricingSemanticIntegrity.violations.push({
      type: 'line_items_cost_equals_retail',
      description: 'Line item cost equals part retail - may be legitimate if Part.cost == Part.retail',
      count: pricingMetrics.line_items_cost_equals_retail.length,
      sample: pricingMetrics.line_items_cost_equals_retail.slice(0, 5),
      severity: 'WARNING',
      note: 'Review if Part.is_cost_verified=false for these parts'
    });
  }

  // WARN: Part cost equals retail (only if not verified)
  if (pricingMetrics.cost_equals_retail_parts.length > 0 && audit.pricingSemanticIntegrity.status !== 'FAIL') {
    audit.pricingSemanticIntegrity.status = 'WARN';
    audit.pricingSemanticIntegrity.violations.push({
      type: 'cost_equals_retail_parts',
      description: 'Part cost equals retail and is_cost_verified=false',
      count: pricingMetrics.cost_equals_retail_parts.length,
      sample: pricingMetrics.cost_equals_retail_parts.slice(0, 5),
      severity: 'WARNING'
    });
  }

  // WARN: Commitments with zero retail
  if (pricingMetrics.commitments_with_zero_retail.length > 0 && audit.pricingSemanticIntegrity.status !== 'FAIL') {
    audit.pricingSemanticIntegrity.status = 'WARN';
    audit.pricingSemanticIntegrity.violations.push({
      type: 'commitments_with_zero_retail',
      count: pricingMetrics.commitments_with_zero_retail.length,
      sample: pricingMetrics.commitments_with_zero_retail.slice(0, 5),
      severity: 'WARNING'
    });
  }

  // WARN: Parts needing manual review
  if (pricingMetrics.parts_needing_manual_review.length > 0 && audit.pricingSemanticIntegrity.status !== 'FAIL') {
    audit.pricingSemanticIntegrity.status = 'WARN';
    audit.pricingSemanticIntegrity.violations.push({
      type: 'parts_needing_manual_review',
      count: pricingMetrics.parts_needing_manual_review.length,
      sample: pricingMetrics.parts_needing_manual_review.slice(0, 5),
      severity: 'WARNING'
    });
  }

  // WARN: Legacy line items not linked
  if (pricingMetrics.legacy_line_items_unlinked.length > 0 && audit.pricingSemanticIntegrity.status !== 'FAIL') {
    audit.pricingSemanticIntegrity.status = 'WARN';
    audit.pricingSemanticIntegrity.violations.push({
      type: 'legacy_line_items_unlinked',
      description: 'Legacy line items without commitment linkage',
      count: pricingMetrics.legacy_line_items_unlinked.length,
      sample: pricingMetrics.legacy_line_items_unlinked.slice(0, 5),
      severity: 'WARNING',
      repair_action: "base44.functions.invoke('migrateLegacyLineItemsToCommitments', { dry_run: false })"
    });
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
      // Check which specific violation to recommend action for
      const hasLineItemMismatch = audit.pricingSemanticIntegrity.violations.some(
        v => v.type === 'line_item_cost_mismatch_commitment_snapshot'
      );
      
      if (hasLineItemMismatch) {
        recommendations.push({
          priority: 1,
          action: 'Line item costs mismatch commitment snapshots - run repair',
          command: "base44.functions.invoke('repairLineItemCostFromCommitments', { dry_run: false })"
        });
      }
      
      recommendations.push({
        priority: 1,
        action: 'Critical pricing issues detected - run full migration',
        command: "base44.functions.invoke('migratePricingSemantics', { dry_run: false, repair_line_items: true })"
      });
    }
    
    if (gates.pricingSemanticGate.status === 'WARN') {
      recommendations.push({
        priority: 3,
        action: 'Potential cost/retail warnings - review flagged parts (non-blocking)',
        command: "base44.functions.invoke('verifyPricingSemantics', { limit: 50 })"
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