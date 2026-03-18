import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * verifyAddToProjectCanonicalization
 * 
 * Verification function to check that:
 * 1. All PartProjectRequirements have a matching PartCommitment
 * 2. No new PartBuildAssignment records are being created
 * 3. Recently added parts have commitments
 * 4. OrderPartModal creates line items with commitment_id
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sample_size = 100 } = await req.json();
    const timestamp = new Date().toISOString();

    const report = {
      timestamp,
      overall_status: 'PASS',
      checks: {}
    };

    // Check 1: Requirements without commitments
    const requirements = await base44.asServiceRole.entities.PartProjectRequirement.filter({}, '-created_date', 500);
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({}, '-created_date', 1000);
    
    const commitmentKeys = new Set();
    for (const c of commitments) {
      if (c.commitment_status !== 'cancelled') {
        commitmentKeys.add(`${c.project_id}:${c.part_id}`);
      }
    }

    const orphanRequirements = requirements.filter(r => {
      if (!r.project_id) return false; // Skip general stock
      return !commitmentKeys.has(`${r.project_id}:${r.part_id}`);
    });

    report.checks.requirements_without_commitments = {
      status: orphanRequirements.length === 0 ? 'PASS' : 'WARN',
      total_requirements: requirements.length,
      orphan_count: orphanRequirements.length,
      sample_orphans: orphanRequirements.slice(0, 5).map(r => ({
        id: r.id,
        project_id: r.project_id,
        part_id: r.part_id
      }))
    };

    if (orphanRequirements.length > 0) {
      report.overall_status = 'WARN';
    }

    // Check 2: PartBuildAssignment usage (should be deprecated)
    let buildAssignments = [];
    try {
      buildAssignments = await base44.asServiceRole.entities.PartBuildAssignment.filter({}, '-created_date', 100);
    } catch (e) {
      // Entity might not exist
    }

    const recentBuildAssignments = buildAssignments.filter(ba => {
      const created = new Date(ba.created_date);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return created > dayAgo;
    });

    report.checks.build_assignment_usage = {
      status: recentBuildAssignments.length === 0 ? 'PASS' : 'WARN',
      total_build_assignments: buildAssignments.length,
      recent_24h_count: recentBuildAssignments.length,
      message: recentBuildAssignments.length > 0 
        ? 'Legacy PartBuildAssignment still being created - UI not fully migrated'
        : 'No recent PartBuildAssignment writes detected'
    };

    if (recentBuildAssignments.length > 0) {
      report.overall_status = 'WARN';
    }

    // Check 3: Line items without commitment_id
    const lineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({}, '-created_date', 200);
    
    // Filter to recent non-legacy line items
    const recentLineItems = lineItems.filter(li => {
      const created = new Date(li.created_date);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return created > weekAgo && !li.is_legacy;
    });

    const lineItemsWithoutCommitment = recentLineItems.filter(li => !li.commitment_id);

    report.checks.line_items_without_commitment = {
      status: lineItemsWithoutCommitment.length === 0 ? 'PASS' : 'WARN',
      recent_line_items: recentLineItems.length,
      without_commitment: lineItemsWithoutCommitment.length,
      sample: lineItemsWithoutCommitment.slice(0, 5).map(li => ({
        id: li.id,
        order_id: li.order_id,
        part_id: li.part_id,
        created_date: li.created_date
      }))
    };

    if (lineItemsWithoutCommitment.length > 0) {
      report.overall_status = 'WARN';
    }

    // Check 4: Commitments with valid pricing snapshots
    const commitmentsWithMissingSnapshots = commitments.filter(c => {
      return c.commitment_status !== 'cancelled' && 
             (!c.unit_cost_snapshot && c.unit_cost_snapshot !== 0);
    });

    report.checks.commitment_pricing_snapshots = {
      status: commitmentsWithMissingSnapshots.length === 0 ? 'PASS' : 'WARN',
      total_active_commitments: commitments.filter(c => c.commitment_status !== 'cancelled').length,
      missing_cost_snapshot: commitmentsWithMissingSnapshots.length,
      sample: commitmentsWithMissingSnapshots.slice(0, 5).map(c => ({
        id: c.id,
        project_id: c.project_id,
        part_id: c.part_id
      }))
    };

    // Check 5: Duplicate commitments (same project + part)
    const commitmentKeyCount = {};
    for (const c of commitments) {
      if (c.commitment_status === 'cancelled') continue;
      const key = `${c.project_id}:${c.part_id}`;
      commitmentKeyCount[key] = (commitmentKeyCount[key] || 0) + 1;
    }

    const duplicateKeys = Object.entries(commitmentKeyCount)
      .filter(([key, count]) => count > 1)
      .map(([key, count]) => ({ key, count }));

    report.checks.duplicate_commitments = {
      status: duplicateKeys.length === 0 ? 'PASS' : 'WARN',
      duplicate_count: duplicateKeys.length,
      duplicates: duplicateKeys.slice(0, 10)
    };

    if (duplicateKeys.length > 0) {
      report.overall_status = 'WARN';
    }

    // Summary
    const failCount = Object.values(report.checks).filter(c => c.status === 'FAIL').length;
    const warnCount = Object.values(report.checks).filter(c => c.status === 'WARN').length;

    if (failCount > 0) {
      report.overall_status = 'FAIL';
    }

    report.summary = {
      total_checks: Object.keys(report.checks).length,
      passed: Object.values(report.checks).filter(c => c.status === 'PASS').length,
      warnings: warnCount,
      failures: failCount
    };

    return Response.json({
      success: true,
      report
    });

  } catch (error) {
    console.error("Verification error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});