import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * supplyProductionGate - Production readiness gate for supply system
 * 
 * Validates:
 * - Pool-first invariant
 * - Exposure integrity
 * - Single credit pool rule
 * - Vendor charge idempotency
 * - Reservation cleanup
 * - Lifecycle gating consistency
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

    // Fetch all relevant data
    const [commitments, pools, allocations, charges, lineItems, installedParts, inventoryItems] = await Promise.all([
      base44.entities.PartCommitment.list(),
      base44.entities.BillingPool.list(),
      base44.entities.PoolAllocation.list(),
      base44.entities.PoolCharge.list(),
      base44.entities.PartPurchaseLineItem.list(),
      base44.entities.InstalledPart.list(),
      base44.entities.InventoryItem.list(),
    ]);

    const gates = {
      timestamp: new Date().toISOString(),
      
      // Gate 1: Pool-first invariant
      poolFirstInvariant: {
        description: 'Pools must be consumed before ordering (exposure covered)',
        violations: [],
        status: 'CHECKING',
      },
      
      // Gate 2: Exposure integrity
      exposureIntegrity: {
        description: 'Exposure = planned_retail - covered_retail at all times',
        violations: [],
        status: 'CHECKING',
      },
      
      // Gate 3: Single credit pool rule
      singleCreditPoolRule: {
        description: 'Each project has at most one credit pool',
        violations: [],
        status: 'CHECKING',
      },
      
      // Gate 4: Vendor charge idempotency
      vendorChargeIdempotency: {
        description: 'Same vendor invoice cannot create duplicate charges',
        violations: [],
        status: 'CHECKING',
      },
      
      // Gate 5: Reservation cleanup
      reservationCleanup: {
        description: 'No orphaned reservations exist',
        violations: [],
        status: 'CHECKING',
      },
      
      // Gate 6: Lifecycle gating consistency
      lifecycleGatingConsistency: {
        description: 'Commitment status matches qty progression',
        violations: [],
        status: 'CHECKING',
      },
    };

    // Check Gate 1: Pool-first invariant
    const activeCommitments = commitments.filter(c => c.commitment_status !== 'cancelled');
    activeCommitments.forEach(c => {
      if (c.commitment_status !== 'planned' && (c.exposure_gap || 0) > 0) {
        // Ordered but still has exposure - check if pool was overdrawn
        const projectPools = pools.filter(p => p.project_id === c.project_id && p.status !== 'closed');
        const totalPoolBalance = projectPools.reduce((sum, p) => sum + (p.balance || 0), 0);
        
        if (totalPoolBalance < 0) {
          gates.poolFirstInvariant.violations.push({
            commitment_id: c.id,
            exposure_gap: c.exposure_gap,
            pool_balance: totalPoolBalance,
            note: 'Commitment ordered with insufficient pool coverage',
          });
        }
      }
    });
    gates.poolFirstInvariant.status = gates.poolFirstInvariant.violations.length === 0 ? 'PASS' : 'WARN';

    // Check Gate 2: Exposure integrity
    activeCommitments.forEach(c => {
      const plannedRetail = c.planned_retail_total || 0;
      const coveredRetail = c.covered_retail_total || 0;
      const expectedExposure = Math.max(0, plannedRetail - coveredRetail);
      const actualExposure = c.exposure_gap || 0;
      
      // Allow small floating point differences
      if (Math.abs(expectedExposure - actualExposure) > 0.01) {
        gates.exposureIntegrity.violations.push({
          commitment_id: c.id,
          planned_retail: plannedRetail,
          covered_retail: coveredRetail,
          expected_exposure: expectedExposure,
          actual_exposure: actualExposure,
          note: 'Exposure calculation mismatch',
        });
      }
    });
    gates.exposureIntegrity.status = gates.exposureIntegrity.violations.length === 0 ? 'PASS' : 'FAIL';

    // Check Gate 3: Single credit pool rule
    const creditPoolsByProject = {};
    pools.filter(p => p.pool_type === 'credit').forEach(p => {
      if (!creditPoolsByProject[p.project_id]) {
        creditPoolsByProject[p.project_id] = [];
      }
      creditPoolsByProject[p.project_id].push(p.id);
    });
    Object.entries(creditPoolsByProject).forEach(([projectId, poolIds]) => {
      if (poolIds.length > 1) {
        gates.singleCreditPoolRule.violations.push({
          project_id: projectId,
          credit_pool_count: poolIds.length,
          pool_ids: poolIds,
          note: 'Multiple credit pools exist for same project',
        });
      }
    });
    gates.singleCreditPoolRule.status = gates.singleCreditPoolRule.violations.length === 0 ? 'PASS' : 'FAIL';

    // Check Gate 4: Vendor charge idempotency
    const chargesByInvoice = {};
    charges.filter(c => !c.is_reversed && c.vendor_invoice_id).forEach(c => {
      const key = `${c.vendor_invoice_id}-${c.line_item_id || 'none'}`;
      if (!chargesByInvoice[key]) {
        chargesByInvoice[key] = [];
      }
      chargesByInvoice[key].push(c.id);
    });
    Object.entries(chargesByInvoice).forEach(([key, chargeIds]) => {
      if (chargeIds.length > 1) {
        gates.vendorChargeIdempotency.violations.push({
          invoice_key: key,
          duplicate_count: chargeIds.length,
          charge_ids: chargeIds,
          note: 'Duplicate charges for same invoice line',
        });
      }
    });
    gates.vendorChargeIdempotency.status = gates.vendorChargeIdempotency.violations.length === 0 ? 'PASS' : 'WARN';

    // Check Gate 5: Reservation cleanup
    const activeLineItemIds = new Set(lineItems.filter(li => !li.is_cancelled).map(li => li.id));
    const activeCommitmentIds = new Set(activeCommitments.map(c => c.id));
    
    inventoryItems.filter(item => (item.quantity_reserved || 0) > 0).forEach(item => {
      // Check if reservation has a valid source
      if (item.reserved_for_commitment_id && !activeCommitmentIds.has(item.reserved_for_commitment_id)) {
        gates.reservationCleanup.violations.push({
          inventory_id: item.id,
          reserved_qty: item.quantity_reserved,
          commitment_id: item.reserved_for_commitment_id,
          note: 'Reservation for cancelled/missing commitment',
        });
      }
    });
    gates.reservationCleanup.status = gates.reservationCleanup.violations.length === 0 ? 'PASS' : 'WARN';

    // Check Gate 6: Lifecycle gating consistency
    activeCommitments.forEach(c => {
      const qtyCommitted = c.qty_committed || 0;
      const qtyOrdered = c.qty_ordered || 0;
      const qtyReceived = c.qty_received || 0;
      const qtyInstalled = c.qty_installed || 0;
      
      // Status should match qty progression
      if (c.commitment_status === 'planned' && qtyOrdered > 0) {
        gates.lifecycleGatingConsistency.violations.push({
          commitment_id: c.id,
          status: c.commitment_status,
          qty_ordered: qtyOrdered,
          note: 'Status is planned but qty_ordered > 0',
        });
      }
      if (c.commitment_status === 'ordered' && qtyOrdered === 0) {
        gates.lifecycleGatingConsistency.violations.push({
          commitment_id: c.id,
          status: c.commitment_status,
          qty_ordered: qtyOrdered,
          note: 'Status is ordered but qty_ordered = 0',
        });
      }
      if (c.commitment_status === 'installed' && qtyInstalled === 0) {
        gates.lifecycleGatingConsistency.violations.push({
          commitment_id: c.id,
          status: c.commitment_status,
          qty_installed: qtyInstalled,
          note: 'Status is installed but qty_installed = 0',
        });
      }
    });
    gates.lifecycleGatingConsistency.status = gates.lifecycleGatingConsistency.violations.length === 0 ? 'PASS' : 'WARN';

    // Summary
    const allGates = [
      gates.poolFirstInvariant,
      gates.exposureIntegrity,
      gates.singleCreditPoolRule,
      gates.vendorChargeIdempotency,
      gates.reservationCleanup,
      gates.lifecycleGatingConsistency,
    ];
    
    const failCount = allGates.filter(g => g.status === 'FAIL').length;
    const warnCount = allGates.filter(g => g.status === 'WARN').length;
    const passCount = allGates.filter(g => g.status === 'PASS').length;

    gates.summary = {
      totalGates: allGates.length,
      pass: passCount,
      warn: warnCount,
      fail: failCount,
      productionReady: failCount === 0,
      OVERALL: failCount === 0 ? (warnCount === 0 ? 'PASS' : 'WARN') : 'FAIL',
    };

    return Response.json({
      success: true,
      gates,
    });

  } catch (error) {
    console.error("supplyProductionGate error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});