/**
 * Deterministic Review Ownership Model
 * 
 * This module provides derived state for determining who "owns" the next action
 * on a feedback request - either AK (internal team) or the client.
 * 
 * Ownership States:
 * - 'ak_needs_review': Internal team needs to take action
 * - 'waiting_on_client': Awaiting client response
 * - 'done': Resolved (approved or archived)
 */

/**
 * Get the most recent client activity timestamp for a request
 * Client activity includes: comments from clients, decisions from clients
 */
export function getLatestClientActivity(request, comments, decisions) {
  const postedAt = request.posted_at ? new Date(request.posted_at) : null;
  
  // Get client comments after posted_at
  const clientCommentDates = comments
    .filter(c => {
      if (c.request_id !== request.id) return false;
      if (c.author_type !== 'client_contact') return false;
      const commentDate = c.posted_at ? new Date(c.posted_at) : new Date(c.created_date);
      return postedAt ? commentDate > postedAt : true;
    })
    .map(c => c.posted_at ? new Date(c.posted_at) : new Date(c.created_date));

  // Get client decisions after posted_at
  const clientDecisionDates = decisions
    .filter(d => {
      if (d.request_id !== request.id) return false;
      if (d.decided_by_type !== 'client_contact') return false;
      const decisionDate = d.decided_at ? new Date(d.decided_at) : new Date(d.created_date);
      return postedAt ? decisionDate > postedAt : true;
    })
    .map(d => d.decided_at ? new Date(d.decided_at) : new Date(d.created_date));

  const allDates = [...clientCommentDates, ...clientDecisionDates];
  
  if (allDates.length === 0) return null;
  
  return new Date(Math.max(...allDates.map(d => d.getTime())));
}

/**
 * Check if there are pending or changes-requested image decisions for design reviews
 */
export function hasUnresolvedDesignReviewImages(request, decisions, attachments) {
  if (request.request_type !== 'design_review') return false;
  
  const postedAt = request.posted_at ? new Date(request.posted_at) : null;
  const lastInternalView = request.last_viewed_by_internal_at 
    ? new Date(request.last_viewed_by_internal_at) 
    : null;
  
  // Get images for this request (internal uploads only, not attached to comments)
  const images = attachments.filter(a => 
    a.request_id === request.id && 
    a.attachment_type === 'image' && 
    a.created_by_type !== 'client_contact' && 
    !a.comment_id
  );
  
  if (images.length === 0) return false;
  
  // Get relevant decisions (after posted_at)
  const relevantDecisions = decisions.filter(d => {
    if (d.request_id !== request.id) return false;
    if (d.target_type !== 'attachment_image') return false;
    const decisionDate = d.decided_at ? new Date(d.decided_at) : new Date(d.created_date);
    return postedAt ? decisionDate > postedAt : true;
  });
  
  // Check for any changes requested that are after last internal view
  const hasChangesAfterView = relevantDecisions.some(d => {
    if (d.decision !== 'changes_requested') return false;
    if (!lastInternalView) return true;
    const decisionDate = d.decided_at ? new Date(d.decided_at) : new Date(d.created_date);
    return decisionDate > lastInternalView;
  });
  
  return hasChangesAfterView;
}

/**
 * Determine the Review Ownership state for a request
 * 
 * @returns {Object} { ownership: 'ak_needs_review' | 'waiting_on_client' | 'done', reason: string }
 */
