/**
 * Lifecycle Bucket Helpers for Client Portal Hub
 * 
 * Determines which lifecycle bucket a request belongs to:
 * - draft: Internal prep stage, not visible to client
 * - awaiting_client: Sent to client, waiting for response
 * - client_replied: Client has responded, AK needs to act
 * - approved: Request is approved/closed
 */

import { getRequestStateCanonical } from "./stateHelpers";
import { buildFeedbackTimeline } from "./feedbackTimeline";

/**
 * Determine the request state based on posted_at + decisions (canonical).
 * Returns a string key for lifecycle bucketing.
 */
export const getRequestState = (request, decisions, attachments) => {
  const canonical = getRequestStateCanonical(request, decisions, attachments);
  return canonical.key;
};

/**
 * Determine which lifecycle bucket a request belongs to
 */
export const getLifecycleBucket = (request, decisions, attachments, comments) => {
  // Use canonical state for draft/archived detection
  const state = getRequestState(request, decisions, attachments);
  
  if (state === 'draft') return 'draft';
  if (state === 'archived') return null;
  
  // Approved goes to approved bucket
  if (state === 'approved') return 'approved';
  
  // Check if client has replied since last post — use timeline stateEvents (SINGLE SOURCE)
  if (request.posted_at) {
    const requestComments = comments.filter(c => c.request_id === request.id);
    const requestDecisions = decisions.filter(d => d.request_id === request.id);
    const { stateEvents } = buildFeedbackTimeline(request, requestComments, requestDecisions);
    
    const hasClientReply = stateEvents.some(e => e.kind === 'comment' && e.actor === 'client');
    if (hasClientReply) {
      return 'client_replied';
    }
  }
  
  // Changes requested = client replied (client made a decision)
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
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        
      case 'last_client_activity': {
        const aClientDate = a.lastClientComment?.posted_at || a.lastClientComment?.created_date;
        const bClientDate = b.lastClientComment?.posted_at || b.lastClientComment?.created_date;
        if (!aClientDate && !bClientDate) return 0;
        if (!aClientDate) return 1;
        if (!bClientDate) return -1;
        return new Date(bClientDate).getTime() - new Date(aClientDate).getTime();
      }
        
      case 'last_internal_activity': {
        const aInternalDate = a.last_viewed_by_internal_at || a.updated_date;
        const bInternalDate = b.last_viewed_by_internal_at || b.updated_date;
        if (!aInternalDate && !bInternalDate) return 0;
        if (!aInternalDate) return 1;
        if (!bInternalDate) return -1;
        return new Date(bInternalDate).getTime() - new Date(aInternalDate).getTime();
      }
        
      case 'oldest_waiting': {
        const aDate = a.posted_at || a.created_date;
        const bDate = b.posted_at || b.created_date;
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      }
        
      default:
        return 0;
    }
  };
};

/**
 * Enrich a request with computed fields including actor-driven attention logic.
 *
 * IMPORTANT:
 * - Timeline (allEvents) is NEVER filtered by posted_at — full history preserved.
 * - State logic uses canonical state from getRequestStateCanonical.
 * - Do NOT use request.status for state decisions here.
 */
export const enrichRequest = (request, comments, decisions, attachments) => {
  const requestComments = comments.filter(c => c.request_id === request.id);
  const requestDecisions = decisions.filter(d => d.request_id === request.id);

  const clientComments = requestComments.filter(
    c => c.author_type === 'client_contact'
  );

  // SINGLE EVENT SOURCE: buildFeedbackTimeline is the ONLY event builder.
  // Do NOT sort comments/decisions manually outside this call.
  const { allEvents, latestDisplayEvent, latestStateEvent } = buildFeedbackTimeline(
    request,
    requestComments,
    requestDecisions
  );

  // DEV INTEGRITY ASSERTION (Part 5)
  if (!latestDisplayEvent && request.posted_at) {
    console.warn('[enrichRequest] Missing latestDisplayEvent for posted request', request.id);
  }

  const latestActivityActor = latestDisplayEvent?.actor || 'team';
  const latestActivityAt = latestDisplayEvent?.date || request.updated_date;

  // Check for overdue — use consistent end-of-day logic
  let isOverdue = false;
  if (request.due_date) {
    const due = new Date(request.due_date);
    due.setHours(23, 59, 59, 999);
    isOverdue = due < new Date();
  }

  // Derive canonical state for enrichment (single source of truth)
  const canonicalKey = getRequestStateCanonical(request, requestDecisions, []).key;

  // Check if archived request has new client activity
  const isArchivedWithClientResponse =
    canonicalKey === 'archived' &&
    latestActivityActor === 'client';

  // CANONICAL RULE: Request requires team action if:
  // - Request is NOT archived AND any of:
  //   - Request is overdue
  //   - Latest activity was by client
  //   - Request is approved (awaiting AK confirmation to close)
  // - OR request is archived but client responded (exception case)
  const requiresTeamAction =
    (
      canonicalKey !== 'archived' &&
      (
        isOverdue ||
        latestActivityActor === 'client' ||
        canonicalKey === 'approved'
      )
    ) ||
    isArchivedWithClientResponse;

  const internalComments = requestComments.filter(
    c => c.author_type === 'internal_user'
  );

  // Derive latest comment from allEvents (SINGLE SOURCE — no manual sort)
  const latestCommentEvent = allEvents.find(e => e.kind === 'comment');
  const latestCommentContent = latestCommentEvent?.comment?.content_fallback
    || latestCommentEvent?.comment?.body || null;
  const latestCommentActor = latestCommentEvent?.actor || null;

  // Derive last client comment from allEvents (SINGLE SOURCE — no manual sort)
  const lastClientCommentEvent = allEvents.find(
    e => e.kind === 'comment' && e.actor === 'client'
  );

  return {
    ...request,
    decisions: requestDecisions,
    lastClientComment: lastClientCommentEvent?.comment || null,
    clientCommentCount: clientComments.length,
    internalCommentCount: internalComments.length,
    totalCommentCount: clientComments.length,
    isOverdue,
    latestActivityActor,
    latestActivityAt,
    latestCommentContent,
    latestCommentActor,
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
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
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