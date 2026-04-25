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

// ── Controlled batching — adaptive size, 150ms gap ────────────────
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

// ── Short-term response cache (15s for ops supply) ───────────────
const cache = new Map();
function getCached(key, ttl = 15000) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > ttl) { cache.delete(key); return null; }
  return item.data;
}
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * getOpsSupplyView - Canonical read model for operations/global supply state
 * 
 * Modes:
 * - ORDERING: Items needing PO creation
 * - RECEIVING: Items with on-order qty waiting to be received
 * - ALL: Full queue view
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

    const { mode = 'ORDERING', filters = {} } = await req.json();

    // ── Cache check (15s TTL) ──
    const cacheKey = `opsSupply:${mode}:${JSON.stringify(filters)}`;
    const cachedResult = getCached(cacheKey);
    if (cachedResult) {
      return Response.json(cachedResult);
    }

    const _perfStart = Date.now();
    
    // PHASE 1: Fetch commitments (scoped filter)
    const commitmentFilter = { commitment_status: { $ne: 'cancelled' } };
    if (filters.project_id) commitmentFilter.project_id = filters.project_id;
    
    const commitments = await base44.entities.PartCommitment.filter(commitmentFilter, '-created_date', 1000);
    
    // ── EARLY EXIT: No commitments = empty response ──
    if (commitments.length === 0) {
      const emptyResponse = {
        success: true,
        timestamp: new Date().toISOString(),
        mode,
        items: [],
        summary: { total_items: 0, total_qty_to_order: 0, total_exposure: 0, total_estimated_cost: 0, orderable_count: 0, blocked_count: 0, funding_blocked_count: 0 },
        filter_options: { projects: [], vendors: [], categories: [] },
      };
      setCache(cacheKey, emptyResponse);
      return Response.json(emptyResponse);
    }
    
    // PHASE 2: Derive scoped IDs
    const commitmentIds = commitments.map(c => c.id);
    const commitmentPartIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    const commitmentProjectIds = [...new Set(commitments.map(c => c.project_id).filter(Boolean))];
    
    // ── Adaptive batch size based on data volume ──
    const adaptiveBatch = commitmentPartIds.length > 40 ? 2 : 3;
    
    // PHASE 3: Fetch parts + projects + vendorSources + lineItems + invoices ALL IN PARALLEL
    // (Previously: 4 sequential runBatched rounds → now 2 parallel groups)
    const [parts, projects, vendorSources, lineItems, projectInvoices] = await runBatched([
      () => commitmentPartIds.length > 0
        ? fetchWithRetry(() => base44.entities.Part.filter({ id: { $in: commitmentPartIds } }))
        : Promise.resolve([]),
      () => commitmentProjectIds.length > 0
        ? fetchWithRetry(() => base44.entities.Project.filter({ id: { $in: commitmentProjectIds } }))
        : Promise.resolve([]),
      () => commitmentPartIds.length > 0
        ? fetchWithRetry(() => base44.entities.PartVendorSource.filter({ part_id: { $in: commitmentPartIds }, is_active: true }))
        : Promise.resolve([]),
      () => commitmentIds.length > 0
        ? fetchWithRetry(() => base44.entities.PartPurchaseLineItem.filter({ commitment_id: { $in: commitmentIds } }))
        : Promise.resolve([]),
      () => commitmentProjectIds.length > 0
        ? fetchWithRetry(() => base44.entities.ProjectInvoice.filter({ project_id: { $in: commitmentProjectIds } }))
        : Promise.resolve([]),
    ], adaptiveBatch, 150);

    // Build source lookup by part
    const sourcesByPart = new Map();
    for (const s of vendorSources) {
      if (!sourcesByPart.has(s.part_id)) sourcesByPart.set(s.part_id, []);
      sourcesByPart.get(s.part_id).push(s);
    }
    
    // Derive vendor IDs, category IDs, order IDs, invoice IDs from fetched data
    const derivedVendorIds = [...new Set([
      ...parts.map(p => p.default_vendor_id).filter(Boolean),
      ...vendorSources.map(s => s.vendor_id).filter(Boolean),
    ])];
    const derivedCategoryIds = [...new Set(parts.map(p => p.part_category_id).filter(Boolean))];
    const orderIds = [...new Set(lineItems.map(li => li.order_id).filter(Boolean))];
    const invoiceIds = projectInvoices.map(i => i.id);

    // PHASE 4: Fetch vendors + categories + orders + invoiceLines IN PARALLEL
    // (Previously: vendors/categories in one batch, then lineItems/invoices, then orders/invoiceLines — 3 rounds)
    const [vendors, categories, orders, projectInvoiceLines] = await runBatched([
      () => derivedVendorIds.length > 0
        ? fetchWithRetry(() => base44.entities.Vendor.filter({ id: { $in: derivedVendorIds } }))
        : Promise.resolve([]),
      () => derivedCategoryIds.length > 0
        ? fetchWithRetry(() => base44.entities.PartCategory.filter({ id: { $in: derivedCategoryIds } }))
        : Promise.resolve([]),
      () => orderIds.length > 0
        ? fetchWithRetry(() => base44.entities.Order.filter({ id: { $in: orderIds } }))
        : Promise.resolve([]),
      () => invoiceIds.length > 0
        ? fetchWithRetry(() => base44.entities.ProjectInvoiceLine.filter({ invoice_id: { $in: invoiceIds } }))
        : Promise.resolve([]),
    ], adaptiveBatch, 150);

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const orderMap = new Map(orders.map(o => [o.id, o]));
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    // Group line items by commitment
    const lineItemsByCommitment = new Map();
    lineItems.forEach(li => {
      if (li.commitment_id) {
        if (!lineItemsByCommitment.has(li.commitment_id)) {
          lineItemsByCommitment.set(li.commitment_id, []);
        }
        lineItemsByCommitment.get(li.commitment_id).push(li);
      }
    });

    // ============================================================================
    // PREPAY GATING: Build commitment-level invoice & payment maps
    // ============================================================================
    
    const paidRatioByInvoiceId = new Map();
    for (const inv of projectInvoices) {
      if (inv.status === 'paid') {
        paidRatioByInvoiceId.set(inv.id, 1);
      } else if ((inv.paid_amount || 0) > 0 && (inv.total || 0) > 0) {
        paidRatioByInvoiceId.set(inv.id, Math.min(1, Math.max(0, inv.paid_amount / inv.total)));
      } else {
        paidRatioByInvoiceId.set(inv.id, 0);
      }
    }
    
    const commitmentInvoicedRetailMap = new Map();
    const commitmentPaidRetailMap = new Map();
    
    for (const line of projectInvoiceLines) {
      if (!line.part_commitment_id) continue;
      const commitmentId = line.part_commitment_id;
      const lineRetail = line.line_total ?? ((line.qty || 0) * (line.unit_price || 0));
      const paidRatio = paidRatioByInvoiceId.get(line.invoice_id) ?? 0;
      
      commitmentInvoicedRetailMap.set(commitmentId, (commitmentInvoicedRetailMap.get(commitmentId) ?? 0) + lineRetail);
      commitmentPaidRetailMap.set(commitmentId, (commitmentPaidRetailMap.get(commitmentId) ?? 0) + (lineRetail * paidRatio));
    }

    // ============================================================================
    // CANONICAL PART-LEVEL INVENTORY MAP
    // ============================================================================
    const partInventoryMap = new Map();
    
    for (const part of parts) {
      partInventoryMap.set(part.id, {
        physical_stock: part.physical_stock ?? 0,
        reserved_global: 0,
        on_order_global: 0,
        to_order_global: 0,
        available: 0,
      });
    }
    
    for (const c of commitments) {
      const inv = partInventoryMap.get(c.part_id);
      if (!inv) continue;
      
      const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered = c.covered_from_po ?? c.qty_ordered ?? 0;
      const required = c.required_total ?? c.qty_committed ?? 0;
      
      inv.reserved_global += reserved;
      inv.on_order_global += covered;
      inv.to_order_global += Math.max(0, required - reserved - covered - (c.qty_installed ?? 0));
    }
    
    for (const [partId, inv] of partInventoryMap.entries()) {
      inv.available = Math.max(0, inv.physical_stock - inv.reserved_global);
    }

    // Build SupplyCommitmentViewModel for each commitment
    const viewModels = commitments.map(c => {
      const part = partMap.get(c.part_id);
      const project = projectMap.get(c.project_id);
      // CANONICAL VENDOR RESOLUTION: PartVendorSource first, then Part.default_vendor_id
      const partSources_forVendor = sourcesByPart.get(c.part_id) || [];
      const preferredVendorSource = partSources_forVendor.find(s => s.is_preferred && s.is_active !== false)
        || partSources_forVendor.find(s => s.is_active !== false)
        || null;
      const resolvedVendorId = preferredVendorSource?.vendor_id || part?.default_vendor_id || null;
      const vendor = resolvedVendorId ? vendorMap.get(resolvedVendorId) : null;
      const category = part?.part_category_id ? categoryMap.get(part.part_category_id) : null;
      const commitmentLineItems = lineItemsByCommitment.get(c.id) || [];

      // Canonical quantities
      const required_total = c.required_total ?? c.qty_committed ?? 0;
      const qty_removed = c.qty_removed ?? 0;
      const effective_required = Math.max(0, required_total - qty_removed);
      let reserved_from_stock = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered_from_po = c.covered_from_po ?? c.qty_ordered ?? 0;
      const qty_installed = c.qty_installed ?? 0;

      // AUTO-ALLOCATION — uses effective_required (excludes qty_removed)
      const partInvForAlloc = partInventoryMap.get(c.part_id);
      const gap = Math.max(0, effective_required - reserved_from_stock - covered_from_po - qty_installed);
      if (gap > 0 && partInvForAlloc && partInvForAlloc.available > 0) {
        const autoReserve = Math.min(gap, partInvForAlloc.available);
        reserved_from_stock += autoReserve;
        partInvForAlloc.available -= autoReserve;
        partInvForAlloc.reserved_global += autoReserve;
      }

      const totalCoverage = reserved_from_stock + covered_from_po + qty_installed;
      const to_order = Math.max(0, effective_required - totalCoverage);
      const available_to_install = Math.max(0, Math.min(reserved_from_stock + covered_from_po - qty_installed, effective_required - qty_installed));

      const on_order_qty = commitmentLineItems.reduce((sum, li) => {
        const order = orderMap.get(li.order_id);
        if (order && ['Ordered', 'Partial'].includes(order.status)) {
          return sum + ((li.qty_ordered || 0) - (li.qty_received || 0));
        }
        return sum;
      }, 0);

      const received_qty = commitmentLineItems.reduce((sum, li) => sum + (li.qty_received || 0), 0);

      // Coverage status
      const total_covered = reserved_from_stock + covered_from_po;
      let coverage_status;
      if (total_covered >= effective_required && effective_required > 0) coverage_status = 'FULL';
      else if (total_covered > effective_required) coverage_status = 'OVER';
      else if (total_covered > 0) coverage_status = 'PARTIAL';
      else coverage_status = 'NONE';
      const coverage_percent = effective_required > 0 ? Math.round((total_covered / effective_required) * 100) : 0;

      // Financial — CANONICAL COST RESOLUTION via PartVendorSource
      const partSources = sourcesByPart.get(c.part_id) || [];
      const preferredSource = partSources.find(s => s.is_preferred) || partSources[0] || null;
      let resolved_unit_cost = 0;
      let cost_source_tag = 'missing';
      if (preferredSource?.unit_cost > 0) {
        resolved_unit_cost = preferredSource.unit_cost;
        cost_source_tag = `vendor_source:${preferredSource.id}`;
      } else if ((c.unit_cost_snapshot ?? 0) > 0) {
        resolved_unit_cost = c.unit_cost_snapshot;
        cost_source_tag = 'commitment_snapshot';
      } else if ((part?.cost ?? 0) > 0) {
        resolved_unit_cost = part.cost;
        cost_source_tag = 'part_cost_fallback';
      }
      const invalid_cost = resolved_unit_cost <= 0;
      const unit_cost = resolved_unit_cost;
      const unit_retail = c.unit_retail_snapshot ?? part?.retail_matrix_price ?? part?.retail_override ?? 0;
      const resolved_cost_total = resolved_unit_cost * to_order;
      const planned_retail_total = c.planned_retail_total ?? (unit_retail * required_total);
      // CANONICAL: cost-based exposure = max(0, planned_cost - invoiced_amount)
      const planned_cost_for_commitment = resolved_unit_cost * required_total;
      const cost_at_risk = Math.max(0, planned_cost_for_commitment - (c.invoiced_amount ?? 0));

      const source_type = mapSourceType(c.supply_source_type);

      // PREPAY GATING
      const requires_prepay = c.requires_prepay === true;
      // CANONICAL: has_vendor is true if ANY PartVendorSource exists OR Part.default_vendor_id is set
      const has_vendor = !!vendor || partSources_forVendor.length > 0;
      
      const prepayContext = {
        invoicedRetail: commitmentInvoicedRetailMap.get(c.id) ?? 0,
        paidRetail: commitmentPaidRetailMap.get(c.id) ?? 0,
      };

      const { next_action, block_reason_code, prepay_diagnostics } = computeNextAction(
        { required_total, reserved_from_stock, covered_from_po, qty_installed, qty_removed, requires_prepay },
        has_vendor,
        prepayContext
      );

      const prepaySatisfied = !requires_prepay || 
        (prepayContext.invoicedRetail > 0 && prepayContext.paidRetail >= (prepayContext.invoicedRetail - 0.01));
      
      const is_orderable = to_order > 0 && has_vendor && prepaySatisfied;
      
      if (to_order > 0 && !requires_prepay && has_vendor && !is_orderable) {
        console.error(`[INVALID_ORDER_BLOCK] commitment=${c.id} to_order=${to_order} requires_prepay=${requires_prepay} has_vendor=${has_vendor}`);
        throw new Error(`INVALID_ORDER_BLOCK: commitment ${c.id} should be orderable`);
      }
      
      const is_funding_blocked = block_reason_code === 'PREPAY_REQUIRED';

      const partInv = partInventoryMap.get(c.part_id) || {
        physical_stock: 0, reserved_global: 0, on_order_global: 0, to_order_global: 0, available: 0,
      };
      
      const inventory_snapshot = {
        physical_stock_global: partInv.physical_stock,
        physical: partInv.physical_stock,
        physical_stock: partInv.physical_stock,
        reserved_global_active: partInv.reserved_global,
        reserved: partInv.reserved_global,
        reserved_total: partInv.reserved_global,
        reserved_this_project: reserved_from_stock,
        available_global_active: partInv.available,
        available: partInv.available,
        on_order_total: partInv.on_order_global,
        to_order_total: partInv.to_order_global,
        needed: Math.max(0, effective_required - qty_installed),
      };

      const firstOrderId = commitmentLineItems.length > 0
        ? commitmentLineItems.find(li => {
            const o = orderMap.get(li.order_id);
            return o && ['Draft', 'Ordered', 'Partial', 'Received'].includes(o.status);
          })?.order_id || commitmentLineItems[0].order_id
        : null;

      return {
        id: c.id,
        commitment_id: c.id,
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown Part',
        vendor_part_number: part?.vendor_part_number || null,
        featured_photo: part?.featured_photo || null,
        order_url: preferredVendorSource?.order_url || part?.order_url || null,
        order_id: firstOrderId,
        order_number: firstOrderId ? (orderMap.get(firstOrderId)?.order_number || orderMap.get(firstOrderId)?.po_number || null) : null,
        project_id: c.project_id,
        project_name: project?.name || 'AK Stock',
        vendor_id: vendor?.id || preferredVendorSource?.vendor_id || null,
        vendor_name: vendor?.vendor_name || (preferredVendorSource ? (vendorMap.get(preferredVendorSource.vendor_id)?.vendor_name || 'Unknown') : 'No Vendor'),
        category_id: category?.id || null,
        category_name: category?.name || null,
        category_color: category?.color || '#6b7280',

        required_total,
        qty_removed,
        effective_required,
        reserved_from_stock,
        covered_from_po,
        qty_installed,

        to_order,
        on_order_qty,
        received_qty,
        available_to_install,

        coverage_total: reserved_from_stock + covered_from_po + qty_installed,
        coverage_gap: Math.max(0, required_total - reserved_from_stock - covered_from_po - qty_installed),
        coverage_actual: reserved_from_stock + covered_from_po + qty_installed + to_order,
        coverage_expected: required_total,
        coverage_drift: Math.abs((reserved_from_stock + covered_from_po + qty_installed + to_order) - required_total) > 0.01,
        debug_flags: {
          has_unallocated_stock: (partInv.physical_stock > 0) && (reserved_from_stock === 0) && (qty_installed === 0),
          has_po_but_not_covered: (commitmentLineItems.length > 0) && (covered_from_po === 0),
          is_dead_zone: (partInv.physical_stock > 0) && (to_order > 0),
        },
        _coverage_debug: {
          required_total,
          reserved_from_stock,
          covered_from_po,
          qty_installed,
          to_order,
          physical_stock: partInv.physical_stock,
          coverage_sum: reserved_from_stock + covered_from_po + qty_installed + to_order,
          drift: Math.abs((reserved_from_stock + covered_from_po + qty_installed + to_order) - required_total) > 0.01,
        },

        coverage_status,
        coverage_percent,

        next_action,
        block_reason_code,
        block_reason_message: block_reason_code ? BLOCK_MESSAGES[block_reason_code] : null,

        source_type,

        unit_cost,
        resolved_unit_cost,
        resolved_cost_total,
        cost_source_tag,
        invalid_cost,
        unit_retail,
        estimated_cost: resolved_cost_total,
        planned_cost_total: planned_cost_for_commitment,
        planned_retail_total,
        // CANONICAL: cost-based exposure only
        cost_at_risk,
        resolved_exposure: cost_at_risk,
        billing_status: c.billing_status || 'billable',

        is_orderable,
        is_funding_blocked,
        has_vendor,
        requires_prepay,

        inventory_snapshot,

        commitment_status: c.commitment_status || 'planned',

        vendor_sources: (() => {
          const realSources = (sourcesByPart.get(c.part_id) || []).map(s => ({
            source_id: s.id,
            vendor_id: s.vendor_id,
            vendor_name: vendorMap.get(s.vendor_id)?.vendor_name || 'Unknown',
            unit_cost: s.unit_cost || 0,
            is_preferred: s.is_preferred || false,
            order_url: s.order_url || null,
            vendor_part_number: s.vendor_part_number || null,
          }));
          if (realSources.length > 0) return realSources;
          if (part?.default_vendor_id && (part?.order_url || (part?.cost ?? 0) > 0)) {
            return [{
              source_id: null,
              vendor_id: part.default_vendor_id,
              vendor_name: vendorMap.get(part.default_vendor_id)?.vendor_name || 'Unknown',
              unit_cost: part.cost || 0,
              is_preferred: true,
              order_url: part.order_url || null,
              vendor_part_number: part.vendor_part_number || null,
            }];
          }
          return [];
        })(),
        has_multi_source: (sourcesByPart.get(c.part_id) || []).length > 1,

        part: {
          id: c.part_id,
          part_name: part?.part_name || 'Unknown Part',
          vendor_part_number: part?.vendor_part_number || null,
          featured_photo: part?.featured_photo || null,
          order_url: part?.order_url || null,
        },
        vendor: vendor ? { id: vendor.id, vendor_name: vendor.vendor_name } : (preferredVendorSource ? { id: preferredVendorSource.vendor_id, vendor_name: vendorMap.get(preferredVendorSource.vendor_id)?.vendor_name || 'Unknown' } : null),
        categoryId: category?.id || null,
        categoryObj: category ? { id: category.id, name: category.name } : null,
        categoryName: category?.name || null,
        // CANONICAL derived supply fields
        effective_required,
        coverage_qty: totalCoverage,
        to_order_qty: to_order,
        needs_order: to_order > 0,
        commitment_fulfilled: totalCoverage >= effective_required && effective_required > 0,
        allowed: {
          canCreatePO: is_orderable,
          canCreateDeltaOrder: covered_from_po > 0 && to_order === 0,
          // CANONICAL: canReceive = commitment has PO coverage AND coverage < effective_required
          canReceive: covered_from_po > 0 && totalCoverage < effective_required,
          canInstall: available_to_install > 0 && qty_installed < effective_required,
          canReverseInstall: qty_installed > 0,
          canCancel: c.commitment_status !== 'cancelled',
          canCreateInvoice: false,
        },
        billing_state: c.billing_status === 'invoiced' ? 'INVOICED' : c.billing_status === 'paid' ? 'PAID' : 'NOT_INVOICED',

        _raw: {
          commitment_status: c.commitment_status,
        },

        // CANONICAL: Per-commitment quantity integrity state
        // ONLY quantity violations — financial conditions NEVER appear here
        integrity: (() => {
          if (qty_removed <= 0) return { quantity_valid: true, violations: [], quantity_violation: false, blocking: false, valid: true };
          const TOL = 0.001;
          const vs = [];
          if (qty_installed > effective_required + TOL) vs.push({ field: 'qty_installed', value: qty_installed, limit: effective_required });
          if (reserved_from_stock > effective_required + TOL) vs.push({ field: 'reserved_from_stock', value: reserved_from_stock, limit: effective_required });
          const comb = reserved_from_stock + covered_from_po + qty_installed;
          if (comb > effective_required + TOL) vs.push({ field: '_combined', value: comb, limit: effective_required });
          const hasViolation = vs.length > 0;
          return { quantity_valid: !hasViolation, violations: vs, quantity_violation: hasViolation, blocking: hasViolation, valid: !hasViolation };
        })(),

        ...(prepay_diagnostics ? { prepay_diagnostics } : {}),
      };
    });

    // Filter by mode — CANONICAL: uses needs_order / commitment_fulfilled flags
    let filtered = viewModels;
    switch (mode) {
      case 'ORDERING':
        filtered = viewModels.filter(vm => vm.needs_order === true && vm.source_type === 'SHOP_PURCHASED');
        break;
      case 'RECEIVING':
        // CANONICAL: Items with PO coverage that are NOT fulfilled
        filtered = viewModels.filter(vm => 
          vm.commitment_fulfilled !== true && (vm.covered_from_po ?? 0) > 0 && vm.needs_order !== true
        );
        break;
      case 'INSTALL':
        filtered = viewModels.filter(vm => vm.available_to_install > 0);
        break;
    }

    // Apply additional filters
    if (filters.vendor_id) {
      filtered = filtered.filter(vm => vm.vendor_id === filters.vendor_id);
    }
    if (filters.project_id) {
      filtered = filtered.filter(vm => vm.project_id === filters.project_id);
    }
    if (filters.coverage_status) {
      filtered = filtered.filter(vm => vm.coverage_status === filters.coverage_status);
    }
    if (filters.source_type) {
      filtered = filtered.filter(vm => vm.source_type === filters.source_type);
    }
    if (filters.category_id) {
      filtered = filtered.filter(vm => vm.category_id === filters.category_id);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(vm => 
        vm.part_name.toLowerCase().includes(search) ||
        (vm.vendor_part_number && vm.vendor_part_number.toLowerCase().includes(search)) ||
        vm.project_name.toLowerCase().includes(search)
      );
    }

    // Compute summary statistics
    const summary = {
      total_items: filtered.length,
      total_qty_to_order: filtered.reduce((sum, vm) => sum + vm.to_order, 0),
      total_exposure: filtered.reduce((sum, vm) => sum + (vm.cost_at_risk ?? 0), 0),
      total_estimated_cost: filtered.reduce((sum, vm) => sum + vm.estimated_cost, 0),
      orderable_count: filtered.filter(vm => vm.is_orderable).length,
      blocked_count: filtered.filter(vm => !vm.is_orderable && vm.to_order > 0).length,
      funding_blocked_count: filtered.filter(vm => vm.is_funding_blocked).length,
    };

    // Get unique values for filter dropdowns
    const filterOptions = {
      projects: [...new Set(filtered.map(vm => vm.project_id).filter(Boolean))]
        .map(id => ({ id, name: projectMap.get(id)?.name || 'Unknown' })),
      vendors: [...new Set(filtered.map(vm => vm.vendor_id).filter(Boolean))]
        .map(id => ({ id, vendor_name: vendorMap.get(id)?.vendor_name || 'Unknown' })),
      categories: [...new Set(filtered.map(vm => vm.category_id).filter(Boolean))]
        .map(id => ({ id, name: categoryMap.get(id)?.name || 'Unknown' })),
    };

    console.log('[PERF] getOpsSupplyView', Date.now() - _perfStart, 'ms', {
      entityCounts: {
        commitments: commitments.length,
        parts: parts.length,
        lineItems: lineItems.length,
        orders: orders.length,
        invoices: projectInvoices.length,
      },
      filteredCount: filtered.length,
    });
    
    const responsePayload = {
      success: true,
      timestamp: new Date().toISOString(),
      mode,
      items: filtered,
      summary,
      filter_options: filterOptions,
    };

    setCache(cacheKey, responsePayload);
    return Response.json(responsePayload);

  } catch (error) {
    const msg = error?.message || '';
    const isRateLimit = error?.status === 429 || msg.includes('429') || msg.includes('Too Many Requests');
    console.error("getOpsSupplyView error:", { type: isRateLimit ? 'RATE_LIMIT' : 'UNKNOWN', message: msg });
    return Response.json({
      success: false, data: null,
      error: { type: isRateLimit ? 'RATE_LIMIT' : 'UNKNOWN', message: msg }
    }, { status: isRateLimit ? 429 : 500 });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const BLOCK_MESSAGES = {
  NO_VENDOR: 'No vendor assigned to part',
  INSUFFICIENT_FUNDS: 'Pool balance insufficient for exposure',
  PREPAY_REQUIRED: 'Prepayment required before ordering',
  NEGATIVE_AVAILABLE: 'Available stock is negative',
  INVARIANT_VIOLATION: 'Data integrity issue detected',
  ARCHIVED_PART: 'Part is archived',
};

function mapSourceType(legacyType) {
  const mapping = {
    'STOCK': 'SHOP_PURCHASED',
    'VENDOR': 'SHOP_PURCHASED',
    'CLIENT_SUPPLIED': 'CLIENT_SUPPLIED',
    'AK_CUSTOM': 'AK_CUSTOM',
    'TAKE_OFF': 'TAKE_OFF',
  };
  return mapping[legacyType] || 'SHOP_PURCHASED';
}

function computeNextAction(commitment, partHasVendor, prepayContext = {}) {
  const {
    required_total = 0,
    reserved_from_stock = 0,
    covered_from_po = 0,
    qty_installed = 0,
    qty_removed = 0,
    requires_prepay = false,
  } = commitment;

  // CANONICAL: effective_required = required_total - qty_removed
  const effective_required = Math.max(0, required_total - qty_removed);
  const totalCoverage = reserved_from_stock + covered_from_po + qty_installed;
  const to_order = Math.max(0, effective_required - totalCoverage);
  const available_to_install = Math.max(0, Math.min(reserved_from_stock + covered_from_po - qty_installed, effective_required - qty_installed));

  let prepay_diagnostics = null;
  if (requires_prepay) {
    const invoicedRetail = prepayContext.invoicedRetail ?? 0;
    const paidRetail = prepayContext.paidRetail ?? 0;
    const prepaySatisfied = invoicedRetail > 0 && paidRetail >= (invoicedRetail - 0.01);
    
    prepay_diagnostics = {
      prepay_invoiced_retail: invoicedRetail,
      prepay_paid_retail: paidRetail,
      prepay_satisfied: prepaySatisfied,
    };
    
    if (to_order > 0 && !prepaySatisfied) {
      return { next_action: 'ALLOCATE_POOL', block_reason_code: 'PREPAY_REQUIRED', prepay_diagnostics };
    }
  }

  if (to_order > 0 && !partHasVendor) {
    return { next_action: 'FIX_VENDOR', block_reason_code: 'NO_VENDOR', prepay_diagnostics };
  }
  
  if (to_order > 0) {
    return { next_action: 'CREATE_PO', block_reason_code: null, prepay_diagnostics };
  }
  // CANONICAL: "needs receive" = commitment has PO coverage but total coverage < effective_required
  if (covered_from_po > 0 && totalCoverage < effective_required) {
    return { next_action: 'RECEIVE', block_reason_code: null, prepay_diagnostics };
  }
  if (available_to_install > 0 && qty_installed < effective_required) {
    return { next_action: 'INSTALL', block_reason_code: null, prepay_diagnostics };
  }
  if (qty_installed >= effective_required && effective_required > 0) {
    return { next_action: 'COMPLETE', block_reason_code: null, prepay_diagnostics };
  }

  return { next_action: null, block_reason_code: null, prepay_diagnostics };
}