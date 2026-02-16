/**
 * Centralized definition of structured review types.
 * These request types share common behavior:
 * - Image/attachment-based approval workflows
 * - Per-item decision tracking
 * - Gallery-style presentation
 */

export const STRUCTURED_REVIEW_TYPES = [
  'design_review',
  'budget_review',
  'deliverable_review'
];

/**
 * Check if a request type uses structured review behavior
 * @param {string} type - The request_type value
 * @returns {boolean}
 */
export const isStructuredReview = (type) =>
  STRUCTURED_REVIEW_TYPES.includes(type);