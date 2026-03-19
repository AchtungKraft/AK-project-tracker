import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * getProjectSupplyState - Backend read model for Project Supply Manager
 * 
 * Returns comprehensive supply state for a project including:
 * - Requirements
 * - Commitments with computed fields
 * - Pools + ledger
 * - PO lines
 * - Inventory availability
 * - Installed parts
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

    const { project_id } = await req.json();
    
    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Fetch all related data in parallel
    const [
      projects,
      requirements,
      commitments,
      pools,
      allocations,
      charges,
      lineItems,
      installedParts,
      parts,
      vendors,
      inventoryItems,
      locations,
      orders
    ] = await Promise.all([
      base44.asServiceRole.entities.Project.filter({ id: project_id }),
      base44.asServiceRole.entities.PartProjectRequirement.filter({ project_id }),
      base44.asServiceRole.entities.PartCommitment.filter({ project_id }),
      base44.asServiceRole.entities.BillingPool.filter({ project_id }),
      base44.asServiceRole.entities.PoolAllocation.list(),
      base44.asServiceRole.entities.PoolCharge.filter({ project_id }),
      base44.asServiceRole.entities.PartPurchaseLineItem.list(),
      base44.asServiceRole.entities.InstalledPart.list(),
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.Vendor.list(),
      base44.asServiceRole.entities.InventoryItem.list(),
      base44.asServiceRole.entities.Location.list(),
      base44.asServiceRole.entities.Order.list()
    ]);

    const project = projects[0];
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Filter related data
    const poolIds = pools.map(p => p.id);
    const commitmentIds = commitments.map(c => c.id);
    
    const projectAllocations = allocations.filter(a => poolIds.includes(a.pool_id));
    const projectLineItems = lineItems.filter(li => commitmentIds.includes(li.commitment_id));
    const projectInstalled = installedParts.filter(ip => commitmentIds.includes(ip.commitment_id));

    // Build parts lookup
    const partsMap = new Map(parts.map(p => [p.id, p]));
    const vendorsMap = new Map(vendors.map(v => [v.id, v]));
    const locationsMap = new Map(locations.map(l => [l.id, l]));
    const ordersMap = new Map(orders.map(o => [o.id, o]));

    // Calculate total pool balance for funding checks
    const totalPoolBalance = pools
      .filter(p => p.status !== 'closed')
      .reduce((sum, p) => sum + (p.balance || 0), 0);

    // Enrich commitments with ALL lifecycle logic
    const enrichedCommitments = commitments
      .filter(c => c.commitment_status !== 'cancelled')
      .map(commitment => {
        const part = partsMap.get(commitment.part_id);
        const vendor = part ? vendorsMap.get(part.default_vendor_id) : null;
        const commitmentLineItems = projectLineItems.filter(li => li.commitment_id === commitment.id);
        const commitmentInstalled = projectInstalled.filter(ip => ip.commitment_id === commitment.id && !ip.is_reversed);
        const commitmentAllocations = projectAllocations.filter(a => a.commitment_id === commitment.id && !a.is_reversed);

        // Canonical quantity calculations
        const qtyCommitted = commitment.qty_committed || 0;
        const qtyOrdered = commitment.qty_ordered || 0;
        const qtyReceived = commitment.qty_received || 0;
        const qtyAllocated = commitment.qty_allocated || 0;
        const qtyInstalled = commitment.qty_installed || 0;
        const qtyCancelled = commitment.qty_cancelled || 0;

        const remaining = Math.max(0, qtyCommitted - qtyInstalled - qtyCancelled);
        const unorderedQty = Math.max(0, qtyCommitted - qtyOrdered);
        const unreceived = Math.max(0, qtyOrdered - qtyReceived);
        const unallocated = Math.max(0, qtyReceived - qtyAllocated);
        const uninstalled = Math.max(0, qtyAllocated - qtyInstalled);

        // Financial calculations
        const exposureGap = commitment.exposure_gap || 0;
        const plannedRetail = commitment.planned_retail_total || 0;
        const coveredRetail = commitment.covered_retail_total || 0;
        const coveragePercent = plannedRetail > 0 ? Math.round((coveredRetail / plannedRetail) * 100) : 0;

        // Lifecycle gating logic (CANONICAL - UI must not recalculate)
        const isFundingBlocked = exposureGap > totalPoolBalance && exposureGap > 0;
        const isPrepayRequired = commitment.requires_prepay === true;
        const isPrepayBlocked = isPrepayRequired && commitment.billing_status !== 'CLIENT_PAID';
        
        // Readiness conditions
        const canOrder = unorderedQty > 0 && !isFundingBlocked && !isPrepayBlocked;
        const canReceive = unreceived > 0;
        const canAllocate = unallocated > 0;
        const canInstall = uninstalled > 0;
        const canCancel = qtyInstalled === 0;
        const canEdit = commitment.commitment_status !== 'installed';

        // Determine lifecycle phase
        let lifecyclePhase = 'plan';
        if (qtyInstalled >= qtyCommitted && qtyCommitted > 0) {
          lifecyclePhase = 'complete';
        } else if (qtyInstalled > 0) {
          lifecyclePhase = 'installing';
        } else if (qtyAllocated > 0) {
          lifecyclePhase = 'allocated';
        } else if (qtyReceived > 0) {
          lifecyclePhase = 'received';
        } else if (qtyOrdered > 0) {
          lifecyclePhase = 'ordered';
        } else if (isFundingBlocked) {
          lifecyclePhase = 'funding_blocked';
        } else if (isPrepayBlocked) {
          lifecyclePhase = 'prepay_blocked';
        }

        return {
          ...commitment,
          part,
          vendor,
          lineItems: commitmentLineItems,
          installedParts: commitmentInstalled,
          allocations: commitmentAllocations,
          computed: {
            remaining,
            unorderedQty,
            unreceived,
            unallocated,
            uninstalled,
            coveragePercent,
            lifecyclePhase,
            // Gating flags (UI renders these, does not calculate)
            isFundingBlocked,
            isPrepayRequired,
            isPrepayBlocked,
            // Action availability (UI renders these, does not calculate)
            canOrder,
            canReceive,
            canAllocate,
            canInstall,
            canCancel,
            canEdit,
          }
        };
      });

    // Enrich pools
    const enrichedPools = pools.map(pool => {
      const poolAllocations = projectAllocations.filter(a => a.pool_id === pool.id && !a.is_reversed);
      const poolCharges = charges.filter(c => c.pool_id === pool.id && !c.is_reversed);

      return {
        ...pool,
        allocations: poolAllocations,
        charges: poolCharges,
      };
    });

    // Calculate summary metrics
    const activeCommitments = enrichedCommitments.filter(c => c.commitment_status !== 'cancelled');
    
    const summary = {
      totalCommitments: activeCommitments.length,
      byStatus: {
        planned: activeCommitments.filter(c => c.commitment_status === 'planned').length,
        ordered: activeCommitments.filter(c => c.commitment_status === 'ordered').length,
        partiallyReceived: activeCommitments.filter(c => c.commitment_status === 'partially_received').length,
        received: activeCommitments.filter(c => c.commitment_status === 'received').length,
        allocated: activeCommitments.filter(c => c.commitment_status === 'allocated').length,
        installed: activeCommitments.filter(c => c.commitment_status === 'installed').length,
      },
      financial: {
        totalPlannedRetail: activeCommitments.reduce((sum, c) => sum + (c.planned_retail_total || 0), 0),
        totalCovered: activeCommitments.reduce((sum, c) => sum + (c.covered_retail_total || 0), 0),
        totalExposure: activeCommitments.reduce((sum, c) => sum + (c.exposure_gap || 0), 0),
        totalInvoiced: activeCommitments.reduce((sum, c) => sum + (c.invoiced_retail_total || 0), 0),
        poolBalance: enrichedPools.reduce((sum, p) => sum + (p.balance || 0), 0),
        poolPaid: enrichedPools.reduce((sum, p) => sum + (p.paid_amount || 0), 0),
        hasOverdrawn: enrichedPools.some(p => p.status === 'overdrawn' || (p.balance || 0) < 0),
      },
      quantities: {
        totalQtyCommitted: activeCommitments.reduce((sum, c) => sum + (c.qty_committed || 0), 0),
        totalQtyOrdered: activeCommitments.reduce((sum, c) => sum + (c.qty_ordered || 0), 0),
        totalQtyReceived: activeCommitments.reduce((sum, c) => sum + (c.qty_received || 0), 0),
        totalQtyAllocated: activeCommitments.reduce((sum, c) => sum + (c.qty_allocated || 0), 0),
        totalQtyInstalled: activeCommitments.reduce((sum, c) => sum + (c.qty_installed || 0), 0),
      },
      alerts: {
        needsOrder: activeCommitments.filter(c => c.computed.canOrder).length,
        needsReceiving: activeCommitments.filter(c => c.computed.canReceive).length,
        needsLocation: activeCommitments.filter(c => c.computed.canAllocate).length,
        needsInstall: activeCommitments.filter(c => c.computed.canInstall).length,
        prepayBlocking: activeCommitments.filter(c => c.requires_prepay && !c.prepay_satisfied_at && c.commitment_status === 'planned').length,
        installedUncovered: activeCommitments.filter(c => c.commitment_status === 'installed' && (c.exposure_gap || 0) > 0).length,
      }
    };

    // Calculate coverage and install percentages
    summary.coveragePct = summary.financial.totalPlannedRetail > 0 
      ? Math.round((summary.financial.totalCovered / summary.financial.totalPlannedRetail) * 100) 
      : 0;
    summary.installPct = summary.quantities.totalQtyCommitted > 0
      ? Math.round((summary.quantities.totalQtyInstalled / summary.quantities.totalQtyCommitted) * 100)
      : 0;

    return Response.json({
      success: true,
      project,
      requirements,
      commitments: enrichedCommitments,
      pools: enrichedPools,
      charges,
      lineItems: projectLineItems,
      installedParts: projectInstalled,
      summary,
    });

  } catch (error) {
    console.error("getProjectSupplyState error:", error);
    return Response.json({ 
      error: error.message,
      type: error.name
    }, { status: 500 });
  }
});