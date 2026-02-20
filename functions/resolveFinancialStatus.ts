import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 3.1 — Financial Resolution Layer
 * 
 * Centralized, read-only financial resolution service that consolidates:
 * - Order.billing_status
 * - PartPurchaseLineItem.billing_status_override
 * - VendorInvoice.invoice_status
 * - Commitment payment/billing status
 * - Part type financial behavior
 * 
 * Returns normalized financial status objects for UI consumption.
 * DOES NOT modify any accounting data.
 */

// ============================================
// ENUMS & CONSTANTS
// ============================================

const CLIENT_BILLING_STATUS = {
  NOT_BILLABLE: 'NOT_BILLABLE',
  NOT_INVOICED: 'NOT_INVOICED',
  INVOICED: 'INVOICED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
};

const CLIENT_PAYMENT_STATUS = {
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
};

const VENDOR_INVOICE_STATUS = {
  NOT_RECEIVED: 'NOT_RECEIVED',
  RECEIVED: 'RECEIVED',
  APPROVED: 'APPROVED',
  POSTED: 'POSTED',
  PAID: 'PAID',
};

const VENDOR_PAYMENT_STATUS = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
};

const FINANCIAL_ROLE = {
  VENDOR_MARGIN: 'VENDOR_MARGIN',
  INTERNAL_MANUFACTURING: 'INTERNAL_MANUFACTURING',
  LABOR_ONLY: 'LABOR_ONLY',
  ASSET_RECOVERY: 'ASSET_RECOVERY',
  NON_BILLABLE: 'NON_BILLABLE',
};

const MARGIN_STATE = {
  UNKNOWN: 'UNKNOWN',
  COST_ONLY: 'COST_ONLY',
  BILLABLE_PENDING: 'BILLABLE_PENDING',
  INVOICED_PENDING_PAYMENT: 'INVOICED_PENDING_PAYMENT',
  COMPLETE: 'COMPLETE',
};

const BILLING_SOURCE = {
  LINE_OVERRIDE: 'LINE_OVERRIDE',
  ORDER: 'ORDER',
  COMMITMENT: 'COMMITMENT',
  NONE: 'NONE',
};

const VENDOR_SOURCE = {
  VENDOR_INVOICE: 'VENDOR_INVOICE',
  NONE: 'NONE',
};

// Part type to financial role mapping
const PART_TYPE_ROLE_MAP = {
  'PURCHASED_VENDOR': FINANCIAL_ROLE.VENDOR_MARGIN,
  'AK_MANUFACTURED': FINANCIAL_ROLE.INTERNAL_MANUFACTURING,
  'CLIENT_SUPPLIED': FINANCIAL_ROLE.LABOR_ONLY,
  'TAKE_OFF': FINANCIAL_ROLE.ASSET_RECOVERY,
  'STOCK_AK': FINANCIAL_ROLE.VENDOR_MARGIN,
  'WARRANTY_REPLACEMENT': FINANCIAL_ROLE.NON_BILLABLE,
};

// ============================================
// NORMALIZATION HELPERS
// ============================================

/**
 * Normalize raw billing status to enum
 */
function normalizeClientBillingStatus(rawStatus, isBillable = true) {
  if (!isBillable) return CLIENT_BILLING_STATUS.NOT_BILLABLE;
  if (!rawStatus) return CLIENT_BILLING_STATUS.NOT_INVOICED;
  
  const statusMap = {
    'not_billable': CLIENT_BILLING_STATUS.NOT_BILLABLE,
    'not_invoiced': CLIENT_BILLING_STATUS.NOT_INVOICED,
    'not invoiced': CLIENT_BILLING_STATUS.NOT_INVOICED,
    'billable': CLIENT_BILLING_STATUS.NOT_INVOICED,
    'invoiced': CLIENT_BILLING_STATUS.INVOICED,
    'client invoiced': CLIENT_BILLING_STATUS.INVOICED,
    'client_invoiced': CLIENT_BILLING_STATUS.INVOICED,
    'partially_paid': CLIENT_BILLING_STATUS.PARTIALLY_PAID,
    'partial': CLIENT_BILLING_STATUS.PARTIALLY_PAID,
    'paid': CLIENT_BILLING_STATUS.PAID,
    'client paid': CLIENT_BILLING_STATUS.PAID,
    'client_paid': CLIENT_BILLING_STATUS.PAID,
  };
  
  return statusMap[rawStatus.toLowerCase()] || CLIENT_BILLING_STATUS.NOT_INVOICED;
}

