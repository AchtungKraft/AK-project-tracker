/**
 * Part Type Behavior Configuration
 * Defines default behavior flags and UI rules for each part type
 */

export const PART_TYPES = {
  PURCHASED_VENDOR: 'PURCHASED_VENDOR',
  AK_MANUFACTURED: 'AK_MANUFACTURED',
  CLIENT_SUPPLIED: 'CLIENT_SUPPLIED',
  TAKE_OFF: 'TAKE_OFF',
  STOCK_AK: 'STOCK_AK',
  WARRANTY_REPLACEMENT: 'WARRANTY_REPLACEMENT',
};

export const PART_TYPE_LABELS = {
  [PART_TYPES.PURCHASED_VENDOR]: 'Purchased (Vendor)',
  [PART_TYPES.AK_MANUFACTURED]: 'AK Manufactured',
  [PART_TYPES.CLIENT_SUPPLIED]: 'Client Supplied',
  [PART_TYPES.TAKE_OFF]: 'Take-Off Part',
  [PART_TYPES.STOCK_AK]: 'AK Stock',
  [PART_TYPES.WARRANTY_REPLACEMENT]: 'Warranty Replacement',
};

export const PART_TYPE_COLORS = {
  [PART_TYPES.PURCHASED_VENDOR]: 'bg-blue-600',
  [PART_TYPES.AK_MANUFACTURED]: 'bg-red-600',
  [PART_TYPES.CLIENT_SUPPLIED]: 'bg-purple-600',
  [PART_TYPES.TAKE_OFF]: 'bg-amber-600',
  [PART_TYPES.STOCK_AK]: 'bg-green-600',
  [PART_TYPES.WARRANTY_REPLACEMENT]: 'bg-cyan-600',
};

/**
 * Default behavior flags for each part type
 * These are applied when creating a new part or changing part type
 */
export const PART_TYPE_DEFAULTS = {
  [PART_TYPES.PURCHASED_VENDOR]: {
    requires_vendor_purchase: true,
    requires_vendor_payment: true,
    requires_client_billing: true,
    affects_inventory: true,
    affects_margin: true,
    is_asset_recovery: false,
  },
  [PART_TYPES.AK_MANUFACTURED]: {
    requires_vendor_purchase: false,
    requires_vendor_payment: false,
    requires_client_billing: true,
    affects_inventory: true,
    affects_margin: true,
    is_asset_recovery: false,
  },
  [PART_TYPES.CLIENT_SUPPLIED]: {
    requires_vendor_purchase: false,
    requires_vendor_payment: false,
    requires_client_billing: false, // May have handling fee only
    affects_inventory: false, // Track location but not ownership
    affects_margin: false,
    is_asset_recovery: false,
  },
  [PART_TYPES.TAKE_OFF]: {
    requires_vendor_purchase: false,
    requires_vendor_payment: false,
    requires_client_billing: false, // Optional resale
    affects_inventory: true,
    affects_margin: false,
    is_asset_recovery: true,
  },
  [PART_TYPES.STOCK_AK]: {
    requires_vendor_purchase: true,
    requires_vendor_payment: true,
    requires_client_billing: true,
    affects_inventory: true,
    affects_margin: true,
    is_asset_recovery: false,
  },
  [PART_TYPES.WARRANTY_REPLACEMENT]: {
    requires_vendor_purchase: false,
    requires_vendor_payment: false,
    requires_client_billing: false,
    affects_inventory: true,
    affects_margin: false,
    is_asset_recovery: false,
  },
};

/**
 * UI field visibility rules for each part type
 */
