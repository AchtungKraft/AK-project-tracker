/**
 * SUPPLY_TYPES.js - Canonical Supply View Model Contract
 * 
 * Phase 0 deliverable: Single source of truth for supply state shapes.
 * All UI components MUST consume these shapes - no local math allowed.
 * 
 * GOVERNANCE:
 * - UI is resolver-only for state (no local math for coverage, to_order, available)
 * - All mutations go through executeSupplyAction (single dispatcher)
 * - required_total and reserved_from_stock must always be visible
 */

// ============================================================================
// CORE VIEW MODEL TYPES
// ============================================================================

/**
 * SupplyCommitmentViewModel - The canonical shape for rendering commitment state
 * 
 * This is what every supply-related component receives from read models.
 * Components MUST NOT derive these values locally.
 * 
 * @typedef {Object} SupplyCommitmentViewModel
 * @property {string} commitment_id
 * @property {string} part_id
 * @property {string} part_name
 * @property {string|null} vendor_part_number
 * @property {string|null} featured_photo
 * @property {string} project_id
 * @property {string} project_name
 * @property {string|null} vendor_id
 * @property {string|null} vendor_name
 * 
 * // Canonical quantity fields
 * @property {number} required_total - Total quantity needed for this commitment
 * @property {number} reserved_from_stock - Quantity reserved from physical inventory
 * @property {number} covered_from_po - Quantity covered by purchase orders
 * @property {number} qty_installed - Quantity consumed/installed
 * 
 * // Derived quantities (computed by resolver, NOT by UI)
 * @property {number} to_order - Gap: required - reserved - covered
 * @property {number} on_order_qty - Quantity on open POs not yet received
 * @property {number} received_qty - Quantity received from POs
 * @property {number} available_to_install - reserved + received - installed
 * 
 * // Coverage state
 * @property {'FULL'|'PARTIAL'|'NONE'|'OVER'} coverage_status
 * @property {number} coverage_percent - 0-100+
 * 
 * // Next action recommendation
 * @property {'CREATE_PO'|'RECEIVE'|'INSTALL'|'ALLOCATE_POOL'|'FIX_VENDOR'|'FIX_QTY'|'FIX_INVARIANT'|'COMPLETE'|null} next_action
 * @property {string|null} block_reason_code
 * @property {string|null} block_reason_message
 * 
 * // Source type classification
 * @property {'SHOP_PURCHASED'|'CLIENT_SUPPLIED'|'AK_CUSTOM'|'TAKE_OFF'} source_type
 * 
 * // Financial fields
 * @property {number} unit_cost
 * @property {number} unit_retail
 * @property {number} planned_cost_total
 * @property {number} planned_retail_total
 * @property {number} covered_retail_total
 * @property {number} exposure_gap
 * @property {'not_billable'|'billable'|'invoiced'|'paid'} billing_status
 * 
 * // Inventory snapshot for the part (cross-project)
 * @property {InventorySnapshot} inventory_snapshot
 */

/**
 * InventorySnapshot - Part-level inventory state
 * 
 * @typedef {Object} InventorySnapshot
 * @property {number} physical_stock - Actual count in inventory
 * @property {number} reserved_total - Sum of all reservations across commitments
 * @property {number} available - physical_stock - reserved_total
 * @property {number} on_order_total - Sum of all open PO quantities
 * @property {number} to_order_total - Sum of all gaps across commitments
 */

/**
 * POLineViewModel - Line item within a purchase order
 * 
 * @typedef {Object} POLineViewModel
 * @property {string} line_item_id
 * @property {string} part_id
 * @property {string} part_name
 * @property {string|null} vendor_part_number
 * @property {number} qty_ordered
 * @property {number} qty_received
 * @property {number} qty_remaining - qty_ordered - qty_received
 * @property {number} unit_cost
 * @property {number} extended_cost
 * @property {string|null} commitment_id
 * @property {string|null} project_id
 * @property {string|null} project_name
 * @property {'Ordered'|'Partial'|'Received'|'Cancelled'} status
 */

