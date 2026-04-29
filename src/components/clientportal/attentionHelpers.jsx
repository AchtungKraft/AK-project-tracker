/**
 * Unified Attention Logic — SINGLE SOURCE OF TRUTH
 * 
 * Builds a prioritized action queue from enriched request data.
 * Used exclusively by NeedsAttentionSection.
 */

import { isRequestOverdue } from './lifecycleHelpers';

/**
 * Priority levels (lower = higher priority)
 */
const PRIORITY = {
  needs_response: 1,
  overdue: 2,
  needs_review: 3,
  approved_recent: 4,
};

/**
 * Badge configuration for attention types
 */
export const ATTENTION_BADGE_CONFIG = {
  needs_response: {
    label: "Client Waiting",
    color: "red",
    bgClass: "bg-red-600/20",
    borderClass: "border-red-600/50",
    textClass: "text-red-400",
  },
  overdue: {
    label: "Overdue",
    color: "red",
    bgClass: "bg-red-600/20",
    borderClass: "border-red-600/50",
    textClass: "text-red-400",
  },
  needs_review: {
    label: "Needs Review",
    color: "amber",
    bgClass: "bg-amber-600/20",
    borderClass: "border-amber-600/50",
    textClass: "text-amber-400",
  },
  approved_recent: {
    label: "Completed",
    color: "green",
    bgClass: "bg-green-600/20",
    borderClass: "border-green-600/50",
    textClass: "text-green-400",
  },
};

/**
 * Column configuration for the task board
 */
export const BOARD_COLUMNS = [
  {
    key: 'client_waiting',
    label: 'Client Waiting',
    subtitle: 'Waiting on your response',
    color: 'red',
    types: ['needs_response'],
    headerBg: 'bg-red-500/10',
    headerBorder: 'border-red-500/30',
    headerText: 'text-red-400',
    countBg: 'bg-red-500/20',
    countText: 'text-red-300',
    emptyText: 'No clients waiting',
  },
  {
    key: 'needs_review',
    label: 'Needs Review',
    subtitle: 'Requires internal action',
    color: 'amber',
    types: ['needs_review', 'overdue'],
    headerBg: 'bg-amber-500/10',
    headerBorder: 'border-amber-500/30',
    headerText: 'text-amber-400',
    countBg: 'bg-amber-500/20',
    countText: 'text-amber-300',
    emptyText: 'Nothing to review',
  },
  {
    key: 'completed',
    label: 'Completed',
    subtitle: 'Recently resolved',
    color: 'green',
    types: ['approved_recent'],
    headerBg: 'bg-green-500/10',
    headerBorder: 'border-green-500/30',
    headerText: 'text-green-400',
    countBg: 'bg-green-500/20',
    countText: 'text-green-300',
    emptyText: 'No recent completions',
  },
];

/**
 * Format a relative time label for display
 */
function formatActivityLabel(actor, date) {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let timeStr;
  if (diffMins < 1) timeStr = 'just now';
  else if (diffMins < 60) timeStr = `${diffMins}m ago`;
  else if (diffHours < 24) timeStr = `${diffHours}h ago`;
  else if (diffDays < 7) timeStr = `${diffDays}d ago`;
  else timeStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const actorLabel = actor === 'client' ? 'Client' : 'Team';
  return `${actorLabel} • ${timeStr}`;
}

/**
 * Check if a request was approved recently (within last 48 hours)
 */
function isRecentlyApproved(request) {
  if (request.status !== 'approved') return false;
  const approvalDate = request.approved_at || request.updated_date;
  if (!approvalDate) return false;
  const diffHours = (Date.now() - new Date(approvalDate)) / 3600000;
  return diffHours <= 48;
}

/**
 * Build a unified, prioritized attention list.
 * 
 * @param {Array} projectGroups - Output from groupRequestsByProjectAndLifecycle
 * @returns {Array} Sorted attention items with unified shape
 */
export function buildAttentionList(projectGroups) {
  const items = [];

  projectGroups.forEach(group => {
    const allRequests = [
      ...group.draft,
      ...group.awaiting_client,
      ...group.client_replied,
      ...group.approved,
    ];

    allRequests.forEach(request => {
      // Skip drafts — they're not actionable yet
      if (request.status === 'draft') return;

      const item = classifyRequest(request, group.project);
      if (item) items.push(item);
    });
  });

  // Sort: priority asc, then most recent activity first
  return items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(b.lastActivityAt) - new Date(a.lastActivityAt);
  });
}

/**
 * Classify a single enriched request into an attention item.
 * Returns null if the request doesn't need attention.
 */
function classifyRequest(request, project) {
  const lastActor = request.latestActivityActor || 'team';
  const lastActivityAt = request.latestActivityAt || request.updated_date;
  const isOverdue = request.isOverdue;
  const needsResponse = lastActor === 'client' && request.status !== 'approved';

  let type;

  // Priority 1: Client is waiting for our response
  if (needsResponse) {
    type = 'needs_response';
  }
  // Priority 2: Overdue (and not already client-waiting)
  else if (isOverdue && request.status !== 'approved') {
    type = 'overdue';
  }
  // Priority 4: Recently approved (48h window)
  else if (isRecentlyApproved(request)) {
    type = 'approved_recent';
  }
  // Priority 3: Awaiting client but no response yet — needs internal review/follow-up
  else if (request.status === 'posted' || request.status === 'changes_requested') {
    type = 'needs_review';
  }
  // Not actionable
  else {
    return null;
  }

  // Also handle archived-with-client-response
  if (request.isArchivedWithClientResponse) {
    type = 'needs_response';
  }

  return {
    request,
    requestId: request.id,
    project,
    type,
    priority: PRIORITY[type],
    lastActor,
    lastActivityAt,
    lastActivityLabel: formatActivityLabel(lastActor, lastActivityAt),
    isOverdue: !!isOverdue,
    needsResponse,
  };
}

/**
 * Group attention items by board column
 */
export function groupByColumn(attentionItems) {
  const columns = {};
  BOARD_COLUMNS.forEach(col => {
    columns[col.key] = attentionItems.filter(item => col.types.includes(item.type));
  });
  return columns;
}