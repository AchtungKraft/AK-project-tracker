import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 7 Diagnostic — Parts Lifecycle Coverage Audit
 * 
 * Read-only diagnostic that traces each assigned part through:
 * - ProjectPart / Commitment
 * - Financial Resolver
 * - Vendor Ordering Chain
 * - Install Chain
 * - Lifecycle Classification
 * 
 * Does NOT modify any data or affect production behavior.
 */

// ============================================
// LIFECYCLE CLASSIFICATION RULES (REPLICATED FOR DIAGNOSIS)
// ============================================

const LIFECYCLE_CATEGORY = {
  ASSIGNED_NEEDS_BILLING: 'ASSIGNED_NEEDS_BILLING',
  BILLED_NOT_PAID: 'BILLED_NOT_PAID',
  PAID_READY_TO_ORDER: 'PAID_READY_TO_ORDER',
  ORDERED_WAITING_RECEIPT: 'ORDERED_WAITING_RECEIPT',
  INSTALLED_READY_TO_BILL: 'INSTALLED_READY_TO_BILL',
  UNCATEGORIZED: 'UNCATEGORIZED',
};

const BILLABLE_PART_TYPES = [
  'PURCHASED_VENDOR',
  'AK_MANUFACTURED',
  'STOCK_AK',
  'CLIENT_SUPPLIED',
  'TAKE_OFF',
];

// Financial status normalization (mirrors resolveFinancialStatus)
function normalizeClientBillingStatus(rawStatus, isBillable = true) {
  if (!isBillable) return 'NOT_BILLABLE';
  if (!rawStatus) return 'NOT_INVOICED';
  
  const statusMap = {
    'not_billable': 'NOT_BILLABLE',
    'not_invoiced': 'NOT_INVOICED',
    'not invoiced': 'NOT_INVOICED',
    'billable': 'NOT_INVOICED',
    'invoiced': 'INVOICED',
    'client invoiced': 'INVOICED',
    'client_invoiced': 'INVOICED',
    'partially_paid': 'PARTIALLY_PAID',
    'partial': 'PARTIALLY_PAID',
    'paid': 'PAID',
    'client paid': 'PAID',
    'client_paid': 'PAID',
  };
  
  return statusMap[rawStatus.toLowerCase()] || 'NOT_INVOICED';
}

function deriveClientPaymentStatus(billingStatus) {
  if (billingStatus === 'PAID') return 'PAID';
  if (billingStatus === 'PARTIALLY_PAID') return 'PARTIAL';
  return 'UNPAID';
}

function getFinancialRole(part) {
  if (!part) return 'VENDOR_MARGIN';
  if (part.requires_client_billing === false) return 'NON_BILLABLE';
  
  const roleMap = {
    'PURCHASED_VENDOR': 'VENDOR_MARGIN',
    'AK_MANUFACTURED': 'INTERNAL_MANUFACTURING',
    'CLIENT_SUPPLIED': 'LABOR_ONLY',
    'TAKE_OFF': 'ASSET_RECOVERY',
    'STOCK_AK': 'VENDOR_MARGIN',
    'WARRANTY_REPLACEMENT': 'NON_BILLABLE',
  };
  
  return roleMap[part.part_type] || 'VENDOR_MARGIN';
}

function requiresVendorPurchase(part) {
  if (!part) return false;
  if (part.requires_vendor_purchase === false) return false;
  const noVendorTypes = ['CLIENT_SUPPLIED', 'TAKE_OFF', 'WARRANTY_REPLACEMENT'];
  return !noVendorTypes.includes(part.part_type);
}

// ============================================
// CLASSIFICATION LOGIC (DIAGNOSTIC VERSION)
// ============================================

