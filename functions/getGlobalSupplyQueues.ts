import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getGlobalSupplyQueues - Canonical read model for global work queues
 * 
 * Returns precomputed queue buckets:
 * - need_funding: Commitments with exposure > pool balance
 * - ready_to_order: Funded commitments not yet ordered
 * - on_order: Commitments with open PO lines
 * - ready_to_receive: Items shipped/expected
 * - unassigned_inventory: Received but not location-assigned
 * - ready_to_install: Received items awaiting installation
 * - installed_uncovered: Installed but not fully covered
 * - overdrawn_pools: Pools with negative balance
 * 
 * UI must NOT calculate queue membership - render only.
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

    // Fetch all required entities
    const [projects, parts, vendors, commitments, pools, lineItems, installedParts, inventoryItems] = await Promise.all([
      base44.entities.Project.list(),
      base44.entities.Part.list(),
      base44.entities.Vendor.list(),
      base44.entities.PartCommitment.list(),
      base44.entities.BillingPool.list(),
      base44.entities.PartPurchaseLineItem.list(),
      base44.entities.InstalledPart.list(),
      base44.entities.InventoryItem.list(),
    ]);

    // Build lookup maps
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const poolByProject = new Map();
    pools.forEach(p => {
      if (!poolByProject.has(p.project_id)) poolByProject.set(p.project_id, []);
      poolByProject.get(p.project_id).push(p);
    });

    // Calculate pool balance per project
    const getProjectPoolBalance = (projectId) => {
      const projectPools = poolByProject.get(projectId) || [];
      return projectPools
        .filter(p => p.status !== 'closed')
        .reduce((sum, p) => sum + (p.balance || 0), 0);
    };

    // Active commitments only
    const activeCommitments = commitments.filter(c => c.commitment_status !== 'cancelled');

    // Enrich commitment with computed fields
    const enrichCommitment = (c) => {
      const project = projectMap.get(c.project_id);
      const part = partMap.get(c.part_id);
      const vendor = part ? vendorMap.get(part.default_vendor_id) : null;
      const poolBalance = getProjectPoolBalance(c.project_id);
      
      const exposureGap = c.exposure_gap || 0;
      const plannedRetail = c.planned_retail_total || 0;
      const coveredRetail = c.covered_retail_total || 0;
      const coveragePercent = plannedRetail > 0 ? Math.round((coveredRetail / plannedRetail) * 100) : 0;
      
      const qtyCommitted = c.qty_committed || 0;
      const qtyOrdered = c.qty_ordered || 0;
      const qtyReceived = c.qty_received || 0;
      const qtyInstalled = c.qty_installed || 0;
      
      const isFundingBlocked = exposureGap > poolBalance && exposureGap > 0;
      const isPrepayRequired = c.requires_prepay === true;
      const isPrepayBlocked = isPrepayRequired && c.billing_status !== 'CLIENT_PAID';

      return {
        commitment_id: c.id,
        project_id: c.project_id,
        project_name: project?.name || 'Unknown',
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown',
        vendor_id: vendor?.id,
        vendor_name: vendor?.vendor_name || 'No Vendor',
        commitment_status: c.commitment_status,
        billing_status: c.billing_status,
        
        qty_committed: qtyCommitted,
        qty_ordered: qtyOrdered,
        qty_received: qtyReceived,
        qty_installed: qtyInstalled,
        qty_to_order: Math.max(0, qtyCommitted - qtyOrdered),
        qty_to_receive: Math.max(0, qtyOrdered - qtyReceived),
        qty_to_install: Math.max(0, qtyReceived - qtyInstalled),
        
        exposure_gap: exposureGap,
        planned_retail: plannedRetail,
        covered_retail: coveredRetail,
        coverage_percent: coveragePercent,
        pool_balance: poolBalance,
        
        is_funding_blocked: isFundingBlocked,
        is_prepay_required: isPrepayRequired,
        is_prepay_blocked: isPrepayBlocked,
        is_orderable: !isFundingBlocked && !isPrepayBlocked && (qtyCommitted > qtyOrdered),
      };
    };

    // Build queues
    const queues = {
      need_funding: {
        label: 'Need Funding',
        description: 'Commitments where exposure exceeds available pool balance',
        items: [],
        total_exposure: 0,
      },
      ready_to_order: {
        label: 'Ready to Order',
        description: 'Funded commitments with quantity remaining to order',
        items: [],
        total_value: 0,
      },
      on_order: {
        label: 'On Order',
        description: 'Commitments with open purchase orders',
        items: [],
        total_pending: 0,
      },
      ready_to_receive: {
        label: 'Ready to Receive',
        description: 'Items expected from vendors',
        items: [],
        total_qty: 0,
      },
      unassigned_inventory: {
        label: 'Unassigned Inventory',
        description: 'Received items without location assignment',
        items: [],
        total_qty: 0,
      },
      ready_to_install: {
        label: 'Ready to Install',
        description: 'Received items awaiting installation',
        items: [],
        total_qty: 0,
      },
      installed_uncovered: {
        label: 'Installed Uncovered',
        description: 'Installed items not fully covered by pool',
        items: [],
        total_exposure: 0,
      },
      overdrawn_pools: {
        label: 'Overdrawn Pools',
        description: 'Pools with negative balance',
        items: [],
        total_deficit: 0,
      },
    };

    // Categorize commitments into queues
    activeCommitments.forEach(c => {
      const enriched = enrichCommitment(c);
      
      // Need Funding: exposure > pool balance
      if (enriched.is_funding_blocked) {
        queues.need_funding.items.push(enriched);
        queues.need_funding.total_exposure += enriched.exposure_gap;
      }
      
      // Ready to Order: funded, not blocked, qty to order > 0
      if (enriched.is_orderable) {
        queues.ready_to_order.items.push(enriched);
        queues.ready_to_order.total_value += enriched.planned_retail;
      }
      
      // On Order: ordered or partially received
      if (['ordered', 'partially_received'].includes(enriched.commitment_status)) {
        queues.on_order.items.push(enriched);
        queues.on_order.total_pending += enriched.qty_to_receive;
      }
      
      // Ready to Receive: qty_ordered > qty_received
      if (enriched.qty_to_receive > 0) {
        queues.ready_to_receive.items.push(enriched);
        queues.ready_to_receive.total_qty += enriched.qty_to_receive;
      }
      
      // Ready to Install: received > installed
      if (enriched.qty_to_install > 0) {
        queues.ready_to_install.items.push(enriched);
        queues.ready_to_install.total_qty += enriched.qty_to_install;
      }
      
      // Installed but uncovered
      if (enriched.qty_installed > 0 && enriched.coverage_percent < 100) {
        queues.installed_uncovered.items.push(enriched);
        queues.installed_uncovered.total_exposure += enriched.exposure_gap;
      }
    });

    // Unassigned inventory (items received but no location)
    inventoryItems.filter(item => 
      (item.quantity_on_hand || 0) > 0 && !item.location_id
    ).forEach(item => {
      const part = partMap.get(item.part_id);
      queues.unassigned_inventory.items.push({
        inventory_id: item.id,
        part_id: item.part_id,
        part_name: part?.part_name || 'Unknown',
        quantity: item.quantity_on_hand || 0,
      });
      queues.unassigned_inventory.total_qty += item.quantity_on_hand || 0;
    });

    // Overdrawn pools
    pools.filter(p => 
      p.status !== 'closed' && ((p.balance || 0) < 0 || p.status === 'overdrawn')
    ).forEach(p => {
      const project = projectMap.get(p.project_id);
      queues.overdrawn_pools.items.push({
        pool_id: p.id,
        pool_name: p.pool_name,
        project_id: p.project_id,
        project_name: project?.name || 'Unknown',
        balance: p.balance || 0,
        deficit: Math.abs(Math.min(0, p.balance || 0)),
      });
      queues.overdrawn_pools.total_deficit += Math.abs(Math.min(0, p.balance || 0));
    });

    // Summary counts
    const summary = {
      need_funding: queues.need_funding.items.length,
      ready_to_order: queues.ready_to_order.items.length,
      on_order: queues.on_order.items.length,
      ready_to_receive: queues.ready_to_receive.items.length,
      unassigned_inventory: queues.unassigned_inventory.items.length,
      ready_to_install: queues.ready_to_install.items.length,
      installed_uncovered: queues.installed_uncovered.items.length,
      overdrawn_pools: queues.overdrawn_pools.items.length,
    };

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      queues,
    });

  } catch (error) {
    console.error("getGlobalSupplyQueues error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});