/**
 * Pricing Integrity Utilities
 * 
 * Centralized pricing validation and status determination.
 * Implements commitment-first pricing cascade authority.
 */

/**
 * Pricing integrity status values
 */
export const PRICING_STATUS = {
  OK: 'ok',
  ESTIMATED_COST: 'estimated_cost',
  MISSING_RETAIL: 'missing_retail',
  MISSING_COST: 'missing_cost',
  MISSING_BOTH: 'missing_both',
  ZERO_VALUE: 'zero_value',
};

/**
 * Pricing source labels
 */
export const PRICING_SOURCE = {
  COMMITMENT: 'commitment',
  COMMITMENT_ACTUAL: 'commitment_actual',
  ASSIGNMENT_OVERRIDE: 'assignment_override',
  ASSIGNMENT: 'assignment',
  LINE_ITEM: 'line_item',
  PART_DEFAULT: 'part_default',
  NONE: 'none',
};

/**
 * Get pricing integrity information for a part/commitment/assignment combination.
 * 
 * Pricing Cascade (Retail):
 * 1. PartCommitment.unit_retail_snapshot (PRIMARY - authoritative)
 * 2. PartBuildAssignment.unit_retail_override (if locked)
 * 3. PartBuildAssignment.unit_retail
 * 4. Part.default_retail
 * 
 * Pricing Cascade (Cost):
 * 1. PartCommitment.actual_unit_cost (from vendor invoice)
 * 2. PartCommitment.unit_cost_snapshot
 * 3. PartPurchaseLineItem.unit_price
 * 4. Part.default_cost
 * 
 * @param {Object} params
 * @param {Object} params.commitment - PartCommitment record (optional)
 * @param {Object} params.assignment - PartBuildAssignment record (optional)
 * @param {Object} params.part - Part record (required)
 * @param {Object} params.lineItem - PartPurchaseLineItem record (optional)
 * @returns {Object} Pricing integrity result
 */
export function getPricingIntegrity({ commitment, assignment, part, lineItem }) {
  let retailValue = 0;
  let costValue = 0;
  let retailSource = PRICING_SOURCE.NONE;
  let costSource = PRICING_SOURCE.NONE;

  // === RETAIL CASCADE ===
  
  // 1. Commitment unit_retail_snapshot (authoritative)
  if (commitment?.unit_retail_snapshot > 0) {
    retailValue = commitment.unit_retail_snapshot;
    retailSource = PRICING_SOURCE.COMMITMENT;
  }
  // 2. Assignment override (locked)
  else if (assignment?.pricing_locked && assignment?.unit_retail_override > 0) {
    retailValue = assignment.unit_retail_override;
    retailSource = PRICING_SOURCE.ASSIGNMENT_OVERRIDE;
  }
  // 3. Assignment unit_retail
  else if (assignment?.unit_retail > 0) {
    retailValue = assignment.unit_retail;
    retailSource = PRICING_SOURCE.ASSIGNMENT;
  }
  // 4. Part default_retail
  else if (part?.default_retail > 0) {
    retailValue = part.default_retail;
    retailSource = PRICING_SOURCE.PART_DEFAULT;
  }

  // === COST CASCADE ===
  
  // 1. Commitment actual_unit_cost (from vendor invoice)
  if (commitment?.actual_unit_cost > 0) {
    costValue = commitment.actual_unit_cost;
    costSource = PRICING_SOURCE.COMMITMENT_ACTUAL;
  }
  // 2. Commitment unit_cost_snapshot
  else if (commitment?.unit_cost_snapshot > 0) {
    costValue = commitment.unit_cost_snapshot;
    costSource = PRICING_SOURCE.COMMITMENT;
  }
  // 3. Line item unit_price
  else if (lineItem?.unit_price > 0) {
    costValue = lineItem.unit_price;
    costSource = PRICING_SOURCE.LINE_ITEM;
  }
  // 4. Assignment default_cost
  else if (assignment?.default_cost > 0) {
    costValue = assignment.default_cost;
    costSource = PRICING_SOURCE.ASSIGNMENT;
  }
  // 5. Part default_cost
  else if (part?.default_cost > 0) {
    costValue = part.default_cost;
    costSource = PRICING_SOURCE.PART_DEFAULT;
  }

  // === DETERMINE STATUS ===
  const isZeroRetail = retailValue === 0;
  const isZeroCost = costValue === 0;
  const hasRetail = retailValue > 0;
  const hasCost = costValue > 0;

  let status = PRICING_STATUS.OK;
  
  if (!hasRetail && !hasCost) {
    status = PRICING_STATUS.MISSING_BOTH;
  } else if (!hasRetail) {
    status = PRICING_STATUS.MISSING_RETAIL;
  } else if (!hasCost) {
    status = PRICING_STATUS.MISSING_COST;
  } else if (retailValue === 0 || costValue === 0) {
    status = PRICING_STATUS.ZERO_VALUE;
  } else if (costSource === PRICING_SOURCE.PART_DEFAULT || costSource === PRICING_SOURCE.ASSIGNMENT) {
    // Cost exists but is from fallback sources - mark as estimated
    status = PRICING_STATUS.ESTIMATED_COST;
  }

  // Calculate margin if both values exist
  let marginPct = null;
  if (hasRetail && hasCost && costValue > 0) {
    marginPct = ((retailValue - costValue) / retailValue) * 100;
  }

  // Check commitment's own pricing_integrity_status
  const commitmentStatus = commitment?.pricing_integrity_status;

  return {
    retailValue,
    costValue,
    retailSource,
    costSource,
    status,
    commitmentStatus,
    isZeroRetail,
    isZeroCost,
    marginPct,
    isCommitmentControlled: !!commitment && (
      retailSource === PRICING_SOURCE.COMMITMENT || 
      costSource === PRICING_SOURCE.COMMITMENT ||
      costSource === PRICING_SOURCE.COMMITMENT_ACTUAL
    ),
    pricingSource: retailSource !== PRICING_SOURCE.NONE ? retailSource : costSource,
  };
}

