import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 6 — Get Invoice-Ready Items
 * 
 * Returns items that are ready to be invoiced based on:
 * - client_billing_status == NOT_INVOICED
 * - financial_role != NON_BILLABLE
 * - pricing is present
 * - assigned to a project
 */

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

function isInvoiceReady(item, part, commitment, order, existingBatchLines) {
  const financialRole = getFinancialRole(part);
  
  // Non-billable items are never invoice-ready
  if (financialRole === 'NON_BILLABLE') {
    return { ready: false, reason: 'Non-billable part type' };
  }
  
  // Check if already in a batch
  const alreadyQueued = existingBatchLines.some(bl => 
    bl.source_id === item.id || 
    (bl.commitment_id === item.commitment_id && item.commitment_id)
  );
  if (alreadyQueued) {
    return { ready: false, reason: 'Already queued in batch' };
  }
  
  // Check billing status
  let clientBillingStatus = 'NOT_INVOICED';
  
  if (commitment?.billing_status) {
    clientBillingStatus = normalizeClientBillingStatus(commitment.billing_status, true);
  } else if (order?.billing_status) {
    clientBillingStatus = normalizeClientBillingStatus(order.billing_status, true);
  }
  
  if (clientBillingStatus !== 'NOT_INVOICED') {
    return { ready: false, reason: `Already ${clientBillingStatus}` };
  }
  
  // Check pricing
  const unitPrice = commitment?.unit_retail_snapshot || part?.default_retail;
  if (!unitPrice || unitPrice <= 0) {
    return { ready: false, reason: 'Missing pricing', missingPricing: true };
  }
  
  // Check if archived
  if (part?.is_archived) {
    return { ready: false, reason: 'Part is archived' };
  }
  
  return { ready: true, unitPrice, financialRole };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json().catch(() => ({}));
    const filters = payload.filters || {};
    
    // Fetch all required data
    const [
      installedParts,
      parts,
      projects,
      commitments,
      orders,
      lineItems,
      existingBatchLines,
    ] = await Promise.all([
      base44.entities.InstalledPart.filter({}),
      base44.entities.Part.filter({}),
      base44.entities.Project.filter({}),
      base44.entities.PartCommitment.filter({}),
      base44.entities.Order.filter({}),
      base44.entities.PartPurchaseLineItem.filter({}),
      base44.entities.InvoiceBatchLine.filter({ qb_status: 'queued' }),
    ]);
    
    // Build lookup maps
    const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
    const projectsMap = Object.fromEntries(projects.map(p => [p.id, p]));
    const commitmentsMap = Object.fromEntries(commitments.map(c => [c.id, c]));
    const ordersMap = Object.fromEntries(orders.map(o => [o.id, o]));
    
    // Build line items by part
    const lineItemsByPart = {};
    lineItems.forEach(li => {
      if (!lineItemsByPart[li.part_id]) lineItemsByPart[li.part_id] = [];
      lineItemsByPart[li.part_id].push(li);
    });
    
    const invoiceReadyItems = [];
    const notReadyItems = [];
    const processedKeys = new Set();
    
    // Process installed parts as primary source
    for (const ip of installedParts) {
      const key = `${ip.part_id}:${ip.project_id}:${ip.commitment_id || 'none'}`;
      if (processedKeys.has(key)) continue;
      processedKeys.add(key);
      
      const part = partsMap[ip.part_id];
      if (!part) continue;
      
      const project = projectsMap[ip.project_id];
      if (!project) continue;
      
      const commitment = ip.commitment_id ? commitmentsMap[ip.commitment_id] : null;
      
      // Find order for this part
      let order = null;
      const partLineItems = lineItemsByPart[ip.part_id] || [];
      for (const li of partLineItems) {
        if (li.order_id) {
          order = ordersMap[li.order_id];
          break;
        }
      }
      
      const readyCheck = isInvoiceReady(ip, part, commitment, order, existingBatchLines);
      
      const item = {
        id: ip.id,
        source_type: 'installed_part',
        source_id: ip.id,
        part_id: ip.part_id,
        part_name: part.part_name,
        part_number: part.vendor_part_number,
        project_id: ip.project_id,
        project_name: project.name,
        client_name: project.client_name,
        commitment_id: ip.commitment_id,
        qty: ip.qty_consumed || 1,
        unit_price: readyCheck.unitPrice || commitment?.unit_retail_snapshot || part?.default_retail || 0,
        line_total: (ip.qty_consumed || 1) * (readyCheck.unitPrice || commitment?.unit_retail_snapshot || part?.default_retail || 0),
        financial_role: readyCheck.financialRole || getFinancialRole(part),
        installed_date: ip.installed_date,
        is_ready: readyCheck.ready,
        not_ready_reason: readyCheck.reason,
        missing_pricing: readyCheck.missingPricing || false,
      };
      
      if (readyCheck.ready) {
        invoiceReadyItems.push(item);
      } else {
        notReadyItems.push(item);
      }
    }
    
    // Apply filters
    let filtered = invoiceReadyItems;
    
    if (filters.project_id) {
      filtered = filtered.filter(i => i.project_id === filters.project_id);
    }
    if (filters.financial_role) {
      filtered = filtered.filter(i => i.financial_role === filters.financial_role);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(i => 
        i.part_name?.toLowerCase().includes(search) ||
        i.project_name?.toLowerCase().includes(search)
      );
    }
    
    // Calculate totals
    const totalAmount = filtered.reduce((sum, i) => sum + (i.line_total || 0), 0);
    
    return Response.json({
      success: true,
      invoice_ready: filtered,
      not_ready: notReadyItems.slice(0, 50), // Limit for performance
      totals: {
        ready_count: filtered.length,
        ready_amount: totalAmount,
        not_ready_count: notReadyItems.length,
        missing_pricing_count: notReadyItems.filter(i => i.missing_pricing).length,
      },
      last_scan_at: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Invoice ready check error:', error);
    return Response.json({ 
      error: error.message,
      code: 'INVOICE_READY_ERROR'
    }, { status: 500 });
  }
});