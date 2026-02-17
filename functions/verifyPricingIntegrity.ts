import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * verifyPricingIntegrity - Pricing Data Integrity Check
 * 
 * Returns:
 * - Missing retail
 * - Missing cost
 * - Zero exposure inconsistencies
 * - Negative retail
 * - Orphaned commitments
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

    const timestamp = new Date().toISOString();

    // Fetch all data
    const [parts, commitments, lineItems, installedParts, pools, allocations] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list(),
      base44.asServiceRole.entities.InstalledPart.list(),
      base44.asServiceRole.entities.BillingPool.list(),
      base44.asServiceRole.entities.PoolAllocation.list(),
    ]);

    const partsMap = new Map(parts.map(p => [p.id, p]));
    const commitmentsMap = new Map(commitments.map(c => [c.id, c]));

    const issues = {
      parts: {
        missing_retail: [],
        missing_cost: [],
        negative_retail: [],
        negative_cost: [],
      },
      commitments: {
        missing_planned_retail: [],
        missing_exposure: [],
        zero_exposure_with_gap: [],
        negative_exposure: [],
        orphaned: [],
        zero_qty: [],
      },
      lineItems: {
        missing_unit_price: [],
        missing_line_total: [],
        zero_qty: [],
      },
      installedParts: {
        missing_cost: [],
        orphaned: [],
      },
      pools: {
        balance_mismatch: [],
        overdrawn: [],
      },
    };

    // Check Parts
    for (const part of parts) {
      if (!part.default_retail && part.default_retail !== 0) {
        issues.parts.missing_retail.push({ id: part.id, name: part.part_name });
      }
      if (!part.default_cost && part.default_cost !== 0) {
        issues.parts.missing_cost.push({ id: part.id, name: part.part_name });
      }
      if (part.default_retail < 0) {
        issues.parts.negative_retail.push({ id: part.id, name: part.part_name, value: part.default_retail });
      }
      if (part.default_cost < 0) {
        issues.parts.negative_cost.push({ id: part.id, name: part.part_name, value: part.default_cost });
      }
    }

    // Check Commitments
    for (const c of commitments) {
      if (c.commitment_status === 'cancelled') continue;

      const part = partsMap.get(c.part_id);

      if (!part) {
        issues.commitments.orphaned.push({ id: c.id, part_id: c.part_id });
        continue;
      }

      if (!c.planned_retail_total && c.planned_retail_total !== 0) {
        issues.commitments.missing_planned_retail.push({ 
          id: c.id, 
          part_name: part.part_name,
          qty: c.qty_committed 
        });
      }

      if (c.exposure_gap === undefined || c.exposure_gap === null) {
        issues.commitments.missing_exposure.push({ 
          id: c.id, 
          part_name: part.part_name 
        });
      }

      // Check for inconsistent zero exposure
      const expectedExposure = (c.planned_retail_total || 0) - (c.covered_retail_total || 0);
      if (Math.abs((c.exposure_gap || 0) - expectedExposure) > 1) {
        issues.commitments.zero_exposure_with_gap.push({
          id: c.id,
          part_name: part.part_name,
          stored: c.exposure_gap,
          expected: expectedExposure,
        });
      }

      if (c.exposure_gap < 0 && c.billing_status !== 'paid') {
        issues.commitments.negative_exposure.push({
          id: c.id,
          part_name: part.part_name,
          exposure: c.exposure_gap,
        });
      }

      if (!c.qty_committed || c.qty_committed === 0) {
        issues.commitments.zero_qty.push({ id: c.id, part_name: part.part_name });
      }
    }

    // Check Line Items
    for (const li of lineItems) {
      if (!li.unit_price && li.unit_price !== 0) {
        issues.lineItems.missing_unit_price.push({ id: li.id, commitment_id: li.commitment_id });
      }
      if (!li.line_total && li.line_total !== 0) {
        issues.lineItems.missing_line_total.push({ id: li.id });
      }
      if (!li.qty_ordered || li.qty_ordered === 0) {
        issues.lineItems.zero_qty.push({ id: li.id });
      }
    }

    // Check Installed Parts
    for (const ip of installedParts) {
      if (ip.is_reversed) continue;

      if (!ip.unit_cost_at_install && ip.unit_cost_at_install !== 0) {
        issues.installedParts.missing_cost.push({ id: ip.id, commitment_id: ip.commitment_id });
      }
      if (!commitmentsMap.has(ip.commitment_id)) {
        issues.installedParts.orphaned.push({ id: ip.id, commitment_id: ip.commitment_id });
      }
    }

    // Check Pools
    for (const pool of pools) {
      const poolAllocations = allocations.filter(a => a.pool_id === pool.id && !a.is_reversed);
      const calculatedAllocated = poolAllocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);
      
      const expectedBalance = (pool.paid_amount || 0) - calculatedAllocated - (pool.charges_total || 0);
      
      if (Math.abs((pool.balance || 0) - expectedBalance) > 1) {
        issues.pools.balance_mismatch.push({
          id: pool.id,
          name: pool.pool_name,
          stored_balance: pool.balance,
          expected_balance: expectedBalance,
          difference: (pool.balance || 0) - expectedBalance,
        });
      }

      if (pool.status === 'overdrawn' || pool.balance < 0) {
        issues.pools.overdrawn.push({
          id: pool.id,
          name: pool.pool_name,
          balance: pool.balance,
        });
      }
    }

    // Calculate totals
    const totals = {
      parts: {
        scanned: parts.length,
        issues: issues.parts.missing_retail.length + issues.parts.missing_cost.length + 
                issues.parts.negative_retail.length + issues.parts.negative_cost.length,
      },
      commitments: {
        scanned: commitments.filter(c => c.commitment_status !== 'cancelled').length,
        issues: Object.values(issues.commitments).reduce((sum, arr) => sum + arr.length, 0),
      },
      lineItems: {
        scanned: lineItems.length,
        issues: Object.values(issues.lineItems).reduce((sum, arr) => sum + arr.length, 0),
      },
      installedParts: {
        scanned: installedParts.filter(ip => !ip.is_reversed).length,
        issues: Object.values(issues.installedParts).reduce((sum, arr) => sum + arr.length, 0),
      },
      pools: {
        scanned: pools.length,
        issues: Object.values(issues.pools).reduce((sum, arr) => sum + arr.length, 0),
      },
    };

    const totalIssues = Object.values(totals).reduce((sum, t) => sum + t.issues, 0);
    const integrityScore = totalIssues === 0 ? 100 : 
      Math.round(100 - (totalIssues / (parts.length + commitments.length + lineItems.length) * 100));

    return Response.json({
      success: true,
      timestamp,
      integrity: {
        score: Math.max(0, integrityScore),
        status: integrityScore >= 95 ? 'PASS' : integrityScore >= 80 ? 'WARNING' : 'FAIL',
        total_issues: totalIssues,
      },
      totals,
      issues,
      recommendations: [
        issues.parts.missing_retail.length > 0 ? `Fix ${issues.parts.missing_retail.length} parts with missing retail prices` : null,
        issues.parts.missing_cost.length > 0 ? `Fix ${issues.parts.missing_cost.length} parts with missing costs` : null,
        issues.commitments.orphaned.length > 0 ? `Review ${issues.commitments.orphaned.length} orphaned commitments` : null,
        issues.commitments.zero_exposure_with_gap.length > 0 ? `Recalculate exposure for ${issues.commitments.zero_exposure_with_gap.length} commitments` : null,
        issues.pools.balance_mismatch.length > 0 ? `Recalculate ${issues.pools.balance_mismatch.length} pool balances` : null,
      ].filter(Boolean),
    });

  } catch (error) {
    console.error("verifyPricingIntegrity error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});