import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Fetch all required data in parallel
    const [
      commitments,
      parts,
      projects,
      vendors,
      pools,
      lineItems,
      orders,
      categories,
    ] = await Promise.all([
      base44.entities.PartCommitment.filter({ commitment_status: { $ne: 'cancelled' } }),
      base44.entities.Part.list(),
      base44.entities.Project.list(),
      base44.entities.Vendor.list(),
      base44.entities.BillingPool.filter({ status: { $ne: 'closed' } }),
      base44.entities.PartPurchaseLineItem.list(),
      base44.entities.Order.list(),
      base44.entities.PartCategory.list(),
    ]);

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
      const reserved_from_stock = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered_from_po = c.covered_from_po ?? c.qty_ordered ?? 0;
      const qty_installed = c.qty_installed ?? 0;

      // Derived quantities
      const to_order = Math.max(0, required_total - reserved_from_stock - covered_from_po);
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

      // Determine next action and blocks
      const { next_action, block_reason_code } = computeNextAction(
        { required_total, reserved_from_stock, covered_from_po, qty_installed, requires_prepay: c.requires_prepay, prepay_satisfied_at: c.prepay_satisfied_at },
        !!vendor,
        poolBalance,
        exposure_gap
      );

      // Check if orderable
      const is_orderable = to_order > 0 && !block_reason_code && source_type === 'SHOP_PURCHASED';
      const is_funding_blocked = block_reason_code === 'INSUFFICIENT_FUNDS' || block_reason_code === 'PREPAY_REQUIRED';

      // Inventory snapshot
      const physical_stock = part?.physical_stock ?? 0;
      const inventory_snapshot = {
        physical_stock,
        reserved_total: 0, // Would need aggregation across all commitments
        available: physical_stock,
        on_order_total: part?.on_order ?? 0,
        to_order_total: to_order,
      };

      return {
        commitment_id: c.id,
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown Part',
        vendor_part_number: part?.vendor_part_number || null,
        featured_photo: part?.featured_photo || null,
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

        // Ordering flags
        is_orderable,
        is_funding_blocked,
        requires_prepay: c.requires_prepay || false,
        prepay_ok: !c.requires_prepay || !!c.prepay_satisfied_at,

        // Inventory snapshot
        inventory_snapshot,

        // Raw data for mutations
        _raw: {
          commitment_status: c.commitment_status,
        },
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

function computeNextAction(commitment, partHasVendor, poolBalance, exposureGap) {
  const {
    required_total = 0,
    reserved_from_stock = 0,
    covered_from_po = 0,
    qty_installed = 0,
    requires_prepay = false,
    prepay_satisfied_at = null,
  } = commitment;

  const to_order = Math.max(0, required_total - reserved_from_stock - covered_from_po);
  const available_to_install = reserved_from_stock + covered_from_po - qty_installed;

  if (to_order > 0 && !partHasVendor) {
    return { next_action: 'FIX_VENDOR', block_reason_code: 'NO_VENDOR' };
  }
  if (to_order > 0 && requires_prepay && !prepay_satisfied_at) {
    return { next_action: 'ALLOCATE_POOL', block_reason_code: 'PREPAY_REQUIRED' };
  }
  if (to_order > 0 && exposureGap > 0 && exposureGap > poolBalance) {
    return { next_action: 'ALLOCATE_POOL', block_reason_code: 'INSUFFICIENT_FUNDS' };
  }
  if (to_order > 0) {
    return { next_action: 'CREATE_PO', block_reason_code: null };
  }
  if (covered_from_po > 0 && available_to_install < (required_total - qty_installed)) {
    return { next_action: 'RECEIVE', block_reason_code: null };
  }
  if (available_to_install > 0 && qty_installed < required_total) {
    return { next_action: 'INSTALL', block_reason_code: null };
  }
  if (qty_installed >= required_total && required_total > 0) {
    return { next_action: 'COMPLETE', block_reason_code: null };
  }

  return { next_action: null, block_reason_code: null };
}