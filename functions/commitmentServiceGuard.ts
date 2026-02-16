import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CommitmentServiceGuard - Mutation Exclusivity Enforcement
 * 
 * This module provides guards to ensure all sensitive mutations go through CommitmentService.
 * Any direct mutation attempt outside the service context will be rejected.
 * 
 * Protected Entities:
 * - PartCommitment (financial fields)
 * - PoolAllocation (all mutations)
 * - PoolCharge (all mutations)
 * - BillingPool (status/financial fields)
 * - PartPurchaseLineItem (cost/lock fields)
 * - InstalledPart (reversal fields)
 */

// Context flag - set by CommitmentService when executing
const SERVICE_CONTEXT_KEY = '__commitment_service_context__';

/**
 * Protected fields that can ONLY be modified via CommitmentService
 */
const PROTECTED_MUTATIONS = {
    PartCommitment: {
        fields: [
            'qty_ordered', 'qty_received', 'qty_installed', 'qty_cancelled',
            'commitment_status', 'billing_status',
            'actual_unit_cost', 'actual_extended_cost',
            'covered_retail_total', 'exposure_gap',
            'cancelled_at', 'cancelled_by', 'cancelled_reason', 'cancellation_type',
            'prepay_satisfied_at', 'scope_reduction_credit_created'
        ],
        operations: ['update', 'delete']
    },
    PoolAllocation: {
        fields: '*', // All fields protected
        operations: ['create', 'update', 'delete']
    },
    PoolCharge: {
        fields: '*',
        operations: ['create', 'update', 'delete']
    },
    BillingPool: {
        fields: [
            'status', 'invoiced_amount', 'paid_amount',
            'allocated_total', 'charges_total', 'balance',
            'closed_at', 'closed_by'
        ],
        operations: ['update', 'delete']
    },
    PartPurchaseLineItem: {
        fields: [
            'unit_price', 'cost_locked_at', 'freight_cost', 'tariff_cost',
            'commitment_id', 'vendor_id'
        ],
        operations: ['update']
    },
    InstalledPart: {
        fields: [
            'is_reversed', 'reversed_at', 'reversed_by',
            'reversal_reason', 'reversal_type'
        ],
        operations: ['update', 'delete']
    }
};

/**
 * Lock enforcement rules
 */
const LOCK_RULES = {
    PartPurchaseLineItem: {
        // If cost_locked_at is set, these fields cannot change
        lockField: 'cost_locked_at',
        lockedFields: ['unit_price', 'vendor_id', 'qty_ordered']
    },
    InstalledPart: {
        // If is_reversed is true, no further changes allowed
        lockField: 'is_reversed',
        lockedFields: '*'
    }
};

/**
 * Validate a mutation request against protection rules
 * @returns {object} { allowed: boolean, reason?: string }
 */
export function validateMutation(entityName, operation, data, existingRecord, isServiceContext) {
    // If called from CommitmentService context, allow
    if (isServiceContext) {
        return { allowed: true };
    }

    const rules = PROTECTED_MUTATIONS[entityName];
    if (!rules) {
        return { allowed: true }; // Entity not protected
    }

    // Check if operation is protected
    if (!rules.operations.includes(operation)) {
        return { allowed: true };
    }

    // Check if any protected fields are being modified
    if (rules.fields === '*') {
        return {
            allowed: false,
            reason: `${entityName} mutations must go through CommitmentService`
        };
    }

    const modifiedFields = Object.keys(data || {});
    const protectedFieldsModified = modifiedFields.filter(f => rules.fields.includes(f));

    if (protectedFieldsModified.length > 0) {
        return {
            allowed: false,
            reason: `Protected fields [${protectedFieldsModified.join(', ')}] on ${entityName} must be modified through CommitmentService`
        };
    }

    return { allowed: true };
}

/**
 * Validate lock constraints on an entity
 * @returns {object} { allowed: boolean, reason?: string }
 */
export function validateLockConstraints(entityName, data, existingRecord) {
    const lockRule = LOCK_RULES[entityName];
    if (!lockRule || !existingRecord) {
        return { allowed: true };
    }

    const lockValue = existingRecord[lockRule.lockField];
    
    // Check if entity is locked
    const isLocked = lockRule.lockField === 'is_reversed' 
        ? lockValue === true 
        : lockValue != null;

    if (!isLocked) {
        return { allowed: true };
    }

    // Check if attempting to modify locked fields
    const modifiedFields = Object.keys(data || {});
    
    if (lockRule.lockedFields === '*') {
        if (modifiedFields.length > 0) {
            return {
                allowed: false,
                reason: `${entityName} is locked (${lockRule.lockField} is set). No modifications allowed.`
            };
        }
    } else {
        const lockedFieldsModified = modifiedFields.filter(f => lockRule.lockedFields.includes(f));
        if (lockedFieldsModified.length > 0) {
            return {
                allowed: false,
                reason: `Cannot modify locked fields [${lockedFieldsModified.join(', ')}] on ${entityName}. Cost is locked.`
            };
        }
    }

    return { allowed: true };
}

/**
 * Assertion helper for CommitmentService internal use
 */
export function assertServiceContext(context, operation) {
    if (!context || !context[SERVICE_CONTEXT_KEY]) {
        const error = new Error(`SECURITY: ${operation} must be called within CommitmentService context`);
        console.error('🚨 MUTATION GUARD VIOLATION:', error.message);
        throw error;
    }
}

/**
 * Create a service context object for CommitmentService
 */
export function createServiceContext(userId) {
    return {
        [SERVICE_CONTEXT_KEY]: true,
        userId,
        timestamp: new Date().toISOString()
    };
}

/**
 * Check if context is from CommitmentService
 */
export function isServiceContext(context) {
    return context && context[SERVICE_CONTEXT_KEY] === true;
}

// Export for use in validation middleware
export const PROTECTED_ENTITIES = Object.keys(PROTECTED_MUTATIONS);
export const LOCK_ENTITIES = Object.keys(LOCK_RULES);

Deno.serve(async (req) => {
    // This endpoint provides validation as a service for UI components
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
        const { action, entityName, operation, data, recordId } = await req.json();

        if (action === 'validateMutation') {
            // Fetch existing record if updating
            let existingRecord = null;
            if (recordId && operation === 'update') {
                try {
                    const records = await base44.asServiceRole.entities[entityName].filter({ id: recordId });
                    existingRecord = records[0];
                } catch (e) {
                    // Entity might not exist yet
                }
            }

            // Always false for direct API calls - must use CommitmentService
            const mutationResult = validateMutation(entityName, operation, data, existingRecord, false);
            
            if (!mutationResult.allowed) {
                console.warn(`🚨 BLOCKED MUTATION: ${entityName}.${operation}`, {
                    reason: mutationResult.reason,
                    data
                });
            }

            // Also check lock constraints
            const lockResult = validateLockConstraints(entityName, data, existingRecord);
            
            if (!lockResult.allowed) {
                console.warn(`🔒 LOCK VIOLATION: ${entityName}`, {
                    reason: lockResult.reason,
                    recordId
                });
                return Response.json({
                    allowed: false,
                    reason: lockResult.reason
                });
            }

            return Response.json(mutationResult);
        }

        if (action === 'getProtectedEntities') {
            return Response.json({
                protectedEntities: PROTECTED_ENTITIES,
                lockEntities: LOCK_ENTITIES,
                rules: PROTECTED_MUTATIONS
            });
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 });

    } catch (error) {
        console.error("CommitmentServiceGuard error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});