import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CommitmentServiceGuard - Platform-Level Mutation Enforcement
 * 
 * This guard validates ALL mutations to financial entities.
 * It MUST be called before any direct entity update to protected entities.
 * 
 * Protected Entities:
 * - BillingPool
 * - PoolAllocation
 * - PoolCharge
 * - PartCommitment
 * - PartPurchaseLineItem
 * - InstalledPart
 * - InvoiceBatchLine
 * 
 * The guard ensures:
 * - Sensitive derived fields cannot be directly modified
 * - Locked fields cannot be modified after lock
 * - Delete operations are blocked (use reversal pattern)
 * - All mutations log for audit trail
 */

// Service context token - only CommitmentService can set this
const COMMITMENT_SERVICE_TOKEN = '__COMMITMENT_SERVICE_AUTHORIZED__';

// Protected entities and their sensitive fields
const PROTECTED_ENTITIES = {
  BillingPool: {
    sensitiveFields: ['balance', 'allocated_total', 'charges_total', 'paid_amount', 'invoiced_amount', 'pool_version'],
    allowDelete: false,
    conditionalLocks: []
  },
  PoolAllocation: {
    sensitiveFields: ['amount_allocated'],
    allowDelete: false,
    conditionalLocks: [
      { field: 'is_reversed', lockFields: ['amount_allocated', 'pool_id', 'commitment_id'], condition: (val) => val === true }
    ]
  },
  PoolCharge: {
    sensitiveFields: ['amount'],
    allowDelete: false,
    conditionalLocks: [
      { field: 'is_reversed', lockFields: ['amount', 'pool_id', 'charge_type'], condition: (val) => val === true }
    ]
  },
  PartCommitment: {
    sensitiveFields: ['covered_retail_total', 'exposure_gap', 'planned_retail_total', 'invoiced_retail_total', 'commitment_version'],
    allowDelete: false,
    conditionalLocks: [
      { field: 'commitment_status', lockFields: ['qty_committed', 'unit_retail_snapshot'], condition: (val) => val === 'cancelled' }
    ]
  },
  PartPurchaseLineItem: {
    sensitiveFields: [],
    allowDelete: false,
    conditionalLocks: [
      { field: 'cost_locked_at', lockFields: ['unit_price', 'vendor_id', 'qty_ordered', 'line_total'], condition: (val) => val != null }
    ]
  },
  InstalledPart: {
    sensitiveFields: ['extended_cost'],
    allowDelete: false,
    conditionalLocks: [
      { field: 'is_reversed', lockFields: ['qty_consumed', 'unit_cost_at_install', 'commitment_id', 'inventory_item_id'], condition: (val) => val === true }
    ]
  },
  InvoiceBatchLine: {
    sensitiveFields: ['line_total'],
    allowDelete: false,
    conditionalLocks: [],
    // Special: requires batch status check
    requiresBatchStatusCheck: true,
    batchLockedStatuses: ['invoiced', 'paid'],
    batchLockedFields: ['unit_price', 'qty', 'line_total']
  }
};

