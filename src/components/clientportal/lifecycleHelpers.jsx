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
import { buildFeedbackTimeline, getEventTimestamp, getTime } from "./feedbackTimeline";
import { buildOperationalViewModel } from "./buildOperationalViewModel";

/**
 * Determine the request state based on posted_at + decisions (canonical).
 * Returns a string key for lifecycle bucketing.
 */
export const getRequestState = (request, decisions, attachments) => {
  const canonical = getRequestStateCanonical(request, decisions, attachments);
  return canonical.key;
};

/**
 * How many hours an approved item stays visible in the "Recently Approved" 
 * subsection of the active workflow before moving to the archive-only bucket.
 */
export const RECENTLY_APPROVED_WINDOW_HOURS = 48;

/**
 * Test whether a request was approved within the recent visibility window.
 * Uses the latest approval decision timestamp.
 */
export const isRecentlyApproved = (request, decisions) => {
  if (!request) return false;
  const requestDecisions = decisions.filter(d => d.request_id === request.id && d.decision === 'approved');
  if (requestDecisions.length === 0) return false;
  
  // Find latest approval timestamp
  const latestApproval = requestDecisions.reduce((latest, d) => {
    const ts = getTime(getEventTimestamp(d));
    return ts > latest ? ts : latest;
  }, 0);
  
  if (!latestApproval) return false;
  const hoursSince = (Date.now() - latestApproval) / (1000 * 60 * 60);
  return hoursSince < RECENTLY_APPROVED_WINDOW_HOURS;
};

/**
 * Get the approval timestamp for a request (latest approved decision).
 */
export const getApprovalTimestamp = (request, decisions) => {
  const requestDecisions = decisions.filter(d => d.request_id === request.id && d.decision === 'approved');
  if (requestDecisions.length === 0) return null;
  
  const latestApproval = requestDecisions.reduce((latest, d) => {
    const ts = getEventTimestamp(d);
    const tMs = getTime(ts);
    return tMs > getTime(latest || '1970-01-01') ? ts : latest;
  }, null);
  
  return latestApproval;
};

/**
 * Determine which lifecycle bucket a request belongs to
 */
export const getLifecycleBucket = (request, decisions, attachments, comments) => {
  // Use canonical state for draft/archived detection
  const state = getRequestState(request, decisions, attachments);
  
  if (state === 'draft') return 'draft';
  if (state === 'archived') return null;
  
  // Approved: split into recently_approved (visible in active workflow) vs approved (archive)
  if (state === 'approved') {
    if (isRecentlyApproved(request, decisions)) {
      return 'recently_approved';
    }
    return 'approved';
  }
  
  // Check if client has replied since last post — use timeline stateEvents (SINGLE SOURCE)
  // Includes both comments AND decisions (approve / request changes) from client
  if (request.posted_at) {
    const requestComments = comments.filter(c => c.request_id === request.id);
    const requestDecisions = decisions.filter(d => d.request_id === request.id);
    const { stateEvents } = buildFeedbackTimeline(request, requestComments, requestDecisions);
    
    const hasClientReply = stateEvents.some(e => e.actor === 'client');
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
        return getTime(a.due_date) - getTime(b.due_date);
        
      case 'last_client_activity': {
        const aClientDate = a.lastClientComment ? getEventTimestamp(a.lastClientComment) : null;
        const bClientDate = b.lastClientComment ? getEventTimestamp(b.lastClientComment) : null;
        if (!aClientDate && !bClientDate) return 0;
        if (!aClientDate) return 1;
        if (!bClientDate) return -1;
        return getTime(bClientDate) - getTime(aClientDate);
      }
        
      case 'last_internal_activity': {
        const aInternalDate = a.last_viewed_by_internal_at || a.updated_date;
        const bInternalDate = b.last_viewed_by_internal_at || b.updated_date;
        if (!aInternalDate && !bInternalDate) return 0;
        if (!aInternalDate) return 1;
        if (!bInternalDate) return -1;
        return getTime(bInternalDate) - getTime(aInternalDate);
      }
        
      case 'oldest_waiting': {
        return getTime(getEventTimestamp(a)) - getTime(getEventTimestamp(b));
      }
        
      default:
        return 0;
    }
  };
};

/**
 * Enrich a request with computed fields including actor-driven attention logic.
 *
 * DELEGATES to buildOperationalViewModel — the single canonical enrichment.
 * This wrapper filters comments/decisions by request_id (hub passes bulk arrays).
 */
export const enrichRequest = (request, comments, decisions, attachments) => {
  const requestComments = comments.filter(c => c.request_id === request.id);
  const requestDecisions = decisions.filter(d => d.request_id === request.id);

  return buildOperationalViewModel(request, requestComments, requestDecisions, attachments);
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
        recently_approved: [],
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
    // Recently approved: newest approval first
    projectGroup.recently_approved.sort((a, b) => {
      const aTs = a.approvedAt ? getTime(a.approvedAt) : 0;
      const bTs = b.approvedAt ? getTime(b.approvedAt) : 0;
      return bTs - aTs;
    });
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
    const aActive = a.draft.length + a.awaiting_client.length + a.client_replied.length + a.recently_approved.length;
    const bActive = b.draft.length + b.awaiting_client.length + b.client_replied.length + b.recently_approved.length;
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
  // Set to end of due day UTC for consistent comparison
  due.setUTCHours(23, 59, 59, 999);
  
  return due.getTime() < Date.now();
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
        // "approved" filter shows both recently_approved and approved archive
        if (lifecycleQuickFilter === 'approved') {
          return bucket === 'approved' || bucket === 'recently_approved';
        }
        return bucket === lifecycleQuickFilter;
      };
      
      return {
        ...group,
        draft: group.draft.filter(r => filterFn(r, 'draft')),
        awaiting_client: group.awaiting_client.filter(r => filterFn(r, 'awaiting_client')),
        client_replied: group.client_replied.filter(r => filterFn(r, 'client_replied')),
        recently_approved: group.recently_approved.filter(r => filterFn(r, 'recently_approved')),
        approved: group.approved.filter(r => filterFn(r, 'approved')),
      };
    })
    .filter(group =>
      group.draft.length ||
      group.awaiting_client.length ||
      group.client_replied.length ||
      group.recently_approved.length ||
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
      return getTime(a.due_date) - getTime(b.due_date);
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
    group.recently_approved.forEach(r => flattened.push({ ...r, lifecycleBucket: 'recently_approved' }));
    group.approved.forEach(r => flattened.push({ ...r, lifecycleBucket: 'approved' }));
  });
  
  return flattened;
};