export function getReviewOwnership(request, comments, decisions, attachments) {
  // Done states
  if (request.status === 'approved') {
    return { ownership: 'done', reason: 'approved' };
  }
  if (request.status === 'archived') {
    return { ownership: 'done', reason: 'archived' };
  }
  if (request.status === 'draft') {
    return { ownership: 'done', reason: 'draft' };
  }
  
  // Active statuses that can have ownership: posted, changes_requested, approved (when reposted)
  // A request with status 'approved' but has posted_at is awaiting re-review
  const isActiveStatus = request.status === 'posted' || 
                         request.status === 'changes_requested' ||
                         (request.status === 'approved' && request.posted_at);
  
  if (!isActiveStatus) {
    return { ownership: 'done', reason: 'unknown_status' };
  }
  
  const postedAt = request.posted_at ? new Date(request.posted_at) : null;
  const lastInternalView = request.last_viewed_by_internal_at 
    ? new Date(request.last_viewed_by_internal_at) 
    : null;
  const latestClientActivity = getLatestClientActivity(request, comments, decisions);
  
  // Check for overdue
  const isOverdue = request.due_date && new Date(request.due_date) < new Date();
  if (isOverdue) {
    return { ownership: 'ak_needs_review', reason: 'overdue' };
  }
  
  // Check for client changes_requested decisions after last internal view
  const hasChangesRequested = decisions.some(d => {
    if (d.request_id !== request.id) return false;
    if (d.decision !== 'changes_requested') return false;
    if (d.decided_by_type !== 'client_contact') return false;
    const decisionDate = d.decided_at ? new Date(d.decided_at) : new Date(d.created_date);
    
    // Must be after posted_at
    if (postedAt && decisionDate <= postedAt) return false;
    
    // If we have an internal view, must be after that
    if (lastInternalView && decisionDate <= lastInternalView) return false;
    
    return true;
  });
  
  if (hasChangesRequested) {
    return { ownership: 'ak_needs_review', reason: 'changes_requested' };
  }
  
  // Check for client comments after last internal view
  const hasNewClientComments = comments.some(c => {
    if (c.request_id !== request.id) return false;
    if (c.author_type !== 'client_contact') return false;
    const commentDate = c.posted_at ? new Date(c.posted_at) : new Date(c.created_date);
    
    // Must be after posted_at
    if (postedAt && commentDate <= postedAt) return false;
    
    // If we have an internal view, must be after that
    if (lastInternalView && commentDate <= lastInternalView) return false;
    
    return true;
  });
  
  if (hasNewClientComments) {
    return { ownership: 'ak_needs_review', reason: 'client_replied' };
  }
  
  // Check for design review unresolved images
  if (hasUnresolvedDesignReviewImages(request, decisions, attachments)) {
    return { ownership: 'ak_needs_review', reason: 'design_review_pending' };
  }
  
  // If there's client activity but internal has viewed after it -> waiting on client
  if (latestClientActivity && lastInternalView && lastInternalView > latestClientActivity) {
    return { ownership: 'waiting_on_client', reason: 'internal_reviewed' };
  }
  
  // If no client activity yet -> waiting on client
  if (!latestClientActivity) {
    return { ownership: 'waiting_on_client', reason: 'no_client_activity' };
  }
  
  // If there's client activity but no internal view yet -> AK needs review
  if (latestClientActivity && !lastInternalView) {
    return { ownership: 'ak_needs_review', reason: 'never_viewed' };
  }
  
  // Default: if client activity is more recent than internal view -> AK needs review
  if (latestClientActivity && lastInternalView && latestClientActivity > lastInternalView) {
    return { ownership: 'ak_needs_review', reason: 'new_activity' };
  }
  
  // Fallback: waiting on client
  return { ownership: 'waiting_on_client', reason: 'default' };
}

/**
 * Get sorting priority for ownership-based sorting
 * Lower number = higher priority (appears first)
 */
export function getOwnershipSortPriority(ownershipResult) {
  const { ownership, reason } = ownershipResult;
  
  if (ownership === 'ak_needs_review') {
    // Within AK needs review, prioritize by reason
    const reasonPriorities = {
      overdue: 1,
      changes_requested: 2,
      client_replied: 3,
      design_review_pending: 4,
      never_viewed: 5,
      new_activity: 6
    };
    return reasonPriorities[reason] || 10;
  }
  
  if (ownership === 'waiting_on_client') {
    return 50; // Lower priority than all AK needs review
  }
  
  return 99; // Done items lowest priority
}

/**
 * Sort requests by the review ownership model
 */
export function sortByReviewOwnership(requests, comments, decisions, attachments) {
  return [...requests].sort((a, b) => {
    const ownershipA = getReviewOwnership(a, comments, decisions, attachments);
    const ownershipB = getReviewOwnership(b, comments, decisions, attachments);
    
    const priorityA = getOwnershipSortPriority(ownershipA);
    const priorityB = getOwnershipSortPriority(ownershipB);
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Within same priority:
    // For AK needs review: sort by most recent activity (descending)
    if (ownershipA.ownership === 'ak_needs_review') {
      const dateA = new Date(a.updated_date || a.created_date);
      const dateB = new Date(b.updated_date || b.created_date);
      return dateB - dateA;
    }
    
    // For waiting on client: sort by oldest posted_at first (ascending)
    if (ownershipA.ownership === 'waiting_on_client') {
      const postedA = a.posted_at ? new Date(a.posted_at) : new Date(a.created_date);
      const postedB = b.posted_at ? new Date(b.posted_at) : new Date(b.created_date);
      return postedA - postedB;
    }
    
    // Fallback: most recent first
    return new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date);
  });
}