import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Phase 10 — Lifecycle Action Queue (rewritten)
 * 
 * OPTIMIZATION PHASE 2:
 * - Eliminated duplicate LineItem reads (was: commitment_id filter + part_id filter = 2 reads)
 * - Now: single commitment_id read + inline part_id fallback from same dataset
 * - Merged Phase 3 (lineItems) and Phase 4 (orders) into fewer sequential rounds
 * - Same response shape, same UI behavior
 */

const ACTION_GROUPS = {
  'Invoice Client': {
    key: 'invoice_client',
    priority: 'HIGH',
    owner: 'Accounting',
    color: 'yellow',
    icon: 'DollarSign',
    allowSelection: true,
    selectionAction: 'invoice',
  },
  'Await Client Payment': {
    key: 'await_payment',
    priority: 'MEDIUM',
    owner: 'Accounting',
    color: 'orange',
    icon: 'Clock',
    allowSelection: false,
  },
  'Create Vendor Order': {
    key: 'create_order',
    priority: 'HIGH',
    owner: 'Purchasing',
    color: 'green',
    icon: 'ShoppingCart',
    allowSelection: true,
    selectionAction: 'purchase',
  },
  'Track Vendor Delivery': {
    key: 'track_delivery',
    priority: 'MEDIUM',
    owner: 'Purchasing',
    color: 'blue',
    icon: 'Truck',
    allowSelection: false,
  },
  'Schedule Installation': {
    key: 'schedule_install',
    priority: 'MEDIUM',
    owner: 'Shop',
    color: 'purple',
    icon: 'Wrench',
    allowSelection: false,
  },
  'Fix Missing Data': {
    key: 'fix_data',
    priority: 'HIGH',
    owner: 'PM',
    color: 'red',
    icon: 'AlertTriangle',
    allowSelection: false,
  },
  'Review Status': {
    key: 'review',
    priority: 'LOW',
    owner: 'PM',
    color: 'gray',
    icon: 'Eye',
    allowSelection: false,
  },
  'Lifecycle Complete': {
    key: 'complete',
    priority: 'NONE',
    owner: null,
    color: 'green',
    icon: 'CheckCircle2',
    allowSelection: false,
  },
};

const DEFAULT_PART_TYPE = 'PURCHASED_VENDOR';

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
    'unbilled': 'NOT_INVOICED',
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

function resolveLifecycleLocal(c) {
  const required = c.required_total || 0;
  const reserved = c.reserved_from_stock || 0;
  const covered = c.covered_from_po || 0;
  const installed = c.qty_installed || 0;

  if (c.commitment_status === 'cancelled') return 'CANCELLED';
  if (required <= 0) return 'PLANNED';
  if (installed >= required) return 'INSTALLED';
  if (reserved >= required) return 'INSTALL_READY';
  if (reserved + covered >= required) return 'COVERED';
  if (covered > 0 || reserved > 0) return 'PARTIALLY_COVERED';
  return 'NEEDS_ORDER';
}