/**
 * POReceivingViewModel - Full PO state for receiving workflow
 * 
 * @typedef {Object} POReceivingViewModel
 * @property {string} order_id
 * @property {string} po_number
 * @property {string} vendor_id
 * @property {string} vendor_name
 * @property {string} order_date
 * @property {string|null} eta_date
 * @property {'Draft'|'Pending'|'Ordered'|'Partial'|'Received'|'Cancelled'} status
 * @property {number} total_lines
 * @property {number} total_qty_ordered
 * @property {number} total_qty_received
 * @property {number} total_qty_remaining
 * @property {POLineViewModel[]} lines
 */

// ============================================================================
// COVERAGE STATUS CONSTANTS
// ============================================================================

export const COVERAGE_STATUS = {
  FULL: 'FULL',       // required_total <= reserved + covered
  PARTIAL: 'PARTIAL', // reserved + covered > 0 but < required
  NONE: 'NONE',       // reserved + covered = 0
  OVER: 'OVER',       // reserved + covered > required (over-committed)
};

// ============================================================================
// NEXT ACTION CONSTANTS
// ============================================================================

export const NEXT_ACTION = {
  CREATE_PO: 'CREATE_PO',
  RECEIVE: 'RECEIVE',
  INSTALL: 'INSTALL',
  ALLOCATE_POOL: 'ALLOCATE_POOL',
  FIX_VENDOR: 'FIX_VENDOR',
  FIX_QTY: 'FIX_QTY',
  FIX_INVARIANT: 'FIX_INVARIANT',
  COMPLETE: 'COMPLETE',
};

// ============================================================================
// SOURCE TYPE CONSTANTS
// ============================================================================

export const SOURCE_TYPE = {
  SHOP_PURCHASED: 'SHOP_PURCHASED',   // Normal vendor purchase
  CLIENT_SUPPLIED: 'CLIENT_SUPPLIED', // Client provides part, no PO needed
  AK_CUSTOM: 'AK_CUSTOM',             // AK manufactures/builds internally
  TAKE_OFF: 'TAKE_OFF',               // Part removed from vehicle, may resell
};

export const SOURCE_TYPE_LABELS = {
  [SOURCE_TYPE.SHOP_PURCHASED]: 'Shop Purchased',
  [SOURCE_TYPE.CLIENT_SUPPLIED]: 'Client Supplied',
  [SOURCE_TYPE.AK_CUSTOM]: 'AK Custom',
  [SOURCE_TYPE.TAKE_OFF]: 'Take-Off',
};