function classifyLifecycle(trace) {
  const {
    financial_role,
    client_billing_status,
    client_payment_status,
    vendor_order_status,
    has_installed_part,
    installed_qty,
    ordered_qty,
    received_qty,
    requires_vendor,
  } = trace;

  // Non-billable exclusion
  if (financial_role === 'NON_BILLABLE') {
    return { 
      category: LIFECYCLE_CATEGORY.UNCATEGORIZED, 
      reason: 'financial_role == NON_BILLABLE (excluded)' 
    };
  }

  // 1. INSTALLED_READY_TO_BILL
  if (has_installed_part && installed_qty > 0 && client_payment_status !== 'PAID') {
    return { 
      category: LIFECYCLE_CATEGORY.INSTALLED_READY_TO_BILL, 
      reason: `has_installed_part AND installed_qty=${installed_qty} AND client_payment_status=${client_payment_status}` 
    };
  }

  // 2. ORDERED_WAITING_RECEIPT
  if (vendor_order_status === 'ORDERED' && received_qty < ordered_qty) {
    return { 
      category: LIFECYCLE_CATEGORY.ORDERED_WAITING_RECEIPT, 
      reason: `vendor_order_status=ORDERED AND received_qty(${received_qty}) < ordered_qty(${ordered_qty})` 
    };
  }

  // 3. PAID_READY_TO_ORDER
  if (client_payment_status === 'PAID' && requires_vendor && vendor_order_status !== 'ORDERED') {
    return { 
      category: LIFECYCLE_CATEGORY.PAID_READY_TO_ORDER, 
      reason: `client_payment_status=PAID AND requires_vendor=true AND vendor_order_status=${vendor_order_status}` 
    };
  }

  // 4. BILLED_NOT_PAID
  if ((client_billing_status === 'INVOICED' || client_billing_status === 'PARTIALLY_PAID') && client_payment_status !== 'PAID') {
    return { 
      category: LIFECYCLE_CATEGORY.BILLED_NOT_PAID, 
      reason: `client_billing_status=${client_billing_status} AND client_payment_status=${client_payment_status}` 
    };
  }

  // 5. ASSIGNED_NEEDS_BILLING
  if (client_billing_status === 'NOT_INVOICED') {
    return { 
      category: LIFECYCLE_CATEGORY.ASSIGNED_NEEDS_BILLING, 
      reason: `client_billing_status=NOT_INVOICED` 
    };
  }

  // Fallback
  return { 
    category: LIFECYCLE_CATEGORY.UNCATEGORIZED, 
    reason: `No rule matched: billing=${client_billing_status}, payment=${client_payment_status}, vendor=${vendor_order_status}` 
  };
}

// ============================================
// FILTER SIMULATION
// ============================================

function simulateFilters(trace, part) {
  const droppedBy = [];

  // Invoice Ready filter
  if (trace.client_billing_status !== 'NOT_INVOICED') {
    droppedBy.push('invoice_ready_filter (billing_status != NOT_INVOICED)');
  }

  // Requires Vendor filter
  if (!requiresVendorPurchase(part) && trace.lifecycle_category === LIFECYCLE_CATEGORY.PAID_READY_TO_ORDER) {
    droppedBy.push('requires_vendor_purchase_filter');
  }

  // Non-billable filter
  if (trace.financial_role === 'NON_BILLABLE') {
    droppedBy.push('non_billable_exclusion');
  }

  // Billable part type filter
  if (!BILLABLE_PART_TYPES.includes(part?.part_type)) {
    droppedBy.push('billable_part_type_filter');
  }

  // Pricing missing filter
  if (!trace.unit_retail || trace.unit_retail <= 0) {
    droppedBy.push('pricing_missing_filter');
  }

  return droppedBy;
}

// ============================================
// MAIN DIAGNOSTIC FUNCTION
// ============================================