export const PART_TYPE_FIELD_VISIBILITY = {
  [PART_TYPES.PURCHASED_VENDOR]: {
    showVendorCost: true,
    showDefaultCost: true,
    showDefaultRetail: true,
    showProductionCost: false,
    showHandlingFee: false,
    showResaleValue: false,
    showVendorFields: true,
    showPricingMode: true,
  },
  [PART_TYPES.AK_MANUFACTURED]: {
    showVendorCost: false,
    showDefaultCost: false,
    showDefaultRetail: true,
    showProductionCost: true,
    showHandlingFee: false,
    showResaleValue: false,
    showVendorFields: false,
    showPricingMode: true,
  },
  [PART_TYPES.CLIENT_SUPPLIED]: {
    showVendorCost: false,
    showDefaultCost: false,
    showDefaultRetail: false,
    showProductionCost: false,
    showHandlingFee: true,
    showResaleValue: false,
    showVendorFields: false,
    showPricingMode: false,
  },
  [PART_TYPES.TAKE_OFF]: {
    showVendorCost: false,
    showDefaultCost: false,
    showDefaultRetail: false,
    showProductionCost: false,
    showHandlingFee: false,
    showResaleValue: true,
    showVendorFields: false,
    showPricingMode: false,
  },
  [PART_TYPES.STOCK_AK]: {
    showVendorCost: true,
    showDefaultCost: true,
    showDefaultRetail: true,
    showProductionCost: false,
    showHandlingFee: false,
    showResaleValue: false,
    showVendorFields: true,
    showPricingMode: true,
  },
  [PART_TYPES.WARRANTY_REPLACEMENT]: {
    showVendorCost: false,
    showDefaultCost: false,
    showDefaultRetail: false,
    showProductionCost: false,
    showHandlingFee: false,
    showResaleValue: false,
    showVendorFields: false,
    showPricingMode: false,
  },
};

/**
 * Get behavior defaults for a part type
 */
export function getPartTypeBehavior(partType) {
  return PART_TYPE_DEFAULTS[partType] || PART_TYPE_DEFAULTS[PART_TYPES.PURCHASED_VENDOR];
}

/**
 * Get field visibility for a part type
 */
export function getPartTypeFieldVisibility(partType) {
  return PART_TYPE_FIELD_VISIBILITY[partType] || PART_TYPE_FIELD_VISIBILITY[PART_TYPES.PURCHASED_VENDOR];
}

/**
 * Apply part type defaults to a part object
 */
export function applyPartTypeDefaults(part, partType) {
  const defaults = getPartTypeBehavior(partType);
  return {
    ...part,
    part_type: partType,
    ...defaults,
  };
}

/**
 * Check if a part can be ordered (based on type and archive status)
 */
export function canOrderPart(part) {
  if (part.is_archived) return false;
  const behavior = getPartTypeBehavior(part.part_type);
  return behavior.requires_vendor_purchase;
}

/**
 * Check if a part can receive inventory
 */
export function canReceiveInventory(part) {
  if (part.is_archived) return false;
  const behavior = getPartTypeBehavior(part.part_type);
  return behavior.affects_inventory;
}

/**
 * Check if a part can be deleted (vs archived)
 */
export function canDeletePart(part, usageData) {
  const {
    purchaseLineItemCount = 0,
    vendorInvoiceCount = 0,
    commitmentCount = 0,
    inventoryQty = 0,
    installCount = 0,
    taskLinkCount = 0,
  } = usageData || {};

  return (
    purchaseLineItemCount === 0 &&
    vendorInvoiceCount === 0 &&
    commitmentCount === 0 &&
    inventoryQty === 0 &&
    installCount === 0 &&
    taskLinkCount === 0
  );
}

/**
 * Archive context options
 */
export const ARCHIVE_CONTEXT_OPTIONS = [
  { value: 'project_change', label: 'Project Change' },
  { value: 'vendor_change', label: 'Vendor Change' },
  { value: 'duplicate_entry', label: 'Duplicate Entry' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'entered_in_error', label: 'Entered in Error' },
  { value: 'superseded', label: 'Superseded by Another Part' },
];

/**
 * Get the effective billing status for a line item
 * Priority: line item override > order level
 */
export function getEffectiveBillingStatus(lineItem, order) {
  if (lineItem.billing_override && lineItem.billing_status_override) {
    return lineItem.billing_status_override;
  }
  return order?.billing_status || 'Not Invoiced';
}

/**
 * Get billing status badge color
 */
export function getBillingStatusColor(status) {
  switch (status) {
    case 'Client Paid':
      return 'bg-green-600';
    case 'Client Invoiced':
      return 'bg-blue-600';
    case 'Not Invoiced':
    default:
      return 'bg-gray-600';
  }
}