/**
 * Normalize vendor invoice status to enum
 */
function normalizeVendorInvoiceStatus(rawStatus) {
  if (!rawStatus) return VENDOR_INVOICE_STATUS.NOT_RECEIVED;
  
  const statusMap = {
    'draft': VENDOR_INVOICE_STATUS.NOT_RECEIVED,
    'received': VENDOR_INVOICE_STATUS.RECEIVED,
    'approved': VENDOR_INVOICE_STATUS.APPROVED,
    'posted': VENDOR_INVOICE_STATUS.POSTED,
    'paid': VENDOR_INVOICE_STATUS.PAID,
  };
  
  return statusMap[rawStatus.toLowerCase()] || VENDOR_INVOICE_STATUS.NOT_RECEIVED;
}

/**
 * Derive vendor payment status from invoice status
 */
function deriveVendorPaymentStatus(invoiceStatus) {
  return invoiceStatus === VENDOR_INVOICE_STATUS.PAID 
    ? VENDOR_PAYMENT_STATUS.PAID 
    : VENDOR_PAYMENT_STATUS.UNPAID;
}

/**
 * Derive client payment status
 */
function deriveClientPaymentStatus(billingStatus) {
  if (billingStatus === CLIENT_BILLING_STATUS.PAID) {
    return CLIENT_PAYMENT_STATUS.PAID;
  }
  if (billingStatus === CLIENT_BILLING_STATUS.PARTIALLY_PAID) {
    return CLIENT_PAYMENT_STATUS.PARTIAL;
  }
  return CLIENT_PAYMENT_STATUS.UNPAID;
}

/**
 * Get financial role from part type
 */
function getFinancialRole(part) {
  if (!part) return FINANCIAL_ROLE.VENDOR_MARGIN;
  
  // Check explicit flags first
  if (part.requires_client_billing === false) {
    return FINANCIAL_ROLE.NON_BILLABLE;
  }
  
  // Map from part type
  const role = PART_TYPE_ROLE_MAP[part.part_type];
  return role || FINANCIAL_ROLE.VENDOR_MARGIN;
}

/**
 * Calculate margin state based on financial chain
 */
function calculateMarginState(vendorPaymentStatus, clientBillingStatus, clientPaymentStatus, financialRole) {
  // Non-billable parts have no margin chain
  if (financialRole === FINANCIAL_ROLE.NON_BILLABLE) {
    return MARGIN_STATE.UNKNOWN;
  }
  
  // Labor-only has no vendor cost chain
  if (financialRole === FINANCIAL_ROLE.LABOR_ONLY) {
    if (clientPaymentStatus === CLIENT_PAYMENT_STATUS.PAID) {
      return MARGIN_STATE.COMPLETE;
    }
    if (clientBillingStatus === CLIENT_BILLING_STATUS.INVOICED) {
      return MARGIN_STATE.INVOICED_PENDING_PAYMENT;
    }
    if (clientBillingStatus !== CLIENT_BILLING_STATUS.NOT_BILLABLE && 
        clientBillingStatus !== CLIENT_BILLING_STATUS.NOT_INVOICED) {
      return MARGIN_STATE.BILLABLE_PENDING;
    }
    return MARGIN_STATE.UNKNOWN;
  }
  
  const vendorPaid = vendorPaymentStatus === VENDOR_PAYMENT_STATUS.PAID;
  const clientPaid = clientPaymentStatus === CLIENT_PAYMENT_STATUS.PAID;
  const clientInvoiced = clientBillingStatus === CLIENT_BILLING_STATUS.INVOICED || 
                         clientBillingStatus === CLIENT_BILLING_STATUS.PARTIALLY_PAID ||
                         clientBillingStatus === CLIENT_BILLING_STATUS.PAID;
  const isBillable = clientBillingStatus !== CLIENT_BILLING_STATUS.NOT_BILLABLE;
  
  // Complete: both vendor paid and client paid
  if (vendorPaid && clientPaid) {
    return MARGIN_STATE.COMPLETE;
  }
  
  // Invoiced pending payment: vendor paid, client invoiced but not fully paid
  if (vendorPaid && clientInvoiced && !clientPaid) {
    return MARGIN_STATE.INVOICED_PENDING_PAYMENT;
  }
  
  // Cost only: vendor cost exists but not yet billed to client
  if (vendorPaid && !clientInvoiced && isBillable) {
    return MARGIN_STATE.COST_ONLY;
  }
  
  // Billable pending: billable but not yet invoiced
  if (isBillable && !clientInvoiced) {
    return MARGIN_STATE.BILLABLE_PENDING;
  }
  
  return MARGIN_STATE.UNKNOWN;
}

