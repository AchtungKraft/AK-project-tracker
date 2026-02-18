import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getGlobalOrderQueue - Consolidated data for GlobalNeedToOrder page
 * Returns all data needed for the procurement queue in a single request
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

    // Fetch all required entities in parallel
    const [commitments, parts, projects, vendors, pools] = await Promise.all([
      base44.entities.PartCommitment.list(),
      base44.entities.Part.list(),
      base44.entities.Project.list(),
      base44.entities.Vendor.list(),
      base44.entities.BillingPool.list(),
    ]);

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));

    // Group pools by project
    const poolsByProject = {};
    pools.forEach(p => {
      if (!poolsByProject[p.project_id]) poolsByProject[p.project_id] = [];
      poolsByProject[p.project_id].push(p);
    });

    // Build items that need ordering
    const needToOrderItems = [];

    commitments.forEach(commitment => {
      if (commitment.commitment_status === 'cancelled') return;

      const needsOrder = 
        commitment.commitment_status === 'planned' ||
        (commitment.qty_committed || 0) > (commitment.qty_ordered || 0);

      if (!needsOrder) return;

      const part = partMap.get(commitment.part_id);
      if (!part) return;

      const project = projectMap.get(commitment.project_id);
      const vendor = vendorMap.get(part.default_vendor_id);
      const projectPools = poolsByProject[commitment.project_id] || [];
      const poolBalance = projectPools
        .filter(p => p.status !== 'closed')
        .reduce((sum, p) => sum + (p.balance || 0), 0);

      const qtyToOrder = (commitment.qty_committed || 0) - (commitment.qty_ordered || 0);
      const plannedRetail = commitment.planned_retail_total || (qtyToOrder * (commitment.unit_retail_snapshot || part.default_retail || 0));
      const coveredRetail = commitment.covered_retail_total || 0;
      const exposureGap = commitment.exposure_gap || (plannedRetail - coveredRetail);

      // Calculate coverage state
      const coveragePct = plannedRetail > 0 ? (coveredRetail / plannedRetail) * 100 : 0;
      const coverageState = coveragePct >= 100 ? 'covered' : coveragePct > 0 ? 'partial' : 'uncovered';

      // Can order? Must have coverage or prepay satisfied
      const requiresPrepay = commitment.requires_prepay || false;
      const prepayOk = !requiresPrepay || commitment.prepay_satisfied_at;
      const canOrder = (coverageState === 'covered' || poolBalance >= exposureGap) && prepayOk;

      needToOrderItems.push({
        id: commitment.id,
        commitment_id: commitment.id,
        commitment_status: commitment.commitment_status,
        part_id: part.id,
        part_name: part.part_name,
        vendor_part_number: part.vendor_part_number,
        featured_photo: part.featured_photo,
        project_id: project?.id,
        project_name: project?.name,
        vendor_id: vendor?.id,
        vendor_name: vendor?.vendor_name,
        qtyToOrder,
        plannedRetail,
        coveredRetail,
        exposureGap,
        coverageState,
        poolBalance,
        requiresPrepay,
        prepayOk,
        canOrder,
        estimatedCost: qtyToOrder * (part.cost || part.default_cost || 0),
        // Include commitment data for actions
        qty_committed: commitment.qty_committed,
        qty_ordered: commitment.qty_ordered,
        qty_received: commitment.qty_received,
        qty_installed: commitment.qty_installed,
      });
    });

    // Compute summary stats
    const totalQty = needToOrderItems.reduce((sum, i) => sum + i.qtyToOrder, 0);
    const totalExposure = needToOrderItems.reduce((sum, i) => sum + i.exposureGap, 0);
    const totalCost = needToOrderItems.reduce((sum, i) => sum + i.estimatedCost, 0);
    const canOrderCount = needToOrderItems.filter(i => i.canOrder).length;
    const blockedCount = needToOrderItems.filter(i => !i.canOrder).length;

    // Get unique projects and vendors for filters
    const projectsWithItems = [...new Set(needToOrderItems.map(i => i.project_id).filter(Boolean))];
    const vendorsWithItems = [...new Set(needToOrderItems.map(i => i.vendor_id).filter(Boolean))];

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      items: needToOrderItems,
      summary: {
        totalItems: needToOrderItems.length,
        totalQty,
        totalExposure,
        totalCost,
        canOrderCount,
        blockedCount,
      },
      filters: {
        projects: projects.filter(p => projectsWithItems.includes(p.id)).map(p => ({ id: p.id, name: p.name })),
        vendors: vendors.filter(v => vendorsWithItems.includes(v.id)).map(v => ({ id: v.id, vendor_name: v.vendor_name })),
      },
    });

  } catch (error) {
    console.error("getGlobalOrderQueue error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});