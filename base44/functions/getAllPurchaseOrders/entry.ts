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

// ── Short-term response cache ────────────────────────────────────────
const cache = new Map();
function getCached(key, ttl = 10000) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > ttl) { cache.delete(key); return null; }
  return item.data;
}
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

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

    // ── Cache check ──
    const cacheKey = `allPOs:${JSON.stringify(filters)}`;
    const cachedResult = getCached(cacheKey);
    if (cachedResult) {
      return Response.json(cachedResult);
    }

    // Build order query
    const orderQuery = {};
    if (filters.status && filters.status !== 'all') {
      orderQuery.status = filters.status;
    }
    if (filters.vendor_id && filters.vendor_id !== 'all') {
      orderQuery.vendor_id = filters.vendor_id;
    }

    // Round 1: Orders + reference data
    const [allOrders, allProjects] = await runBatched([
      () => fetchWithRetry(() => svc.entities.Order.filter(orderQuery, '-created_date', 200)),
      () => fetchWithRetry(() => svc.entities.Project.list('-created_date', 200)),
    ], 2, 150);

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

    // Round 2: Line items + vendors + parts (controlled batch)
    const [lineItems, vendors, allParts] = await runBatched([
      () => fetchWithRetry(() => svc.entities.PartPurchaseLineItem.filter({ order_id: { $in: orderIds } })),
      () => vendorIds.length > 0 ? fetchWithRetry(() => svc.entities.Vendor.filter({ id: { $in: vendorIds } })) : Promise.resolve([]),
      () => fetchWithRetry(() => svc.entities.Part.list('-created_date', 500)),
    ], 3, 150);

    // Round 3: Commitments for project linkage (only IDs found in line items)
    const commitmentIds = [...new Set(lineItems.map(li => li.commitment_id).filter(Boolean))];
    const commitments = commitmentIds.length > 0
      ? await fetchWithRetry(() => svc.entities.PartCommitment.filter({ id: { $in: commitmentIds } }))
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

    const responsePayload = {
      success: true,
      orders: poViews,
      summary,
      filter_options: {
        vendors: allVendorIds.map(id => ({ id, vendor_name: vendorMap.get(id)?.vendor_name || 'Unknown' })),
        projects: [...allProjectIds].map(id => ({ id, name: projectMap.get(id)?.name || 'Unknown' })),
        statuses: allStatuses,
      },
    };

    setCache(cacheKey, responsePayload);
    return Response.json(responsePayload);

  } catch (error) {
    const msg = error?.message || '';
    const isRateLimit = error?.status === 429 || msg.includes('429') || msg.includes('Too Many Requests');
    console.error("getAllPurchaseOrders error:", { type: isRateLimit ? 'RATE_LIMIT' : 'UNKNOWN', message: msg });
    return Response.json({
      success: false,
      error: { type: isRateLimit ? 'RATE_LIMIT' : 'UNKNOWN', message: msg }
    }, { status: isRateLimit ? 429 : 500 });
  }
});