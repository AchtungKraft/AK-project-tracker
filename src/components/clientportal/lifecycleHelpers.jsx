/**
 * Lifecycle Bucket Helpers for Client Portal Hub
 * 
 * Determines which lifecycle bucket a request belongs to:
 * - draft: Internal prep stage, not visible to client
 * - awaiting_client: Sent to client, waiting for response
 * - client_replied: Client has responded, AK needs to act
 * - approved: Request is approved/closed
 */

/**
 * Determine the request state based on status and decisions
 */
export const getRequestState = (request, decisions, attachments) => {
  if (request.status === 'draft') return 'draft';
  if (request.status === 'archived') return 'archived';
  
  // For status-based states, trust the status field if explicitly set
  // BUT only if there's no posted_at (hasn't been sent to client yet)
  if (request.status === 'approved' && !request.posted_at) return 'approved';
  if (request.status === 'changes_requested' && !request.posted_at) return 'changes_requested';
  
  // Only consider decisions made AFTER the request was last posted
  const postedAt = request.posted_at ? new Date(request.posted_at) : null;
  const requestDecisions = decisions.filter(d => {
    if (d.request_id !== request.id) return false;
    if (postedAt && d.decided_at) {
      return new Date(d.decided_at) > postedAt;
    }
    if (postedAt && d.created_date) {
      return new Date(d.created_date) > postedAt;
    }
    return true;
  });
  
  const hasApproval = requestDecisions.some(d => d.decision === 'approved' && d.target_type === 'request');
  const hasChangesRequested = requestDecisions.some(d => d.decision === 'changes_requested');
  
  if (hasApproval) return 'approved';
  if (hasChangesRequested) return 'changes_requested';
  
  // For design reviews, check if all images are decided
  if (request.request_type === 'design_review') {
    const imageAttachments = attachments.filter(a => a.request_id === request.id && a.attachment_type === 'image');
    const imageDecisions = requestDecisions.filter(d => d.target_type === 'attachment_image');
    if (imageAttachments.length > 0 && imageDecisions.length >= imageAttachments.length) {
      const allApproved = imageAttachments.every(img => 
        imageDecisions.some(d => d.target_image_url === img.file_url && d.decision === 'approved')
      );
      if (allApproved) return 'approved';
      return 'changes_requested';
    }
  }
  
  return 'awaiting_review';
};

/**
 * Determine which lifecycle bucket a request belongs to
 */
export const getLifecycleBucket = (request, decisions, attachments, comments) => {
  // Draft is always draft
  if (request.status === 'draft') return 'draft';
  
  // Archived requests are excluded
  if (request.status === 'archived') return null;
  
  // Get the base state
  const state = getRequestState(request, decisions, attachments);
  
  // Approved goes to approved bucket
  if (state === 'approved') return 'approved';
  
  // Check if client has replied since last post
  if (request.posted_at) {
    const postedAt = new Date(request.posted_at);
    const clientCommentsSincePost = comments.filter(c => {
      if (c.request_id !== request.id) return false;
      if (c.author_type !== 'client_contact') return false;
      const commentDate = c.posted_at ? new Date(c.posted_at) : new Date(c.created_date);
      return commentDate > postedAt;
    });
    
    if (clientCommentsSincePost.length > 0) {
      return 'client_replied';
    }
  }
  
  // Changes requested = client replied
  if (state === 'changes_requested') {
    return 'client_replied';
  }
  
  // Default: awaiting client
  return 'awaiting_client';
};

/**
 * Sort comparator factory based on sort mode
 */
