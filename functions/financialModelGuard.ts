import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 5 — Financial Model Guard
 * 
 * Centralized guardrail function that validates financial operations
 * against the project's financial_model_version.
 * 
 * FORWARD MODEL BLOCKS:
 * - createPool, allocatePool, reversePoolAllocation, recalculatePool
 * - createVendorInvoice, recordVendorInvoiceCharge
 * - direct commitment billing_status writes
 * - exposure_gap / covered_retail_total writes
 * 
 * FORWARD MODEL ALLOWS:
 * - InvoiceBatch / InvoiceBatchLine operations (client billing)
 * - Order header freight_cost / tariff_cost
 * - PO creation (cost tracking)
 * - Derived billing status from batch status
 */

// Legacy-only operations that forward model cannot use
const LEGACY_ONLY_OPERATIONS = [
  'createPool',
  'allocatePool',
  'reversePoolAllocation',
  'reversePoolCharge',
  'createPoolCharge',
  'closePool',
  'transferPoolBalance',
  'recalculatePoolBalance',
  'recalculateProjectExposure',
  'getOrCreateCreditPool',
  'createVendorInvoice',
  'recordVendorInvoiceCharge',
  'updateVendorPayment',
  'directCommitmentBillingStatusWrite',
  'directCommitmentExposureWrite',
];

// Legacy-only entities
const LEGACY_ONLY_ENTITIES = [
  'BillingPool',
  'PoolAllocation',
  'PoolCharge',
  'VendorInvoice',
  'VendorInvoiceLineItem',
  'VendorPayment',
];

// Legacy-only fields on PartCommitment
const LEGACY_ONLY_COMMITMENT_FIELDS = [
  'billing_status',
  'exposure_gap',
  'covered_retail_total',
  'invoiced_retail_total',
];

/**
 * Check if operation is blocked for forward model
 */
function isLegacyOnlyOperation(operation) {
  return LEGACY_ONLY_OPERATIONS.includes(operation);
}

/**
 * Check if entity is legacy-only
 */
function isLegacyOnlyEntity(entityName) {
  return LEGACY_ONLY_ENTITIES.includes(entityName);
}

/**
 * Check if field is legacy-only for PartCommitment
 */
function isLegacyOnlyCommitmentField(fieldName) {
  return LEGACY_ONLY_COMMITMENT_FIELDS.includes(fieldName);
}

/**
 * Validate operation against project financial model
 * Returns { allowed: boolean, reason?: string }
 */
async function validateOperation(base44, params) {
  const { operation, entity_name, project_id, commitment_id, fields } = params;
  
  // Get project financial model version
  let financialModel = 'legacy'; // default
  
  if (project_id) {
    const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
    financialModel = projects[0]?.financial_model_version || 'legacy';
  } else if (commitment_id) {
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    const commitment = commitments[0];
    if (commitment?.project_id) {
      const projects = await base44.asServiceRole.entities.Project.filter({ id: commitment.project_id });
      financialModel = projects[0]?.financial_model_version || 'legacy';
    }
  }
  
  // Legacy model - everything allowed
  if (financialModel !== 'forward') {
    return { allowed: true, financial_model: financialModel };
  }
  
  // Forward model - check restrictions
  
  // Check operation
  if (operation && isLegacyOnlyOperation(operation)) {
    return {
      allowed: false,
      financial_model: 'forward',
      code: 'LEGACY_FLOW_BLOCKED',
      reason: `Operation "${operation}" is legacy-only and not available in forward financial model projects. ` +
        'Forward model uses InvoiceBatch for client billing.',
    };
  }
  
  // Check entity
  if (entity_name && isLegacyOnlyEntity(entity_name)) {
    return {
      allowed: false,
      financial_model: 'forward',
      code: 'LEGACY_FLOW_BLOCKED',
      reason: `Entity "${entity_name}" is legacy-only and cannot be used in forward financial model projects. ` +
        'Forward model uses InvoiceBatch for client billing.',
    };
  }
  
  // Check commitment fields
  if (entity_name === 'PartCommitment' && fields) {
    const blockedFields = Object.keys(fields).filter(f => isLegacyOnlyCommitmentField(f));
    if (blockedFields.length > 0) {
      return {
        allowed: false,
        financial_model: 'forward',
        code: 'LEGACY_FIELD_BLOCKED',
        reason: `Fields [${blockedFields.join(', ')}] are legacy-only and cannot be written in forward financial model projects. ` +
          'Forward model derives billing status from InvoiceBatch.',
        blocked_fields: blockedFields,
      };
    }
  }
  
  return { allowed: true, financial_model: 'forward' };
}

/**
 * Runtime assertion - throws if operation is blocked
 */
