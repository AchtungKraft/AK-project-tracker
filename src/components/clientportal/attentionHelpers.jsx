/**
 * Attention classification helpers for NeedsAttentionSection
 * Uses lifecycle buckets from groupRequestsByProjectAndLifecycle
 */

import { isRequestOverdue } from './lifecycleHelpers';

/**
 * Check if a request was recently approved (within last 7 days)
 */
function isRecentlyApproved(request, now) {
  // Check for approval decision or status change
  const approvalDate = request.approved_at || request.updated_date;
  if (!approvalDate) return false;
  
  // Only count if status is actually approved
  if (request.status !== 'approved') return false;
  
  const approved = new Date(approvalDate);
  const diffDays = (now - approved) / (1000 * 60 * 60 * 24);
  
  return diffDays <= 7;
}

/**
 * Priority order for sorting attention items
 */
const ATTENTION_PRIORITY = {
  client_replied: 1,
  overdue: 2,
  approved_recent: 3
};

/**
 * Badge configuration for attention types
 */
export const ATTENTION_BADGE_CONFIG = {
  client_replied: {
    label: "Client Replied",
    color: "blue",
    bgClass: "bg-blue-600/20",
    borderClass: "border-blue-600/50",
    textClass: "text-blue-400"
  },
  overdue: {
    label: "Overdue",
    color: "red",
    bgClass: "bg-red-600/20",
    borderClass: "border-red-600/50",
    textClass: "text-red-400"
  },
  approved_recent: {
    label: "Recently Approved",
    color: "green",
    bgClass: "bg-green-600/20",
    borderClass: "border-green-600/50",
    textClass: "text-green-400"
  }
};

/**
 * Build attention list from lifecycle-grouped project data
 * @param {Array} projectGroups - Output from groupRequestsByProjectAndLifecycle
 * @param {string} lifecycleQuickFilter - Optional filter to apply
 * @returns {Array} Sorted attention items
 */
export function buildAttentionList(projectGroups, lifecycleQuickFilter = 'all') {
  const now = new Date();
  const attentionItems = [];

  projectGroups.forEach(group => {
    // Client Replied → Always Attention
    group.client_replied.forEach(request => {
      // Skip if filtering and doesn't match
      if (lifecycleQuickFilter !== 'all' && 
          lifecycleQuickFilter !== 'client_replied' && 
          lifecycleQuickFilter !== 'overdue') {
        return;
      }
      
      const isOverdue = isRequestOverdue(request, 'client_replied');
      
      // If filtering by overdue, only include if actually overdue
      if (lifecycleQuickFilter === 'overdue' && !isOverdue) {
        return;
      }
      
      attentionItems.push({
        type: 'client_replied',
        request,
        project: group.project,
        isOverdue
      });
    });

    // Awaiting Client → Overdue Only
    group.awaiting_client.forEach(request => {
      if (isRequestOverdue(request, 'awaiting_client')) {
        // Skip if filtering and doesn't match overdue or awaiting_client
        if (lifecycleQuickFilter !== 'all' && 
            lifecycleQuickFilter !== 'overdue' && 
            lifecycleQuickFilter !== 'awaiting_client') {
          return;
        }
        
        attentionItems.push({
          type: 'overdue',
          request,
          project: group.project,
          isOverdue: true
        });
      }
    });

    // Approved → Recently Approved Only
    group.approved.forEach(request => {
      if (isRecentlyApproved(request, now)) {
        // Skip if filtering and doesn't match approved
        if (lifecycleQuickFilter !== 'all' && lifecycleQuickFilter !== 'approved') {
          return;
        }
        
        attentionItems.push({
          type: 'approved_recent',
          request,
          project: group.project,
          isOverdue: false
        });
      }
    });
  });

  return sortAttentionItems(attentionItems);
}

/**
 * Sort attention items by priority
 */
function sortAttentionItems(items) {
  return items.sort((a, b) => {
    // Primary sort: by type priority
    const priorityDiff = ATTENTION_PRIORITY[a.type] - ATTENTION_PRIORITY[b.type];
    if (priorityDiff !== 0) return priorityDiff;
    
    // Secondary sort: overdue items by oldest due date first
    if (a.isOverdue && b.isOverdue && a.request.due_date && b.request.due_date) {
      return new Date(a.request.due_date) - new Date(b.request.due_date);
    }
    
    // Tertiary sort: by updated date (most recent first)
    return new Date(b.request.updated_date || b.request.created_date) - 
           new Date(a.request.updated_date || a.request.created_date);
  });
}

/**
 * Group attention items by type for sectioned display
 */
export function groupAttentionByType(attentionItems) {
  return {
    client_replied: attentionItems.filter(i => i.type === 'client_replied'),
    overdue: attentionItems.filter(i => i.type === 'overdue'),
    approved_recent: attentionItems.filter(i => i.type === 'approved_recent')
  };
}