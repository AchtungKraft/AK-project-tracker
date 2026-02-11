/**
 * Pricing Integrity Utilities
 * 
 * Centralized validation for pricing data integrity across the system.
 * Uses commitment-first pricing authority as established in Phase 2F.
 * 
 * PRICING SOURCE PRIORITY (DO NOT CHANGE):
 * 
 * Retail:
 *   1. PartCommitment.unit_retail_snapshot
 *   2. PartBuildAssignment.unit_retail_override (if pricing_locked)
 *   3. PartBuildAssignment.unit_retail
 *   4. Part.default_retail
 * 
 * Cost:
 *   1. PartCommitment.actual_unit_cost (from vendor invoice)
 *   2. PartCommitment.unit_cost_snapshot
 *   3. PartPurchaseLineItem.unit_price
 *   4. Part.default_cost
 */

// Pricing integrity status values
export const PRICING_STATUS = {
  OK: 'ok',
  ESTIMATED_COST: 'estimated_cost',
  MISSING_RETAIL: 'missing_retail',
  MISSING_COST: 'missing_cost',
  MISSING_BOTH: 'missing_both',
  ZERO_VALUE: 'zero_value',
  OVERRIDDEN_RETAIL: 'overridden_retail',
  MARGIN_NEGATIVE: 'margin_negative',
};

// Pricing source labels
export const PRICING_SOURCE = {
  COMMITMENT: 'commitment',
  OVERRIDE: 'override',
  ASSIGNMENT: 'assignment',
  PART_DEFAULT: 'part_default',
  LINE_ITEM: 'line_item',
  MATRIX: 'matrix',
  NONE: 'none',
};

/**
 * Get pricing integrity for a part in a build context
 * 
 * @param {Object} options
 * @param {Object} options.commitment - PartCommitment record (optional)
 * @param {Object} options.assignment - PartBuildAssignment record (optional)
 * @param {Object} options.part - Part record (required)
 * @param {Object} options.lineItem - PartPurchaseLineItem record (optional)
 * @returns {Object} Pricing integrity result
 */
