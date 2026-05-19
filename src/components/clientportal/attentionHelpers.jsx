/**
 * Unified Attention Logic — SINGLE SOURCE OF TRUTH
 * 
 * Builds a prioritized action queue from enriched request data.
 * Used exclusively by NeedsAttentionSection.
 */

import { isRequestOverdue } from './lifecycleHelpers';
import { getRequestStateCanonical } from './stateHelpers';
import { getTime } from './feedbackTimeline';

/**
 * Priority levels (lower = higher priority)
 */
const FOLLOW_UP_THRESHOLD_HOURS = 48;

const PRIORITY = {
  needs_sending: 1,
  needs_response: 1,
  overdue: 2,
  needs_review: 3,
  follow_up: 4,
  approved_recent: 5,
};

/**
 * Badge configuration for attention types
 */
export const ATTENTION_BADGE_CONFIG = {
  needs_sending: {
    label: "Needs Sending",
    color: "purple",
    bgClass: "bg-purple-600/20",
    borderClass: "border-purple-600/50",
    textClass: "text-purple-400",
  },
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
  follow_up: {
    label: "Follow-Up",
    color: "orange",
    bgClass: "bg-orange-600/20",
    borderClass: "border-orange-600/50",
    textClass: "text-orange-400",
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
    key: 'needs_sending',
    label: 'Drafts',
    subtitle: 'Not yet sent to client',
    color: 'purple',
    headerBg: 'bg-purple-500/10',
    headerBorder: 'border-purple-500/30',
    headerText: 'text-purple-400',
    countBg: 'bg-purple-500/20',
    countText: 'text-purple-300',
    emptyText: 'No drafts pending',
  },
  {
    key: 'client_waiting',
    label: 'Client Waiting',
    subtitle: 'Waiting on your response',
    color: 'red',
    headerBg: 'bg-red-500/10',
    headerBorder: 'border-red-500/30',
    headerText: 'text-red-400',
    countBg: 'bg-red-500/20',
    countText: 'text-red-300',
    emptyText: 'No clients waiting',
  },
  {
    key: 'review_active',
    label: 'Active Review',
    subtitle: 'Recent activity, needs action',
    color: 'amber',
    headerBg: 'bg-amber-500/10',
    headerBorder: 'border-amber-500/30',
    headerText: 'text-amber-400',
    countBg: 'bg-amber-500/20',
    countText: 'text-amber-300',
    emptyText: 'Nothing to review',
  },
  {
    key: 'follow_up',
    label: 'Follow-Up',
    subtitle: 'No client response — consider follow-up',
    color: 'orange',
    headerBg: 'bg-orange-500/10',
    headerBorder: 'border-orange-500/30',
    headerText: 'text-orange-400',
    countBg: 'bg-orange-500/20',
    countText: 'text-orange-300',
    emptyText: 'No follow-ups needed',
  },
];

export const RESOLVED_COLUMN = {
  key: 'resolved',
  label: 'Resolved',
  subtitle: 'Recently completed',
  color: 'green',
  headerBg: 'bg-green-500/10',
  headerBorder: 'border-green-500/30',
  headerText: 'text-green-400',
  countBg: 'bg-green-500/20',
  countText: 'text-green-300',
  emptyText: 'No recent completions',
};

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
 * Get urgency-focused waiting time label (for Client Waiting column)
 */
export function getWaitingTimeLabel(date) {
  if (!date) return '';
  const diff = Date.now() - getTime(date);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Waiting <1h';
  if (hours < 24) return `Waiting ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Waiting ${days}d`;
}

/**
 * Check if an attention item has recent activity (within 48h)
 */
export function isRecentActivity(item) {
  return Date.now() - getTime(item.lastActivityAt) < 48 * 60 * 60 * 1000;
}

/**
 * Check if a request was approved recently (within last 48 hours).
 * Uses canonical state — does NOT read request.status.
 */
function isRecentlyApproved(request, canonicalKey) {
  if (canonicalKey !== 'approved') return false;
  const approvalDate = request.approved_at || request.updated_date;
  if (!approvalDate) return false;
  const diffHours = (Date.now() - getTime(approvalDate)) / 3600000;
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
      // Derive canonical state — single source of truth (NOT request.status)
      const decisions = request.decisions || [];
      const canonicalState = getRequestStateCanonical(request, decisions, []);

      const item = classifyRequest(request, group.project, canonicalState);
      if (item) items.push(item);
    });
  });

  // Sort: priority asc, then most recent activity first (UTC numeric)
  return items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return getTime(b.lastActivityAt) - getTime(a.lastActivityAt);
  });
}

/**
 * Classify a single enriched request into an attention item.
 * Returns null if the request doesn't need attention.
 * 
 * ACTIVITY-DRIVEN: Classification is based on who acted last
 * combined with canonical state. Does NOT use request.status
 * for state decisions — canonicalState.key is the single source.
 */
