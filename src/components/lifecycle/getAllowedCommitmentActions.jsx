import { resolveLifecycleState } from '@/components/supply/resolveCommitmentStateLocal';

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
 * CRITICAL: ELIGIBILITY IS PER COMMITMENT ROW. NEVER AGGREGATE.
 * ============================================================================
 * 
 * Each commitment is an atomic lifecycle unit. Eligibility calculations:
 * - remainingToBill = required_total - invoiced_qty (THIS ROW ONLY)
 * - install eligibility = reserved_from_stock - qty_installed (THIS ROW ONLY)
 * 
 * MUST NOT reference:
 * - sibling commitments
 * - aggregated required_total across commitments
 * - Part-level quantities (except for informational display)
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

  // CANONICAL: effective_required accounts for qty_removed
  const qty_removed = commitment.qty_removed ?? 0;
  const effectiveRequired = Math.max(0, required_total - qty_removed);
  const effectiveReserved = reserved_from_stock;
  const effectiveOnOrder = covered_from_po;
  const effectiveGap = to_order;

  // Derived quantities from canonical fields
  const remaining = Math.max(0, effectiveRequired - qty_installed - qty_cancelled);
  const unorderedQty = effectiveGap;
  const unreceived = effectiveOnOrder;
  const uninstalled = Math.max(0, effectiveReserved - qty_installed);
  
  const isInvoiceLocked = (invoiced_qty ?? 0) > 0;

  const actions = getDefaultActions();

  // RESOLVER-FIRST: Use lifecycle resolver for terminal state checks
  const lifecycle = resolveLifecycleState(commitment);

  // Cancelled commitments - no actions allowed
  if (lifecycle === 'CANCELLED') {
    return actions;
  }

  // Closed commitments - view only
  if (lifecycle === 'CLOSED') {
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

  // CANONICAL: Use backend needs_order / commitment_fulfilled flags when available
  const backendNeedsOrder = commitment.needs_order;
  const backendFulfilled = commitment.commitment_fulfilled;
  const isFulfilled = backendFulfilled === true || (effectiveReserved + effectiveOnOrder + qty_installed >= effectiveRequired && effectiveRequired > 0);
  const actuallyNeedsOrder = backendNeedsOrder === true || (!isFulfilled && unorderedQty > 0);
  
  // CREATE PO — ONLY when needs_order is true (coverage_qty < effective_required)
  if (actuallyNeedsOrder && lifecycle !== 'CANCELLED' && lifecycle !== 'CLOSED') {
    actions.canCreatePO = true;
  }

  // DELTA ORDER - has existing orders AND still needs ordering
  if (effectiveOnOrder > 0 && actuallyNeedsOrder && lifecycle !== 'CANCELLED' && lifecycle !== 'CLOSED') {
    actions.canCreateDeltaOrder = true;
  }

  // RECEIVE - only if has items on order AND commitment is NOT fulfilled
  if (unreceived > 0 && !isFulfilled) {
    actions.canReceive = true;
  }

  // ALLOCATE - only if has received & unallocated (using canonical fields)
  const unallocated = Math.max(0, received_qty - effectiveReserved);
  if (unallocated > 0) {
    actions.canAllocate = true;
  }

  // INSTALL - RESOLVER-ENFORCED: Only when lifecycle_state is INSTALL_READY
  // reserved_from_stock must cover required_total for physical availability.
  // This also passes if there are uninstalled reserved units (partial install scenarios).
  if (uninstalled > 0 && (lifecycle === 'INSTALL_READY' || effectiveReserved > qty_installed)) {
    actions.canInstall = true;
    actions.installableQty = uninstalled;
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

  // ============================================================================
  // ELIGIBILITY IS PER COMMITMENT ROW. NEVER AGGREGATE.
  // ============================================================================
  // BILLING ACTIONS - CANONICAL RULE
  // Invoice eligibility depends ONLY on: required_total - invoiced_qty > 0 (THIS ROW)
  // It does NOT depend on: paid status, credit, install status, stock
  // It does NOT reference: sibling commitments, Part-level totals, aggregated required_total
  // The old check (!hasBeenBilled) was too restrictive - it blocked items
  // that were previously billed but have remaining qty to bill
  const commitmentInvoicedQty = invoiced_qty;
  const remainingToBill = Math.max(0, effectiveRequired - commitmentInvoicedQty);
  
  if (remainingToBill > 0) {
    actions.canCreateInvoice = true;
  }
  
  // TRACE: Debug logging for specific commitment
  if (import.meta.env.DEV && commitment?.id === '699bcdbc64c5d88332d0e0c7') {
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
  // Increase qty - allowed unless terminal (uses resolver)
  if (lifecycle !== 'CLOSED' && lifecycle !== 'CANCELLED') {
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

  // Reallocate to project - only if has uninstalled qty and not terminal
  const maxMove = effectiveRequired - qty_installed;
  if (maxMove > 0 && lifecycle !== 'CLOSED' && lifecycle !== 'CANCELLED') {
    actions.canReallocateToProject = true;
  }

  // Split commitment - need at least 2 qty and not terminal
  if (effectiveRequired > 1 && lifecycle !== 'CLOSED' && lifecycle !== 'CANCELLED') {
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
 * Get lifecycle state description for UI display — RESOLVER-FIRST
 */
export function getCommitmentLifecycleState(commitment) {
  if (!commitment) return { state: 'unknown', label: 'Unknown', color: 'gray' };

  const lifecycle = resolveLifecycleState(commitment);
  const states = {
    PLANNED: { state: 'planned', label: 'Planned', color: 'gray', canProgress: true },
    NEEDS_ORDER: { state: 'needs_order', label: 'Needs Order', color: 'amber', canProgress: true },
    COVERED: { state: 'covered', label: 'Ordered', color: 'blue', canProgress: true },
    INSTALL_READY: { state: 'install_ready', label: 'Ready to Install', color: 'green', canProgress: true },
    INSTALLED: { state: 'installed', label: 'Installed', color: 'green', canProgress: false },
    CLOSED: { state: 'closed', label: 'Closed', color: 'gray', canProgress: false },
    CANCELLED: { state: 'cancelled', label: 'Cancelled', color: 'red', canProgress: false },
  };

  return states[lifecycle] || { state: 'unknown', label: lifecycle, color: 'gray' };
}

/**
 * Check if an action is blocked and get reason
 */
export function getActionBlockReason(commitment, action) {
  const allowed = getAllowedCommitmentActions(commitment);
  
  if (allowed[action]) {
    return null; // Not blocked
  }

  // RESOLVER-FIRST: Block reasons use resolver, not stored status
  const lifecycle = resolveLifecycleState(commitment);
  const reasons = {
    canCreatePO: () => {
      if (lifecycle === 'CANCELLED') return 'Commitment is cancelled';
      if (lifecycle === 'CLOSED') return 'Commitment is closed';
      const toOrder = commitment?.to_order ?? 0;
      if (toOrder <= 0) return 'All required quantity is covered';
      return 'Cannot create PO in current state';
    },
    canCreateDeltaOrder: () => {
      if (lifecycle === 'CANCELLED') return 'Commitment is cancelled';
      if (lifecycle === 'CLOSED') return 'Commitment is closed';
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