async function assertOperationAllowed(base44, params) {
  const result = await validateOperation(base44, params);
  if (!result.allowed) {
    const error = new Error(result.reason);
    error.code = result.code;
    error.financial_model = result.financial_model;
    throw error;
  }
  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    const { action, ...params } = payload;
    
    switch (action) {
      case 'validate':
        // Validate without throwing
        const validationResult = await validateOperation(base44, params);
        return Response.json(validationResult);
        
      case 'assert':
        // Assert and throw if blocked
        const assertResult = await assertOperationAllowed(base44, params);
        return Response.json({ success: true, ...assertResult });
        
      case 'getProjectModel':
        // Just get the financial model version
        const projects = await base44.asServiceRole.entities.Project.filter({ id: params.project_id });
        return Response.json({
          financial_model_version: projects[0]?.financial_model_version || 'legacy',
        });
        
      case 'runRegressionChecks':
        // Run regression checks for forward model integrity
        const checks = await runRegressionChecks(base44);
        return Response.json(checks);
        
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Financial model guard error:', error);
    return Response.json({ 
      success: false,
      error: error.message,
      code: error.code || 'GUARD_ERROR',
    }, { status: error.code === 'LEGACY_FLOW_BLOCKED' ? 400 : 500 });
  }
});

/**
 * Run regression checks for forward model integrity
 * Verifies no legacy writes have contaminated forward projects
 */
async function runRegressionChecks(base44) {
  const results = {
    timestamp: new Date().toISOString(),
    checks: [],
    passed: 0,
    failed: 0,
    warnings: 0,
  };
  
  // Get all forward projects
  const allProjects = await base44.asServiceRole.entities.Project.list();
  const forwardProjects = allProjects.filter(p => p.financial_model_version === 'forward');
  
  if (forwardProjects.length === 0) {
    results.checks.push({
      name: 'forward_projects_exist',
      status: 'skip',
      message: 'No forward model projects found',
    });
    return results;
  }
  
  const forwardProjectIds = forwardProjects.map(p => p.id);
  
  // Check 1: No BillingPools for forward projects
  const allPools = await base44.asServiceRole.entities.BillingPool.list();
  const forwardPools = allPools.filter(p => forwardProjectIds.includes(p.project_id));
  results.checks.push({
    name: 'no_billing_pools_for_forward',
    status: forwardPools.length === 0 ? 'pass' : 'fail',
    message: forwardPools.length === 0 
      ? 'No BillingPools found for forward projects'
      : `Found ${forwardPools.length} BillingPools for forward projects (should be 0)`,
    count: forwardPools.length,
    project_ids: forwardPools.map(p => p.project_id),
  });
  if (forwardPools.length === 0) results.passed++; else results.failed++;
  
  // Check 2: No commitments with billing_status set for forward projects
  const allCommitments = await base44.asServiceRole.entities.PartCommitment.list();
  const forwardCommitments = allCommitments.filter(c => forwardProjectIds.includes(c.project_id));
  const commitmentsWithBillingStatus = forwardCommitments.filter(c => 
    c.billing_status && c.billing_status !== 'uninvoiced' && c.billing_status !== null
  );
  results.checks.push({
    name: 'no_billing_status_writes_for_forward',
    status: commitmentsWithBillingStatus.length === 0 ? 'pass' : 'warn',
    message: commitmentsWithBillingStatus.length === 0
      ? 'No forward commitments have billing_status set (correct)'
      : `Found ${commitmentsWithBillingStatus.length} forward commitments with billing_status set (should derive from batch)`,
    count: commitmentsWithBillingStatus.length,
  });
  if (commitmentsWithBillingStatus.length === 0) results.passed++; else results.warnings++;
  
  // Check 3: No VendorInvoices linked to forward project commitments
  const forwardCommitmentIds = forwardCommitments.map(c => c.id);
  const allVendorInvoiceLines = await base44.asServiceRole.entities.VendorInvoiceLineItem.list();
  const forwardVendorLines = allVendorInvoiceLines.filter(l => {
    // Check if linked to a forward commitment via PO line
    return l.commitment_id && forwardCommitmentIds.includes(l.commitment_id);
  });
  results.checks.push({
    name: 'no_vendor_invoices_for_forward',
    status: forwardVendorLines.length === 0 ? 'pass' : 'warn',
    message: forwardVendorLines.length === 0
      ? 'No VendorInvoiceLineItems linked to forward commitments (correct)'
      : `Found ${forwardVendorLines.length} VendorInvoiceLineItems linked to forward commitments`,
    count: forwardVendorLines.length,
  });
  if (forwardVendorLines.length === 0) results.passed++; else results.warnings++;
  
  // Check 4: Forward projects have InvoiceBatches (if any billing has occurred)
  const allBatches = await base44.asServiceRole.entities.InvoiceBatch.list();
  const forwardBatches = allBatches.filter(b => forwardProjectIds.includes(b.project_id));
  results.checks.push({
    name: 'forward_uses_invoice_batch',
    status: 'info',
    message: `Found ${forwardBatches.length} InvoiceBatches for ${forwardProjects.length} forward projects`,
    batch_count: forwardBatches.length,
    project_count: forwardProjects.length,
  });
  
  return results;
}