/**
 * Get display configuration for pricing status badge
 */
export function getPricingStatusBadge(status) {
  switch (status) {
    case PRICING_STATUS.OK:
      return { label: 'OK', color: 'bg-green-500/20 text-green-400 border-green-500/50', icon: '🟢' };
    case PRICING_STATUS.ESTIMATED_COST:
      return { label: 'Estimated', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50', icon: '🟡' };
    case PRICING_STATUS.MISSING_RETAIL:
      return { label: 'No Retail', color: 'bg-orange-500/20 text-orange-400 border-orange-500/50', icon: '🟠' };
    case PRICING_STATUS.MISSING_COST:
      return { label: 'No Cost', color: 'bg-orange-500/20 text-orange-400 border-orange-500/50', icon: '🟠' };
    case PRICING_STATUS.MISSING_BOTH:
      return { label: 'No Pricing', color: 'bg-red-500/20 text-red-400 border-red-500/50', icon: '🔴' };
    case PRICING_STATUS.ZERO_VALUE:
      return { label: '$0 Value', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50', icon: '⚠️' };
    default:
      return { label: 'Unknown', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50', icon: '❓' };
  }
}

/**
 * Get display configuration for pricing source badge
 */
export function getPricingSourceBadge(source) {
  switch (source) {
    case PRICING_SOURCE.COMMITMENT:
    case PRICING_SOURCE.COMMITMENT_ACTUAL:
      return { label: 'Commitment', color: 'bg-purple-500/20 text-purple-400 border-purple-500/50' };
    case PRICING_SOURCE.ASSIGNMENT_OVERRIDE:
      return { label: 'Override', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' };
    case PRICING_SOURCE.ASSIGNMENT:
      return { label: 'Assignment', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50' };
    case PRICING_SOURCE.LINE_ITEM:
      return { label: 'PO Line', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' };
    case PRICING_SOURCE.PART_DEFAULT:
      return { label: 'Part Default', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50' };
    default:
      return { label: 'None', color: 'bg-red-500/20 text-red-400 border-red-500/50' };
  }
}

/**
 * Validate build pricing for export
 * Returns categorized validation results
 * 
 * @param {Array} items - Array of { commitment, assignment, part, lineItem, qty }
 * @returns {Object} Validation result
 */
export function validateBuildPricing(items) {
  const results = {
    valid: [],
    missingRetail: [],
    missingCost: [],
    zeroValue: [],
    missingBoth: [],
    estimated: [],
  };

  let commitmentPricingCount = 0;
  let fallbackPricingCount = 0;
  let missingPricingCount = 0;

  items.forEach(item => {
    const integrity = getPricingIntegrity(item);
    const enrichedItem = { ...item, integrity };

    switch (integrity.status) {
      case PRICING_STATUS.OK:
        results.valid.push(enrichedItem);
        break;
      case PRICING_STATUS.ESTIMATED_COST:
        results.estimated.push(enrichedItem);
        results.valid.push(enrichedItem); // Still exportable
        break;
      case PRICING_STATUS.MISSING_RETAIL:
        results.missingRetail.push(enrichedItem);
        break;
      case PRICING_STATUS.MISSING_COST:
        results.missingCost.push(enrichedItem);
        break;
      case PRICING_STATUS.MISSING_BOTH:
        results.missingBoth.push(enrichedItem);
        break;
      case PRICING_STATUS.ZERO_VALUE:
        results.zeroValue.push(enrichedItem);
        break;
    }

    // Track pricing source metrics
    if (integrity.isCommitmentControlled) {
      commitmentPricingCount++;
    } else if (integrity.retailSource !== PRICING_SOURCE.NONE) {
      fallbackPricingCount++;
    } else {
      missingPricingCount++;
    }
  });

  const total = items.length;
  const hasErrors = results.missingRetail.length > 0 || 
                   results.missingBoth.length > 0;
  const hasWarnings = results.zeroValue.length > 0 || 
                     results.missingCost.length > 0 ||
                     results.estimated.length > 0;

  return {
    ...results,
    hasErrors,
    hasWarnings,
    canExport: !hasErrors,
    metrics: {
      total,
      commitmentPricingPct: total > 0 ? (commitmentPricingCount / total * 100).toFixed(1) : 0,
      fallbackPricingPct: total > 0 ? (fallbackPricingCount / total * 100).toFixed(1) : 0,
      missingPricingPct: total > 0 ? (missingPricingCount / total * 100).toFixed(1) : 0,
    },
  };
}

/**
 * Get row highlighting class based on pricing status
 */
export function getPricingRowHighlight(status) {
  switch (status) {
    case PRICING_STATUS.MISSING_RETAIL:
    case PRICING_STATUS.MISSING_BOTH:
      return 'bg-red-950/30';
    case PRICING_STATUS.ZERO_VALUE:
      return 'bg-amber-950/30';
    case PRICING_STATUS.MISSING_COST:
      return 'bg-orange-950/20';
    default:
      return '';
  }
}