export const getSortComparator = (mode) => {
  return (a, b) => {
    switch (mode) {
      case 'due_date':
        // Null due dates go to the end
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
        
      case 'last_client_activity':
        const aClientDate = a.lastClientComment?.created_date;
        const bClientDate = b.lastClientComment?.created_date;
        if (!aClientDate && !bClientDate) return 0;
        if (!aClientDate) return 1;
        if (!bClientDate) return -1;
        return new Date(bClientDate) - new Date(aClientDate);
        
      case 'last_internal_activity':
        const aInternalDate = a.last_viewed_by_internal_at || a.updated_date;
        const bInternalDate = b.last_viewed_by_internal_at || b.updated_date;
        if (!aInternalDate && !bInternalDate) return 0;
        if (!aInternalDate) return 1;
        if (!bInternalDate) return -1;
        return new Date(bInternalDate) - new Date(aInternalDate);
        
      case 'oldest_waiting':
        const aDate = a.posted_at || a.created_date;
        const bDate = b.posted_at || b.created_date;
        return new Date(aDate) - new Date(bDate);
        
      default:
        return 0;
    }
  };
};

/**
 * Enrich a request with computed fields
 */
export const enrichRequest = (request, comments, decisions, attachments) => {
  // Get last client comment
  const allClientComments = comments.filter(c => 
    c.request_id === request.id && c.author_type === 'client_contact'
  ).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  
  const lastClientComment = allClientComments[0];
  const totalCommentCount = allClientComments.length;
  
  // Check for overdue
  const isOverdue = request.due_date && new Date(request.due_date) < new Date();
  
  return {
    ...request,
    lastClientComment,
    totalCommentCount,
    isOverdue
  };
};

/**
 * Group requests by project and lifecycle bucket
 */
export const groupRequestsByProjectAndLifecycle = (
  requests, 
  projects, 
  decisions, 
  attachments, 
  comments,
  sortMode = 'due_date'
) => {
  const grouped = {};
  const comparator = getSortComparator(sortMode);
  
  requests.forEach(request => {
    // Skip archived
    if (request.status === 'archived') return;
    
    const projectId = request.project_id || 'unknown';
    const bucket = getLifecycleBucket(request, decisions, attachments, comments);
    
    // Skip null buckets (archived)
    if (!bucket) return;
    
    // Enrich request
    const enrichedRequest = enrichRequest(request, comments, decisions, attachments);
    
    if (!grouped[projectId]) {
      grouped[projectId] = {
        project: projects.find(p => p.id === projectId),
        draft: [],
        awaiting_client: [],
        client_replied: [],
        approved: []
      };
    }
    
    grouped[projectId][bucket].push(enrichedRequest);
  });
  
  // Sort requests within each bucket
  Object.values(grouped).forEach(projectGroup => {
    projectGroup.draft.sort(comparator);
    projectGroup.awaiting_client.sort(comparator);
    projectGroup.client_replied.sort(comparator);
    projectGroup.approved.sort(comparator);
  });
  
  // Convert to array and sort projects
  return Object.values(grouped).sort((a, b) => {
    // Projects with client_replied items come first
    const aHasClientReplied = a.client_replied.length > 0;
    const bHasClientReplied = b.client_replied.length > 0;
    if (aHasClientReplied && !bHasClientReplied) return -1;
    if (!aHasClientReplied && bHasClientReplied) return 1;
    
    // Then projects with overdue awaiting_client items
    const aHasOverdue = a.awaiting_client.some(r => r.isOverdue);
    const bHasOverdue = b.awaiting_client.some(r => r.isOverdue);
    if (aHasOverdue && !bHasOverdue) return -1;
    if (!aHasOverdue && bHasOverdue) return 1;
    
    // Then by total active items (non-approved)
    const aActive = a.draft.length + a.awaiting_client.length + a.client_replied.length;
    const bActive = b.draft.length + b.awaiting_client.length + b.client_replied.length;
    return bActive - aActive;
  });
};

/**
 * Sort mode options for dropdown
 */
export const SORT_MODE_OPTIONS = [
  { value: 'due_date', label: 'Due Date' },
  { value: 'last_client_activity', label: 'Last Client Activity' },
  { value: 'last_internal_activity', label: 'Last Internal Activity' },
  { value: 'oldest_waiting', label: 'Oldest Waiting' }
];