import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * normalizeLegacyPricing - Data Repair Script for Legacy Records
 * 
 * Normalizes:
 * - Part: Ensures cost and retail_price are set
 * - PartCommitment: Ensures planned_retail_total, actual_extended_cost, coverage
 * - PartPurchaseLineItem: Ensures unit_cost, line_total
 * - InstalledPart: Ensures unit_cost_at_install, extended_cost
 * 
 * IMPORTANT: Does not overwrite locked costs
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
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { dry_run = true } = await req.json();
    const timestamp = new Date().toISOString();
    
    const logs = [];
    const changes = {
      parts: { scanned: 0, updated: 0, issues: [] },
      commitments: { scanned: 0, updated: 0, issues: [] },
      lineItems: { scanned: 0, updated: 0, issues: [] },
      installedParts: { scanned: 0, updated: 0, issues: [] },
    };

    // Fetch all data
    const [parts, commitments, lineItems, installedParts, markupMatrix] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list(),
      base44.asServiceRole.entities.InstalledPart.list(),
      base44.asServiceRole.entities.RetailMarkupMatrix.list(),
    ]);

    // Default markup if no matrix
    const defaultMarkup = 1.5; // 50% markup

    // Create parts lookup
    const partsMap = new Map(parts.map(p => [p.id, p]));

    // 1. NORMALIZE PARTS
    logs.push('=== PART NORMALIZATION ===');
    for (const part of parts) {
      changes.parts.scanned++;
      const updates = {};
      const issues = [];

      // Check for missing cost
      if (!part.default_cost && part.default_cost !== 0) {
        issues.push('missing_cost');
        // Try to infer from retail
        if (part.default_retail) {
          updates.default_cost = part.default_retail / defaultMarkup;
        }
      }

      // Check for missing retail
      if (!part.default_retail && part.default_retail !== 0) {
        issues.push('missing_retail');
        // Calculate from cost + markup
        if (part.default_cost) {
          const markup = getMarkupForCost(part.default_cost, markupMatrix);
          updates.default_retail = part.default_cost * markup;
          updates.applied_markup_pct = (markup - 1) * 100;
          updates.pricing_mode = 'matrix';
        }
      }

      // Negative values
      if (part.default_cost < 0) {
        issues.push('negative_cost');
        changes.parts.issues.push({ part_id: part.id, part_name: part.part_name, issue: 'negative_cost' });
      }
      if (part.default_retail < 0) {
        issues.push('negative_retail');
        changes.parts.issues.push({ part_id: part.id, part_name: part.part_name, issue: 'negative_retail' });
      }

      if (Object.keys(updates).length > 0) {
        logs.push(`Part ${part.id} (${part.part_name}): ${JSON.stringify(updates)}`);
        if (!dry_run) {
          await base44.asServiceRole.entities.Part.update(part.id, updates);
        }
        changes.parts.updated++;
      }
    }

    // 2. NORMALIZE COMMITMENTS
    logs.push('=== COMMITMENT NORMALIZATION ===');
    for (const commitment of commitments) {
      changes.commitments.scanned++;
      const updates = {};
      const part = partsMap.get(commitment.part_id);

      // Calculate expected planned_retail_total
      const qtyCommitted = commitment.qty_committed || 0;
      const unitRetail = commitment.unit_retail_snapshot || part?.default_retail || 0;
      const expectedPlannedRetail = qtyCommitted * unitRetail;

      // Check planned_retail_total
      if (!commitment.planned_retail_total || Math.abs(commitment.planned_retail_total - expectedPlannedRetail) > 0.01) {
        updates.planned_retail_total = expectedPlannedRetail;
      }

      // Check unit_retail_snapshot
      if (!commitment.unit_retail_snapshot && part?.default_retail) {
        updates.unit_retail_snapshot = part.default_retail;
      }

      // Check unit_cost_snapshot
      if (!commitment.unit_cost_snapshot && part?.default_cost) {
        updates.unit_cost_snapshot = part.default_cost;
      }

      // Calculate actual_extended_cost if missing
      if (!commitment.actual_extended_cost && commitment.unit_cost_snapshot) {
        updates.actual_extended_cost = qtyCommitted * (commitment.actual_unit_cost || commitment.unit_cost_snapshot);
      }

      // Recalculate exposure_gap
      const coveredRetail = commitment.covered_retail_total || 0;
      const plannedRetail = updates.planned_retail_total || commitment.planned_retail_total || 0;
      const expectedExposure = plannedRetail - coveredRetail;
      
      if (commitment.exposure_gap === undefined || commitment.exposure_gap === null || 
          Math.abs((commitment.exposure_gap || 0) - expectedExposure) > 0.01) {
        updates.exposure_gap = expectedExposure;
      }

      // Issue tracking
      if (qtyCommitted === 0) {
        changes.commitments.issues.push({ 
          commitment_id: commitment.id, 
          issue: 'zero_qty_committed' 
        });
      }
      if (!part) {
        changes.commitments.issues.push({ 
          commitment_id: commitment.id, 
          part_id: commitment.part_id,
          issue: 'orphaned_commitment' 
        });
      }

      if (Object.keys(updates).length > 0) {
        logs.push(`Commitment ${commitment.id}: ${JSON.stringify(updates)}`);
        if (!dry_run) {
          await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);
        }
        changes.commitments.updated++;
      }
    }

    // 3. NORMALIZE LINE ITEMS
    logs.push('=== LINE ITEM NORMALIZATION ===');
    for (const lineItem of lineItems) {
      changes.lineItems.scanned++;
      
      // Skip locked costs
      if (lineItem.cost_locked_at) {
        continue;
      }

      const updates = {};
      const part = partsMap.get(lineItem.part_id);

      // Check unit_price
      if (!lineItem.unit_price && part?.default_cost) {
        updates.unit_price = part.default_cost;
      }

      // Recalculate line_total
      const qty = lineItem.qty_ordered || 0;
      const unitPrice = updates.unit_price || lineItem.unit_price || 0;
      const expectedTotal = qty * unitPrice;
      
      if (!lineItem.line_total || Math.abs(lineItem.line_total - expectedTotal) > 0.01) {
        updates.line_total = expectedTotal;
      }

      if (Object.keys(updates).length > 0) {
        logs.push(`LineItem ${lineItem.id}: ${JSON.stringify(updates)}`);
        if (!dry_run) {
          await base44.asServiceRole.entities.PartPurchaseLineItem.update(lineItem.id, updates);
        }
        changes.lineItems.updated++;
      }
    }

    // 4. NORMALIZE INSTALLED PARTS
    logs.push('=== INSTALLED PART NORMALIZATION ===');
    const commitmentsMap = new Map(commitments.map(c => [c.id, c]));
    
    for (const installed of installedParts) {
      changes.installedParts.scanned++;
      const updates = {};
      const commitment = commitmentsMap.get(installed.commitment_id);

      // Check unit_cost_at_install
      if (!installed.unit_cost_at_install && commitment) {
        updates.unit_cost_at_install = commitment.actual_unit_cost || commitment.unit_cost_snapshot || 0;
      }

      // Calculate extended_cost
      const qty = installed.qty_consumed || 0;
      const unitCost = updates.unit_cost_at_install || installed.unit_cost_at_install || 0;
      const expectedExtended = qty * unitCost;

      if (!installed.extended_cost || Math.abs(installed.extended_cost - expectedExtended) > 0.01) {
        updates.extended_cost = expectedExtended;
      }

      if (Object.keys(updates).length > 0) {
        logs.push(`InstalledPart ${installed.id}: ${JSON.stringify(updates)}`);
        if (!dry_run) {
          await base44.asServiceRole.entities.InstalledPart.update(installed.id, updates);
        }
        changes.installedParts.updated++;
      }
    }

    // Summary
    const summary = {
      parts: `${changes.parts.updated}/${changes.parts.scanned} updated`,
      commitments: `${changes.commitments.updated}/${changes.commitments.scanned} updated`,
      lineItems: `${changes.lineItems.updated}/${changes.lineItems.scanned} updated`,
      installedParts: `${changes.installedParts.updated}/${changes.installedParts.scanned} updated`,
    };

    return Response.json({
      success: true,
      timestamp,
      dry_run,
      summary,
      changes,
      logs: logs.slice(0, 100), // First 100 logs
      total_logs: logs.length,
    });

  } catch (error) {
    console.error("normalizeLegacyPricing error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Get markup percentage from matrix based on cost range
 */
function getMarkupForCost(cost, matrix) {
  if (!matrix || matrix.length === 0) {
    return 1.5; // Default 50% markup
  }

  // Sort by min_cost ascending
  const sorted = [...matrix].sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0));
  
  for (const tier of sorted) {
    const min = tier.min_cost || 0;
    const max = tier.max_cost || Infinity;
    
    if (cost >= min && cost <= max) {
      return 1 + ((tier.markup_percent || 50) / 100);
    }
  }
  
  // Default to last tier or 50%
  const lastTier = sorted[sorted.length - 1];
  return lastTier ? 1 + ((lastTier.markup_percent || 50) / 100) : 1.5;
}