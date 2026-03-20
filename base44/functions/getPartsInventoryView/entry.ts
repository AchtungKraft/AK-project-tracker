import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * getPartsInventoryView - Canonical Parts Inventory Read Model
 * 
 * Returns a unified view of all parts with their canonical supply state.
 * This is the ONLY source of truth for parts inventory display.
 * 
 * NO legacy fields allowed:
 * - NO quantity_on_hand
 * - NO quantity_reserved  
 * - NO InventoryItem aggregation
 * - NO local reduce() logic
 * 
 * All inventory data comes from:
 * - Part.physical_stock (canonical inventory)
 * - PartCommitment.reserved_from_stock (allocated)
 * - PartCommitment.covered_from_po (on order)
 * - PartCommitment.qty_installed (installed)
 * - PartCommitment.required_total (demand)
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

    // PERF: Timing start
    const _perfStart = Date.now();

    const body = await req.json().catch(() => ({}));
    const { 
      include_archived = false,
      category_id = null,
      vendor_id = null,
      search = null,
      part_id = null,  // NEW: Support single-part filtering for modal
      limit = 500
    } = body;

    // Fetch parts - support single part_id for modal view
    let partsQuery = {};
    
    // If part_id provided, fetch only that part (for PartModal)
    if (part_id) {
      partsQuery.id = part_id;
    } else {
      if (!include_archived) {
        partsQuery.is_archived = { $ne: true };
      }
      if (category_id) {
        partsQuery.part_category_id = category_id;
      }
      if (vendor_id) {
        partsQuery.default_vendor_id = vendor_id;
      }
    }
    
    const parts = Object.keys(partsQuery).length > 0
      ? await base44.entities.Part.filter(partsQuery, '-created_date', limit)
      : await base44.entities.Part.list('-created_date', limit);

    const partIds = parts.map(p => p.id);

    // Fetch all active commitments for these parts
    const commitments = partIds.length > 0
      ? await base44.entities.PartCommitment.filter({
          part_id: { $in: partIds },
          commitment_status: { $nin: ['cancelled', 'closed'] }
        })
      : [];

    // Group commitments by part_id
    const commitmentsByPart = new Map();
    for (const c of commitments) {
      if (!commitmentsByPart.has(c.part_id)) {
        commitmentsByPart.set(c.part_id, []);
      }
      commitmentsByPart.get(c.part_id).push(c);
    }

    // Build canonical view for each part
    const partsView = parts.map(part => {
      const partCommitments = commitmentsByPart.get(part.id) || [];
      
      // CANONICAL: Physical stock from Part entity
      const physical_stock = part.physical_stock ?? 0;
      
      // CANONICAL: Reserved = sum of reserved_from_stock across all commitments
      const reserved_total = partCommitments.reduce((sum, c) => 
        sum + (c.reserved_from_stock ?? 0), 0);
      
      // CANONICAL: Required = sum of required_total across all commitments  
      const required_total = partCommitments.reduce((sum, c) => 
        sum + (c.required_total ?? 0), 0);
      
      // CANONICAL: On Order = sum of covered_from_po across all commitments
      const on_order = partCommitments.reduce((sum, c) => 
        sum + (c.covered_from_po ?? 0), 0);
      
      // CANONICAL: To Order = sum of gaps across all commitments
      const to_order = partCommitments.reduce((sum, c) => {
        const req = c.required_total ?? 0;
        const res = c.reserved_from_stock ?? 0;
        const cov = c.covered_from_po ?? 0;
        return sum + Math.max(0, req - res - cov);
      }, 0);
      
      // CANONICAL: Installed = sum of qty_installed across all commitments
      const installed_total = partCommitments.reduce((sum, c) => 
        sum + (c.qty_installed ?? 0), 0);
      
      // CANONICAL: Available = physical - reserved (computed server-side, NOT in UI)
      const available = Math.max(0, physical_stock - reserved_total);
      
      // CANONICAL: Net Position (computed server-side for display)
      const net_position = available + on_order - required_total;
      
      // DERIVED: Coverage status
      let coverage_status = 'NOT_COVERED';
      if (required_total > 0) {
        const coverage = reserved_total + on_order;
        if (coverage >= required_total) {
          coverage_status = 'FULLY_COVERED';
        } else if (coverage > 0) {
          coverage_status = 'PARTIALLY_COVERED';
        }
      } else {
        coverage_status = 'NO_DEMAND';
      }
      
      // DERIVED: Projects using this part
      const projects_using_count = new Set(partCommitments.map(c => c.project_id)).size;
      
      // Health flags
      const is_low_stock = available <= (part.reorder_point ?? 0) && required_total > 0;
      const has_unfulfilled_demand = to_order > 0;
      const all_installed = installed_total >= required_total && required_total > 0;

      return {
        // Part identity
        part_id: part.id,
        part_name: part.part_name,
        vendor_part_number: part.vendor_part_number,
        part_type: part.part_type || 'PURCHASED_VENDOR',
        is_archived: part.is_archived || false,
        featured_photo: part.featured_photo || part.photos?.[0],
        
        // Classification
        part_category_id: part.part_category_id,
        default_vendor_id: part.default_vendor_id,
        car_make_id: part.car_make_id,
        car_model_id: part.car_model_id,
        
        // CANONICAL INVENTORY STATE (NO UI derivation allowed)
        physical_stock,
        reserved_total,
        allocated_total: reserved_total, // Alias for backward compat
        available,
        on_order,
        to_order,
        installed_total,
        required_total,
        net_position,
        
        // Supply metrics
        projects_using_count,
        coverage_status,
        
        // Health indicators
        is_low_stock,
        has_unfulfilled_demand,
        all_installed,
        
        // Pricing (for display only)
        cost: part.cost ?? part.default_cost,
        retail_effective: part.retail_override ?? part.retail_matrix_price ?? part.default_retail,
        
        // Location breakdown (NEW - single source for location data)
        location_breakdown: partCommitments.length > 0 ? null : undefined, // Reserved for future
        
        // Timestamps
        created_date: part.created_date,
        updated_date: part.updated_date
      };
    });

    // Apply search filter if provided
    let filteredParts = partsView;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredParts = partsView.filter(p => 
        p.part_name?.toLowerCase().includes(searchLower) ||
        p.vendor_part_number?.toLowerCase().includes(searchLower)
      );
    }

    // PERF: Timing log (dev only)
    const _perfEnd = Date.now();
    console.log('[PERF] getPartsInventoryView', _perfEnd - _perfStart, 'ms', {
      entityCounts: {
        parts: parts.length,
        commitments: commitments.length,
        filtered: filteredParts.length,
      }
    });

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: filteredParts.length,
      parts: filteredParts
    });

  } catch (error) {
    console.error("getPartsInventoryView error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});