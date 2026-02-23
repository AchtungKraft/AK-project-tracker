import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 7 — Billing & Procurement Lifecycle Engine
 * 
 * Returns grouped lifecycle categories:
 * - assigned_needs_billing
 * - billed_not_paid
 * - paid_ready_to_order
 * - ordered_waiting_receipt
 * - installed_ready_to_bill
 * 
 * Uses resolveFinancialStatus patterns for financial state derivation.
 */

// ============================================
// CONSTANTS
// ============================================

const ORDERING_SAFETY = {
  RED: 'RED',       // Not billed
  YELLOW: 'YELLOW', // Billed not paid
  GREEN: 'GREEN',   // Client paid
};

const LIFECYCLE_CATEGORY = {
  ASSIGNED_NEEDS_BILLING: 'ASSIGNED_NEEDS_BILLING',
  BILLED_NOT_PAID: 'BILLED_NOT_PAID',
  PAID_READY_TO_ORDER: 'PAID_READY_TO_ORDER',
  ORDERED_WAITING_RECEIPT: 'ORDERED_WAITING_RECEIPT',
  INSTALLED_READY_TO_BILL: 'INSTALLED_READY_TO_BILL',
};

// REMOVED: BILLABLE_PART_TYPES filter - now using explicit NON_BILLABLE check
// Parts with null/missing part_type default to billable behavior

const DEFAULT_PART_TYPE = 'PURCHASED_VENDOR'; // Fallback for null/missing part_type

// ============================================
// FINANCIAL STATUS HELPERS (mirrors resolveFinancialStatus)
// ============================================

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

function getEffectivePartType(part) {
  if (!part) return DEFAULT_PART_TYPE;
  return part.part_type || DEFAULT_PART_TYPE;
}

function getFinancialRole(part, effectivePartType) {
  if (!part) return 'VENDOR_MARGIN';
  if (part.requires_client_billing === false) return 'NON_BILLABLE';
  
  // Only WARRANTY_REPLACEMENT is explicitly non-billable
  if (effectivePartType === 'WARRANTY_REPLACEMENT') return 'NON_BILLABLE';
  
  const roleMap = {
    'PURCHASED_VENDOR': 'VENDOR_MARGIN',
    'AK_MANUFACTURED': 'INTERNAL_MANUFACTURING',
    'CLIENT_SUPPLIED': 'LABOR_ONLY',
    'TAKE_OFF': 'ASSET_RECOVERY',
    'STOCK_AK': 'VENDOR_MARGIN',
  };
  
  return roleMap[effectivePartType] || 'VENDOR_MARGIN';
}

function getOrderingSafety(billingStatus, paymentStatus) {
  if (paymentStatus === 'PAID') return ORDERING_SAFETY.GREEN;
  if (billingStatus === 'INVOICED' || billingStatus === 'PARTIALLY_PAID') return ORDERING_SAFETY.YELLOW;
  return ORDERING_SAFETY.RED;
}

function requiresVendorPurchase(part, effectivePartType) {
  if (!part) return false;
  if (part.requires_vendor_purchase === false) return false;
  
  // Part types that don't need vendor purchase
  const noVendorTypes = ['CLIENT_SUPPLIED', 'TAKE_OFF', 'WARRANTY_REPLACEMENT'];
  return !noVendorTypes.includes(effectivePartType);
}

function isOrderingAllowed(paymentStatus, effectivePartType) {
  // Ordering allowed when: paid AND not CLIENT_SUPPLIED AND not WARRANTY_REPLACEMENT
  if (paymentStatus !== 'PAID') return false;
  if (effectivePartType === 'CLIENT_SUPPLIED') return false;
  if (effectivePartType === 'WARRANTY_REPLACEMENT') return false;
  return true;
}

// ============================================
// MAIN LOGIC
// ============================================