export function getPricingIntegrity({ commitment, assignment, part, lineItem }) {
  let retailValue = 0;
  let costValue = 0;
  let retailSource = PRICING_SOURCE.NONE;
  let costSource = PRICING_SOURCE.NONE;
  
  // === RETAIL PRICING CASCADE ===
  
  // 1. Commitment unit_retail_snapshot (authoritative)
  if (commitment?.unit_retail_snapshot > 0) {
    retailValue = commitment.unit_retail_snapshot;
    retailSource = PRICING_SOURCE.COMMITMENT;
  }
  // 2. Assignment override (if locked)
  else if (assignment?.pricing_locked && assignment?.unit_retail_override > 0) {
    retailValue = assignment.unit_retail_override;
    retailSource = PRICING_SOURCE.OVERRIDE;
  }
  // 3. Assignment calculated retail
  else if (assignment?.unit_retail > 0) {
    retailValue = assignment.unit_retail;
    retailSource = PRICING_SOURCE.ASSIGNMENT;
  }
  // 4. Part default retail
  else if (part?.default_retail > 0) {
    retailValue = part.default_retail;
    retailSource = PRICING_SOURCE.PART_DEFAULT;
  }
  
  // === COST PRICING CASCADE ===
  
  // 1. Commitment actual_unit_cost (from vendor invoice)
  if (commitment?.actual_unit_cost > 0) {
    costValue = commitment.actual_unit_cost;
    costSource = PRICING_SOURCE.COMMITMENT;
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
  const hasMissingRetail = retailSource === PRICING_SOURCE.NONE;
  const hasMissingCost = costSource === PRICING_SOURCE.NONE;
  
  let status = PRICING_STATUS.OK;
  
  if (hasMissingRetail && hasMissingCost) {
    status = PRICING_STATUS.MISSING_BOTH;
  } else if (hasMissingRetail) {
    status = PRICING_STATUS.MISSING_RETAIL;
  } else if (hasMissingCost) {
    status = PRICING_STATUS.MISSING_COST;
  } else if (isZeroRetail || isZeroCost) {
    status = PRICING_STATUS.ZERO_VALUE;
  } else if (retailSource === PRICING_SOURCE.OVERRIDE) {
    status = PRICING_STATUS.OVERRIDDEN_RETAIL;
  } else if (costSource !== PRICING_SOURCE.COMMITMENT && commitment) {
    // Has commitment but cost is estimated (not from invoice)
    status = PRICING_STATUS.ESTIMATED_COST;
  } else if (costValue > retailValue) {
    status = PRICING_STATUS.MARGIN_NEGATIVE;
  }
  
  // Use commitment's pricing_integrity_status if available and not overridden
  if (commitment?.pricing_integrity_status && status === PRICING_STATUS.OK) {
    status = commitment.pricing_integrity_status;
  }
  
  // Calculate margin if both values present
  let marginPct = null;
  if (retailValue > 0 && costValue > 0) {
    marginPct = ((retailValue - costValue) / retailValue) * 100;
  }
  
  return {
    retailValue,
    costValue,
    retailSource,
    costSource,
    status,
    isZeroRetail,
    isZeroCost,
    hasMissingRetail,
    hasMissingCost,
    marginPct,
    isCommitmentControlled: retailSource === PRICING_SOURCE.COMMITMENT || costSource === PRICING_SOURCE.COMMITMENT,
    pricingSource: retailSource, // Primary source for display
  };
}

/**
 * Get display info for pricing status badge
 */
export function getPricingStatusDisplay(status) {
  switch (status) {
    case PRICING_STATUS.OK:
      return { label: 'OK', color: 'green', icon: '🟢', className: 'border-green-500 text-green-400 bg-green-500/10' };
    case PRICING_STATUS.ESTIMATED_COST:
      return { label: 'Estimated Cost', color: 'yellow', icon: '🟡', className: 'border-yellow-500 text-yellow-400 bg-yellow-500/10' };
    case PRICING_STATUS.MISSING_RETAIL:
      return { label: 'Missing Retail', color: 'orange', icon: '🟠', className: 'border-orange-500 text-orange-400 bg-orange-500/10' };
    case PRICING_STATUS.MISSING_COST:
      return { label: 'Missing Cost', color: 'orange', icon: '🟠', className: 'border-orange-500 text-orange-400 bg-orange-500/10' };
    case PRICING_STATUS.MISSING_BOTH:
      return { label: 'Missing Both', color: 'red', icon: '🔴', className: 'border-red-500 text-red-400 bg-red-500/10' };
    case PRICING_STATUS.ZERO_VALUE:
      return { label: '$0 Value', color: 'amber', icon: '⚠️', className: 'border-amber-500 text-amber-400 bg-amber-500/10' };
    case PRICING_STATUS.OVERRIDDEN_RETAIL:
      return { label: 'Overridden', color: 'purple', icon: '🟣', className: 'border-purple-500 text-purple-400 bg-purple-500/10' };
    case PRICING_STATUS.MARGIN_NEGATIVE:
      return { label: 'Negative Margin', color: 'red', icon: '⚠️', className: 'border-red-500 text-red-400 bg-red-500/10' };
    default:
      return { label: 'Unknown', color: 'gray', icon: '⚪', className: 'border-gray-500 text-gray-400 bg-gray-500/10' };
  }
}

/**
 * Get display info for pricing source badge
 */
export function getPricingSourceDisplay(source) {
  switch (source) {
    case PRICING_SOURCE.COMMITMENT:
      return { label: 'Commitment', color: 'green', className: 'border-green-500 text-green-400 bg-green-500/10' };
    case PRICING_SOURCE.OVERRIDE:
      return { label: 'Override', color: 'purple', className: 'border-purple-500 text-purple-400 bg-purple-500/10' };
    case PRICING_SOURCE.ASSIGNMENT:
      return { label: 'Assignment', color: 'blue', className: 'border-blue-500 text-blue-400 bg-blue-500/10' };
    case PRICING_SOURCE.PART_DEFAULT:
      return { label: 'Part Default', color: 'yellow', className: 'border-yellow-500 text-yellow-400 bg-yellow-500/10' };
    case PRICING_SOURCE.LINE_ITEM:
      return { label: 'PO Line', color: 'cyan', className: 'border-cyan-500 text-cyan-400 bg-cyan-500/10' };
    case PRICING_SOURCE.MATRIX:
      return { label: 'Matrix', color: 'indigo', className: 'border-indigo-500 text-indigo-400 bg-indigo-500/10' };
    default:
      return { label: 'None', color: 'gray', className: 'border-gray-500 text-gray-400 bg-gray-500/10' };
  }
}

/**
 * Get row highlight class based on pricing status
 */
export function getPricingRowHighlight(status) {
  switch (status) {
    case PRICING_STATUS.MISSING_BOTH:
    case PRICING_STATUS.MISSING_RETAIL:
      return 'bg-red-950/20';
    case PRICING_STATUS.ZERO_VALUE:
    case PRICING_STATUS.MARGIN_NEGATIVE:
      return 'bg-amber-950/20';
    default:
      return '';
  }
}

/**
 * Validate build pricing and return issues summary
 * 
 * @param {Object} options
 * @param {string} options.buildId - Project/Build ID
 * @param {Array} options.commitments - PartCommitment records
 * @param {Array} options.assignments - PartBuildAssignment records
 * @param {Array} options.requirements - PartProjectRequirement records
 * @param {Array} options.parts - Part records
 * @param {Array} options.lineItems - PartPurchaseLineItem records
 * @returns {Object} Validation results
 */
export function validateBuildPricing({ buildId, commitments = [], assignments = [], requirements = [], parts = [], lineItems = [] }) {
  const buildCommitments = commitments.filter(c => c.project_id === buildId && c.commitment_status !== 'cancelled');
  const buildAssignments = assignments.filter(a => a.project_id === buildId);
  const buildRequirements = requirements.filter(r => r.project_id === buildId);
  
  const missingRetailItems = [];
  const missingCostItems = [];
  const zeroValueItems = [];
  const allItems = [];
  
  const processedPartIds = new Set();
  
  // Process all parts in this build
  const allPartIds = new Set([
    ...buildCommitments.map(c => c.part_id),
    ...buildAssignments.map(a => a.part_id),
    ...buildRequirements.map(r => r.part_id),
  ]);
  
  allPartIds.forEach(partId => {
    if (processedPartIds.has(partId)) return;
    processedPartIds.add(partId);
    
    const part = parts.find(p => p.id === partId);
    if (!part) return;
    
    const commitment = buildCommitments.find(c => c.part_id === partId);
    const assignment = buildAssignments.find(a => a.part_id === partId);
    const requirement = buildRequirements.find(r => r.part_id === partId);
    const lineItem = lineItems.find(li => li.part_id === partId);
    
    const integrity = getPricingIntegrity({ commitment, assignment, part, lineItem });
    
    const item = {
      partId,
      partName: part.part_name,
      partNumber: part.vendor_part_number,
      qtyNeeded: commitment?.qty_committed || assignment?.qty_needed || requirement?.qty_needed || 0,
      ...integrity,
      commitment,
      assignment,
    };
    
    allItems.push(item);
    
    if (integrity.hasMissingRetail || integrity.status === PRICING_STATUS.MISSING_BOTH) {
      missingRetailItems.push(item);
    }
    if (integrity.hasMissingCost || integrity.status === PRICING_STATUS.MISSING_BOTH) {
      missingCostItems.push(item);
    }
    if (integrity.isZeroRetail || integrity.isZeroCost) {
      zeroValueItems.push(item);
    }
  });
  
  // Calculate metrics
  const totalItems = allItems.length;
  const commitmentPricingCount = allItems.filter(i => i.isCommitmentControlled).length;
  const fallbackPricingCount = allItems.filter(i => !i.isCommitmentControlled && i.retailSource !== PRICING_SOURCE.NONE).length;
  const missingPricingCount = missingRetailItems.length;
  
  return {
    isValid: missingRetailItems.length === 0,
    hasWarnings: zeroValueItems.length > 0 || missingCostItems.length > 0,
    missingRetailItems,
    missingCostItems,
    zeroValueItems,
    allItems,
    metrics: {
      totalItems,
      commitmentPricingCount,
      fallbackPricingCount,
      missingPricingCount,
      commitmentPricingPct: totalItems > 0 ? Math.round((commitmentPricingCount / totalItems) * 100) : 0,
      fallbackPricingPct: totalItems > 0 ? Math.round((fallbackPricingCount / totalItems) * 100) : 0,
      missingPricingPct: totalItems > 0 ? Math.round((missingPricingCount / totalItems) * 100) : 0,
    },
  };
}

/**
 * Group items by specified field
 */
export const GROUP_BY_OPTIONS = {
  NONE: 'none',
  CATEGORY_STATUS: 'category_status',
  STATUS_CATEGORY: 'status_category',
  VENDOR: 'vendor',
  PRICING_STATUS: 'pricing_status',
  COMMITMENT_STATUS: 'commitment_status',
  LOCATION: 'location',
};

/**
 * Group and sort items based on grouping mode
 * 
 * @param {Array} items - Items to group
 * @param {string} groupBy - Grouping mode
 * @param {Object} lookups - Lookup data { categories, vendors, locations, commitments }
 * @returns {Array} Grouped items array [{key, label, items, totalRetail, totalCost}]
 */
export function groupAndSortItems(items, groupBy, lookups = {}) {
  const { categories = [], vendors = [], locations = [], commitments = [] } = lookups;
  
  if (groupBy === GROUP_BY_OPTIONS.NONE) {
    return [{ key: 'all', label: 'All Parts', items, totalRetail: 0, totalCost: 0 }];
  }
  
  const groups = {};
  
  items.forEach(item => {
    let groupKey = 'other';
    let groupLabel = 'Other';
    let sortOrder = 999;
    
    switch (groupBy) {
      case GROUP_BY_OPTIONS.CATEGORY_STATUS: {
        const category = categories.find(c => c.id === item.part?.part_category_id);
        const catName = category?.name || 'Uncategorized';
        groupKey = `${catName}_${item._status?.key || 'unknown'}`;
        groupLabel = `${catName} → ${item._status?.label || 'Unknown'}`;
        sortOrder = category?.sort_order || 999;
        break;
      }
      case GROUP_BY_OPTIONS.STATUS_CATEGORY: {
        const category = categories.find(c => c.id === item.part?.part_category_id);
        const catName = category?.name || 'Uncategorized';
        groupKey = `${item._status?.key || 'unknown'}_${catName}`;
        groupLabel = `${item._status?.label || 'Unknown'} → ${catName}`;
        sortOrder = getStatusSortOrder(item._status?.key);
        break;
      }
      case GROUP_BY_OPTIONS.VENDOR: {
        const vendor = vendors.find(v => v.id === item.part?.default_vendor_id);
        groupKey = vendor?.id || 'no_vendor';
        groupLabel = vendor?.vendor_name || 'No Vendor';
        sortOrder = vendor?.vendor_name?.charCodeAt(0) || 999;
        break;
      }
      case GROUP_BY_OPTIONS.PRICING_STATUS: {
        const pricingStatus = item.pricingIntegrity?.status || PRICING_STATUS.OK;
        groupKey = pricingStatus;
        groupLabel = getPricingStatusDisplay(pricingStatus).label;
        sortOrder = getPricingStatusSortOrder(pricingStatus);
        break;
      }
      case GROUP_BY_OPTIONS.COMMITMENT_STATUS: {
        const commitment = commitments.find(c => c.part_id === item.part?.id && c.project_id === item.projectId);
        const status = commitment?.commitment_status || 'no_commitment';
        groupKey = status;
        groupLabel = status === 'no_commitment' ? 'No Commitment' : status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        sortOrder = getCommitmentStatusSortOrder(status);
        break;
      }
      case GROUP_BY_OPTIONS.LOCATION: {
        const location = locations.find(l => l.id === item.locationId);
        groupKey = location?.id || 'no_location';
        groupLabel = location?.location_area || 'No Location';
        sortOrder = location?.sort_order || 999;
        break;
      }
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = { key: groupKey, label: groupLabel, items: [], sortOrder };
    }
    groups[groupKey].items.push(item);
  });
  
  // Calculate totals and sort
  return Object.values(groups)
    .map(group => ({
      ...group,
      totalRetail: group.items.reduce((sum, i) => sum + ((i.pricingIntegrity?.retailValue || 0) * (i.qtyNeeded || 0)), 0),
      totalCost: group.items.reduce((sum, i) => sum + ((i.pricingIntegrity?.costValue || 0) * (i.qtyNeeded || 0)), 0),
      partCount: group.items.length,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function getStatusSortOrder(status) {
  const order = {
    'Need To Order': 1,
    'Needed': 2,
    'On Order': 3,
    'Partially Allocated': 4,
    'Allocated + On Order': 5,
    'Allocated': 6,
    'Partially Installed': 7,
    'Installed': 8,
  };
  return order[status] || 99;
}

function getPricingStatusSortOrder(status) {
  const order = {
    [PRICING_STATUS.MISSING_BOTH]: 1,
    [PRICING_STATUS.MISSING_RETAIL]: 2,
    [PRICING_STATUS.MISSING_COST]: 3,
    [PRICING_STATUS.ZERO_VALUE]: 4,
    [PRICING_STATUS.MARGIN_NEGATIVE]: 5,
    [PRICING_STATUS.ESTIMATED_COST]: 6,
    [PRICING_STATUS.OVERRIDDEN_RETAIL]: 7,
    [PRICING_STATUS.OK]: 8,
  };
  return order[status] || 99;
}

function getCommitmentStatusSortOrder(status) {
  const order = {
    'planned': 1,
    'ordered': 2,
    'partially_received': 3,
    'received': 4,
    'allocated': 5,
    'installed': 6,
    'closed': 7,
    'cancelled': 8,
    'no_commitment': 99,
  };
  return order[status] || 99;
}