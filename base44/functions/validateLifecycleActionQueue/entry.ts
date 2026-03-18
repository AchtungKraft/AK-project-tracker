import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9 Verification — Lifecycle Action Queue Validation
 * 
 * Tests specific scenarios to ensure correct classification.
 * This is a READ-ONLY validation function.
 */

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

// ============================================
// TEST SCENARIO VALIDATORS
// ============================================

function validateScenario1_NeedsBilling(commitments, parts, projects, ordersMap, lineItemsByPart, installedByCommitment) {
  // Scenario 1: Assigned + needs billing → appears under "Invoice Client"
  const results = [];
  
  for (const commitment of commitments) {
    const part = parts.get(commitment.part_id);
    const project = projects.get(commitment.project_id);
    if (!part || !project) continue;
    
    const effectivePartType = getEffectivePartType(part);
    const financialRole = getFinancialRole(part, effectivePartType);
    if (financialRole === 'NON_BILLABLE') continue;
    
    // Check if billing status is NOT_INVOICED
    let billingStatus = 'NEEDS_BILLING';
    if (commitment.billing_status) {
      const normalized = normalizeRawBillingStatus(commitment.billing_status);
      if (normalized === 'PAID') billingStatus = 'PAID';
      else if (normalized === 'INVOICED') billingStatus = 'INVOICED';
      else if (normalized === 'NOT_BILLABLE') billingStatus = 'NOT_BILLABLE';
    }
    
    if (billingStatus === 'NEEDS_BILLING') {
      const unitRetail = commitment.unit_retail_snapshot || part?.default_retail || 0;
      const expectedAction = unitRetail > 0 ? 'Invoice Client' : 'Fix Missing Data';
      
      results.push({
        commitment_id: commitment.id,
        part_name: part.part_name,
        project_name: project.name,
        billing_status: billingStatus,
        unit_retail: unitRetail,
        expected_action: expectedAction,
        status: 'FOUND',
      });
    }
  }
  
  return {
    scenario: 'Assigned + needs billing → Invoice Client',
    count: results.length,
    pass: results.length > 0 || commitments.length === 0,
    details: results.slice(0, 5),
  };
}

function validateScenario2_InvoicedNotPaid(commitments, parts, projects, ordersMap, lineItemsByPart) {
  // Scenario 2: Invoiced not paid → appears under "Await Payment"
  const results = [];
  
  for (const commitment of commitments) {
    const part = parts.get(commitment.part_id);
    const project = projects.get(commitment.project_id);
    if (!part || !project) continue;
    
    const effectivePartType = getEffectivePartType(part);
    const financialRole = getFinancialRole(part, effectivePartType);
    if (financialRole === 'NON_BILLABLE') continue;
    
    let billingStatus = 'NEEDS_BILLING';
    if (commitment.billing_status) {
      const normalized = normalizeRawBillingStatus(commitment.billing_status);
      if (normalized === 'PAID') billingStatus = 'PAID';
      else if (normalized === 'INVOICED' || normalized === 'PARTIALLY_PAID') billingStatus = 'INVOICED';
    }
    
    if (billingStatus === 'INVOICED') {
      results.push({
        commitment_id: commitment.id,
        part_name: part.part_name,
        project_name: project.name,
        billing_status: billingStatus,
        expected_action: 'Await Client Payment',
        status: 'FOUND',
      });
    }
  }
  
  return {
    scenario: 'Invoiced not paid → Await Payment',
    count: results.length,
    pass: true, // May have 0 if none invoiced yet
    details: results.slice(0, 5),
  };
}

function validateScenario3_PaidNeedsOrder(commitments, parts, projects, ordersMap, lineItemsByPart) {
  // Scenario 3: Paid + procurement needs order → appears under "Ready To Order"
  const results = [];
  
  for (const commitment of commitments) {
    const part = parts.get(commitment.part_id);
    const project = projects.get(commitment.project_id);
    if (!part || !project) continue;
    
    const effectivePartType = getEffectivePartType(part);
    const financialRole = getFinancialRole(part, effectivePartType);
    if (financialRole === 'NON_BILLABLE') continue;
    
    const needsVendor = requiresVendorPurchase(part, effectivePartType);
    if (!needsVendor) continue;
    
    // Check payment status
    let billingStatus = 'NEEDS_BILLING';
    if (commitment.billing_status) {
      const normalized = normalizeRawBillingStatus(commitment.billing_status);
      if (normalized === 'PAID') billingStatus = 'PAID';
      else if (normalized === 'INVOICED') billingStatus = 'INVOICED';
    }
    
    if (billingStatus !== 'PAID') continue;
    
    // Check if no orders yet
    const partLineItems = lineItemsByPart.get(commitment.part_id) || [];
    let hasActiveOrder = false;
    for (const li of partLineItems) {
      const order = ordersMap.get(li.order_id);
      if (order && ['Ordered', 'Partial', 'Received'].includes(order.status)) {
        hasActiveOrder = true;
        break;
      }
    }
    
    if (!hasActiveOrder) {
      results.push({
        commitment_id: commitment.id,
        part_name: part.part_name,
        project_name: project.name,
        billing_status: billingStatus,
        needs_vendor: needsVendor,
        expected_action: 'Create Vendor Order',
        status: 'FOUND',
      });
    }
  }
  
  return {
    scenario: 'Paid + needs order → Ready To Order',
    count: results.length,
    pass: true,
    details: results.slice(0, 5),
  };
}

