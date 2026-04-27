/**
 * allocatePOCosts.js
 * 
 * LANDED COST ALLOCATION ENGINE
 * 
 * Distributes PO-level costs (freight, tariff, tax, misc) proportionally
 * across PO line items based on each line's share of the base item total.
 * 
 * Computes effective_unit_cost = unit_cost + (allocated extras / qty_ordered)
 * 
 * After allocation, triggers syncPOCostToCommitment to propagate
 * effective costs upstream to commitments.
 * 
 * Input: { order_id: string }
 * Output: { success, allocated_lines, allocation_summary, commitment_sync }
 * 
 * NON-NEGOTIABLE:
 * - Does NOT touch invoice layer
 * - Does NOT modify billing lifecycle
 * - Only writes to PartPurchaseLineItem allocation fields + effective_unit_cost
 * - Then triggers commitment sync
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Flexible auth — works from user context or service role
    let actorEmail = 'system';
    try {
      const user = await base44.auth.me();
      if (user?.email) actorEmail = user.email;
    } catch (_e) {
      // Service role / automation call — fine
    }

    const payload = await req.json();
    const { order_id } = payload;

    if (!order_id) {
      return Response.json({ error: 'order_id required' }, { status: 400 });
    }

    // Fetch PO and its line items
    const [orders, poLines] = await Promise.all([
      base44.asServiceRole.entities.Order.filter({ id: order_id }),
      base44.asServiceRole.entities.PartPurchaseLineItem.filter({ order_id }),
    ]);

    const po = orders[0];
    if (!po) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Filter to active (non-cancelled) lines
    const activeLines = poLines.filter(l => l.status !== 'Cancelled');
    if (activeLines.length === 0) {
      return Response.json({
        success: true,
        message: 'No active lines to allocate',
        allocated_lines: [],
        allocation_summary: null,
      });
    }

    // ── PHASE 2: Compute base item total ──
    const baseTotal = activeLines.reduce((sum, line) => {
      return sum + ((line.unit_cost || 0) * (line.qty_ordered || 0));
    }, 0);

    // PO-level extras
    const freightTotal = Number(po.freight_cost) || 0;
    const tariffTotal = Number(po.tariff_cost) || 0;
    const miscTotal = Number(po.misc_cost) || 0;
    const taxTotal = Number(po.tax) || 0;
    const extrasTotal = freightTotal + tariffTotal + miscTotal + taxTotal;

    // ── PHASE 3: Allocation engine ──
    const allocatedLines = [];

    if (baseTotal <= 0 || extrasTotal <= 0) {
      // No extras or no base cost — effective_unit_cost = unit_cost
      for (const line of activeLines) {
        const unitCost = line.unit_cost || 0;
        const updates = {
          allocated_freight: 0,
          allocated_tariff: 0,
          allocated_misc: 0,
          allocated_tax: 0,
          effective_unit_cost: Number(unitCost.toFixed(2)),
        };
        await base44.asServiceRole.entities.PartPurchaseLineItem.update(line.id, updates);
        allocatedLines.push({
          line_id: line.id,
          part_id: line.part_id,
          unit_cost: unitCost,
          effective_unit_cost: unitCost,
          ...updates,
        });
      }
    } else {
      // Proportional allocation
      let runningFreight = 0, runningTariff = 0, runningMisc = 0, runningTax = 0;

      for (let i = 0; i < activeLines.length; i++) {
        const line = activeLines[i];
        const unitCost = line.unit_cost || 0;
        const qty = line.qty_ordered || 0;
        const lineBase = unitCost * qty;
        const isLast = i === activeLines.length - 1;

        let allocFreight, allocTariff, allocMisc, allocTax;

        if (isLast) {
          // Last line gets remainder to avoid rounding drift
          allocFreight = Number((freightTotal - runningFreight).toFixed(2));
          allocTariff = Number((tariffTotal - runningTariff).toFixed(2));
          allocMisc = Number((miscTotal - runningMisc).toFixed(2));
          allocTax = Number((taxTotal - runningTax).toFixed(2));
        } else {
          const ratio = lineBase / baseTotal;
          allocFreight = Number((freightTotal * ratio).toFixed(2));
          allocTariff = Number((tariffTotal * ratio).toFixed(2));
          allocMisc = Number((miscTotal * ratio).toFixed(2));
          allocTax = Number((taxTotal * ratio).toFixed(2));
        }

        runningFreight += allocFreight;
        runningTariff += allocTariff;
        runningMisc += allocMisc;
        runningTax += allocTax;

        const totalAllocatedExtras = allocFreight + allocTariff + allocMisc + allocTax;
        const effectiveUnitCost = qty > 0
          ? Number((unitCost + (totalAllocatedExtras / qty)).toFixed(2))
          : unitCost;

        const updates = {
          allocated_freight: allocFreight,
          allocated_tariff: allocTariff,
          allocated_misc: allocMisc,
          allocated_tax: allocTax,
          effective_unit_cost: effectiveUnitCost,
        };

        await base44.asServiceRole.entities.PartPurchaseLineItem.update(line.id, updates);
        allocatedLines.push({
          line_id: line.id,
          part_id: line.part_id,
          unit_cost: unitCost,
          qty: qty,
          line_base: lineBase,
          ...updates,
          effective_unit_cost: effectiveUnitCost,
        });
      }
    }

    // ── PHASE 8: Validation guard ──
    const totalAllocated = allocatedLines.reduce((sum, l) => {
      return sum + (l.allocated_freight || 0) + (l.allocated_tariff || 0) +
        (l.allocated_misc || 0) + (l.allocated_tax || 0);
    }, 0);

    if (extrasTotal > 0 && Math.abs(totalAllocated - extrasTotal) > 0.01) {
      console.error("PO ALLOCATION MISMATCH", {
        order_id,
        expected: extrasTotal,
        actual: totalAllocated,
        diff: totalAllocated - extrasTotal,
      });
    }

    // ── PHASE 10: Debug logging ──
    console.log("PO COST ALLOCATION", {
      po_id: order_id,
      po_number: po.po_number,
      base_total: Number(baseTotal.toFixed(2)),
      freight_total: freightTotal,
      tariff_total: tariffTotal,
      misc_total: miscTotal,
      tax_total: taxTotal,
      extras_total: extrasTotal,
      allocated_total: Number(totalAllocated.toFixed(2)),
      line_count: allocatedLines.length,
      actor: actorEmail,
    });

    // ── PHASE 5: Propagate to commitments via syncPOCostToCommitment ──
    const commitmentIds = [...new Set(
      activeLines.map(l => l.commitment_id).filter(Boolean)
    )];

    let commitmentSync = { synced: 0, skipped: 0, errors: 0 };
    if (commitmentIds.length > 0) {
      try {
        const syncResult = await base44.asServiceRole.functions.invoke(
          'syncPOCostToCommitment',
          { commitment_ids: commitmentIds }
        );
        commitmentSync = {
          synced: syncResult.data?.synced?.length || 0,
          skipped: syncResult.data?.skipped?.length || 0,
          errors: syncResult.data?.errors?.length || 0,
        };
      } catch (e) {
        console.warn('[ALLOCATE_PO] Commitment sync failed:', e.message);
        commitmentSync = { synced: 0, skipped: 0, errors: 1, error_message: e.message };
      }
    }

    return Response.json({
      success: true,
      allocated_lines: allocatedLines,
      allocation_summary: {
        order_id,
        base_total: Number(baseTotal.toFixed(2)),
        freight_total: freightTotal,
        tariff_total: tariffTotal,
        misc_total: miscTotal,
        tax_total: taxTotal,
        extras_total: extrasTotal,
        allocated_total: Number(totalAllocated.toFixed(2)),
        line_count: allocatedLines.length,
      },
      commitment_sync: commitmentSync,
    });
  } catch (error) {
    console.error('allocatePOCosts error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});