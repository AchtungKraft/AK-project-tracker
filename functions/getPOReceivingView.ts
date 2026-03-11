import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/** 
 * getPOReceivingView - PO-centric receiving read model
 * 
 * BOTH MODES use inlined read-model logic with asServiceRole queries.
 * No nested function calls. Exactly 2 parallel DB rounds per mode.
 * 
 * DETAIL MODE (order_id provided):
 *   Round 1: order, line items, locations
 *   Round 2: parts, vendors, commitments, projects
 *   Returns full line-level detail for receiving UI.
 * 
 * LIST MODE (no order_id):
 *   Round 1: orders, line items, locations
 *   Round 2: parts, vendors, commitments, projects
 *   Returns slim order summaries — no full line objects in response.
 * 
 * CANONICAL RULES:
 * - qty_remaining = qty_ordered - qty_received (derived, never stored)
 * - qty_ordered is IMMUTABLE after PO creation
 * - Receivability determined by qty_remaining > 0, NOT by status
 * 
 * PERFORMANCE TARGETS (warm):
 *   1–5 POs: <1s | 10–20 POs: <1.5s | 50+ POs: <2.5s
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

    // Service role for ALL entity queries (avoids permission overhead)
    const svc = base44.asServiceRole;

    // =============================================
    // DETAIL MODE: Inline read model (no nested call)
    // 2 DB rounds: round 1 gets order+lines+locations,
    //              round 2 gets all reference data in parallel
    // =============================================
    if (order_id) {

      // ROUND 1: Core data — order, lines, locations
      const [orderResults, lineItems, locations] = await Promise.all([
        svc.entities.Order.filter({ id: order_id }),
        svc.entities.PartPurchaseLineItem.filter({ order_id }),
        svc.entities.Location.filter({ active: { $ne: false } }),
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
      const [parts, vendors, commitments, projects] = await Promise.all([
        partIds.length > 0
          ? svc.entities.Part.filter({ id: { $in: partIds } })
          : Promise.resolve([]),
        vendorIds.length > 0
          ? svc.entities.Vendor.filter({ id: { $in: vendorIds } })
          : Promise.resolve([]),
        commitmentIds.length > 0
          ? svc.entities.PartCommitment.filter({ id: { $in: commitmentIds } })
          : Promise.resolve([]),
        // Projects: small table, fetched once in parallel — avoids 3rd DB round
        svc.entities.Project.list(),
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
    // LIST MODE: Inline read model (no nested call)
    // Same 2-round pattern as detail mode with asServiceRole
    // =============================================
    const orderQuery = { status: { $ne: 'Cancelled' } };
    if (filters?.vendor_id && filters.vendor_id !== 'all') {
      orderQuery.vendor_id = filters.vendor_id;
    }

    // ROUND 1: Orders + all line items + locations in parallel
    const [filteredOrders, allLineItems, locations] = await Promise.all([
      svc.entities.Order.filter(orderQuery, '-created_date', 100),
      svc.entities.PartPurchaseLineItem.list('-created_date', 500),
      svc.entities.Location.filter({ active: { $ne: false } }),
    ]);
    const tDB1 = Date.now();

    // Index line items by order_id for fast lookup
    const linesByOrder = new Map();
    for (const li of allLineItems) {
      if (!li.order_id) continue;
      if (!linesByOrder.has(li.order_id)) linesByOrder.set(li.order_id, []);
      linesByOrder.get(li.order_id).push(li);
    }

    // Filter to orders that have remaining qty
    const orderIds = filteredOrders.map(o => o.id);
    const relevantOrders = filteredOrders.filter(o => {
      const lines = linesByOrder.get(o.id) || [];
      const remaining = lines
        .filter(l => l.status !== 'Cancelled')
        .reduce((s, l) => s + Math.max(0, (l.qty_ordered ?? 0) - (l.qty_received ?? 0)), 0);
      return remaining > 0;
    });

    if (relevantOrders.length === 0) {
      const locationOptions = locations.map(l => ({
        id: l.id,
        name: l.location_area + (l.bin_description ? ` - ${l.bin_description}` : ''),
      }));
      const tEnd = Date.now();
      console.log(`[POReceiving:list] orders=0 | auth=${tAuth-t0}ms db_round1=${tDB1-tAuth}ms total=${tEnd-t0}ms`);
      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        orders: [],
        summary: { total_orders: 0, total_lines: 0, total_qty_remaining: 0, total_qty_ordered: 0, total_qty_received: 0 },
        locations: locationOptions,
        filter_options: { vendors: [], projects: [] },
      });
    }

    // Collect IDs for reference data
    const partIds = new Set();
    const vendorIds = new Set();
    const commitmentIds = new Set();
    for (const o of relevantOrders) {
      if (o.vendor_id) vendorIds.add(o.vendor_id);
      const lines = linesByOrder.get(o.id) || [];
      for (const li of lines) {
        if (li.part_id) partIds.add(li.part_id);
        if (li.vendor_id) vendorIds.add(li.vendor_id);
        if (li.commitment_id) commitmentIds.add(li.commitment_id);
      }
    }

    // ROUND 2: All reference data in parallel
    const [parts, vendors, commitments, projects] = await Promise.all([
      partIds.size > 0 ? svc.entities.Part.filter({ id: { $in: [...partIds] } }) : Promise.resolve([]),
      vendorIds.size > 0 ? svc.entities.Vendor.filter({ id: { $in: [...vendorIds] } }) : Promise.resolve([]),
      commitmentIds.size > 0 ? svc.entities.PartCommitment.filter({ id: { $in: [...commitmentIds] } }) : Promise.resolve([]),
      svc.entities.Project.list(),
    ]);
    const tDB2 = Date.now();

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const commitmentMap = new Map(commitments.map(c => [c.id, c]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // Build PO view models
    let poViews = relevantOrders.map(order => {
      const vendor = vendorMap.get(order.vendor_id);
      const orderLines = linesByOrder.get(order.id) || [];

      const lines = orderLines.map(li => {
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
          qty_ordered, qty_received, qty_remaining,
          status: li.status || 'Ordered',
          is_line_cancelled: li.status === 'Cancelled',
          project_id: commitment?.project_id || null,
          project_name: project?.name || 'AK Stock',
        };
      });

      const activeLines = lines.filter(l => !l.is_line_cancelled);
      const total_qty_ordered = activeLines.reduce((s, l) => s + l.qty_ordered, 0);
      const total_qty_received = activeLines.reduce((s, l) => s + l.qty_received, 0);
      const total_qty_remaining = activeLines.reduce((s, l) => s + l.qty_remaining, 0);

      return {
        order_id: order.id,
        po_number: order.po_number || `PO-${order.id.slice(-6)}`,
        vendor_id: order.vendor_id,
        vendor_name: vendor?.vendor_name || 'Unknown Vendor',
        status: order.status,
        order_date: order.order_date,
        order_number: order.order_number,
        order_url: order.order_url,
        total_lines: activeLines.length,
        total_qty_ordered,
        total_qty_received,
        total_qty_remaining,
        progress_pct: total_qty_ordered > 0 ? Math.round((total_qty_received / total_qty_ordered) * 100) : 0,
        pdf_attachments: order.pdf_attachments || [],
        lines,
      };
    });

    // Post-projection search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      poViews = poViews.filter(po =>
        (po.po_number && po.po_number.toLowerCase().includes(search)) ||
        po.vendor_name.toLowerCase().includes(search) ||
        po.lines.some(l => l.part_name.toLowerCase().includes(search))
      );
    }

    const summary = {
      total_orders: poViews.length,
      total_lines: poViews.reduce((s, po) => s + po.total_lines, 0),
      total_qty_ordered: poViews.reduce((s, po) => s + po.total_qty_ordered, 0),
      total_qty_received: poViews.reduce((s, po) => s + po.total_qty_received, 0),
      total_qty_remaining: poViews.reduce((s, po) => s + po.total_qty_remaining, 0),
    };

    // Slim list payloads — no per-line objects, only order-level summaries
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
    }));

    const locationOptions = locations.map(l => ({
      id: l.id,
      name: l.location_area + (l.bin_description ? ` - ${l.bin_description}` : ''),
    }));

    // Filter options from result set
    const vendorIdsSet = [...new Set(poViews.map(po => po.vendor_id))];

    const tEnd = Date.now();
    console.log(`[POReceiving:list] orders=${poViews.length} | auth=${tAuth-t0}ms db_round1=${tDB1-tAuth}ms db_round2=${tDB2-tDB1}ms build=${tEnd-tDB2}ms total=${tEnd-t0}ms`);

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      orders: ordersSlim,
      summary,
      locations: locationOptions,
      filter_options: {
        vendors: vendorIdsSet.map(id => ({ id, vendor_name: vendorMap.get(id)?.vendor_name || 'Unknown' })),
      },
    });

  } catch (error) {
    console.error("getPOReceivingView error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});