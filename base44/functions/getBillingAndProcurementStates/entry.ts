import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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
    'unbilled': 'NOT_INVOICED', // Canonical from PartCommitment.billing_status
    'invoiced': 'INVOICED',
    'billed': 'INVOICED', // Alternative naming
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

/**
 * Derive canonical 3-state billing_state from normalized billing status
 * Maps: NOT_INVOICED -> NOT_INVOICED
 *       INVOICED, PARTIALLY_PAID -> INVOICED
 *       PAID -> PAID
 */
function deriveBillingState(normalizedBillingStatus) {
  if (normalizedBillingStatus === 'PAID') return 'PAID';
  if (normalizedBillingStatus === 'INVOICED' || normalizedBillingStatus === 'PARTIALLY_PAID') return 'INVOICED';
  return 'NOT_INVOICED';
}

/**
 * Compute canonical invoice eligibility contract
 * Returns: { canInvoice, block_reason_code, block_reason_text, warning_code, warning_text }
 * 
 * ============================================================================
 * PHASE 3 CANONICAL RULE: Invoice eligibility depends ONLY on remaining_to_bill
 * 
 * Block priority order (first match wins):
 * 1. archived
 * 2. financial_role === NON_BILLABLE or requires_client_billing === false
 * 3. remaining_to_bill_qty <= 0 (no outstanding qty to invoice)
 * 
 * DOES NOT GATE ON:
 * - "in stock" / "installed" status
 * - "paid" status (payment affects collectibility, not billability)
 * - "credit" allocations
 * - "balance_due" of prior invoices
 * ============================================================================
 * 
 * Non-blocking warnings:
 * - MISSING_RETAIL: unit_retail is 0 or missing (still invoiceable, just flagged)
 */
