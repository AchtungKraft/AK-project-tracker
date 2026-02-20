import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getProjectSupplyView - Canonical read model for project supply state
 * 
 * Returns SupplyCommitmentViewModel[] shaped data.
 * UI components MUST NOT compute coverage, to_order, or next_action locally.
 * 
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

    // Fetch all required data in parallel (FORWARD MODEL - no pools)
    const [
      project,
      commitments,
      parts,
      vendors,
      lineItems,
      orders,
      categories,
      invoiceBatches,
    ] = await Promise.all([
      base44.entities.Project.filter({ id: project_id }).then(r => r[0]),
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.Part.list(),
      base44.entities.Vendor.list(),
      base44.entities.PartPurchaseLineItem.list(),
      base44.entities.Order.list(),
      base44.entities.PartCategory.list(),
      base44.entities.InvoiceBatch.filter({ project_id }),
    ]);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // FORWARD MODEL ENFORCEMENT
    if (project.financial_model_version !== 'forward') {
      console.warn(`[FORWARD MIGRATION] Project ${project_id} has legacy model, treating as forward`);
    }

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const orderMap = new Map(orders.map(o => [o.id, o]));
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    // FORWARD MODEL: Calculate invoice-based billing metrics
    const paidInvoices = invoiceBatches.filter(ib => ib.status === 'paid');
    const totalInvoiced = invoiceBatches.reduce((sum, ib) => sum + (ib.total_amount || 0), 0);
    const totalPaid = paidInvoices.reduce((sum, ib) => sum + (ib.total_amount || 0), 0);
    const invoiceOutstanding = totalInvoiced - totalPaid;

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

    // Calculate part-level inventory totals
    const partInventoryMap = new Map();
    commitments.forEach(c => {
      const partId = c.part_id;
      if (!partInventoryMap.has(partId)) {
        partInventoryMap.set(partId, {
          total_reserved: 0,
          total_covered: 0,
          total_to_order: 0,
        });
      }
      const inv = partInventoryMap.get(partId);
      inv.total_reserved += c.reserved_from_stock ?? c.qty_reserved ?? 0;
      inv.total_covered += c.covered_from_po ?? c.qty_ordered ?? 0;
    });

    // Build SupplyCommitmentViewModel for each commitment
    const viewModels = commitments
      .filter(c => c.commitment_status !== 'cancelled')
      .map(c => {
        const part = partMap.get(c.part_id);
        const vendor = part ? vendorMap.get(part.default_vendor_id) : null;
        const category = part?.part_category_id ? categoryMap.get(part.part_category_id) : null;
        const commitmentLineItems = lineItemsByCommitment.get(c.id) || [];

        // Canonical quantities
        const required_total = c.required_total ?? c.qty_committed ?? 0;
        const reserved_from_stock = c.reserved_from_stock ?? c.qty_reserved ?? 0;
        const covered_from_po = c.covered_from_po ?? c.qty_ordered ?? 0;
        const qty_installed = c.qty_installed ?? 0;

        // Derived quantities (resolver computes these, UI does NOT)
        const to_order = Math.max(0, required_total - reserved_from_stock - covered_from_po);
        const available_to_install = Math.max(0, reserved_from_stock + covered_from_po - qty_installed);

        // ============================================================================
        // PHASE 9C: HARD INVARIANT ENFORCEMENT
        // Coverage Invariant: required_total MUST equal reserved + covered + to_order
        // This is a HARD FAIL - UI must NEVER render mathematically invalid rows
        // ============================================================================
        const coverage_sum = reserved_from_stock + covered_from_po + to_order;
        if (Math.abs(coverage_sum - required_total) > 0.01) {
          throw new Error(
            `COVERAGE_INVARIANT_VIOLATION: part=${c.part_id} commitment=${c.id} ` +
            `required=${required_total} reserved=${reserved_from_stock} covered=${covered_from_po} to_order=${to_order} sum=${coverage_sum}`
          );
        }

        // Calculate on-order and received from line items
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
        const planned_cost_total = c.planned_cost_total ?? (unit_cost * required_total);
        const planned_retail_total = c.planned_retail_total ?? (unit_retail * required_total);
        const covered_retail_total = c.covered_retail_total ?? 0;
        const exposure_gap = c.exposure_gap ?? Math.max(0, planned_retail_total - covered_retail_total);

        // Source type mapping
        const source_type = mapSourceType(c.supply_source_type);

        // Determine next action and block status (FORWARD MODEL - no pool gating)
        const { next_action, block_reason_code } = computeNextAction(
          { required_total, reserved_from_stock, covered_from_po, qty_installed },
          !!vendor
        );

        // Part inventory snapshot
        const partInv = partInventoryMap.get(c.part_id) || {};
        const physical_stock = part?.physical_stock ?? 0;
        const inventory_snapshot = {
          physical_stock,
          reserved_total: partInv.total_reserved || 0,
          available: Math.max(0, physical_stock - (partInv.total_reserved || 0)),
          on_order_total: part?.on_order ?? 0,
          to_order_total: partInv.total_to_order || 0,
        };

        return {
          commitment_id: c.id,
          part_id: c.part_id,
          part_name: part?.part_name || 'Unknown Part',
          vendor_part_number: part?.vendor_part_number || null,
          featured_photo: part?.featured_photo || null,
          project_id: c.project_id,
          project_name: project.name,
          vendor_id: vendor?.id || null,
          vendor_name: vendor?.vendor_name || null,
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
          planned_cost_total,
          planned_retail_total,
          covered_retail_total,
          exposure_gap,
          billing_status: c.billing_status || 'billable',

          // Inventory snapshot
          inventory_snapshot,

          // Raw commitment data for mutations
          _raw: {
            commitment_status: c.commitment_status,
            billing_status: c.billing_status,
            requires_prepay: c.requires_prepay,
            prepay_satisfied_at: c.prepay_satisfied_at,
            order_line_item_ids: c.order_line_item_ids,
          },
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

    // Compute tab counts (FORWARD MODEL - no fund tab)
    const tabCounts = {
      all: viewModels.length,
      plan: viewModels.length,
      buy: viewModels.filter(vm => vm.to_order > 0 || vm.next_action === 'CREATE_PO').length,
      receive: viewModels.filter(vm => vm.on_order_qty > 0 || vm.next_action === 'RECEIVE').length,
      install: viewModels.filter(vm => vm.available_to_install > 0 || vm.next_action === 'INSTALL').length,
      invoice: invoiceBatches.filter(ib => ib.status !== 'void').length,
    };

    // Summary statistics (FORWARD MODEL - invoice-based)
    const totalPlannedRetail = viewModels.reduce((sum, vm) => sum + vm.planned_retail_total, 0);
    const totalPlannedCost = viewModels.reduce((sum, vm) => sum + vm.planned_cost_total, 0);
    const totalInstalledQty = viewModels.reduce((sum, vm) => sum + vm.qty_installed, 0);
    const totalRequiredQty = viewModels.reduce((sum, vm) => sum + vm.required_total, 0);
    
    const summary = {
      total_commitments: viewModels.length,
      total_required: totalRequiredQty,
      total_reserved: viewModels.reduce((sum, vm) => sum + vm.reserved_from_stock, 0),
      total_covered: viewModels.reduce((sum, vm) => sum + vm.covered_from_po, 0),
      total_to_order: viewModels.reduce((sum, vm) => sum + vm.to_order, 0),
      total_installed: totalInstalledQty,
      // FORWARD MODEL: Invoice-based billing metrics
      total_planned_retail: totalPlannedRetail,
      total_planned_cost: totalPlannedCost,
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      invoice_outstanding: invoiceOutstanding,
      unbilled_retail: Math.max(0, totalPlannedRetail - totalInvoiced),
      // Supply coverage (not financial)
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

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        client_name: project.client_name,
        financial_model_version: 'forward', // Always forward
      },
      items: filtered,
      tab_counts: tabCounts,
      summary,
      categories: categories.filter(c => c.active !== false).map(c => ({ id: c.id, name: c.name, color: c.color })),
    });

  } catch (error) {
    console.error("getProjectSupplyView error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// FORWARD MODEL: Simplified block messages (no pool/funding blocks)
const BLOCK_MESSAGES = {
  NO_VENDOR: 'No vendor assigned to part',
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

// FORWARD MODEL: No pool/funding gating - only vendor and qty checks
function computeNextAction(commitment, partHasVendor) {
  const {
    required_total = 0,
    reserved_from_stock = 0,
    covered_from_po = 0,
    qty_installed = 0,
  } = commitment;

  const to_order = Math.max(0, required_total - reserved_from_stock - covered_from_po);
  const available_to_install = reserved_from_stock + covered_from_po - qty_installed;

  // Only block: no vendor
  if (to_order > 0 && !partHasVendor) {
    return { next_action: 'FIX_VENDOR', block_reason_code: 'NO_VENDOR' };
  }

  // Determine next action based on lifecycle (no funding gates)
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