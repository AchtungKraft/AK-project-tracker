import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/** 
 * getPOReceivingView - PO-centric receiving read model
 * 
 * DETAIL MODE: Inlines PO read model construction to eliminate nested function
 * call overhead. Single round of parallel DB queries.
 * 
 * LIST MODE: Uses buildPOReadModel for batch projection (acceptable overhead
 * for the batch path since it processes many POs).
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
    const t0 = Date.now();
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { order_id, filters = {} } = await req.json();
    const tAuth = Date.now();

    // =============================================
    // DETAIL MODE: Inline read model (no nested call)
    // 2 DB rounds: round 1 gets order+lines+locations,
    //              round 2 gets all reference data in parallel
    // =============================================
    if (order_id) {
      // ROUND 1: Core data — order, lines, locations
      const [orderResults, lineItems, locations] = await Promise.all([
        base44.entities.Order.filter({ id: order_id }),
        base44.entities.PartPurchaseLineItem.filter({ order_id }),
        base44.entities.Location.filter({ active: { $ne: false } }),
      ]);
      const tDB1 = Date.now();

      const order = orderResults[0];
      if (!order) {
        return Response.json({ error: 'Order not found' }, { status: 404 });
      }

      // Collect ALL unique IDs for a single parallel reference fetch
      const partIds = [...new Set(lineItems.map(li => li.part_id).filter(Boolean))];
      const vendorIds = [...new Set([order.vendor_id, ...lineItems.map(li => li.vendor_id)].filter(Boolean))];
      const commitmentIds = [...new Set(lineItems.map(li => li.commitment_id).filter(Boolean))];

      // ROUND 2: ALL reference data in ONE parallel batch
      // Commitments fetched here; project IDs derived and fetched in same round
      // Since we can't know project_ids before commitments load, we fetch commitments
      // first within this round, then immediately fetch projects.
      // But to avoid a 3rd round, we accept fetching a small Project.list() 
      // which is typically <30 records and fast.
      const [parts, vendors, commitments, projects] = await Promise.all([
        partIds.length > 0
          ? base44.entities.Part.filter({ id: { $in: partIds } })
          : Promise.resolve([]),
        vendorIds.length > 0
          ? base44.entities.Vendor.filter({ id: { $in: vendorIds } })
          : Promise.resolve([]),
        commitmentIds.length > 0
          ? base44.entities.PartCommitment.filter({ id: { $in: commitmentIds } })
          : Promise.resolve([]),
        // Projects: small table, fetched once in parallel — avoids 3rd DB round
        base44.entities.Project.list(),
      ]);
      const tDB2 = Date.now();

      // Build lookup maps
      const partMap = new Map(parts.map(p => [p.id, p]));
      const vendorMap = new Map(vendors.map(v => [v.id, v]));
      const commitmentMap = new Map(commitments.map(c => [c.id, c]));
      const projectMap = new Map(projects.map(p => [p.id, p]));
      const vendor = vendorMap.get(order.vendor_id);

      // Build canonical line view models
      const lines = lineItems.map(li => {
        const part = partMap.get(li.part_id);
        const commitment = li.commitment_id ? commitmentMap.get(li.commitment_id) : null;
        const project = commitment?.project_id ? projectMap.get(commitment.project_id) : null;

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
          is_line_fully_received: qty_remaining === 0 && qty_ordered > 0,
          is_line_cancelled: li.status === 'Cancelled',
          notes: li.notes || null,
          receive_qty: qty_remaining,
          location_id: null,
        };
      });

      // Canonical aggregates from active lines
      const activeLines = lines.filter(l => !l.is_line_cancelled);
      const total_qty_ordered = activeLines.reduce((s, l) => s + l.qty_ordered, 0);
      const total_qty_received = activeLines.reduce((s, l) => s + l.qty_received, 0);
      const total_qty_remaining = activeLines.reduce((s, l) => s + l.qty_remaining, 0);
      const progress_pct = total_qty_ordered > 0 ? Math.round((total_qty_received / total_qty_ordered) * 100) : 0;

      const po = {
        order_id: order.id,
        po_number: order.po_number || `PO-${order.id.slice(-6)}`,
        vendor_id: order.vendor_id,
        vendor_name: vendor?.vendor_name || 'Unknown Vendor',
        order_date: order.order_date,
        eta_date: order.eta_date,
        received_date: order.received_date,
        status: order.status,
        order_number: order.order_number,
        order_url: order.order_url,
        notes: order.notes,
        total_lines: activeLines.length,
        total_qty_ordered,
        total_qty_received,
        total_qty_remaining,
        total_cost: activeLines.reduce((s, l) => s + l.extended_cost, 0),
        progress_pct,
        lines,
        freight_cost: order.freight_cost || 0,
        tariff_cost: order.tariff_cost || 0,
        pdf_attachments: order.pdf_attachments || [],
      };

      const locationOptions = locations.map(l => ({
        id: l.id,
        name: l.location_area + (l.bin_description ? ` - ${l.bin_description}` : ''),
      }));

      const tEnd = Date.now();
      console.log(`[POReceiving:detail] order=${order_id} lines=${lineItems.length} parts=${partIds.length} | auth=${tAuth-t0}ms db_round1=${tDB1-tAuth}ms db_round2=${tDB2-tDB1}ms build=${tEnd-tDB2}ms total=${tEnd-t0}ms`);

      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        po,
        locations: locationOptions,
        _perf: { total_ms: tEnd - t0, line_count: lineItems.length },
      });
    }

    // =============================================
    // LIST MODE: Delegate to buildPOReadModel (batch)
    // =============================================
    const tListStart = Date.now();

    const orderQuery = { status: { $ne: 'Cancelled' } };
    if (filters?.vendor_id && filters.vendor_id !== 'all') {
      orderQuery.vendor_id = filters.vendor_id;
    }

    // Parallel: orders + locations
    const [filteredOrders, locations] = await Promise.all([
      base44.entities.Order.filter(orderQuery, '-created_date', 100),
      base44.entities.Location.filter({ active: { $ne: false } }),
    ]);
    const orderIds = filteredOrders.map(o => o.id);

    if (orderIds.length === 0) {
      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        orders: [],
        summary: { total_orders: 0, total_lines: 0, total_qty_remaining: 0, total_qty_ordered: 0, total_qty_received: 0 },
        locations: locations.map(l => ({ id: l.id, name: l.location_area + (l.bin_description ? ` - ${l.bin_description}` : '') })),
        filter_options: { vendors: [], projects: [] },
      });
    }

    const poResult = await base44.asServiceRole.functions.invoke('buildPOReadModel', {
      order_ids: orderIds,
      include_debug: false,
    });

    if (poResult.data?.error) {
      throw new Error(poResult.data.error);
    }

    let poViews = poResult.data?.orders || [];

    // Post-projection filtering
    if (filters.has_remaining !== false) {
      poViews = poViews.filter(po => po.total_qty_remaining > 0);
    }
    
    if (filters.search) {
      const search = filters.search.toLowerCase();
      poViews = poViews.filter(po => 
        (po.po_number && po.po_number.toLowerCase().includes(search)) ||
        po.vendor_name.toLowerCase().includes(search) ||
        po.lines.some(l => l.part_name.toLowerCase().includes(search))
      );
    }

    // Filter options
    const vendorIdsSet = [...new Set(poViews.map(po => po.vendor_id))];
    const projectIdsSet = new Set();
    poViews.forEach(po => {
      po.lines.forEach(l => { if (l.project_id) projectIdsSet.add(l.project_id); });
    });

    const [vendors, projects] = await Promise.all([
      base44.entities.Vendor.list(),
      base44.entities.Project.list(),
    ]);
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    const summary = {
      total_orders: poViews.length,
      total_lines: poViews.reduce((sum, po) => sum + po.total_lines, 0),
      total_qty_ordered: poViews.reduce((sum, po) => sum + po.total_qty_ordered, 0),
      total_qty_received: poViews.reduce((sum, po) => sum + po.total_qty_received, 0),
      total_qty_remaining: poViews.reduce((sum, po) => sum + po.total_qty_remaining, 0),
    };

    // Slim list payloads
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
      lines: po.lines?.map(l => ({ line_item_id: l.line_item_id, qty_remaining: l.qty_remaining })),
    }));

    const locationOptions = locations.map(l => ({
      id: l.id,
      name: l.location_area + (l.bin_description ? ` - ${l.bin_description}` : ''),
    }));

    const tListEnd = Date.now();
    console.log(`[POReceiving:list] orders=${poViews.length} total=${tListEnd-t0}ms`);

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      orders: ordersSlim,
      summary,
      locations: locationOptions,
      filter_options: {
        vendors: vendorIdsSet.map(id => ({ id, vendor_name: vendorMap.get(id)?.vendor_name || 'Unknown' })),
        projects: [...projectIdsSet].map(id => ({ id, name: projectMap.get(id)?.name || 'Unknown' })),
      },
    });

  } catch (error) {
    console.error("getPOReceivingView error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});