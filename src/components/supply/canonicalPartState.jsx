/**
 * canonicalPartState — SINGLE SOURCE OF TRUTH for part/commitment state
 * 
 * Every commitment resolves to exactly ONE canonical procurement state.
 * All UI surfaces (PSM, GNO, StockReorder, dashboards) must use this.
 * 
 * CANONICAL STATES (mutually exclusive):
 *   INSTALLED   — qty_installed >= effective_required
 *   READY       — has units available to install NOW (reserved - installed > 0)
 *   ON_ORDER    — covered by PO, awaiting delivery (covered_from_po > 0, no ready units)
 *   NEEDS_ORDER — gap exists, no PO coverage for remaining need
 *   COMPLETE    — fully installed AND fulfilled
 *   PLANNED     — just added, no coverage action taken yet
 * 
 * CANONICAL QUANTITIES (per commitment):
 *   requiredQty       — required_total
 *   effectiveRequired — required_total - qty_removed
 *   reservedQty       — reserved_from_stock
 *   onOrderQty        — covered_from_po
 *   installedQty      — qty_installed
 *   readyToInstallQty — max(0, reserved_from_stock - qty_installed)
 *   gapQty            — max(0, effectiveRequired - reservedQty - onOrderQty - installedQty)
 *   coveredQty        — reservedQty + onOrderQty + installedQty
 */

/**
 * Resolve a single commitment to its canonical state and quantities.
 * 
 * @param {Object} commitment — enriched commitment from read model
 * @returns {{ state: string, quantities: Object }}
 */
export function resolveCanonicalPartState(commitment) {
  if (!commitment) {
    return {
      state: 'PLANNED',
      quantities: {
        requiredQty: 0, effectiveRequired: 0, reservedQty: 0,
        onOrderQty: 0, installedQty: 0, readyToInstallQty: 0,
        gapQty: 0, coveredQty: 0, removedQty: 0,
      },
    };
  }

  const requiredQty = commitment.required_total ?? 0;
  const removedQty = commitment.qty_removed ?? 0;
  const effectiveRequired = Math.max(0, requiredQty - removedQty);
  const reservedQty = commitment.reserved_from_stock ?? 0;
  const onOrderQty = commitment.covered_from_po ?? 0;
  const installedQty = commitment.qty_installed ?? 0;
  // readyToInstallQty: units physically available for install
  // Uses same formula as resolveInstallState: (reserved + covered) - installed
  // covered_from_po represents units received to project allocation
  const readyToInstallQty = Math.max(0, (reservedQty + onOrderQty) - installedQty);
  const coveredQty = reservedQty + onOrderQty + installedQty;
  const gapQty = Math.max(0, effectiveRequired - reservedQty - onOrderQty - installedQty);

  // State resolution — exactly ONE state per commitment
  let state;
  if (effectiveRequired === 0) {
    state = 'PLANNED';
  } else if (installedQty >= effectiveRequired) {
    state = 'COMPLETE';
  } else if (readyToInstallQty > 0) {
    // Has units available to install NOW
    state = 'READY';
  } else if (onOrderQty > 0 && gapQty === 0) {
    state = 'ON_ORDER';
  } else if (gapQty > 0) {
    state = 'NEEDS_ORDER';
  } else if (reservedQty > 0 || onOrderQty > 0) {
    state = 'ON_ORDER';
  } else {
    state = 'PLANNED';
  }

  return {
    state,
    quantities: {
      requiredQty,
      effectiveRequired,
      reservedQty,
      onOrderQty,
      installedQty,
      readyToInstallQty,
      gapQty,
      coveredQty,
      removedQty,
    },
  };
}

/**
 * State display config — colors, labels, icons
 */
export const STATE_DISPLAY = {
  COMPLETE:    { label: 'Complete',     color: 'text-gray-400',    bgColor: 'bg-gray-800/50',    borderColor: 'border-gray-700' },
  READY:       { label: 'Ready',        color: 'text-emerald-400', bgColor: 'bg-emerald-900/30',  borderColor: 'border-emerald-700' },
  ON_ORDER:    { label: 'On Order',     color: 'text-blue-400',    bgColor: 'bg-blue-900/30',     borderColor: 'border-blue-700' },
  NEEDS_ORDER: { label: 'Needs Order',  color: 'text-red-400',     bgColor: 'bg-red-900/30',      borderColor: 'border-red-700' },
  PLANNED:     { label: 'Planned',      color: 'text-gray-500',    bgColor: 'bg-gray-800/30',     borderColor: 'border-gray-700' },
};

/**
 * Aggregate canonical metrics across a list of commitments.
 * Returns BOTH quantity totals and item counts.
 * 
 * @param {Array} items — enriched commitments
 * @returns {{ qty: Object, counts: Object, progressPct: number }}
 */
export function aggregateCanonicalMetrics(items = []) {
  const qty = {
    required: 0,
    reserved: 0,
    onOrder: 0,
    installed: 0,
    readyToInstall: 0,
    gap: 0,
  };

  const counts = {
    total: items.length,
    COMPLETE: 0,
    READY: 0,
    ON_ORDER: 0,
    NEEDS_ORDER: 0,
    PLANNED: 0,
  };

  for (const item of items) {
    const { state, quantities } = resolveCanonicalPartState(item);

    // Accumulate quantities
    qty.required += quantities.requiredQty;
    qty.reserved += quantities.reservedQty;
    qty.onOrder += quantities.onOrderQty;
    qty.installed += quantities.installedQty;
    qty.readyToInstall += quantities.readyToInstallQty;
    qty.gap += quantities.gapQty;

    // Accumulate item counts by state
    counts[state] = (counts[state] || 0) + 1;
  }

  const progressPct = qty.required > 0
    ? Math.round((qty.installed / qty.required) * 100)
    : 0;

  return { qty, counts, progressPct };
}