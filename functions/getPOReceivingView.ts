import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getPOReceivingView - PO-centric receiving read model
 * 
 * Returns POReceivingViewModel shaped data for fast batch receiving.
 * Designed for: open PO → check boxes → enter qty → assign location → receive all
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

    // Fetch data - if order_id provided, get specific PO; otherwise get all POs
    // CANONICAL: Receivability is determined by qty_remaining > 0, NOT by status
    const [orders, lineItems, parts, vendors, commitments, projects, locations] = await Promise.all([
      order_id 
        ? base44.entities.Order.filter({ id: order_id })
        : base44.entities.Order.filter({ status: { $ne: 'Cancelled' } }),
      base44.entities.PartPurchaseLineItem.list(),
      base44.entities.Part.list(),
      base44.entities.Vendor.list(),
      base44.entities.PartCommitment.list(),
      base44.entities.Project.list(),
      base44.entities.Location.filter({ active: { $ne: false } }),
    ]);

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const commitmentMap = new Map(commitments.map(c => [c.id, c]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // Build PO receiving view models
    const poViews = orders.map(order => {
      const vendor = vendorMap.get(order.vendor_id);
      const orderLineItems = lineItems.filter(li => li.order_id === order.id && li.status !== 'Cancelled');

      // Build line view models
      const lines = orderLineItems.map(li => {
        const part = partMap.get(li.part_id);
        const commitment = li.commitment_id ? commitmentMap.get(li.commitment_id) : null;
        const project = commitment?.project_id ? projectMap.get(commitment.project_id) : null;

        // CANONICAL: qty_ordered comes directly from line item - this is the authoritative source
        const qty_ordered = li.qty_ordered ?? 0;
        const qty_received = li.qty_received ?? 0;
        const qty_remaining = Math.max(0, qty_ordered - qty_received);

        return {
          line_item_id: li.id,
          part_id: li.part_id,
          part_name: part?.part_name || 'Unknown Part',
          vendor_part_number: part?.vendor_part_number || null,
          featured_photo: part?.featured_photo || null,
          qty_ordered,
          qty_received,
          qty_remaining,
          unit_cost: li.unit_cost || li.unit_price || 0,
          extended_cost: (li.unit_cost || li.unit_price || 0) * qty_ordered,
          commitment_id: li.commitment_id || null,
          project_id: commitment?.project_id || null,
          project_name: project?.name || 'AK Stock',
          status: li.status || 'Ordered',
          notes: li.notes || null,
          // For UI receive input
          receive_qty: qty_remaining, // Default to remaining
          location_id: null,
          // Debug fields for audit
          _debug_raw_qty_ordered: li.qty_ordered,
          _debug_raw_qty_received: li.qty_received,
        };
      });

      // CANONICAL: Aggregates from line-level quantities
      const total_qty_ordered = lines.reduce((sum, l) => sum + l.qty_ordered, 0);
      const total_qty_received = lines.reduce((sum, l) => sum + l.qty_received, 0);
      const total_qty_remaining = lines.reduce((sum, l) => sum + l.qty_remaining, 0);

      return {
        order_id: order.id,
        po_number: order.po_number || `PO-${order.id.slice(-6)}`,
        vendor_id: order.vendor_id,
        vendor_name: vendor?.vendor_name || 'Unknown Vendor',
        order_date: order.order_date,
        eta_date: order.eta_date,
        status: order.status,
        order_number: order.order_number, // External reference
        order_url: order.order_url,
        notes: order.notes,
        total_lines: lines.length,
        total_qty_ordered,
        total_qty_received,
        total_qty_remaining,
        lines,
        // Attachments for reference
        pdf_attachments: order.pdf_attachments || [],
        // Debug fields for data integrity validation
        _debug_total_qty_ordered_raw: orderLineItems.reduce((sum, li) => sum + (li.qty_ordered ?? 0), 0),
        _debug_total_qty_received_raw: orderLineItems.reduce((sum, li) => sum + (li.qty_received ?? 0), 0),
      };
    });

    // Apply filters
    let filtered = poViews;
    if (filters.vendor_id) {
      filtered = filtered.filter(po => po.vendor_id === filters.vendor_id);
    }
    if (filters.has_remaining !== false) {
      filtered = filtered.filter(po => po.total_qty_remaining > 0);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(po => 
        po.po_number.toLowerCase().includes(search) ||
        po.vendor_name.toLowerCase().includes(search) ||
        po.lines.some(l => l.part_name.toLowerCase().includes(search))
      );
    }

    // Get unique projects from all lines
    const allProjects = new Set();
    filtered.forEach(po => {
      po.lines.forEach(l => {
        if (l.project_id) allProjects.add(l.project_id);
      });
    });

    // Summary
    const summary = {
      total_orders: filtered.length,
      total_lines: filtered.reduce((sum, po) => sum + po.lines.length, 0),
      total_qty_remaining: filtered.reduce((sum, po) => sum + po.total_qty_remaining, 0),
    };

    // Location options for dropdown
    const locationOptions = locations.map(l => ({
      id: l.id,
      name: l.location_area + (l.bin_description ? ` - ${l.bin_description}` : ''),
    }));

    // If specific order requested, return single PO detail
    if (order_id && filtered.length > 0) {
      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        po: filtered[0],
        locations: locationOptions,
      });
    }

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      orders: filtered,
      summary,
      locations: locationOptions,
      filter_options: {
        vendors: [...new Set(filtered.map(po => po.vendor_id))]
          .map(id => ({ id, vendor_name: vendorMap.get(id)?.vendor_name || 'Unknown' })),
        projects: [...allProjects].map(id => ({ id, name: projectMap.get(id)?.name || 'Unknown' })),
      },
    });

  } catch (error) {
    console.error("getPOReceivingView error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});