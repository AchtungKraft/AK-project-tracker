import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * getOpsSupplyView - Canonical read model for operations/global supply state
 * 
 * Replaces both getGlobalOrderQueue and getGlobalSupplyQueues.
 * Returns SupplyCommitmentViewModel[] shaped data for ops-first workflows.
 * 
 * Modes:
 * - ORDERING: Items needing PO creation (GlobalNeedToOrder replacement)
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

    // PERF: Timing start
    const _perfStart = Date.now();
    
    // PHASE 1: Fetch commitments first (scoped filter)
    const commitmentFilter = { commitment_status: { $ne: 'cancelled' } };
    if (filters.project_id) commitmentFilter.project_id = filters.project_id;
    
    const commitments = await base44.entities.PartCommitment.filter(commitmentFilter, '-created_date', 1000);
    
    if (commitments.length === 0) {
      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        mode,
        items: [],
        summary: { total_items: 0, total_qty_to_order: 0, total_exposure: 0, total_estimated_cost: 0, orderable_count: 0, blocked_count: 0, funding_blocked_count: 0 },
        filter_options: { projects: [], vendors: [], categories: [] },
      });
    }
    
    // PHASE 2: Derive scoped IDs from commitments
    const commitmentIds = commitments.map(c => c.id);
    const commitmentPartIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    const commitmentProjectIds = [...new Set(commitments.map(c => c.project_id).filter(Boolean))];
    
    // PHASE 3: Fetch reference data SCOPED by commitment-derived IDs (no global scans)
    const [parts, projects] = await Promise.all([
      commitmentPartIds.length > 0
        ? base44.entities.Part.filter({ id: { $in: commitmentPartIds } })
        : [],
      commitmentProjectIds.length > 0
        ? base44.entities.Project.filter({ id: { $in: commitmentProjectIds } })
        : [],
    ]);
    
    // Derive vendor IDs and category IDs from parts (not global scans)
    const derivedVendorIds = [...new Set(parts.map(p => p.default_vendor_id).filter(Boolean))];
    const derivedCategoryIds = [...new Set(parts.map(p => p.part_category_id).filter(Boolean))];
    
    const [vendors, categories] = await Promise.all([
      derivedVendorIds.length > 0
        ? base44.entities.Vendor.filter({ id: { $in: derivedVendorIds } })
        : [],
      derivedCategoryIds.length > 0
        ? base44.entities.PartCategory.filter({ id: { $in: derivedCategoryIds } })
        : [],
    ]);
    
    // PHASE 4: Fetch line items scoped to commitments, then derive orders
    const [lineItems, projectInvoices] = await Promise.all([
      commitmentIds.length > 0
        ? base44.entities.PartPurchaseLineItem.filter({ commitment_id: { $in: commitmentIds } })
        : [],
      commitmentProjectIds.length > 0
        ? base44.entities.ProjectInvoice.filter({ project_id: { $in: commitmentProjectIds } })
        : [],
    ]);
    
    // Derive orders from line items (no full scan)
    const orderIds = [...new Set(lineItems.map(li => li.order_id).filter(Boolean))];
    const invoiceIds = projectInvoices.map(i => i.id);
    
    const [orders, projectInvoiceLines] = await Promise.all([
      orderIds.length > 0 ? base44.entities.Order.filter({ id: { $in: orderIds } }) : [],
      invoiceIds.length > 0 ? base44.entities.ProjectInvoiceLine.filter({ invoice_id: { $in: invoiceIds } }) : [],
    ]);
    
    // DEPRECATED: pools removed - forward model only
    const pools = [];

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const orderMap = new Map(orders.map(o => [o.id, o]));
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    // Group pools by project
    const poolsByProject = new Map();
    pools.forEach(p => {
      if (!poolsByProject.has(p.project_id)) {
        poolsByProject.set(p.project_id, []);
      }
      poolsByProject.get(p.project_id).push(p);
    });

    const getProjectPoolBalance = (projectId) => {
      const projectPools = poolsByProject.get(projectId) || [];
      return projectPools.reduce((sum, p) => sum + (p.balance || 0), 0);
    };

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
    // This resolves prepay at COMMITMENT level, not project level
    // ============================================================================
    
    // 1. invoiceById map
    const invoiceById = new Map(projectInvoices.map(inv => [inv.id, inv]));
    
    // 2. paidRatioByInvoiceId - proportion of invoice that has been paid
    const paidRatioByInvoiceId = new Map();
    for (const inv of projectInvoices) {
      if (inv.status === 'paid') {
        paidRatioByInvoiceId.set(inv.id, 1);
      } else if ((inv.paid_amount || 0) > 0 && (inv.total || 0) > 0) {
        const ratio = Math.min(1, Math.max(0, inv.paid_amount / inv.total));
        paidRatioByInvoiceId.set(inv.id, ratio);
      } else {
        paidRatioByInvoiceId.set(inv.id, 0);
      }
    }
    
    // 3. Filter invoice lines that have commitment references
    const relevantInvoiceLines = projectInvoiceLines.filter(
      line => line.part_commitment_id
    );
    
    // 4. commitmentInvoicedRetail and commitmentPaidRetail
    const commitmentInvoicedRetailMap = new Map();
    const commitmentPaidRetailMap = new Map();
    
    for (const line of relevantInvoiceLines) {
      const commitmentId = line.part_commitment_id;
      const lineRetail = line.line_total ?? ((line.qty || 0) * (line.unit_price || 0));
      const paidRatio = paidRatioByInvoiceId.get(line.invoice_id) ?? 0;
      
      // Accumulate invoiced retail
      const currentInvoiced = commitmentInvoicedRetailMap.get(commitmentId) ?? 0;
      commitmentInvoicedRetailMap.set(commitmentId, currentInvoiced + lineRetail);
      
      // Accumulate paid retail (lineRetail * paidRatio)
      const currentPaid = commitmentPaidRetailMap.get(commitmentId) ?? 0;
      commitmentPaidRetailMap.set(commitmentId, currentPaid + (lineRetail * paidRatio));
    }

    // ============================================================================
    // PHASE 2: CANONICAL PART-LEVEL INVENTORY MAP (same as getProjectSupplyView)
    // This computes GLOBAL reserved/on_order across ALL active commitments for each part
    // ============================================================================
    const partInventoryMap = new Map();
    
    // Initialize from Part entities
    for (const part of parts) {
      partInventoryMap.set(part.id, {
        physical_stock: part.physical_stock ?? 0,
        reserved_global: 0,
        on_order_global: 0,
        to_order_global: 0,
        available: 0,
      });
    }
    
    // Aggregate from ALL active commitments (global, not per-project)
    for (const c of commitments) {
      const inv = partInventoryMap.get(c.part_id);
      if (!inv) continue;
      
      const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered = c.covered_from_po ?? c.qty_ordered ?? 0;
      const required = c.required_total ?? c.qty_committed ?? 0;
      
      inv.reserved_global += reserved;
      inv.on_order_global += covered;
      inv.to_order_global += Math.max(0, required - reserved - covered);
    }
    
    // Calculate available after aggregation
    for (const [partId, inv] of partInventoryMap.entries()) {
      inv.available = Math.max(0, inv.physical_stock - inv.reserved_global);
    }

    // Build SupplyCommitmentViewModel for each commitment
    const viewModels = commitments.map(c => {
      const part = partMap.get(c.part_id);
      const project = projectMap.get(c.project_id);
      const vendor = part ? vendorMap.get(part.default_vendor_id) : null;
      const category = part?.part_category_id ? categoryMap.get(part.part_category_id) : null;
      const poolBalance = getProjectPoolBalance(c.project_id);
      const commitmentLineItems = lineItemsByCommitment.get(c.id) || [];

      // Canonical quantities
      const required_total = c.required_total ?? c.qty_committed ?? 0;
      let reserved_from_stock = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered_from_po = c.covered_from_po ?? c.qty_ordered ?? 0;
      const qty_installed = c.qty_installed ?? 0;

      // ============================================================================
      // AUTO-ALLOCATION: If physical stock exists but reserved_from_stock is 0,
      // auto-allocate available stock to reduce to_order.
      // This fixes the "stock > 0 but to_order > 0" drift condition.
      // ============================================================================
      const partInvForAlloc = partInventoryMap.get(c.part_id);
      const gap = Math.max(0, required_total - reserved_from_stock - covered_from_po - qty_installed);
      if (gap > 0 && partInvForAlloc && partInvForAlloc.available > 0) {
        const autoReserve = Math.min(gap, partInvForAlloc.available);
        reserved_from_stock += autoReserve;
        // Deduct from available pool so other commitments don't double-count
        partInvForAlloc.available -= autoReserve;
        partInvForAlloc.reserved_global += autoReserve;
        
        // DRIFT DETECTION: Log auto-allocation
        console.warn(`[AUTO_ALLOCATE] commitment=${c.id} part=${c.part_id} ` +
          `auto_reserved=${autoReserve} gap_before=${gap} gap_after=${gap - autoReserve} ` +
          `physical=${partInvForAlloc.physical_stock} reserved_global=${partInvForAlloc.reserved_global}`);
      }

      // COVERAGE MODEL:
      // required_total is satisfied by:
      // - reserved_from_stock (allocated inventory)
      // - covered_from_po (incoming supply)
      // - qty_installed (consumed supply)
      // - remaining gap becomes to_order
      const to_order = Math.max(0, required_total - reserved_from_stock - covered_from_po - qty_installed);
      const available_to_install = Math.max(0, reserved_from_stock + covered_from_po - qty_installed);

      // Calculate on-order qty from line items
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
      if (total_covered >= required_total && required_total > 0) {
        coverage_status = 'FULL';
      } else if (total_covered > required_total) {
        coverage_status = 'OVER';
      } else if (total_covered > 0) {
        coverage_status = 'PARTIAL';
      } else {
        coverage_status = 'NONE';
      }
      const coverage_percent = required_total > 0 ? Math.round((total_covered / required_total) * 100) : 0;

      // Financial
      const unit_cost = c.unit_cost_snapshot ?? part?.cost ?? 0;
      const unit_retail = c.unit_retail_snapshot ?? part?.retail_matrix_price ?? part?.retail_override ?? 0;
      const planned_retail_total = c.planned_retail_total ?? (unit_retail * required_total);
      const covered_retail_total = c.covered_retail_total ?? 0;
      const exposure_gap = c.exposure_gap ?? Math.max(0, planned_retail_total - covered_retail_total);

      // Source type mapping
      const source_type = mapSourceType(c.supply_source_type);

      // PHASE 10: Use commitment-level payment data for prepay gating
      const requires_prepay = c.requires_prepay === true;
      const has_vendor = !!vendor;
      
      // PREPAY GATING: Pass commitment-level payment data to computeNextAction
      const prepayContext = {
        invoicedRetail: commitmentInvoicedRetailMap.get(c.id) ?? 0,
        paidRetail: commitmentPaidRetailMap.get(c.id) ?? 0,
      };

      // Determine next action and blocks
      const { next_action, block_reason_code, prepay_diagnostics } = computeNextAction(
        { required_total, reserved_from_stock, covered_from_po, qty_installed, requires_prepay },
        has_vendor,
        prepayContext
      );

      // PHASE 10: is_orderable computed from prepay resolution
      const prepaySatisfied = !requires_prepay || 
        (prepayContext.invoicedRetail > 0 && prepayContext.paidRetail >= (prepayContext.invoicedRetail - 0.01));
      
      const is_orderable = 
        to_order > 0 && 
        has_vendor && 
        prepaySatisfied;
      
      // PHASE 9K-B: Server-side assertion - detect invalid blocks
      if (to_order > 0 && !requires_prepay && has_vendor && !is_orderable) {
        console.error(`[INVALID_ORDER_BLOCK] commitment=${c.id} to_order=${to_order} requires_prepay=${requires_prepay} has_vendor=${has_vendor}`);
        throw new Error(`INVALID_ORDER_BLOCK: commitment ${c.id} should be orderable`);
      }
      
      const is_funding_blocked = block_reason_code === 'PREPAY_REQUIRED';

      // ============================================================================
      // PHASE 2B: CANONICAL INVENTORY SNAPSHOT (same as getProjectSupplyView)
      // Use pre-computed global inventory map
      // ============================================================================
      const partInv = partInventoryMap.get(c.part_id) || {
        physical_stock: 0,
        reserved_global: 0,
        on_order_global: 0,
        to_order_global: 0,
        available: 0,
      };
      
      const inventory_snapshot = {
        // CANONICAL: Part-level physical stock (GLOBAL)
        physical_stock_global: partInv.physical_stock,
        physical: partInv.physical_stock,
        physical_stock: partInv.physical_stock,
        
        // CANONICAL: GLOBAL reserved across ALL active commitments
        reserved_global_active: partInv.reserved_global,
        reserved: partInv.reserved_global,
        reserved_total: partInv.reserved_global,
        
        // CANONICAL: THIS commitment's reserved allocation
        reserved_this_project: reserved_from_stock,
        
        // CANONICAL: Available = physical - global reserved
        available_global_active: partInv.available,
        available: partInv.available,
        
        // CANONICAL: Global aggregates
        on_order_total: partInv.on_order_global,
        to_order_total: partInv.to_order_global,
        
        // CANONICAL: "Needed" for this commitment = required - installed
        needed: Math.max(0, required_total - qty_installed),
      };

      // Derive first order_id for "View PO" navigation
      // Include Received status so received items still show PO link
      const firstOrderId = commitmentLineItems.length > 0
        ? commitmentLineItems.find(li => {
            const o = orderMap.get(li.order_id);
            return o && ['Draft', 'Ordered', 'Partial', 'Received'].includes(o.status);
          })?.order_id || commitmentLineItems[0].order_id
        : null;

      return {
        // PHASE: Dual-ID for PSM compatibility — `id` mirrors `commitment_id`
        id: c.id,
        commitment_id: c.id,
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown Part',
        vendor_part_number: part?.vendor_part_number || null,
        featured_photo: part?.featured_photo || null,
        order_url: part?.order_url || null,
        order_id: firstOrderId,
        order_number: firstOrderId ? (orderMap.get(firstOrderId)?.order_number || orderMap.get(firstOrderId)?.po_number || null) : null,
        project_id: c.project_id,
        project_name: project?.name || 'AK Stock',
        vendor_id: vendor?.id || null,
        vendor_name: vendor?.vendor_name || 'No Vendor',
        category_id: category?.id || null,
        category_name: category?.name || null,
        category_color: category?.color || '#6b7280',

        // Canonical quantities
        required_total,
        reserved_from_stock,
        covered_from_po,
        qty_installed,

        // Derived quantities
        to_order,
        on_order_qty,
        received_qty,
        available_to_install,

        // Coverage debug fields
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

        // Coverage state
        coverage_status,
        coverage_percent,

        // Next action
        next_action,
        block_reason_code,
        block_reason_message: block_reason_code ? BLOCK_MESSAGES[block_reason_code] : null,

        // Source type
        source_type,

        // Financial
        unit_cost,
        unit_retail,
        estimated_cost: to_order * unit_cost,
        planned_retail_total,
        covered_retail_total,
        exposure_gap,
        pool_balance: poolBalance,
        billing_status: c.billing_status || 'billable',

        // Ordering flags - PHASE 10: prepay resolved from actual payments
        is_orderable,
        is_funding_blocked,
        has_vendor,
        requires_prepay,

        // Inventory snapshot
        inventory_snapshot,

        // Commitment status (canonical)
        commitment_status: c.commitment_status || 'planned',

        // PSM-compatible nested shape aliases (allows PSMGroupedView to consume this data)
        part: {
          id: c.part_id,
          part_name: part?.part_name || 'Unknown Part',
          vendor_part_number: part?.vendor_part_number || null,
          featured_photo: part?.featured_photo || null,
          order_url: part?.order_url || null,
        },
        vendor: vendor ? { id: vendor.id, vendor_name: vendor.vendor_name } : null,
        categoryId: category?.id || null,
        categoryObj: category ? { id: category.id, name: category.name } : null,
        categoryName: category?.name || null,
        allowed: {
          canCreatePO: is_orderable,
          canCreateDeltaOrder: covered_from_po > 0 && to_order === 0,
          canReceive: on_order_qty > 0,
          canInstall: available_to_install > 0 && qty_installed < required_total,
          canReverseInstall: qty_installed > 0,
          canCancel: c.commitment_status !== 'cancelled',
          canCreateInvoice: false, // Not relevant in ops context
        },
        // Derived billing state for PSM compatibility
        billing_state: c.billing_status === 'invoiced' ? 'INVOICED' : c.billing_status === 'paid' ? 'PAID' : 'NOT_INVOICED',

        // Raw data for mutations
        _raw: {
          commitment_status: c.commitment_status,
        },

        // PREPAY DIAGNOSTICS (helps debug prepay gating)
        ...(prepay_diagnostics ? { prepay_diagnostics } : {}),
      };
    });

    // Filter by mode
    let filtered = viewModels;
    switch (mode) {
      case 'ORDERING':
        filtered = viewModels.filter(vm => vm.to_order > 0 && vm.source_type === 'SHOP_PURCHASED');
        break;
      case 'RECEIVING':
        filtered = viewModels.filter(vm => vm.on_order_qty > 0);
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
    if (filters.include_ak_stock !== false && !filters.project_id) {
      // Include items without project (AK Stock) by default
    } else if (filters.project_id) {
      filtered = filtered.filter(vm => vm.project_id === filters.project_id);
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
      total_exposure: filtered.reduce((sum, vm) => sum + vm.exposure_gap, 0),
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

    // PERF: Timing log (dev only)
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
    
    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      mode,
      items: filtered,
      summary,
      filter_options: filterOptions,
    });

  } catch (error) {
    console.error("getOpsSupplyView error:", error);
    return Response.json({ error: error.message }, { status: 500 });
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

/**
 * PHASE 10: PREPAY GATING uses commitment-level payment resolution
 * 
 * ORDERING MODE gating is ONLY:
 * - NO_VENDOR: no vendor assigned
 * - PREPAY_REQUIRED: requires_prepay === true AND prepay NOT satisfied
 * 
 * Prepay is satisfied when:
 * 1. Commitment has been invoiced (invoicedRetail > 0)
 * 2. Paid amount >= invoiced amount (with 0.01 tolerance for rounding)
 */
function computeNextAction(commitment, partHasVendor, prepayContext = {}) {
  const {
    required_total = 0,
    reserved_from_stock = 0,
    covered_from_po = 0,
    qty_installed = 0,
    requires_prepay = false,
  } = commitment;

  const to_order = Math.max(0, required_total - reserved_from_stock - covered_from_po);
  const available_to_install = reserved_from_stock + covered_from_po - qty_installed;

  // Build prepay diagnostics
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
    
    // Block if prepay required but not satisfied
    if (to_order > 0 && !prepaySatisfied) {
      return { next_action: 'ALLOCATE_POOL', block_reason_code: 'PREPAY_REQUIRED', prepay_diagnostics };
    }
  }

  // Vendor check
  if (to_order > 0 && !partHasVendor) {
    return { next_action: 'FIX_VENDOR', block_reason_code: 'NO_VENDOR', prepay_diagnostics };
  }
  
  if (to_order > 0) {
    return { next_action: 'CREATE_PO', block_reason_code: null, prepay_diagnostics };
  }
  if (covered_from_po > 0 && available_to_install < (required_total - qty_installed)) {
    return { next_action: 'RECEIVE', block_reason_code: null, prepay_diagnostics };
  }
  if (available_to_install > 0 && qty_installed < required_total) {
    return { next_action: 'INSTALL', block_reason_code: null, prepay_diagnostics };
  }
  if (qty_installed >= required_total && required_total > 0) {
    return { next_action: 'COMPLETE', block_reason_code: null, prepay_diagnostics };
  }

  return { next_action: null, block_reason_code: null, prepay_diagnostics };
}