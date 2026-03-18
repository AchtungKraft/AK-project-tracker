import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 4 — Financial Exception Detection
 * 
 * Identifies financial and operational inconsistencies:
 * - Revenue leakage (installed but not billed)
 * - Cash flow risk (vendor paid, client not paid)
 * - Incomplete margin chains
 * - Inventory consumed without commitment coverage
 * 
 * Uses resolveFinancialStatus patterns - does NOT duplicate logic.
 */

// ============================================
// CONSTANTS
// ============================================

const EXCEPTION_TYPES = {
  INSTALLED_NOT_BILLED: 'INSTALLED_NOT_BILLED',
  VENDOR_PAID_CLIENT_UNPAID: 'VENDOR_PAID_CLIENT_UNPAID',
  MARGIN_INCOMPLETE: 'MARGIN_INCOMPLETE',
  INVENTORY_NO_COMMITMENT: 'INVENTORY_NO_COMMITMENT',
};

const SEVERITY = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

const BILLABLE_PART_TYPES = [
  'PURCHASED_VENDOR',
  'AK_MANUFACTURED',
  'STOCK_AK',
  'CLIENT_SUPPLIED',
  'TAKE_OFF',
];

// ============================================
// FINANCIAL STATUS NORMALIZATION
// (Mirrors resolveFinancialStatus logic for consistency)
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

