import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9 — Lifecycle Engine & Action Framework
 * 
 * Centralized lifecycle resolver that replaces scattered financial and procurement logic
 * with a single source of truth and action-driven workflow.
 * 
 * Returns unified lifecycle state across 3 axes:
 * - Client (billing, payment, invoice readiness)
 * - Procurement (ordering, receiving, vendor payment)
 * - Installation (install status)
 */

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_PART_TYPE = 'PURCHASED_VENDOR';

// CLIENT AXIS STATES
const CLIENT_BILLING_STATUS = {
  NOT_BILLABLE: 'NOT_BILLABLE',
  NEEDS_BILLING: 'NEEDS_BILLING',
  INVOICED: 'INVOICED',
  PAID: 'PAID',
};

const CLIENT_PAYMENT_STATUS = {
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
};

const INVOICE_READINESS = {
  READY: 'READY',
  PARTIAL: 'PARTIAL',
  BLOCKED: 'BLOCKED',
};

// PROCUREMENT AXIS STATES
const PROCUREMENT_STATUS = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  NEEDS_ORDER: 'NEEDS_ORDER',
  ORDERED: 'ORDERED',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
};

const VENDOR_PAYMENT_STATUS = {
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
};

const ORDERING_SAFETY = {
  RED: 'RED',       // Client unpaid
  YELLOW: 'YELLOW', // Client invoiced not paid
  GREEN: 'GREEN',   // Client paid or non-billable
};

// INSTALL AXIS STATES
const INSTALL_STATUS = {
  PLANNED: 'PLANNED',
  READY: 'READY',
  INSTALLED: 'INSTALLED',
  CLOSED: 'CLOSED',
};

// OVERALL LIFECYCLE STAGES
const LIFECYCLE_STAGE = {
  BLOCKED: 'BLOCKED',
  AWAITING_CLIENT_PAYMENT: 'AWAITING_CLIENT_PAYMENT',
  READY_FOR_ORDER: 'READY_FOR_ORDER',
  ORDER_IN_PROGRESS: 'ORDER_IN_PROGRESS',
  AWAITING_INSTALL: 'AWAITING_INSTALL',
  COMPLETE: 'COMPLETE',
};

// ACTION PRIORITIES
const ACTION_PRIORITY = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  NONE: 'NONE',
};

