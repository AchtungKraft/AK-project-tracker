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
    // Build DB query - exclude only truly cancelled orders, include legacy/null status
    const orderQuery = { status: { $ne: 'Cancelled' } };

    // Vendor filter - guard against "all" sentinel value
    if (filters?.vendor_id && filters.vendor_id !== 'all') {
      orderQuery.vendor_id = filters.vendor_id;
    }
    // NOTE: Search stays post-projection only (avoids regex/field-name issues at DB level)

    // Debug logging (temporary - remove after verification)
    console.log('[POReceiving] orderQuery:', JSON.stringify(orderQuery));

    // Hard safety limit - receiving UI never needs thousands of POs
    const filteredOrders = await base44.entities.Order.filter(orderQuery, '-created_date', 100);
    const orderIds = filteredOrders.map(o => o.id);

    console.log('[POReceiving] filteredOrders count:', filteredOrders.length);
    console.log('[POReceiving] orderIds:', orderIds.length > 10 ? `${orderIds.length} orders (first 10: ${orderIds.slice(0, 10).join(', ')})` : orderIds.join(', '));

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

    // Fetch vendor/project names for filter options (only after confirming we have data)
    const [vendors, projects] = await Promise.all([
      base44.entities.Vendor.list(),
      base44.entities.Project.list(),
    ]);
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

    // Strip full line arrays from list mode — only summary fields needed
    const ordersSlim = poViews.map(po => ({
      order_id: po.order_id,
      po_number: po.po_number,
      vendor_id: po.vendor_id,
      vendor_name: po.vendor_name,
      status: po.status,
      order_date: po.order_date,
      order_number: po.order_number,
      order_url: po.order_url,
      total_lines: po.total_lines,
      total_qty_ordered: po.total_qty_ordered,
      total_qty_received: po.total_qty_received,
      total_qty_remaining: po.total_qty_remaining,
      progress_pct: po.progress_pct,
      pdf_attachments: po.pdf_attachments,
      // Include minimal line data for open-line count display
      lines: po.lines?.map(l => ({
        line_item_id: l.line_item_id,
        qty_remaining: l.qty_remaining,
      })),
    }));

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      orders: ordersSlim,
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