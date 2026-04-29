/**
 * Lifecycle Bucket Helpers for Client Portal Hub
 * 
 * Determines which lifecycle bucket a request belongs to:
 * - draft: Internal prep stage, not visible to client
 * - awaiting_client: Sent to client, waiting for response
 * - client_replied: Client has responded, AK needs to act
 * - approved: Request is approved/closed
 */

import { isStructuredReview } from "./reviewBehavior";

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
  
  // For structured reviews (design_review, budget_review, deliverable_review), check if all images are decided
  if (isStructuredReview(request.request_type)) {
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
 * Enrich a request with computed fields including actor-driven attention logic
 */
export const enrichRequest = (request, comments, decisions, attachments) => {
  const requestComments = comments.filter(c => c.request_id === request.id);
  const requestDecisions = decisions.filter(d => d.request_id === request.id);

  const clientComments = requestComments.filter(
    c => c.author_type === 'client_contact'
  );

  // Build timeline of all events to determine latest activity actor
  const events = [
    {
      type: 'request_created',
      actor: 'team',
      date: request.created_date
    },
    ...(request.posted_at ? [{
      type: 'request_posted',
      actor: 'team',
      date: request.posted_at
    }] : []),
    ...requestComments.map(c => ({
      type: 'comment',
      actor: c.author_type === 'client_contact' ? 'client' : 'team',
      date: c.created_date
    })),
    ...requestDecisions.map(d => ({
      type: 'decision',
      actor: d.decided_by_type === 'client_contact' ? 'client' : 'team',
      date: d.decided_at || d.created_date,
      decision: d.decision
    }))
  ].filter(e => e.date);

  // Sort descending by date (most recent first)
  events.sort((a, b) => new Date(b.date) - new Date(a.date));

  const latestEvent = events[0];
  const latestActivityActor = latestEvent?.actor || 'team';
  const latestActivityAt = latestEvent?.date || request.updated_date;

  // Check for overdue — use consistent end-of-day logic
  let isOverdue = false;
  if (request.due_date) {
    const due = new Date(request.due_date);
    due.setHours(23, 59, 59, 999);
    isOverdue = due < new Date();
  }

  // Check if archived request has new client activity
  const isArchivedWithClientResponse =
    request.status === 'archived' &&
    latestActivityActor === 'client';

  // CANONICAL RULE: Request requires team action if:
  // - Request is NOT archived AND any of:
  //   - Request is overdue
  //   - Latest activity was by client
  //   - Request is approved (awaiting AK confirmation to close)
  // - OR request is archived but client responded (exception case)
  const requiresTeamAction =
    (
      request.status !== 'archived' &&
      (
        isOverdue ||
        latestActivityActor === 'client' ||
        request.status === 'approved'
      )
    ) ||
    isArchivedWithClientResponse;

  const internalComments = requestComments.filter(
    c => c.author_type === 'internal_user'
  );

  return {
    ...request,
    lastClientComment: clientComments.sort(
      (a, b) => new Date(b.created_date) - new Date(a.created_date)
    )[0],
    clientCommentCount: clientComments.length,
    internalCommentCount: internalComments.length,
    totalCommentCount: clientComments.length,
    isOverdue,
    latestActivityActor,
    latestActivityAt,
    isArchivedWithClientResponse,
    requiresTeamAction
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

/**
 * Check if a request is overdue
 * Overdue applies to awaiting_client and client_replied only (not drafts or approved)
 */
export const isRequestOverdue = (request, bucket) => {
  if (!request.due_date) return false;
  if (bucket === 'draft' || bucket === 'approved') return false;
  
  const due = new Date(request.due_date);
  const now = new Date();
  // Set to end of due day for comparison
  due.setHours(23, 59, 59, 999);
  
  return due < now;
};

/**
 * Filter grouped project data by lifecycle quick filter
 */
export const filterByLifecycleQuickFilter = (groupedProjectData, lifecycleQuickFilter) => {
  if (lifecycleQuickFilter === 'all') return groupedProjectData;
  
  return groupedProjectData
    .map(group => {
      const filterFn = (request, bucket) => {
        if (lifecycleQuickFilter === 'overdue') {
          return isRequestOverdue(request, bucket);
        }
        return bucket === lifecycleQuickFilter;
      };
      
      return {
        ...group,
        draft: group.draft.filter(r => filterFn(r, 'draft')),
        awaiting_client: group.awaiting_client.filter(r => filterFn(r, 'awaiting_client')),
        client_replied: group.client_replied.filter(r => filterFn(r, 'client_replied')),
        approved: group.approved.filter(r => filterFn(r, 'approved')),
      };
    })
    .filter(group =>
      group.draft.length ||
      group.awaiting_client.length ||
      group.client_replied.length ||
      group.approved.length
    );
};

/**
 * Overdue-first sort: overdue first, then by earliest due date, then no-date last.
 * Applied inside each lifecycle bucket for time-priority display.
 */
export const sortOverdueFirst = (requests, bucket) => {
  return [...requests].sort((a, b) => {
    const aOverdue = isRequestOverdue(a, bucket);
    const bOverdue = isRequestOverdue(b, bucket);
    // Overdue first
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    // Then has due date before no due date
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    // Then earliest date first
    if (a.due_date && b.due_date) {
      return new Date(a.due_date) - new Date(b.due_date);
    }
    return 0;
  });
};

/**
 * Count overdue requests in a bucket
 */
export const countOverdue = (requests, bucket) => {
  return requests.filter(r => isRequestOverdue(r, bucket)).length;
};

/**
 * Flatten grouped project data into a flat list with lifecycle bucket info
 */
export const flattenGroupedRequests = (groupedProjectData) => {
  const flattened = [];
  
  groupedProjectData.forEach(group => {
    group.draft.forEach(r => flattened.push({ ...r, lifecycleBucket: 'draft' }));
    group.awaiting_client.forEach(r => flattened.push({ ...r, lifecycleBucket: 'awaiting_client' }));
    group.client_replied.forEach(r => flattened.push({ ...r, lifecycleBucket: 'client_replied' }));
    group.approved.forEach(r => flattened.push({ ...r, lifecycleBucket: 'approved' }));
  });
  
  return flattened;
};