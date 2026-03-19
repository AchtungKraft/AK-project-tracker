import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * getGlobalSupplyQueues - Canonical read model for global work queues
 * Optimized to fetch only necessary data
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

    // Fetch only essential entities for queue building
    const [projects, parts, vendors, commitments, pools, inventoryItems] = await Promise.all([
      base44.entities.Project.list(),
      base44.entities.Part.list(),
      base44.entities.Vendor.list(),
      base44.entities.PartCommitment.filter({ commitment_status: { $ne: 'cancelled' } }),
      base44.entities.BillingPool.filter({ status: { $ne: 'closed' } }),
      base44.entities.InventoryItem.filter({ quantity_on_hand: { $gt: 0 } }),
    ]);

    // Build lookup maps
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    
    // Group pools by project for balance calculation
    const poolByProject = new Map();
    pools.forEach(p => {
      if (!poolByProject.has(p.project_id)) poolByProject.set(p.project_id, []);
      poolByProject.get(p.project_id).push(p);
    });

    const getProjectPoolBalance = (projectId) => {
      const projectPools = poolByProject.get(projectId) || [];
      return projectPools.reduce((sum, p) => sum + (p.balance || 0), 0);
    };

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

      return {
        commitment_id: c.id,
        project_id: c.project_id,
        project_name: project?.name || 'Unknown',
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown',
        vendor_id: vendor?.id,
        vendor_name: vendor?.vendor_name || 'No Vendor',
        commitment_status: c.commitment_status,
        
        qty_committed: qtyCommitted,
        qty_ordered: qtyOrdered,
        qty_received: qtyReceived,
        qty_installed: qtyInstalled,
        qty_to_order: Math.max(0, qtyCommitted - qtyOrdered),
        qty_to_receive: Math.max(0, qtyOrdered - qtyReceived),
        qty_to_install: Math.max(0, qtyReceived - qtyInstalled),
        
        exposure_gap: exposureGap,
        planned_retail: plannedRetail,
        coverage_percent: coveragePercent,
        pool_balance: poolBalance,
        
        is_funding_blocked: isFundingBlocked,
        is_orderable: !isFundingBlocked && (qtyCommitted > qtyOrdered),
      };
    };

    // Build queues
    const queues = {
      need_funding: { label: 'Need Funding', items: [], total_exposure: 0 },
      ready_to_order: { label: 'Ready to Order', items: [], total_value: 0 },
      on_order: { label: 'On Order', items: [], total_pending: 0 },
      ready_to_receive: { label: 'Ready to Receive', items: [], total_qty: 0 },
      unassigned_inventory: { label: 'Unassigned Inventory', items: [], total_qty: 0 },
      ready_to_install: { label: 'Ready to Install', items: [], total_qty: 0 },
      installed_uncovered: { label: 'Installed Uncovered', items: [], total_exposure: 0 },
      overdrawn_pools: { label: 'Overdrawn Pools', items: [], total_deficit: 0 },
    };

    // Categorize commitments into queues
    commitments.forEach(c => {
      const enriched = enrichCommitment(c);
      
      if (enriched.is_funding_blocked) {
        queues.need_funding.items.push(enriched);
        queues.need_funding.total_exposure += enriched.exposure_gap;
      }
      
      if (enriched.is_orderable) {
        queues.ready_to_order.items.push(enriched);
        queues.ready_to_order.total_value += enriched.planned_retail;
      }
      
      if (['ordered', 'partially_received'].includes(enriched.commitment_status)) {
        queues.on_order.items.push(enriched);
        queues.on_order.total_pending += enriched.qty_to_receive;
      }
      
      if (enriched.qty_to_receive > 0) {
        queues.ready_to_receive.items.push(enriched);
        queues.ready_to_receive.total_qty += enriched.qty_to_receive;
      }
      
      if (enriched.qty_to_install > 0) {
        queues.ready_to_install.items.push(enriched);
        queues.ready_to_install.total_qty += enriched.qty_to_install;
      }
      
      if (enriched.qty_installed > 0 && enriched.coverage_percent < 100) {
        queues.installed_uncovered.items.push(enriched);
        queues.installed_uncovered.total_exposure += enriched.exposure_gap;
      }
    });

    // Unassigned inventory
    inventoryItems.filter(item => !item.location_id).forEach(item => {
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
    pools.filter(p => (p.balance || 0) < 0 || p.status === 'overdrawn').forEach(p => {
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
    const summary = Object.fromEntries(
      Object.entries(queues).map(([key, val]) => [key, val.items.length])
    );

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