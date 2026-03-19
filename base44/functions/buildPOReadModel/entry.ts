import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * buildPOReadModel - CANONICAL PO Read Model Builder
 * 
 * Single source of truth for PO data projection.
 * Used by: getPOReceivingView, getProjectPurchaseOrders, any PO detail surface.
 * 
 * CANONICAL RULES:
 * - qty_remaining = COALESCE(qty_ordered, 0) - COALESCE(qty_received, 0)
 * - Aggregates derived from line-level, not stored on header
 * - qty_ordered is IMMUTABLE after creation
 * - qty_received only increments via RECEIVE action
 * 
 * Returns identical structure regardless of caller.
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

    const { 
      order_id,           // Single PO detail mode
      order_ids,          // Batch mode (array of order IDs)
      project_id,         // Project filter mode
      include_debug = false,  // Include debug diagnostics (PRODUCTION: default false)
    } = await req.json();

    // PHASE 4: PERFORMANCE OPTIMIZATION
    // Collect unique IDs first, then fetch only required records
    // This prevents O(N) full-table scans on every PO request
    
    // Determine which orders to fetch first to get line items
    let orders = [];
    let lineItems = [];

    if (order_id) {
      orders = await base44.entities.Order.filter({ id: order_id });
      lineItems = await base44.entities.PartPurchaseLineItem.filter({ order_id });
    } else if (order_ids && order_ids.length > 0) {
      orders = await base44.entities.Order.filter({ id: { $in: order_ids } });
      lineItems = await base44.entities.PartPurchaseLineItem.filter({ order_id: { $in: order_ids } });
    } else if (project_id) {
      // For project mode: fetch commitments, then scoped line items
      const projectCommitments = await base44.entities.PartCommitment.filter({ project_id });
      const projectCommitmentIds = projectCommitments.map(c => c.id);
      
      // PERF FIX: Use scoped $in query instead of full list() + filter
      if (projectCommitmentIds.length > 0) {
        lineItems = await base44.entities.PartPurchaseLineItem.filter({ commitment_id: { $in: projectCommitmentIds } });
      }
      
      const orderIds = [...new Set(lineItems.map(li => li.order_id).filter(Boolean))];
      if (orderIds.length > 0) {
        orders = await base44.entities.Order.filter({ id: { $in: orderIds } });
      }
    } else {
      return Response.json({ error: 'order_id, order_ids[], or project_id required' }, { status: 400 });
    }

    // Now collect unique IDs from line items for targeted fetches
    const partIds = [...new Set(lineItems.map(li => li.part_id).filter(Boolean))];
    const vendorIds = [...new Set([
      ...orders.map(o => o.vendor_id).filter(Boolean),
      ...lineItems.map(li => li.vendor_id).filter(Boolean)
    ])];
    const commitmentIds = [...new Set(lineItems.map(li => li.commitment_id).filter(Boolean))];

    // Fetch only required reference data (scoped by IDs)
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
      // Projects: fetch only those referenced by commitments
      (() => {
        const projectIdsFromCommitments = [...new Set(commitments.map(c => c.project_id).filter(Boolean))];
        return projectIdsFromCommitments.length > 0
          ? base44.entities.Project.filter({ id: { $in: projectIdsFromCommitments } })
          : Promise.resolve([]);
      })(),
    ]);

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const commitmentMap = new Map(commitments.map(c => [c.id, c]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // Data already fetched in PHASE 4 optimization above

    // Build canonical PO view models
    const poViewModels = orders.map(order => {
      const vendor = vendorMap.get(order.vendor_id);
      
      // Get line items for this order
      // PURE PROJECTION: Include all lines, let caller filter if needed
      const orderLineItems = lineItems.filter(li => li.order_id === order.id);

      // Build canonical line view models
      const lines = orderLineItems.map(li => {
        const part = partMap.get(li.part_id);
        const commitment = li.commitment_id ? commitmentMap.get(li.commitment_id) : null;
        const project = commitment?.project_id ? projectMap.get(commitment.project_id) : null;

        // CANONICAL: qty_ordered and qty_received from line item - IMMUTABLE source
        const qty_ordered = li.qty_ordered ?? 0;
        const qty_received = li.qty_received ?? 0;
        
        // DEV GUARD: Warn if qty_ordered is missing (indicates CREATE_PO storage issue)
        if (include_debug && li.qty_ordered == null) {
          console.warn(`[DATA_INTEGRITY] Line ${li.id} missing qty_ordered - potential CREATE_PO issue`);
        }
        
        // CANONICAL: qty_remaining is always derived, never stored
        const qty_remaining = Math.max(0, qty_ordered - qty_received);

        return {
          line_item_id: li.id,
          part_id: li.part_id,
          part_name: part?.part_name || 'Unknown Part',
          vendor_part_number: part?.vendor_part_number || null,
          featured_photo: part?.featured_photo || null,
          
          // CANONICAL QUANTITIES - from line item, immutable after creation
          qty_ordered,
          qty_received,
          qty_remaining,
          
          // Pricing snapshots
          unit_cost: li.unit_cost || li.unit_price || 0,
          extended_cost: (li.unit_cost || li.unit_price || 0) * qty_ordered,
          
          // Commitment linkage
          commitment_id: li.commitment_id || null,
          project_id: commitment?.project_id || null,
          project_name: project?.name || 'AK Stock',
          
          // Line status
          status: li.status || 'Ordered',
          is_line_fully_received: qty_remaining === 0 && qty_ordered > 0,
          is_line_cancelled: li.status === 'Cancelled',
          
          // Notes
          notes: li.notes || null,
          
          // For UI receive input
          receive_qty: qty_remaining,
          location_id: null,
        };
      });

      // CANONICAL AGGREGATES - derived from non-cancelled lines only
      const activeLines = lines.filter(l => !l.is_line_cancelled);
      const total_qty_ordered = activeLines.reduce((sum, l) => sum + l.qty_ordered, 0);
      const total_qty_received = activeLines.reduce((sum, l) => sum + l.qty_received, 0);
      const total_qty_remaining = activeLines.reduce((sum, l) => sum + l.qty_remaining, 0);
      const total_cost = activeLines.reduce((sum, l) => sum + l.extended_cost, 0);
      const total_lines_active = activeLines.length;
      const total_lines_cancelled = lines.length - activeLines.length;

      // Compute progress percentage safely
      const progress_pct = total_qty_ordered > 0 
        ? Math.round((total_qty_received / total_qty_ordered) * 100) 
        : 0;

      // Determine derived flags
      const is_receivable = total_qty_remaining > 0;
      const is_fully_received = total_qty_remaining === 0 && total_qty_ordered > 0;
      const is_cancelled = order.status === 'Cancelled';

      const poViewModel = {
        order_id: order.id,
        po_number: order.po_number || `PO-${order.id.slice(-6)}`,
        vendor_id: order.vendor_id,
        vendor_name: vendor?.vendor_name || 'Unknown Vendor',
        
        // Dates
        order_date: order.order_date,
        eta_date: order.eta_date,
        received_date: order.received_date,
        created_date: order.created_date,
        
        // Status
        status: order.status,
        is_receivable,
        is_fully_received,
        is_cancelled,
        
        // External references
        order_number: order.order_number,
        order_url: order.order_url,
        notes: order.notes,
        
        // CANONICAL AGGREGATES (from active lines only)
        total_lines: total_lines_active,
        total_lines_cancelled,
        total_qty_ordered,
        total_qty_received,
        total_qty_remaining,
        total_cost,
        progress_pct,
        
        // Lines
        lines,
        
        // Order-level costs
        freight_cost: order.freight_cost || 0,
        tariff_cost: order.tariff_cost || 0,
        
        // Attachments
        pdf_attachments: order.pdf_attachments || [],
      };

      // Add debug diagnostics ONLY if explicitly requested (development only)
      if (include_debug === true) {
        // Raw line sums for integrity validation (active lines only)
        const rawActiveLines = lineItems.filter(li => li.order_id === order.id && li.status !== 'Cancelled');
        const rawAllLines = lineItems.filter(li => li.order_id === order.id);
        
        // PHASE 2: Legacy guard - warn but don't throw for missing qty_ordered
        const linesMissingQtyOrdered = rawAllLines.filter(li => li.qty_ordered == null);
        if (linesMissingQtyOrdered.length > 0) {
          console.warn(`[LEGACY_PO_LINE_MISSING_QTY_ORDERED] Order ${order.id} has ${linesMissingQtyOrdered.length} lines without qty_ordered`);
          linesMissingQtyOrdered.forEach(li => {
            console.warn(`  - Line ${li.id}, part=${li.part_id}`);
          });
        }
        
        poViewModel._debug = {
          line_count_total: rawAllLines.length,
          line_count_active: rawActiveLines.length,
          line_count_cancelled: rawAllLines.length - rawActiveLines.length,
          lines_missing_qty_ordered: linesMissingQtyOrdered.length,
          lines_missing_qty_ordered_ids: linesMissingQtyOrdered.map(li => li.id),
          line_sum_ordered: rawActiveLines.reduce((sum, li) => sum + (li.qty_ordered ?? 0), 0),
          line_sum_received: rawActiveLines.reduce((sum, li) => sum + (li.qty_received ?? 0), 0),
          line_sum_remaining: rawActiveLines.reduce((sum, li) => sum + Math.max(0, (li.qty_ordered ?? 0) - (li.qty_received ?? 0)), 0),
          // Integrity checks
          ordered_matches: rawActiveLines.reduce((sum, li) => sum + (li.qty_ordered ?? 0), 0) === total_qty_ordered,
          received_matches: rawActiveLines.reduce((sum, li) => sum + (li.qty_received ?? 0), 0) === total_qty_received,
          remaining_matches: rawActiveLines.reduce((sum, li) => sum + Math.max(0, (li.qty_ordered ?? 0) - (li.qty_received ?? 0)), 0) === total_qty_remaining,
        };
      }
      // PHASE 3: No debug fields in standard responses

      return poViewModel;
    });

    // Sort by date descending
    poViewModels.sort((a, b) => 
      new Date(b.order_date || b.created_date) - new Date(a.order_date || a.created_date)
    );

    // Build summary
    const summary = {
      total_orders: poViewModels.length,
      total_lines: poViewModels.reduce((sum, o) => sum + o.total_lines, 0),
      total_qty_ordered: poViewModels.reduce((sum, o) => sum + o.total_qty_ordered, 0),
      total_qty_received: poViewModels.reduce((sum, o) => sum + o.total_qty_received, 0),
      total_qty_remaining: poViewModels.reduce((sum, o) => sum + o.total_qty_remaining, 0),
      total_cost: poViewModels.reduce((sum, o) => sum + o.total_cost, 0),
      receivable_count: poViewModels.filter(o => o.is_receivable).length,
      fully_received_count: poViewModels.filter(o => o.is_fully_received).length,
      cancelled_count: poViewModels.filter(o => o.is_cancelled).length,
    };

    // Single PO mode returns single object
    if (order_id) {
      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        po: poViewModels[0] || null,
        summary,
      });
    }

    // Multi-PO mode returns array
    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      orders: poViewModels,
      summary,
    });

  } catch (error) {
    console.error("buildPOReadModel error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});