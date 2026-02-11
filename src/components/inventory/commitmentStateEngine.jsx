/**
 * Commitment State Engine - Client-side utilities
 * 
 * Central authority for:
 * - commitment_status calculation
 * - quantity validation
 * - lifecycle progression
 * - cancellation validation
 * - attachment validation
 * 
 * Mirror of server-side logic for UI consistency
 */

/**
 * Calculate commitment status from quantities
 * This is the ONLY authority for status determination
 */
export function calculateCommitmentState(commitment) {
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
export function validateCommitmentQuantities(commitment) {
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
export function applyStateEngine(commitment, options = {}) {
  const { enforceValidation = true } = options;

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

/**
 * Get status configuration for display
 */
export const STATUS_CONFIG = {
  planned: { label: 'Planned', color: 'gray', priority: 0 },
  ordered: { label: 'Ordered', color: 'purple', priority: 1 },
  partially_received: { label: 'Partial Recv', color: 'orange', priority: 2 },
  received: { label: 'Received', color: 'cyan', priority: 3 },
  allocated: { label: 'Allocated', color: 'blue', priority: 4 },
  installed: { label: 'Installed', color: 'green', priority: 5 },
  closed: { label: 'Closed', color: 'gray', priority: 6 },
  cancelled: { label: 'Cancelled', color: 'red', priority: -1 }
};

/**
 * Calculate remaining quantities
 */
export function calculateRemainingQty(commitment) {
  const {
    qty_committed = 0,
    qty_installed = 0,
    qty_cancelled = 0
  } = commitment;

  return Math.max(0, qty_committed - qty_installed - qty_cancelled);
}

/**
 * Calculate what can still be ordered
 */
export function calculateOrderableQty(commitment) {
  const {
    qty_committed = 0,
    qty_ordered = 0,
    qty_allocated = 0,
    qty_cancelled = 0
  } = commitment;

  const effective = qty_committed - qty_cancelled;
  const covered = Math.max(qty_ordered, qty_allocated);
  return Math.max(0, effective - covered);
}

/**
 * Calculate what can still be allocated
 */
export function calculateAllocatableQty(commitment) {
  const {
    qty_committed = 0,
    qty_allocated = 0,
    qty_installed = 0,
    qty_cancelled = 0
  } = commitment;

  const effective = qty_committed - qty_cancelled;
  return Math.max(0, effective - qty_allocated);
}

/**
 * Calculate what can still be installed
 */
export function calculateInstallableQty(commitment) {
  const {
    qty_allocated = 0,
    qty_installed = 0
  } = commitment;

  return Math.max(0, qty_allocated - qty_installed);
}

/**
 * Validate if commitment can be cancelled
 * Cancellation allowed only if qty_installed = 0
 */
export function validateCancellation(commitment) {
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
 * Validate if line item can be attached to a build
 * Ensures: SUM(commitments.qty_committed WHERE line_item_id) <= line_item.qty_ordered
 */
export function validateAttachment(lineItem, existingCommitments, requestedQty) {
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
 * Check if requirement fields should be locked
 * Locked if: commitment exists AND (qty_ordered > 0 OR qty_received > 0)
 */
export function isRequirementLocked(commitments, requirementId) {
  const reqCommitments = commitments.filter(c => 
    c.requirement_id === requirementId && 
    c.commitment_status !== 'cancelled'
  );
  
  if (reqCommitments.length === 0) {
    return { locked: false, reason: null };
  }
  
  const hasOrdering = reqCommitments.some(c => 
    (c.qty_ordered || 0) > 0 || (c.qty_received || 0) > 0
  );
  
  if (hasOrdering) {
    return {
      locked: true,
      reason: 'This part is managed by purchase commitments',
      lockedFields: ['qty_needed', 'qty_allocated', 'qty_ordered']
    };
  }
  
  return {
    locked: false,
    reason: 'Commitments exist but no ordering activity yet'
  };
}

/**
 * Validate split operation
 */
export function validateSplit(commitment, splitQty) {
  const { qty_committed = 0, qty_installed = 0 } = commitment;
  const maxSplittable = qty_committed - qty_installed;
  
  if (splitQty <= 0) {
    return { valid: false, reason: 'Split quantity must be positive' };
  }
  
  if (splitQty > maxSplittable) {
    return { 
      valid: false, 
      reason: `Cannot split more than ${maxSplittable} units (${qty_installed} installed)`,
      maxSplittable
    };
  }
  
  if (splitQty >= qty_committed) {
    return { 
      valid: false, 
      reason: 'Split quantity must be less than total committed',
      maxSplittable
    };
  }
  
  return { valid: true, maxSplittable };
}