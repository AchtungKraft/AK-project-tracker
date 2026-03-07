import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * getPOReceivingView - PO-centric receiving read model
 * 
 * USES CANONICAL buildPOReadModel for data projection.
 * This ensures identical data structure across all PO surfaces.
 * 
 * Returns POReceivingViewModel shaped data for fast batch receiving.
 * Designed for: open PO → check boxes → enter qty → assign location → receive all
 * 
 * CANONICAL RULES:
 * - qty_remaining = qty_ordered - qty_received (derived, never stored)
 * - qty_ordered is IMMUTABLE after PO creation
 * - Receivability determined by qty_remaining > 0, NOT by status
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

    const { order_id, filters = {} } = await req.json();

    // Fetch locations for dropdown
    const locations = await base44.entities.Location.filter({ active: { $ne: false } });
    const locationOptions = locations.map(l => ({
      id: l.id,
      name: l.location_area + (l.bin_description ? ` - ${l.bin_description}` : ''),
    }));

    // DETAIL MODE: Single PO
    if (order_id) {
      const poResult = await base44.asServiceRole.functions.invoke('buildPOReadModel', {
        order_id,
        include_debug: true,
      });

      if (poResult.data?.error) {
        throw new Error(poResult.data.error);
      }

      const po = poResult.data?.po;
      if (!po) {
        return Response.json({ error: 'Order not found' }, { status: 404 });
      }

      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        po,
        locations: locationOptions,
      });
    }

    // LIST MODE: Pre-filter orders at DB level to prevent CPU timeout
    // PHASE 1: Build DB query to exclude cancelled orders and apply vendor filter
    const orderQuery = { status: { $ne: 'Cancelled' } };
    if (filters.vendor_id) {
      orderQuery.vendor_id = filters.vendor_id;
    }
    // PHASE 5: Push PO number search to DB when possible
    if (filters.search) {
      orderQuery.po_number = { $regex: filters.search, $options: 'i' };
    }

    // PHASE 4: Hard safety limit - receiving UI never needs thousands of POs
    const filteredOrders = await base44.entities.Order.filter(orderQuery, '-created_date', 100);
    const orderIds = filteredOrders.map(o => o.id);

    // Fetch vendor/project names for filter options (in parallel with empty-check)
    const [vendors, projects] = await Promise.all([
      base44.entities.Vendor.list(),
      base44.entities.Project.list(),
    ]);

    if (orderIds.length === 0) {
      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        orders: [],
        summary: { total_orders: 0, total_lines: 0, total_qty_remaining: 0, total_qty_ordered: 0, total_qty_received: 0 },
        locations: locationOptions,
        filter_options: { vendors: [], projects: [] },
      });
    }

    // PHASE 2: Only project relevant POs through buildPOReadModel
    const poResult = await base44.asServiceRole.functions.invoke('buildPOReadModel', {
      order_ids: orderIds,
      include_debug: false,
    });

    if (poResult.data?.error) {
      throw new Error(poResult.data.error);
    }

    let poViews = poResult.data?.orders || [];

    // ========================================
    // POST-PROJECTION FILTERING (derived fields only)
    // ========================================
    
    // PHASE 3: Only show POs with remaining qty (depends on line calculations)
    if (filters.has_remaining !== false) {
      poViews = poViews.filter(po => po.total_qty_remaining > 0);
    }
    
    // Search fallback: filter by vendor_name and part_name (not available at DB level)
    if (filters.search) {
      const search = filters.search.toLowerCase();
      poViews = poViews.filter(po => 
        (po.po_number && po.po_number.toLowerCase().includes(search)) ||
        po.vendor_name.toLowerCase().includes(search) ||
        po.lines.some(l => l.part_name.toLowerCase().includes(search))
      );
    }

    // Get unique vendors and projects for filter dropdowns
    const vendorIds = [...new Set(poViews.map(po => po.vendor_id))];
    const projectIds = new Set();
    poViews.forEach(po => {
      po.lines.forEach(l => {
        if (l.project_id) projectIds.add(l.project_id);
      });
    });
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // Summary - derived from filtered data (CANONICAL: same dataset)
    const summary = {
      total_orders: poViews.length,
      total_lines: poViews.reduce((sum, po) => sum + po.total_lines, 0),
      total_qty_ordered: poViews.reduce((sum, po) => sum + po.total_qty_ordered, 0),
      total_qty_received: poViews.reduce((sum, po) => sum + po.total_qty_received, 0),
      total_qty_remaining: poViews.reduce((sum, po) => sum + po.total_qty_remaining, 0),
    };

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      orders: poViews,
      summary,
      locations: locationOptions,
      filter_options: {
        vendors: vendorIds.map(id => ({ 
          id, 
          vendor_name: vendorMap.get(id)?.vendor_name || 'Unknown' 
        })),
        projects: [...projectIds].map(id => ({ 
          id, 
          name: projectMap.get(id)?.name || 'Unknown' 
        })),
      },
    });

  } catch (error) {
    console.error("getPOReceivingView error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});