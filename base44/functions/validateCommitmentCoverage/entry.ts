import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Validation Script: Ensure commitment coverage for ordered requirements
 * 
 * Checks:
 * - Every requirement with qty_ordered > 0 has matching commitment
 * - Commitment totals align with requirement totals
 * - No orphaned commitments
 * 
 * Returns report of any discrepancies.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { fix_issues = false } = await req.json().catch(() => ({}));

    // Fetch all data
    const [requirements, commitments, lineItems] = await Promise.all([
      base44.asServiceRole.entities.PartProjectRequirement.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list(),
    ]);

    const issues = [];
    const stats = {
      total_requirements: requirements.length,
      requirements_with_orders: 0,
      requirements_with_commitments: 0,
      total_commitments: commitments.length,
      orphaned_commitments: 0,
      qty_mismatches: 0,
      missing_commitments: 0,
    };

    // Build commitment lookup by requirement_id
    const commitmentsByReq = {};
    commitments.forEach(c => {
      if (c.requirement_id) {
        if (!commitmentsByReq[c.requirement_id]) {
          commitmentsByReq[c.requirement_id] = [];
        }
        commitmentsByReq[c.requirement_id].push(c);
      }
    });

    // Check each requirement
    for (const req of requirements) {
      const hasOrdering = (req.qty_ordered || 0) > 0;
      if (hasOrdering) {
        stats.requirements_with_orders++;
      }

      const reqCommitments = commitmentsByReq[req.id] || [];
      const activeCommitments = reqCommitments.filter(c => c.commitment_status !== 'cancelled');
      
      if (activeCommitments.length > 0) {
        stats.requirements_with_commitments++;

        // Check quantity alignment
        const totalCommitted = activeCommitments.reduce((s, c) => s + (c.qty_committed || 0), 0);
        const totalOrdered = activeCommitments.reduce((s, c) => s + (c.qty_ordered || 0), 0);
        const totalAllocated = activeCommitments.reduce((s, c) => s + (c.qty_allocated || 0), 0);
        const totalInstalled = activeCommitments.reduce((s, c) => s + (c.qty_installed || 0), 0);

        if (totalAllocated !== (req.qty_allocated || 0) || 
            totalOrdered !== (req.qty_ordered || 0) ||
            totalInstalled !== (req.qty_installed || 0)) {
          stats.qty_mismatches++;
          issues.push({
            type: 'qty_mismatch',
            requirement_id: req.id,
            project_id: req.project_id,
            part_id: req.part_id,
            requirement_values: {
              qty_allocated: req.qty_allocated,
              qty_ordered: req.qty_ordered,
              qty_installed: req.qty_installed,
            },
            commitment_totals: {
              qty_committed: totalCommitted,
              qty_allocated: totalAllocated,
              qty_ordered: totalOrdered,
              qty_installed: totalInstalled,
            },
            commitment_count: activeCommitments.length,
          });
        }
      } else if (hasOrdering) {
        // Requirement has orders but no commitment
        stats.missing_commitments++;
        issues.push({
          type: 'missing_commitment',
          requirement_id: req.id,
          project_id: req.project_id,
          part_id: req.part_id,
          qty_needed: req.qty_needed,
          qty_ordered: req.qty_ordered,
          qty_allocated: req.qty_allocated,
        });
      }
    }

    // Check for orphaned commitments (no valid requirement)
    const reqIds = new Set(requirements.map(r => r.id));
    for (const c of commitments) {
      if (c.requirement_id && !reqIds.has(c.requirement_id)) {
        stats.orphaned_commitments++;
        issues.push({
          type: 'orphaned_commitment',
          commitment_id: c.id,
          requirement_id: c.requirement_id,
          project_id: c.project_id,
          part_id: c.part_id,
          status: c.commitment_status,
        });
      }
    }

    // Check line item coverage
    const lineItemCoverage = [];
    for (const li of lineItems) {
      const linkedCommitments = commitments.filter(c => 
        (c.order_line_item_ids || []).includes(li.id) &&
        c.commitment_status !== 'cancelled'
      );
      
      const totalCommitted = linkedCommitments.reduce((s, c) => s + (c.qty_committed || 0), 0);
      const unassigned = (li.qty_ordered || 0) - totalCommitted;
      
      if (unassigned > 0) {
        lineItemCoverage.push({
          line_item_id: li.id,
          order_id: li.order_id,
          part_id: li.part_id,
          qty_ordered: li.qty_ordered,
          qty_committed: totalCommitted,
          qty_unassigned: unassigned,
        });
      }
    }

    return Response.json({
      success: true,
      stats,
      issues,
      line_item_coverage: lineItemCoverage,
      summary: {
        has_issues: issues.length > 0,
        issue_count: issues.length,
        coverage_percentage: stats.total_requirements > 0 
          ? Math.round((stats.requirements_with_commitments / stats.requirements_with_orders) * 100) || 100
          : 100,
      }
    });

  } catch (error) {
    console.error('Validation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});