async function diagnosePartsLifecycleCoverage(base44, filters = {}) {
  const limit = filters.limit || 500;

  // Batch load all required data
  const [
    commitments,
    parts,
    projects,
    orders,
    lineItems,
    installedParts,
    vendorInvoices,
    vendorInvoiceLines,
  ] = await Promise.all([
    base44.entities.PartCommitment.filter({}),
    base44.entities.Part.filter({}),
    base44.entities.Project.filter({}),
    base44.entities.Order.filter({}),
    base44.entities.PartPurchaseLineItem.filter({}),
    base44.entities.InstalledPart.filter({}),
    base44.entities.VendorInvoice.filter({}),
    base44.entities.VendorInvoiceLineItem.filter({}),
  ]);

  // Build lookup maps
  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
  const projectsMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const ordersMap = Object.fromEntries(orders.map(o => [o.id, o]));
  const vendorInvoicesMap = Object.fromEntries(vendorInvoices.map(vi => [vi.id, vi]));

  // Build line items by part
  const lineItemsByPart = {};
  lineItems.forEach(li => {
    if (!lineItemsByPart[li.part_id]) lineItemsByPart[li.part_id] = [];
    lineItemsByPart[li.part_id].push(li);
  });

  // Build vendor invoice lines by part
  const vendorLinesByPart = {};
  vendorInvoiceLines.forEach(vil => {
    if (!vendorLinesByPart[vil.part_id]) vendorLinesByPart[vil.part_id] = [];
    vendorLinesByPart[vil.part_id].push(vil);
  });

  // Build installed parts by commitment and part+project
  const installedByCommitment = {};
  const installedByPartProject = {};
  installedParts.forEach(ip => {
    if (ip.commitment_id) {
      if (!installedByCommitment[ip.commitment_id]) installedByCommitment[ip.commitment_id] = [];
      installedByCommitment[ip.commitment_id].push(ip);
    }
    const ppKey = `${ip.part_id}:${ip.project_id}`;
    if (!installedByPartProject[ppKey]) installedByPartProject[ppKey] = [];
    installedByPartProject[ppKey].push(ip);
  });

  // Apply project filter
  let filteredCommitments = commitments;
  if (filters.project_id) {
    filteredCommitments = commitments.filter(c => c.project_id === filters.project_id);
  }
  if (filters.part_id) {
    filteredCommitments = filteredCommitments.filter(c => c.part_id === filters.part_id);
  }

  // Limit rows
  filteredCommitments = filteredCommitments.slice(0, limit);

  // Build diagnostic rows
  const rows = [];
  const totals = {
    project_parts_count: 0,
    commitments_count: commitments.length,
    installed_parts_count: installedParts.length,
    purchase_line_items_count: lineItems.length,
    resolver_records_count: 0,
    lifecycle_classified_count: 0,
    uncategorized_count: 0,
  };

  for (const commitment of filteredCommitments) {
    const part = partsMap[commitment.part_id];
    const project = projectsMap[commitment.project_id];
    
    if (!part || !project) continue;

    // Assignment layer
    const hasCommitment = true;
    const hasProjectPart = false; // Legacy - commitments are the source now

    // Vendor chain
    const partLineItems = lineItemsByPart[commitment.part_id] || [];
    const hasPurchaseLineItem = partLineItems.length > 0;
    
    const vendorLines = vendorLinesByPart[commitment.part_id] || [];
    const hasVendorInvoice = vendorLines.length > 0;

    // Order status
    let vendorOrderStatus = 'NOT_ORDERED';
    let orderedQty = 0;
    let receivedQty = 0;
    for (const li of partLineItems) {
      const order = ordersMap[li.order_id];
      if (order && ['Ordered', 'Partial', 'Received'].includes(order.status)) {
        vendorOrderStatus = 'ORDERED';
        orderedQty += li.qty_ordered || 0;
        receivedQty += li.qty_received || 0;
      }
    }

    // Installation chain
    const installedRecords = installedByCommitment[commitment.id] || 
                             installedByPartProject[`${commitment.part_id}:${commitment.project_id}`] || [];
    const hasInstalledPart = installedRecords.length > 0;
    const installedQty = installedRecords.reduce((sum, ip) => sum + (ip.qty_consumed || 0), 0);

    // Financial role and billing status
    const financialRole = getFinancialRole(part);
    
    let clientBillingStatus = 'NOT_INVOICED';
    if (commitment.billing_status) {
      clientBillingStatus = normalizeClientBillingStatus(commitment.billing_status, true);
    } else {
      for (const li of partLineItems) {
        if (li.billing_override && li.billing_status_override) {
          clientBillingStatus = normalizeClientBillingStatus(li.billing_status_override, true);
          break;
        }
        const order = ordersMap[li.order_id];
        if (order?.billing_status) {
          clientBillingStatus = normalizeClientBillingStatus(order.billing_status, true);
          break;
        }
      }
    }

    const clientPaymentStatus = deriveClientPaymentStatus(clientBillingStatus);
    const requiresVendor = requiresVendorPurchase(part);

    // Build trace object for classification
    const trace = {
      financial_role: financialRole,
      client_billing_status: clientBillingStatus,
      client_payment_status: clientPaymentStatus,
      vendor_order_status: vendorOrderStatus,
      has_installed_part: hasInstalledPart,
      installed_qty: installedQty,
      ordered_qty: orderedQty,
      received_qty: receivedQty,
      requires_vendor: requiresVendor,
      unit_retail: commitment.unit_retail_snapshot || part.default_retail || 0,
    };

    // Classify lifecycle
    const { category, reason } = classifyLifecycle(trace);

    // Missing dependencies
    const missingDependencies = [];
    if (!hasCommitment) missingDependencies.push('commitment_missing');
    if (financialRole === 'NON_BILLABLE') missingDependencies.push('non_billable_role');
    if (!BILLABLE_PART_TYPES.includes(part.part_type)) missingDependencies.push('non_billable_part_type');
    if (!trace.unit_retail || trace.unit_retail <= 0) missingDependencies.push('pricing_missing');

    // Simulate filter drops
    const droppedByFilter = simulateFilters({ ...trace, lifecycle_category: category }, part);

    // Update totals
    totals.resolver_records_count++;
    if (category !== LIFECYCLE_CATEGORY.UNCATEGORIZED) {
      totals.lifecycle_classified_count++;
    } else {
      totals.uncategorized_count++;
    }

    rows.push({
      part_id: commitment.part_id,
      part_name: part.part_name,
      part_number: part.vendor_part_number,
      part_type: part.part_type,
      project_id: commitment.project_id,
      project_name: project.name,
      commitment_id: commitment.id,

      // Assignment layer
      has_project_part: hasProjectPart,
      has_commitment: hasCommitment,

      // Vendor chain
      has_purchase_line_item: hasPurchaseLineItem,
      has_vendor_invoice: hasVendorInvoice,
      vendor_order_status: vendorOrderStatus,
      ordered_qty: orderedQty,
      received_qty: receivedQty,

      // Install chain
      has_installed_part: hasInstalledPart,
      installed_qty: installedQty,

      // Resolver data
      resolver_present: true,
      resolver_client_billing_status: clientBillingStatus,
      resolver_client_payment_status: clientPaymentStatus,
      resolver_vendor_status: vendorOrderStatus,
      resolver_margin_state: null, // Would need full resolver call
      resolver_financial_role: financialRole,

      // Classification
      lifecycle_category: category,
      classification_reason: reason,

      // Diagnostics
      missing_dependencies: missingDependencies,
      dropped_by_filter: droppedByFilter,

      // Pricing
      unit_retail: trace.unit_retail,
      unit_cost: commitment.unit_cost_snapshot || part.default_cost || 0,
      assigned_qty: commitment.qty_committed || 1,
    });
  }

  return {
    totals,
    rows,
    coverage_stats: {
      resolver_coverage_pct: totals.commitments_count > 0 
        ? Math.round((totals.resolver_records_count / Math.min(totals.commitments_count, limit)) * 100) 
        : 100,
      lifecycle_coverage_pct: totals.resolver_records_count > 0 
        ? Math.round((totals.lifecycle_classified_count / totals.resolver_records_count) * 100) 
        : 100,
    },
    last_scan_at: new Date().toISOString(),
  };
}

// ============================================
// HTTP ENDPOINT
// ============================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json().catch(() => ({}));
    const result = await diagnosePartsLifecycleCoverage(base44, payload.filters || {});
    
    return Response.json({
      success: true,
      ...result,
    });
    
  } catch (error) {
    console.error('Lifecycle diagnostic error:', error);
    return Response.json({ 
      error: error.message,
      code: 'DIAGNOSTIC_ERROR'
    }, { status: 500 });
  }
});