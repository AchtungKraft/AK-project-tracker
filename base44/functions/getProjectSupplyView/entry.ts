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

// ── Short-term response cache (15s for project supply) ───────────
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
 * getProjectSupplyView - Canonical read model for project supply state
 * 
 * Returns SupplyCommitmentViewModel[] shaped data.
 * This is the ONLY source of truth for ProjectSupplyManager.
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

    const { project_id, filters = {} } = await req.json();
    
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // ── Cache check (15s TTL) ──
    const cacheKey = `projectSupply:${project_id}:${JSON.stringify(filters)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return Response.json(cached);
    }

    const _perfStart = Date.now();
    
    // ══════════════════════════════════════════════════════════════
    // PHASE 1: Fetch project + commitments + invoices in parallel
    // Categories removed from here — fetched scoped later
    // ══════════════════════════════════════════════════════════════
    const [projectArr, commitments, projectInvoices] = await runBatched([
      () => fetchWithRetry(() => base44.entities.Project.filter({ id: project_id })),
      () => fetchWithRetry(() => base44.entities.PartCommitment.filter({ project_id })),
      () => fetchWithRetry(() => base44.entities.ProjectInvoice.filter({ project_id })),
    ], 3, 150);
    const project = projectArr[0];

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // ── EARLY EXIT: No commitments = minimal response ──
    if (commitments.length === 0) {
      const emptyResponse = {
        success: true,
        timestamp: new Date().toISOString(),
        project: { id: project.id, name: project.name, client_name: project.client_name, financial_model_version: 'forward' },
        items: [],
        tab_counts: { all: 0, plan: 0, buy: 0, receive: 0, install: 0, invoice: projectInvoices.filter(inv => inv.status !== 'void').length },
        summary: {
          total_commitments: 0, total_required: 0, total_reserved: 0, total_covered: 0, total_to_order: 0, total_installed: 0,
          total_planned_retail: 0, total_planned_cost: 0, total_invoiced: 0, total_paid: 0, invoice_outstanding: 0, unbilled_retail: 0,
          supply_coverage_summary: { full: 0, partial: 0, none: 0, over: 0 }, install_percent: 0,
          by_status: { planned: 0, ordered: 0, received: 0, allocated: 0, installed: 0 },
        },
        categories: [],
        integrity_warnings: null,
      };
      setCache(cacheKey, emptyResponse);
      return Response.json(emptyResponse);
    }

    // FORWARD MODEL ENFORCEMENT
    if (project.financial_model_version !== 'forward') {
      console.warn(`[FORWARD MIGRATION] Project ${project_id} has legacy model, treating as forward`);
    }

    // PHASE 2: Scope IDs from commitments
    const commitmentIds = commitments.map(c => c.id);
    const partIdsFromCommitments = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    const invoiceIdsForLines = projectInvoices.map(i => i.id);
    
    // ── Adaptive batch size ──
    const adaptiveBatch = partIdsFromCommitments.length > 40 ? 2 : 3;

    // PHASE 3: Fetch parts + vendorSources + lineItems + invoiceLines + globalCommitments ALL IN PARALLEL
    // (Previously: parts/vendorSources in batch → vendors sequential → lineItems/invoiceLines in batch → orders sequential → globalCommitments sequential)
    // Now: ONE big parallel batch for all independent fetches
    const [parts, vendorSources, lineItems, projectInvoiceLines, allCommitmentsForParts] = await runBatched([
      () => partIdsFromCommitments.length > 0
        ? fetchWithRetry(() => base44.entities.Part.filter({ id: { $in: partIdsFromCommitments } }))
        : Promise.resolve([]),
      () => partIdsFromCommitments.length > 0
        ? fetchWithRetry(() => base44.entities.PartVendorSource.filter({ part_id: { $in: partIdsFromCommitments }, is_active: true }))
        : Promise.resolve([]),
      () => commitmentIds.length > 0 
        ? fetchWithRetry(() => base44.entities.PartPurchaseLineItem.filter({ commitment_id: { $in: commitmentIds } }))
        : Promise.resolve([]),
      () => invoiceIdsForLines.length > 0
        ? fetchWithRetry(() => base44.entities.ProjectInvoiceLine.filter({ invoice_id: { $in: invoiceIdsForLines } }))
        : Promise.resolve([]),
      () => partIdsFromCommitments.length > 0
        ? fetchWithRetry(() => base44.entities.PartCommitment.filter({
            part_id: { $in: partIdsFromCommitments },
            commitment_status: { $nin: ['cancelled', 'closed'] }
          }))
        : Promise.resolve([]),
    ], adaptiveBatch, 150);

    // Build source lookup by part
    const sourcesByPart = new Map();
    for (const s of vendorSources) {
      if (!sourcesByPart.has(s.part_id)) sourcesByPart.set(s.part_id, []);
      sourcesByPart.get(s.part_id).push(s);
    }

    // Derive vendor IDs, category IDs, order IDs from fetched data
    const vendorIdsFromParts = [...new Set([
      ...parts.map(p => p.default_vendor_id).filter(Boolean),
      ...vendorSources.map(s => s.vendor_id).filter(Boolean),
    ])];
    const derivedCategoryIds = [...new Set(parts.map(p => p.part_category_id).filter(Boolean))];
    const orderIds = [...new Set(lineItems.map(li => li.order_id).filter(Boolean))];

    // PHASE 4: Fetch vendors + categories + orders IN PARALLEL
    // (Previously: vendors sequential after parts, then orders sequential after lineItems)
    const [vendors, categories, orders] = await runBatched([
      () => vendorIdsFromParts.length > 0
        ? fetchWithRetry(() => base44.entities.Vendor.filter({ id: { $in: vendorIdsFromParts } }))
        : Promise.resolve([]),
      () => derivedCategoryIds.length > 0
        ? fetchWithRetry(() => base44.entities.PartCategory.filter({ id: { $in: derivedCategoryIds } }))
        : Promise.resolve([]),
      () => orderIds.length > 0
        ? fetchWithRetry(() => base44.entities.Order.filter({ id: { $in: orderIds } }))
        : Promise.resolve([]),
    ], adaptiveBatch, 150);

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const orderMap = new Map(orders.map(o => [o.id, o]));
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    // CANONICAL: Resolve financial totals from commitment snapshots
    // Import inline since Deno backend functions cannot use local imports
    const financialTotals = await resolveCanonicalFinancials(base44, project_id, commitments, projectInvoices);
    const totalInvoiced = financialTotals.invoiced_total;
    const totalPaid = financialTotals.invoice_entity_paid;
    const invoiceOutstanding = financialTotals.invoice_entity_balance_due;

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
    
    const invoiceIdsInProject = new Set(projectInvoices.map(inv => inv.id));
    const relevantInvoiceLines = projectInvoiceLines.filter(
      line => invoiceIdsInProject.has(line.invoice_id) && line.part_commitment_id
    );
    
    const commitmentInvoicedRetailMap = new Map();
    const commitmentPaidRetailMap = new Map();
    
    for (const line of relevantInvoiceLines) {
      const commitmentId = line.part_commitment_id;
      const lineRetail = line.line_total ?? ((line.qty || 0) * (line.unit_price || 0));
      const paidRatio = paidRatioByInvoiceId.get(line.invoice_id) ?? 0;
      
      commitmentInvoicedRetailMap.set(commitmentId, (commitmentInvoicedRetailMap.get(commitmentId) ?? 0) + lineRetail);
      commitmentPaidRetailMap.set(commitmentId, (commitmentPaidRetailMap.get(commitmentId) ?? 0) + (lineRetail * paidRatio));
    }

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
    
    function normalizeBillingState(billingStatus) {
      if (!billingStatus) return 'NOT_INVOICED';
      const normalized = String(billingStatus).toLowerCase().trim();
      if (normalized === 'paid') return 'PAID';
      if (normalized === 'invoiced' || normalized === 'billed') return 'INVOICED';
      return 'NOT_INVOICED';
    }

    // ============================================================================
    // CANONICAL PART-LEVEL INVENTORY MAP (global)
    // ============================================================================
    const partInventoryMap = new Map();
    
    for (const partId of partIdsFromCommitments) {
      const part = partMap.get(partId);
      partInventoryMap.set(partId, {
        physical_stock: part?.physical_stock ?? 0,
        reserved_global: 0,
        on_order_global: 0,
        to_order_global: 0,
        available: 0,
      });
    }
    
    for (const c of allCommitmentsForParts) {
      const inv = partInventoryMap.get(c.part_id);
      if (!inv) continue;
      
      const reserved = c.reserved_from_stock ?? 0;
      const covered = c.covered_from_po ?? 0;
      const required = c.required_total ?? 0;
      
      inv.reserved_global += reserved;
      inv.on_order_global += covered;
      inv.to_order_global += Math.max(0, required - reserved - covered - (c.qty_installed ?? 0));
    }
    
    for (const [partId, inv] of partInventoryMap.entries()) {
      inv.available = Math.max(0, inv.physical_stock - inv.reserved_global);
    }

    // ============================================================================
    // INTEGRITY ASSERTION — includes effective quantity validation
    // ============================================================================
    const integrityWarnings = [];
    for (const c of commitments) {
      if (c.commitment_status === 'cancelled') continue;
      if (c.source_type !== 'scope_addition' && (c.commitment_version ?? 1) > 1) {
        const required = c.required_total ?? c.qty_committed ?? 0;
        const invoiced = c.invoiced_qty ?? 0;
        if (invoiced > 0 && required > invoiced) {
          integrityWarnings.push({
            commitment_id: c.id,
            part_id: c.part_id,
            warning_type: 'LEGACY_UPWARD_MUTATION_SUSPECTED',
            message: `Commitment has invoiced_qty=${invoiced} but required_total=${required} (v${c.commitment_version})`,
            severity: 'warning'
          });
        }
      }
      // Effective quantity violation detection
      const qr = c.qty_removed ?? 0;
      if (qr > 0) {
        const eff = Math.max(0, (c.required_total ?? 0) - qr);
        const TOL = 0.001;
        const violations = [];
        if ((c.qty_installed ?? 0) > eff + TOL) violations.push(`qty_installed(${c.qty_installed}) > effective(${eff})`);
        if ((c.reserved_from_stock ?? 0) > eff + TOL) violations.push(`reserved(${c.reserved_from_stock}) > effective(${eff})`);
        if ((c.invoiced_qty ?? 0) > eff + TOL) violations.push(`invoiced(${c.invoiced_qty}) > effective(${eff})`);
        const total = (c.reserved_from_stock ?? 0) + (c.covered_from_po ?? 0) + (c.qty_installed ?? 0);
        if (total > eff + TOL) violations.push(`combined(${total}) > effective(${eff})`);
        for (const v of violations) {
          integrityWarnings.push({ commitment_id: c.id, part_id: c.part_id, warning_type: 'EFF_QTY_VIOLATION', message: v, severity: 'error' });
        }
      }
    }

    // Build SupplyCommitmentViewModel for each commitment
    const viewModels = commitments
      .filter(c => c.commitment_status !== 'cancelled')
      .map(c => {
        const part = partMap.get(c.part_id);
        // CANONICAL VENDOR RESOLUTION: PartVendorSource first, then Part.default_vendor_id
        const partSources_forVendor = sourcesByPart.get(c.part_id) || [];
        const preferredVendorSource = partSources_forVendor.find(s => s.is_preferred && s.is_active !== false)
          || partSources_forVendor.find(s => s.is_active !== false)
          || null;
        const resolvedVendorId = preferredVendorSource?.vendor_id || part?.default_vendor_id || null;
        const vendor = resolvedVendorId ? vendorMap.get(resolvedVendorId) : null;
        const has_vendor = !!vendor || partSources_forVendor.length > 0;
        const category = part?.part_category_id ? categoryMap.get(part.part_category_id) : null;
        const commitmentLineItems = lineItemsByCommitment.get(c.id) || [];

        const required_total = c.required_total ?? 0;
        const qty_removed = c.qty_removed ?? 0;
        const effective_required = Math.max(0, required_total - qty_removed);
        let reserved_from_stock = c.reserved_from_stock ?? 0;
        const covered_from_po = c.covered_from_po ?? c.qty_ordered ?? 0;
        const qty_installed = c.qty_installed ?? 0;

        // AUTO-ALLOCATION — uses effective_required (excludes qty_removed)
        const partInvForAlloc = partInventoryMap.get(c.part_id);
        const alreadyCovered = reserved_from_stock + covered_from_po + qty_installed;
        const gap = Math.max(0, effective_required - alreadyCovered);
        if (gap > 0 && partInvForAlloc && partInvForAlloc.available > 0) {
          const autoReserve = Math.min(gap, partInvForAlloc.available);
          reserved_from_stock += autoReserve;
          partInvForAlloc.available -= autoReserve;
          partInvForAlloc.reserved_global += autoReserve;
        }

        // CANONICAL derived fields — single truth for all UI consumers
        const coverage_qty = reserved_from_stock + covered_from_po + qty_installed;
        const to_order_qty = Math.max(0, effective_required - coverage_qty);
        const to_order = to_order_qty; // Alias for backward compat
        const commitment_fulfilled = coverage_qty >= effective_required && effective_required > 0;
        const needs_order = to_order_qty > 0;
        const available_to_install = Math.max(0, Math.min(reserved_from_stock + covered_from_po - qty_installed, effective_required - qty_installed));

        const partInv = partInventoryMap.get(c.part_id) || {
          physical_stock: 0, reserved_global: 0, on_order_global: 0, to_order_global: 0, available: 0,
        };

        const on_order_qty = commitmentLineItems.reduce((sum, li) => {
          const order = orderMap.get(li.order_id);
          if (order && ['Ordered', 'Partial'].includes(order.status)) {
            return sum + ((li.qty_ordered || 0) - (li.qty_received || 0));
          }
          return sum;
        }, 0);

        const received_qty = commitmentLineItems.reduce((sum, li) => sum + (li.qty_received || 0), 0);

        const total_covered = reserved_from_stock + covered_from_po;
        let coverage_status;
        if (total_covered >= effective_required && effective_required > 0) coverage_status = 'FULL';
        else if (total_covered > effective_required) coverage_status = 'OVER';
        else if (total_covered > 0) coverage_status = 'PARTIAL';
        else coverage_status = 'NONE';
        const coverage_percent = effective_required > 0 ? Math.round((total_covered / effective_required) * 100) : 0;

        // ══════════════════════════════════════════════════════════════
        // COST AUTHORITY LIFECYCLE (Phases 1-3)
        // PO cost is ACTUAL truth. Part cost is PLANNED only.
        // Once a PO exists, cost is locked and never reverts to part cost.
        // ══════════════════════════════════════════════════════════════
        const hasPOLines = commitmentLineItems.length > 0;
        const hasReceived = commitmentLineItems.some(li => (li.qty_received || 0) > 0);
        const hasInstalled = qty_installed > 0;
        const hasInvoiced = (c.invoiced_qty ?? 0) > 0;
        const cost_locked = hasPOLines || hasReceived || hasInstalled || hasInvoiced;

        // PHASE 1: PO cost = actual truth, part cost = planning only
        let unit_cost = c.unit_cost_snapshot ?? 0;
        let cost_source = 'planned'; // default: planning estimate
        if (hasPOLines) {
          // Weighted average from PO lines = actual cost
          let poTotalCost = 0, poTotalQty = 0;
          for (const li of commitmentLineItems) {
            if (li.status !== 'Cancelled') {
              poTotalCost += (li.qty_ordered || 0) * (li.unit_cost || 0);
              poTotalQty += (li.qty_ordered || 0);
            }
          }
          const poWeightedCost = poTotalQty > 0 ? Math.round((poTotalCost / poTotalQty) * 100) / 100 : 0;
          if (poWeightedCost > 0) {
            unit_cost = poWeightedCost;
            cost_source = 'po';
          } else if (unit_cost > 0) {
            cost_source = 'planned'; // PO exists but cost is 0 — keep snapshot
          }
        } else if (unit_cost > 0) {
          cost_source = 'planned'; // No PO, using snapshot (from part cost at commitment time)
        }
        // If snapshot is 0 and no PO, try part cost as fallback for display
        if (unit_cost <= 0 && part?.cost > 0 && !cost_locked) {
          unit_cost = part.cost;
          cost_source = 'planned';
        }
        const invalid_cost = unit_cost <= 0;

        // PHASE 4: Retail stays fixed (quoted price) — NEVER recompute from PO cost
        const unit_retail = c.unit_retail_snapshot ?? 0;

        // ══════════════════════════════════════════════════════════════
        // PLANNED vs ACTUAL PRICING (Financial Storytelling)
        // planned = snapshot at commitment time (what we thought)
        // actual = PO cost if available, else same as planned (what happened)
        // ══════════════════════════════════════════════════════════════
        const planned_unit_cost = c.unit_cost_snapshot ?? 0;
        const planned_unit_retail = c.unit_retail_snapshot ?? 0;
        const planned_cost_total = planned_unit_cost * effective_required;
        const planned_retail_total = planned_unit_retail * effective_required;
        const planned_margin = planned_retail_total - planned_cost_total;

        const actual_unit_cost = unit_cost; // resolved (PO-first)
        const actual_cost_total = actual_unit_cost * effective_required;
        const actual_margin = planned_retail_total - actual_cost_total;
        const margin_delta = actual_margin - planned_margin;

        // Legacy compat
        const resolved_margin = actual_margin;
        // DEPRECATED: covered_retail_total and exposure_gap removed.
        // Use cost-based: max(0, actual_cost_total - invoiced_amount)
        const cost_at_risk = Math.max(0, actual_cost_total - (c.invoiced_amount ?? 0));

        const source_type = mapSourceType(c.supply_source_type);

        const prepayContext = {
          invoicedRetail: commitmentInvoicedRetailMap.get(c.id) ?? 0,
          paidRetail: commitmentPaidRetailMap.get(c.id) ?? 0,
        };
        
        const { next_action, block_reason_code, prepay_diagnostics } = computeNextAction(
          { required_total, reserved_from_stock, covered_from_po, qty_installed, qty_removed, effective_required, coverage_qty, to_order_qty, commitment_fulfilled, needs_order },
          has_vendor,
          prepayContext
        );

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
          ? (commitmentLineItems.find(li => {
              const o = orderMap.get(li.order_id);
              return o && ['Draft', 'Ordered', 'Partial', 'Received'].includes(o.status);
            })?.order_id || commitmentLineItems[0].order_id)
          : null;

        return {
          commitment_id: c.id,
          part_id: c.part_id,
          part_name: part?.part_name || 'Unknown Part',
          vendor_part_number: part?.vendor_part_number || null,
          featured_photo: part?.featured_photo || null,
          order_id: firstOrderId,
          order_number: firstOrderId ? (orderMap.get(firstOrderId)?.order_number || orderMap.get(firstOrderId)?.po_number || null) : null,
          project_id: c.project_id,
          project_name: project.name,
          vendor_id: vendor?.id || preferredVendorSource?.vendor_id || null,
          vendor_name: vendor?.vendor_name || (preferredVendorSource ? (vendorMap.get(preferredVendorSource.vendor_id)?.vendor_name || 'Unknown') : null),
          category_id: category?.id || null,
          category_name: category?.name || null,
          category_color: category?.color || '#6b7280',

          required_total,
          qty_removed,
          effective_required,
          reserved_from_stock,
          covered_from_po,
          qty_installed,

          // CANONICAL derived supply fields
          coverage_qty,
          to_order_qty,
          to_order: to_order_qty,
          needs_order,
          commitment_fulfilled,
          
          on_order_qty,
          received_qty,
          available_to_install,

          coverage_total: coverage_qty,
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
          
          // CANONICAL: needs_receive = commitment has PO coverage but not yet fulfilled
          needs_receive: covered_from_po > 0 && !commitment_fulfilled,

          source_type,

          vendor_sources: (sourcesByPart.get(c.part_id) || []).map(s => ({
            source_id: s.id,
            vendor_id: s.vendor_id,
            vendor_name: vendorMap.get(s.vendor_id)?.vendor_name || 'Unknown',
            unit_cost: s.unit_cost || 0,
            is_preferred: s.is_preferred || false,
          })),
          has_multi_source: (sourcesByPart.get(c.part_id) || []).length > 1,

          unit_cost,
          unit_retail,
          cost_source,
          cost_locked,
          invalid_cost,
          resolved_unit_cost: unit_cost,
          resolved_cost_total: unit_cost * required_total,
          resolved_margin,
          planned_cost_total,
          planned_retail_total,

          // PLANNED vs ACTUAL PRICING
          planned_unit_cost,
          planned_unit_retail,
          actual_unit_cost,
          actual_cost_total,
          planned_margin,
          actual_margin,
          margin_delta,

          // CANONICAL: cost-based exposure only
          cost_at_risk,
          billing_status: c.billing_status || 'billable',
          
          billing_state: normalizeBillingState(c.billing_status),
          
          invoiced_qty: c.invoiced_qty ?? 0,
          invoiced_amount: c.invoiced_amount ?? 0,
          
          inventory_location: c.inventory_location || null,

          inventory_snapshot,

          _raw: {
            commitment_status: c.commitment_status,
            billing_status: c.billing_status,
            requires_prepay: c.requires_prepay,
            prepay_satisfied_at: c.prepay_satisfied_at,
            order_line_item_ids: c.order_line_item_ids,
          },

          // CANONICAL: Per-commitment quantity integrity state
          // ONLY quantity violations (installed/reserved/combined exceeding effective_required)
          // Financial conditions (cost_at_risk, invoiced < planned) NEVER appear here
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

    // Apply filters
    let filtered = viewModels;
    
    if (filters.source_type) {
      filtered = filtered.filter(vm => vm.source_type === filters.source_type);
    }
    if (filters.coverage_status) {
      filtered = filtered.filter(vm => vm.coverage_status === filters.coverage_status);
    }
    if (filters.next_action) {
      filtered = filtered.filter(vm => vm.next_action === filters.next_action);
    }
    if (filters.category_id) {
      filtered = filtered.filter(vm => vm.category_id === filters.category_id);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(vm => 
        vm.part_name.toLowerCase().includes(search) ||
        (vm.vendor_part_number && vm.vendor_part_number.toLowerCase().includes(search))
      );
    }

    // Compute tab counts — CANONICAL: uses needs_order/commitment_fulfilled from canonical fields
    const tabCounts = {
      all: viewModels.length,
      plan: viewModels.length,
      buy: viewModels.filter(vm => vm.needs_order === true).length,
      receive: viewModels.filter(vm => vm.needs_receive === true).length,
      install: viewModels.filter(vm => vm.available_to_install > 0 || vm.next_action === 'INSTALL').length,
      invoice: projectInvoices.filter(inv => inv.status !== 'void').length,
    };

    // Summary statistics — CANONICAL totals from resolver, quantity aggregation local
    const totalInstalledQty = viewModels.reduce((sum, vm) => sum + vm.qty_installed, 0);
    const totalRequiredQty = viewModels.reduce((sum, vm) => sum + vm.required_total, 0);
    
    const summary = {
      total_commitments: viewModels.length,
      total_required: totalRequiredQty,
      total_reserved: viewModels.reduce((sum, vm) => sum + vm.reserved_from_stock, 0),
      total_covered: viewModels.reduce((sum, vm) => sum + vm.covered_from_po, 0),
      total_to_order: viewModels.reduce((sum, vm) => sum + vm.to_order, 0),
      total_installed: totalInstalledQty,
      // CANONICAL: Financial totals from resolver (not local reduce)
      total_planned_retail: financialTotals.planned_retail,
      total_planned_cost: financialTotals.planned_cost,
      total_invoiced: financialTotals.invoiced_total,
      total_paid: financialTotals.invoice_entity_paid,
      invoice_outstanding: financialTotals.invoice_entity_balance_due,
      unbilled_retail: financialTotals.remaining_total,
      // Sub-breakdowns
      parts_planned_retail: financialTotals.parts_planned_retail,
      parts_planned_cost: financialTotals.parts_planned_cost,
      services_planned_retail: financialTotals.services_planned_retail,
      services_planned_cost: financialTotals.services_planned_cost,
      credit_total: financialTotals.credit_total,
      // Reconciliation
      reconciliation: financialTotals.reconciliation,
      supply_coverage_summary: {
        full: viewModels.filter(vm => vm.coverage_status === 'FULL').length,
        partial: viewModels.filter(vm => vm.coverage_status === 'PARTIAL').length,
        none: viewModels.filter(vm => vm.coverage_status === 'NONE').length,
        over: viewModels.filter(vm => vm.coverage_status === 'OVER').length,
      },
      install_percent: totalRequiredQty > 0 ? Math.round((totalInstalledQty / totalRequiredQty) * 100) : 0,
      by_status: {
        planned: viewModels.filter(vm => vm._raw?.commitment_status === 'planned').length,
        ordered: viewModels.filter(vm => ['ordered', 'partially_received'].includes(vm._raw?.commitment_status)).length,
        received: viewModels.filter(vm => vm._raw?.commitment_status === 'received').length,
        allocated: viewModels.filter(vm => vm._raw?.commitment_status === 'allocated').length,
        installed: viewModels.filter(vm => vm._raw?.commitment_status === 'installed' || vm.qty_installed >= vm.required_total).length,
      },
    };

    console.log('[PERF] getProjectSupplyView', Date.now() - _perfStart, 'ms', {
      entityCounts: {
        commitments: commitments.length,
        parts: parts.length,
        lineItems: lineItems.length,
        orders: orders.length,
        invoices: projectInvoices.length,
        invoiceLines: projectInvoiceLines.length,
      }
    });
    
    const responsePayload = {
      success: true,
      timestamp: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        client_name: project.client_name,
        financial_model_version: 'forward',
      },
      items: filtered,
      tab_counts: tabCounts,
      summary,
      categories: categories.filter(c => c.active !== false).map(c => ({ id: c.id, name: c.name, color: c.color })),
      integrity_warnings: integrityWarnings.length > 0 ? integrityWarnings : null,
    };

    setCache(cacheKey, responsePayload);
    return Response.json(responsePayload);

  } catch (error) {
    const msg = error?.message || '';
    const isRateLimit = error?.status === 429 || msg.includes('429') || msg.includes('Too Many Requests');
    const errorType = isRateLimit ? 'RATE_LIMIT' : msg === 'TIMEOUT' ? 'TIMEOUT' : 'UNKNOWN';
    console.error("getProjectSupplyView error:", { type: errorType, message: msg });
    return Response.json({
      success: false, data: null,
      error: { type: errorType, message: isRateLimit ? 'Rate limit exceeded' : msg }
    }, { status: isRateLimit ? 429 : 500 });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const BLOCK_MESSAGES = {
  NO_VENDOR: 'No vendor assigned to part',
  NEGATIVE_AVAILABLE: 'Available stock is negative',
  INVARIANT_VIOLATION: 'Data integrity issue detected',
  ARCHIVED_PART: 'Part is archived',
  REQUIRES_PREPAY: 'Requires invoice before ordering',
  INVALID_BILLING_FLAG: 'Invalid billing flag state',
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

/**
 * resolveCanonicalFinancials — inline canonical financial resolver
 * Computes from commitment snapshots only. No fallback to part.default_retail/cost.
 */
async function resolveCanonicalFinancials(base44, project_id, commitments, projectInvoices) {
  // Fetch services + credit allocations in parallel
  const [serviceCommitments, creditAllocations] = await Promise.all([
    base44.entities.ServiceCommitment.filter({ project_id }).catch(() => []),
    base44.entities.CreditAllocation.filter({ project_id, is_reversed: false }).catch(() => []),
  ]);

  // Fetch invoice lines scoped to project invoices
  const invoiceIds = projectInvoices.map(i => i.id);
  const invoiceLines = invoiceIds.length > 0
    ? await base44.entities.ProjectInvoiceLine.filter({ invoice_id: { $in: invoiceIds } }).catch(() => [])
    : [];

  const activeCommitments = commitments.filter(c =>
    !c.cancelled_at && c.is_archived !== true && c.commitment_status !== 'cancelled'
  );

  let parts_planned_retail = 0, parts_planned_cost = 0, parts_invoiced_amount = 0;
  let parts_missing_snapshot_count = 0;

  for (const c of activeCommitments) {
    const unitRetail = c.unit_retail_snapshot ?? 0;
    const unitCost = c.unit_cost_snapshot ?? 0;
    // CANONICAL: effective qty = required_total - qty_removed
    const qty = Math.max(0, (c.required_total ?? 0) - (c.qty_removed ?? 0));
    if (unitRetail === 0 && unitCost === 0) parts_missing_snapshot_count++;
    parts_planned_retail += unitRetail * qty;
    parts_planned_cost += unitCost * qty;
    parts_invoiced_amount += c.invoiced_amount ?? 0;
  }

  let services_planned_retail = 0, services_planned_cost = 0, services_invoiced_amount = 0;
  for (const sc of serviceCommitments) {
    services_planned_retail += sc.total_billable ?? 0;
    // STABILIZED: Line-item-derived total_cost ONLY — no legacy fallback
    services_planned_cost += sc.total_cost ?? 0;
    // CANONICAL: Billing lock = is_billed || invoice_id present
    if (sc.is_billed === true || sc.invoice_id != null) services_invoiced_amount += sc.total_billable ?? 0;
  }

  let credit_total = 0;
  for (const alloc of creditAllocations) credit_total += alloc.amount_applied ?? 0;

  const activeInvoices = projectInvoices.filter(inv => inv.status !== 'cancelled' && inv.status !== 'void');
  let invoice_entity_total = 0, invoice_entity_paid = 0, invoice_entity_balance_due = 0;
  for (const inv of activeInvoices) {
    invoice_entity_total += inv.total ?? inv.subtotal ?? 0;
    invoice_entity_paid += inv.paid_amount ?? 0;
    invoice_entity_balance_due += inv.balance_due ?? 0;
  }

  let invoice_lines_total = 0;
  for (const line of invoiceLines) {
    invoice_lines_total += line.line_total ?? ((line.qty || 0) * (line.unit_price || 0));
  }

  const r2 = n => Math.round((n || 0) * 100) / 100;
  const planned_retail = r2(parts_planned_retail + services_planned_retail);
  const planned_cost = r2(parts_planned_cost + services_planned_cost);
  const invoiced_total = r2(parts_invoiced_amount + services_invoiced_amount);
  const remaining_total = r2(Math.max(0, planned_retail - invoiced_total - credit_total));

  return {
    planned_retail, planned_cost, invoiced_total,
    credit_total: r2(credit_total), remaining_total,
    parts_planned_retail: r2(parts_planned_retail),
    parts_planned_cost: r2(parts_planned_cost),
    services_planned_retail: r2(services_planned_retail),
    services_planned_cost: r2(services_planned_cost),
    invoice_entity_total: r2(invoice_entity_total),
    invoice_entity_paid: r2(invoice_entity_paid),
    invoice_entity_balance_due: r2(invoice_entity_balance_due),
    parts_missing_snapshot_count,
    reconciliation: {
      drift_detected: Math.abs(r2(invoice_entity_total - invoiced_total)) > 0.01 || Math.abs(r2(invoice_lines_total - parts_invoiced_amount)) > 0.01,
      invoice_vs_commitment_delta: r2(invoice_entity_total - invoiced_total),
      line_vs_commitment_delta: r2(invoice_lines_total - parts_invoiced_amount),
    },
  };
}

function computeNextAction(commitment, partHasVendor, prepayContext = {}) {
  const {
    effective_required = 0,
    reserved_from_stock = 0,
    covered_from_po = 0,
    qty_installed = 0,
    coverage_qty = 0,
    to_order_qty = 0,
    commitment_fulfilled = false,
    needs_order = false,
    requires_prepay = false,
  } = commitment;

  const available_to_install = Math.max(0, Math.min(reserved_from_stock + covered_from_po - qty_installed, effective_required - qty_installed));

  let prepay_diagnostics = null;
  if (requires_prepay) {
    const invoicedRetail = prepayContext.invoicedRetail ?? 0;
    const paidRetail = prepayContext.paidRetail ?? 0;
    const prepaySatisfied = invoicedRetail > 0 && paidRetail >= (invoicedRetail - 0.01);
    prepay_diagnostics = { prepay_invoiced_retail: invoicedRetail, prepay_paid_retail: paidRetail, prepay_satisfied: prepaySatisfied };
    if (!prepaySatisfied && needs_order) {
      return { next_action: 'BLOCKED_PREPAY', block_reason_code: 'REQUIRES_PREPAY', prepay_diagnostics };
    }
  }

  // CANONICAL: commitment_fulfilled means coverage_qty >= effective_required
  // Fulfilled commitments NEVER return NEEDS_ORDER / CREATE_PO
  if (commitment_fulfilled) {
    if (qty_installed >= effective_required && effective_required > 0) {
      return { next_action: 'COMPLETE', block_reason_code: null, prepay_diagnostics };
    }
    if (available_to_install > 0) {
      return { next_action: 'INSTALL', block_reason_code: null, prepay_diagnostics };
    }
    // Fulfilled but not yet installed and nothing to install locally
    if (covered_from_po > 0 && coverage_qty < effective_required) {
      return { next_action: 'RECEIVE', block_reason_code: null, prepay_diagnostics };
    }
    return { next_action: 'COMPLETE', block_reason_code: null, prepay_diagnostics };
  }

  // Not fulfilled — needs_order is true
  if (needs_order && !partHasVendor) {
    return { next_action: 'FIX_VENDOR', block_reason_code: 'NO_VENDOR', prepay_diagnostics };
  }
  if (needs_order) {
    return { next_action: 'CREATE_PO', block_reason_code: null, prepay_diagnostics };
  }

  // Edge: not fulfilled but to_order_qty is 0 — covered_from_po exists but hasn't been received
  if (covered_from_po > 0 && coverage_qty < effective_required) {
    return { next_action: 'RECEIVE', block_reason_code: null, prepay_diagnostics };
  }
  if (available_to_install > 0 && qty_installed < effective_required) {
    return { next_action: 'INSTALL', block_reason_code: null, prepay_diagnostics };
  }

  return { next_action: null, block_reason_code: null, prepay_diagnostics };
}