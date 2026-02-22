/**
 * LIFECYCLE DISPLAY - AK Industrial Mode
 * 
 * Maps commitment_status to simplified display_status for UI.
 * NO complex grouping. NO duplicate badges.
 */

/**
 * Map commitment_status to simplified display_status
 */
export const DISPLAY_STATUS_MAP = {
  planned: 'NEEDS TO ORDER',
  ordered: 'ORDERED',
  partially_received: 'IN PROGRESS',
  partially_installed: 'IN PROGRESS',
  received: 'RECEIVED',
  installed: 'INSTALLED',
  cancelled: 'CANCELLED',
  closed: 'CLOSED'
};

/**
 * Get display status from commitment_status
 * @param {string} commitmentStatus 
 * @returns {string}
 */
export function getDisplayStatus(commitmentStatus) {
  if (!commitmentStatus) return 'NEEDS TO ORDER';
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
    case 'NEEDS TO ORDER':
      return 'text-gray-300 border-l-amber-600';
    case 'ORDERED':
      return 'text-gray-300 border-l-gray-500';
    case 'IN PROGRESS':
      return 'text-gray-300 border-l-gray-400';
    case 'RECEIVED':
      return 'text-gray-300 border-l-gray-300';
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