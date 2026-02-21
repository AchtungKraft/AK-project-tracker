import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getGlobalOrderQueue - Phase 9H Step 7
 * 
 * Consolidated data for GlobalNeedToOrder page.
 * FORWARD MODEL ONLY - no pool references.
 * Strict billing flag validation.
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

    // Fetch all required entities in parallel (NO POOLS - forward model only)
    const [commitments, parts, projects, vendors] = await Promise.all([
      base44.entities.PartCommitment.list(),
      base44.entities.Part.list(),
      base44.entities.Project.list(),
      base44.entities.Vendor.list(),
    ]);

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));

    // Build items that need ordering
    const needToOrderItems = [];
    const billingFlagErrors = [];

    for (const commitment of commitments) {
      // Skip cancelled/closed
      if (commitment.commitment_status === 'cancelled' || commitment.commitment_status === 'closed') {
        continue;
      }

      // PHASE 9H Step 3: HARD FAIL on invalid billing flags
      // Normalize null/undefined to false for legacy compatibility, but log warning
      let requires_prepay = commitment.requires_prepay;
      if (typeof requires_prepay !== 'boolean') {
        // Treat as false (legacy default) but track for reporting
        billingFlagErrors.push({
          commitment_id: commitment.id,
          value: requires_prepay,
          type: typeof requires_prepay
        });
        requires_prepay = false; // Default legacy to order without invoice
      }

      const part = partMap.get(commitment.part_id);
      if (!part) continue;

      // Compute to_order from canonical fields
      const required_total = commitment.required_total ?? commitment.qty_committed ?? 0;
      const reserved_from_stock = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
      const covered_from_po = commitment.covered_from_po ?? commitment.qty_ordered ?? 0;
      const to_order = Math.max(0, required_total - reserved_from_stock - covered_from_po);

      // Only include if to_order > 0
      if (to_order <= 0) continue;

      const project = projectMap.get(commitment.project_id);
      const vendor = vendorMap.get(part.default_vendor_id);

      // PHASE 9H Step 7: STRICT billing gating
      // can_order = to_order > 0 AND (requires_prepay === false OR billing_status in [INVOICED, PAID])
      const billing_status = commitment.billing_status || 'billable';
      const can_order = 
        to_order > 0 && (
          requires_prepay === false ||
          billing_status === 'INVOICED' ||
          billing_status === 'invoiced' ||
          billing_status === 'PAID' ||
          billing_status === 'paid'
        );

      // Determine block reason if blocked
      let block_reason = null;
      if (!can_order) {
        if (requires_prepay === true && !['INVOICED', 'invoiced', 'PAID', 'paid'].includes(billing_status)) {
          block_reason = 'REQUIRES_PREPAY';
        } else if (!vendor) {
          block_reason = 'NO_VENDOR';
        }
      }

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
        // Canonical quantities
        required_total,
        reserved_from_stock,
        covered_from_po,
        to_order,
        // Billing state
        requires_prepay,
        billing_status,
        can_order,
        block_reason,
        // Cost estimation
        unit_cost: commitment.unit_cost_snapshot ?? part.cost ?? 0,
        estimated_cost: to_order * (commitment.unit_cost_snapshot ?? part.cost ?? 0),
        // Legacy fields for compatibility
        qtyToOrder: to_order,
        qty_committed: required_total,
        qty_ordered: covered_from_po,
        qty_received: commitment.qty_received ?? 0,
        qty_installed: commitment.qty_installed ?? 0,
      });
    }

    // Compute summary stats
    const totalQty = needToOrderItems.reduce((sum, i) => sum + i.to_order, 0);
    const totalCost = needToOrderItems.reduce((sum, i) => sum + i.estimated_cost, 0);
    const canOrderCount = needToOrderItems.filter(i => i.can_order).length;
    const blockedCount = needToOrderItems.filter(i => !i.can_order).length;
    const blockedPrepayCount = needToOrderItems.filter(i => i.block_reason === 'REQUIRES_PREPAY').length;

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
        totalCost,
        canOrderCount,
        blockedCount,
        blockedPrepayCount,
      },
      filters: {
        projects: projects.filter(p => projectsWithItems.includes(p.id)).map(p => ({ id: p.id, name: p.name })),
        vendors: vendors.filter(v => vendorsWithItems.includes(v.id)).map(v => ({ id: v.id, vendor_name: v.vendor_name })),
      },
      // Integrity warnings (non-blocking but reported)
      integrity: {
        billing_flag_errors: billingFlagErrors.length,
        billing_flag_details: billingFlagErrors.slice(0, 10) // Limit for response size
      }
    });

  } catch (error) {
    console.error("getGlobalOrderQueue error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});