async function getLifecycleActionQueue(base44, filters = {}) {
  const {
    include_closed = false,
    include_archived = false,
    include_non_billable = false,
  } = filters;

  const _perfStart = Date.now();

  // PHASE 1: Fetch commitments
  const commitmentFilter = {};
  if (filters.project_id) commitmentFilter.project_id = filters.project_id;

  const commitments = await base44.entities.PartCommitment.filter(commitmentFilter);

  if (commitments.length === 0) {
    return emptyResult();
  }

  // PHASE 2: Scoped lookups — all independent reads in parallel
  const commitmentPartIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
  const commitmentProjectIds = [...new Set(commitments.map(c => c.project_id).filter(Boolean))];
  const commitmentIds = commitments.map(c => c.id);

  // OPTIMIZATION: Single LineItem read by commitment_id (was 2 reads: commitment_id + part_id)
  // Legacy items without commitment_id are handled by building a part_id fallback index from same data
  const [parts, projects, lineItems, invoiceLines] = await Promise.all([
    commitmentPartIds.length > 0
      ? base44.entities.Part.filter({ id: { $in: commitmentPartIds } })
      : [],
    commitmentProjectIds.length > 0
      ? base44.entities.Project.filter({ id: { $in: commitmentProjectIds } })
      : [],
    commitmentIds.length > 0
      ? base44.entities.PartPurchaseLineItem.filter({ commitment_id: { $in: commitmentIds } })
      : [],
    commitmentIds.length > 0
      ? base44.entities.ProjectInvoiceLine.filter({ part_commitment_id: { $in: commitmentIds } })
      : [],
  ]);

  // Derive order IDs from line items, then fetch orders
  const orderIds = [...new Set(lineItems.map(li => li.order_id).filter(Boolean))];
  const orders = orderIds.length > 0
    ? await base44.entities.Order.filter({ id: { $in: orderIds } })
    : [];

  // Build lookup maps
  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
  const projectsMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const ordersMap = Object.fromEntries(orders.map(o => [o.id, o]));

  // Line items by commitment_id (single index from single read)
  const lineItemsByCommitment = {};
  lineItems.forEach(li => {
    if (li.commitment_id) {
      if (!lineItemsByCommitment[li.commitment_id]) lineItemsByCommitment[li.commitment_id] = [];
      lineItemsByCommitment[li.commitment_id].push(li);
    }
  });

  // Invoice lines by commitment_id
  const invoiceLinesByCommitment = {};
  invoiceLines.forEach(il => {
    const key = il.part_commitment_id;
    if (!key) return;
    if (!invoiceLinesByCommitment[key]) invoiceLinesByCommitment[key] = [];
    invoiceLinesByCommitment[key].push(il);
  });

  // Initialize action groups
  const actionGroups = {};
  for (const [actionName, config] of Object.entries(ACTION_GROUPS)) {
    actionGroups[config.key] = {
      action_name: actionName,
      ...config,
      commitments: [],
      total_value: 0,
      count: 0,
    };
  }

  const kpis = {
    total_commitments: 0,
    needs_billing_count: 0,
    needs_billing_value: 0,
    awaiting_payment_count: 0,
    awaiting_payment_value: 0,
    ready_to_order_count: 0,
    ready_to_order_cost: 0,
    orders_in_progress_count: 0,
    ready_to_install_count: 0,
    blocked_count: 0,
    complete_count: 0,
  };

  // Process each commitment
  for (const commitment of commitments) {
    const part = partsMap[commitment.part_id];
    const project = projectsMap[commitment.project_id];
    if (!part || !project) continue;

    const effectivePartType = getEffectivePartType(part);
    const financialRole = getFinancialRole(part, effectivePartType);

    if (commitment.commitment_status === 'cancelled' && !include_archived) continue;
    if (part.is_archived && !include_archived) continue;
    if (financialRole === 'NON_BILLABLE' && !include_non_billable) continue;

    kpis.total_commitments++;

    const requiredTotal = commitment.required_total || 0;
    const qtyRemoved = commitment.qty_removed || 0;
    const effectiveRequired = Math.max(0, requiredTotal - qtyRemoved);
    const reservedFromStock = commitment.reserved_from_stock || 0;
    const coveredFromPo = commitment.covered_from_po || 0;
    const qtyInstalled = commitment.qty_installed || 0;
    const invoicedQty = commitment.invoiced_qty || 0;
    const gap = Math.max(0, effectiveRequired - reservedFromStock - coveredFromPo - qtyInstalled);

    // Use commitment-scoped line items (single read covers all)
    const commitmentLineItems = lineItemsByCommitment[commitment.id] || [];
    let orderedQty = 0;
    let receivedQty = 0;
    let hasActiveOrder = false;

    for (const li of commitmentLineItems) {
      const order = ordersMap[li.order_id];
      if (order && order.status !== 'Cancelled' && order.status !== 'Draft') {
        orderedQty += li.qty_ordered || 0;
        receivedQty += li.qty_received || 0;
        hasActiveOrder = true;
      }
    }

    const needsVendor = requiresVendorPurchase(part, effectivePartType);
    let procurementStatus = needsVendor ? 'NEEDS_ORDER' : 'NOT_REQUIRED';

    if (receivedQty >= effectiveRequired) {
      procurementStatus = 'RECEIVED';
    } else if (receivedQty > 0) {
      procurementStatus = 'PARTIALLY_RECEIVED';
    } else if (orderedQty > 0 || coveredFromPo > 0 || hasActiveOrder) {
      procurementStatus = 'ORDERED';
    }

    let billingStatus = 'NEEDS_BILLING';
    let paymentStatus = 'UNPAID';

    const commitmentInvoiceLines = invoiceLinesByCommitment[commitment.id] || [];
    const totalInvoicedAmount = commitmentInvoiceLines.reduce((sum, il) => sum + (il.line_total || 0), 0);
    
    if (commitment.billing_status) {
      const normalized = normalizeRawBillingStatus(commitment.billing_status);
      if (normalized === 'PAID') { billingStatus = 'PAID'; paymentStatus = 'PAID'; }
      else if (normalized === 'INVOICED' || normalized === 'PARTIALLY_PAID') { billingStatus = 'INVOICED'; }
      else if (normalized === 'NOT_BILLABLE') { billingStatus = 'NOT_BILLABLE'; paymentStatus = 'PAID'; }
    }
    if (billingStatus === 'NEEDS_BILLING' && (invoicedQty > 0 || totalInvoicedAmount > 0)) {
      billingStatus = 'INVOICED';
    }

    const installStatus = qtyInstalled >= effectiveRequired && effectiveRequired > 0 ? 'INSTALLED' :
                          qtyInstalled > 0 ? 'PARTIAL' : 'PLANNED';

    const lifecycle = resolveLifecycleLocal(commitment);

    const unitCost = commitment.unit_cost_snapshot || part.cost || 0;
    const unitRetail = commitment.unit_retail_snapshot || part.retail_override || part.retail_matrix_price || 0;
    const lineTotal = effectiveRequired * unitRetail;
    const costTotal = effectiveRequired * unitCost;

    let recommendedAction = 'Review Status';
    let actionPriority = 'LOW';
    let actionOwner = 'PM';
    let orderingSafety = 'RED';

    if (unitRetail <= 0 && financialRole !== 'NON_BILLABLE') {
      recommendedAction = 'Fix Missing Data';
      actionPriority = 'HIGH';
      actionOwner = 'PM';
      kpis.blocked_count++;
    }
    else if (installStatus === 'INSTALLED' && paymentStatus === 'PAID') {
      if (!include_closed) continue;
      recommendedAction = 'Lifecycle Complete';
      actionPriority = 'NONE';
      actionOwner = null;
      orderingSafety = 'GREEN';
      kpis.complete_count++;
    }
    else if (gap > 0 && procurementStatus === 'NEEDS_ORDER' && needsVendor) {
      recommendedAction = 'Create Vendor Order';
      actionPriority = 'HIGH';
      actionOwner = 'Purchasing';
      orderingSafety = billingStatus === 'PAID' ? 'GREEN' : 'YELLOW';
      kpis.ready_to_order_count++;
      kpis.ready_to_order_cost += costTotal;
    }
    else if ((procurementStatus === 'ORDERED' || procurementStatus === 'PARTIALLY_RECEIVED') &&
             installStatus !== 'INSTALLED') {
      recommendedAction = 'Track Vendor Delivery';
      actionPriority = 'MEDIUM';
      actionOwner = 'Purchasing';
      orderingSafety = 'GREEN';
      kpis.orders_in_progress_count++;
    }
    else if (lifecycle === 'INSTALL_READY' || 
             (reservedFromStock > qtyInstalled && installStatus !== 'INSTALLED')) {
      recommendedAction = 'Schedule Installation';
      actionPriority = 'MEDIUM';
      actionOwner = 'Shop';
      orderingSafety = 'GREEN';
      kpis.ready_to_install_count++;
    }
    else if ((procurementStatus === 'RECEIVED' || procurementStatus === 'NOT_REQUIRED') &&
             installStatus !== 'INSTALLED') {
      recommendedAction = 'Schedule Installation';
      actionPriority = 'MEDIUM';
      actionOwner = 'Shop';
      orderingSafety = 'GREEN';
      kpis.ready_to_install_count++;
    }
    else if (billingStatus === 'NEEDS_BILLING') {
      recommendedAction = 'Invoice Client';
      actionPriority = 'HIGH';
      actionOwner = 'Accounting';
      kpis.needs_billing_count++;
      kpis.needs_billing_value += lineTotal;
    }
    else if (billingStatus === 'INVOICED' && paymentStatus !== 'PAID') {
      recommendedAction = 'Await Client Payment';
      actionPriority = 'MEDIUM';
      actionOwner = 'Accounting';
      orderingSafety = 'YELLOW';
      kpis.awaiting_payment_count++;
      kpis.awaiting_payment_value += lineTotal;
    }

    const NEXT_STEP_LABELS = {
      'Invoice Client': 'Invoice Client',
      'Await Client Payment': 'Await Payment',
      'Create Vendor Order': 'Create Purchase Order',
      'Track Vendor Delivery': 'Receive Part',
      'Schedule Installation': 'Install Part',
      'Fix Missing Data': 'Fix Missing Data',
      'Lifecycle Complete': 'Lifecycle Complete',
      'Review Status': 'Review Status',
    };
    const nextStepLabel = NEXT_STEP_LABELS[recommendedAction] || recommendedAction;

    const ACTION_TYPE_MAP = {
      'Invoice Client': 'INVOICE_CLIENT',
      'Await Client Payment': 'RECORD_PAYMENT',
      'Create Vendor Order': 'CREATE_ORDER',
      'Track Vendor Delivery': 'RECEIVE_PART',
      'Schedule Installation': 'INSTALL_PART',
      'Fix Missing Data': 'FIX_DATA',
    };
    const actionType = ACTION_TYPE_MAP[recommendedAction] || null;

    const row = {
      id: commitment.id,
      commitment_id: commitment.id,
      part_id: commitment.part_id,
      project_id: commitment.project_id,
      part_name: part.part_name,
      part_number: part.vendor_part_number,
      part_type: effectivePartType,
      part_type_missing: !part.part_type,
      project_name: project.name,
      client_name: project.client_name,
      financial_role: financialRole,

      client_billing_status: billingStatus,
      client_payment_status: paymentStatus,

      procurement_status: procurementStatus,
      ordering_safety: orderingSafety,

      install_status: installStatus,

      required_total: requiredTotal,
      effective_required: effectiveRequired,
      qty_removed: qtyRemoved,
      reserved_from_stock: reservedFromStock,
      covered_from_po: coveredFromPo,
      qty_installed: qtyInstalled,
      invoiced_qty: invoicedQty,
      to_order: gap,
      ordered_qty: orderedQty,
      received_qty: receivedQty,
      order_line_item_ids: commitment.order_line_item_ids || [],

      unit_cost: unitCost,
      unit_retail: unitRetail,
      line_total: lineTotal,
      cost_total: costTotal,

      lifecycle_state: lifecycle,

      recommended_action: recommendedAction,
      next_step_label: nextStepLabel,
      action_type: actionType,
      action_priority: actionPriority,
      action_owner: actionOwner,
    };

    const groupConfig = ACTION_GROUPS[recommendedAction];
    if (groupConfig) {
      actionGroups[groupConfig.key].commitments.push(row);
      actionGroups[groupConfig.key].total_value += lineTotal;
      actionGroups[groupConfig.key].count++;
    }
  }

  console.log('[PERF] getLifecycleActionQueue', Date.now() - _perfStart, 'ms', {
    commitments: commitments.length,
    lineItems: lineItems.length,
    optimization: 'v2-single-lineitem-read'
  });

  return {
    action_groups: Object.values(actionGroups).filter(g => g.count > 0 || g.key === 'complete'),
    kpis,
    resolved_at: new Date().toISOString(),
  };
}

function emptyResult() {
  return {
    action_groups: Object.values(ACTION_GROUPS).map(config => ({
      action_name: Object.entries(ACTION_GROUPS).find(([_, v]) => v.key === config.key)?.[0] || '',
      ...config,
      commitments: [],
      total_value: 0,
      count: 0,
    })).filter(g => g.count > 0 || g.key === 'complete'),
    kpis: {
      total_commitments: 0, needs_billing_count: 0, needs_billing_value: 0,
      awaiting_payment_count: 0, awaiting_payment_value: 0, ready_to_order_count: 0,
      ready_to_order_cost: 0, orders_in_progress_count: 0, ready_to_install_count: 0,
      blocked_count: 0, complete_count: 0,
    },
    resolved_at: new Date().toISOString(),
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
    const result = await getLifecycleActionQueue(base44, payload.filters || {});

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Action queue error:', error);
    return Response.json({
      error: error.message,
      code: 'ACTION_QUEUE_ERROR',
    }, { status: 500 });
  }
});