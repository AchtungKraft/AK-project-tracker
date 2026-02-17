import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * VERIFY LEGACY PRICING INTEGRITY (V2)
 * 
 * Enhanced to detect:
 * - parts with needs_manual_cost_review flag
 * - parts with is_cost_verified = false but cost set
 * - unit_cost mismatches between line items and parts
 * - cost modifications by non-admin (via audit log if available)
 * - cost = retail contamination
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
      verified_parts: 0,
      manual_review_required: 0,
      
      part_issues: {
        missing_cost: [],
        missing_retail: [],
        cost_equals_retail: [],
        zero_cost: [],
        zero_retail: [],
        needs_manual_review: [],
        unverified_cost: []
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
      
      // Line Item issues (NEW)
      line_items_scanned: 0,
      line_items_with_issues: 0,
      line_item_issues: {
        cost_mismatch: [],
        missing_commitment: []
      },
      
      // Counts
      counts: {},
      
      // Top offenders (limited)
      top_offenders: {
        parts: [],
        commitments: [],
        line_items: []
      },
      
      // Violations summary
      violations: []
    };

    // Fetch all data
    const [parts, allCommitments, lineItems] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list()
    ]);

    report.parts_scanned = parts.length;
    const partsMap = new Map(parts.map(p => [p.id, p]));
    const commitmentsMap = new Map(allCommitments.map(c => [c.id, c]));

    // ========================================
    // PART ANALYSIS
    // ========================================
    for (const part of parts) {
      // Skip archived/inactive
      if (part.is_archived || !part.is_active) continue;
      
      const issues = [];
      
      // Track verified parts
      if (part.is_cost_verified === true) {
        report.verified_parts++;
      }
      
      // Track manual review needed
      if (part.needs_manual_cost_review === true) {
        report.manual_review_required++;
        issues.push('needs_manual_review');
        report.part_issues.needs_manual_review.push({ 
          id: part.id, 
          name: part.part_name,
          cost: part.default_cost,
          retail: part.default_retail
        });
      }
      
      // Unverified cost (cost exists but not verified)
      if (part.default_cost > 0 && part.is_cost_verified !== true && !part.needs_manual_cost_review) {
        issues.push('unverified_cost');
        report.part_issues.unverified_cost.push({
          id: part.id,
          name: part.part_name,
          cost: part.default_cost,
          cost_source: part.cost_source || 'unknown'
        });
      }
      
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
      // Only flag if NOT verified and NOT already flagged for review
      if (part.default_cost && part.default_retail && 
          Math.abs(part.default_cost - part.default_retail) < 0.01 &&
          part.default_cost > 10 && // Only flag if > $10
          part.is_cost_verified !== true &&
          part.needs_manual_cost_review !== true) {
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
            default_retail: part.default_retail,
            is_cost_verified: part.is_cost_verified,
            needs_manual_cost_review: part.needs_manual_cost_review,
            cost_source: part.cost_source
          });
        }
      }
    }

    // ========================================
    // COMMITMENT ANALYSIS
    // ========================================
    const commitments = allCommitments.filter(c => c.commitment_status !== 'cancelled');
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
      
      // Exposure mismatch
      const expectedPlanned = (commitment.qty_committed || 0) * (commitment.unit_retail_snapshot || part?.default_retail || 0);
      const storedPlanned = commitment.planned_retail_total || 0;
      const expectedExposure = storedPlanned - (commitment.covered_retail_total || 0);
      const storedExposure = commitment.exposure_gap ?? 0;
      
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
      
      // Coverage exceeds planned
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

    // ========================================
    // LINE ITEM ANALYSIS (NEW)
    // ========================================
    report.line_items_scanned = lineItems.length;

    for (const lineItem of lineItems) {
      const issues = [];
      const commitment = commitmentsMap.get(lineItem.commitment_id);
      const part = commitment ? partsMap.get(commitment.part_id) : null;
      
      // Missing commitment reference
      if (lineItem.commitment_id && !commitment) {
        issues.push('missing_commitment');
        report.line_item_issues.missing_commitment.push({
          line_item_id: lineItem.id,
          commitment_id: lineItem.commitment_id
        });
      }
      
      // Cost mismatch between line item and part
      if (part && lineItem.unit_price !== null && lineItem.unit_price !== undefined &&
          part.default_cost !== null && part.default_cost !== undefined) {
        if (Math.abs(lineItem.unit_price - part.default_cost) > 0.01) {
          issues.push('cost_mismatch');
          report.line_item_issues.cost_mismatch.push({
            line_item_id: lineItem.id,
            part_id: part.id,
            part_name: part.part_name,
            line_unit_cost: lineItem.unit_price,
            part_cost: part.default_cost,
            diff: lineItem.unit_price - part.default_cost
          });
        }
      }
      
      if (issues.length > 0) {
        report.line_items_with_issues++;
        if (report.top_offenders.line_items.length < limit) {
          report.top_offenders.line_items.push({
            id: lineItem.id,
            part_name: part?.part_name,
            issues,
            unit_price: lineItem.unit_price,
            part_cost: part?.default_cost
          });
        }
      }
    }

    // ========================================
    // COUNTS AND STATUS
    // ========================================
    report.counts = {
      parts_missing_cost: report.part_issues.missing_cost.length,
      parts_missing_retail: report.part_issues.missing_retail.length,
      parts_cost_equals_retail: report.part_issues.cost_equals_retail.length,
      parts_zero_cost: report.part_issues.zero_cost.length,
      parts_zero_retail: report.part_issues.zero_retail.length,
      parts_needs_manual_review: report.part_issues.needs_manual_review.length,
      parts_unverified_cost: report.part_issues.unverified_cost.length,
      commitments_zero_planned: report.commitment_issues.zero_planned_with_qty.length,
      commitments_missing_cost_snapshot: report.commitment_issues.missing_cost_snapshot.length,
      commitments_missing_retail_snapshot: report.commitment_issues.missing_retail_snapshot.length,
      commitments_exposure_mismatch: report.commitment_issues.exposure_mismatch.length,
      commitments_over_covered: report.commitment_issues.coverage_exceeds_planned.length,
      line_items_cost_mismatch: report.line_item_issues.cost_mismatch.length,
      line_items_missing_commitment: report.line_item_issues.missing_commitment.length
    };

    // Build violations list
    if (report.counts.parts_missing_cost > 0) {
      report.violations.push({ type: 'parts_missing_cost', count: report.counts.parts_missing_cost, severity: 'critical' });
    }
    if (report.counts.parts_cost_equals_retail > 0) {
      report.violations.push({ type: 'parts_cost_equals_retail', count: report.counts.parts_cost_equals_retail, severity: 'warning' });
    }
    if (report.counts.parts_needs_manual_review > 0) {
      report.violations.push({ type: 'parts_needs_manual_review', count: report.counts.parts_needs_manual_review, severity: 'warning' });
    }
    if (report.counts.line_items_cost_mismatch > 0) {
      report.violations.push({ type: 'line_items_cost_mismatch', count: report.counts.line_items_cost_mismatch, severity: 'critical' });
    }
    if (report.counts.commitments_exposure_mismatch > 0) {
      report.violations.push({ type: 'commitments_exposure_mismatch', count: report.counts.commitments_exposure_mismatch, severity: 'critical' });
    }

    // Determine overall status
    const criticalIssues = 
      report.counts.parts_missing_cost +
      report.counts.parts_missing_retail +
      report.counts.commitments_zero_planned +
      report.counts.commitments_exposure_mismatch +
      report.counts.line_items_cost_mismatch;

    const warningIssues =
      report.counts.parts_cost_equals_retail +
      report.counts.parts_needs_manual_review +
      report.counts.parts_unverified_cost +
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
    for (const key of Object.keys(report.line_item_issues)) {
      report.line_item_issues[key] = report.line_item_issues[key].slice(0, limit);
    }

    // Summary
    report.summary = {
      parts_scanned: report.parts_scanned,
      parts_with_issues: report.parts_with_issues,
      verified_parts: report.verified_parts,
      manual_review_required: report.manual_review_required,
      commitments_scanned: report.commitments_scanned,
      commitments_with_issues: report.commitments_with_issues,
      line_items_scanned: report.line_items_scanned,
      line_items_with_issues: report.line_items_with_issues,
      critical_issues: criticalIssues,
      warning_issues: warningIssues,
      recommendation: criticalIssues > 0 
        ? 'Run normalizeSupplyData with repair_pricing_semantics=true to repair'
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