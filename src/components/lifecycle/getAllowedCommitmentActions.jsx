/**
 * getAllowedCommitmentActions - Centralized lifecycle action gating
 * 
 * Returns allowed actions based on commitment state to ensure
 * consistent UI enforcement of business rules across all components.
 * 
 * CANONICAL-ONLY: This function expects the read model shape.
 * No legacy fallbacks. The caller MUST provide canonical fields.
 * 
 * Usage:
 * import { getAllowedCommitmentActions } from '@/components/lifecycle/getAllowedCommitmentActions';
 * const allowed = getAllowedCommitmentActions(commitment);
 * if (allowed.canCreatePO) { ... }
 */

/**
 * Get allowed actions for a commitment based on its current state
 * @param {Object} commitment - Canonical read model shape
 * @returns {Object} Allowed actions object
 * 
 * REQUIRED CANONICAL FIELDS:
 * - required_total: Total quantity required
 * - reserved_from_stock: Quantity reserved from physical inventory  
 * - covered_from_po: Quantity covered by purchase orders
 * - qty_installed: Quantity installed/consumed
 * - to_order: Gap = required - reserved - covered (from read model)
 * - commitment_status: Lifecycle state
 * - billing_status: Billing lifecycle state
 */
export function getAllowedCommitmentActions(commitment) {
  if (!commitment) {
    return getDefaultActions();
  }

  // Extract CANONICAL fields only - no legacy fallbacks
  const {
    commitment_status = 'planned',
    billing_status = 'billable',
    required_total = 0,
    reserved_from_stock = 0,
    covered_from_po = 0,
    qty_installed = 0,
    to_order = 0, // Pre-computed gap from read model
    qty_cancelled = 0,
    // Optional fields for specific actions
    unit_retail_snapshot,
    received_qty = 0, // From read model if available
  } = commitment;

  // All values come directly from read model - NO recomputation
  const effectiveRequired = required_total;
  const effectiveReserved = reserved_from_stock;
  const effectiveOnOrder = covered_from_po;
  const effectiveGap = to_order;

  // Derived quantities from canonical fields
  const remaining = Math.max(0, effectiveRequired - qty_installed - qty_cancelled);
  const unorderedQty = effectiveGap;
  const unreceived = effectiveOnOrder; // Items on order not yet received
  const uninstalled = Math.max(0, effectiveReserved - qty_installed);
  const hasBeenBilled = billing_status && !['not_billable', 'billable'].includes(billing_status);
  const isPaidOrInvoiced = ['invoiced', 'paid'].includes(billing_status);

  // Default all actions to false
  const actions = getDefaultActions();

  // Cancelled commitments - no actions allowed
  if (commitment_status === 'cancelled') {
    return actions;
  }

  // Closed commitments - view only
  if (commitment_status === 'closed') {
    actions.canView = true;
    actions.canViewHistory = true;
    return actions;
  }

  // Base view actions always allowed for non-cancelled
  actions.canView = true;
  actions.canViewHistory = true;
  actions.canEditNotes = true;

  // Edit commitment (qty, pricing) - only before billing locks
  if (!hasBeenBilled && !isPaidOrInvoiced) {
    actions.canEdit = true;
    actions.canReduceQty = qty_installed === 0 || effectiveRequired > qty_installed;
  }

  // CREATE PO - only for planned state with unordered qty (gap > 0)
  // NOT allowed for: ordered, installed, partially_received, received, allocated, cancelled, closed
  if (commitment_status === 'planned' && unorderedQty > 0) {
    actions.canCreatePO = true;
  }

  // DELTA ORDER - only for commitments that already have orders (ordered, partially_received, received)
  // This creates additional PO lines for existing commitments
  const canDeltaOrderStates = ['ordered', 'partially_received', 'received'];
  if (canDeltaOrderStates.includes(commitment_status) && effectiveOnOrder > 0) {
    actions.canCreateDeltaOrder = true;
  }

  // RECEIVE - only if has items on order (covered_from_po > 0)
  if (unreceived > 0) {
    actions.canReceive = true;
  }

  // ALLOCATE - only if has received & unallocated (using canonical fields)
  const unallocated = Math.max(0, (qty_received || 0) - effectiveReserved);
  if (unallocated > 0) {
    actions.canAllocate = true;
  }

  // INSTALL - only if has reserved & uninstalled (reserved_from_stock > qty_installed)
  if (uninstalled > 0) {
    actions.canInstall = true;
  }

  // REVERSE INSTALL - only if has installed parts
  if (qty_installed > 0 && commitment_status !== 'closed') {
    actions.canReverseInstall = true;
  }

  // CANCEL - only before receiving/installing starts
  // After install, must use reduce qty or reverse
  const hasReceived = (qty_received || 0) > 0;
  if (qty_installed === 0 && !hasReceived) {
    actions.canCancel = true;
  } else if (qty_installed === 0 && hasReceived) {
    // Can cancel but will need to return received inventory
    actions.canCancel = true;
    actions.cancelRequiresInventoryReturn = true;
  }

  // BILLING ACTIONS
  if (commitment_status !== 'planned') {
    // Can only bill after ordering has started
    if (!hasBeenBilled && remaining > 0) {
      actions.canCreateInvoice = true;
    }
  }

  // POOL ALLOCATION - only for commitments with retail value
  if (commitment.unit_retail_snapshot && remaining > 0) {
    actions.canAllocateFromPool = true;
  }

  // VENDOR INVOICE - only if has received items and not fully invoiced
  if (hasReceived) {
    actions.canRecordVendorInvoice = true;
  }

  // QUANTITY MUTATION ACTIONS
  // Increase qty - allowed unless closed/cancelled
  if (commitment_status !== 'closed' && commitment_status !== 'cancelled') {
    actions.canIncreaseQty = true;
  }

  // Decrease qty - only if can reduce below ordered/installed (use canonical)
  const maxDecrease = effectiveRequired - Math.max(effectiveOnOrder, qty_installed);
  if (maxDecrease > 0) {
    actions.canDecreaseQty = true;
  }

  // Cancel unordered qty - only if has gap (to_order > 0)
  if (unorderedQty > 0) {
    actions.canCancelUnorderedQty = true;
  }

  // Reallocate to project - only if has uninstalled qty
  const maxMove = effectiveRequired - qty_installed;
  if (maxMove > 0 && commitment_status !== 'closed' && commitment_status !== 'cancelled') {
    actions.canReallocateToProject = true;
  }

  // Split commitment - need at least 2 qty
  if (effectiveRequired > 1 && commitment_status !== 'closed' && commitment_status !== 'cancelled') {
    actions.canSplitCommitment = true;
  }

  // DERIVED STATE FLAGS
  // These indicate issues that need attention (use canonical)
  actions.isOverordered = effectiveOnOrder > effectiveRequired;
  actions.poAdjustmentRequired = actions.isOverordered;

  return actions;
}

