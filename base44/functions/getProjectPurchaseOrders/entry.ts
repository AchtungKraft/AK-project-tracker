import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Retry wrapper for transient failures (429, network) ──────────────
async function fetchWithRetry(fn, { retries = 2, delay = 800 } = {}) {
  try { return await fn(); }
  catch (err) {
    const msg = err?.message || '';
    const isRetryable = err?.status === 429 || msg.includes('429') || msg.includes('Too Many Requests') || err?.name === 'FetchError' || msg.includes('ECONNRESET');
    if (retries > 0 && isRetryable) {
      const jitter = Math.random() * 400;
      await new Promise(r => setTimeout(r, delay + jitter));
      return fetchWithRetry(fn, { retries: retries - 1, delay: delay * 2 });
    }
    throw err;
  }
}

// ── Controlled batching — max 3 concurrent, 150ms gap ────────────────
async function runBatched(tasks, batchSize = 3, delay = 150) {
  const results = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn => fn()));
    results.push(...batchResults);
    if (i + batchSize < tasks.length) {
      const jitter = Math.random() * 150;
      await new Promise(r => setTimeout(r, delay + jitter));
    }
  }
  return results;
}

/**
 * getProjectPurchaseOrders - Project-level PO visibility
 * 
 * PERF FIX: Inline PO read model instead of nesting buildPOReadModel call
 * to avoid double cold-start and timeout issues.
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

    // Fetch commitments for this project to scope line items
    const commitments = await fetchWithRetry(() => base44.entities.PartCommitment.filter({ project_id }));
    const commitmentIds = commitments.map(c => c.id);
    
    if (commitmentIds.length === 0) {
      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        project_id,
        orders: [],
        summary: { total_orders: 0, total_lines: 0, total_qty_ordered: 0, total_qty_received: 0, total_qty_remaining: 0, total_cost: 0, receivable_count: 0, fully_received_count: 0, cancelled_count: 0 },
      });
    }

    // Fetch line items scoped to project commitments
    const lineItems = await fetchWithRetry(() => base44.entities.PartPurchaseLineItem.filter({ commitment_id: { $in: commitmentIds } }));
    
    // Derive order IDs and fetch orders
    const orderIds = [...new Set(lineItems.map(li => li.order_id).filter(Boolean))];
    
    if (orderIds.length === 0) {
      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        project_id,
        orders: [],
        summary: { total_orders: 0, total_lines: 0, total_qty_ordered: 0, total_qty_received: 0, total_qty_remaining: 0, total_cost: 0, receivable_count: 0, fully_received_count: 0, cancelled_count: 0 },
      });
    }

    const orders = await fetchWithRetry(() => base44.entities.Order.filter({ id: { $in: orderIds } }));

    // Fetch reference data scoped by IDs
    const partIds = [...new Set(lineItems.map(li => li.part_id).filter(Boolean))];
    const vendorIds = [...new Set([...orders.map(o => o.vendor_id), ...lineItems.map(li => li.vendor_id)].filter(Boolean))];

    const [parts, vendors] = await runBatched([
      () => partIds.length > 0 ? fetchWithRetry(() => base44.entities.Part.filter({ id: { $in: partIds } })) : Promise.resolve([]),
      () => vendorIds.length > 0 ? fetchWithRetry(() => base44.entities.Vendor.filter({ id: { $in: vendorIds } })) : Promise.resolve([]),
    ], 2, 150);

    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const commitmentMap = new Map(commitments.map(c => [c.id, c]));

    // Build PO view models
    const poViewModels = orders.map(order => {
      const vendor = vendorMap.get(order.vendor_id);
      const orderLineItems = lineItems.filter(li => li.order_id === order.id);

      const lines = orderLineItems.map(li => {
        const part = partMap.get(li.part_id);
        const commitment = li.commitment_id ? commitmentMap.get(li.commitment_id) : null;
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
          status: li.status || 'Ordered',
          is_line_fully_received: qty_remaining === 0 && qty_ordered > 0,
          is_line_cancelled: li.status === 'Cancelled',
          notes: li.notes || null,
        };
      });

      const activeLines = lines.filter(l => !l.is_line_cancelled);
      const total_qty_ordered = activeLines.reduce((sum, l) => sum + l.qty_ordered, 0);
      const total_qty_received = activeLines.reduce((sum, l) => sum + l.qty_received, 0);
      const total_qty_remaining = activeLines.reduce((sum, l) => sum + l.qty_remaining, 0);
      const total_cost = activeLines.reduce((sum, l) => sum + l.extended_cost, 0);

      return {
        order_id: order.id,
        po_number: order.po_number || `PO-${order.id.slice(-6)}`,
        vendor_id: order.vendor_id,
        vendor_name: vendor?.vendor_name || 'Unknown Vendor',
        order_date: order.order_date,
        eta_date: order.eta_date,
        received_date: order.received_date,
        created_date: order.created_date,
        status: order.status,
        is_receivable: total_qty_remaining > 0,
        is_fully_received: total_qty_remaining === 0 && total_qty_ordered > 0,
        is_cancelled: order.status === 'Cancelled',
        order_number: order.order_number,
        order_url: order.order_url,
        notes: order.notes,
        total_lines: activeLines.length,
        total_qty_ordered,
        total_qty_received,
        total_qty_remaining,
        total_cost,
        progress_pct: total_qty_ordered > 0 ? Math.round((total_qty_received / total_qty_ordered) * 100) : 0,
        lines,
        freight_cost: order.freight_cost || 0,
        tariff_cost: order.tariff_cost || 0,
        billing_status: order.billing_status || 'Not Invoiced',
        pdf_attachments: order.pdf_attachments || [],
      };
    });

    poViewModels.sort((a, b) => new Date(b.order_date || b.created_date) - new Date(a.order_date || a.created_date));

    const summary = {
      total_orders: poViewModels.length,
      total_lines: poViewModels.reduce((sum, o) => sum + o.total_lines, 0),
      total_qty_ordered: poViewModels.reduce((sum, o) => sum + o.total_qty_ordered, 0),
      total_qty_received: poViewModels.reduce((sum, o) => sum + o.total_qty_received, 0),
      total_qty_remaining: poViewModels.reduce((sum, o) => sum + o.total_qty_remaining, 0),
      total_cost: poViewModels.reduce((sum, o) => sum + o.total_cost, 0),
      receivable_count: poViewModels.filter(o => o.is_receivable && !o.is_cancelled).length,
      fully_received_count: poViewModels.filter(o => o.is_fully_received).length,
      cancelled_count: poViewModels.filter(o => o.is_cancelled).length,
    };

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      project_id,
      orders: poViewModels,
      summary,
    });

  } catch (error) {
    const msg = error?.message || '';
    const isRateLimit = error?.status === 429 || msg.includes('429') || msg.includes('Too Many Requests');
    console.error("getProjectPurchaseOrders error:", { type: isRateLimit ? 'RATE_LIMIT' : 'UNKNOWN', message: msg });
    return Response.json({
      success: false,
      error: { type: isRateLimit ? 'RATE_LIMIT' : 'UNKNOWN', message: msg }
    }, { status: isRateLimit ? 429 : 500 });
  }
});