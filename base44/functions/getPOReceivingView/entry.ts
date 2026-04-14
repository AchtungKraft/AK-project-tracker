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
 * getPOReceivingView - PO-centric receiving read model
 * 
 * BOTH MODES use inlined read-model logic with asServiceRole queries.
 * No nested function calls. Exactly 2 parallel DB rounds per mode.
 * 
 * ═══════════════════════════════════════════════════════════════════
 * RESPONSE SHAPE CONTRACT — DO NOT MODIFY WITHOUT UPDATING FRONTEND
 * ═══════════════════════════════════════════════════════════════════
 * 
 * DETAIL MODE (order_id provided):
 *   Round 1: order, line items, locations
 *   Round 2: parts, vendors, commitments, projects
 *   Returns: { success, timestamp, po: { ...header, lines: [...] }, locations }
 *   po.lines[] includes full part/project detail for the receiving table.
 * 
 * LIST MODE (no order_id):
 *   Round 1: orders, locations
 *   Round 2: line items (scoped by order IDs), vendors
 *   Returns: { success, timestamp, orders: [...], summary, locations, filter_options }
 *   orders[] is SUMMARY-ONLY. Each order object contains:
 *     order_id, po_number, vendor_id, vendor_name, status, order_date,
 *     order_number, order_url, total_lines, open_lines, total_qty_ordered,
 *     total_qty_received, total_qty_remaining, progress_pct, pdf_attachments
 *   ⚠ LIST MODE MUST NOT include per-line objects, parts, commitments, or projects.
 *   ⚠ Adding those would regress list latency. If a future feature needs them,
 *     create a separate endpoint or add a mode flag — do NOT bloat the default list.
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
  // Handle CORS preflight
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

      // ── Cache check (detail mode) ──
      const detailCacheKey = `poReceivingDetail:${order_id}`;
      const detailCached = getCached(detailCacheKey);
      if (detailCached) {
        return Response.json(detailCached);
      }

      // ROUND 1: Core data — order, lines, locations (batched to max 3)
      const [orderResults, lineItems, locations] = await runBatched([
        () => fetchWithRetry(() => svc.entities.Order.filter({ id: order_id })),
        () => fetchWithRetry(() => svc.entities.PartPurchaseLineItem.filter({ order_id })),
        () => fetchWithRetry(() => svc.entities.Location.filter({ active: { $ne: false } })),
      ], 3, 150);
      const tDB1 = Date.now();

      const order = orderResults[0];
      if (!order) {
        return Response.json({ error: 'Order not found' }, { status: 404 });
      }

      // Collect ALL unique IDs for a single parallel reference fetch
      const partIds = [...new Set(lineItems.map(li => li.part_id).filter(Boolean))];
      const vendorIds = [...new Set([order.vendor_id, ...lineItems.map(li => li.vendor_id)].filter(Boolean))];
      const commitmentIds = [...new Set(lineItems.map(li => li.commitment_id).filter(Boolean))];

      // ROUND 2: ALL reference data in controlled batch (max 3 concurrent)
      const [parts, vendors, commitments, projects] = await runBatched([
        () => partIds.length > 0
          ? fetchWithRetry(() => svc.entities.Part.filter({ id: { $in: partIds } }))
          : Promise.resolve([]),
        () => vendorIds.length > 0
          ? fetchWithRetry(() => svc.entities.Vendor.filter({ id: { $in: vendorIds } }))
          : Promise.resolve([]),
        () => commitmentIds.length > 0
          ? fetchWithRetry(() => svc.entities.PartCommitment.filter({ id: { $in: commitmentIds } }))
          : Promise.resolve([]),
        () => fetchWithRetry(() => svc.entities.Project.list()),
      ], 3, 150);
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
        billing_status: order.billing_status || 'Not Invoiced',
        invoice_number: order.invoice_number || null,
        pdf_attachments: order.pdf_attachments || [],
      };

      const locationOptions = locations.map(l => ({
        id: l.id,
        name: l.location_area + (l.bin_description ? ` - ${l.bin_description}` : ''),
      }));

      const tEnd = Date.now();
      // PERF REGRESSION GUARD: These timing logs are intentionally retained for performance
      // regression diagnosis. Do not remove. Format: auth | db_round1 | db_round2 | build | total
      console.log(`[POReceiving:detail] order=${order_id} lines=${lineItems.length} parts=${partIds.length} | auth=${tAuth-t0}ms db_round1=${tDB1-tAuth}ms db_round2=${tDB2-tDB1}ms build=${tEnd-tDB2}ms total=${tEnd-t0}ms`);

      const detailResult = {
        success: true,
        timestamp: new Date().toISOString(),
        po,
        locations: locationOptions,
        _perf: { total_ms: tEnd - t0, line_count: lineItems.length },
      };
      setCache(detailCacheKey, detailResult);
      return Response.json(detailResult);
    }

    // =============================================
    // LIST MODE: Inline read model (no nested call)
    // 2 DB rounds with asServiceRole:
    //   Round 1: orders + locations (lightweight)
    //   Round 2: line items scoped to order IDs + reference data
    // =============================================
    const orderQuery = { status: { $ne: 'Cancelled' } };
    if (filters?.vendor_id && filters.vendor_id !== 'all') {
      orderQuery.vendor_id = filters.vendor_id;
    }

    // ── Cache check (list mode) ──
    const listCacheKey = `poReceivingList:${JSON.stringify(filters)}`;
    const listCached = getCached(listCacheKey);
    if (listCached) {
      return Response.json(listCached);
    }

    // ROUND 1: Orders + locations in batched parallel
    const [filteredOrders, locations] = await runBatched([
      () => fetchWithRetry(() => svc.entities.Order.filter(orderQuery, '-created_date', 100)),
      () => fetchWithRetry(() => svc.entities.Location.filter({ active: { $ne: false } })),
    ], 2, 150);
    const tDB1 = Date.now();

    if (filteredOrders.length === 0) {
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

    // Collect order IDs + vendor IDs from orders for round 2 scoping
    const orderIds = filteredOrders.map(o => o.id);
    const vendorIds = new Set();
    for (const o of filteredOrders) {
      if (o.vendor_id) vendorIds.add(o.vendor_id);
    }

    // ROUND 2: Line items scoped to order IDs + vendors + parts in controlled batch
    const [scopedLineItems, vendors, allParts] = await runBatched([
      () => fetchWithRetry(() => svc.entities.PartPurchaseLineItem.filter({ order_id: { $in: orderIds } })),
      () => vendorIds.size > 0 ? fetchWithRetry(() => svc.entities.Vendor.filter({ id: { $in: [...vendorIds] } })) : Promise.resolve([]),
      () => fetchWithRetry(() => svc.entities.Part.list('-created_date', 500)),
    ], 3, 150);
    const tDB2 = Date.now();
    const partNameMap = new Map(allParts.map(p => [p.id, p.part_name]));

    // Index line items by order_id for fast lookup
    const linesByOrder = new Map();
    for (const li of scopedLineItems) {
      if (!li.order_id) continue;
      if (!linesByOrder.has(li.order_id)) linesByOrder.set(li.order_id, []);
      linesByOrder.get(li.order_id).push(li);
    }

    // Filter to orders that have remaining qty
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
      console.log(`[POReceiving:list] orders=0 (post-filter) | auth=${tAuth-t0}ms db_round1=${tDB1-tAuth}ms db_round2=${tDB2-tDB1}ms total=${tEnd-t0}ms`);
      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        orders: [],
        summary: { total_orders: 0, total_lines: 0, total_qty_remaining: 0, total_qty_ordered: 0, total_qty_received: 0 },
        locations: locationOptions,
        filter_options: { vendors: [], projects: [] },
      });
    }

    // Build lookup maps (vendors only — list mode doesn't need parts/commitments)
    const vendorMap = new Map(vendors.map(v => [v.id, v]));

    // Build order-level summaries directly from raw line items (no per-line view models)
    let poViews = relevantOrders.map(order => {
      const vendor = vendorMap.get(order.vendor_id);
      const orderLines = linesByOrder.get(order.id) || [];

      // Compute aggregates directly
      let total_qty_ordered = 0;
      let total_qty_received = 0;
      let total_qty_remaining = 0;
      let activeCount = 0;
      let openCount = 0;

      for (const li of orderLines) {
        if (li.status === 'Cancelled') continue;
        activeCount++;
        const qo = li.qty_ordered ?? 0;
        const qr = li.qty_received ?? 0;
        const rem = Math.max(0, qo - qr);
        total_qty_ordered += qo;
        total_qty_received += qr;
        total_qty_remaining += rem;
        if (rem > 0) openCount++;
      }

      // Collect unique part names for this order (lightweight summary)
      const partNames = [];
      const seenPartIds = new Set();
      for (const li of orderLines) {
        if (li.status === 'Cancelled' || !li.part_id || seenPartIds.has(li.part_id)) continue;
        seenPartIds.add(li.part_id);
        const name = partNameMap.get(li.part_id);
        if (name) partNames.push(name);
      }

      return {
        order_id: order.id,
        po_number: order.po_number || `PO-${order.id.slice(-6)}`,
        vendor_id: order.vendor_id,
        vendor_name: vendor?.vendor_name || 'Unknown Vendor',
        status: order.status,
        order_date: order.order_date,
        order_number: order.order_number,
        order_url: order.order_url,
        total_lines: activeCount,
        open_lines: openCount,
        total_qty_ordered,
        total_qty_received,
        total_qty_remaining,
        progress_pct: total_qty_ordered > 0 ? Math.round((total_qty_received / total_qty_ordered) * 100) : 0,
        pdf_attachments: order.pdf_attachments || [],
        part_names: partNames,
      };
    });

    // Post-projection search filter (PO number + vendor name only — no part names in list mode)
    if (filters.search) {
      const search = filters.search.toLowerCase();
      poViews = poViews.filter(po =>
        (po.po_number && po.po_number.toLowerCase().includes(search)) ||
        (po.order_number && po.order_number.toLowerCase().includes(search)) ||
        po.vendor_name.toLowerCase().includes(search)
      );
    }

    const summary = {
      total_orders: poViews.length,
      total_lines: poViews.reduce((s, po) => s + po.total_lines, 0),
      total_qty_ordered: poViews.reduce((s, po) => s + po.total_qty_ordered, 0),
      total_qty_received: poViews.reduce((s, po) => s + po.total_qty_received, 0),
      total_qty_remaining: poViews.reduce((s, po) => s + po.total_qty_remaining, 0),
    };

    const locationOptions = locations.map(l => ({
      id: l.id,
      name: l.location_area + (l.bin_description ? ` - ${l.bin_description}` : ''),
    }));

    // Filter options from result set
    const vendorIdsSet = [...new Set(poViews.map(po => po.vendor_id))];

    const tEnd = Date.now();
    // PERF REGRESSION GUARD: These timing logs are intentionally retained for performance
    // regression diagnosis. Do not remove. Format: auth | db_round1 | db_round2 | build | total
    console.log(`[POReceiving:list] orders=${poViews.length} lines=${scopedLineItems.length} parts=${allParts.length} | auth=${tAuth-t0}ms db_round1=${tDB1-tAuth}ms db_round2=${tDB2-tDB1}ms build=${tEnd-tDB2}ms total=${tEnd-t0}ms`);

    const listResult = {
      success: true,
      timestamp: new Date().toISOString(),
      orders: poViews,
      summary,
      locations: locationOptions,
      filter_options: {
        vendors: vendorIdsSet.map(id => ({ id, vendor_name: vendorMap.get(id)?.vendor_name || 'Unknown' })),
      },
    };
    setCache(listCacheKey, listResult);
    return Response.json(listResult);

  } catch (error) {
    const msg = error?.message || '';
    const isRateLimit = error?.status === 429 || msg.includes('429') || msg.includes('Too Many Requests');
    console.error("getPOReceivingView error:", { type: isRateLimit ? 'RATE_LIMIT' : 'UNKNOWN', message: msg });
    return Response.json({
      success: false,
      error: { type: isRateLimit ? 'RATE_LIMIT' : 'UNKNOWN', message: msg }
    }, { status: isRateLimit ? 429 : 500 });
  }
});