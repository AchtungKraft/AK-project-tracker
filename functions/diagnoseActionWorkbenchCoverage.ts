import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9 Verification — Action Workbench Coverage Diagnostic
 * 
 * Audits PartCommitment coverage to identify items missing from the Action Workbench.
 * This is a READ-ONLY diagnostic function.
 * 
 * ENTITY PATHS FOR "PARTS ASSIGNED TO A PROJECT":
 * 1. PartCommitment (CANONICAL) - primary lifecycle owner
 *    - project_id, part_id, qty_committed, billing_status, commitment_status
 *    - Links: order_line_item_ids, requirement_id
 * 
 * 2. PartProjectRequirement (LEGACY) - being migrated to PartCommitment
 *    - project_id, part_id, qty_needed, status
 *    - Many have corresponding PartCommitment via requirement_id link
 * 
 * 3. TaskPartLink (SECONDARY) - links parts to specific tasks
 *    - task_id, part_id, project_id, commitment_id (optional)
 *    - Does NOT drive financial lifecycle
 * 
 * 4. InstalledPart (POST-FACTO) - records of installed parts
 *    - project_id, part_id, commitment_id (optional)
 *    - Should NOT be required for lifecycle visibility
 * 
 * CANONICAL SOURCE: PartCommitment is the single source of truth for financial lifecycle.
 */

const DEFAULT_PART_TYPE = 'PURCHASED_VENDOR';

// ============================================
// ELIGIBILITY RULES
// ============================================

/**
 * A PartCommitment MUST appear in Action Workbench if:
 * 1. It has a valid project_id (not null/undefined)
 * 2. The linked Project exists and is not archived
 * 3. The linked Part exists
 * 4. The commitment itself is not cancelled (commitment_status !== 'cancelled')
 * 5. The part is not archived (part.is_archived !== true)
 * 6. Unless "Show Closed" is enabled:
 *    - NOT (install_status === 'INSTALLED' AND client_payment_status === 'PAID')
 */

function getEligibilityReason(commitment, part, project, options = {}) {
  const { showClosed = false, showArchived = false } = options;
  
  // Rule 1: Must have project_id
  if (!commitment.project_id) {
    return { eligible: false, reason: 'missing_project_id' };
  }
  
  // Rule 2: Project must exist
  if (!project) {
    return { eligible: false, reason: 'project_not_found' };
  }
  
  // Rule 2b: Project archived check (if not showing archived)
  // Note: Projects don't have is_archived but may have status
  
  // Rule 3: Part must exist
  if (!commitment.part_id) {
    return { eligible: false, reason: 'missing_part_id' };
  }
  if (!part) {
    return { eligible: false, reason: 'part_not_found' };
  }
  
  // Rule 4: Commitment not cancelled
  if (commitment.commitment_status === 'cancelled') {
    if (!showArchived) {
      return { eligible: false, reason: 'commitment_cancelled' };
    }
  }
  
  // Rule 5: Part not archived (unless showing archived)
  if (part.is_archived && !showArchived) {
    return { eligible: false, reason: 'part_archived' };
  }
  
  // All checks passed
  return { eligible: true, reason: null };
}

// ============================================
// CLASSIFICATION HELPERS
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
// MAIN DIAGNOSTIC FUNCTION
// ============================================