function classifyRequest(request, project, canonicalState) {
  const canonicalKey = canonicalState.key;
  const lastActor = request.latestActivityActor || 'team';
  const lastActivityAt = request.latestActivityAt || request.updated_date;
  const isOverdue = request.isOverdue;
  const needsResponse = lastActor === 'client' && canonicalKey !== 'approved';
  const lastActivityMs = getTime(lastActivityAt);
  const hoursSinceLastActivity = lastActivityMs
    ? (Date.now() - lastActivityMs) / (1000 * 60 * 60)
    : 0;

  let type;

  // Drafts — not yet sent to client, needs team action to post
  if (canonicalKey === 'draft') {
    return {
      request,
      requestId: request.id,
      project,
      type: 'needs_sending',
      priority: PRIORITY.needs_sending,
      lastActor: 'team',
      lastActivityAt: request.updated_date || request.created_date,
      lastActivityLabel: formatActivityLabel('team', request.updated_date || request.created_date),
      followUpLabel: null,
      followUpMeta: null,
      lastCommentSnippet: request.title || null,
      isOverdue: false,
      needsResponse: false,
      isStalled: false,
      isReviewStale: false,
    };
  }

  // HIGHEST PRIORITY: Team explicitly marked "in_review" → ALWAYS show in Active Review.
  // This override beats all other classification (client-waiting, approved, follow-up).
  // The team's deliberate action to flag something for review must never be silently dropped.
  if (request.review_state === 'in_review') {
    type = 'needs_review';
  }
  // Handle archived-with-client-response (exception case)
  else if (request.isArchivedWithClientResponse) {
    type = 'needs_response';
  }
  // Client acted last → team needs to respond
  else if (needsResponse) {
    type = 'needs_response';
  }
  // Recently approved (48h window)
  else if (isRecentlyApproved(request, canonicalKey)) {
    type = 'approved_recent';
  }
  // Skip archived
  else if (canonicalKey === 'archived') {
    return null;
  }
  // Active states: awaiting_review or changes_requested
  else if (canonicalKey === 'awaiting_review' || canonicalKey === 'changes_requested') {
    // Team acted last — ball is in client's court → follow_up
    if (lastActor === 'team') {
      type = 'follow_up';
    } else {
      // Fallback: treat as needs_review
      type = 'needs_review';
    }
  }
  // Approved but not recently → skip (already handled by lifecycle buckets)
  else if (canonicalKey === 'approved') {
    return null;
  }
  else {
    return null;
  }

  // Overlay: overdue items that aren't already client-waiting get overdue flag
  // but keep their column (overdue is shown as badge, not a separate column reclassification
  // UNLESS they're in needs_review — then promote to overdue type)
  if (isOverdue && type === 'needs_review') {
    type = 'overdue';
  }

  // Build follow-up metadata with risk tiers and action guidance
  let followUpLabel = null;
  let followUpMeta = null;

  if (type === 'follow_up') {
    const h = hoursSinceLastActivity;
    let followUpLabel = null;
    let riskTier = 'low';
    let actionLabel = 'Monitor';
    
    // Simplified label: focus on time since last contact only
    if (h < 1) {
      followUpLabel = '<1h';
    } else if (h < 24) {
      followUpLabel = `${Math.floor(h)}h`;
    } else {
      followUpLabel = `${Math.floor(h / 24)}d`;
    }

    // Risk tiers based on silence duration
    if (h > 120) {
      riskTier = 'high';
      actionLabel = 'Call / escalate';
    } else if (h > 48) {
      riskTier = 'medium';
      actionLabel = 'Send follow-up';
    }

    followUpMeta = { hoursSince: h, riskTier, actionLabel };
  }

  // Extract last comment snippet for hover preview — prefer the actual latest comment
  const lastCommentSnippet = request.latestCommentContent
    || request.lastClientComment?.content_fallback
    || request.lastClientComment?.body
    || request.title
    || null;

  // Use the comment-level actor if available (more accurate than event-level)
  const commentActor = request.latestCommentActor || lastActor;

  // Stalled: client waiting but no activity for 72h+
  const isStalled = type === 'needs_response' && hoursSinceLastActivity > 72;

  // Stale review indicator: in_review for >48h
  const isReviewStale = request.review_state === 'in_review' && request.review_started_at &&
    ((Date.now() - getTime(request.review_started_at)) / (1000 * 60 * 60)) > 48;

  return {
    request,
    requestId: request.id,
    project,
    type,
    priority: PRIORITY[type],
    lastActor: commentActor,
    lastActivityAt,
    lastActivityLabel: formatActivityLabel(lastActor, lastActivityAt),
    followUpLabel,
    followUpMeta,
    lastCommentSnippet,
    isOverdue: !!isOverdue,
    needsResponse,
    isStalled,
    isReviewStale,
  };
}

/**
 * Group attention items by the new board structure
 */
export function groupByColumn(attentionItems) {
  // Follow-up sorted oldest-first (longest silence at top, UTC numeric)
  const followUp = attentionItems
    .filter(i => i.type === 'follow_up')
    .sort((a, b) => getTime(a.lastActivityAt) - getTime(b.lastActivityAt));

  return {
    needs_sending: attentionItems.filter(i => i.type === 'needs_sending'),
    client_waiting: attentionItems.filter(i => i.type === 'needs_response'),
    review_active: attentionItems.filter(i => i.type === 'needs_review' || i.type === 'overdue'),
    follow_up: followUp,
    resolved: attentionItems.filter(i => i.type === 'approved_recent'),
  };
}

/**
 * Group items within a column by project.
 * Returns sorted array of { projectId, projectName, items }.
 * Projects with overdue items sort first, then most items, then most recent activity.
 */
export function groupColumnByProject(columnItems) {
  const map = {};
  for (const item of columnItems) {
    const pid = item.project?.id || 'unknown';
    if (!map[pid]) {
      map[pid] = {
        projectId: pid,
        projectName: item.project?.name || 'Unknown Project',
        items: [],
        overdueCount: 0,
        latestActivityAt: 0,
      };
    }
    map[pid].items.push(item);
    if (item.isOverdue) map[pid].overdueCount++;
    const t = getTime(item.lastActivityAt);
    if (t > map[pid].latestActivityAt) map[pid].latestActivityAt = t;
  }

  return Object.values(map).sort((a, b) => {
    // 1. Overdue count DESC
    if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
    // 2. Total items DESC
    if (a.items.length !== b.items.length) return b.items.length - a.items.length;
    // 3. Most recent activity DESC
    return b.latestActivityAt - a.latestActivityAt;
  });
}