export const SOURCE_TYPE_COLORS = {
  [SOURCE_TYPE.SHOP_PURCHASED]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  [SOURCE_TYPE.CLIENT_SUPPLIED]: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  [SOURCE_TYPE.AK_CUSTOM]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  [SOURCE_TYPE.TAKE_OFF]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

// ============================================================================
// BLOCK REASON CODES
// ============================================================================

export const BLOCK_REASON = {
  NO_VENDOR: 'NO_VENDOR',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  PREPAY_REQUIRED: 'PREPAY_REQUIRED',
  NEGATIVE_AVAILABLE: 'NEGATIVE_AVAILABLE',
  INVARIANT_VIOLATION: 'INVARIANT_VIOLATION',
  ARCHIVED_PART: 'ARCHIVED_PART',
};

export const BLOCK_REASON_MESSAGES = {
  [BLOCK_REASON.NO_VENDOR]: 'No vendor assigned to part',
  [BLOCK_REASON.INSUFFICIENT_FUNDS]: 'Pool balance insufficient for exposure',
  [BLOCK_REASON.PREPAY_REQUIRED]: 'Prepayment required before ordering',
  [BLOCK_REASON.NEGATIVE_AVAILABLE]: 'Available stock is negative (over-committed)',
  [BLOCK_REASON.INVARIANT_VIOLATION]: 'Data integrity issue detected',
  [BLOCK_REASON.ARCHIVED_PART]: 'Part is archived',
};

// ============================================================================
// HELPER: MAP LEGACY supply_source_type TO NEW SOURCE_TYPE
// ============================================================================

export function mapLegacySourceType(legacyType) {
  const mapping = {
    'STOCK': SOURCE_TYPE.SHOP_PURCHASED,
    'VENDOR': SOURCE_TYPE.SHOP_PURCHASED,
    'CLIENT_SUPPLIED': SOURCE_TYPE.CLIENT_SUPPLIED,
    'AK_CUSTOM': SOURCE_TYPE.AK_CUSTOM,
    'TAKE_OFF': SOURCE_TYPE.TAKE_OFF,
  };
  return mapping[legacyType] || SOURCE_TYPE.SHOP_PURCHASED;
}

// ============================================================================
// HELPER: COMPUTE COVERAGE STATUS (for read-model use only)
// ============================================================================

export function computeCoverageStatus(required, reserved, covered) {
  const total_covered = (reserved || 0) + (covered || 0);
  if (total_covered >= required && required > 0) return COVERAGE_STATUS.FULL;
  if (total_covered > required) return COVERAGE_STATUS.OVER;
  if (total_covered > 0) return COVERAGE_STATUS.PARTIAL;
  return COVERAGE_STATUS.NONE;
}

// ============================================================================
// HELPER: COMPUTE NEXT ACTION (for read-model use only)
// ============================================================================

export function computeNextAction(commitment, partHasVendor, poolBalance, exposureGap) {
  const {
    required_total = 0,
    reserved_from_stock = 0,
    covered_from_po = 0,
    qty_installed = 0,
    requires_prepay = false,
    prepay_satisfied_at = null,
  } = commitment;

  const to_order = Math.max(0, required_total - reserved_from_stock - covered_from_po);
  const available_to_install = reserved_from_stock + covered_from_po - qty_installed;

  // Check blocks first
  if (to_order > 0 && !partHasVendor) {
    return { next_action: NEXT_ACTION.FIX_VENDOR, block_reason_code: BLOCK_REASON.NO_VENDOR };
  }
  if (to_order > 0 && requires_prepay && !prepay_satisfied_at) {
    return { next_action: NEXT_ACTION.ALLOCATE_POOL, block_reason_code: BLOCK_REASON.PREPAY_REQUIRED };
  }
  if (to_order > 0 && exposureGap > poolBalance) {
    return { next_action: NEXT_ACTION.ALLOCATE_POOL, block_reason_code: BLOCK_REASON.INSUFFICIENT_FUNDS };
  }

  // Determine next action
  if (to_order > 0) {
    return { next_action: NEXT_ACTION.CREATE_PO, block_reason_code: null };
  }
  if (covered_from_po > 0 && available_to_install < required_total - qty_installed) {
    // Has PO coverage but not yet received
    return { next_action: NEXT_ACTION.RECEIVE, block_reason_code: null };
  }
  if (available_to_install > 0 && qty_installed < required_total) {
    return { next_action: NEXT_ACTION.INSTALL, block_reason_code: null };
  }
  if (qty_installed >= required_total) {
    return { next_action: NEXT_ACTION.COMPLETE, block_reason_code: null };
  }

  return { next_action: null, block_reason_code: null };
}

// ============================================================================
// INVENTORY CHIP FORMATTER
// ============================================================================

export function formatInventoryChip(snapshot) {
  if (!snapshot) return 'No data';
  const { physical_stock = 0, reserved_total = 0, available = 0, on_order_total = 0, to_order_total = 0 } = snapshot;
  return `Stock ${physical_stock} | Res ${reserved_total} | Avail ${available} | OnOrd ${on_order_total} | ToOrd ${to_order_total}`;
}

// ============================================================================
// DEFAULT EXPORT: EMPTY VIEW MODEL FACTORY
// ============================================================================

export function createEmptyCommitmentViewModel() {
  return {
    commitment_id: '',
    part_id: '',
    part_name: '',
    vendor_part_number: null,
    featured_photo: null,
    project_id: '',
    project_name: '',
    vendor_id: null,
    vendor_name: null,
    required_total: 0,
    reserved_from_stock: 0,
    covered_from_po: 0,
    qty_installed: 0,
    to_order: 0,
    on_order_qty: 0,
    received_qty: 0,
    available_to_install: 0,
    coverage_status: COVERAGE_STATUS.NONE,
    coverage_percent: 0,
    next_action: null,
    block_reason_code: null,
    block_reason_message: null,
    source_type: SOURCE_TYPE.SHOP_PURCHASED,
    unit_cost: 0,
    unit_retail: 0,
    planned_cost_total: 0,
    planned_retail_total: 0,
    covered_retail_total: 0,
    exposure_gap: 0,
    billing_status: 'billable',
    inventory_snapshot: {
      physical_stock: 0,
      reserved_total: 0,
      available: 0,
      on_order_total: 0,
      to_order_total: 0,
    },
  };
}