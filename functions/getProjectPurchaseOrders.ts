import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * getProjectPurchaseOrders - Project-level PO visibility
 * 
 * Returns all POs tied to a project's commitments.
 * Visibility is NOT filtered by status - all POs are shown:
 * - Created, Ordered, Partial, Received, Cancelled
 * 
 * This provides complete project procurement history.
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

    const { project_id } = await req.json();
    
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // Fetch all data in parallel
    const [commitments, lineItems, orders, parts, vendors] = await Promise.all([
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.PartPurchaseLineItem.list(),
      base44.entities.Order.list(), // All orders - no status filter
      base44.entities.Part.list(),
      base44.entities.Vendor.list(),
    ]);

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const commitmentMap = new Map(commitments.map(c => [c.id, c]));

    // Get commitment IDs for this project
    const projectCommitmentIds = new Set(commitments.map(c => c.id));

    // Find all line items linked to this project's commitments
    const projectLineItems = lineItems.filter(li => 
      li.commitment_id && projectCommitmentIds.has(li.commitment_id)
    );

    // Get unique order IDs from these line items
    const projectOrderIds = new Set(projectLineItems.map(li => li.order_id));

    // Build PO view models for project orders
    const projectOrders = orders
      .filter(o => projectOrderIds.has(o.id))
      .map(order => {
        const vendor = vendorMap.get(order.vendor_id);
        const orderLineItems = lineItems.filter(li => li.order_id === order.id);
        
        // Filter to only lines for this project
        const projectLines = orderLineItems.filter(li => 
          li.commitment_id && projectCommitmentIds.has(li.commitment_id)
        );

        // Build line view models
        const lines = projectLines.map(li => {
          const part = partMap.get(li.part_id);
          const commitment = commitmentMap.get(li.commitment_id);

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
            commitment_id: li.commitment_id,
            status: li.status || 'Ordered',
          };
        });

        // Aggregate quantities
        const total_qty_ordered = lines.reduce((sum, l) => sum + l.qty_ordered, 0);
        const total_qty_received = lines.reduce((sum, l) => sum + l.qty_received, 0);
        const total_qty_remaining = lines.reduce((sum, l) => sum + l.qty_remaining, 0);
        const total_cost = lines.reduce((sum, l) => sum + l.extended_cost, 0);

        // Determine receivable status (qty-based, not status-based)
        const is_receivable = total_qty_remaining > 0;

        return {
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
          // Quantities for this project only
          total_lines: lines.length,
          total_qty_ordered,
          total_qty_received,
          total_qty_remaining,
          total_cost,
          // Derived flags
          is_receivable,
          is_fully_received: total_qty_remaining === 0 && total_qty_ordered > 0,
          is_cancelled: order.status === 'Cancelled',
          // Lines for detail view
          lines,
          // Order-level costs
          freight_cost: order.freight_cost || 0,
          tariff_cost: order.tariff_cost || 0,
          pdf_attachments: order.pdf_attachments || [],
          created_date: order.created_date,
        };
      })
      // Sort by date descending (most recent first)
      .sort((a, b) => new Date(b.order_date || b.created_date) - new Date(a.order_date || a.created_date));

    // Summary
    const summary = {
      total_orders: projectOrders.length,
      total_lines: projectOrders.reduce((sum, o) => sum + o.total_lines, 0),
      total_qty_ordered: projectOrders.reduce((sum, o) => sum + o.total_qty_ordered, 0),
      total_qty_received: projectOrders.reduce((sum, o) => sum + o.total_qty_received, 0),
      total_qty_remaining: projectOrders.reduce((sum, o) => sum + o.total_qty_remaining, 0),
      total_cost: projectOrders.reduce((sum, o) => sum + o.total_cost, 0),
      receivable_count: projectOrders.filter(o => o.is_receivable).length,
      fully_received_count: projectOrders.filter(o => o.is_fully_received).length,
      cancelled_count: projectOrders.filter(o => o.is_cancelled).length,
    };

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      project_id,
      orders: projectOrders,
      summary,
    });

  } catch (error) {
    console.error("getProjectPurchaseOrders error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});