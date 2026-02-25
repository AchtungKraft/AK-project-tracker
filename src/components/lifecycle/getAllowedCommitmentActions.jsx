/**
 * getAllowedCommitmentActions - Centralized lifecycle action gating
 * 
 * Returns allowed actions based on commitment state to ensure
 * consistent UI enforcement of business rules across all components.
 * 
 * CANONICAL-ONLY: This function expects the read model shape.
 * No legacy fallbacks. The caller MUST provide canonical fields.
 * 
 * ============================================================================
 * CRITICAL ELIGIBILITY RULES (Phase 7):
 * ============================================================================
 * 
 * INSTALL ELIGIBILITY:
 *   - Depends ONLY on: reserved_from_stock > qty_installed
 *   - Does NOT depend on: billing_status, payment status, credit
 *   - In-stock parts can ALWAYS be installed regardless of billing state
 * 
 * INVOICE ELIGIBILITY:
 *   - Depends ONLY on: required_total - invoiced_qty > 0
 *   - Does NOT depend on: paid status, credit, install status, stock
 *   - Partially invoiced commitments can be invoiced for remaining qty
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
    invoiced_qty = 0, // For invoice eligibility check
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
  
  // CANONICAL: Edit locking based on invoiced_qty, NOT billing_status enum
  // billing_status can be stale; invoiced_qty is authoritative
  const isInvoiceLocked = (invoiced_qty ?? 0) > 0;

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

  // CANONICAL: Edit commitment (qty, pricing) - lock when invoiced_qty > 0
  // Invoiced amounts are committed to client; changing would invalidate invoice
  if (!isInvoiceLocked) {
    actions.canEdit = true;
    actions.canReduceQty = qty_installed === 0 || effectiveRequired > qty_installed;
  }

  // CANONICAL: CREATE PO - depends ONLY on to_order > 0
  // Lifecycle string does NOT block (except cancelled/closed)
  // A commitment with existing orders but remaining gap can still create POs
  // PHASE 3 FIX: If reserved_from_stock can cover the remaining need, don't suggest PO
  const needsFromStock = Math.max(0, effectiveRequired - qty_installed - effectiveOnOrder);
  const stockCanCover = effectiveReserved >= needsFromStock;
  
  if (unorderedQty > 0 && !['cancelled', 'closed'].includes(commitment_status) && !stockCanCover) {
    actions.canCreatePO = true;
  }

  // CANONICAL: DELTA ORDER - has existing orders AND still has gap
  // Lifecycle string does NOT block (except cancelled/closed)
  if (effectiveOnOrder > 0 && unorderedQty > 0 && !['cancelled', 'closed'].includes(commitment_status)) {
    actions.canCreateDeltaOrder = true;
  }

  // RECEIVE - only if has items on order (covered_from_po > 0)
  if (unreceived > 0) {
    actions.canReceive = true;
  }

  // ALLOCATE - only if has received & unallocated (using canonical fields)
  const unallocated = Math.max(0, received_qty - effectiveReserved);
  if (unallocated > 0) {
    actions.canAllocate = true;
  }

  // INSTALL - only if has reserved & uninstalled (reserved_from_stock > qty_installed)
  // ============================================================================
  // CRITICAL (Phase 7): Install eligibility depends ONLY on inventory state
  // - reserved_from_stock > qty_installed
  // - Does NOT depend on: billing_status, payment status, credit allocations
  // - In-stock committed parts can ALWAYS be installed regardless of billing state
  // - This was a bug where billing_status incorrectly gated install
  // ============================================================================
  if (uninstalled > 0) {
    actions.canInstall = true;
    actions.installableQty = uninstalled; // Expose for UI display
  }

  // REVERSE INSTALL - only if has installed parts
  if (qty_installed > 0 && commitment_status !== 'closed') {
    actions.canReverseInstall = true;
  }

  // CANCEL - only before receiving/installing starts
  // After install, must use reduce qty or reverse
  const hasReceived = received_qty > 0;
  if (qty_installed === 0 && !hasReceived) {
    actions.canCancel = true;
  } else if (qty_installed === 0 && hasReceived) {
    // Can cancel but will need to return received inventory
    actions.canCancel = true;
    actions.cancelRequiresInventoryReturn = true;
  }

  // BILLING ACTIONS - CANONICAL RULE
  // Invoice eligibility depends ONLY on: qty_required - invoiced_qty > 0
  // It does NOT depend on: paid status, credit, install status, stock
  // The old check (!hasBeenBilled) was too restrictive - it blocked items
  // that were previously billed but have remaining qty to bill
  const commitmentInvoicedQty = invoiced_qty;
  const remainingToBill = Math.max(0, effectiveRequired - commitmentInvoicedQty);
  
  if (remainingToBill > 0) {
    actions.canCreateInvoice = true;
  }
  
  // TRACE: Debug logging for specific commitment
  if (process.env.NODE_ENV === 'development' && commitment?.id === '699bcdbc64c5d88332d0e0c7') {
    console.log("🔍 LIFECYCLE TRACE - Heating Pipe", commitment?.id, {
      required_total: effectiveRequired,
      invoiced_qty: commitmentInvoicedQty,
      remainingToBill,
      canCreateInvoice: actions.canCreateInvoice,
      canInstall: actions.canInstall,
      reserved_from_stock: effectiveReserved,
      qty_installed,
      uninstalled,
    });
  }
  
  // Store remaining for external use
  actions.remainingToBill = remainingToBill;

  // POOL ALLOCATION - only for commitments with retail value
  if (unit_retail_snapshot && remaining > 0) {
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

  // CANONICAL: Block reasons use canonical fields only, no legacy qty_* fields
  const reasons = {
    canCreatePO: () => {
      if (commitment?.commitment_status === 'cancelled') return 'Commitment is cancelled';
      if (commitment?.commitment_status === 'closed') return 'Commitment is closed';
      const toOrder = commitment?.to_order ?? 0;
      if (toOrder <= 0) return 'All required quantity is covered';
      return 'Cannot create PO in current state';
    },
    canCreateDeltaOrder: () => {
      if (commitment?.commitment_status === 'cancelled') return 'Commitment is cancelled';
      if (commitment?.commitment_status === 'closed') return 'Commitment is closed';
      const coveredFromPo = commitment?.covered_from_po ?? 0;
      const toOrder = commitment?.to_order ?? 0;
      if (coveredFromPo === 0) return 'No existing orders to add to';
      if (toOrder <= 0) return 'All required quantity is covered';
      return 'Cannot create delta order in current state';
    },
    canCancel: () => {
      if ((commitment?.qty_installed || 0) > 0) return 'Cannot cancel: parts already installed';
      const receivedQty = commitment?.received_qty ?? 0;
      if (receivedQty > 0) return 'Must return received inventory before cancelling';
      return 'Cannot cancel in current state';
    },
    canInstall: () => {
      const availableToInstall = commitment?.available_to_install ?? 
        Math.max(0, (commitment?.reserved_from_stock ?? 0) - (commitment?.qty_installed ?? 0));
      if (availableToInstall <= 0) return 'No parts available to install';
      return 'Cannot install in current state';
    },
    canEdit: () => {
      const invoicedQty = commitment?.invoiced_qty ?? 0;
      if (invoicedQty > 0) return 'Cannot edit after invoicing';
      return 'Cannot edit in current state';
    },
  };

  const reasonFn = reasons[action];
  return reasonFn ? reasonFn() : `Action "${action}" not allowed`;
}

export default getAllowedCommitmentActions;