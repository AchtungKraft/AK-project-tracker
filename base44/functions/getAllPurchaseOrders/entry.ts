import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getAllPurchaseOrders - Global PO dashboard read model
 * 
 * Returns ALL purchase orders (including fully received) with:
 * - Order-level aggregates (qty, cost, progress)
 * - Vendor name
 * - Project names (derived from commitments)
 * - Billing status
 * - Part names summary
 * 
 * Supports filters: status, vendor_id, project_id, search
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

    const { filters = {} } = await req.json();
    const svc = base44.asServiceRole;

    // Build order query
    const orderQuery = {};
    if (filters.status && filters.status !== 'all') {
      orderQuery.status = filters.status;
    }
    if (filters.vendor_id && filters.vendor_id !== 'all') {
      orderQuery.vendor_id = filters.vendor_id;
    }

    // Round 1: Orders + reference data
    const [allOrders, allProjects] = await Promise.all([
      svc.entities.Order.filter(orderQuery, '-created_date', 200),
      svc.entities.Project.list('-created_date', 200),
    ]);

    if (allOrders.length === 0) {
      return Response.json({
        success: true,
        orders: [],
        summary: { total_orders: 0, total_cost: 0, total_qty_ordered: 0, total_qty_received: 0, total_qty_remaining: 0 },
        filter_options: { vendors: [], projects: [], statuses: [] },
      });
    }

    const orderIds = allOrders.map(o => o.id);
    const vendorIds = [...new Set(allOrders.map(o => o.vendor_id).filter(Boolean))];

    // Round 2: Line items + vendors + parts
    const [lineItems, vendors, allParts] = await Promise.all([
      svc.entities.PartPurchaseLineItem.filter({ order_id: { $in: orderIds } }),
      vendorIds.length > 0 ? svc.entities.Vendor.filter({ id: { $in: vendorIds } }) : Promise.resolve([]),
      svc.entities.Part.list('-created_date', 500),
    ]);

    // Round 3: Commitments for project linkage (only IDs found in line items)
    const commitmentIds = [...new Set(lineItems.map(li => li.commitment_id).filter(Boolean))];
    const commitments = commitmentIds.length > 0
      ? await svc.entities.PartCommitment.filter({ id: { $in: commitmentIds } })
      : [];

    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const partNameMap = new Map(allParts.map(p => [p.id, p.part_name]));
    const commitmentMap = new Map(commitments.map(c => [c.id, c]));
    const projectMap = new Map(allProjects.map(p => [p.id, p]));

    // Index line items by order
    const linesByOrder = new Map();
    for (const li of lineItems) {
      if (!li.order_id) continue;
      if (!linesByOrder.has(li.order_id)) linesByOrder.set(li.order_id, []);
      linesByOrder.get(li.order_id).push(li);
    }

    // Build PO view models
    let poViews = allOrders.map(order => {
      const vendor = vendorMap.get(order.vendor_id);
      const orderLines = linesByOrder.get(order.id) || [];

      let total_qty_ordered = 0;
      let total_qty_received = 0;
      let total_qty_remaining = 0;
      let total_cost = 0;
      let activeCount = 0;

      const partNames = [];
      const seenPartIds = new Set();
      const projectIds = new Set();

      for (const li of orderLines) {
        if (li.status === 'Cancelled') continue;
        activeCount++;
        const qo = li.qty_ordered ?? 0;
        const qr = li.qty_received ?? 0;
        const rem = Math.max(0, qo - qr);
        const cost = (li.unit_cost || li.unit_price || 0) * qo;
        total_qty_ordered += qo;
        total_qty_received += qr;
        total_qty_remaining += rem;
        total_cost += cost;

        if (li.part_id && !seenPartIds.has(li.part_id)) {
          seenPartIds.add(li.part_id);
          const name = partNameMap.get(li.part_id);
          if (name) partNames.push(name);
        }

        if (li.commitment_id) {
          const c = commitmentMap.get(li.commitment_id);
          if (c?.project_id) projectIds.add(c.project_id);
        }
      }

      const projectNames = [...projectIds].map(pid => projectMap.get(pid)?.name).filter(Boolean);

      return {
        order_id: order.id,
        po_number: order.po_number || `PO-${order.id.slice(-6)}`,
        vendor_id: order.vendor_id,
        vendor_name: vendor?.vendor_name || 'Unknown Vendor',
        status: order.status || 'Draft',
        order_date: order.order_date,
        order_number: order.order_number,
        order_url: order.order_url,
        billing_status: order.billing_status || 'Not Invoiced',
        total_lines: activeCount,
        total_qty_ordered,
        total_qty_received,
        total_qty_remaining,
        total_cost,
        progress_pct: total_qty_ordered > 0 ? Math.round((total_qty_received / total_qty_ordered) * 100) : 0,
        part_names: partNames,
        project_names: projectNames,
        project_ids: [...projectIds],
        pdf_attachments: order.pdf_attachments || [],
        freight_cost: order.freight_cost || 0,
        tariff_cost: order.tariff_cost || 0,
      };
    });

    // Project filter (post-projection)
    if (filters.project_id && filters.project_id !== 'all') {
      poViews = poViews.filter(po => po.project_ids.includes(filters.project_id));
    }

    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      poViews = poViews.filter(po =>
        (po.po_number && po.po_number.toLowerCase().includes(search)) ||
        (po.order_number && po.order_number.toLowerCase().includes(search)) ||
        po.vendor_name.toLowerCase().includes(search) ||
        po.project_names.some(n => n.toLowerCase().includes(search))
      );
    }

    const summary = {
      total_orders: poViews.length,
      total_cost: poViews.reduce((s, po) => s + po.total_cost, 0),
      total_qty_ordered: poViews.reduce((s, po) => s + po.total_qty_ordered, 0),
      total_qty_received: poViews.reduce((s, po) => s + po.total_qty_received, 0),
      total_qty_remaining: poViews.reduce((s, po) => s + po.total_qty_remaining, 0),
    };

    // Filter options from full dataset (before search/project filter)
    const allVendorIds = [...new Set(allOrders.map(o => o.vendor_id).filter(Boolean))];
    const allProjectIds = new Set();
    for (const li of lineItems) {
      if (li.commitment_id) {
        const c = commitmentMap.get(li.commitment_id);
        if (c?.project_id) allProjectIds.add(c.project_id);
      }
    }
    const allStatuses = [...new Set(allOrders.map(o => o.status).filter(Boolean))];

    const tEnd = Date.now();
    console.log(`[getAllPurchaseOrders] orders=${poViews.length} lines=${lineItems.length} | total=${tEnd - t0}ms`);

    return Response.json({
      success: true,
      orders: poViews,
      summary,
      filter_options: {
        vendors: allVendorIds.map(id => ({ id, vendor_name: vendorMap.get(id)?.vendor_name || 'Unknown' })),
        projects: [...allProjectIds].map(id => ({ id, name: projectMap.get(id)?.name || 'Unknown' })),
        statuses: allStatuses,
      },
    });

  } catch (error) {
    console.error("getAllPurchaseOrders error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});