/**
 * resolveCommitmentStateLocal — Client-side commitment lifecycle resolver
 * 
 * SINGLE SOURCE OF TRUTH for lifecycle state derivation.
 * Mirrors the backend resolveCommitmentState function exactly.
 * 
 * ALL UI components MUST use this instead of reading commitment_status.
 * commitment_status is DEPRECATED for decision-making — cache-only.
 * 
 * Lifecycle states (in priority order):
 *   INSTALLED     — qty_installed >= required_total
 *   INSTALL_READY — reserved_from_stock >= required_total (physical stock covers need)
 *   COVERED       — reserved_from_stock + covered_from_po >= required_total (PO covers gap)
 *   NEEDS_ORDER   — gap > 0
 *   PLANNED       — default / nothing allocated
 *   CANCELLED     — commitment_status === 'cancelled'
 *   CLOSED        — commitment_status === 'closed'
 */

export function resolveLifecycleState(commitment) {
  if (!commitment) return 'PLANNED';

  // Terminal states still read from commitment_status (these are explicit user actions)
  const rawStatus = (commitment.commitment_status || '').toLowerCase();
  if (rawStatus === 'cancelled') return 'CANCELLED';
  if (rawStatus === 'closed') return 'CLOSED';

  const rt = commitment.required_total ?? 0;
  const rfs = commitment.reserved_from_stock ?? 0;
  const cfp = commitment.covered_from_po ?? 0;
  const qi = commitment.qty_installed ?? 0;
  const ct = rfs + cfp;
  const gap = Math.max(0, rt - ct);

  if (qi >= rt && rt > 0) return 'INSTALLED';
  if (rfs >= rt && rt > 0) return 'INSTALL_READY';
  if (ct >= rt && rt > 0) return 'COVERED';
  if (gap > 0) return 'NEEDS_ORDER';
  return 'PLANNED';
}

/**
 * Check if commitment is in a terminal state (cancelled/closed)
 */
export function isTerminalState(commitment) {
  const state = resolveLifecycleState(commitment);
  return state === 'CANCELLED' || state === 'CLOSED';
}

/**
 * Check if commitment is actionable (not terminal, not fully installed)
 */
export function isActionable(commitment) {
  const state = resolveLifecycleState(commitment);
  return !['CANCELLED', 'CLOSED', 'INSTALLED'].includes(state);
}

/**
 * Get display label for resolved lifecycle state
 */
const STATE_LABELS = {
  INSTALLED: 'Installed',
  INSTALL_READY: 'Ready to Install',
  COVERED: 'Ordered',
  NEEDS_ORDER: 'Needs Order',
  PLANNED: 'Planned',
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
};

export function getLifecycleLabel(commitment) {
  const state = resolveLifecycleState(commitment);
  return STATE_LABELS[state] || state;
}

/**
 * Get display color for resolved lifecycle state
 */
const STATE_COLORS = {
  INSTALLED: 'text-gray-400 border-l-gray-600',
  INSTALL_READY: 'text-emerald-400 border-l-emerald-500',
  COVERED: 'text-blue-400 border-l-blue-500',
  NEEDS_ORDER: 'text-amber-400 border-l-amber-600',
  PLANNED: 'text-gray-300 border-l-amber-600',
  CANCELLED: 'text-gray-500 border-l-gray-700',
  CLOSED: 'text-gray-500 border-l-gray-700',
};

export function getLifecycleColor(commitment) {
  const state = resolveLifecycleState(commitment);
  return STATE_COLORS[state] || 'text-gray-400 border-l-gray-600';
}

/**
 * Check if commitment should be hidden by default (terminal states)
 */
export function isHiddenByDefault(commitment) {
  const state = resolveLifecycleState(commitment);
  return state === 'CANCELLED' || state === 'CLOSED';
}