// ============================================
// RESOLUTION LOGIC
// ============================================

/**
 * Resolve financial status for a single context
 * Uses preloaded data maps to avoid N+1 queries
 * 
 * FORWARD MODEL: If project.financial_model_version === 'forward',
 * billing status is derived ONLY from InvoiceBatch (ClientInvoice).
 * Legacy cascading precedence is skipped.
 */
function resolveForContext(context, dataMaps) {
  const { part_id, project_id, purchase_line_item_id, commitment_id } = context;
  const { partsMap, lineItemsMap, ordersMap, commitmentsMap, vendorInvoicesMap, projectsMap, invoiceBatchLinesMap, invoiceBatchesMap } = dataMaps;
  
  const part = partsMap[part_id];
  const financialRole = getFinancialRole(part);
  const project = projectsMap?.[project_id];
  
  // Initialize result
  const result = {
    part_id,
    project_id: project_id || null,
    purchase_line_item_id: purchase_line_item_id || null,
    commitment_id: commitment_id || null,
    client_billing_status: CLIENT_BILLING_STATUS.NOT_INVOICED,
    client_payment_status: CLIENT_PAYMENT_STATUS.UNPAID,
    vendor_invoice_status: VENDOR_INVOICE_STATUS.NOT_RECEIVED,
    vendor_payment_status: VENDOR_PAYMENT_STATUS.UNPAID,
    commitment_status: null,
    financial_role: financialRole,
    margin_state: MARGIN_STATE.UNKNOWN,
    billing_source: BILLING_SOURCE.NONE,
    vendor_source: VENDOR_SOURCE.NONE,
    financial_model: project?.financial_model_version || 'legacy',
    last_updated_at: new Date().toISOString(),
  };
  
  // Check if part is billable
  const isBillable = part?.requires_client_billing !== false;
  
  // ============================================
  // FORWARD MODEL: Derive billing ONLY from InvoiceBatch (ClientInvoice)
  // ============================================
  if (project?.financial_model_version === 'forward') {
    result.billing_source = 'CLIENT_INVOICE';
    
    // Find InvoiceBatchLine for this commitment
    let batchLine = null;
    let batch = null;
    
    if (commitment_id && invoiceBatchLinesMap) {
      for (const line of Object.values(invoiceBatchLinesMap)) {
        if (line.commitment_id === commitment_id && line.qb_status !== 'voided') {
          batchLine = line;
          batch = invoiceBatchesMap?.[line.batch_id];
          break;
        }
      }
    }
    
    if (batch) {
      // Map InvoiceBatch.status to billing status
      switch (batch.status) {
        case 'paid':
          result.client_billing_status = CLIENT_BILLING_STATUS.PAID;
          result.client_payment_status = CLIENT_PAYMENT_STATUS.PAID;
          break;
        case 'invoiced':
        case 'exported':
          result.client_billing_status = CLIENT_BILLING_STATUS.INVOICED;
          result.client_payment_status = CLIENT_PAYMENT_STATUS.UNPAID;
          break;
        case 'voided':
          result.client_billing_status = CLIENT_BILLING_STATUS.NOT_INVOICED;
          result.client_payment_status = CLIENT_PAYMENT_STATUS.UNPAID;
          break;
        default:
          result.client_billing_status = CLIENT_BILLING_STATUS.NOT_INVOICED;
      }
    } else {
      // No invoice batch line = not invoiced
      result.client_billing_status = isBillable ? CLIENT_BILLING_STATUS.NOT_INVOICED : CLIENT_BILLING_STATUS.NOT_BILLABLE;
    }
    
    // FORWARD MODEL: Skip vendor invoice status (PO = paid at order)
    result.vendor_invoice_status = VENDOR_INVOICE_STATUS.NOT_RECEIVED;
    result.vendor_payment_status = VENDOR_PAYMENT_STATUS.PAID; // Assume paid at order
    
    // Calculate margin state for forward model
    result.margin_state = calculateMarginState(
      result.vendor_payment_status,
      result.client_billing_status,
      result.client_payment_status,
      financialRole
    );
    
    // Get commitment status if available
    if (commitment_id) {
      const commitment = commitmentsMap[commitment_id];
      result.commitment_status = commitment?.commitment_status;
    }
    
    return result;
  }
  
  // ============================================
  // LEGACY MODEL: Cascading precedence (original logic)
  // ============================================
  
  let billingResolved = false;
  
  // 1. Check line item override
  if (purchase_line_item_id) {
    const lineItem = lineItemsMap[purchase_line_item_id];
    if (lineItem?.billing_override && lineItem.billing_status_override) {
      result.client_billing_status = normalizeClientBillingStatus(lineItem.billing_status_override, isBillable);
      result.billing_source = BILLING_SOURCE.LINE_OVERRIDE;
      billingResolved = true;
    }
  }
  
  // 2. Check order billing status (find order through line items)
  if (!billingResolved) {
    // Find any line item for this part/project to get order
    let orderId = null;
    
    if (purchase_line_item_id) {
      const lineItem = lineItemsMap[purchase_line_item_id];
      orderId = lineItem?.order_id;
    } else {
      // Search for line items matching part and potentially project
      for (const li of Object.values(lineItemsMap)) {
        if (li.part_id === part_id) {
          orderId = li.order_id;
          break;
        }
      }
    }
    
    if (orderId) {
      const order = ordersMap[orderId];
      if (order?.billing_status) {
        result.client_billing_status = normalizeClientBillingStatus(order.billing_status, isBillable);
        result.billing_source = BILLING_SOURCE.ORDER;
        billingResolved = true;
      }
    }
  }
  
  // 3. Check commitment billing status
  if (!billingResolved && commitment_id) {
    const commitment = commitmentsMap[commitment_id];
    if (commitment?.billing_status) {
      result.client_billing_status = normalizeClientBillingStatus(commitment.billing_status, isBillable);
      result.billing_source = BILLING_SOURCE.COMMITMENT;
      result.commitment_status = commitment.commitment_status;
      billingResolved = true;
    }
  }
  
  // If still not resolved and part isn't billable
  if (!billingResolved && !isBillable) {
    result.client_billing_status = CLIENT_BILLING_STATUS.NOT_BILLABLE;
  }
  
  // ---- CLIENT PAYMENT RESOLUTION ----
  result.client_payment_status = deriveClientPaymentStatus(result.client_billing_status);
  
  // ---- VENDOR INVOICE RESOLUTION ----
  // Find vendor invoice through line item -> order -> vendor invoice
  let vendorInvoice = null;
  
  if (purchase_line_item_id) {
    const lineItem = lineItemsMap[purchase_line_item_id];
    if (lineItem?.order_id) {
      // Find vendor invoice for this order
      for (const vi of Object.values(vendorInvoicesMap)) {
        if (vi.order_id === lineItem.order_id) {
          vendorInvoice = vi;
          break;
        }
      }
    }
  }
  
  if (vendorInvoice) {
    result.vendor_invoice_status = normalizeVendorInvoiceStatus(vendorInvoice.invoice_status);
    result.vendor_source = VENDOR_SOURCE.VENDOR_INVOICE;
  } else if (financialRole === FINANCIAL_ROLE.LABOR_ONLY || 
             financialRole === FINANCIAL_ROLE.NON_BILLABLE) {
    // No vendor for labor-only or non-billable
    result.vendor_invoice_status = VENDOR_INVOICE_STATUS.NOT_RECEIVED;
    result.vendor_source = VENDOR_SOURCE.NONE;
  }
  
  // ---- VENDOR PAYMENT RESOLUTION ----
  result.vendor_payment_status = deriveVendorPaymentStatus(result.vendor_invoice_status);
  
  // ---- MARGIN STATE CALCULATION ----
  result.margin_state = calculateMarginState(
    result.vendor_payment_status,
    result.client_billing_status,
    result.client_payment_status,
    result.financial_role
  );
  
  return result;
}

