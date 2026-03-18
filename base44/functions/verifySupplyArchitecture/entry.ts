/**
 * CANONICAL SUPPLY FLOW ENFORCED
 * All project part mutations must go through CommitmentService.
 * Direct entity writes are blocked.
 * 
 * verifySupplyArchitecture - Production Gate for Supply System Integrity
 * 
 * Checks:
 * - PartProjectRequirement without corresponding PartCommitment
 * - PartPurchaseLineItem without commitment_id
 * - PartBuildAssignment created in last 30 days (should be 0)
 * - PartCommitment missing pricing snapshots
 * - PO line items where unit_cost !== commitment.unit_cost_snapshot
 * 
 * Returns gate status: PASS | WARN | FAIL
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { auto_report = false } = body;

    // Fetch all relevant data
    const [
      requirements,
      commitments,
      buildAssignments,
      lineItems,
      orders
    ] = await Promise.all([
      base44.asServiceRole.entities.PartProjectRequirement.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.PartBuildAssignment.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list(),
      base44.asServiceRole.entities.Order.list(),
    ]);

    const results = {
      timestamp: new Date().toISOString(),
      checks: {},
      violations: [],
      gate_status: 'PASS'
    };

    // Build commitment lookup
    const commitmentsByKey = {};
    commitments.forEach(c => {
      const key = `${c.project_id}:${c.part_id}`;
      if (!commitmentsByKey[key]) commitmentsByKey[key] = [];
      commitmentsByKey[key].push(c);
    });

    const commitmentById = {};
    commitments.forEach(c => { commitmentById[c.id] = c; });

    // CHECK 1: Requirements without commitments
    const orphanRequirements = requirements.filter(r => {
      if (!r.project_id) return false; // Skip general stock requirements
      const key = `${r.project_id}:${r.part_id}`;
      return !commitmentsByKey[key] || commitmentsByKey[key].length === 0;
    });

    results.checks.orphan_requirements = {
      status: orphanRequirements.length === 0 ? 'PASS' : 'WARN',
      count: orphanRequirements.length,
      sample: orphanRequirements.slice(0, 5).map(r => ({
        id: r.id,
        project_id: r.project_id,
        part_id: r.part_id,
        qty_needed: r.qty_needed
      }))
    };

    if (orphanRequirements.length > 0) {
      results.violations.push({
        type: 'ORPHAN_REQUIREMENTS',
        count: orphanRequirements.length,
        message: `${orphanRequirements.length} PartProjectRequirement records without corresponding PartCommitment`
      });
      if (results.gate_status === 'PASS') results.gate_status = 'WARN';
    }

    // CHECK 2: Line items without commitment_id (recent)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentLineItems = lineItems.filter(li => {
      const created = new Date(li.created_date);
      return created >= thirtyDaysAgo;
    });

    const lineItemsWithoutCommitment = recentLineItems.filter(li => !li.commitment_id);

    results.checks.line_items_without_commitment = {
      status: lineItemsWithoutCommitment.length === 0 ? 'PASS' : 'WARN',
      total_recent: recentLineItems.length,
      without_commitment: lineItemsWithoutCommitment.length,
      sample: lineItemsWithoutCommitment.slice(0, 5).map(li => ({
        id: li.id,
        order_id: li.order_id,
        part_id: li.part_id,
        created_date: li.created_date
      }))
    };

    if (lineItemsWithoutCommitment.length > 0) {
      results.violations.push({
        type: 'LINE_ITEMS_NO_COMMITMENT',
        count: lineItemsWithoutCommitment.length,
        message: `${lineItemsWithoutCommitment.length} recent PartPurchaseLineItem records without commitment_id`
      });
      if (results.gate_status === 'PASS') results.gate_status = 'WARN';
    }

    // CHECK 3: PartBuildAssignment created in last 30 days
    const recentBuildAssignments = buildAssignments.filter(ba => {
      const created = new Date(ba.created_date);
      return created >= thirtyDaysAgo;
    });

    results.checks.legacy_build_assignments = {
      status: recentBuildAssignments.length === 0 ? 'PASS' : 'WARN',
      total: buildAssignments.length,
      recent_30d: recentBuildAssignments.length,
      message: recentBuildAssignments.length > 0 
        ? 'PartBuildAssignment is deprecated - no new records should be created'
        : 'No recent PartBuildAssignment records (entity is properly frozen)',
      sample: recentBuildAssignments.slice(0, 5).map(ba => ({
        id: ba.id,
        project_id: ba.project_id,
        part_id: ba.part_id,
        created_date: ba.created_date
      }))
    };

    if (recentBuildAssignments.length > 0) {
      results.violations.push({
        type: 'LEGACY_BUILD_ASSIGNMENT',
        count: recentBuildAssignments.length,
        message: `${recentBuildAssignments.length} PartBuildAssignment records created in last 30 days - entity should be frozen`
      });
      if (results.gate_status === 'PASS') results.gate_status = 'WARN';
    }

    // CHECK 4: Commitments missing pricing snapshots
    const activeCommitments = commitments.filter(c => 
      c.commitment_status !== 'cancelled' && c.commitment_status !== 'closed'
    );

    const missingCostSnapshot = activeCommitments.filter(c => 
      c.unit_cost_snapshot === null || c.unit_cost_snapshot === undefined
    );

    const missingRetailSnapshot = activeCommitments.filter(c => 
      c.unit_retail_snapshot === null || c.unit_retail_snapshot === undefined
    );

    results.checks.commitment_pricing_snapshots = {
      status: (missingCostSnapshot.length === 0 && missingRetailSnapshot.length === 0) ? 'PASS' : 'WARN',
      total_active: activeCommitments.length,
      missing_cost_snapshot: missingCostSnapshot.length,
      missing_retail_snapshot: missingRetailSnapshot.length,
      sample_missing_cost: missingCostSnapshot.slice(0, 3).map(c => ({
        id: c.id,
        project_id: c.project_id,
        part_id: c.part_id
      })),
      sample_missing_retail: missingRetailSnapshot.slice(0, 3).map(c => ({
        id: c.id,
        project_id: c.project_id,
        part_id: c.part_id
      }))
    };

    if (missingCostSnapshot.length > 0 || missingRetailSnapshot.length > 0) {
      results.violations.push({
        type: 'MISSING_PRICING_SNAPSHOTS',
        missing_cost: missingCostSnapshot.length,
        missing_retail: missingRetailSnapshot.length,
        message: `Commitments missing pricing: ${missingCostSnapshot.length} cost, ${missingRetailSnapshot.length} retail`
      });
      if (results.gate_status === 'PASS') results.gate_status = 'WARN';
    }

    // CHECK 5: Line item cost mismatch with commitment snapshot
    const lineItemsWithCommitment = lineItems.filter(li => li.commitment_id);
    const costMismatches = [];

    for (const li of lineItemsWithCommitment) {
      const commitment = commitmentById[li.commitment_id];
      if (!commitment) continue;
      
      // Compare unit_cost with commitment snapshot
      const liCost = li.unit_cost ?? li.unit_price;
      const commitmentCost = commitment.unit_cost_snapshot;
      
      if (liCost !== null && commitmentCost !== null && liCost !== commitmentCost) {
        // Allow small floating point differences
        if (Math.abs(liCost - commitmentCost) > 0.01) {
          costMismatches.push({
            line_item_id: li.id,
            commitment_id: li.commitment_id,
            line_item_cost: liCost,
            commitment_snapshot: commitmentCost,
            difference: Math.abs(liCost - commitmentCost).toFixed(2)
          });
        }
      }
    }

    results.checks.line_item_cost_integrity = {
      status: costMismatches.length === 0 ? 'PASS' : 'WARN',
      total_linked_line_items: lineItemsWithCommitment.length,
      cost_mismatches: costMismatches.length,
      sample: costMismatches.slice(0, 5)
    };

    if (costMismatches.length > 0) {
      results.violations.push({
        type: 'COST_MISMATCH',
        count: costMismatches.length,
        message: `${costMismatches.length} line items have cost different from commitment snapshot`
      });
      if (results.gate_status === 'PASS') results.gate_status = 'WARN';
    }

    // Summary
    results.summary = {
      orphan_requirements_count: orphanRequirements.length,
      legacy_build_assignment_count: recentBuildAssignments.length,
      pricing_snapshot_missing_count: missingCostSnapshot.length + missingRetailSnapshot.length,
      invalid_line_item_cost_count: costMismatches.length,
      total_violations: results.violations.length
    };

    // Log if auto_report and violations exist
    if (auto_report && results.violations.length > 0) {
      console.error('SUPPLY_ARCHITECTURE_VIOLATION', JSON.stringify(results.summary));
    }

    return Response.json({
      success: true,
      gate_status: results.gate_status,
      ...results
    });

  } catch (error) {
    console.error('verifySupplyArchitecture error:', error);
    return Response.json({
      success: false,
      error: error.message,
      gate_status: 'FAIL'
    }, { status: 500 });
  }
});