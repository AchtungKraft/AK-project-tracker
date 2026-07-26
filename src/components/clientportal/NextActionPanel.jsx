import { cn } from "@/lib/utils";
import { ArrowRight, Clock, Eye, Send, CheckCircle2, AlertTriangle, MessageSquare, Archive } from "lucide-react";

/**
 * Compact "Next Action" panel — the first thing Operations reads.
 * Derived entirely from existing workflow data. No new states.
 */

function deriveNextAction(canonicalState, request) {
  if (!canonicalState || !request) return null;

  const key = canonicalState.key;
  const isReviewing = request.review_state === 'in_review';
  const lastActor = request.latestActivityActor;
  const clientActivity = request.latestClientActivityAt;
  const isHidden = request.queue_hidden;

  // Archived — no action
  if (key === 'archived') {
    return {
      owner: 'No Action',
      ownerColor: 'text-gray-400',
      icon: Archive,
      iconBg: 'bg-gray-500/15',
      headline: 'Archived',
      detail: 'No further action required.',
    };
  }

  // Draft — team owns, ready to send
  if (key === 'draft') {
    return {
      owner: 'Ready to Send',
      ownerColor: 'text-purple-400',
      icon: Send,
      iconBg: 'bg-purple-500/15',
      headline: 'Draft complete',
      detail: 'Post to client when ready.',
    };
  }

  // Approved — resolved
  if (key === 'approved') {
    return {
      owner: 'Review Complete',
      ownerColor: 'text-green-400',
      icon: CheckCircle2,
      iconBg: 'bg-green-500/15',
      headline: 'Client approved',
      detail: 'Archive when ready, or resend if needed.',
    };
  }

  // Team is actively reviewing
  if (isReviewing) {
    const reviewHours = request.reviewHours || 0;
    const reviewStale = request.isReviewStale || false;
    const clientComments = request.clientCommentCount || 0;
    let detail;
    if (reviewStale) {
      detail = `In review for ${Math.floor(reviewHours / 24)}d. Complete or stop reviewing.`;
    } else if (clientComments > 0) {
      detail = `${clientComments} client ${clientComments === 1 ? 'reply' : 'replies'} to review.`;
    } else {
      detail = clientActivity
        ? `Client last active ${formatRelative(clientActivity)}.`
        : 'Review in progress.';
    }
    return {
      owner: 'Internal Review',
      ownerColor: 'text-blue-400',
      icon: Eye,
      iconBg: 'bg-blue-500/15',
      headline: reviewStale ? 'Review stale — complete or stop' : 'Under review by team',
      detail,
    };
  }

  // Client replied — team needs to act
  if (lastActor === 'client') {
    const clientComments = request.clientCommentCount || 0;
    const detail = clientComments > 0
      ? `${clientComments} client ${clientComments === 1 ? 'reply' : 'replies'}. Review and respond.`
      : 'Client has responded. Review and respond.';
    return {
      owner: 'Internal Review Required',
      ownerColor: 'text-red-400',
      icon: MessageSquare,
      iconBg: 'bg-red-500/15',
      headline: 'Client replied',
      detail,
    };
  }

  // Changes requested — waiting on client
  if (key === 'changes_requested') {
    return {
      owner: 'Waiting on Client',
      ownerColor: 'text-amber-400',
      icon: Clock,
      iconBg: 'bg-amber-500/15',
      headline: 'Changes requested',
      detail: clientActivity
        ? `Client last active ${formatRelative(clientActivity)}. No internal action required.`
        : 'No client activity yet. No internal action required.',
    };
  }

  // Awaiting review — ball is in client's court
  if (key === 'awaiting_review') {
    if (isHidden) {
      return {
        owner: 'Set Aside',
        ownerColor: 'text-gray-400',
        icon: Clock,
        iconBg: 'bg-gray-500/15',
        headline: 'Removed from queue',
        detail: request.queue_resume_date
          ? `Returns ${formatRelative(request.queue_resume_date)}.`
          : 'Hidden until manually resumed.',
      };
    }

    const waitDays = request.waitingDays || 0;

    if (waitDays > 14) {
      return {
        owner: 'Follow Up with Client',
        ownerColor: 'text-red-400',
        icon: AlertTriangle,
        iconBg: 'bg-red-500/15',
        headline: `No response for ${waitDays} days`,
        detail: 'Consider following up or escalating.',
      };
    }

    if (waitDays > 7) {
      return {
        owner: 'Follow Up with Client',
        ownerColor: 'text-orange-400',
        icon: AlertTriangle,
        iconBg: 'bg-orange-500/15',
        headline: `No response for ${waitDays} days`,
        detail: 'Consider sending a follow-up.',
      };
    }

    return {
      owner: 'Waiting on Client',
      ownerColor: 'text-amber-400',
      icon: Clock,
      iconBg: 'bg-amber-500/15',
      headline: clientActivity
        ? `Client last active ${formatRelative(clientActivity)}`
        : 'No client activity yet',
      detail: 'No internal action required.',
    };
  }

  return null;
}

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * NextActionPanel — PRESENTATION ONLY
 * 
 * Consumes an enriched request from buildOperationalViewModel.
 * Never scans comments. Never derives ownership. Never calculates waiting.
 */
export default function NextActionPanel({ canonicalState, request, isMobile = false }) {
  const action = deriveNextAction(canonicalState, request);
  if (!action) return null;

  const Icon = action.icon;

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border px-3 py-2.5",
      "bg-gray-900/60 border-gray-700/60"
    )}>
      <div className={cn("p-1.5 rounded-md shrink-0", action.iconBg)}>
        <Icon className={cn("w-4 h-4", action.ownerColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-semibold uppercase tracking-wider", action.ownerColor)}>
            {action.owner}
          </span>
          <ArrowRight className="w-3 h-3 text-gray-600 shrink-0" />
          <span className={cn("font-medium text-white truncate", isMobile ? "text-xs" : "text-sm")}>
            {action.headline}
          </span>
        </div>
        <p className={cn("text-gray-500 truncate", isMobile ? "text-[11px]" : "text-xs")}>
          {action.detail}
        </p>
      </div>
    </div>
  );
}

/**
 * GroupBadge for Action Queue cards.
 * 
 * Shows the ORGANIZATIONAL GROUP this card belongs to — matches
 * the column it sits in. This is NOT the same as NextAction ownership.
 * 
 * Column answers: "What type of work is this?"
 * NextAction answers: "What should I do?"
 */
export function OwnershipBadge({ item }) {
  const { type } = item;

  // Map attention type → column group label + color
  const GROUP_MAP = {
    needs_sending:  { label: 'Draft',         color: 'text-purple-400' },
    needs_response: { label: 'Client Replied', color: 'text-red-400' },
    needs_review:   { label: 'In Review',      color: 'text-amber-400' },
    overdue:        { label: 'Overdue',        color: 'text-red-400' },
    follow_up:      { label: 'Follow-Up',      color: 'text-orange-400' },
    approved_recent:{ label: 'Resolved',       color: 'text-green-400' },
  };

  const group = GROUP_MAP[type] || { label: 'Follow-Up', color: 'text-gray-400' };

  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-wide", group.color)}>
      {group.label}
    </span>
  );
}