/**
 * Batch resolve financial status for multiple contexts
 * Preloads all required data in single passes to avoid N+1
 */
async function resolveFinancialStatusBatch(base44, contexts) {
  if (!contexts || contexts.length === 0) {
    return [];
  }
  
  // Collect all IDs we need to fetch
  const partIds = new Set();
  const lineItemIds = new Set();
  const commitmentIds = new Set();
  
  for (const ctx of contexts) {
    if (ctx.part_id) partIds.add(ctx.part_id);
    if (ctx.purchase_line_item_id) lineItemIds.add(ctx.purchase_line_item_id);
    if (ctx.commitment_id) commitmentIds.add(ctx.commitment_id);
  }
  
  // Collect project IDs from contexts
  const projectIds = new Set();
  for (const ctx of contexts) {
    if (ctx.project_id) projectIds.add(ctx.project_id);
  }
  
  // Batch fetch all required data (including projects for forward model check)
  const [parts, lineItems, commitments, orders, vendorInvoices, projects, invoiceBatchLines, invoiceBatches] = await Promise.all([
    partIds.size > 0 ? base44.entities.Part.filter({}) : [],
    base44.entities.PartPurchaseLineItem.filter({}),
    base44.entities.PartCommitment.filter({}),
    base44.entities.Order.filter({}),
    base44.entities.VendorInvoice.filter({}),
    projectIds.size > 0 ? base44.entities.Project.filter({}) : [],
    base44.entities.InvoiceBatchLine.filter({}),
    base44.entities.InvoiceBatch.filter({}),
  ]);
  
  // Build lookup maps
  const dataMaps = {
    partsMap: Object.fromEntries(parts.map(p => [p.id, p])),
    lineItemsMap: Object.fromEntries(lineItems.map(li => [li.id, li])),
    commitmentsMap: Object.fromEntries(commitments.map(c => [c.id, c])),
    ordersMap: Object.fromEntries(orders.map(o => [o.id, o])),
    vendorInvoicesMap: Object.fromEntries(vendorInvoices.map(vi => [vi.id, vi])),
    projectsMap: Object.fromEntries(projects.map(p => [p.id, p])),
    invoiceBatchLinesMap: Object.fromEntries(invoiceBatchLines.map(l => [l.id, l])),
    invoiceBatchesMap: Object.fromEntries(invoiceBatches.map(b => [b.id, b])),
  };
  
  // Resolve each context
  return contexts.map(ctx => resolveForContext(ctx, dataMaps));
}

/**
 * Resolve financial status for a single context
 */
async function resolveFinancialStatusSingle(base44, context) {
  const results = await resolveFinancialStatusBatch(base44, [context]);
  return results[0];
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
    
    const payload = await req.json();
    
    // Batch mode
    if (payload.contexts && Array.isArray(payload.contexts)) {
      const results = await resolveFinancialStatusBatch(base44, payload.contexts);
      return Response.json({
        success: true,
        batch: true,
        count: results.length,
        results,
      });
    }
    
    // Single mode
    const context = {
      part_id: payload.part_id,
      project_id: payload.project_id,
      purchase_line_item_id: payload.purchase_line_item_id,
      commitment_id: payload.commitment_id,
    };
    
    if (!context.part_id) {
      return Response.json({ 
        error: 'part_id is required',
        code: 'MISSING_PART_ID'
      }, { status: 400 });
    }
    
    const result = await resolveFinancialStatusSingle(base44, context);
    
    return Response.json({
      success: true,
      batch: false,
      result,
    });
    
  } catch (error) {
    console.error('Financial resolution error:', error);
    return Response.json({ 
      error: error.message,
      code: 'RESOLUTION_ERROR'
    }, { status: 500 });
  }
});