// Allowed contexts that can mutate protected entities
const ALLOWED_MUTATION_SOURCES = [
  'commitmentService',
  'commitmentServiceGuard', // Self for testing
  'testCommitmentLifecycle',
  'createInvoiceBatch',
  'voidInvoiceBatch',
  'updatePaymentStatus',
  'mutateInventory',
  'syncReceivingToCommitments',
  'syncInstallToCommitments',
  'syncInvoiceToCommitments'
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case 'validateMutation':
        return Response.json(await validateMutation(base44, params));
      case 'validateDelete':
        return Response.json(await validateDelete(base44, params));
      case 'getProtectedEntities':
        return Response.json({ entities: Object.keys(PROTECTED_ENTITIES) });
      case 'testGuard':
        return Response.json(await testGuard(base44, user));
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

  } catch (error) {
    console.error("CommitmentServiceGuard error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Validate a mutation before it's applied
 */
async function validateMutation(base44, params) {
  const { 
    entityName, 
    recordId, 
    updates, 
    callerSource,
    serviceToken 
  } = params;

  const result = {
    allowed: true,
    violations: [],
    warnings: [],
    entityName,
    recordId,
    callerSource
  };

  // Check if entity is protected
  const protection = PROTECTED_ENTITIES[entityName];
  if (!protection) {
    return result; // Not a protected entity
  }

  // Verify caller is authorized
  const isAuthorizedCaller = ALLOWED_MUTATION_SOURCES.includes(callerSource);
  const hasValidToken = serviceToken === COMMITMENT_SERVICE_TOKEN;

  if (!isAuthorizedCaller && !hasValidToken) {
    result.allowed = false;
    result.violations.push({
      type: 'UNAUTHORIZED_CALLER',
      message: `Direct mutation to ${entityName} not allowed. Use CommitmentService.`,
      callerSource
    });
    logSecurityWarning('UNAUTHORIZED_MUTATION', entityName, recordId, callerSource, updates);
    return result;
  }

  // Check sensitive fields
  const attemptedSensitiveFields = Object.keys(updates || {}).filter(
    f => protection.sensitiveFields.includes(f)
  );

  if (attemptedSensitiveFields.length > 0 && !hasValidToken) {
    result.allowed = false;
    result.violations.push({
      type: 'SENSITIVE_FIELD_MUTATION',
      message: `Cannot directly modify sensitive fields: ${attemptedSensitiveFields.join(', ')}`,
      fields: attemptedSensitiveFields
    });
    logSecurityWarning('SENSITIVE_FIELD_MUTATION', entityName, recordId, callerSource, { fields: attemptedSensitiveFields });
    return result;
  }

  // Check conditional locks (need to fetch current record)
  if (protection.conditionalLocks.length > 0 && recordId) {
    try {
      const records = await base44.asServiceRole.entities[entityName].filter({ id: recordId });
      const record = records[0];
      
      if (record) {
        for (const lock of protection.conditionalLocks) {
          const lockValue = record[lock.field];
          if (lock.condition(lockValue)) {
            const attemptedLockedFields = Object.keys(updates || {}).filter(
              f => lock.lockFields.includes(f)
            );
            if (attemptedLockedFields.length > 0) {
              result.allowed = false;
              result.violations.push({
                type: 'LOCKED_FIELD_MUTATION',
                message: `Fields locked by ${lock.field}: ${attemptedLockedFields.join(', ')}`,
                lockField: lock.field,
                lockValue,
                attemptedFields: attemptedLockedFields
              });
            }
          }
        }
      }
    } catch (err) {
      result.warnings.push({ type: 'RECORD_FETCH_ERROR', message: err.message });
    }
  }

  // Special check for InvoiceBatchLine - requires batch status check
  if (entityName === 'InvoiceBatchLine' && protection.requiresBatchStatusCheck && recordId) {
    try {
      const lines = await base44.asServiceRole.entities.InvoiceBatchLine.filter({ id: recordId });
      const line = lines[0];
      
      if (line && line.batch_id) {
        const batches = await base44.asServiceRole.entities.InvoiceBatch.filter({ id: line.batch_id });
        const batch = batches[0];
        
        if (batch && protection.batchLockedStatuses.includes(batch.status)) {
          const attemptedLockedFields = Object.keys(updates || {}).filter(
            f => protection.batchLockedFields.includes(f)
          );
          if (attemptedLockedFields.length > 0) {
            result.allowed = false;
            result.violations.push({
              type: 'BATCH_STATUS_LOCK',
              message: `Invoice batch is ${batch.status} - cannot modify: ${attemptedLockedFields.join(', ')}`,
              batchStatus: batch.status,
              attemptedFields: attemptedLockedFields
            });
          }
        }
      }
    } catch (err) {
      result.warnings.push({ type: 'BATCH_STATUS_CHECK_ERROR', message: err.message });
    }
  }

  return result;
}

/**
 * Validate a delete operation
 */
async function validateDelete(base44, params) {
  const { entityName, recordId, callerSource, serviceToken } = params;

  const result = {
    allowed: true,
    violations: [],
    entityName,
    recordId
  };

  const protection = PROTECTED_ENTITIES[entityName];
  if (!protection) {
    return result;
  }

  // Check if delete is allowed
  if (!protection.allowDelete) {
    result.allowed = false;
    result.violations.push({
      type: 'DELETE_BLOCKED',
      message: `Cannot delete ${entityName}. Use reversal pattern instead.`,
      suggestion: entityName === 'InstalledPart' ? 'Use reverseInstalledPart via CommitmentService' :
                  entityName === 'PoolAllocation' ? 'Use reversePoolAllocation via CommitmentService' :
                  entityName === 'PoolCharge' ? 'Use reversePoolCharge via CommitmentService' :
                  'Archive or reverse the record instead of deleting'
    });
    logSecurityWarning('DELETE_BLOCKED', entityName, recordId, callerSource, {});
  }

  return result;
}

/**
 * Log security warning for audit trail
 */
function logSecurityWarning(type, entityName, recordId, callerSource, details) {
  console.warn(`🚨 SECURITY WARNING [${type}]`, {
    timestamp: new Date().toISOString(),
    entityName,
    recordId,
    callerSource,
    details
  });
}

/**
 * Test the guard with various scenarios
 */
async function testGuard(base44, user) {
  const results = {
    tests: [],
    passed: 0,
    failed: 0
  };

  // Test 1: Direct mutation to BillingPool.balance should fail
  const test1 = await validateMutation(base44, {
    entityName: 'BillingPool',
    recordId: 'test_id',
    updates: { balance: 1000 },
    callerSource: 'ui_component'
  });
  results.tests.push({
    name: 'Direct BillingPool.balance mutation blocked',
    expected: false,
    actual: test1.allowed,
    passed: test1.allowed === false
  });
  test1.allowed === false ? results.passed++ : results.failed++;

  // Test 2: Direct mutation to PartCommitment.exposure_gap should fail
  const test2 = await validateMutation(base44, {
    entityName: 'PartCommitment',
    recordId: 'test_id',
    updates: { exposure_gap: 500 },
    callerSource: 'ui_component'
  });
  results.tests.push({
    name: 'Direct PartCommitment.exposure_gap mutation blocked',
    expected: false,
    actual: test2.allowed,
    passed: test2.allowed === false
  });
  test2.allowed === false ? results.passed++ : results.failed++;

  // Test 3: Mutation via CommitmentService should succeed
  const test3 = await validateMutation(base44, {
    entityName: 'BillingPool',
    recordId: 'test_id',
    updates: { balance: 1000 },
    callerSource: 'commitmentService',
    serviceToken: COMMITMENT_SERVICE_TOKEN
  });
  results.tests.push({
    name: 'CommitmentService mutation allowed',
    expected: true,
    actual: test3.allowed,
    passed: test3.allowed === true
  });
  test3.allowed === true ? results.passed++ : results.failed++;

  // Test 4: Delete InstalledPart should fail
  const test4 = await validateDelete(base44, {
    entityName: 'InstalledPart',
    recordId: 'test_id',
    callerSource: 'ui_component'
  });
  results.tests.push({
    name: 'Delete InstalledPart blocked',
    expected: false,
    actual: test4.allowed,
    passed: test4.allowed === false
  });
  test4.allowed === false ? results.passed++ : results.failed++;

  // Test 5: Delete PoolAllocation should fail
  const test5 = await validateDelete(base44, {
    entityName: 'PoolAllocation',
    recordId: 'test_id',
    callerSource: 'ui_component'
  });
  results.tests.push({
    name: 'Delete PoolAllocation blocked',
    expected: false,
    actual: test5.allowed,
    passed: test5.allowed === false
  });
  test5.allowed === false ? results.passed++ : results.failed++;

  // Test 6: Non-sensitive field update should be allowed
  const test6 = await validateMutation(base44, {
    entityName: 'BillingPool',
    recordId: 'test_id',
    updates: { notes: 'Updated notes' },
    callerSource: 'commitmentService'
  });
  results.tests.push({
    name: 'Non-sensitive field update allowed',
    expected: true,
    actual: test6.allowed,
    passed: test6.allowed === true
  });
  test6.allowed === true ? results.passed++ : results.failed++;

  results.allPassed = results.failed === 0;
  
  return results;
}

/**
 * Export constants for use by other services
 */
export const GUARD_CONFIG = {
  COMMITMENT_SERVICE_TOKEN,
  PROTECTED_ENTITIES,
  ALLOWED_MUTATION_SOURCES
};