/**
 * LIFECYCLE DISPLAY - AK Industrial Mode
 * 
 * Maps commitment_status to simplified display_status for UI.
 * NO complex grouping. NO duplicate badges.
 */

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
 * Get display status from commitment_status
 * @param {string} commitmentStatus 
 * @returns {string}
 */
export function getDisplayStatus(commitmentStatus) {
  if (!commitmentStatus) return 'PLANNED';
  const normalized = commitmentStatus.toLowerCase().replace(/\s+/g, '_');
  return DISPLAY_STATUS_MAP[normalized] || commitmentStatus.toUpperCase();
}

/**
 * Check if commitment should be hidden by default
 * @param {Object} commitment 
 * @returns {boolean}
 */
export function isHiddenByDefault(commitment) {
  if (!commitment?.commitment_status) return false;
  const status = commitment.commitment_status.toLowerCase();
  return status === 'cancelled' || status === 'closed';
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
 * Get display status color (monochrome industrial palette)
 * @param {string} displayStatus 
 * @returns {string} Tailwind class
 */
export function getDisplayStatusColor(displayStatus) {
  switch (displayStatus) {
    case 'PLANNED':
      return 'text-gray-300 border-l-amber-600';
    case 'ORDERED':
      return 'text-gray-300 border-l-gray-500';
    case 'IN PROGRESS':
      return 'text-gray-300 border-l-gray-400';
    case 'RECEIVED':
      return 'text-gray-300 border-l-gray-300';
    case 'READY TO INSTALL':
      return 'text-emerald-400 border-l-emerald-500';
    case 'INSTALLED':
      return 'text-gray-400 border-l-gray-600';
    case 'CANCELLED':
      return 'text-gray-500 border-l-gray-700';
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