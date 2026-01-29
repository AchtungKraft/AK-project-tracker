/**
 * Centralized Retail Pricing Utilities
 * 
 * This is the SINGLE source of truth for pricing calculations.
 * All pricing logic MUST use these functions.
 */

/**
 * Find the matching markup tier from the matrix
 * @param {number} defaultCost - The part's cost
 * @param {Array} matrixTiers - All RetailMarkupMatrix rows
 * @returns {Object|null} - The matching tier or null
 */
export function getMarkupFromMatrix(defaultCost, matrixTiers) {
  if (defaultCost === null || defaultCost === undefined || defaultCost <= 0) {
    return null;
  }
  
  const activeTiers = matrixTiers
    .filter(t => t.active !== false)
    .sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0));
  
  return activeTiers.find(t => 
    defaultCost >= (t.min_cost || 0) && 
    (t.max_cost === null || t.max_cost === undefined || defaultCost < t.max_cost)
  ) || null;
}

/**
 * Calculate the unit retail price from cost and markup
 * @param {number} defaultCost - The part's cost  
 * @param {Object} matrixRow - The matching markup tier
 * @returns {number} - Calculated unit retail, rounded to 2 decimals
 */
export function calculateUnitRetail(defaultCost, matrixRow) {
  if (!matrixRow || !defaultCost || defaultCost <= 0) {
    return 0;
  }
  return Math.round(defaultCost * (1 + (matrixRow.markup_pct || 0)) * 100) / 100;
}

/**
 * Apply retail pricing to a PartBuildAssignment
 * Returns the pricing fields to update (does NOT mutate input)
 * 
 * @param {Object} assignment - The PartBuildAssignment record
 * @param {number} defaultCost - The cost to use (from assignment or part)
 * @param {Array} matrixTiers - All RetailMarkupMatrix rows
 * @returns {Object|null} - Fields to update, or null if no update needed
 */
export function applyRetailPricing(assignment, defaultCost, matrixTiers) {
  // If pricing is locked, do nothing
  if (assignment?.pricing_locked === true) {
    return null;
  }
  
  // If no cost, can't calculate
  if (!defaultCost || defaultCost <= 0) {
    return null;
  }
  
  // Find matching tier
  const tier = getMarkupFromMatrix(defaultCost, matrixTiers);
  
  if (!tier) {
    // No matching tier found - return null (don't clear existing pricing)
    return null;
  }
  
  // Calculate retail
  const unitRetail = calculateUnitRetail(defaultCost, tier);
  
  return {
    default_cost: defaultCost,
    unit_retail: unitRetail,
    applied_markup_pct: tier.markup_pct,
    pricing_source: 'matrix'
  };
}

/**
 * Check if pricing needs to be recalculated
 * @param {Object} assignment - The PartBuildAssignment
 * @param {number} newCost - The new cost value
 * @returns {boolean}
 */
export function needsPricingUpdate(assignment, newCost) {
  if (assignment?.pricing_locked === true) {
    return false;
  }
  
  // No cost, nothing to do
  if (!newCost || newCost <= 0) {
    return false;
  }
  
  // Cost changed
  if ((assignment?.default_cost || 0) !== newCost) {
    return true;
  }
  
  // No retail price yet
  if (!assignment?.unit_retail || assignment.unit_retail <= 0) {
    return true;
  }
  
  return false;
}

/**
 * Get pricing display info for UI
 * @param {Object} assignment - The PartBuildAssignment
 * @returns {Object} - Display info
 */
export function getPricingDisplayInfo(assignment) {
  if (assignment?.pricing_locked && assignment?.unit_retail_override) {
    return {
      unitRetail: assignment.unit_retail_override,
      source: 'override',
      label: 'Custom / Engineered',
      isLocked: true,
      markup: null
    };
  }
  
  if (assignment?.unit_retail && assignment?.pricing_source === 'matrix') {
    return {
      unitRetail: assignment.unit_retail,
      source: 'matrix',
      label: 'Matrix Pricing',
      isLocked: false,
      markup: assignment.applied_markup_pct
    };
  }
  
  return {
    unitRetail: 0,
    source: 'none',
    label: 'Not Calculated',
    isLocked: false,
    markup: null
  };
}