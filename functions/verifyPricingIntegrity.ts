import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * verifyPricingIntegrity - Scan for pricing data issues
 * 
 * Checks:
 * - Parts missing cost or retail_price
 * - Commitments with missing/zero pricing fields
 * - InstalledParts missing unit_cost_at_install
 * - LineItems missing unit_cost / line_total
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const timestamp = new Date().toISOString();
    const maxOffenders = 50;

    // Fetch all relevant data
    const [parts, commitments, installedParts, lineItems] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.InstalledPart.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list()
    ]);

    const issues = {
      parts_missing_cost: [],
      parts_missing_retail: [],
      commitments_zero_retail: [],
      commitments_missing_cost_snapshot: [],
      commitments_negative_exposure: [],
      installed_missing_cost: [],
      line_items_missing_cost: [],
      line_items_zero_total: []
    };

    // Check Parts
    for (const part of parts) {
      if (part.is_archived) continue;
      
      const cost = part.default_cost;
      const retail = part.default_retail;
      
      if (cost === null || cost === undefined || cost === 0) {
        issues.parts_missing_cost.push({
          id: part.id,
          name: part.part_name,
          current_cost: cost,
          current_retail: retail,
          impact: 'Cannot calculate accurate exposure or margin'
        });
      }
      
      if (retail === null || retail === undefined || retail === 0) {
        issues.parts_missing_retail.push({
          id: part.id,
          name: part.part_name,
          current_cost: cost,
          current_retail: retail,
          impact: 'Cannot calculate planned retail total'
        });
      }
    }

    // Check Commitments
    const activeCommitments = commitments.filter(c => c.commitment_status !== 'cancelled');
    for (const c of activeCommitments) {
      const part = parts.find(p => p.id === c.part_id);
      
      if (!c.planned_retail_total && !c.unit_retail_snapshot) {
        issues.commitments_zero_retail.push({
          id: c.id,
          part_id: c.part_id,
          part_name: part?.part_name,
          project_id: c.project_id,
          qty_committed: c.qty_committed,
          current_values: {
            planned_retail_total: c.planned_retail_total,
            unit_retail_snapshot: c.unit_retail_snapshot
          },
          impact: 'Exposure gap calculation will be incorrect'
        });
      }
      
      if (!c.unit_cost_snapshot && c.qty_ordered > 0) {
        issues.commitments_missing_cost_snapshot.push({
          id: c.id,
          part_id: c.part_id,
          part_name: part?.part_name,
          project_id: c.project_id,
          qty_ordered: c.qty_ordered,
          impact: 'Margin calculation will be inaccurate'
        });
      }
      
      if (c.exposure_gap < 0) {
        issues.commitments_negative_exposure.push({
          id: c.id,
          part_id: c.part_id,
          part_name: part?.part_name,
          exposure_gap: c.exposure_gap,
          covered_retail_total: c.covered_retail_total,
          planned_retail_total: c.planned_retail_total,
          impact: 'Over-coverage may indicate data issue'
        });
      }
    }

    // Check Installed Parts
    const activeInstalled = installedParts.filter(ip => !ip.is_reversed);
    for (const ip of activeInstalled) {
      if (!ip.unit_cost_at_install) {
        const commitment = commitments.find(c => c.id === ip.commitment_id);
        const part = parts.find(p => p.id === ip.part_id);
        
        issues.installed_missing_cost.push({
          id: ip.id,
          part_id: ip.part_id,
          part_name: part?.part_name,
          commitment_id: ip.commitment_id,
          project_id: commitment?.project_id,
          qty_consumed: ip.qty_consumed,
          impact: 'Installed cost tracking incomplete'
        });
      }
    }

    // Check Line Items
    for (const li of lineItems) {
      if (!li.unit_price && li.status !== 'Cancelled') {
        const part = parts.find(p => p.id === li.part_id);
        
        issues.line_items_missing_cost.push({
          id: li.id,
          part_id: li.part_id,
          part_name: part?.part_name,
          order_id: li.order_id,
          qty_ordered: li.qty_ordered,
          impact: 'PO cost tracking incomplete'
        });
      }
      
      if ((!li.line_total || li.line_total === 0) && li.qty_ordered > 0 && li.status !== 'Cancelled') {
        issues.line_items_zero_total.push({
          id: li.id,
          part_id: li.part_id,
          order_id: li.order_id,
          qty_ordered: li.qty_ordered,
          unit_price: li.unit_price,
          impact: 'Line total not calculated'
        });
      }
    }

    // Calculate summary
    const summary = {
      parts: {
        total: parts.filter(p => !p.is_archived).length,
        missing_cost: issues.parts_missing_cost.length,
        missing_retail: issues.parts_missing_retail.length
      },
      commitments: {
        total: activeCommitments.length,
        zero_retail: issues.commitments_zero_retail.length,
        missing_cost_snapshot: issues.commitments_missing_cost_snapshot.length,
        negative_exposure: issues.commitments_negative_exposure.length
      },
      installed_parts: {
        total: activeInstalled.length,
        missing_cost: issues.installed_missing_cost.length
      },
      line_items: {
        total: lineItems.length,
        missing_cost: issues.line_items_missing_cost.length,
        zero_total: issues.line_items_zero_total.length
      }
    };

    const totalIssues = 
      issues.parts_missing_cost.length +
      issues.parts_missing_retail.length +
      issues.commitments_zero_retail.length +
      issues.commitments_missing_cost_snapshot.length +
      issues.installed_missing_cost.length +
      issues.line_items_missing_cost.length +
      issues.line_items_zero_total.length;

    // Limit offenders to top N by impact
    const limitedIssues = {};
    for (const [key, arr] of Object.entries(issues)) {
      limitedIssues[key] = arr.slice(0, maxOffenders);
    }

    return Response.json({
      success: true,
      timestamp,
      summary,
      total_issues: totalIssues,
      status: totalIssues === 0 ? 'PASS' : totalIssues < 10 ? 'WARN' : 'FAIL',
      integrity_pct: Math.round(((activeCommitments.length - issues.commitments_zero_retail.length) / Math.max(1, activeCommitments.length)) * 100),
      top_offenders: limitedIssues,
      recommendations: totalIssues > 0 ? [
        'Run normalizeLegacyPricing with dry_run: true to see proposed fixes',
        'Ensure all Parts have valid default_cost and default_retail',
        'Verify matrix pricing is applied correctly for new commitments'
      ] : []
    });

  } catch (error) {
    console.error("verifyPricingIntegrity error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});