// PRICING INTEGRITY
const PRICING_INTEGRITY = {
  OK: 'ok',
  ESTIMATED_COST: 'estimated_cost',
  MISSING_RETAIL: 'missing_retail',
  MARGIN_NEGATIVE: 'margin_negative',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function getEffectivePartType(part) {
  if (!part) return DEFAULT_PART_TYPE;
  return part.part_type || DEFAULT_PART_TYPE;
}

function getFinancialRole(part, effectivePartType) {
  if (!part) return 'VENDOR_MARGIN';
  if (part.requires_client_billing === false) return 'NON_BILLABLE';
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

function requiresVendorPurchase(part, effectivePartType) {
  if (!part) return false;
  if (part.requires_vendor_purchase === false) return false;
  const noVendorTypes = ['CLIENT_SUPPLIED', 'TAKE_OFF', 'WARRANTY_REPLACEMENT', 'AK_MANUFACTURED'];
  return !noVendorTypes.includes(effectivePartType);
}

function normalizeRawBillingStatus(rawStatus) {
  if (!rawStatus) return null;
  
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
  
  return statusMap[rawStatus.toLowerCase()] || null;
}

// ============================================
// CLIENT AXIS RESOLUTION
// ============================================

function resolveClientAxis(commitment, part, effectivePartType, dataMaps) {
  const { lineItemsByPart, ordersMap } = dataMaps;
  const financialRole = getFinancialRole(part, effectivePartType);
  
  // Non-billable parts
  if (financialRole === 'NON_BILLABLE') {
    return {
      billing_status: CLIENT_BILLING_STATUS.NOT_BILLABLE,
      payment_status: CLIENT_PAYMENT_STATUS.PAID, // Effectively "complete" for workflow
      invoice_readiness: INVOICE_READINESS.BLOCKED,
    };
  }
  
  // Determine billing status from commitment or cascading sources
  let billingStatus = CLIENT_BILLING_STATUS.NEEDS_BILLING;
  
  if (commitment.billing_status) {
    const normalized = normalizeRawBillingStatus(commitment.billing_status);
    if (normalized === 'PAID') billingStatus = CLIENT_BILLING_STATUS.PAID;
    else if (normalized === 'INVOICED' || normalized === 'PARTIALLY_PAID') billingStatus = CLIENT_BILLING_STATUS.INVOICED;
    else if (normalized === 'NOT_BILLABLE') billingStatus = CLIENT_BILLING_STATUS.NOT_BILLABLE;
    else billingStatus = CLIENT_BILLING_STATUS.NEEDS_BILLING;
  } else {
    // Fallback: Check orders via line items
    const partLineItems = lineItemsByPart[commitment.part_id] || [];
    for (const li of partLineItems) {
      if (li.billing_override && li.billing_status_override) {
        const normalized = normalizeRawBillingStatus(li.billing_status_override);
        if (normalized === 'PAID') { billingStatus = CLIENT_BILLING_STATUS.PAID; break; }
        if (normalized === 'INVOICED') { billingStatus = CLIENT_BILLING_STATUS.INVOICED; break; }
      }
      const order = ordersMap[li.order_id];
      if (order?.billing_status) {
        const normalized = normalizeRawBillingStatus(order.billing_status);
        if (normalized === 'PAID') { billingStatus = CLIENT_BILLING_STATUS.PAID; break; }
        if (normalized === 'INVOICED') { billingStatus = CLIENT_BILLING_STATUS.INVOICED; break; }
      }
    }
  }
  
  // Derive payment status
  let paymentStatus = CLIENT_PAYMENT_STATUS.UNPAID;
  if (billingStatus === CLIENT_BILLING_STATUS.PAID) paymentStatus = CLIENT_PAYMENT_STATUS.PAID;
  else if (billingStatus === CLIENT_BILLING_STATUS.INVOICED) paymentStatus = CLIENT_PAYMENT_STATUS.UNPAID;
  
  // Derive invoice readiness
  const unitRetail = commitment.unit_retail_snapshot || part?.default_retail || 0;
  let invoiceReadiness = INVOICE_READINESS.READY;
  if (billingStatus !== CLIENT_BILLING_STATUS.NEEDS_BILLING) {
    invoiceReadiness = INVOICE_READINESS.BLOCKED; // Already invoiced/paid
  } else if (unitRetail <= 0) {
    invoiceReadiness = INVOICE_READINESS.BLOCKED; // Missing pricing
  }
  
  return {
    billing_status: billingStatus,
    payment_status: paymentStatus,
    invoice_readiness: invoiceReadiness,
  };
}

// ============================================
// PROCUREMENT AXIS RESOLUTION
// ============================================

function resolveProcurementAxis(commitment, part, effectivePartType, dataMaps) {
  const { lineItemsByPart, ordersMap, vendorInvoicesMap } = dataMaps;
  const needsVendor = requiresVendorPurchase(part, effectivePartType);
  
  if (!needsVendor) {
    return {
      procurement_status: PROCUREMENT_STATUS.NOT_REQUIRED,
      vendor_payment_status: VENDOR_PAYMENT_STATUS.NOT_APPLICABLE,
      ordering_safety: ORDERING_SAFETY.GREEN,
    };
  }
  
  // Check purchase line items
  const partLineItems = lineItemsByPart[commitment.part_id] || [];
  let orderedQty = 0;
  let receivedQty = 0;
  let hasActiveOrder = false;
  let vendorInvoiceStatus = null;
  
  for (const li of partLineItems) {
    const order = ordersMap[li.order_id];
    if (order && ['Ordered', 'Partial', 'Received'].includes(order.status)) {
      hasActiveOrder = true;
      orderedQty += li.qty_ordered || 0;
      receivedQty += li.qty_received || 0;
    }
    
    // Check for vendor invoice
    for (const vi of Object.values(vendorInvoicesMap)) {
      if (vi.order_id === li.order_id) {
        vendorInvoiceStatus = vi.invoice_status;
        break;
      }
    }
  }
  
  // Determine procurement status
  let procurementStatus = PROCUREMENT_STATUS.NEEDS_ORDER;
  if (receivedQty >= (commitment.qty_committed || 1)) {
    procurementStatus = PROCUREMENT_STATUS.RECEIVED;
  } else if (receivedQty > 0) {
    procurementStatus = PROCUREMENT_STATUS.PARTIALLY_RECEIVED;
  } else if (hasActiveOrder) {
    procurementStatus = PROCUREMENT_STATUS.ORDERED;
  }
  
  // Determine vendor payment status
  let vendorPaymentStatus = VENDOR_PAYMENT_STATUS.UNPAID;
  if (vendorInvoiceStatus === 'paid') {
    vendorPaymentStatus = VENDOR_PAYMENT_STATUS.PAID;
  } else if (!hasActiveOrder) {
    vendorPaymentStatus = VENDOR_PAYMENT_STATUS.NOT_APPLICABLE;
  }
  
  return {
    procurement_status: procurementStatus,
    vendor_payment_status: vendorPaymentStatus,
    ordering_safety: null, // Set later based on client axis
    ordered_qty: orderedQty,
    received_qty: receivedQty,
  };
}

// ============================================
// INSTALLATION AXIS RESOLUTION
// ============================================

function resolveInstallAxis(commitment, dataMaps) {
  const { installedByCommitment, installedByPartProject } = dataMaps;
  
  const installedRecords = installedByCommitment[commitment.id] || 
                           installedByPartProject[`${commitment.part_id}:${commitment.project_id}`] || [];
  const installedQty = installedRecords.reduce((sum, ip) => sum + (ip.qty_consumed || 0), 0);
  const qtyCommitted = commitment.qty_committed || 1;
  
  let installStatus = INSTALL_STATUS.PLANNED;
  
  if (installedQty >= qtyCommitted) {
    installStatus = INSTALL_STATUS.INSTALLED;
  } else if (installedQty > 0) {
    installStatus = INSTALL_STATUS.READY; // Partial install
  }
  
  return {
    install_status: installStatus,
    installed_qty: installedQty,
    qty_committed: qtyCommitted,
  };
}

// ============================================
// FINANCIAL SUMMARY
// ============================================

function resolveFinancialSummary(commitment, part) {
  const unitCost = commitment.unit_cost_snapshot || part?.default_cost || 0;
  const unitRetail = commitment.unit_retail_snapshot || part?.default_retail || 0;
  
  let marginPct = 0;
  if (unitRetail > 0 && unitCost > 0) {
    marginPct = ((unitRetail - unitCost) / unitRetail) * 100;
  }
  
  let integrityStatus = PRICING_INTEGRITY.OK;
  if (unitRetail <= 0) {
    integrityStatus = PRICING_INTEGRITY.MISSING_RETAIL;
  } else if (marginPct < 0) {
    integrityStatus = PRICING_INTEGRITY.MARGIN_NEGATIVE;
  } else if (!commitment.actual_unit_cost && unitCost > 0) {
    integrityStatus = PRICING_INTEGRITY.ESTIMATED_COST;
  }
  
  return {
    unit_cost: unitCost,
    unit_retail: unitRetail,
    margin_pct: Math.round(marginPct * 100) / 100,
    integrity_status: integrityStatus,
  };
}

// ============================================
// OVERALL LIFECYCLE STAGE
// ============================================

function deriveOverallStage(clientAxis, procurementAxis, installAxis, financialSummary) {
  // BLOCKED: Missing critical data
  if (financialSummary.integrity_status === PRICING_INTEGRITY.MISSING_RETAIL) {
    return LIFECYCLE_STAGE.BLOCKED;
  }
  
  // COMPLETE: All axes are done
  if (installAxis.install_status === INSTALL_STATUS.INSTALLED && 
      clientAxis.payment_status === CLIENT_PAYMENT_STATUS.PAID) {
    return LIFECYCLE_STAGE.COMPLETE;
  }
  
  // AWAITING_INSTALL: Parts received, waiting for installation
  if (procurementAxis.procurement_status === PROCUREMENT_STATUS.RECEIVED ||
      procurementAxis.procurement_status === PROCUREMENT_STATUS.NOT_REQUIRED) {
    if (installAxis.install_status !== INSTALL_STATUS.INSTALLED) {
      return LIFECYCLE_STAGE.AWAITING_INSTALL;
    }
  }
  
  // ORDER_IN_PROGRESS: Orders placed, waiting for receipt
  if (procurementAxis.procurement_status === PROCUREMENT_STATUS.ORDERED ||
      procurementAxis.procurement_status === PROCUREMENT_STATUS.PARTIALLY_RECEIVED) {
    return LIFECYCLE_STAGE.ORDER_IN_PROGRESS;
  }
  
  // READY_FOR_ORDER: Client paid, needs vendor order
  if (clientAxis.payment_status === CLIENT_PAYMENT_STATUS.PAID &&
      procurementAxis.procurement_status === PROCUREMENT_STATUS.NEEDS_ORDER) {
    return LIFECYCLE_STAGE.READY_FOR_ORDER;
  }
  
  // AWAITING_CLIENT_PAYMENT: Invoiced or needs billing
  if (clientAxis.billing_status === CLIENT_BILLING_STATUS.INVOICED ||
      clientAxis.billing_status === CLIENT_BILLING_STATUS.NEEDS_BILLING) {
    return LIFECYCLE_STAGE.AWAITING_CLIENT_PAYMENT;
  }
  
  return LIFECYCLE_STAGE.BLOCKED;
}

// ============================================
// NEXT STEP LABELS (Phase 9.5)
// ============================================

const NEXT_STEP_LABELS = {
  NEEDS_BILLING: 'Invoice Client',
  INVOICED: 'Await Payment',
  READY_FOR_ORDER: 'Create Purchase Order',
  ORDER_IN_PROGRESS: 'Receive Part',
  AWAITING_INSTALL: 'Install Part',
  BLOCKED: 'Fix Missing Data',
  COMPLETE: 'Lifecycle Complete',
};

// ============================================
// ACTION RECOMMENDATION ENGINE
// ============================================

function deriveActionRecommendation(clientAxis, procurementAxis, installAxis, overallStage) {
  // BLOCKED
  if (overallStage === LIFECYCLE_STAGE.BLOCKED) {
    return {
      recommended_action: 'Fix Missing Data',
      action_priority: ACTION_PRIORITY.HIGH,
      action_owner: 'PM',
      next_step_label: NEXT_STEP_LABELS.BLOCKED,
      action_type: 'FIX_DATA',
    };
  }
  
  // COMPLETE
  if (overallStage === LIFECYCLE_STAGE.COMPLETE) {
    return {
      recommended_action: 'Lifecycle Complete',
      action_priority: ACTION_PRIORITY.NONE,
      action_owner: null,
      next_step_label: NEXT_STEP_LABELS.COMPLETE,
      action_type: null,
    };
  }
  
  // NEEDS_BILLING → Invoice Client
  if (clientAxis.billing_status === CLIENT_BILLING_STATUS.NEEDS_BILLING) {
    return {
      recommended_action: 'Invoice Client',
      action_priority: ACTION_PRIORITY.HIGH,
      action_owner: 'Accounting',
      next_step_label: NEXT_STEP_LABELS.NEEDS_BILLING,
      action_type: 'INVOICE_CLIENT',
    };
  }
  
  // INVOICED but not PAID → Await Payment
  if (clientAxis.billing_status === CLIENT_BILLING_STATUS.INVOICED &&
      clientAxis.payment_status !== CLIENT_PAYMENT_STATUS.PAID) {
    return {
      recommended_action: 'Await Client Payment',
      action_priority: ACTION_PRIORITY.MEDIUM,
      action_owner: 'Accounting',
      next_step_label: NEXT_STEP_LABELS.INVOICED,
      action_type: 'RECORD_PAYMENT',
    };
  }
  
  // READY_FOR_ORDER
  if (overallStage === LIFECYCLE_STAGE.READY_FOR_ORDER) {
    return {
      recommended_action: 'Create Vendor Order',
      action_priority: ACTION_PRIORITY.HIGH,
      action_owner: 'Purchasing',
      next_step_label: NEXT_STEP_LABELS.READY_FOR_ORDER,
      action_type: 'CREATE_ORDER',
    };
  }
  
  // ORDER_IN_PROGRESS
  if (overallStage === LIFECYCLE_STAGE.ORDER_IN_PROGRESS) {
    return {
      recommended_action: 'Track Vendor Delivery',
      action_priority: ACTION_PRIORITY.MEDIUM,
      action_owner: 'Purchasing',
      next_step_label: NEXT_STEP_LABELS.ORDER_IN_PROGRESS,
      action_type: 'RECEIVE_PART',
    };
  }
  
  // AWAITING_INSTALL
  if (overallStage === LIFECYCLE_STAGE.AWAITING_INSTALL) {
    return {
      recommended_action: 'Schedule Installation',
      action_priority: ACTION_PRIORITY.MEDIUM,
      action_owner: 'Shop',
      next_step_label: NEXT_STEP_LABELS.AWAITING_INSTALL,
      action_type: 'INSTALL_PART',
    };
  }
  
  return {
    recommended_action: 'Review Status',
    action_priority: ACTION_PRIORITY.LOW,
    action_owner: 'PM',
    next_step_label: 'Review Status',
    action_type: null,
  };
}

// ============================================
// ORDERING SAFETY DERIVATION
// ============================================

function deriveOrderingSafety(clientAxis, procurementAxis, effectivePartType) {
  // Non-billable or client-supplied parts are always GREEN
  if (clientAxis.billing_status === CLIENT_BILLING_STATUS.NOT_BILLABLE) {
    return ORDERING_SAFETY.GREEN;
  }
  if (effectivePartType === 'CLIENT_SUPPLIED') {
    return ORDERING_SAFETY.GREEN; // But procurement is NOT_REQUIRED anyway
  }
  
  // Payment-based safety
  if (clientAxis.payment_status === CLIENT_PAYMENT_STATUS.PAID) {
    return ORDERING_SAFETY.GREEN;
  }
  if (clientAxis.billing_status === CLIENT_BILLING_STATUS.INVOICED) {
    return ORDERING_SAFETY.YELLOW;
  }
  return ORDERING_SAFETY.RED;
}

// ============================================
// MAIN RESOLVER FUNCTION
// ============================================

async function resolvePartLifecycleStateBatch(base44, commitmentIds = null, filters = {}) {
  // Batch load all required data
  const [
    commitments,
    parts,
    projects,
    orders,
    lineItems,
    installedParts,
    vendorInvoices,
  ] = await Promise.all([
    base44.entities.PartCommitment.filter({}),
    base44.entities.Part.filter({}),
    base44.entities.Project.filter({}),
    base44.entities.Order.filter({}),
    base44.entities.PartPurchaseLineItem.filter({}),
    base44.entities.InstalledPart.filter({}),
    base44.entities.VendorInvoice.filter({}),
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

  const dataMaps = {
    partsMap,
    projectsMap,
    ordersMap,
    vendorInvoicesMap,
    lineItemsByPart,
    installedByCommitment,
    installedByPartProject,
  };

  // Filter commitments
  let targetCommitments = commitments;
  if (commitmentIds && commitmentIds.length > 0) {
    const idSet = new Set(commitmentIds);
    targetCommitments = commitments.filter(c => idSet.has(c.id));
  }
  if (filters.project_id) {
    targetCommitments = targetCommitments.filter(c => c.project_id === filters.project_id);
  }

  // Resolve each commitment
  const results = [];
  
  for (const commitment of targetCommitments) {
    const part = partsMap[commitment.part_id];
    const project = projectsMap[commitment.project_id];
    if (!part || !project) continue;

    const effectivePartType = getEffectivePartType(part);
    const financialRole = getFinancialRole(part, effectivePartType);
    
    // Skip non-billable if filter applied
    if (filters.exclude_non_billable && financialRole === 'NON_BILLABLE') continue;

    // Resolve each axis
    const clientAxis = resolveClientAxis(commitment, part, effectivePartType, dataMaps);
    const procurementAxis = resolveProcurementAxis(commitment, part, effectivePartType, dataMaps);
    const installAxis = resolveInstallAxis(commitment, dataMaps);
    const financialSummary = resolveFinancialSummary(commitment, part);

    // Derive ordering safety
    const orderingSafety = deriveOrderingSafety(clientAxis, procurementAxis, effectivePartType);
    procurementAxis.ordering_safety = orderingSafety;

    // Derive overall stage
    const overallStage = deriveOverallStage(clientAxis, procurementAxis, installAxis, financialSummary);

    // Derive action recommendation
    const actionRecommendation = deriveActionRecommendation(clientAxis, procurementAxis, installAxis, overallStage);

    results.push({
      commitment_id: commitment.id,
      part_id: commitment.part_id,
      project_id: commitment.project_id,
      part_name: part.part_name,
      part_number: part.vendor_part_number,
      project_name: project.name,
      client_name: project.client_name,
      effective_part_type: effectivePartType,
      part_type_missing: !part.part_type,
      financial_role: financialRole,
      
      lifecycle_axes: {
        client: clientAxis,
        procurement: procurementAxis,
        installation: installAxis,
      },
      
      financial_summary: financialSummary,
      
      lifecycle_overall_stage: overallStage,
      ...actionRecommendation,
      
      // Convenience fields for UI
      assigned_qty: commitment.qty_committed || 1,
      ordered_qty: procurementAxis.ordered_qty || 0,
      received_qty: procurementAxis.received_qty || 0,
      installed_qty: installAxis.installed_qty || 0,
      line_total: (commitment.qty_committed || 1) * financialSummary.unit_retail,
      cost_total: (commitment.qty_committed || 1) * financialSummary.unit_cost,
    });
  }

  return results;
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
    const commitmentIds = payload.commitment_ids || null;
    const filters = payload.filters || {};
    
    const results = await resolvePartLifecycleStateBatch(base44, commitmentIds, filters);
    
    return Response.json({
      success: true,
      count: results.length,
      results,
      resolved_at: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Lifecycle resolution error:', error);
    return Response.json({ 
      error: error.message,
      code: 'LIFECYCLE_RESOLUTION_ERROR'
    }, { status: 500 });
  }
});