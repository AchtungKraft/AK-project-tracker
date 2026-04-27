/**
 * auditLandedCostSync.js
 * 
 * END-TO-END LANDED COST INTEGRITY AUDIT
 * 
 * Verifies that PO-level costs were correctly allocated to line items
 * and that commitment costs match PO effective costs.
 * 
 * Input: { order_id: string }  — audit single PO
 *    OR: { project_id: string } — audit all POs for a project
 *    OR: {} — audit ALL POs
 * 
 * Output: { ok, errors, warnings, summary }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { order_id, project_id, limit = 50 } = payload;

    // Determine which orders to audit
    let orders;
    if (order_id) {
      orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
    } else if (project_id) {
      // Get all PO lines for project commitments, then find their orders
      const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ project_id });
      const cIds = commitments.map(c => c.id);
      if (cIds.length === 0) {
        return Response.json({ ok: true, errors: [], warnings: [], summary: { orders_audited: 0, message: 'No commitments for project' } });
      }
      const allLines = [];
      for (const cid of cIds) {
        const lines = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ commitment_id: cid });
        allLines.push(...lines);
      }
      const orderIds = [...new Set(allLines.map(l => l.order_id).filter(Boolean))];
      if (orderIds.length === 0) {
        return Response.json({ ok: true, errors: [], warnings: [], summary: { orders_audited: 0, message: 'No POs for project' } });
      }
      orders = await base44.asServiceRole.entities.Order.filter({ id: { $in: orderIds } });
    } else {
      // All orders (with limit)
      orders = await base44.asServiceRole.entities.Order.list('-created_date', limit);
    }

    if (orders.length === 0) {
      return Response.json({ ok: true, errors: [], warnings: [], summary: { orders_audited: 0 } });
    }

    const errors = [];
    const warnings = [];
    let totalLinesChecked = 0;
    let totalCommitmentsChecked = 0;
    let allocationMismatches = 0;
    let commitmentMismatches = 0;

    for (const po of orders) {
      const poLines = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ order_id: po.id });
      const activeLines = poLines.filter(l => l.status !== 'Cancelled');
      totalLinesChecked += activeLines.length;

      if (activeLines.length === 0) continue;

      // ── Step 2: Validate Allocation ──
      const freightTotal = Number(po.freight_cost) || 0;
      const tariffTotal = Number(po.tariff_cost) || 0;
      const miscTotal = Number(po.misc_cost) || 0;
      const taxTotal = Number(po.tax) || 0;
      const expectedExtras = freightTotal + tariffTotal + miscTotal + taxTotal;

      const allocatedTotal = activeLines.reduce((sum, l) => {
        return sum + (Number(l.allocated_freight) || 0) + (Number(l.allocated_tariff) || 0) +
          (Number(l.allocated_misc) || 0) + (Number(l.allocated_tax) || 0);
      }, 0);

      if (expectedExtras > 0 && Math.abs(allocatedTotal - expectedExtras) > 0.01) {
        allocationMismatches++;
        errors.push({
          type: 'ALLOCATION_MISMATCH',
          order_id: po.id,
          po_number: po.po_number,
          expected: Number(expectedExtras.toFixed(2)),
          actual: Number(allocatedTotal.toFixed(2)),
          diff: Number((allocatedTotal - expectedExtras).toFixed(2)),
        });
      }

      // Check each line has effective_unit_cost set
      for (const line of activeLines) {
        if (expectedExtras > 0 && (line.effective_unit_cost == null || line.effective_unit_cost === 0)) {
          warnings.push({
            type: 'MISSING_EFFECTIVE_COST',
            order_id: po.id,
            po_number: po.po_number,
            line_id: line.id,
            part_id: line.part_id,
            unit_cost: line.unit_cost,
          });
        }

        // Validate effective_unit_cost math
        if (line.effective_unit_cost != null && line.unit_cost != null && (line.qty_ordered || 0) > 0) {
          const lineExtras = (Number(line.allocated_freight) || 0) + (Number(line.allocated_tariff) || 0) +
            (Number(line.allocated_misc) || 0) + (Number(line.allocated_tax) || 0);
          const expectedEffective = Number((line.unit_cost + (lineExtras / line.qty_ordered)).toFixed(2));
          if (Math.abs((line.effective_unit_cost || 0) - expectedEffective) > 0.01) {
            warnings.push({
              type: 'EFFECTIVE_COST_MATH_ERROR',
              line_id: line.id,
              order_id: po.id,
              expected_effective: expectedEffective,
              actual_effective: line.effective_unit_cost,
            });
          }
        }
      }

      // ── Step 3: Validate Commitment Sync ──
      const commitmentIds = [...new Set(activeLines.map(l => l.commitment_id).filter(Boolean))];
      if (commitmentIds.length === 0) continue;

      const commitments = await base44.asServiceRole.entities.PartCommitment.filter({
        id: { $in: commitmentIds }
      });
      const commitmentMap = new Map(commitments.map(c => [c.id, c]));
      totalCommitmentsChecked += commitments.length;

      // Group lines by commitment to compute expected weighted avg
      const linesByCommitment = new Map();
      for (const line of activeLines) {
        if (!line.commitment_id) continue;
        if (!linesByCommitment.has(line.commitment_id)) linesByCommitment.set(line.commitment_id, []);
        linesByCommitment.get(line.commitment_id).push(line);
      }

      for (const [cid, cLines] of linesByCommitment.entries()) {
        const commitment = commitmentMap.get(cid);
        if (!commitment) continue;

        // Skip locked commitments (they shouldn't have been synced)
        if (['invoiced', 'paid'].includes(commitment.billing_status)) continue;
        if (commitment.cost_override === true) continue;

        // Compute expected weighted avg from PO lines
        let tc = 0, tq = 0;
        for (const li of cLines) {
          const qty = li.qty_ordered || 0;
          const cost = li.effective_unit_cost ?? li.unit_cost ?? 0;
          tc += qty * cost;
          tq += qty;
        }
        const expectedCost = tq > 0 ? Number((tc / tq).toFixed(2)) : 0;
        const actualCost = commitment.unit_cost_snapshot ?? 0;

        if (expectedCost > 0 && Math.abs(actualCost - expectedCost) > 0.01) {
          commitmentMismatches++;
          errors.push({
            type: 'COMMITMENT_COST_MISMATCH',
            commitment_id: cid,
            part_id: commitment.part_id,
            order_id: po.id,
            po_number: po.po_number,
            expected_cost: expectedCost,
            actual_cost: actualCost,
            diff: Number((actualCost - expectedCost).toFixed(2)),
          });
        }
      }
    }

    const result = {
      ok: errors.length === 0,
      errors,
      warnings,
      summary: {
        orders_audited: orders.length,
        lines_checked: totalLinesChecked,
        commitments_checked: totalCommitmentsChecked,
        allocation_mismatches: allocationMismatches,
        commitment_mismatches: commitmentMismatches,
        warning_count: warnings.length,
      },
    };

    console.log("LANDED COST AUDIT", result.summary);

    return Response.json(result);
  } catch (error) {
    console.error('auditLandedCostSync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});