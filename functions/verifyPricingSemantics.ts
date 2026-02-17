import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * VERIFY PRICING SEMANTICS
 * Validates cost vs retail separation across all entities
 * 
 * CHECKS:
 * - No PO line item cost equals retail fields
 * - No commitments have missing snapshots (unless flagged)
 * - Part cost/retail independence
 * - pricingSemanticGate metrics
 */

function getRetailEffective(part) {
  return part.retail_override || part.retail_matrix_price || part.default_retail || 0;
}

function getCostEffective(part) {
  return part.cost || part.default_cost || 0;
}

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
    const limit = body.limit || 20;

    const report = {
      timestamp: new Date().toISOString(),
      status: 'PASS',
      
      // Part checks
      parts: {
        scanned: 0,
        verified_cost: 0,
        needs_cost_review: 0,
        cost_equals_retail: 0,
        missing_cost: 0,
        missing_retail: 0,
        violations: []
      },
      
      // Commitment checks
      commitments: {
        scanned: 0,
        missing_cost_snapshot: 0,
        missing_retail_snapshot: 0,
        missing_planned_totals: 0,
        snapshot_mismatch: 0,
        violations: []
      },
      
      // Line item checks
      line_items: {
        scanned: 0,
        cost_mismatch: 0,
        cost_equals_retail: 0,
        missing_cost: 0,
        violations: []
      },
      
      // Gate metrics
      gate_metrics: {
        fail_conditions: [],
        warn_conditions: [],
        pass: true
      },
      
      top_offenders: {
        parts: [],
        commitments: [],
        line_items: []
      }
    };

    // Fetch all data
    const [parts, commitments, lineItems] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list()
    ]);

    const partsMap = new Map(parts.map(p => [p.id, p]));
    const commitmentsMap = new Map(commitments.map(c => [c.id, c]));

    // ========================================
    // CHECK PARTS
    // ========================================
    report.parts.scanned = parts.length;

    for (const part of parts) {
      if (part.is_archived) continue;

      const issues = [];
      const cost = getCostEffective(part);
      const retail = getRetailEffective(part);

      // Track verified vs needs review
      if (part.is_cost_verified === true) {
        report.parts.verified_cost++;
      }
      if (part.needs_cost_review === true) {
        report.parts.needs_cost_review++;
        issues.push('needs_cost_review');
      }

      // Missing cost
      if (cost <= 0) {
        report.parts.missing_cost++;
        issues.push('missing_cost');
      }

      // Missing retail
      if (retail <= 0 && cost > 0) {
        report.parts.missing_retail++;
        issues.push('missing_retail');
      }

      // Cost equals retail (contamination indicator)
      if (cost > 10 && retail > 0 && Math.abs(cost - retail) < 0.01 && !part.is_cost_verified) {
        report.parts.cost_equals_retail++;
        issues.push('cost_equals_retail');
      }

      if (issues.length > 0 && report.top_offenders.parts.length < limit) {
        report.parts.violations.push({ id: part.id, name: part.part_name, issues });
        report.top_offenders.parts.push({
          id: part.id,
          name: part.part_name,
          issues,
          cost,
          retail,
          is_cost_verified: part.is_cost_verified,
          needs_cost_review: part.needs_cost_review
        });
      }
    }

    // ========================================
    // CHECK COMMITMENTS
    // ========================================
    const activeCommitments = commitments.filter(c => c.commitment_status !== 'cancelled');
    report.commitments.scanned = activeCommitments.length;

    for (const commitment of activeCommitments) {
      const issues = [];
      const part = partsMap.get(commitment.part_id);
      const qty = commitment.qty_committed || 0;

      // Missing cost snapshot
      if (qty > 0 && (!commitment.unit_cost_snapshot || commitment.unit_cost_snapshot <= 0)) {
        report.commitments.missing_cost_snapshot++;
        issues.push('missing_cost_snapshot');
      }

      // Missing retail snapshot
      if (qty > 0 && (!commitment.unit_retail_snapshot || commitment.unit_retail_snapshot <= 0)) {
        report.commitments.missing_retail_snapshot++;
        issues.push('missing_retail_snapshot');
      }

      // Missing planned totals
      if (qty > 0 && (!commitment.planned_cost_total || !commitment.planned_retail_total)) {
        report.commitments.missing_planned_totals++;
        issues.push('missing_planned_totals');
      }

      // Snapshot mismatch with part (if part has verified values)
      if (part && part.is_cost_verified && commitment.unit_cost_snapshot) {
        const partCost = getCostEffective(part);
        if (Math.abs(commitment.unit_cost_snapshot - partCost) > 0.01) {
          // Not necessarily wrong - snapshots capture time-of-commitment pricing
          // But flag if part needs_cost_review is true (contaminated source)
          if (part.needs_cost_review) {
            report.commitments.snapshot_mismatch++;
            issues.push('snapshot_from_contaminated_part');
          }
        }
      }

      if (issues.length > 0 && report.top_offenders.commitments.length < limit) {
        report.commitments.violations.push({ id: commitment.id, project_id: commitment.project_id, issues });
        report.top_offenders.commitments.push({
          id: commitment.id,
          project_id: commitment.project_id,
          part_name: part?.part_name,
          issues,
          unit_cost_snapshot: commitment.unit_cost_snapshot,
          unit_retail_snapshot: commitment.unit_retail_snapshot,
          planned_cost_total: commitment.planned_cost_total,
          planned_retail_total: commitment.planned_retail_total
        });
      }
    }

    // ========================================
    // CHECK LINE ITEMS
    // ========================================
    report.line_items.scanned = lineItems.length;
    report.line_items.cost_snapshot_mismatch = 0;
    report.line_items.top_mismatches = [];

    for (const lineItem of lineItems) {
      const issues = [];
      const commitment = commitmentsMap.get(lineItem.commitment_id);
      const part = partsMap.get(lineItem.part_id);

      const lineCost = lineItem.unit_cost || lineItem.unit_price || 0;
      const partRetail = part ? getRetailEffective(part) : 0;

      // Missing cost
      if (lineCost <= 0) {
        report.line_items.missing_cost++;
        issues.push('missing_cost');
      }

      // Cost equals retail (WARN only - can happen legitimately in some cases)
      if (lineCost > 10 && partRetail > 0 && Math.abs(lineCost - partRetail) < 0.01) {
        report.line_items.cost_equals_retail++;
        issues.push('cost_equals_retail_warn');
      }

      // Cost mismatch with commitment snapshot (CRITICAL - this is authoritative)
      // Only check if commitment_id is set (legacy items may not have it)
      if (lineItem.commitment_id && commitment && commitment.unit_cost_snapshot > 0) {
        if (Math.abs(lineCost - commitment.unit_cost_snapshot) > 0.01) {
          report.line_items.cost_mismatch++;
          report.line_items.cost_snapshot_mismatch++;
          issues.push('cost_mismatch_with_commitment');
          
          // Track top mismatches
          if (report.line_items.top_mismatches.length < limit) {
            report.line_items.top_mismatches.push({
              line_item_id: lineItem.id,
              commitment_id: commitment.id,
              part_name: part?.part_name,
              expected_snapshot: commitment.unit_cost_snapshot,
              actual_unit_cost: lineCost,
              diff: lineCost - commitment.unit_cost_snapshot
            });
          }
        }
        
        // Extended cost validation
        const expectedExtended = commitment.unit_cost_snapshot * (lineItem.qty_ordered || 1);
        if (Math.abs((lineItem.extended_cost || 0) - expectedExtended) > 0.01) {
          report.line_items.extended_cost_mismatch = (report.line_items.extended_cost_mismatch || 0) + 1;
          issues.push('extended_cost_mismatch');
        }
      }

      // Track legacy link status (WARN only)
      if (lineItem.is_legacy) {
        report.line_items.legacy_count = (report.line_items.legacy_count || 0) + 1;
        if (lineItem.legacy_link_status !== 'linked') {
          report.line_items.legacy_unlinked = (report.line_items.legacy_unlinked || 0) + 1;
          issues.push(`legacy_${lineItem.legacy_link_status || 'unlinked'}`);
        }
      }

      if (issues.length > 0 && report.top_offenders.line_items.length < limit) {
        report.line_items.violations.push({ id: lineItem.id, issues });
        report.top_offenders.line_items.push({
          id: lineItem.id,
          part_name: part?.part_name,
          issues,
          unit_cost: lineCost,
          commitment_cost_snapshot: commitment?.unit_cost_snapshot,
          part_retail: partRetail,
          legacy_link_status: lineItem.legacy_link_status
        });
      }
    }

    // ========================================
    // DETERMINE GATE STATUS
    // ========================================
    
    // FAIL conditions (blocking)
    if (report.commitments.missing_cost_snapshot > 0) {
      report.gate_metrics.fail_conditions.push({
        type: 'commitments_missing_cost_snapshot',
        count: report.commitments.missing_cost_snapshot
      });
      report.gate_metrics.pass = false;
    }

    if (report.commitments.missing_retail_snapshot > 0) {
      report.gate_metrics.fail_conditions.push({
        type: 'commitments_missing_retail_snapshot',
        count: report.commitments.missing_retail_snapshot
      });
      report.gate_metrics.pass = false;
    }

    // Line item cost mismatch with commitment snapshot is CRITICAL
    if (report.line_items.cost_snapshot_mismatch > 0) {
      report.gate_metrics.fail_conditions.push({
        type: 'line_items_cost_snapshot_mismatch',
        count: report.line_items.cost_snapshot_mismatch,
        top_mismatches: report.line_items.top_mismatches.slice(0, 5)
      });
      report.gate_metrics.pass = false;
    }

    // WARN conditions (non-blocking)
    // cost_equals_retail on line items is WARN only (can happen legitimately)
    if (report.line_items.cost_equals_retail > 0) {
      report.gate_metrics.warn_conditions.push({
        type: 'line_items_cost_equals_retail',
        count: report.line_items.cost_equals_retail,
        note: 'Can occur legitimately when Part cost happens to equal retail'
      });
    }

    // Part cost equals retail is WARN when not verified
    if (report.parts.cost_equals_retail > 0) {
      report.gate_metrics.warn_conditions.push({
        type: 'parts_cost_equals_retail',
        count: report.parts.cost_equals_retail,
        note: 'Parts with unverified cost matching retail - review recommended'
      });
    }

    if (report.parts.needs_cost_review > 0) {
      report.gate_metrics.warn_conditions.push({
        type: 'parts_needs_cost_review',
        count: report.parts.needs_cost_review
      });
    }

    // Legacy line items not linked (WARN only)
    if (report.line_items.legacy_unlinked > 0) {
      report.gate_metrics.warn_conditions.push({
        type: 'legacy_line_items_unlinked',
        count: report.line_items.legacy_unlinked,
        note: 'Legacy line items without commitment linkage - run migrateLegacyLineItemsToCommitments'
      });
    }

    // Set overall status
    if (!report.gate_metrics.pass) {
      report.status = 'FAIL';
    } else if (report.gate_metrics.warn_conditions.length > 0) {
      report.status = 'WARN';
    }

    // Trim violations arrays
    report.parts.violations = report.parts.violations.slice(0, limit);
    report.commitments.violations = report.commitments.violations.slice(0, limit);
    report.line_items.violations = report.line_items.violations.slice(0, limit);

    // Summary
    report.summary = {
      status: report.status,
      parts: {
        scanned: report.parts.scanned,
        verified: report.parts.verified_cost,
        flagged: report.parts.needs_cost_review + report.parts.cost_equals_retail
      },
      commitments: {
        scanned: report.commitments.scanned,
        issues: report.commitments.missing_cost_snapshot + report.commitments.missing_retail_snapshot
      },
      line_items: {
        scanned: report.line_items.scanned,
        issues: report.line_items.cost_mismatch + report.line_items.cost_equals_retail
      },
      gate: {
        pass: report.gate_metrics.pass,
        fail_count: report.gate_metrics.fail_conditions.length,
        warn_count: report.gate_metrics.warn_conditions.length
      }
    };

    return Response.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Verification error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});