/**
 * Get default (all false) actions object
 */
function getDefaultActions() {
  return {
    // View actions
    canView: false,
    canViewHistory: false,
    
    // Edit actions
    canEdit: false,
    canEditNotes: false,
    canReduceQty: false,
    
    // Quantity mutation actions
    canIncreaseQty: false,
    canDecreaseQty: false,
    canCancelUnorderedQty: false,
    canReallocateToProject: false,
    canSplitCommitment: false,
    
    // Procurement lifecycle
    canCreatePO: false,
    canCreateDeltaOrder: false,
    canReceive: false,
    canAllocate: false,
    canInstall: false,
    canReverseInstall: false,
    
    // Cancellation
    canCancel: false,
    cancelRequiresInventoryReturn: false,
    
    // Financial actions
    canCreateInvoice: false,
    canAllocateFromPool: false,
    canRecordVendorInvoice: false,
    
    // Derived state flags
    isOverbilled: false,
    isOverordered: false,
    creditRequired: false,
    poAdjustmentRequired: false,
  };
}

/**
 * Get lifecycle state description for UI display
 */
export function getCommitmentLifecycleState(commitment) {
  if (!commitment) return { state: 'unknown', label: 'Unknown', color: 'gray' };

  const { commitment_status, qty_committed, qty_installed, qty_cancelled } = commitment;
  const remaining = (qty_committed || 0) - (qty_installed || 0) - (qty_cancelled || 0);

  const states = {
    planned: { state: 'planned', label: 'Planned', color: 'gray', canProgress: true },
    ordered: { state: 'ordered', label: 'On Order', color: 'purple', canProgress: true },
    partially_received: { state: 'partially_received', label: 'Partially Received', color: 'orange', canProgress: true },
    received: { state: 'received', label: 'Received', color: 'blue', canProgress: true },
    allocated: { state: 'allocated', label: 'Allocated', color: 'cyan', canProgress: true },
    installed: { 
      state: 'installed', 
      label: remaining === 0 ? 'Fully Installed' : 'Partially Installed', 
      color: 'green',
      canProgress: remaining > 0,
    },
    closed: { state: 'closed', label: 'Closed', color: 'gray', canProgress: false },
    cancelled: { state: 'cancelled', label: 'Cancelled', color: 'red', canProgress: false },
  };

  return states[commitment_status] || { state: 'unknown', label: commitment_status, color: 'gray' };
}

/**
 * Check if an action is blocked and get reason
 */
export function getActionBlockReason(commitment, action) {
  const allowed = getAllowedCommitmentActions(commitment);
  
  if (allowed[action]) {
    return null; // Not blocked
  }

  const reasons = {
    canCreatePO: () => {
      if (commitment?.commitment_status === 'cancelled') return 'Commitment is cancelled';
      if (commitment?.commitment_status === 'closed') return 'Commitment is closed';
      if (commitment?.commitment_status !== 'planned') {
        return `Use "Additional Order" for ${commitment.commitment_status} commitments`;
      }
      if ((commitment?.qty_committed || 0) <= (commitment?.qty_ordered || 0)) {
        return 'All committed quantity already on order';
      }
      return 'Cannot create PO in current state';
    },
    canCreateDeltaOrder: () => {
      if (commitment?.commitment_status === 'cancelled') return 'Commitment is cancelled';
      if (commitment?.commitment_status === 'closed') return 'Commitment is closed';
      if (commitment?.commitment_status === 'planned') return 'Use Create PO for planned commitments';
      if (commitment?.commitment_status === 'installed') return 'Cannot add orders after installation';
      if ((commitment?.qty_ordered || 0) === 0) return 'No existing orders to add to';
      return 'Cannot create delta order in current state';
    },
    canCancel: () => {
      if ((commitment?.qty_installed || 0) > 0) return 'Cannot cancel: parts already installed';
      if ((commitment?.qty_received || 0) > 0) return 'Must return received inventory before cancelling';
      return 'Cannot cancel in current state';
    },
    canInstall: () => {
      if ((commitment?.qty_allocated || 0) <= (commitment?.qty_installed || 0)) {
        return 'No allocated parts available to install';
      }
      return 'Cannot install in current state';
    },
    canEdit: () => {
      if (['invoiced', 'paid'].includes(commitment?.billing_status)) {
        return 'Cannot edit after billing';
      }
      return 'Cannot edit in current state';
    },
  };

  const reasonFn = reasons[action];
  return reasonFn ? reasonFn() : `Action "${action}" not allowed`;
}

export default getAllowedCommitmentActions;