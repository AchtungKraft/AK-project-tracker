import React from "react";
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

  // Archived
  if (key === 'archived') {
    return {
      owner: 'Resolved',
      ownerColor: 'text-gray-400',
      icon: Archive,
      iconBg: 'bg-gray-500/15',
      headline: 'Archived',
      detail: 'No action required',
    };
  }

  // Draft
  if (key === 'draft') {
    return {
      owner: 'AK Action',
      ownerColor: 'text-purple-400',
      icon: Send,
      iconBg: 'bg-purple-500/15',
      headline: 'Ready to Send',
      detail: 'Review complete. Post to client when ready.',
    };
  }

  // Approved
  if (key === 'approved') {
    return {
      owner: 'Resolved',
      ownerColor: 'text-green-400',
      icon: CheckCircle2,
      iconBg: 'bg-green-500/15',
      headline: 'Approved',
      detail: 'Client has approved — ready to archive or resend',
    };
  }

  // In review by team
  if (isReviewing) {
    const reviewHours = request.review_started_at
      ? (Date.now() - new Date(request.review_started_at).getTime()) / 3600000
      : 0;
    const reviewStale = reviewHours > 48;
    const clientComments = request.clientCommentCount || 0;
    let detail;
    if (reviewStale) {
      detail = `In review for ${Math.floor(reviewHours / 24)}d. Complete or stop reviewing.`;
    } else if (clientComments > 0) {
      detail = `Client sent ${clientComments} ${clientComments === 1 ? 'reply' : 'replies'}. Review and respond.`;
    } else {
      detail = clientActivity
        ? `Client last active ${formatRelative(clientActivity)}.`
        : 'Awaiting team response.';
    }
    return {
      owner: 'Active Review',
      ownerColor: 'text-blue-400',
      icon: Eye,
      iconBg: 'bg-blue-500/15',
      headline: reviewStale ? 'Review Stale — Complete or Stop' : 'Under Review',
      detail,
    };
  }

  // Client replied — team needs to respond
  if (lastActor === 'client') {
    const clientComments = request.clientCommentCount || 0;
    const detail = clientComments > 0
      ? `Client sent ${clientComments} ${clientComments === 1 ? 'reply' : 'replies'}. Review and respond.`
      : 'Client has responded. Review and respond.';
    return {
      owner: 'AK Action',
      ownerColor: 'text-red-400',
      icon: MessageSquare,
      iconBg: 'bg-red-500/15',
      headline: 'Client Replied — Review Needed',
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
      headline: 'Changes Requested',
      detail: clientActivity
        ? `Client last active ${formatRelative(clientActivity)}`
        : 'No client activity yet',
    };
  }

  // Awaiting review — ball is in client's court
  if (key === 'awaiting_review') {
    if (isHidden) {
      return {
        owner: 'Later',
        ownerColor: 'text-gray-400',
        icon: Clock,
        iconBg: 'bg-gray-500/15',
        headline: 'Set Aside',
        detail: request.queue_resume_date
          ? `Will return ${formatRelative(request.queue_resume_date)}`
          : 'Hidden until manually resumed',
      };
    }

    const waitDays = clientActivity
      ? Math.floor((Date.now() - new Date(clientActivity).getTime()) / 86400000)
      : request.posted_at
        ? Math.floor((Date.now() - new Date(request.posted_at).getTime()) / 86400000)
        : 0;

    if (waitDays > 14) {
      return {
        owner: 'Waiting on Client',
        ownerColor: 'text-red-400',
        icon: AlertTriangle,
        iconBg: 'bg-red-500/15',
        headline: `Client Silent — ${waitDays}d`,
        detail: 'Consider following up or escalating.',
      };
    }

    if (waitDays > 7) {
      return {
        owner: 'Waiting on Client',
        ownerColor: 'text-orange-400',
        icon: AlertTriangle,
        iconBg: 'bg-orange-500/15',
        headline: `Client has not responded — ${waitDays}d`,
        detail: `Last activity ${formatRelative(clientActivity || request.posted_at)}. Consider following up.`,
      };
    }

    return {
      owner: 'Waiting on Client',
      ownerColor: 'text-amber-400',
      icon: Clock,
      iconBg: 'bg-amber-500/15',
      headline: 'Waiting on Client',
      detail: clientActivity
        ? `Client last active ${formatRelative(clientActivity)}. No internal action required.`
        : 'No client activity yet. No internal action required.',
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
 * Compact ownership badge for Action Queue cards.
 * Shows who owns the next action in 2 words or less.
 */
export function OwnershipBadge({ item }) {
  const { type, lastActor, request } = item;
  const isReviewing = request?.review_state === 'in_review';

  let label, colorClass;

  if (type === 'needs_sending') {
    label = 'AK: Send';
    colorClass = 'text-purple-400';
  } else if (type === 'needs_response') {
    label = 'Client Replied';
    colorClass = 'text-red-400';
  } else if (isReviewing) {
    label = 'Active Review';
    colorClass = 'text-blue-400';
  } else if (type === 'needs_review') {
    label = 'Active Review';
    colorClass = 'text-amber-400';
  } else if (type === 'follow_up') {
    label = 'Follow-Up';
    colorClass = 'text-orange-400';
  } else if (type === 'approved_recent') {
    label = 'Resolved';
    colorClass = 'text-green-400';
  } else if (lastActor === 'client') {
    label = 'Client Replied';
    colorClass = 'text-red-400';
  } else {
    label = 'Follow-Up';
    colorClass = 'text-gray-400';
  }

  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-wide", colorClass)}>
      {label}
    </span>
  );
}