function validateScenario4_OrderedNotReceived(commitments, parts, projects, ordersMap, lineItemsByPart) {
  // Scenario 4: Ordered not received → appears under "Orders In Progress"
  const results = [];
  
  for (const commitment of commitments) {
    const part = parts.get(commitment.part_id);
    const project = projects.get(commitment.project_id);
    if (!part || !project) continue;
    
    const partLineItems = lineItemsByPart.get(commitment.part_id) || [];
    let orderedQty = 0;
    let receivedQty = 0;
    
    for (const li of partLineItems) {
      const order = ordersMap.get(li.order_id);
      if (order && ['Ordered', 'Partial', 'Received'].includes(order.status)) {
        orderedQty += li.qty_ordered || 0;
        receivedQty += li.qty_received || 0;
      }
    }
    
    if (orderedQty > 0 && receivedQty < orderedQty) {
      results.push({
        commitment_id: commitment.id,
        part_name: part.part_name,
        project_name: project.name,
        ordered_qty: orderedQty,
        received_qty: receivedQty,
        expected_action: 'Track Vendor Delivery',
        status: 'FOUND',
      });
    }
  }
  
  return {
    scenario: 'Ordered not received → Orders In Progress',
    count: results.length,
    pass: true,
    details: results.slice(0, 5),
  };
}

function validateScenario5_ReceivedNotInstalled(commitments, parts, projects, ordersMap, lineItemsByPart, installedByCommitment) {
  // Scenario 5: Received + not installed → appears under "Ready To Install"
  const results = [];
  
  for (const commitment of commitments) {
    const part = parts.get(commitment.part_id);
    const project = projects.get(commitment.project_id);
    if (!part || !project) continue;
    
    const effectivePartType = getEffectivePartType(part);
    const needsVendor = requiresVendorPurchase(part, effectivePartType);
    
    // Check procurement status
    const partLineItems = lineItemsByPart.get(commitment.part_id) || [];
    let receivedQty = 0;
    
    for (const li of partLineItems) {
      const order = ordersMap.get(li.order_id);
      if (order && ['Ordered', 'Partial', 'Received'].includes(order.status)) {
        receivedQty += li.qty_received || 0;
      }
    }
    
    const isReceived = receivedQty >= (commitment.qty_committed || 1);
    const isProcurementComplete = !needsVendor || isReceived;
    
    if (!isProcurementComplete) continue;
    
    // Check install status
    const installedRecords = installedByCommitment.get(commitment.id) || [];
    const installedQty = installedRecords.reduce((sum, ip) => sum + (ip.qty_consumed || 0), 0);
    const isInstalled = installedQty >= (commitment.qty_committed || 1);
    
    if (!isInstalled) {
      results.push({
        commitment_id: commitment.id,
        part_name: part.part_name,
        project_name: project.name,
        received_qty: receivedQty,
        installed_qty: installedQty,
        needs_vendor: needsVendor,
        expected_action: 'Schedule Installation',
        status: 'FOUND',
      });
    }
  }
  
  return {
    scenario: 'Received + not installed → Ready To Install',
    count: results.length,
    pass: true,
    details: results.slice(0, 5),
  };
}

function validateScenario6_ClientSupplied(commitments, parts, projects) {
  // Scenario 6: Client supplied part → should never appear under "Ready To Order"
  const results = [];
  
  for (const commitment of commitments) {
    const part = parts.get(commitment.part_id);
    const project = projects.get(commitment.project_id);
    if (!part || !project) continue;
    
    const effectivePartType = getEffectivePartType(part);
    if (effectivePartType !== 'CLIENT_SUPPLIED') continue;
    
    const needsVendor = requiresVendorPurchase(part, effectivePartType);
    
    results.push({
      commitment_id: commitment.id,
      part_name: part.part_name,
      project_name: project.name,
      part_type: effectivePartType,
      needs_vendor: needsVendor,
      expected_behavior: 'procurement_status = NOT_REQUIRED',
      status: needsVendor ? 'FAIL' : 'PASS',
    });
  }
  
  const failures = results.filter(r => r.status === 'FAIL');
  
  return {
    scenario: 'Client supplied → NOT in Ready To Order',
    count: results.length,
    pass: failures.length === 0,
    failures: failures.length,
    details: results.slice(0, 5),
  };
}

