import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9 — Lifecycle Action Queue
 * 
 * Returns ALL commitments grouped by recommended_action.
 * This becomes the primary workflow dashboard data source.
 */

// Action group configuration
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

// Resolve lifecycle state (copied from resolvePartLifecycleState for independence)
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

async function getLifecycleActionQueue(base44, filters = {}) {
  // Batch load all required data
  const [
    commitments,
    parts,
    projects,
    orders,
    lineItems,
    installedParts,
  ] = await Promise.all([
    base44.entities.PartCommitment.filter({}),
    base44.entities.Part.filter({}),
    base44.entities.Project.filter({}),
    base44.entities.Order.filter({}),
    base44.entities.PartPurchaseLineItem.filter({}),
    base44.entities.InstalledPart.filter({}),
  ]);

  // Build lookup maps
  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
  const projectsMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const ordersMap = Object.fromEntries(orders.map(o => [o.id, o]));

  const lineItemsByPart = {};
  lineItems.forEach(li => {
    if (!lineItemsByPart[li.part_id]) lineItemsByPart[li.part_id] = [];
    lineItemsByPart[li.part_id].push(li);
  });

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

  // KPI accumulators
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

    // Apply filters
    if (filters.project_id && commitment.project_id !== filters.project_id) continue;

    const effectivePartType = getEffectivePartType(part);
    const financialRole = getFinancialRole(part, effectivePartType);
    
    // Skip non-billable by default (unless filter says otherwise)
    if (financialRole === 'NON_BILLABLE' && !filters.include_non_billable) continue;

    kpis.total_commitments++;

    // Determine client billing/payment status
    let billingStatus = 'NEEDS_BILLING';
    let paymentStatus = 'UNPAID';
    
    if (commitment.billing_status) {
      const normalized = normalizeRawBillingStatus(commitment.billing_status);
      if (normalized === 'PAID') { billingStatus = 'PAID'; paymentStatus = 'PAID'; }
      else if (normalized === 'INVOICED' || normalized === 'PARTIALLY_PAID') { billingStatus = 'INVOICED'; }
      else if (normalized === 'NOT_BILLABLE') { billingStatus = 'NOT_BILLABLE'; paymentStatus = 'PAID'; }
    } else {
      const partLineItems = lineItemsByPart[commitment.part_id] || [];
      for (const li of partLineItems) {
        const order = ordersMap[li.order_id];
        if (order?.billing_status) {
          const normalized = normalizeRawBillingStatus(order.billing_status);
          if (normalized === 'PAID') { billingStatus = 'PAID'; paymentStatus = 'PAID'; break; }
          if (normalized === 'INVOICED') { billingStatus = 'INVOICED'; break; }
        }
      }
    }

    // Determine procurement status
    const needsVendor = requiresVendorPurchase(part, effectivePartType);
    let procurementStatus = needsVendor ? 'NEEDS_ORDER' : 'NOT_REQUIRED';
    let orderedQty = 0;
    let receivedQty = 0;
    
    const partLineItems = lineItemsByPart[commitment.part_id] || [];
    for (const li of partLineItems) {
      const order = ordersMap[li.order_id];
      if (order && ['Ordered', 'Partial', 'Received'].includes(order.status)) {
        orderedQty += li.qty_ordered || 0;
        receivedQty += li.qty_received || 0;
      }
    }
    
    if (receivedQty >= (commitment.qty_committed || 1)) {
      procurementStatus = 'RECEIVED';
    } else if (receivedQty > 0) {
      procurementStatus = 'PARTIALLY_RECEIVED';
    } else if (orderedQty > 0) {
      procurementStatus = 'ORDERED';
    }

    // Determine install status
    const installedRecords = installedByCommitment[commitment.id] || 
                             installedByPartProject[`${commitment.part_id}:${commitment.project_id}`] || [];
    const installedQty = installedRecords.reduce((sum, ip) => sum + (ip.qty_consumed || 0), 0);
    const installStatus = installedQty >= (commitment.qty_committed || 1) ? 'INSTALLED' : 
                          installedQty > 0 ? 'PARTIAL' : 'PLANNED';

    // Pricing
    const unitCost = commitment.unit_cost_snapshot || part.default_cost || 0;
    const unitRetail = commitment.unit_retail_snapshot || part.default_retail || 0;
    const qtyCommitted = commitment.qty_committed || 1;
    const lineTotal = qtyCommitted * unitRetail;
    const costTotal = qtyCommitted * unitCost;

    // Determine recommended action
    let recommendedAction = 'Review Status';
    let actionPriority = 'LOW';
    let actionOwner = 'PM';
    let orderingSafety = 'RED';

    // BLOCKED: Missing pricing
    if (unitRetail <= 0) {
      recommendedAction = 'Fix Missing Data';
      actionPriority = 'HIGH';
      actionOwner = 'PM';
      kpis.blocked_count++;
    }
    // COMPLETE
    else if (installStatus === 'INSTALLED' && paymentStatus === 'PAID') {
      recommendedAction = 'Lifecycle Complete';
      actionPriority = 'NONE';
      actionOwner = null;
      orderingSafety = 'GREEN';
      kpis.complete_count++;
    }
    // NEEDS_BILLING
    else if (billingStatus === 'NEEDS_BILLING') {
      recommendedAction = 'Invoice Client';
      actionPriority = 'HIGH';
      actionOwner = 'Accounting';
      kpis.needs_billing_count++;
      kpis.needs_billing_value += lineTotal;
    }
    // INVOICED but not PAID
    else if (billingStatus === 'INVOICED' && paymentStatus !== 'PAID') {
      recommendedAction = 'Await Client Payment';
      actionPriority = 'MEDIUM';
      actionOwner = 'Accounting';
      orderingSafety = 'YELLOW';
      kpis.awaiting_payment_count++;
      kpis.awaiting_payment_value += lineTotal;
    }
    // READY_FOR_ORDER
    else if (paymentStatus === 'PAID' && procurementStatus === 'NEEDS_ORDER') {
      recommendedAction = 'Create Vendor Order';
      actionPriority = 'HIGH';
      actionOwner = 'Purchasing';
      orderingSafety = 'GREEN';
      kpis.ready_to_order_count++;
      kpis.ready_to_order_cost += costTotal;
    }
    // ORDER_IN_PROGRESS
    else if (procurementStatus === 'ORDERED' || procurementStatus === 'PARTIALLY_RECEIVED') {
      recommendedAction = 'Track Vendor Delivery';
      actionPriority = 'MEDIUM';
      actionOwner = 'Purchasing';
      orderingSafety = 'GREEN';
      kpis.orders_in_progress_count++;
    }
    // AWAITING_INSTALL
    else if ((procurementStatus === 'RECEIVED' || procurementStatus === 'NOT_REQUIRED') && 
             installStatus !== 'INSTALLED') {
      recommendedAction = 'Schedule Installation';
      actionPriority = 'MEDIUM';
      actionOwner = 'Shop';
      orderingSafety = 'GREEN';
      kpis.ready_to_install_count++;
    }

    // Build commitment row
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
      
      // Client axis
      client_billing_status: billingStatus,
      client_payment_status: paymentStatus,
      
      // Procurement axis
      procurement_status: procurementStatus,
      ordering_safety: orderingSafety,
      
      // Install axis
      install_status: installStatus,
      
      // Quantities
      assigned_qty: qtyCommitted,
      ordered_qty: orderedQty,
      received_qty: receivedQty,
      installed_qty: installedQty,
      
      // Pricing
      unit_cost: unitCost,
      unit_retail: unitRetail,
      line_total: lineTotal,
      cost_total: costTotal,
      
      // Action
      recommended_action: recommendedAction,
      action_priority: actionPriority,
      action_owner: actionOwner,
    };

    // Add to action group
    const groupConfig = ACTION_GROUPS[recommendedAction];
    if (groupConfig) {
      actionGroups[groupConfig.key].commitments.push(row);
      actionGroups[groupConfig.key].total_value += lineTotal;
      actionGroups[groupConfig.key].count++;
    }
  }

  return {
    action_groups: Object.values(actionGroups).filter(g => g.count > 0 || g.key === 'complete'),
    kpis,
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
      code: 'ACTION_QUEUE_ERROR'
    }, { status: 500 });
  }
});