/**
 * Adapter layer to convert ClientFeedbackRequest objects into
 * a format compatible with PriorityCalendarView-style rendering.
 */

import { getLifecycleBucket, isRequestOverdue } from './lifecycleHelpers';

/**
 * Convert a single request to a calendar-compatible item
 */
export function convertRequestToCalendarItem(request, project, lifecycleBucket, comments = [], decisions = []) {
  const requestComments = comments.filter(c => c.request_id === request.id);
  const requestDecisions = decisions.filter(d => d.request_id === request.id);
  
  // Get last client activity
  const clientComments = requestComments.filter(c => c.is_client_comment);
  const lastClientComment = clientComments.length > 0 
    ? clientComments.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]
    : null;
  
  // Get last internal activity
  const internalComments = requestComments.filter(c => !c.is_client_comment);
  const lastInternalComment = internalComments.length > 0
    ? internalComments.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]
    : null;
    
  const bucket = lifecycleBucket || getLifecycleBucket(request, requestDecisions, requestComments);
  const overdue = isRequestOverdue(request, bucket);
  
  return {
    id: request.id,
    name: request.title || 'Untitled Request',
    project_id: request.project_id,
    
    // Date fields
    due_date: request.due_date,
    start_date: request.posted_at || request.created_date,
    
    // Lifecycle info
    lifecycle_bucket: bucket,
    is_request: true,
    is_overdue: overdue,
    
    // Request-specific
    request_type: request.request_type,
    request_status: request.status,
    
    // Activity timestamps for sorting
    last_client_activity: lastClientComment?.created_date,
    last_internal_activity: lastInternalComment?.created_date || request.updated_date,
    
    // Reference to original
    source_request: request,
    
    // Project info (denormalized for display)
    project_name: project?.name,
    client_name: project?.client_name,
  };
}

/**
 * Convert array of requests with lifecycle info to calendar items
 */
export function convertRequestsToCalendarItems(flattenedRequests, projects, comments = [], decisions = []) {
  return flattenedRequests.map(request => {
    const project = projects.find(p => p.id === request.project_id);
    return convertRequestToCalendarItem(
      request.source_request || request, 
      project, 
      request.lifecycleBucket,
      comments,
      decisions
    );
  });
}

/**
 * Lifecycle bucket display config
 */
export const LIFECYCLE_BUCKET_CONFIG = {
  draft: {
    key: 'draft',
    label: 'Draft (Internal)',
    color: '#64748B', // slate
    bgClass: 'bg-slate-900/50',
    borderClass: 'border-slate-600',
    textClass: 'text-slate-400',
  },
  awaiting_client: {
    key: 'awaiting_client',
    label: 'Awaiting Client',
    color: '#F59E0B', // amber
    bgClass: 'bg-amber-900/30',
    borderClass: 'border-amber-600',
    textClass: 'text-amber-400',
  },
  client_replied: {
    key: 'client_replied',
    label: 'Client Replied',
    color: '#3B82F6', // blue
    bgClass: 'bg-blue-900/30',
    borderClass: 'border-blue-600',
    textClass: 'text-blue-400',
  },
  recently_approved: {
    key: 'recently_approved',
    label: 'Recently Approved ✓',
    color: '#34D399', // emerald
    bgClass: 'bg-emerald-900/30',
    borderClass: 'border-emerald-500',
    textClass: 'text-emerald-400',
  },
  approved: {
    key: 'approved',
    label: 'Approved',
    color: '#10B981', // green
    bgClass: 'bg-green-900/30',
    borderClass: 'border-green-600',
    textClass: 'text-green-400',
  },
};

/**
 * Get grouping info for a request based on groupBy type
 */
export function getRequestGroupInfo(item, groupBy, projects = [], teamMembers = []) {
  if (groupBy === 'project') {
    const project = projects.find(p => p.id === item.project_id);
    return {
      key: item.project_id || 'no-project',
      label: project?.name || item.project_name || 'No Project',
      color: '#EF4444',
      sublabel: project?.client_name || item.client_name,
    };
  }
  
  if (groupBy === 'lifecycle') {
    const config = LIFECYCLE_BUCKET_CONFIG[item.lifecycle_bucket] || LIFECYCLE_BUCKET_CONFIG.awaiting_client;
    return {
      key: item.lifecycle_bucket,
      label: config.label,
      color: config.color,
    };
  }
  
  if (groupBy === 'type') {
    const typeLabels = {
      question: 'Questions',
      feedback_needed: 'Feedback Needed',
      design_review: 'Design Reviews',
      client_need: 'Client Needs',
      todo_list: 'To-Do Lists',
      update: 'Project Updates',
      budget_review: 'Budget Reviews',
      deliverable_review: 'Deliverable Reviews',
    };
    return {
      key: item.request_type || 'unknown',
      label: typeLabels[item.request_type] || 'Other',
      color: '#8B5CF6',
    };
  }
  
  return {
    key: 'unknown',
    label: 'Unknown',
    color: '#6B7280',
  };
}