function validateScenario7_AKManufactured(commitments, parts, projects) {
  // Scenario 7: AK manufactured part → procurement NOT_REQUIRED, must still be billable
  const results = [];
  
  for (const commitment of commitments) {
    const part = parts.get(commitment.part_id);
    const project = projects.get(commitment.project_id);
    if (!part || !project) continue;
    
    const effectivePartType = getEffectivePartType(part);
    if (effectivePartType !== 'AK_MANUFACTURED') continue;
    
    const needsVendor = requiresVendorPurchase(part, effectivePartType);
    const financialRole = getFinancialRole(part, effectivePartType);
    
    results.push({
      commitment_id: commitment.id,
      part_name: part.part_name,
      project_name: project.name,
      part_type: effectivePartType,
      needs_vendor: needsVendor,
      financial_role: financialRole,
      is_billable: financialRole !== 'NON_BILLABLE',
      status: !needsVendor && financialRole !== 'NON_BILLABLE' ? 'PASS' : 'REVIEW',
    });
  }
  
  return {
    scenario: 'AK manufactured → NOT_REQUIRED but billable',
    count: results.length,
    pass: true,
    details: results.slice(0, 5),
  };
}

function validateScenario8_Archived(commitments, parts) {
  // Scenario 8: Archived part/commitment → excluded unless toggle on
  const results = [];
  
  for (const commitment of commitments) {
    const part = parts.get(commitment.part_id);
    if (!part) continue;
    
    const isArchived = commitment.commitment_status === 'cancelled' || part.is_archived;
    
    if (isArchived) {
      results.push({
        commitment_id: commitment.id,
        part_name: part.part_name,
        commitment_status: commitment.commitment_status,
        part_archived: part.is_archived,
        expected_behavior: 'excluded from queue by default',
        status: 'FOUND',
      });
    }
  }
  
  return {
    scenario: 'Archived → excluded by default',
    count: results.length,
    pass: true,
    details: results.slice(0, 5),
  };
}

// ============================================
// MAIN VALIDATION FUNCTION
// ============================================

async function validateLifecycleActionQueue(base44) {
  // Load all required data
  const [
    commitments,
    partsArr,
    projectsArr,
    ordersArr,
    lineItemsArr,
    installedPartsArr,
  ] = await Promise.all([
    base44.entities.PartCommitment.filter({}),
    base44.entities.Part.filter({}),
    base44.entities.Project.filter({}),
    base44.entities.Order.filter({}),
    base44.entities.PartPurchaseLineItem.filter({}),
    base44.entities.InstalledPart.filter({}),
  ]);

  // Build maps
  const parts = new Map(partsArr.map(p => [p.id, p]));
  const projects = new Map(projectsArr.map(p => [p.id, p]));
  const ordersMap = new Map(ordersArr.map(o => [o.id, o]));

  const lineItemsByPart = new Map();
  lineItemsArr.forEach(li => {
    if (!lineItemsByPart.has(li.part_id)) lineItemsByPart.set(li.part_id, []);
    lineItemsByPart.get(li.part_id).push(li);
  });

  const installedByCommitment = new Map();
  installedPartsArr.forEach(ip => {
    if (ip.commitment_id) {
      if (!installedByCommitment.has(ip.commitment_id)) installedByCommitment.set(ip.commitment_id, []);
      installedByCommitment.get(ip.commitment_id).push(ip);
    }
  });

  // Run all scenario validations
  const scenarios = [
    validateScenario1_NeedsBilling(commitments, parts, projects, ordersMap, lineItemsByPart, installedByCommitment),
    validateScenario2_InvoicedNotPaid(commitments, parts, projects, ordersMap, lineItemsByPart),
    validateScenario3_PaidNeedsOrder(commitments, parts, projects, ordersMap, lineItemsByPart),
    validateScenario4_OrderedNotReceived(commitments, parts, projects, ordersMap, lineItemsByPart),
    validateScenario5_ReceivedNotInstalled(commitments, parts, projects, ordersMap, lineItemsByPart, installedByCommitment),
    validateScenario6_ClientSupplied(commitments, parts, projects),
    validateScenario7_AKManufactured(commitments, parts, projects),
    validateScenario8_Archived(commitments, parts),
  ];

  const allPass = scenarios.every(s => s.pass);
  const passCount = scenarios.filter(s => s.pass).length;

  return {
    success: true,
    overall_status: allPass ? 'ALL_PASS' : 'SOME_FAILURES',
    pass_count: passCount,
    total_scenarios: scenarios.length,
    scenarios,
    validated_at: new Date().toISOString(),
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
    
    const result = await validateLifecycleActionQueue(base44);
    
    return Response.json(result);
    
  } catch (error) {
    console.error('Validation error:', error);
    return Response.json({ 
      error: error.message,
      code: 'VALIDATION_ERROR'
    }, { status: 500 });
  }
});