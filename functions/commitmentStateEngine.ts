import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Commitment State Engine
 * 
 * Central authority for:
 * - commitment_status calculation
 * - quantity validation
 * - lifecycle progression
 * - concurrency control
 * 
 * This function can be called directly or used by automations.
 */

/**
 * Calculate commitment status from quantities
 * This is the ONLY authority for status determination
 */
function calculateCommitmentState(commitment) {
  const {
    qty_committed = 0,
    qty_ordered = 0,
    qty_received = 0,
    qty_allocated = 0,
    qty_installed = 0,
    qty_cancelled = 0
  } = commitment;

  // Status calculation rules (in priority order)
  if (qty_cancelled >= qty_committed) {
    return 'cancelled';
  }
  if (qty_installed >= qty_committed) {
    return 'installed';
  }
  if (qty_allocated >= qty_committed) {
    return 'allocated';
  }
  if (qty_received >= qty_committed) {
    return 'received';
  }
  if (qty_received > 0) {
    return 'partially_received';
  }
  if (qty_ordered > 0) {
    return 'ordered';
  }
  return 'planned';
}

/**
 * Validate commitment quantity relationships
 * Returns { valid: boolean, errors: string[], warnings: string[] }
 */
function validateCommitmentQuantities(commitment) {
  const {
    qty_committed = 0,
    qty_ordered = 0,
    qty_received = 0,
    qty_allocated = 0,
    qty_installed = 0,
    qty_cancelled = 0
  } = commitment;

  const errors = [];
  const warnings = [];

  // Rule: qty_installed ≤ qty_allocated
  if (qty_installed > qty_allocated) {
    errors.push(`qty_installed (${qty_installed}) cannot exceed qty_allocated (${qty_allocated})`);
  }

  // Rule: qty_received ≤ qty_ordered (warning only - receiving can happen without PO)
  if (qty_received > qty_ordered && qty_ordered > 0) {
    warnings.push(`qty_received (${qty_received}) exceeds qty_ordered (${qty_ordered})`);
  }

  // Rule: qty_ordered ≤ qty_committed (warning only - can order extra)
  if (qty_ordered > qty_committed) {
    warnings.push(`qty_ordered (${qty_ordered}) exceeds qty_committed (${qty_committed})`);
  }

  // Rule: qty_cancelled + active quantities should not exceed qty_committed
  const activeQty = Math.max(qty_allocated, qty_received, qty_ordered);
  if (qty_cancelled + activeQty > qty_committed * 1.5) {
    warnings.push(`Quantities may be inconsistent: cancelled=${qty_cancelled}, active=${activeQty}, committed=${qty_committed}`);
  }

  // Rule: Negative quantities are invalid
  if (qty_committed < 0 || qty_ordered < 0 || qty_received < 0 || 
      qty_allocated < 0 || qty_installed < 0 || qty_cancelled < 0) {
    errors.push('Negative quantities are not allowed');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Apply state engine to commitment
 * Returns updated commitment data with calculated status
 */
function applyStateEngine(commitment, options = {}) {
  const { enforceValidation = true, allowWarnings = true } = options;

  // Validate quantities
  const validation = validateCommitmentQuantities(commitment);

  if (!validation.valid && enforceValidation) {
    return {
      success: false,
      error: 'Quantity validation failed',
      validationErrors: validation.errors,
      validationWarnings: validation.warnings
    };
  }

  // Calculate new status
  const newStatus = calculateCommitmentState(commitment);

  // Build update
  const update = {
    commitment_status: newStatus,
    integrity_warning: !validation.valid || validation.warnings.length > 0,
    integrity_warning_details: validation.valid 
      ? (validation.warnings.length > 0 ? validation.warnings.join('; ') : null)
      : validation.errors.concat(validation.warnings).join('; ')
  };

  return {
    success: true,
    newStatus,
    update,
    validation
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { 
      action, 
      commitment_id, 
      updates = {}, 
      expected_version,
      trigger_source = 'manual',
      enforce_validation = true 
    } = body;

    // Action: validate - just validate without updating
    if (action === 'validate') {
      const commitment = updates;
      const validation = validateCommitmentQuantities(commitment);
      const status = calculateCommitmentState(commitment);
      
      return Response.json({
        success: true,
        calculated_status: status,
        validation
      });
    }

    // Action: calculate - return calculated state
    if (action === 'calculate') {
      const commitment = await base44.asServiceRole.entities.PartCommitment.get(commitment_id);
      if (!commitment) {
        return Response.json({ error: 'Commitment not found' }, { status: 404 });
      }

      const merged = { ...commitment, ...updates };
      const result = applyStateEngine(merged, { enforceValidation: enforce_validation });
      
      return Response.json({
        success: result.success,
        current: commitment,
        proposed: merged,
        calculated_status: result.newStatus,
        validation: result.validation,
        update: result.update
      });
    }

    // Action: update - apply state engine and update commitment
    if (action === 'update') {
      const commitment = await base44.asServiceRole.entities.PartCommitment.get(commitment_id);
      if (!commitment) {
        return Response.json({ error: 'Commitment not found' }, { status: 404 });
      }

      // Optimistic locking check
      if (expected_version !== undefined && commitment.commitment_version !== expected_version) {
        // Log version conflict
        await base44.asServiceRole.entities.CommitmentAuditLog.create({
          commitment_id,
          action_type: 'version_conflict',
          previous_values: { version: commitment.commitment_version },
          new_values: { expected_version, updates },
          trigger_source,
          validation_passed: false,
          validation_errors: [`Version mismatch: expected ${expected_version}, found ${commitment.commitment_version}`]
        });

        return Response.json({ 
          error: 'Version conflict - commitment was modified by another process',
          current_version: commitment.commitment_version,
          expected_version
        }, { status: 409 });
      }

      // Merge updates
      const merged = { ...commitment, ...updates };

      // Apply state engine
      const result = applyStateEngine(merged, { enforceValidation: enforce_validation });

      if (!result.success) {
        // Log validation error
        await base44.asServiceRole.entities.CommitmentAuditLog.create({
          commitment_id,
          action_type: 'validation_error',
          previous_values: {
            qty_committed: commitment.qty_committed,
            qty_ordered: commitment.qty_ordered,
            qty_received: commitment.qty_received,
            qty_allocated: commitment.qty_allocated,
            qty_installed: commitment.qty_installed
          },
          new_values: updates,
          trigger_source,
          validation_passed: false,
          validation_errors: result.validationErrors
        });

        return Response.json({
          error: result.error,
          validation_errors: result.validationErrors,
          validation_warnings: result.validationWarnings
        }, { status: 400 });
      }

      // Build final update with version increment
      const finalUpdate = {
        ...updates,
        ...result.update,
        commitment_version: (commitment.commitment_version || 1) + 1
      };

      // Update commitment
      await base44.asServiceRole.entities.PartCommitment.update(commitment_id, finalUpdate);

      // Log successful update
      await base44.asServiceRole.entities.CommitmentAuditLog.create({
        commitment_id,
        action_type: result.newStatus !== commitment.commitment_status ? 'status_change' : 'qty_change',
        previous_values: {
          commitment_status: commitment.commitment_status,
          qty_committed: commitment.qty_committed,
          qty_ordered: commitment.qty_ordered,
          qty_received: commitment.qty_received,
          qty_allocated: commitment.qty_allocated,
          qty_installed: commitment.qty_installed,
          commitment_version: commitment.commitment_version
        },
        new_values: {
          commitment_status: result.newStatus,
          ...updates,
          commitment_version: finalUpdate.commitment_version
        },
        trigger_source,
        validation_passed: true,
        validation_errors: result.validation.warnings
      });

      return Response.json({
        success: true,
        commitment_id,
        previous_status: commitment.commitment_status,
        new_status: result.newStatus,
        new_version: finalUpdate.commitment_version,
        validation: result.validation
      });
    }

    return Response.json({ error: 'Invalid action. Use: validate, calculate, or update' }, { status: 400 });

  } catch (error) {
    console.error('State engine error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});