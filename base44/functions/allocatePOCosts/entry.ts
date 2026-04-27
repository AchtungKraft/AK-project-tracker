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

    // ── PHASE 5: Propagate to commitments — INLINE via service role ──
    // Direct entity updates avoid service-to-service 403 issues
    const commitmentIds = [...new Set(
      activeLines.map(l => l.commitment_id).filter(Boolean)
    )];

    const commitmentSync = { synced: 0, skipped: 0, failed: 0, failures: [] };

    if (commitmentIds.length > 0) {
      // Fetch commitments and markup matrix
      const [commitments, matrixTiers] = await Promise.all([
        base44.asServiceRole.entities.PartCommitment.filter({ id: { $in: commitmentIds } }),
        base44.asServiceRole.entities.RetailMarkupMatrix.list().then(t => t.filter(x => x.active).sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0))).catch(() => []),
      ]);
      const commitmentMap = new Map(commitments.map(c => [c.id, c]));

      // Group allocated lines by commitment
      const linesByCommitment = new Map();
      for (const al of allocatedLines) {
        const line = activeLines.find(l => l.id === al.line_id);
        if (!line?.commitment_id) continue;
        if (!linesByCommitment.has(line.commitment_id)) linesByCommitment.set(line.commitment_id, []);
        linesByCommitment.get(line.commitment_id).push({ ...line, effective_unit_cost: al.effective_unit_cost });
      }

      for (const cid of commitmentIds) {
        const commitment = commitmentMap.get(cid);
        if (!commitment) { commitmentSync.failed++; commitmentSync.failures.push({ commitment_id: cid, reason: 'NOT_FOUND' }); continue; }
        if (['cancelled', 'closed'].includes(commitment.commitment_status)) { commitmentSync.skipped++; continue; }
        if (['invoiced', 'paid'].includes(commitment.billing_status)) { commitmentSync.skipped++; continue; }
        if (commitment.cost_override === true) { commitmentSync.skipped++; continue; }

        const cLines = (linesByCommitment.get(cid) || []).filter(l => l.status !== 'Cancelled');
        if (cLines.length === 0) { commitmentSync.skipped++; continue; }

        // Weighted average using effective_unit_cost (landed cost)
        let tc = 0, tq = 0;
        for (const li of cLines) {
          const qty = li.qty_ordered || 0;
          const cost = li.effective_unit_cost ?? li.unit_cost ?? 0;
          tc += qty * cost;
          tq += qty;
        }
        const weightedAvg = tq > 0 ? Number((tc / tq).toFixed(2)) : 0;
        if (weightedAvg <= 0) { commitmentSync.skipped++; continue; }

        const oldCost = commitment.unit_cost_snapshot ?? 0;
        if (Math.abs(weightedAvg - oldCost) < 0.001) { commitmentSync.skipped++; continue; }

        const updates = {
          unit_cost_snapshot: weightedAvg,
          planned_cost_total: Number((weightedAvg * (commitment.required_total || 0)).toFixed(2)),
        };

        // Margin recalc
        const curRetail = commitment.unit_retail_snapshot ?? 0;
        if (curRetail > 0) {
          updates.margin_pct = Number(((curRetail - weightedAvg) / curRetail * 100).toFixed(2));
          updates.pricing_integrity_status = curRetail >= weightedAvg ? 'ok' : 'margin_negative';
        } else {
          updates.pricing_integrity_status = 'missing_retail';
          // Try matrix for missing retail
          if (matrixTiers.length > 0) {
            for (const tier of matrixTiers) {
              if (weightedAvg >= (tier.min_cost ?? 0) && (tier.max_cost == null || weightedAvg < tier.max_cost)) {
                const retail = Math.round(weightedAvg * (1 + (tier.markup_pct ?? 0)));
                if (retail > 0) {
                  updates.unit_retail_snapshot = retail;
                  updates.planned_retail_total = retail * (commitment.required_total || 0);
                  updates.margin_pct = Number(((retail - weightedAvg) / retail * 100).toFixed(2));
                  updates.pricing_integrity_status = 'ok';
                }
                break;
              }
            }
          }
        }

        try {
          await base44.asServiceRole.entities.PartCommitment.update(cid, updates);
          commitmentSync.synced++;
        } catch (syncErr) {
          console.error(`[ALLOCATE_PO] Commitment sync FAILED for ${cid}:`, syncErr.message);
          commitmentSync.failed++;
          commitmentSync.failures.push({ commitment_id: cid, reason: syncErr.message });
        }
      }
    }

    // PHASE 3: Warn if sync incomplete
    if (commitmentSync.failed > 0) {
      console.warn("PO ALLOCATION INCOMPLETE: commitment sync failures", {
        order_id,
        synced: commitmentSync.synced,
        failed: commitmentSync.failed,
        failures: commitmentSync.failures,
      });
    }

    console.log("PO ALLOCATION COMPLETE", {
      order_id,
      base_total: Number(baseTotal.toFixed(2)),
      extras_total: extrasTotal,
      allocated_total: Number(totalAllocated.toFixed(2)),
      sync_status: commitmentSync.failed === 0 ? 'OK' : 'PARTIAL_FAILURE',
      synced: commitmentSync.synced,
      failed: commitmentSync.failed,
    });

    return Response.json({
      success: true,
      sync_complete: commitmentSync.failed === 0,
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