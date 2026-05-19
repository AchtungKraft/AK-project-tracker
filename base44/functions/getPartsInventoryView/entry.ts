import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getPartsInventoryView - Canonical Parts Inventory Read Model
 * 
 * USES CANONICAL SUPPLY MATH — same formulas as getGlobalSupplyQueues and getOpsSupplyView.
 * See components/supply/canonicalSupplyMath.js for the reference implementation.
 * 
 * All inventory data comes from:
 * - Part.physical_stock (canonical inventory)
 * - PartCommitment.reserved_from_stock (allocated)
 * - PartCommitment.covered_from_po (on order)
 * - PartCommitment.qty_installed (installed)
 * - PartCommitment.required_total (demand)
 */

// ═══════════════════════════════════════════════════════════════════
// CANONICAL SUPPLY MATH (inlined — must match canonicalSupplyMath.js)
// ═══════════════════════════════════════════════════════════════════
function readCanonicalQty(c) {
  const required_total = c.required_total ?? 0;
  const qty_removed = c.qty_removed ?? 0;
  const effective_required = Math.max(0, required_total - qty_removed);
  const reserved_from_stock = c.reserved_from_stock ?? 0;
  const covered_from_po = c.covered_from_po ?? 0;
  const qty_installed = c.qty_installed ?? 0;
  const coverage_total = reserved_from_stock + covered_from_po + qty_installed;
  const to_order = Math.max(0, effective_required - coverage_total);
  const available_to_install = Math.max(0, Math.min(
    reserved_from_stock + covered_from_po - qty_installed,
    effective_required - qty_installed
  ));
  const is_satisfied = coverage_total >= effective_required && effective_required > 0;
  return { required_total, qty_removed, effective_required, reserved_from_stock, covered_from_po, qty_installed, coverage_total, to_order, available_to_install, is_satisfied };
}
// ═══════════════════════════════════════════════════════════════════

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
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const _perfStart = Date.now();
    const body = await req.json().catch(() => ({}));
    const { 
      include_archived = false,
      category_id = null,
      vendor_id = null,
      search = null,
      part_id = null,
      limit = 500
    } = body;

    let partsQuery = {};
    if (part_id) {
      partsQuery.id = part_id;
    } else {
      if (!include_archived) partsQuery.is_archived = { $ne: true };
      if (category_id) partsQuery.part_category_id = category_id;
      if (vendor_id) partsQuery.default_vendor_id = vendor_id;
    }
    
    const parts = Object.keys(partsQuery).length > 0
      ? await base44.entities.Part.filter(partsQuery, '-created_date', limit)
      : await base44.entities.Part.list('-created_date', limit);

    const partIds = parts.map(p => p.id);

    const commitments = partIds.length > 0
      ? await base44.entities.PartCommitment.filter({
          part_id: { $in: partIds },
          commitment_status: { $nin: ['cancelled', 'closed'] }
        })
      : [];

    const commitmentsByPart = new Map();
    for (const c of commitments) {
      if (!commitmentsByPart.has(c.part_id)) commitmentsByPart.set(c.part_id, []);
      commitmentsByPart.get(c.part_id).push(c);
    }

    const partsView = parts.map(part => {
      const partCommitments = commitmentsByPart.get(part.id) || [];
      const physical_stock = part.physical_stock ?? 0;

      // CANONICAL: Aggregate using shared readCanonicalQty per commitment
      let reserved_total = 0, required_total = 0, on_order = 0, to_order = 0, installed_total = 0;
      for (const c of partCommitments) {
        const q = readCanonicalQty(c);
        reserved_total += q.reserved_from_stock;
        required_total += q.required_total;
        on_order += q.covered_from_po;
        to_order += q.to_order;
        installed_total += q.qty_installed;
      }

      const available = Math.max(0, physical_stock - reserved_total);
      const net_position = available + on_order - required_total;

      let coverage_status = 'NOT_COVERED';
      if (required_total > 0) {
        const coverage = reserved_total + on_order;
        if (coverage >= required_total) coverage_status = 'FULLY_COVERED';
        else if (coverage > 0) coverage_status = 'PARTIALLY_COVERED';
      } else {
        coverage_status = 'NO_DEMAND';
      }

      const projects_using_count = new Set(partCommitments.map(c => c.project_id)).size;
      const is_low_stock = available <= (part.reorder_point ?? 0) && required_total > 0;
      const has_unfulfilled_demand = to_order > 0;
      const all_installed = installed_total >= required_total && required_total > 0;

      return {
        part_id: part.id,
        part_name: part.part_name,
        vendor_part_number: part.vendor_part_number,
        part_type: part.part_type || 'PURCHASED_VENDOR',
        is_archived: part.is_archived || false,
        featured_photo: part.featured_photo || part.photos?.[0],
        part_category_id: part.part_category_id,
        default_vendor_id: part.default_vendor_id,
        car_make_id: part.car_make_id,
        car_model_id: part.car_model_id,
        physical_stock,
        reserved_total,
        allocated_total: reserved_total,
        available,
        on_order,
        to_order,
        installed_total,
        required_total,
        net_position,
        projects_using_count,
        coverage_status,
        is_low_stock,
        has_unfulfilled_demand,
        all_installed,
        cost: part.cost ?? part.default_cost,
        retail_effective: part.retail_override ?? part.retail_matrix_price ?? part.default_retail,
        location_breakdown: partCommitments.length > 0 ? null : undefined,
        created_date: part.created_date,
        updated_date: part.updated_date,
      };
    });

    let filteredParts = partsView;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredParts = partsView.filter(p => 
        p.part_name?.toLowerCase().includes(searchLower) ||
        p.vendor_part_number?.toLowerCase().includes(searchLower)
      );
    }

    console.log('[PERF] getPartsInventoryView', Date.now() - _perfStart, 'ms', {
      entityCounts: { parts: parts.length, commitments: commitments.length, filtered: filteredParts.length }
    });

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: filteredParts.length,
      parts: filteredParts,
    });

  } catch (error) {
    console.error("getPartsInventoryView error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});