function normalizeVendorInvoiceStatus(rawStatus) {
  if (!rawStatus) return 'NOT_RECEIVED';
  
  const statusMap = {
    'draft': 'NOT_RECEIVED',
    'received': 'RECEIVED',
    'approved': 'APPROVED',
    'posted': 'POSTED',
    'paid': 'PAID',
  };
  
  return statusMap[rawStatus.toLowerCase()] || 'NOT_RECEIVED';
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

function calculateMarginState(vendorPaymentStatus, clientBillingStatus, clientPaymentStatus, financialRole) {
  if (financialRole === 'NON_BILLABLE') return 'UNKNOWN';
  
  if (financialRole === 'LABOR_ONLY') {
    if (clientPaymentStatus === 'PAID') return 'COMPLETE';
    if (clientBillingStatus === 'INVOICED') return 'INVOICED_PENDING_PAYMENT';
    return 'UNKNOWN';
  }
  
  const vendorPaid = vendorPaymentStatus === 'PAID';
  const clientPaid = clientPaymentStatus === 'PAID';
  const clientInvoiced = ['INVOICED', 'PARTIALLY_PAID', 'PAID'].includes(clientBillingStatus);
  
  if (vendorPaid && clientPaid) return 'COMPLETE';
  if (vendorPaid && clientInvoiced && !clientPaid) return 'INVOICED_PENDING_PAYMENT';
  if (vendorPaid && !clientInvoiced) return 'COST_ONLY';
  if (!clientInvoiced) return 'BILLABLE_PENDING';
  
  return 'UNKNOWN';
}

// ============================================
// SEVERITY CALCULATION
// ============================================

function calculateSeverity(exceptionType, daysSinceEvent) {
  switch (exceptionType) {
    case EXCEPTION_TYPES.INSTALLED_NOT_BILLED:
      if (daysSinceEvent > 14) return SEVERITY.HIGH;
      if (daysSinceEvent > 7) return SEVERITY.MEDIUM;
      return SEVERITY.LOW;
      
    case EXCEPTION_TYPES.VENDOR_PAID_CLIENT_UNPAID:
      if (daysSinceEvent > 30) return SEVERITY.HIGH;
      if (daysSinceEvent > 14) return SEVERITY.MEDIUM;
      return SEVERITY.LOW;
      
    case EXCEPTION_TYPES.MARGIN_INCOMPLETE:
      if (daysSinceEvent > 7) return SEVERITY.MEDIUM;
      return SEVERITY.LOW;
      
    case EXCEPTION_TYPES.INVENTORY_NO_COMMITMENT:
      return SEVERITY.MEDIUM;
      
    default:
      return SEVERITY.LOW;
  }
}

function daysBetween(date1, date2) {
  if (!date1) return 0;
  const d1 = new Date(date1);
  const d2 = date2 ? new Date(date2) : new Date();
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

// ============================================
// EXCEPTION DETECTION
// ============================================

async function detectExceptions(base44, filters = {}) {
  // Fetch all required data in parallel
  const [
    installedParts,
    parts,
    projects,
    commitments,
    orders,
    lineItems,
    vendorInvoices,
    teamMembers,
  ] = await Promise.all([
    base44.entities.InstalledPart.filter({}),
    base44.entities.Part.filter({}),
    base44.entities.Project.filter({}),
    base44.entities.PartCommitment.filter({}),
    base44.entities.Order.filter({}),
    base44.entities.PartPurchaseLineItem.filter({}),
    base44.entities.VendorInvoice.filter({}),
    base44.entities.TeamMember.filter({}),
  ]);

  // Build lookup maps
  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
  const projectsMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const commitmentsMap = Object.fromEntries(commitments.map(c => [c.id, c]));
  const ordersMap = Object.fromEntries(orders.map(o => [o.id, o]));
  const vendorInvoicesMap = Object.fromEntries(vendorInvoices.map(vi => [vi.id, vi]));
  
  // Build commitment lookup by part+project
  const commitmentsByPartProject = {};
  commitments.forEach(c => {
    const key = `${c.part_id}:${c.project_id}`;
    if (!commitmentsByPartProject[key]) commitmentsByPartProject[key] = [];
    commitmentsByPartProject[key].push(c);
  });
  
  // Build line items by part
  const lineItemsByPart = {};
  lineItems.forEach(li => {
    if (!lineItemsByPart[li.part_id]) lineItemsByPart[li.part_id] = [];
    lineItemsByPart[li.part_id].push(li);
  });
  
  // Build vendor invoices by order
  const vendorInvoicesByOrder = {};
  vendorInvoices.forEach(vi => {
    if (vi.order_id) {
      vendorInvoicesByOrder[vi.order_id] = vi;
    }
  });

  const exceptions = [];
  const now = new Date();

  // ============================================
  // 1. INSTALLED BUT NOT BILLED
  // ============================================
  for (const ip of installedParts) {
    const part = partsMap[ip.part_id];
    if (!part) continue;
    
    const financialRole = getFinancialRole(part);
    if (financialRole === 'NON_BILLABLE') continue;
    if (!BILLABLE_PART_TYPES.includes(part.part_type)) continue;
    
    // Find billing status through commitment or order
    let clientBillingStatus = 'NOT_INVOICED';
    let billingSource = 'NONE';
    
    // Check commitment
    if (ip.commitment_id && commitmentsMap[ip.commitment_id]) {
      const commitment = commitmentsMap[ip.commitment_id];
      if (commitment.billing_status) {
        clientBillingStatus = normalizeClientBillingStatus(commitment.billing_status, true);
        billingSource = 'COMMITMENT';
      }
    }
    
    // Check orders via line items
    if (clientBillingStatus === 'NOT_INVOICED') {
      const partLineItems = lineItemsByPart[ip.part_id] || [];
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
    
    if (clientBillingStatus === 'NOT_INVOICED') {
      const project = projectsMap[ip.project_id];
      const daysSinceInstall = daysBetween(ip.installed_date, now);
      
      exceptions.push({
        type: EXCEPTION_TYPES.INSTALLED_NOT_BILLED,
        severity: calculateSeverity(EXCEPTION_TYPES.INSTALLED_NOT_BILLED, daysSinceInstall),
        part_id: ip.part_id,
        part_name: part.part_name,
        project_id: ip.project_id,
        project_name: project?.name || 'Unknown',
        installed_qty: ip.qty_consumed,
        installed_date: ip.installed_date,
        days_since_event: daysSinceInstall,
        financial_role: financialRole,
        client_billing_status: clientBillingStatus,
        installed_part_id: ip.id,
        commitment_id: ip.commitment_id,
        task_id: ip.task_id,
      });
    }
  }

  // ============================================
  // 2. VENDOR PAID BUT CLIENT NOT PAID
  // ============================================
  for (const vi of vendorInvoices) {
    if (vi.invoice_status !== 'paid') continue;
    
    const order = ordersMap[vi.order_id];
    if (!order) continue;
    
    const clientBillingStatus = normalizeClientBillingStatus(order.billing_status, true);
    const clientPaymentStatus = clientBillingStatus === 'PAID' ? 'PAID' : 
                                clientBillingStatus === 'PARTIALLY_PAID' ? 'PARTIAL' : 'UNPAID';
    
    if (clientPaymentStatus !== 'PAID') {
      // Find parts on this order
      const orderLineItems = lineItems.filter(li => li.order_id === order.id);
      const daysSinceVendorPaid = daysBetween(vi.posted_at || vi.invoice_date, now);
      
      for (const li of orderLineItems) {
        const part = partsMap[li.part_id];
        if (!part) continue;
        
        const project = projectsMap[li.project_id];
        
        exceptions.push({
          type: EXCEPTION_TYPES.VENDOR_PAID_CLIENT_UNPAID,
          severity: calculateSeverity(EXCEPTION_TYPES.VENDOR_PAID_CLIENT_UNPAID, daysSinceVendorPaid),
          part_id: li.part_id,
          part_name: part.part_name,
          project_id: li.project_id,
          project_name: project?.name || 'Unknown',
          vendor_cost: li.line_total || (li.qty_ordered * li.unit_price),
          client_billing_status: clientBillingStatus,
          client_payment_status: clientPaymentStatus,
          days_since_event: daysSinceVendorPaid,
          financial_role: getFinancialRole(part),
          vendor_invoice_id: vi.id,
          order_id: order.id,
          line_item_id: li.id,
        });
      }
    }
  }

  // ============================================
  // 3. MARGIN INCOMPLETE
  // ============================================
  const processedPartProjects = new Set();
  
  for (const ip of installedParts) {
    const key = `${ip.part_id}:${ip.project_id}`;
    if (processedPartProjects.has(key)) continue;
    processedPartProjects.add(key);
    
    const part = partsMap[ip.part_id];
    if (!part) continue;
    
    const financialRole = getFinancialRole(part);
    if (financialRole === 'NON_BILLABLE') continue;
    
    // Determine statuses
    let vendorPaymentStatus = 'UNPAID';
    let clientBillingStatus = 'NOT_INVOICED';
    let clientPaymentStatus = 'UNPAID';
    
    // Check vendor invoice status
    const partLineItems = lineItemsByPart[ip.part_id] || [];
    for (const li of partLineItems) {
      const vi = vendorInvoicesByOrder[li.order_id];
      if (vi?.invoice_status === 'paid') {
        vendorPaymentStatus = 'PAID';
        break;
      }
    }
    
    // Check client billing
    if (ip.commitment_id && commitmentsMap[ip.commitment_id]) {
      const commitment = commitmentsMap[ip.commitment_id];
      if (commitment.billing_status) {
        clientBillingStatus = normalizeClientBillingStatus(commitment.billing_status, true);
      }
    }
    
    if (clientBillingStatus === 'NOT_INVOICED') {
      for (const li of partLineItems) {
        const order = ordersMap[li.order_id];
        if (order?.billing_status) {
          clientBillingStatus = normalizeClientBillingStatus(order.billing_status, true);
          break;
        }
      }
    }
    
    clientPaymentStatus = clientBillingStatus === 'PAID' ? 'PAID' : 
                          clientBillingStatus === 'PARTIALLY_PAID' ? 'PARTIAL' : 'UNPAID';
    
    const marginState = calculateMarginState(vendorPaymentStatus, clientBillingStatus, clientPaymentStatus, financialRole);
    
    if (marginState !== 'COMPLETE' && marginState !== 'UNKNOWN') {
      const project = projectsMap[ip.project_id];
      const daysSinceInstall = daysBetween(ip.installed_date, now);
      
      exceptions.push({
        type: EXCEPTION_TYPES.MARGIN_INCOMPLETE,
        severity: calculateSeverity(EXCEPTION_TYPES.MARGIN_INCOMPLETE, daysSinceInstall),
        part_id: ip.part_id,
        part_name: part.part_name,
        project_id: ip.project_id,
        project_name: project?.name || 'Unknown',
        margin_state: marginState,
        vendor_payment_status: vendorPaymentStatus,
        client_billing_status: clientBillingStatus,
        financial_role: financialRole,
        days_since_event: daysSinceInstall,
        installed_part_id: ip.id,
      });
    }
  }

  // ============================================
  // 4. INVENTORY CONSUMED WITHOUT COMMITMENT
  // ============================================
  for (const ip of installedParts) {
    const part = partsMap[ip.part_id];
    if (!part) continue;
    
    const financialRole = getFinancialRole(part);
    if (financialRole === 'NON_BILLABLE') continue;
    if (!BILLABLE_PART_TYPES.includes(part.part_type)) continue;
    
    // Check if there's a linked commitment
    const hasCommitment = ip.commitment_id || 
      (commitmentsByPartProject[`${ip.part_id}:${ip.project_id}`]?.length > 0);
    
    if (!hasCommitment) {
      const project = projectsMap[ip.project_id];
      
      exceptions.push({
        type: EXCEPTION_TYPES.INVENTORY_NO_COMMITMENT,
        severity: SEVERITY.MEDIUM,
        part_id: ip.part_id,
        part_name: part.part_name,
        project_id: ip.project_id,
        project_name: project?.name || 'Unknown',
        installed_qty: ip.qty_consumed,
        installed_date: ip.installed_date,
        task_id: ip.task_id,
        installed_part_id: ip.id,
      });
    }
  }

  // ============================================
  // APPLY FILTERS
  // ============================================
  let filtered = exceptions;
  
  if (filters.project_id) {
    filtered = filtered.filter(e => e.project_id === filters.project_id);
  }
  if (filters.exception_type) {
    filtered = filtered.filter(e => e.type === filters.exception_type);
  }
  if (filters.severity) {
    filtered = filtered.filter(e => e.severity === filters.severity);
  }
  if (filters.financial_role) {
    filtered = filtered.filter(e => e.financial_role === filters.financial_role);
  }

  // ============================================
  // CALCULATE KPIs
  // ============================================
  const kpis = {
    total_exceptions: filtered.length,
    by_type: {
      installed_not_billed: filtered.filter(e => e.type === EXCEPTION_TYPES.INSTALLED_NOT_BILLED).length,
      vendor_paid_client_unpaid: filtered.filter(e => e.type === EXCEPTION_TYPES.VENDOR_PAID_CLIENT_UNPAID).length,
      margin_incomplete: filtered.filter(e => e.type === EXCEPTION_TYPES.MARGIN_INCOMPLETE).length,
      inventory_no_commitment: filtered.filter(e => e.type === EXCEPTION_TYPES.INVENTORY_NO_COMMITMENT).length,
    },
    by_severity: {
      high: filtered.filter(e => e.severity === SEVERITY.HIGH).length,
      medium: filtered.filter(e => e.severity === SEVERITY.MEDIUM).length,
      low: filtered.filter(e => e.severity === SEVERITY.LOW).length,
    },
    estimated_unbilled_revenue: 0, // Would need pricing data
    vendor_cost_exposure: filtered
      .filter(e => e.type === EXCEPTION_TYPES.VENDOR_PAID_CLIENT_UNPAID)
      .reduce((sum, e) => sum + (e.vendor_cost || 0), 0),
    margin_completion_rate: processedPartProjects.size > 0 
      ? Math.round((1 - (filtered.filter(e => e.type === EXCEPTION_TYPES.MARGIN_INCOMPLETE).length / processedPartProjects.size)) * 100)
      : 100,
  };

  return {
    exceptions: filtered,
    kpis,
    last_scan_at: now.toISOString(),
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
    
    const result = await detectExceptions(base44, payload.filters || {});
    
    return Response.json({
      success: true,
      ...result,
    });
    
  } catch (error) {
    console.error('Financial exception detection error:', error);
    return Response.json({ 
      error: error.message,
      code: 'EXCEPTION_DETECTION_ERROR'
    }, { status: 500 });
  }
});