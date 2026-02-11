import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Pricing Integrity Validator
 * 
 * Flags:
 * - Missing retail snapshot
 * - Missing cost
 * - Negative margin
 * - Invoice mismatch vs PO
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { project_id, fix_missing_retail = false } = body;

    // Fetch data
    const [commitments, parts, assignments, lineItems, invoiceLineItems] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartBuildAssignment.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list(),
      base44.asServiceRole.entities.VendorInvoiceLineItem.list().catch(() => []),
    ]);

    // Filter by project if specified
    const targetCommitments = project_id 
      ? commitments.filter(c => c.project_id === project_id)
      : commitments;

    // Build lookups
    const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
    const assignmentsMap = {};
    assignments.forEach(a => {
      const key = `${a.project_id}_${a.part_id}`;
      assignmentsMap[key] = a;
    });
    const lineItemsMap = Object.fromEntries(lineItems.map(li => [li.id, li]));
    
    // Build invoice line items by PO line item
    const invoiceByLineItem = {};
    invoiceLineItems.forEach(ili => {
      if (ili.purchase_line_item_id) {
        if (!invoiceByLineItem[ili.purchase_line_item_id]) {
          invoiceByLineItem[ili.purchase_line_item_id] = [];
        }
        invoiceByLineItem[ili.purchase_line_item_id].push(ili);
      }
    });

    const issues = [];
    const stats = {
      total_commitments: targetCommitments.length,
      active_commitments: 0,
      missing_retail: 0,
      missing_cost: 0,
      negative_margin: 0,
      invoice_variance: 0,
      pricing_ok: 0,
      fixed: 0,
    };

    const activeCommitments = targetCommitments.filter(c => c.commitment_status !== 'cancelled');
    stats.active_commitments = activeCommitments.length;

    for (const commitment of activeCommitments) {
      const part = partsMap[commitment.part_id];
      const assignmentKey = `${commitment.project_id}_${commitment.part_id}`;
      const assignment = assignmentsMap[assignmentKey];
      
      const issueList = [];
      let needsUpdate = false;
      const updateData = {};

      // Check missing retail snapshot
      if (!commitment.unit_retail_snapshot) {
        stats.missing_retail++;
        issueList.push('missing_retail');
        
        if (fix_missing_retail) {
          // Try to backfill from assignment or part
          const retailSource = assignment?.unit_retail || part?.default_retail;
          if (retailSource) {
            updateData.unit_retail_snapshot = retailSource;
            needsUpdate = true;
            stats.fixed++;
          }
        }
      }

      // Check missing cost
      if (!commitment.actual_unit_cost && !commitment.unit_cost_snapshot) {
        stats.missing_cost++;
        issueList.push('missing_cost');
      }

      // Check negative margin
      if (commitment.margin_pct !== null && commitment.margin_pct < 0) {
        stats.negative_margin++;
        issueList.push('negative_margin');
      }

      // Check invoice variance
      const linkedLineItemIds = commitment.order_line_item_ids || [];
      for (const liId of linkedLineItemIds) {
        const lineItem = lineItemsMap[liId];
        const invoiceLines = invoiceByLineItem[liId] || [];
        
        if (lineItem && invoiceLines.length > 0) {
          const poUnitCost = lineItem.unit_cost || 0;
          const invoicedCost = invoiceLines[0].actual_unit_cost || 0;
          
          if (poUnitCost > 0 && invoicedCost > 0) {
            const variance = Math.abs((invoicedCost - poUnitCost) / poUnitCost) * 100;
            if (variance > 5) { // More than 5% variance
              stats.invoice_variance++;
              issueList.push(`invoice_variance_${variance.toFixed(1)}%`);
            }
          }
        }
      }

      // Apply updates if needed
      if (needsUpdate) {
        // Recalculate margin if we have retail now
        if (updateData.unit_retail_snapshot && commitment.actual_unit_cost) {
          updateData.margin_pct = ((updateData.unit_retail_snapshot - commitment.actual_unit_cost) / updateData.unit_retail_snapshot) * 100;
        }
        
        // Determine new status
        if (updateData.unit_retail_snapshot) {
          if (commitment.actual_unit_cost) {
            updateData.pricing_integrity_status = updateData.margin_pct < 0 ? 'margin_negative' : 'ok';
          } else {
            updateData.pricing_integrity_status = 'estimated_cost';
          }
        }
        
        updateData.commitment_version = (commitment.commitment_version || 1) + 1;
        
        await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updateData);
      }

      if (issueList.length === 0) {
        stats.pricing_ok++;
      } else {
        issues.push({
          commitment_id: commitment.id,
          project_id: commitment.project_id,
          part_id: commitment.part_id,
          part_name: part?.part_name,
          issues: issueList,
          current_values: {
            unit_retail_snapshot: commitment.unit_retail_snapshot,
            unit_cost_snapshot: commitment.unit_cost_snapshot,
            actual_unit_cost: commitment.actual_unit_cost,
            margin_pct: commitment.margin_pct,
            pricing_integrity_status: commitment.pricing_integrity_status,
          }
        });
      }
    }

    return Response.json({
      success: true,
      stats,
      issues,
      summary: {
        has_issues: issues.length > 0,
        issue_count: issues.length,
        integrity_percentage: stats.active_commitments > 0
          ? Math.round((stats.pricing_ok / stats.active_commitments) * 100)
          : 100,
      }
    });

  } catch (error) {
    console.error('Pricing validation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});