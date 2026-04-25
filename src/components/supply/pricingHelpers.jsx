/**
 * PHASE 15V - Canonical Pricing Selectors
 * 
 * SINGLE SOURCE OF TRUTH for all retail price reads.
 * NO component may directly access part.retail_override or part.retail_matrix_price.
 * 
 * Usage:
 * import { getPartRetailEffective, getCommitmentRetail, getPricingBadge } from '@/components/supply/pricingHelpers';
 */

/**
 * getPartRetailEffective - Canonical retail price for a Part
 * 
 * Rules:
 * - pricing_mode = 'manual' → retail_override
 * - pricing_mode = 'matrix' → retail_matrix_price
 * - Anything else → throw PRICING_MODE_INVALID
 * 
 * @param {Object} part - Part entity
 * @returns {number} Effective retail price
 * @throws {Error} If pricing_mode is invalid or data is corrupt
 */
export function getPartRetailEffective(part) {
  if (!part) {
    throw new Error('PRICING_ERROR: Part is null');
  }

  const pricing_mode = part.pricing_mode || 'matrix';

  if (pricing_mode === 'manual') {
    if (part.retail_override === null || part.retail_override === undefined || part.retail_override <= 0) {
      throw new Error(`PRICING_MODE_INVALID: Manual mode requires retail_override > 0, got ${part.retail_override}`);
    }
    return part.retail_override;
  }

  if (pricing_mode === 'matrix') {
    // Matrix mode - use retail_matrix_price
    return part.retail_matrix_price || 0;
  }

  throw new Error(`PRICING_MODE_INVALID: Unknown pricing_mode '${pricing_mode}'`);
}

/**
 * getPartRetailEffectiveSafe - Non-throwing version for UI display
 * 
 * @param {Object} part - Part entity
 * @returns {{ value: number, error: string|null }}
 */
export function getPartRetailEffectiveSafe(part) {
  try {
    return { value: getPartRetailEffective(part), error: null };
  } catch (err) {
    return { value: 0, error: err.message };
  }
}

/**
 * getCommitmentRetail - Canonical retail for a Commitment
 * 
 * RULE: ALWAYS use unit_retail_snapshot. NEVER fallback to Part retail.
 * Once commitment exists, its pricing is frozen.
 * 
 * @param {Object} commitment - PartCommitment entity
 * @returns {number} Frozen retail price
 */
export function getCommitmentRetail(commitment) {
  if (!commitment) {
    throw new Error('PRICING_ERROR: Commitment is null');
  }

  // CANONICAL: Always use snapshot - NO FALLBACK
  return commitment.unit_retail_snapshot ?? 0;
}

/**
 * getCommitmentCost - Canonical cost for a Commitment
 * 
 * COST AUTHORITY LIFECYCLE:
 * - If cost_source === 'po' → PO cost (actual)
 * - Else → snapshot (planned estimate)
 * - NEVER falls back to part.default_cost in render path
 * 
 * @param {Object} commitment - PartCommitment entity or view model
 * @returns {number} Resolved cost
 */
export function getCommitmentCost(commitment) {
  if (!commitment) {
    throw new Error('PRICING_ERROR: Commitment is null');
  }

  // Use resolved_unit_cost from view model if available (already PO-first resolved)
  return commitment.resolved_unit_cost ?? commitment.unit_cost_snapshot ?? commitment.unit_cost ?? 0;
}

/**
 * getCommitmentCostLabel - Get human-readable cost source label
 * 
 * @param {Object} commitment - View model with cost_source field
 * @returns {{ label: string, isActual: boolean }}
 */
export function getCommitmentCostLabel(commitment) {
  if (!commitment) return { label: 'Unknown', isActual: false };
  if (commitment.cost_source === 'po') return { label: 'Cost (Actual)', isActual: true };
  return { label: 'Cost (Planned)', isActual: false };
}

/**
 * getCommitmentMarginPct - Compute margin percentage
 * 
 * @param {Object} commitment - PartCommitment entity
 * @returns {number|null} Margin percentage or null if invalid
 */
export function getCommitmentMarginPct(commitment) {
  const cost = getCommitmentCost(commitment);
  const retail = getCommitmentRetail(commitment);
  
  if (retail <= 0) return null;
  return ((retail - cost) / retail) * 100;
}

/**
 * getPricingBadge - Determine pricing badge for UI display
 * 
 * Returns one of:
 * - 'MATRIX' - Using matrix pricing
 * - 'OVERRIDE' - Manual override active
 * - 'NO_COST' - Cost is missing or zero
 * - 'NEG_MARGIN' - Retail < Cost
 * - 'REVIEW' - needs_cost_review flag set
 * - null - No special badge
 * 
 * @param {Object} part - Part entity
 * @returns {{ type: string, color: string, label: string }|null}
 */
export function getPricingBadge(part) {
  if (!part) return null;

  const pricing_mode = part.pricing_mode || 'matrix';
  const cost = part.cost || 0;
  
  let retail_effective;
  try {
    retail_effective = getPartRetailEffective(part);
  } catch (e) {
    retail_effective = 0;
  }

  // Priority order: NO_COST > NEG_MARGIN > REVIEW > mode badge

  if (cost <= 0) {
    return { type: 'NO_COST', color: 'bg-red-600', label: 'NO COST' };
  }

  if (retail_effective > 0 && retail_effective < cost) {
    return { type: 'NEG_MARGIN', color: 'bg-red-700', label: 'NEG MARGIN' };
  }

  if (part.needs_cost_review) {
    return { type: 'REVIEW', color: 'bg-yellow-600', label: 'REVIEW' };
  }

  if (pricing_mode === 'manual') {
    return { type: 'OVERRIDE', color: 'bg-orange-600', label: 'OVERRIDE' };
  }

  if (pricing_mode === 'matrix') {
    return { type: 'MATRIX', color: 'bg-blue-600', label: 'MATRIX' };
  }

  return null;
}

/**
 * canEditCommitmentRetail - Check if commitment retail can be edited
 * 
 * @param {Object} commitment - PartCommitment entity
 * @returns {{ allowed: boolean, reason: string|null }}
 */
export function canEditCommitmentRetail(commitment) {
  if (!commitment) {
    return { allowed: false, reason: 'Commitment not found' };
  }

  const billing_status = commitment.billing_status || 'billable';

  if (billing_status === 'invoiced') {
    return { allowed: false, reason: 'RETAIL_LOCKED_AFTER_INVOICE' };
  }

  if (billing_status === 'paid') {
    return { allowed: false, reason: 'RETAIL_LOCKED_AFTER_PAYMENT' };
  }

  return { allowed: true, reason: null };
}

/**
 * formatCurrency - Format number as currency
 * 
 * @param {number} value 
 * @returns {string}
 */
export function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';
  return `$${value.toFixed(2)}`;
}

/**
 * formatCurrencyWhole - Format as whole dollars (no cents)
 * 
 * @param {number} value 
 * @returns {string}
 */
export function formatCurrencyWhole(value) {
  if (value === null || value === undefined || isNaN(value)) return '$0';
  return `$${Math.round(value)}`;
}

/**
 * formatCurrencyUSD - Format with US locale (thousands separator, 2 decimals)
 * 
 * Hard Rule: All cost and retail values must use this format.
 * Examples:
 * - 1250 → $1,250.00
 * - 1250000 → $1,250,000.00
 * - 0 → $0.00
 * 
 * @param {number} value 
 * @returns {string}
 */
export function formatCurrencyUSD(value) {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}