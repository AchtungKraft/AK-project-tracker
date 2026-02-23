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
      projectInvoices,
    ] = await Promise.all([
      base44.entities.Project.filter({ id: project_id }).then(r => r[0]),
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.Part.list(),
      base44.entities.Vendor.list(),
      base44.entities.PartPurchaseLineItem.list(),
      base44.entities.Order.list(),
      base44.entities.PartCategory.list(),
      base44.entities.ProjectInvoice.filter({ project_id }),
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

    // FORWARD MODEL: Calculate invoice-based billing metrics using ProjectInvoice entity
    const paidInvoices = projectInvoices.filter(inv => inv.status === 'paid');
    const totalInvoiced = projectInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalPaid = paidInvoices.reduce((sum, inv) => sum + (inv.paid_amount || inv.total || 0), 0);
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

    // ============================================================================
    // PHASE 2: CANONICAL PART-LEVEL INVENTORY MAP
    // This computes GLOBAL reserved/on_order across ALL active commitments for each part
    // "Reserved" = SUM(reserved_from_stock) across ALL commitments (not just this project)
    // ============================================================================
    
    // First, fetch ALL commitments for parts in this project (to get global reservations)
    const partIdsInProject = [...new Set(commitments.map(c => c.part_id))];
    
    // Handle empty part list gracefully
    let allCommitmentsForParts = [];
    if (partIdsInProject.length > 0) {
      allCommitmentsForParts = await base44.entities.PartCommitment.filter({
        part_id: { $in: partIdsInProject },
        commitment_status: { $nin: ['cancelled', 'closed'] }
      });
    }
    
    // Build canonical part inventory map with GLOBAL totals
    const partInventoryMap = new Map();
    
    // Initialize from Part entities
    for (const partId of partIdsInProject) {
      const part = partMap.get(partId);
      partInventoryMap.set(partId, {
        physical_stock: part?.physical_stock ?? 0,
        reserved_global: 0,  // Will be summed from ALL commitments
        on_order_global: 0,
        to_order_global: 0,
        available: 0,  // Computed after aggregation
      });
    }
    
    // Aggregate from ALL commitments (global, not just this project)
    for (const c of allCommitmentsForParts) {
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
    
    // Legacy alias for backward compatibility
    const getPartInv = (partId) => {
      const inv = partInventoryMap.get(partId);
      return {
        total_reserved: inv?.reserved_global ?? 0,
        total_covered: inv?.on_order_global ?? 0,
        total_to_order: inv?.to_order_global ?? 0,
      };
    };

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
        
        // ============================================================================
        // PHASE 2: CANONICAL INVENTORY SNAPSHOT
        // Use pre-computed global inventory map (includes ALL commitments, not just this project)
        // ============================================================================
        const partInv = partInventoryMap.get(c.part_id) || {
          physical_stock: 0,
          reserved_global: 0,
          on_order_global: 0,
          to_order_global: 0,
          available: 0,
        };
        
        const physical_stock = partInv.physical_stock;
        const reserved_global = partInv.reserved_global;
        
        // Check over-allocation at part level (using GLOBAL reserved)
        if (reserved_global > physical_stock + 0.001) {
          throw new Error(
            `OVER_ALLOCATION_VIOLATION: part=${c.part_id} physical=${physical_stock} ` +
            `reserved_global=${reserved_global} excess=${reserved_global - physical_stock}`
          );
        }

        // Calculate on-order and received from line items (commitment-scoped)
        const on_order_qty = commitmentLineItems.reduce((sum, li) => {
          const order = orderMap.get(li.order_id);
          if (order && ['Ordered', 'Partial'].includes(order.status)) {
            return sum + ((li.qty_ordered || 0) - (li.qty_received || 0));
          }
          return sum;
        }, 0);

        const received_qty = commitmentLineItems.reduce((sum, li) => sum + (li.qty_received || 0), 0);

        // Coverage status (commitment-scoped)
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

        // Determine next action and block status
        // PHASE 2: Use canonical global inventory for action determination
        const partInventoryForAction = {
          physical_stock: partInv.physical_stock,
          reserved_total: partInv.reserved_global,
          available: partInv.available,
        };
        
        const { next_action, block_reason_code } = computeNextAction(
          { required_total, reserved_from_stock, covered_from_po, qty_installed },
          !!vendor,
          partInventoryForAction,
          c // Pass raw commitment for billing flag access
        );

        // ============================================================================
        // PHASE 2B: CANONICAL INVENTORY SNAPSHOT
        // All UI views MUST use these values - NO local calculations allowed
        // UI must display BOTH global reserved AND this-project reserved
        // ============================================================================
        const inventory_snapshot = {
          // CANONICAL: Part-level physical stock (GLOBAL)
          physical_stock_global: partInv.physical_stock,
          // Deprecated aliases for backward compatibility:
          physical: partInv.physical_stock,
          physical_stock: partInv.physical_stock,
          
          // CANONICAL: GLOBAL reserved across ALL active commitments
          reserved_global_active: partInv.reserved_global,
          // Deprecated aliases:
          reserved: partInv.reserved_global,
          reserved_total: partInv.reserved_global,
          
          // CANONICAL: THIS PROJECT's reserved allocation
          reserved_this_project: reserved_from_stock,
          
          // CANONICAL: Available = physical - global reserved (can allocate more from available)
          available_global_active: partInv.available,
          // Deprecated alias:
          available: partInv.available,
          
          // CANONICAL: Global aggregates
          on_order_total: partInv.on_order_global,
          to_order_total: partInv.to_order_global,
          
          // CANONICAL: "Needed" for this commitment = required - installed
          needed: Math.max(0, required_total - qty_installed),
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
      invoice: projectInvoices.filter(inv => inv.status !== 'void').length,
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

// PHASE 9H: Strict billing gating + auto-reserve enforcement
function computeNextAction(commitment, partHasVendor, partInventory = {}, rawCommitment = {}) {
  const {
    required_total = 0,
    reserved_from_stock = 0,
    covered_from_po = 0,
    qty_installed = 0,
  } = commitment;

  const to_order = Math.max(0, required_total - reserved_from_stock - covered_from_po);
  const available_to_install = reserved_from_stock + covered_from_po - qty_installed;
  const available_stock = partInventory.available ?? 0;

  // PHASE 9H: Check billing flags for prepay requirements
  const requires_prepay = rawCommitment.requires_prepay ?? false;
  const billing_status = rawCommitment.billing_status || 'unbilled';
  
  // If requires_prepay and NOT yet invoiced/paid, block ordering
  if (requires_prepay && 
      billing_status !== 'INVOICED' && 
      billing_status !== 'invoiced' &&
      billing_status !== 'PAID' &&
      billing_status !== 'paid'
  ) {
    return { next_action: 'BLOCKED_PREPAY', block_reason_code: 'REQUIRES_PREPAY' };
  }

  // Only block: no vendor
  if (to_order > 0 && !partHasVendor) {
    return { next_action: 'FIX_VENDOR', block_reason_code: 'NO_VENDOR' };
  }

  // PHASE 9F: Only allow CREATE_PO when NO available stock remains
  // If stock is available but to_order > 0, this is a drift condition
  if (to_order > 0 && available_stock === 0) {
    // PHASE 9J: HARD INVARIANT - Prevent CREATE_PO when to_order === 0
    if (to_order === 0) {
      throw new Error(
        `INVALID_NEXT_ACTION_INVARIANT: Cannot set CREATE_PO when to_order === 0`
      );
    }
    return { next_action: 'CREATE_PO', block_reason_code: null };
  }
  
  // If covered_from_po > 0 but not enough to install, need to receive
  if (covered_from_po > 0 && available_to_install < (required_total - qty_installed)) {
    return { next_action: 'RECEIVE', block_reason_code: null };
  }
  
  // If we have stock available to install
  if (available_to_install > 0 && qty_installed < required_total) {
    return { next_action: 'INSTALL', block_reason_code: null };
  }
  
  // Check if fully installed
  if (qty_installed >= required_total && required_total > 0) {
    return { next_action: 'COMPLETE', block_reason_code: null };
  }

  return { next_action: null, block_reason_code: null };
}