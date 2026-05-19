import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, MessageSquareText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import InlineDueDatePicker from "./InlineDueDatePicker";
import { ATTENTION_BADGE_CONFIG, getWaitingTimeLabel } from "./attentionHelpers";

const BORDER_COLORS = {
  needs_response: 'border-l-red-500',
  overdue: 'border-l-red-600',
  needs_review: 'border-l-amber-500',
  needs_sending: 'border-l-purple-500',
  follow_up: 'border-l-orange-500',
  approved_recent: 'border-l-green-500',
};

const RISK_BORDER = {
  high: 'border-l-orange-600',
  medium: 'border-l-amber-400',
  low: 'border-l-gray-500',
};

/**
 * Compact single-line request row for the Action Queue.
 * No project name — that's in the parent group header.
 * Shows: title, type badge, status signals, activity time, actions.
 */
export default function ActionQueueRequestRow({ item, onUpdateDueDate, muted = false, isSingleInGroup = false }) {
  const { request, type, isOverdue, lastActor, lastActivityAt } = item;
  const config = ATTENTION_BADGE_CONFIG[type];
  const risk = item.followUpMeta?.riskTier;
  const requestUrl = createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&tab=attention`;

  const isNewClientActivity = lastActor === 'client' && type !== 'approved_recent';
  const isApprovedRecent = type === 'approved_recent';

  // Waiting time for client-waiting items
  const waitingLabel = type === 'needs_response' && lastActivityAt
    ? getWaitingTimeLabel(lastActivityAt)
    : null;

  // Resolve border color
  const borderColor = type === 'follow_up' && risk
    ? RISK_BORDER[risk]
    : (BORDER_COLORS[type] || 'border-l-gray-500');

  // Background based on state — with better breathing room
  let bgClass;
  if (isApprovedRecent) {
    bgClass = 'bg-green-950/15 border-green-500/30 hover:bg-green-950/25';
  } else if (isOverdue) {
    bgClass = 'bg-red-950/25 border-red-500/40 hover:bg-red-950/35';
  } else if (muted) {
    bgClass = 'bg-black/10 border-gray-800 opacity-65 hover:opacity-75';
  } else {
    bgClass = 'bg-black/20 border-gray-700/50 hover:border-gray-500 hover:bg-gray-900/60';
  }

  return (
    <div className={`rounded-md border border-l-[3px] ${borderColor} ${bgClass} transition-all group/row ${
      isSingleInGroup ? 'rounded-t-none' : ''
    }`}>
      <div className={cn(
        "flex items-center gap-2 text-left transition-colors",
        isSingleInGroup ? 'px-3 py-2' : 'px-2.5 py-2'
      )}>
        {/* Left: Title + inline badges */}
        <Link to={requestUrl} className="flex-1 min-w-0 flex items-center gap-2">
          {/* Status signals - compact inline badges */}
          <div className="flex items-center gap-1 shrink-0">
            {isOverdue && (
              <Badge className="bg-red-600 text-white text-[9px] px-1 py-0 font-bold leading-none">
                OVERDUE
              </Badge>
            )}
            {isNewClientActivity && (
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              </span>
            )}
            {request.review_state === 'in_review' && !isNewClientActivity && (
              <Badge className={`text-[9px] px-1 py-0 ${
                item.isReviewStale
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  : 'bg-blue-500/20 text-blue-400 border-blue-500/40'
              }`}>
                {item.isReviewStale ? 'STALE' : 'REVIEW'}
              </Badge>
            )}
            {item.isStalled && (
              <span className="text-[9px] text-yellow-400 font-bold">⚠</span>
            )}
          </div>

          {/* Title — improved wrapping for readability */}
          <span className="text-sm text-white group-hover/row:text-red-400 transition-colors line-clamp-2 flex-1 min-w-0">
            {request.title}
          </span>
        </Link>

        {/* Right: metadata + actions */}
        <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
          {/* Comment count */}
          {request.clientCommentCount > 0 && (
            <span className="flex items-center gap-0.5 text-gray-500">
              <MessageSquareText className="w-3 h-3" />
              {request.clientCommentCount}
            </span>
          )}

          {/* Activity time */}
          <span className={`whitespace-nowrap ${
            waitingLabel ? 'text-red-400 font-medium' :
            type === 'follow_up' && risk === 'high' ? 'text-orange-400 font-medium' :
            type === 'follow_up' && risk === 'medium' ? 'text-amber-400' :
            isApprovedRecent ? 'text-green-400 font-medium' :
            'text-gray-500'
          }`}>
            {waitingLabel ||
              (item.followUpLabel) ||
              (isApprovedRecent && lastActivityAt
                ? '✓ ' + formatDistanceToNow(new Date(lastActivityAt), { addSuffix: true })
                : item.lastActivityLabel || '')}
          </span>

          {/* Due date picker */}
          {onUpdateDueDate && type !== 'needs_sending' && (
            <InlineDueDatePicker
              dueDate={request.due_date}
              isOverdue={isOverdue}
              onDateChange={(date) => onUpdateDueDate(request.id, date)}
            />
          )}

          {/* Navigate arrow */}
          <Link to={requestUrl} className="shrink-0">
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover/row:text-red-400 transition-colors" />
          </Link>
        </div>
      </div>
    </div>
  );
}