async function diagnoseActionWorkbenchCoverage(base44, options = {}) {
  const { showClosed = false, showArchived = false, limit = 50 } = options;
  
  // Load all required data
  const [
    commitments,
    parts,
    projects,
    orders,
    lineItems,
    installedParts,
    requirements,
    taskPartLinks,
  ] = await Promise.all([
    base44.entities.PartCommitment.filter({}),
    base44.entities.Part.filter({}),
    base44.entities.Project.filter({}),
    base44.entities.Order.filter({}),
    base44.entities.PartPurchaseLineItem.filter({}),
    base44.entities.InstalledPart.filter({}),
    base44.entities.PartProjectRequirement.filter({}),
    base44.entities.TaskPartLink.filter({}),
  ]);

  // Build lookup maps
  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
  const projectsMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const ordersMap = Object.fromEntries(orders.map(o => [o.id, o]));

  // Build line items by part
  const lineItemsByPart = {};
  lineItems.forEach(li => {
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

  // Simulate getLifecycleActionQueue logic to find what WOULD be returned
  const actionQueueResults = new Set();
  const eligibleCommitments = [];
  const missingCommitments = [];
  const reasonCounts = {};

  for (const commitment of commitments) {
    const part = partsMap[commitment.part_id];
    const project = projectsMap[commitment.project_id];
    
    // Check eligibility
    const eligibility = getEligibilityReason(commitment, part, project, { showClosed, showArchived });
    
    if (!eligibility.eligible) {
      reasonCounts[eligibility.reason] = (reasonCounts[eligibility.reason] || 0) + 1;
      if (missingCommitments.length < limit) {
        missingCommitments.push({
          commitment_id: commitment.id,
          project_id: commitment.project_id,
          part_id: commitment.part_id,
          part_name: part?.part_name || 'UNKNOWN',
          project_name: project?.name || 'UNKNOWN',
          reason: eligibility.reason,
          commitment_status: commitment.commitment_status,
          billing_status: commitment.billing_status,
          part_type: part?.part_type,
          part_archived: part?.is_archived,
        });
      }
      continue;
    }
    
    // Check if it would be classified properly
    const effectivePartType = getEffectivePartType(part);
    const financialRole = getFinancialRole(part, effectivePartType);
    
    // Non-billable items are excluded from action queue by default
    if (financialRole === 'NON_BILLABLE') {
      reasonCounts['non_billable_excluded'] = (reasonCounts['non_billable_excluded'] || 0) + 1;
      if (missingCommitments.length < limit) {
        missingCommitments.push({
          commitment_id: commitment.id,
          project_id: commitment.project_id,
          part_id: commitment.part_id,
          part_name: part?.part_name || 'UNKNOWN',
          project_name: project?.name || 'UNKNOWN',
          reason: 'non_billable_excluded',
          commitment_status: commitment.commitment_status,
          billing_status: commitment.billing_status,
          part_type: part?.part_type,
          financial_role: financialRole,
        });
      }
      continue;
    }
    
    // Check billing status classification
    let billingStatus = 'NEEDS_BILLING';
    if (commitment.billing_status) {
      const normalized = normalizeRawBillingStatus(commitment.billing_status);
      if (normalized === 'PAID') billingStatus = 'PAID';
      else if (normalized === 'INVOICED' || normalized === 'PARTIALLY_PAID') billingStatus = 'INVOICED';
      else if (normalized === 'NOT_BILLABLE') billingStatus = 'NOT_BILLABLE';
    } else {
      // Fallback check orders
      const partLineItems = lineItemsByPart[commitment.part_id] || [];
      for (const li of partLineItems) {
        const order = ordersMap[li.order_id];
        if (order?.billing_status) {
          const normalized = normalizeRawBillingStatus(order.billing_status);
          if (normalized === 'PAID') { billingStatus = 'PAID'; break; }
          if (normalized === 'INVOICED') { billingStatus = 'INVOICED'; break; }
        }
      }
    }
    
    const paymentStatus = billingStatus === 'PAID' ? 'PAID' : 
                          billingStatus === 'INVOICED' ? 'UNPAID' : 'UNPAID';

    // Check procurement status
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

    // Check install status
    const installedRecords = installedByCommitment[commitment.id] || [];
    const installedQty = installedRecords.reduce((sum, ip) => sum + (ip.qty_consumed || 0), 0);
    const installStatus = installedQty >= (commitment.qty_committed || 1) ? 'INSTALLED' : 
                          installedQty > 0 ? 'PARTIAL' : 'PLANNED';

    // Check pricing
    const unitRetail = commitment.unit_retail_snapshot || part?.default_retail || 0;

    // Determine recommended action (mirrors getLifecycleActionQueue)
    let recommendedAction = 'Review Status';
    let wouldBeIncluded = true;
    let exclusionReason = null;

    // BLOCKED: Missing pricing
    if (unitRetail <= 0) {
      recommendedAction = 'Fix Missing Data';
    }
    // COMPLETE (excluded unless showClosed)
    else if (installStatus === 'INSTALLED' && paymentStatus === 'PAID') {
      recommendedAction = 'Lifecycle Complete';
      if (!showClosed) {
        wouldBeIncluded = false;
        exclusionReason = 'lifecycle_complete_excluded';
      }
    }
    // NEEDS_BILLING
    else if (billingStatus === 'NEEDS_BILLING') {
      recommendedAction = 'Invoice Client';
    }
    // INVOICED but not PAID
    else if (billingStatus === 'INVOICED' && paymentStatus !== 'PAID') {
      recommendedAction = 'Await Client Payment';
    }
    // READY_FOR_ORDER
    else if (paymentStatus === 'PAID' && procurementStatus === 'NEEDS_ORDER') {
      recommendedAction = 'Create Vendor Order';
    }
    // ORDER_IN_PROGRESS
    else if (procurementStatus === 'ORDERED' || procurementStatus === 'PARTIALLY_RECEIVED') {
      recommendedAction = 'Track Vendor Delivery';
    }
    // AWAITING_INSTALL
    else if ((procurementStatus === 'RECEIVED' || procurementStatus === 'NOT_REQUIRED') && 
             installStatus !== 'INSTALLED') {
      recommendedAction = 'Schedule Installation';
    }

    if (wouldBeIncluded) {
      actionQueueResults.add(commitment.id);
      eligibleCommitments.push({
        commitment_id: commitment.id,
        project_name: project?.name,
        part_name: part?.part_name,
        recommended_action: recommendedAction,
        billing_status: billingStatus,
        payment_status: paymentStatus,
        procurement_status: procurementStatus,
        install_status: installStatus,
      });
    } else {
      reasonCounts[exclusionReason] = (reasonCounts[exclusionReason] || 0) + 1;
      if (missingCommitments.length < limit) {
        missingCommitments.push({
          commitment_id: commitment.id,
          project_id: commitment.project_id,
          part_id: commitment.part_id,
          part_name: part?.part_name || 'UNKNOWN',
          project_name: project?.name || 'UNKNOWN',
          reason: exclusionReason,
          recommended_action: recommendedAction,
          billing_status: billingStatus,
          payment_status: paymentStatus,
          procurement_status: procurementStatus,
          install_status: installStatus,
        });
      }
    }
  }

  // Build KPIs
  const kpis = {
    total_commitments: commitments.length,
    total_eligible: eligibleCommitments.length,
    total_missing: commitments.length - eligibleCommitments.length,
    total_parts: parts.length,
    total_projects: projects.length,
    total_requirements_legacy: requirements.length,
    total_task_part_links: taskPartLinks.length,
    total_installed_parts: installedParts.length,
    coverage_percentage: commitments.length > 0 
      ? Math.round((eligibleCommitments.length / commitments.length) * 100) 
      : 100,
  };

  // Action breakdown
  const actionBreakdown = {};
  for (const item of eligibleCommitments) {
    actionBreakdown[item.recommended_action] = (actionBreakdown[item.recommended_action] || 0) + 1;
  }

  return {
    success: true,
    kpis,
    reason_counts: reasonCounts,
    action_breakdown: actionBreakdown,
    missing_commitments: missingCommitments.slice(0, limit),
    eligible_sample: eligibleCommitments.slice(0, 20),
    entity_summary: {
      canonical_source: 'PartCommitment',
      secondary_sources: ['TaskPartLink (task-level)', 'PartProjectRequirement (legacy)'],
      post_facto_only: ['InstalledPart'],
    },
    eligibility_rules: [
      'Must have valid project_id',
      'Project must exist',
      'Part must exist',
      'Commitment not cancelled (unless showArchived)',
      'Part not archived (unless showArchived)',
      'Not fully closed (unless showClosed)',
    ],
    diagnosed_at: new Date().toISOString(),
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
    const result = await diagnoseActionWorkbenchCoverage(base44, payload.options || {});
    
    return Response.json(result);
    
  } catch (error) {
    console.error('Coverage diagnostic error:', error);
    return Response.json({ 
      error: error.message,
      code: 'COVERAGE_DIAGNOSTIC_ERROR'
    }, { status: 500 });
  }
});