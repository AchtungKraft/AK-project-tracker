import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * VERIFY LEGACY PRICING INTEGRITY
 * Scans Parts + Commitments for pricing issues:
 * - Missing Part.default_cost
 * - Missing Part.default_retail
 * - Cost values suspiciously equal to retail (flag possible contamination)
 * - Commitments with planned_retail_total = 0 but qty_committed > 0
 * - Missing unit snapshots on commitments
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { limit = 20 } = body;

    const report = {
      timestamp: new Date().toISOString(),
      status: 'PASS',
      
      // Part issues
      parts_scanned: 0,
      parts_with_issues: 0,
      part_issues: {
        missing_cost: [],
        missing_retail: [],
        cost_equals_retail: [],
        zero_cost: [],
        zero_retail: []
      },
      
      // Commitment issues  
      commitments_scanned: 0,
      commitments_with_issues: 0,
      commitment_issues: {
        zero_planned_with_qty: [],
        missing_cost_snapshot: [],
        missing_retail_snapshot: [],
        exposure_mismatch: [],
        coverage_exceeds_planned: []
      },
      
      // Counts
      counts: {},
      
      // Top offenders (limited)
      top_offenders: {
        parts: [],
        commitments: []
      }
    };

    // Fetch all parts
    const parts = await base44.asServiceRole.entities.Part.list();
    report.parts_scanned = parts.length;

    const partsMap = new Map(parts.map(p => [p.id, p]));

    for (const part of parts) {
      const issues = [];
      
      // Missing cost
      if (part.default_cost === null || part.default_cost === undefined) {
        issues.push('missing_cost');
        report.part_issues.missing_cost.push({ id: part.id, name: part.part_name });
      } else if (part.default_cost === 0) {
        issues.push('zero_cost');
        report.part_issues.zero_cost.push({ id: part.id, name: part.part_name });
      }
      
      // Missing retail
      if (part.default_retail === null || part.default_retail === undefined) {
        issues.push('missing_retail');
        report.part_issues.missing_retail.push({ id: part.id, name: part.part_name });
      } else if (part.default_retail === 0 && (part.default_cost || 0) > 0) {
        issues.push('zero_retail');
        report.part_issues.zero_retail.push({ id: part.id, name: part.part_name, cost: part.default_cost });
      }
      
      // Cost equals retail (suspicious - possible contamination)
      if (part.default_cost && part.default_retail && 
          Math.abs(part.default_cost - part.default_retail) < 0.01 &&
          part.default_cost > 10) { // Only flag if > $10 to avoid false positives on cheap parts
        issues.push('cost_equals_retail');
        report.part_issues.cost_equals_retail.push({ 
          id: part.id, 
          name: part.part_name,
          cost: part.default_cost,
          retail: part.default_retail
        });
      }
      
      if (issues.length > 0) {
        report.parts_with_issues++;
        if (report.top_offenders.parts.length < limit) {
          report.top_offenders.parts.push({
            id: part.id,
            name: part.part_name,
            issues,
            default_cost: part.default_cost,
            default_retail: part.default_retail
          });
        }
      }
    }

    // Fetch all active commitments
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({
      commitment_status: { $nin: ['cancelled'] }
    });
    report.commitments_scanned = commitments.length;

    for (const commitment of commitments) {
      const issues = [];
      const part = partsMap.get(commitment.part_id);
      
      // Zero planned with qty > 0
      if ((commitment.qty_committed || 0) > 0 && 
          (commitment.planned_retail_total === 0 || commitment.planned_retail_total === null)) {
        issues.push('zero_planned_with_qty');
        report.commitment_issues.zero_planned_with_qty.push({
          id: commitment.id,
          project_id: commitment.project_id,
          part_name: part?.part_name,
          qty_committed: commitment.qty_committed,
          planned_retail_total: commitment.planned_retail_total
        });
      }
      
      // Missing snapshots
      if (!commitment.unit_cost_snapshot && part?.default_cost > 0) {
        issues.push('missing_cost_snapshot');
        report.commitment_issues.missing_cost_snapshot.push({
          id: commitment.id,
          project_id: commitment.project_id,
          part_name: part?.part_name,
          part_cost: part?.default_cost
        });
      }
      
      if (!commitment.unit_retail_snapshot && part?.default_retail > 0) {
        issues.push('missing_retail_snapshot');
        report.commitment_issues.missing_retail_snapshot.push({
          id: commitment.id,
          project_id: commitment.project_id,
          part_name: part?.part_name,
          part_retail: part?.default_retail
        });
      }
      
      // Exposure mismatch (calculated vs stored)
      const expectedPlanned = (commitment.qty_committed || 0) * (commitment.unit_retail_snapshot || part?.default_retail || 0);
      const storedPlanned = commitment.planned_retail_total || 0;
      const expectedExposure = storedPlanned - (commitment.covered_retail_total || 0);
      const storedExposure = commitment.exposure_gap ?? 0;
      
      if (expectedPlanned > 0 && Math.abs(storedPlanned - expectedPlanned) > 1) {
        issues.push('planned_mismatch');
      }
      
      if (Math.abs(storedExposure - expectedExposure) > 1 && storedPlanned > 0) {
        issues.push('exposure_mismatch');
        report.commitment_issues.exposure_mismatch.push({
          id: commitment.id,
          project_id: commitment.project_id,
          stored_exposure: storedExposure,
          calculated_exposure: expectedExposure,
          diff: storedExposure - expectedExposure
        });
      }
      
      // Coverage exceeds planned (over-allocated)
      if ((commitment.covered_retail_total || 0) > storedPlanned && storedPlanned > 0) {
        issues.push('coverage_exceeds_planned');
        report.commitment_issues.coverage_exceeds_planned.push({
          id: commitment.id,
          project_id: commitment.project_id,
          planned: storedPlanned,
          covered: commitment.covered_retail_total,
          excess: (commitment.covered_retail_total || 0) - storedPlanned
        });
      }
      
      if (issues.length > 0) {
        report.commitments_with_issues++;
        if (report.top_offenders.commitments.length < limit) {
          report.top_offenders.commitments.push({
            id: commitment.id,
            project_id: commitment.project_id,
            part_name: part?.part_name,
            issues,
            planned_retail_total: commitment.planned_retail_total,
            covered_retail_total: commitment.covered_retail_total,
            exposure_gap: commitment.exposure_gap,
            unit_cost_snapshot: commitment.unit_cost_snapshot,
            unit_retail_snapshot: commitment.unit_retail_snapshot
          });
        }
      }
    }

    // Calculate counts
    report.counts = {
      parts_missing_cost: report.part_issues.missing_cost.length,
      parts_missing_retail: report.part_issues.missing_retail.length,
      parts_cost_equals_retail: report.part_issues.cost_equals_retail.length,
      parts_zero_cost: report.part_issues.zero_cost.length,
      parts_zero_retail: report.part_issues.zero_retail.length,
      commitments_zero_planned: report.commitment_issues.zero_planned_with_qty.length,
      commitments_missing_cost_snapshot: report.commitment_issues.missing_cost_snapshot.length,
      commitments_missing_retail_snapshot: report.commitment_issues.missing_retail_snapshot.length,
      commitments_exposure_mismatch: report.commitment_issues.exposure_mismatch.length,
      commitments_over_covered: report.commitment_issues.coverage_exceeds_planned.length
    };

    // Determine overall status
    const criticalIssues = 
      report.counts.parts_missing_cost +
      report.counts.parts_missing_retail +
      report.counts.commitments_zero_planned +
      report.counts.commitments_exposure_mismatch;

    const warningIssues =
      report.counts.parts_cost_equals_retail +
      report.counts.commitments_missing_cost_snapshot +
      report.counts.commitments_missing_retail_snapshot;

    if (criticalIssues > 0) {
      report.status = 'FAIL';
    } else if (warningIssues > 0) {
      report.status = 'WARN';
    }

    // Trim arrays to limit
    for (const key of Object.keys(report.part_issues)) {
      report.part_issues[key] = report.part_issues[key].slice(0, limit);
    }
    for (const key of Object.keys(report.commitment_issues)) {
      report.commitment_issues[key] = report.commitment_issues[key].slice(0, limit);
    }

    // Summary
    report.summary = {
      parts_scanned: report.parts_scanned,
      parts_with_issues: report.parts_with_issues,
      commitments_scanned: report.commitments_scanned,
      commitments_with_issues: report.commitments_with_issues,
      critical_issues: criticalIssues,
      warning_issues: warningIssues,
      recommendation: criticalIssues > 0 
        ? 'Run normalizeSupplyData to repair pricing issues'
        : warningIssues > 0
          ? 'Consider running normalizeSupplyData in dry_run mode to review'
          : 'Pricing integrity looks good'
    };

    return Response.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Pricing integrity check error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});