/**
 * CANONICAL REQUEST STATE — Single Source of Truth
 * 
 * All state derivation flows through this function.
 * State is determined by posted_at + decisions, NOT request.status.
 * 
 * Rules:
 * - No posted_at → draft
 * - archived_at set → archived  (soft check, only if status is also 'archived')
 * - Decisions filtered to AFTER posted_at
 * - Latest valid decision drives state
 * - No valid decisions → awaiting_review
 */

import { isStructuredReview } from "./reviewBehavior";

/**
 * @param {Object} request - The feedback request object
 * @param {Array}  decisions - All decisions for this request (unfiltered)
 * @param {Array}  attachments - All attachments for this request (for structured review image matching)
 * @returns {{ key: string, label: string }}
 */
export function getRequestStateCanonical(request, decisions = [], attachments = []) {
  // Draft: never posted
  if (!request.posted_at) {
    return { key: 'draft', label: 'Draft' };
  }

  // Archived: check status field as storage indicator
  if (request.status === 'archived') {
    return { key: 'archived', label: 'Archived' };
  }

  const postedAt = new Date(request.posted_at);

  // Filter decisions to only those AFTER posted_at
  const validDecisions = decisions.filter(d => {
    if (d.request_id && d.request_id !== request.id) return false;
    const decisionDate = new Date(d.decided_at || d.created_date);
    return decisionDate > postedAt;
  });

  // Check request-level decisions first
  const requestDecisions = validDecisions
    .filter(d => d.target_type === 'request')
    .sort((a, b) => new Date(b.decided_at || b.created_date) - new Date(a.decided_at || a.created_date));

  if (requestDecisions.length > 0) {
    const latest = requestDecisions[0];
    if (latest.decision === 'approved') {
      return { key: 'approved', label: isStructuredReview(request.request_type) ? 'Approved' : 'Confirmed' };
    }
    if (latest.decision === 'changes_requested') {
      return { key: 'changes_requested', label: 'Changes Requested' };
    }
  }

  // Check any changes_requested across all valid decisions (image-level included)
  if (validDecisions.some(d => d.decision === 'changes_requested')) {
    return { key: 'changes_requested', label: 'Changes Requested' };
  }

  // For structured reviews, check if all images have been decided
  if (isStructuredReview(request.request_type)) {
    const imageAttachments = attachments.filter(a => {
      if (a.request_id && a.request_id !== request.id) return false;
      return a.attachment_type === 'image' && a.created_by_type !== 'client_contact' && !a.comment_id;
    });
    const imageDecisions = validDecisions.filter(d => d.target_type === 'attachment_image');

    if (imageAttachments.length > 0 && imageDecisions.length >= imageAttachments.length) {
      const allApproved = imageAttachments.every(img =>
        imageDecisions.some(d =>
          (d.target_attachment_id === img.id || d.target_image_url === img.file_url) &&
          d.decision === 'approved'
        )
      );
      if (allApproved) {
        return { key: 'approved', label: 'Approved' };
      }
    }
  }

  // Check if there are any approvals at all (request-level)
  if (validDecisions.some(d => d.decision === 'approved' && d.target_type === 'request')) {
    return { key: 'approved', label: isStructuredReview(request.request_type) ? 'Approved' : 'Confirmed' };
  }

  return { key: 'awaiting_review', label: 'Needs Review' };
}