async function getBillingAndProcurementStates(base44, filters = {}) {
  // Batch fetch all required data including credit allocations
  const [
    commitments,
    parts,
    projects,
    orders,
    lineItems,
    installedParts,
    vendorInvoices,
    batchLines,
    creditAllocations,
    creditLedgers,
    vendors,
    categories,
  ] = await Promise.all([
    base44.entities.PartCommitment.filter({}),
    base44.entities.Part.filter({}),
    base44.entities.Project.filter({}),
    base44.entities.Order.filter({}),
    base44.entities.PartPurchaseLineItem.filter({}),
    base44.entities.InstalledPart.filter({}),
    base44.entities.VendorInvoice.filter({}),
    base44.entities.ProjectInvoiceLine.filter({}), // PHASE 1: Use ProjectInvoiceLine instead of InvoiceBatchLine
    base44.entities.CreditAllocation.filter({ is_reversed: false }),
    base44.entities.ProjectCreditLedger.filter({}),
    base44.entities.Vendor.filter({}),
    base44.entities.PartCategory.filter({}),
  ]);

  // Build lookup maps
  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
  const projectsMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const vendorsMap = Object.fromEntries(vendors.map(v => [v.id, v]));
  const categoriesMap = Object.fromEntries(categories.map(c => [c.id, c]));
  
  // PHASE 3: Build credit allocation map by commitment
  const creditByCommitment = {};
  for (const alloc of creditAllocations) {
    if (alloc.commitment_id) {
      if (!creditByCommitment[alloc.commitment_id]) {
        creditByCommitment[alloc.commitment_id] = 0;
      }
      creditByCommitment[alloc.commitment_id] += alloc.amount_applied || 0;
    }
  }
  
  // PHASE 3: Build credit available by project
  const creditAvailableByProject = {};
  for (const ledger of creditLedgers) {
    if (!creditAvailableByProject[ledger.project_id]) {
      creditAvailableByProject[ledger.project_id] = 0;
    }
    creditAvailableByProject[ledger.project_id] += ledger.remaining_amount || 0;
  }
  const ordersMap = Object.fromEntries(orders.map(o => [o.id, o]));
  
  // Build line items by commitment
  const lineItemsByCommitment = {};
  const lineItemsByPart = {};
  lineItems.forEach(li => {
    if (li.requirement_id) {
      if (!lineItemsByCommitment[li.requirement_id]) lineItemsByCommitment[li.requirement_id] = [];
      lineItemsByCommitment[li.requirement_id].push(li);
    }
    if (!lineItemsByPart[li.part_id]) lineItemsByPart[li.part_id] = [];
    lineItemsByPart[li.part_id].push(li);
  });

  // Build installed parts by commitment
  const installedByCommitment = {};
  installedParts.forEach(ip => {
    if (ip.commitment_id) {
      if (!installedByCommitment[ip.commitment_id]) installedByCommitment[ip.commitment_id] = [];
      installedByCommitment[ip.commitment_id].push(ip);
    }
  });

  // PHASE 1: Track already-invoiced items via ProjectInvoiceLine (part_commitment_id)
  const queuedSourceIds = new Set(batchLines.map(bl => bl.part_commitment_id).filter(Boolean));

  // Result categories
  const results = {
    assigned_needs_billing: [],
    billed_not_paid: [],
    paid_ready_to_order: [],
    ordered_waiting_receipt: [],
    installed_ready_to_bill: [],
  };

  // KPI accumulators
  const kpis = {
    needs_billing_count: 0,
    needs_billing_revenue: 0,
    awaiting_payment_count: 0,
    awaiting_payment_revenue: 0,
    ready_to_order_count: 0,
    ready_to_order_cost: 0,
    orders_in_progress_count: 0,
    installed_billing_count: 0,
    installed_billing_revenue: 0,
  };

  // Process commitments as primary source
  for (const commitment of commitments) {
    const part = partsMap[commitment.part_id];
    if (!part) continue;
    
    const project = projectsMap[commitment.project_id];
    if (!project) continue;

    // Apply filters
    if (filters.project_id && commitment.project_id !== filters.project_id) continue;
    
    // REMEDIATION: Use effective part type (defaults null to PURCHASED_VENDOR)
    const effectivePartType = getEffectivePartType(part);
    const originalPartType = part.part_type; // Track original for diagnostics
    
    if (filters.part_type && effectivePartType !== filters.part_type) continue;

    const financialRole = getFinancialRole(part, effectivePartType);
    
    // REMEDIATION: Only skip explicit NON_BILLABLE role
    // Parts with null/missing part_type are now billable by default
    if (financialRole === 'NON_BILLABLE') continue;

    // Determine billing status from commitment or order
    let clientBillingStatus = 'NOT_INVOICED';
    let billingSource = 'NONE';
    
    if (commitment.billing_status) {
      clientBillingStatus = normalizeClientBillingStatus(commitment.billing_status, true);
      billingSource = 'COMMITMENT';
    }
    
    // Check orders via line items if not set
    if (clientBillingStatus === 'NOT_INVOICED') {
      const partLineItems = lineItemsByPart[commitment.part_id] || [];
      for (const li of partLineItems) {
        if (li.billing_override && li.billing_status_override) {
          clientBillingStatus = normalizeClientBillingStatus(li.billing_status_override, true);
          billingSource = 'LINE_OVERRIDE';
          break;
        }
        const order = ordersMap[li.order_id];
        if (order?.billing_status) {
          clientBillingStatus = normalizeClientBillingStatus(order.billing_status, true);
          billingSource = 'ORDER';
          break;
        }
      }
    }

    const clientPaymentStatus = deriveClientPaymentStatus(clientBillingStatus);
    const orderingSafety = getOrderingSafety(clientBillingStatus, clientPaymentStatus);

    // Determine vendor order status
    let vendorOrderStatus = 'NOT_ORDERED';
    let orderedQty = 0;
    let receivedQty = 0;
    let orderReference = null;

    const commitmentLineItems = lineItemsByCommitment[commitment.id] || lineItemsByPart[commitment.part_id] || [];
    for (const li of commitmentLineItems) {
      const order = ordersMap[li.order_id];
      if (order) {
        orderReference = order.po_number || order.id;
        if (order.status === 'Ordered' || order.status === 'Partial' || order.status === 'Received') {
          vendorOrderStatus = 'ORDERED';
          orderedQty += li.qty_ordered || 0;
          receivedQty += li.qty_received || 0;
        }
      }
    }

    // Calculate installed qty
    const installedRecords = installedByCommitment[commitment.id] || [];
    const installedQty = installedRecords.reduce((sum, ip) => sum + (ip.qty_consumed || 0), 0);

    // Get pricing
    const unitRetail = commitment.unit_retail_snapshot || part.default_retail || 0;
    const unitCost = commitment.unit_cost_snapshot || part.default_cost || 0;
    const assignedQty = commitment.qty_committed || commitment.required_total || 1;

    // PHASE 3: Calculate gross and net exposure with credit
    const grossLineTotal = assignedQty * unitRetail;
    const invoicedAmount = commitment.invoiced_amount || 0;
    const creditAppliedLine = creditByCommitment[commitment.id] || 0;
    const netLineTotal = Math.max(0, grossLineTotal - invoicedAmount - creditAppliedLine);

    // Build row object
    const row = {
      id: commitment.id,
      commitment_id: commitment.id,
      project_id: commitment.project_id,
      project_name: project.name,
      client_name: project.client_name,
      part_id: commitment.part_id,
      part_name: part.part_name,
      part_number: part.vendor_part_number,
      part_type: effectivePartType, // REMEDIATION: Use effective type
      original_part_type: originalPartType, // Track original for diagnostics
      part_type_missing: !originalPartType, // Flag for UI badge
      financial_role: financialRole,
      client_billing_status: clientBillingStatus,
      client_payment_status: clientPaymentStatus,
      vendor_order_status: vendorOrderStatus,
      order_reference: orderReference,
      assigned_qty: assignedQty,
      ordered_qty: orderedQty,
      received_qty: receivedQty,
      installed_qty: installedQty,
      unit_retail: unitRetail,
      unit_cost: unitCost,
      line_total: grossLineTotal,
      gross_line_total: grossLineTotal,
      invoiced_amount: invoicedAmount,
      credit_applied_line: creditAppliedLine,
      net_line_total: netLineTotal,
      cost_total: assignedQty * unitCost,
      ordering_safety: orderingSafety,
      ordering_allowed: isOrderingAllowed(clientPaymentStatus, effectivePartType),
      requires_vendor_purchase: requiresVendorPurchase(part, effectivePartType),
      is_queued: queuedSourceIds.has(commitment.id),
      billing_source: billingSource,
      source_type: 'commitment',
      source_id: commitment.id,
    };

    // Categorize based on lifecycle state
    // Priority order matters - check most specific first

    // 1. INSTALLED_READY_TO_BILL: Has installations, not fully paid
    if (installedQty > 0 && clientPaymentStatus !== 'PAID') {
      row.lifecycle_category = LIFECYCLE_CATEGORY.INSTALLED_READY_TO_BILL;
      row.recommended_action = 'Invoice Remaining Balance';
      results.installed_ready_to_bill.push(row);
      kpis.installed_billing_count++;
      kpis.installed_billing_revenue += row.line_total;
      continue;
    }

    // 2. ORDERED_WAITING_RECEIPT: Has orders, waiting for full receipt
    if (vendorOrderStatus === 'ORDERED' && receivedQty < orderedQty) {
      row.lifecycle_category = LIFECYCLE_CATEGORY.ORDERED_WAITING_RECEIPT;
      row.recommended_action = 'Track Shipment / Receive Inventory';
      results.ordered_waiting_receipt.push(row);
      kpis.orders_in_progress_count++;
      continue;
    }

    // 3. PAID_READY_TO_ORDER: Client paid, needs vendor order
    if (clientPaymentStatus === 'PAID' && requiresVendorPurchase(part, effectivePartType) && vendorOrderStatus !== 'ORDERED') {
      row.lifecycle_category = LIFECYCLE_CATEGORY.PAID_READY_TO_ORDER;
      row.recommended_action = 'Create Purchase Order';
      results.paid_ready_to_order.push(row);
      kpis.ready_to_order_count++;
      kpis.ready_to_order_cost += row.cost_total;
      continue;
    }

    // 4. BILLED_NOT_PAID: Invoiced but not paid
    if ((clientBillingStatus === 'INVOICED' || clientBillingStatus === 'PARTIALLY_PAID') && clientPaymentStatus !== 'PAID') {
      row.lifecycle_category = LIFECYCLE_CATEGORY.BILLED_NOT_PAID;
      row.recommended_action = 'Await Client Payment';
      results.billed_not_paid.push(row);
      kpis.awaiting_payment_count++;
      kpis.awaiting_payment_revenue += row.line_total;
      continue;
    }

    // 5. ASSIGNED_NEEDS_BILLING: Not invoiced yet
    if (clientBillingStatus === 'NOT_INVOICED') {
      row.lifecycle_category = LIFECYCLE_CATEGORY.ASSIGNED_NEEDS_BILLING;
      row.recommended_action = 'Invoice Client';
      results.assigned_needs_billing.push(row);
      kpis.needs_billing_count++;
      kpis.needs_billing_revenue += row.line_total;
      continue;
    }
  }

  // Apply financial role filter if specified
  if (filters.financial_role) {
    for (const key of Object.keys(results)) {
      results[key] = results[key].filter(r => r.financial_role === filters.financial_role);
    }
  }

  // Apply ordering safety filter if specified
  if (filters.ordering_safety) {
    for (const key of Object.keys(results)) {
      results[key] = results[key].filter(r => r.ordering_safety === filters.ordering_safety);
    }
  }

  // PHASE 3: Calculate project-level credit summary
  const allItems = [
    ...results.assigned_needs_billing,
    ...results.billed_not_paid,
    ...results.paid_ready_to_order,
    ...results.ordered_waiting_receipt,
    ...results.installed_ready_to_bill,
  ];
  
  // Group by project
  const projectSummaries = {};
  for (const item of allItems) {
    if (!projectSummaries[item.project_id]) {
      projectSummaries[item.project_id] = {
        project_id: item.project_id,
        project_name: item.project_name,
        gross_exposure: 0,
        invoiced_total: 0,
        credit_applied_total: 0,
        net_exposure: 0,
        credit_available: creditAvailableByProject[item.project_id] || 0,
      };
    }
    projectSummaries[item.project_id].gross_exposure += item.gross_line_total || item.line_total || 0;
    projectSummaries[item.project_id].invoiced_total += item.invoiced_amount || 0;
    projectSummaries[item.project_id].credit_applied_total += item.credit_applied_line || 0;
    projectSummaries[item.project_id].net_exposure += item.net_line_total || item.line_total || 0;
  }

  // Calculate global credit summary
  const creditSummary = {
    total_credit_available: creditLedgers.reduce((sum, l) => sum + (l.remaining_amount || 0), 0),
    total_credit_applied: creditAllocations.reduce((sum, a) => sum + (a.amount_applied || 0), 0),
    gross_exposure_global: allItems.reduce((sum, i) => sum + (i.gross_line_total || i.line_total || 0), 0),
    net_exposure_global: allItems.reduce((sum, i) => sum + (i.net_line_total || i.line_total || 0), 0),
  };

  // PHASE 1 CANONICAL: Build canonical commitment exposure list for invoice modal
  // This is the SINGLE SOURCE OF TRUTH for invoiceable commitments
  const canonicalCommitments = allItems.map(item => ({
    id: item.commitment_id || item.id,
    part_id: item.part_id,
    part_name: item.part_name,
    project_id: item.project_id,
    required_total: item.assigned_qty,
    unit_retail_snapshot: item.unit_retail,
    unit_cost_snapshot: item.unit_cost,
    gross_exposure: item.gross_line_total || item.line_total || 0,
    credit_applied: item.credit_applied_line || 0,
    net_exposure: item.net_line_total || 0,
    invoiced_amount: item.invoiced_amount || 0,
    billing_status: item.client_billing_status,
    payment_status: item.client_payment_status,
    invoice_status: item.client_billing_status === 'NOT_INVOICED' ? 'unbilled' 
                  : item.client_billing_status === 'INVOICED' ? 'invoiced' 
                  : item.client_billing_status === 'PAID' ? 'paid' 
                  : 'unbilled',
    invoice_id: null, // TODO: link to ProjectInvoice
    lifecycle_category: item.lifecycle_category,
    vendor_name: item.vendor_name,
    category_name: item.category_name,
  }));

  // PHASE 1 CANONICAL: Build totals object
  const totals = {
    gross_exposure: creditSummary.gross_exposure_global,
    credit_available: creditSummary.total_credit_available,
    credit_applied_total: creditSummary.total_credit_applied,
    net_exposure: creditSummary.net_exposure_global,
    unbilled_count: results.assigned_needs_billing.length,
    unbilled_total: results.assigned_needs_billing.reduce((sum, i) => sum + (i.net_line_total || 0), 0),
  };

  return {
    ...results,
    kpis,
    credit_summary: creditSummary,
    project_summaries: Object.values(projectSummaries),
    // PHASE 1 CANONICAL: New canonical outputs
    commitments: canonicalCommitments,
    totals,
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
    const result = await getBillingAndProcurementStates(base44, payload.filters || {});
    
    return Response.json({
      success: true,
      ...result,
    });
    
  } catch (error) {
    console.error('Billing & Procurement States error:', error);
    return Response.json({ 
      error: error.message,
      code: 'LIFECYCLE_ERROR'
    }, { status: 500 });
  }
});