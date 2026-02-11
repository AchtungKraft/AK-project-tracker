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

  // Rule: qty_installed ≤ qty_allocated (core integrity)
  if (qty_installed > qty_allocated) {
    errors.push(`qty_installed (${qty_installed}) cannot exceed qty_allocated (${qty_allocated})`);
  }

  // Rule: qty_installed ≤ qty_received + qty_allocated (Phase 2E)
  if (qty_installed > qty_received + qty_allocated) {
    errors.push(`qty_installed (${qty_installed}) cannot exceed qty_received + qty_allocated (${qty_received + qty_allocated})`);
  }

  // Rule: qty_received ≤ qty_ordered (warning only - receiving can happen without PO)
  if (qty_received > qty_ordered && qty_ordered > 0) {
    warnings.push(`qty_received (${qty_received}) exceeds qty_ordered (${qty_ordered})`);
  }

  // Rule: qty_ordered ≤ qty_committed (warning only - can order extra)
  if (qty_ordered > qty_committed) {
    warnings.push(`qty_ordered (${qty_ordered}) exceeds qty_committed (${qty_committed})`);
  }

  // Rule: qty_committed ≥ qty_installed (cannot reduce below installed)
  if (qty_committed < qty_installed) {
    errors.push(`qty_committed (${qty_committed}) cannot be less than qty_installed (${qty_installed})`);
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
 * Validate if cancellation is allowed
 */
function validateCancellation(commitment) {
  const { qty_installed = 0 } = commitment;
  
  if (qty_installed > 0) {
    return {
      canCancel: false,
      canReduce: true,
      minQty: qty_installed,
      reason: `Cannot fully cancel: ${qty_installed} unit(s) already installed`
    };
  }
  
  return {
    canCancel: true,
    canReduce: true,
    minQty: 0,
    reason: null
  };
}

/**
 * Validate attachment of line item to commitment
 */
function validateAttachment(lineItem, existingCommitments, requestedQty) {
  const alreadyCommitted = existingCommitments
    .filter(c => 
      (c.order_line_item_ids || []).includes(lineItem.id) &&
      c.commitment_status !== 'cancelled'
    )
    .reduce((sum, c) => sum + (c.qty_committed || 0), 0);
  
  const available = Math.max(0, (lineItem.qty_ordered || 0) - alreadyCommitted);
  
  if (requestedQty > available) {
    return {
      valid: false,
      available,
      alreadyCommitted,
      reason: `Only ${available} units available (${alreadyCommitted} already committed)`
    };
  }
  
  return {
    valid: true,
    available,
    alreadyCommitted,
    reason: null
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

    // Action: cancel - cancel or reduce a commitment
    if (action === 'cancel') {
      const commitment = await base44.asServiceRole.entities.PartCommitment.get(commitment_id);
      if (!commitment) {
        return Response.json({ error: 'Commitment not found' }, { status: 404 });
      }

      const cancellation = validateCancellation(commitment);
      const { reason, reduce_to_qty } = body;
      
      if (!cancellation.canCancel && !reduce_to_qty) {
        return Response.json({
          error: cancellation.reason,
          canReduce: cancellation.canReduce,
          minQty: cancellation.minQty
        }, { status: 400 });
      }

      const user = body.user_email || 'system';
      let finalUpdate;
      
      if (cancellation.canCancel && !reduce_to_qty) {
        // Full cancellation
        finalUpdate = {
          commitment_status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_reason: reason || 'Cancelled via state engine',
          cancelled_by: user,
          commitment_version: (commitment.commitment_version || 1) + 1
        };
      } else {
        // Reduce quantity
        const newQty = Math.max(reduce_to_qty || cancellation.minQty, cancellation.minQty);
        const qtyReduced = commitment.qty_committed - newQty;
        
        finalUpdate = {
          qty_committed: newQty,
          qty_cancelled: (commitment.qty_cancelled || 0) + qtyReduced,
          commitment_version: (commitment.commitment_version || 1) + 1
        };
        
        // Recalculate status
        const newStatus = calculateCommitmentState({ ...commitment, ...finalUpdate });
        finalUpdate.commitment_status = newStatus;
      }

      await base44.asServiceRole.entities.PartCommitment.update(commitment_id, finalUpdate);

      // Audit log
      await base44.asServiceRole.entities.CommitmentAuditLog.create({
        commitment_id,
        action_type: 'status_change',
        previous_values: {
          commitment_status: commitment.commitment_status,
          qty_committed: commitment.qty_committed
        },
        new_values: finalUpdate,
        trigger_source: 'cancel',
        triggered_by: user,
        validation_passed: true
      });

      return Response.json({
        success: true,
        commitment_id,
        action: reduce_to_qty ? 'reduced' : 'cancelled',
        previous_status: commitment.commitment_status,
        new_status: finalUpdate.commitment_status
      });
    }

    // Action: attach - attach line item to build
    if (action === 'attach') {
      const { line_item_id, project_id, part_id, qty_to_attach } = body;
      
      if (!line_item_id || !project_id || !part_id || !qty_to_attach) {
        return Response.json({ error: 'Missing required fields: line_item_id, project_id, part_id, qty_to_attach' }, { status: 400 });
      }

      const lineItem = await base44.asServiceRole.entities.PartPurchaseLineItem.get(line_item_id);
      if (!lineItem) {
        return Response.json({ error: 'Line item not found' }, { status: 404 });
      }

      const existingCommitments = await base44.asServiceRole.entities.PartCommitment.list();
      const validation = validateAttachment(lineItem, existingCommitments, qty_to_attach);
      
      if (!validation.valid) {
        return Response.json({
          error: validation.reason,
          available: validation.available
        }, { status: 400 });
      }

      // Calculate proportional received
      const proportionalReceived = Math.floor((qty_to_attach / (lineItem.qty_ordered || 1)) * (lineItem.qty_received || 0));
      const initialStatus = calculateCommitmentState({
        qty_committed: qty_to_attach,
        qty_ordered: qty_to_attach,
        qty_received: proportionalReceived,
        qty_allocated: 0,
        qty_installed: 0
      });

      const newCommitment = await base44.asServiceRole.entities.PartCommitment.create({
        project_id,
        part_id,
        qty_committed: qty_to_attach,
        qty_ordered: qty_to_attach,
        qty_received: proportionalReceived,
        qty_allocated: 0,
        qty_installed: 0,
        commitment_status: initialStatus,
        source_type: 'order_attachment',
        order_line_item_ids: [line_item_id],
        unit_cost_snapshot: lineItem.unit_cost,
        commitment_version: 1
      });

      // Audit log
      await base44.asServiceRole.entities.CommitmentAuditLog.create({
        commitment_id: newCommitment.id,
        action_type: 'create',
        previous_values: null,
        new_values: {
          project_id,
          part_id,
          qty_committed: qty_to_attach,
          source_type: 'order_attachment',
          line_item_id
        },
        trigger_source: 'manual',
        validation_passed: true
      });

      return Response.json({
        success: true,
        commitment_id: newCommitment.id,
        status: initialStatus,
        qty_committed: qty_to_attach,
        qty_received: proportionalReceived
      });
    }

    return Response.json({ error: 'Invalid action. Use: validate, calculate, update, cancel, or attach' }, { status: 400 });

  } catch (error) {
    console.error('State engine error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});