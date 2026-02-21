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

      // PHASE 9J: STRICT eligibility - Only include if:
      // 1. to_order > 0
      // 2. requires_prepay === false OR billing satisfies prepay
      // 3. coverage_status !== 'FULL'
      if (to_order <= 0) continue;
      
      // Compute coverage_status
      const total_covered = reserved_from_stock + covered_from_po;
      const coverage_status = total_covered >= required_total ? 'FULL' : 
                              total_covered > 0 ? 'PARTIAL' : 'NONE';
      
      // Skip FULL coverage items - they don't need ordering
      if (coverage_status === 'FULL') continue;

      const project = projectMap.get(commitment.project_id);
      const vendor = vendorMap.get(part.default_vendor_id);

      // PHASE 9K: SIMPLIFIED GATING - ONLY explicit boolean fields
      // can_order = (to_order > 0) AND (requires_prepay === false OR prepay_ok === true)
      // NO billing_status checks, NO invoice checks, NO pool checks
      const prepay_ok = commitment.prepay_ok ?? (requires_prepay === false);
      
      const can_order = to_order > 0 && (requires_prepay === false || prepay_ok === true);

      // Determine block reason if blocked
      let block_reason = null;
      if (!can_order && to_order > 0) {
        if (requires_prepay === true && prepay_ok !== true) {
          block_reason = 'REQUIRES_PREPAY';
        }
      }
      
      // PHASE 9K: HARD DEBUG - Detect invalid blocks
      if (!can_order && to_order > 0 && requires_prepay === false) {
        console.error(`[INVALID_ORDER_BLOCK] commitment=${commitment.id} to_order=${to_order} requires_prepay=${requires_prepay} prepay_ok=${prepay_ok}`);
        throw new Error(`INVALID_ORDER_BLOCK: commitment ${commitment.id} blocked but requires_prepay is false`);
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
        // Canonical quantities (NO UI-side derivation allowed)
        required_total,
        reserved_from_stock,
        covered_from_po,
        to_order,
        coverage_status,
        // Billing state (ONLY explicit booleans - PHASE 9K)
        requires_prepay,
        prepay_ok,
        can_order,
        block_reason,
        // Flag for UI display - CANONICAL, no UI computation
        is_orderable: can_order && !!vendor,
        has_vendor: !!vendor,
        // Cost estimation (canonical)
        unit_cost: commitment.unit_cost_snapshot ?? part.cost ?? 0,
        estimated_cost: to_order * (commitment.unit_cost_snapshot ?? part.cost ?? 0),
        // Qty fields (all canonical - NO legacy fallback)
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