function computeInvoiceEligibility({ 
  isArchived, 
  financialRole, 
  requiresClientBilling,
  billingState, 
  outstandingAmount, 
  unitRetail,
  remainingToBillQty = null, // Phase 3: explicit qty-based check
}) {
  // Check blocking conditions in priority order
  if (isArchived) {
    return {
      canInvoice: false,
      block_reason_code: 'ARCHIVED',
      block_reason_text: 'This item is archived and cannot be invoiced.',
      warning_code: null,
      warning_text: null,
    };
  }
  
  if (financialRole === 'NON_BILLABLE' || requiresClientBilling === false) {
    return {
      canInvoice: false,
      block_reason_code: 'NON_BILLABLE',
      block_reason_text: 'This item is marked as non-billable.',
      warning_code: null,
      warning_text: null,
    };
  }
  
  // PHASE 3: Use qty-based check if available, otherwise fall back to amount
  const hasRemainingToBill = remainingToBillQty !== null 
    ? remainingToBillQty > 0 
    : outstandingAmount > 0;
  
  if (!hasRemainingToBill) {
    return {
      canInvoice: false,
      block_reason_code: 'NO_OUTSTANDING',
      block_reason_text: 'No outstanding amount to invoice.',
      warning_code: null,
      warning_text: null,
    };
  }
  
  // Eligible - check for non-blocking warnings
  let warningCode = null;
  let warningText = null;
  
  if (!unitRetail || unitRetail <= 0) {
    warningCode = 'MISSING_RETAIL';
    warningText = 'Retail price is missing or zero. Invoice will show $0.00.';
  }
  
  return {
    canInvoice: true,
    block_reason_code: null,
    block_reason_text: null,
    warning_code: warningCode,
    warning_text: warningText,
  };
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
  // PERF: Timing start
  const _perfStart = Date.now();
  
  // PERF FIX: Scope queries by project_id if provided
  const projectFilter = filters.project_id ? { project_id: filters.project_id } : {};
  const commitmentFilter = filters.project_id 
    ? { project_id: filters.project_id }
    : {};
  
  // Batch fetch - SCOPED to project when filter provided
  const [
    commitments,
    parts,
    projects,
    vendors,
    categories,
    creditLedgers,
    creditAllocations,
  ] = await Promise.all([
    Object.keys(commitmentFilter).length > 0
      ? base44.entities.PartCommitment.filter(commitmentFilter)
      : base44.entities.PartCommitment.list(),
    base44.entities.Part.list(),
    filters.project_id 
      ? base44.entities.Project.filter({ id: filters.project_id })
      : base44.entities.Project.list(),
    base44.entities.Vendor.list(),
    base44.entities.PartCategory.list(),
    filters.project_id
      ? base44.entities.ProjectCreditLedger.filter({ project_id: filters.project_id })
      : base44.entities.ProjectCreditLedger.list(),
    filters.project_id
      ? base44.entities.CreditAllocation.filter({ project_id: filters.project_id, is_reversed: false })
      : base44.entities.CreditAllocation.filter({ is_reversed: false }),
  ]);
  
  // PERF FIX: Fetch dependent entities only for relevant commitments
  const commitmentIds = commitments.map(c => c.id);
  const projectIds = [...new Set(commitments.map(c => c.project_id))];
  
  const [lineItems, batchLines, installedParts] = await Promise.all([
    commitmentIds.length > 0
      ? base44.entities.PartPurchaseLineItem.filter({ commitment_id: { $in: commitmentIds } })
      : [],
    commitmentIds.length > 0
      ? base44.entities.ProjectInvoiceLine.filter({ part_commitment_id: { $in: commitmentIds } })
      : [],
    projectIds.length > 0
      ? base44.entities.InstalledPart.filter({ project_id: { $in: projectIds } })
      : [],
  ]);
  
  // PERF FIX: Derive orders from line items (no full scan)
  const orderIds = [...new Set(lineItems.map(li => li.order_id).filter(Boolean))];
  const orders = orderIds.length > 0
    ? await base44.entities.Order.filter({ id: { $in: orderIds } })
    : [];
  
  // DEPRECATED: vendorInvoices not used in current logic
  const vendorInvoices = [];

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

  // UNIFIED: Track already-invoiced items via source_id (fallback to part_commitment_id for legacy)
  const queuedSourceIds = new Set(batchLines.map(bl => bl.source_id || bl.part_commitment_id).filter(Boolean));

  // ============================================
  // PHASE 2: Fetch services for billability
  // ============================================
  let serviceCommitments = [];
  let services = [];
  let serviceVendors = [];
  try {
    const svcFilter = filters.project_id ? { project_id: filters.project_id } : {};
    const hasServiceFilter = Object.keys(svcFilter).length > 0;
    [serviceCommitments, services, serviceVendors] = await Promise.all([
      hasServiceFilter
        ? base44.entities.ServiceCommitment.filter(svcFilter)
        : base44.entities.ServiceCommitment.list(),
      base44.entities.Service.list(),
      base44.entities.ServiceVendor.list(),
    ]);
  } catch (err) {
    console.warn('[getBillingAndProcurementStates] Service fetch failed (non-fatal):', err.message);
  }
  const serviceMap = Object.fromEntries(services.map(s => [s.id, s]));
  const serviceVendorMap = Object.fromEntries(serviceVendors.map(v => [v.id, v]));

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

    // Get pricing — CANONICAL: commitment snapshots only, no deprecated fallbacks
    const unitRetail = commitment.unit_retail_snapshot ?? 0;
    const unitCost = commitment.unit_cost_snapshot ?? 0;
    const assignedQty = commitment.required_total ?? 0;

    // PHASE 3: Calculate gross and net exposure with credit
    const grossLineTotal = assignedQty * unitRetail;
    const invoicedAmount = commitment.invoiced_amount || 0;
    const creditAppliedLine = creditByCommitment[commitment.id] || 0;
    const netLineTotal = Math.max(0, grossLineTotal - invoicedAmount - creditAppliedLine);
    
    // CANONICAL: Derive 3-state billing_state
    const billingState = deriveBillingState(clientBillingStatus);
    
    // PHASE 3: Compute remaining to bill qty from canonical fields
    const invoicedQty = commitment.invoiced_qty ?? 0;
    const remainingToBillQty = Math.max(0, assignedQty - invoicedQty);
    
    // CANONICAL: Compute invoice eligibility contract
    // Uses remaining_to_bill_qty as primary gating (not billing_state or payment status)
    const invoiceEligibility = computeInvoiceEligibility({
      isArchived: part.is_archived || false,
      financialRole,
      requiresClientBilling: part.requires_client_billing,
      billingState,
      outstandingAmount: netLineTotal,
      unitRetail,
      remainingToBillQty, // Phase 3: explicit qty-based check
    });

    // PHASE 3: Resolve vendor and category names for grouping
    const vendorId = part.default_vendor_id || null;
    const vendor = vendorId ? vendorsMap[vendorId] : null;
    const vendorName = vendor?.vendor_name || 'Unknown Vendor';
    
    const categoryId = part.part_category_id || null;
    const category = categoryId ? categoriesMap[categoryId] : null;
    const categoryName = category?.name || 'Uncategorized';

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
      // PHASE 3: Grouping fields for BillablePartsSelector
      vendor_id: vendorId,
      vendor_name: vendorName,
      default_vendor_id: vendorId,
      category_id: categoryId,
      category_name: categoryName,
      part_category_id: categoryId,
      is_archived: part.is_archived || false,
      // CANONICAL: 3-state billing model
      billing_state: billingState,
      // CANONICAL: Invoice eligibility contract
      allowed: {
        canInvoice: invoiceEligibility.canInvoice,
      },
      invoice_block_reason_code: invoiceEligibility.block_reason_code,
      invoice_block_reason_text: invoiceEligibility.block_reason_text,
      invoice_warning_code: invoiceEligibility.warning_code,
      invoice_warning_text: invoiceEligibility.warning_text,
      // CANONICAL: Outstanding amount (alias for net_line_total for clarity)
      outstanding_retail_amount: netLineTotal,
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
  const canonicalPartCommitments = allItems.map(item => {
    // PHASE 3: Compute remaining_to_bill_qty from canonical sources
    const requiredQty = item.assigned_qty || 0;
    const invoicedQty = item.invoiced_qty || 0;
    const remainingToBillQty = Math.max(0, requiredQty - invoicedQty);
    
    return {
    id: item.commitment_id || item.id,
    type: 'part',
    part_id: item.part_id,
    part_name: item.part_name,
    project_id: item.project_id,
    required_total: item.assigned_qty,
    invoiced_qty: invoicedQty, // PHASE 3: Expose for UI
    qty_remaining_to_bill: remainingToBillQty, // PHASE 3: Canonical remaining qty
    unit_retail_snapshot: item.unit_retail,
    unit_retail: item.unit_retail, // Alias for BillablePartsSelector
    unit_cost_snapshot: item.unit_cost,
    gross_exposure: item.gross_line_total || item.line_total || 0,
    gross_line_total: item.gross_line_total || item.line_total || 0, // Alias
    credit_applied: item.credit_applied_line || 0,
    credit_applied_line: item.credit_applied_line || 0, // Alias
    net_exposure: item.net_line_total || 0,
    net_line_total: item.net_line_total || 0, // Alias
    invoiced_amount: item.invoiced_amount || 0,
    billing_status: item.client_billing_status,
    client_billing_status: item.client_billing_status, // Alias
    payment_status: item.client_payment_status,
    invoice_status: item.client_billing_status === 'NOT_INVOICED' ? 'unbilled' 
                  : item.client_billing_status === 'INVOICED' ? 'invoiced' 
                  : item.client_billing_status === 'PAID' ? 'paid' 
                  : 'unbilled',
    lifecycle_category: item.lifecycle_category,
    // PHASE 3: Grouping fields for BillablePartsSelector (must be resolved)
    vendor_id: item.vendor_id || null,
    vendor_name: item.vendor_name || 'Unknown Vendor',
    default_vendor_id: item.default_vendor_id || item.vendor_id || null,
    category_id: item.category_id || null,
    category_name: item.category_name || 'Uncategorized',
    part_category_id: item.part_category_id || item.category_id || null,
    is_archived: item.is_archived || false,
    // CANONICAL: 3-state billing model
    billing_state: item.billing_state,
    // CANONICAL: Invoice eligibility contract (propagate from row)
    allowed: item.allowed || { canInvoice: true },
    invoice_block_reason_code: item.invoice_block_reason_code,
    invoice_block_reason_text: item.invoice_block_reason_text,
    invoice_warning_code: item.invoice_warning_code,
    invoice_warning_text: item.invoice_warning_text,
    // CANONICAL: Outstanding amount
    outstanding_retail_amount: item.outstanding_retail_amount || item.net_line_total || 0,
  };
  });

  // ============================================
  // PHASE 2: Build canonical service commitments for invoice modal
  // Services with status=="completed" and total_billable > 0 are ready to bill
  // ============================================
  const canonicalServiceCommitments = [];
  for (const sc of serviceCommitments) {
    const svc = serviceMap[sc.service_id];
    const vendor = sc.vendor_id ? serviceVendorMap[sc.vendor_id] : null;
    const project = projectsMap[sc.project_id];
    if (!project) continue;

    // Effective cost: total_cost > 0 ? total_cost : (actual_cost ?? estimated_cost) * quantity
    const effectiveCost = (sc.total_cost > 0) ? sc.total_cost : ((sc.actual_cost ?? sc.estimated_cost ?? 0) * (sc.quantity || 1));
    const totalBillable = sc.total_billable || 0;
    // CANONICAL: Service is billed if ANY of these are true (unified across all files)
    const isBilled = sc.is_billed === true || sc.status === 'billed' || !!sc.invoice_id;
    const isCompleted = sc.status === 'completed';
    const isReadyToBill = isCompleted && totalBillable > 0 && !isBilled;

    const serviceDisplayName = sc.description || svc?.name || 'Unknown Service';

    const serviceRow = {
      id: sc.id,
      type: 'service',
      // Canonical shape alignment: services expose part_id/part_name aliases
      // so downstream code (BillablePartsSelector, InvoiceWorkbench) can treat
      // them uniformly without branching on type.
      part_id: null,
      part_name: serviceDisplayName,
      service_id: sc.service_id,
      service_commitment_id: sc.id,
      service_name: svc?.name || 'Unknown Service',
      service_category: svc?.category || 'other',
      description: sc.description || '',
      project_id: sc.project_id,
      project_name: project.name,
      vendor_id: sc.vendor_id || null,
      vendor_name: vendor?.name || null,
      status: sc.status || 'planned',
      is_billed: isBilled,
      invoice_id: sc.invoice_id || null,
      quantity: sc.quantity || 1,
      total_cost: effectiveCost,
      total_billable: totalBillable,
      // Invoice compatibility fields (canonical shape alignment)
      unit_retail: totalBillable,
      unit_retail_snapshot: totalBillable,
      unit_cost: effectiveCost,
      unit_cost_snapshot: effectiveCost,
      required_total: 1,
      invoiced_qty: isBilled ? 1 : 0,
      qty_remaining_to_bill: isReadyToBill ? 1 : 0,
      gross_exposure: totalBillable,
      gross_line_total: totalBillable,
      credit_applied: 0,
      credit_applied_line: 0,
      net_exposure: isReadyToBill ? totalBillable : 0,
      net_line_total: isReadyToBill ? totalBillable : 0,
      invoiced_amount: isBilled ? totalBillable : 0,
      billing_status: isBilled ? 'INVOICED' : 'NOT_INVOICED',
      client_billing_status: isBilled ? 'INVOICED' : 'NOT_INVOICED',
      billing_state: isBilled ? 'INVOICED' : 'NOT_INVOICED',
      payment_status: 'UNPAID',
      invoice_status: isBilled ? 'invoiced' : 'unbilled',
      lifecycle_category: isReadyToBill ? 'INSTALLED_READY_TO_BILL' : null,
      // Grouping: use service_category as category, vendor as vendor
      category_id: svc?.category || 'service',
      category_name: svc?.category ? svc.category.charAt(0).toUpperCase() + svc.category.slice(1) : 'Service',
      part_category_id: null,
      is_archived: false,
      // Invoice eligibility
      allowed: { canInvoice: isReadyToBill },
      invoice_block_reason_code: !isReadyToBill ? (isBilled ? 'NO_OUTSTANDING' : 'NOT_COMPLETED') : null,
      invoice_block_reason_text: !isReadyToBill ? (isBilled ? 'Already billed' : 'Service not yet completed') : null,
      invoice_warning_code: null,
      invoice_warning_text: null,
      outstanding_retail_amount: isReadyToBill ? totalBillable : 0,
    };

    canonicalServiceCommitments.push(serviceRow);

    // Also add to installed_ready_to_bill bucket
    if (isReadyToBill) {
      results.installed_ready_to_bill.push({
        ...serviceRow,
        lifecycle_category: 'INSTALLED_READY_TO_BILL',
        recommended_action: 'Invoice Service',
        line_total: totalBillable,
        cost_total: effectiveCost,
      });
      kpis.installed_billing_count++;
      kpis.installed_billing_revenue += totalBillable;
    }
  }

  // Merge parts + services into unified canonical commitments
  const canonicalCommitments = [...canonicalPartCommitments, ...canonicalServiceCommitments];

  // Recompute allItems to include services added to installed_ready_to_bill
  const allItemsWithServices = [
    ...results.assigned_needs_billing,
    ...results.billed_not_paid,
    ...results.paid_ready_to_order,
    ...results.ordered_waiting_receipt,
    ...results.installed_ready_to_bill,
  ];

  // Recompute credit summary to include services
  creditSummary.gross_exposure_global = allItemsWithServices.reduce((sum, i) => sum + (i.gross_line_total || i.line_total || 0), 0);
  creditSummary.net_exposure_global = allItemsWithServices.reduce((sum, i) => sum + (i.net_line_total || i.line_total || 0), 0);

  // PHASE 1 CANONICAL: Build totals object
  const totals = {
    gross_exposure: creditSummary.gross_exposure_global,
    credit_available: creditSummary.total_credit_available,
    credit_applied_total: creditSummary.total_credit_applied,
    net_exposure: creditSummary.net_exposure_global,
    unbilled_count: results.assigned_needs_billing.length,
    unbilled_total: results.assigned_needs_billing.reduce((sum, i) => sum + (i.net_line_total || 0), 0),
    // Phase 2: Service totals
    services_ready_to_bill_count: canonicalServiceCommitments.filter(s => s.qty_remaining_to_bill > 0).length,
    services_ready_to_bill_total: canonicalServiceCommitments.filter(s => s.qty_remaining_to_bill > 0).reduce((sum, s) => sum + s.total_billable, 0),
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
    
    // HARD FIX: Guard against null/empty project_id - return safe empty response
    const project_id = payload.filters?.project_id || payload.project_id;
    if (!project_id) {
      return Response.json({
        success: false,
        error: "Missing project_id",
        totals: {
          gross_exposure: 0,
          net_exposure: 0,
          invoiced_amount: 0,
          paid_amount: 0
        },
        credit_summary: {
          total_credit_available: 0,
          total_credit_applied: 0
        },
        buckets: [],
        commitments: [],
        kpis: {},
        project_summaries: [],
      });
    }
    
    const _perfStart = Date.now();
    const result = await getBillingAndProcurementStates(base44, payload.filters || {});
    
    // PERF: Timing log
    console.log('[PERF] getBillingAndProcurementStates', Date.now() - _perfStart, 'ms', {
      project_id,
      commitmentsCount: result.commitments?.length ?? 0,
      bucketCounts: {
        assigned_needs_billing: result.assigned_needs_billing?.length ?? 0,
        billed_not_paid: result.billed_not_paid?.length ?? 0,
        paid_ready_to_order: result.paid_ready_to_order?.length ?? 0,
      }
    });
    
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