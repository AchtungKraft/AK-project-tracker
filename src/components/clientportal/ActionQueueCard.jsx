import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, MessageSquareText, FolderKanban, Calendar as CalendarIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import InlineDueDatePicker from "./InlineDueDatePicker";
import { ATTENTION_BADGE_CONFIG, getWaitingTimeLabel } from "./attentionHelpers";

/**
 * ActionQueueCard — readable card for outer columns (Drafts, Follow-Up).
 * 
 * Shows project name, request title, type badge, activity info, due date.
 * Comfortable padding, clear hierarchy, easy scanning.
 * NOT grouped by project — each request is its own card.
 */
export default function ActionQueueCard({ item, onUpdateDueDate, columnKey }) {
  const { request, project, type, isOverdue, lastActor, lastActivityAt } = item;
  const config = ATTENTION_BADGE_CONFIG[type];
  const risk = item.followUpMeta?.riskTier;
  const requestUrl = createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&tab=attention`;

  const isDraft = columnKey === 'needs_sending';
  const isFollowUp = columnKey === 'follow_up';

  // Border color by risk/type
  let borderColor = 'border-l-gray-600';
  if (isOverdue) borderColor = 'border-l-red-600';
  else if (isFollowUp && risk === 'high') borderColor = 'border-l-orange-600';
  else if (isFollowUp && risk === 'medium') borderColor = 'border-l-amber-500';
  else if (isDraft) borderColor = 'border-l-purple-500';
  else if (isFollowUp) borderColor = 'border-l-orange-400';

  // Background
  let bgClass = 'bg-gray-900/40 border-gray-700/40 hover:bg-gray-800/60 hover:border-gray-600/60';
  if (isOverdue) bgClass = 'bg-red-950/20 border-red-500/30 hover:bg-red-950/30';
  else if (isFollowUp && risk === 'high') bgClass = 'bg-orange-950/15 border-orange-500/25 hover:bg-orange-950/25';

  return (
    <Link
      to={requestUrl}
      className={cn(
        "block rounded-lg border border-l-[3px] transition-all group/card",
        borderColor, bgClass
      )}
    >
      <div className="px-3 py-2.5 space-y-1.5">
        {/* Project name */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <FolderKanban className="w-3 h-3 shrink-0 text-gray-600" />
          <span className="truncate">{project?.name || 'Unknown Project'}</span>
        </div>

        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-white group-hover/card:text-red-400 transition-colors leading-snug line-clamp-2 flex-1 min-w-0">
            {request.title}
          </span>
          <ChevronRight className="w-4 h-4 text-gray-600 group-hover/card:text-red-400 transition-colors shrink-0 mt-0.5" />
        </div>

        {/* Bottom row: badges + metadata */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Overdue badge */}
          {isOverdue && (
            <Badge className="bg-red-600 text-white text-[9px] px-1.5 py-0 font-bold">
              OVERDUE
            </Badge>
          )}

          {/* Follow-up risk badge */}
          {isFollowUp && risk && risk !== 'low' && (
            <Badge className={cn(
              "text-[9px] px-1.5 py-0 font-medium",
              risk === 'high' ? 'bg-orange-500/20 text-orange-400 border-orange-500/40' :
              'bg-amber-500/20 text-amber-400 border-amber-500/40'
            )}>
              {item.followUpMeta?.actionLabel}
            </Badge>
          )}

          {/* Activity info */}
          <span className={cn(
            "text-[11px] whitespace-nowrap",
            isFollowUp && risk === 'high' ? 'text-orange-400 font-medium' :
            isFollowUp && risk === 'medium' ? 'text-amber-400' :
            'text-gray-500'
          )}>
            {item.lastActivityLabel || ''}
          </span>

          {/* Comment count */}
          {request.clientCommentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-gray-500">
              <MessageSquareText className="w-3 h-3" />
              {request.clientCommentCount}
            </span>
          )}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Due date — only for Follow-Up */}
          {isFollowUp && onUpdateDueDate && (
            <span onClick={e => e.preventDefault()}>
              <InlineDueDatePicker
                dueDate={request.due_date}
                isOverdue={isOverdue}
                onDateChange={(date) => onUpdateDueDate(request.id, date)}
              />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}