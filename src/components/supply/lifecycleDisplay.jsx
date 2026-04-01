/**
 * LIFECYCLE DISPLAY - AK Industrial Mode
 * 
 * RESOLVER-FIRST: All display logic derives from resolveLifecycleState.
 * commitment_status is DEPRECATED for display — cache-only.
 */

import { resolveLifecycleState, getLifecycleLabel, getLifecycleColor, isHiddenByDefault as _isHidden } from './resolveCommitmentStateLocal';

/**
 * Map commitment_status to simplified display_status
 */
// PART 4: Changed "NEEDS TO ORDER" → "PLANNED" to avoid redundancy with inventory badges
export const DISPLAY_STATUS_MAP = {
  planned: 'PLANNED',
  ordered: 'ORDERED',
  partially_received: 'IN PROGRESS',
  partially_installed: 'IN PROGRESS',
  received: 'RECEIVED',
  allocated: 'READY TO INSTALL',
  installed: 'INSTALLED',
  cancelled: 'CANCELLED',
  closed: 'CLOSED'
};

/**
 * Map resolver lifecycle_state to display label
 */
export const LIFECYCLE_STATE_DISPLAY = {
  INSTALL_READY: { label: 'Ready to Install', color: 'text-emerald-400 border-l-emerald-500' },
  COVERED: { label: 'Ordered', color: 'text-blue-400 border-l-blue-500' },
  NEEDS_ORDER: { label: 'Needs Order', color: 'text-amber-400 border-l-amber-600' },
  INSTALLED: { label: 'Installed', color: 'text-gray-400 border-l-gray-600' },
  PLANNED: { label: 'Planned', color: 'text-gray-300 border-l-amber-600' },
};

/**
 * Get display status from commitment — uses resolver as single source of truth.
 * @param {string|Object} commitmentOrStatus - commitment object OR legacy status string
 * @returns {string}
 */
export function getDisplayStatus(commitmentOrStatus) {
  // If passed an object, use the resolver
  if (commitmentOrStatus && typeof commitmentOrStatus === 'object') {
    return getLifecycleLabel(commitmentOrStatus);
  }
  // Legacy string fallback for callers passing commitment_status directly
  if (!commitmentOrStatus) return 'PLANNED';
  const normalized = commitmentOrStatus.toLowerCase().replace(/\s+/g, '_');
  return DISPLAY_STATUS_MAP[normalized] || commitmentOrStatus.toUpperCase();
}

/**
 * Check if commitment should be hidden by default — uses resolver
 * @param {Object} commitment 
 * @returns {boolean}
 */
export function isHiddenByDefault(commitment) {
  return _isHidden(commitment);
}

/**
 * Filter commitments with show/hide toggle
 * @param {Array} commitments 
 * @param {boolean} showClosedCancelled 
 * @returns {Array}
 */
export function filterActiveCommitments(commitments, showClosedCancelled = false) {
  if (!Array.isArray(commitments)) return [];
  if (showClosedCancelled) return commitments;
  return commitments.filter(c => !isHiddenByDefault(c));
}

/**
 * Get display status color — supports both resolver labels and legacy status strings
 * @param {string|Object} displayStatusOrCommitment 
 * @returns {string} Tailwind class
 */
export function getDisplayStatusColor(displayStatusOrCommitment) {
  // If passed a commitment object, use resolver directly
  if (displayStatusOrCommitment && typeof displayStatusOrCommitment === 'object') {
    return getLifecycleColor(displayStatusOrCommitment);
  }
  const displayStatus = displayStatusOrCommitment;
  switch (displayStatus) {
    case 'Planned':
    case 'PLANNED':
      return 'text-gray-300 border-l-amber-600';
    case 'Ordered':
    case 'ORDERED':
      return 'text-blue-400 border-l-blue-500';
    case 'IN PROGRESS':
      return 'text-gray-300 border-l-gray-400';
    case 'RECEIVED':
      return 'text-gray-300 border-l-gray-300';
    case 'Ready to Install':
    case 'READY TO INSTALL':
      return 'text-emerald-400 border-l-emerald-500';
    case 'Needs Order':
    case 'NEEDS ORDER':
      return 'text-amber-400 border-l-amber-600';
    case 'Installed':
    case 'INSTALLED':
      return 'text-gray-400 border-l-gray-600';
    case 'Cancelled':
    case 'CANCELLED':
      return 'text-gray-500 border-l-gray-700';
    case 'Closed':
    case 'CLOSED':
      return 'text-gray-500 border-l-gray-700';
    default:
      return 'text-gray-400 border-l-gray-600';
  }
}

/**
 * Get display info for resolver lifecycle_state
 */
export function getLifecycleStateDisplay(lifecycleState) {
  return LIFECYCLE_STATE_DISPLAY[lifecycleState] || { label: lifecycleState, color: 'text-gray-400 border-l-gray-600' };
}