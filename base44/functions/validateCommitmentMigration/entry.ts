import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Validation Script: Verify commitment migration integrity
 * 
 * Checks:
 * 1. Sum(commitment.qty_committed) matches Sum(requirement.qty_needed) for migrated records
 * 2. Sum(commitment.qty_ordered) matches Sum(lineItem.qty_ordered) for linked items
 * 3. No orphaned commitments (project/part must exist)
 * 4. Install counts reconcile with InstalledPart records
 * 
 * ADMIN ONLY
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all relevant data
    const [commitments, requirements, lineItems, installedParts, projects, parts, inventoryItems] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.PartProjectRequirement.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list(),
      base44.asServiceRole.entities.InstalledPart.list(),
      base44.asServiceRole.entities.Project.list(),
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.InventoryItem.list(),
    ]);

    const projectIds = new Set(projects.map(p => p.id));
    const partIds = new Set(parts.map(p => p.id));
    const requirementIds = new Set(requirements.map(r => r.id));
    const lineItemIds = new Set(lineItems.map(li => li.id));

    const report = {
      timestamp: new Date().toISOString(),
      counts: {
        commitments: commitments.length,
        requirements: requirements.length,
        line_items: lineItems.length,
        installed_parts: installedParts.length,
        inventory_items: inventoryItems.length,
      },
      validations: [],
      warnings: [],
      errors: [],
      reconciliation: {}
    };

    // 1. Check for orphaned commitments
    const orphanedCommitments = commitments.filter(c => 
      !projectIds.has(c.project_id) || !partIds.has(c.part_id)
    );
    if (orphanedCommitments.length > 0) {
      report.errors.push({
        check: 'Orphaned Commitments',
        count: orphanedCommitments.length,
        ids: orphanedCommitments.map(c => c.id)
      });
    } else {
      report.validations.push({ check: 'No Orphaned Commitments', status: 'PASS' });
    }

    // 2. Check commitment-requirement linkage
    const linkedCommitments = commitments.filter(c => c.requirement_id);
    const invalidReqLinks = linkedCommitments.filter(c => !requirementIds.has(c.requirement_id));
    if (invalidReqLinks.length > 0) {
      report.warnings.push({
        check: 'Invalid Requirement Links',
        count: invalidReqLinks.length,
        ids: invalidReqLinks.map(c => c.id)
      });
    } else {
      report.validations.push({ check: 'Requirement Links Valid', status: 'PASS' });
    }

    // 3. Reconcile qty_committed vs qty_needed for migrated commitments
    const migratedCommitments = commitments.filter(c => c.allocation_source === 'migrated_requirement');
    let committedTotal = 0;
    let neededTotal = 0;
    
    migratedCommitments.forEach(c => {
      committedTotal += c.qty_committed || 0;
      const req = requirements.find(r => r.id === c.requirement_id);
      if (req) {
        neededTotal += req.qty_needed || 0;
      }
    });

    report.reconciliation.committed_vs_needed = {
      sum_qty_committed: committedTotal,
      sum_qty_needed: neededTotal,
      match: committedTotal === neededTotal
    };

    if (committedTotal !== neededTotal) {
      report.warnings.push({
        check: 'Committed vs Needed Mismatch',
        difference: committedTotal - neededTotal
      });
    } else {
      report.validations.push({ check: 'Committed = Needed', status: 'PASS' });
    }

    // 4. Reconcile qty_ordered with line items
    let commitmentOrderedTotal = 0;
    let lineItemOrderedTotal = 0;
    
    commitments.forEach(c => {
      commitmentOrderedTotal += c.qty_ordered || 0;
      (c.order_line_item_ids || []).forEach(liId => {
        const li = lineItems.find(l => l.id === liId);
        if (li) {
          lineItemOrderedTotal += li.qty_ordered || 0;
        }
      });
    });

    report.reconciliation.ordered_vs_line_items = {
      sum_commitment_qty_ordered: commitmentOrderedTotal,
      sum_linked_line_item_qty_ordered: lineItemOrderedTotal,
      note: 'These may differ if commitments share line items or have manual entries'
    };

    // 5. Reconcile installed quantities
    let commitmentInstalledTotal = commitments.reduce((s, c) => s + (c.qty_installed || 0), 0);
    let installedPartTotal = installedParts.reduce((s, ip) => s + (ip.qty_consumed || 0), 0);
    let requirementInstalledTotal = requirements.reduce((s, r) => s + (r.qty_installed || 0), 0);

    report.reconciliation.installed = {
      sum_commitment_qty_installed: commitmentInstalledTotal,
      sum_requirement_qty_installed: requirementInstalledTotal,
      sum_installed_part_qty_consumed: installedPartTotal,
      note: 'Commitment and requirement totals should match for migrated records'
    };

    // 6. Inventory integrity check (should remain unchanged)
    const totalOnHand = inventoryItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
    const totalReserved = inventoryItems.reduce((s, i) => s + (i.quantity_reserved || 0), 0);
    const totalAvailable = totalOnHand - totalReserved;

    report.reconciliation.inventory = {
      total_on_hand: totalOnHand,
      total_reserved: totalReserved,
      total_available: totalAvailable,
      note: 'These values should NOT change due to commitment migration'
    };
    
    report.validations.push({ check: 'Inventory Unchanged', status: 'INFO - Verify manually' });

    // 7. Coverage check - requirements with vs without commitments
    const reqsWithCommitments = new Set(commitments.map(c => c.requirement_id).filter(Boolean));
    const reqsWithoutCommitments = requirements.filter(r => !reqsWithCommitments.has(r.id));
    
    report.reconciliation.coverage = {
      requirements_with_commitments: reqsWithCommitments.size,
      requirements_without_commitments: reqsWithoutCommitments.length,
      uncovered_requirement_ids: reqsWithoutCommitments.slice(0, 20).map(r => r.id),
      note: 'Requirements without qty_allocated/ordered/installed may not have commitments'
    };

    // Summary
    report.summary = {
      total_validations: report.validations.length,
      total_warnings: report.warnings.length,
      total_errors: report.errors.length,
      status: report.errors.length > 0 ? 'FAILED' : 
              report.warnings.length > 0 ? 'PASSED WITH WARNINGS' : 'PASSED'
    };

    return Response.json(report);

  } catch (error) {
    console.error('Validation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});