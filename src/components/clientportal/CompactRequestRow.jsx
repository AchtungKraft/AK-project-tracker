import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  ChevronRight, 
  MessageSquareText, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { getRequestTypeInfo } from "./utils";
import InlineDueDatePicker from "./InlineDueDatePicker";
import { CopyRequestLinkButton } from "./ClientLinksCopyButtons";

/**
 * Minimal status indicator — icon-first, max 1 label.
 * Replaces heavy bordered badge chips with lean inline signals.
 */
function StatusSignal({ type }) {
  const configs = {
    overdue: { icon: AlertCircle, label: 'OVERDUE', color: 'text-red-400' },
    replied: { icon: MessageSquareText, label: 'REPLIED', color: 'text-blue-400' },
    approved: { icon: CheckCircle2, label: null, color: 'text-emerald-400' },
    draft: { icon: null, label: 'DRAFT', color: 'text-gray-500' },
    waiting: { icon: Clock, label: null, color: 'text-amber-400/60' },
  };
  const c = configs[type] || configs.waiting;
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide shrink-0", c.color)}>
      {Icon && <Icon className="w-3 h-3" />}
      {c.label && <span>{c.label}</span>}
    </span>
  );
}

/**
 * CompactRequestRow — ultra-lean timeline event row.
 * Feels like a log entry, not a card.
 * ~28px height. No borders. Minimal chrome.
 */
export default function CompactRequestRow({ 
  request, 
  bucket, 
  getProjectClientSlug, 
  onUpdateDueDate,
  showProject = false,
}) {
  const effectiveBucket = bucket || request._bucket || 'awaiting_client';
  const overdue = request.isOverdue;
  const isApproved = effectiveBucket === 'recently_approved' || effectiveBucket === 'approved';
  const isDraft = effectiveBucket === 'draft';

  let statusType = 'waiting';
  if (overdue) statusType = 'overdue';
  else if (isApproved) statusType = 'approved';
  else if (effectiveBucket === 'client_replied') statusType = 'replied';
  else if (isDraft) statusType = 'draft';

  // Stalled: icon-only, no separate chip
  const isStalled = !isDraft && !isApproved && request.latestActivityAt && 
    (Date.now() - new Date(request.latestActivityAt).getTime()) > 3 * 24 * 60 * 60 * 1000;
  const stalledDays = isStalled 
    ? Math.floor((Date.now() - new Date(request.latestActivityAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const typeInfo = getRequestTypeInfo(request.request_type);

  // Time signal
  const timeAgo = request.latestActivityAt
    ? formatDistanceToNow(new Date(request.latestActivityAt), { addSuffix: false })
    : null;

  return (
    <div className={cn(
      "group flex items-center gap-2 px-2.5 py-[5px] rounded-sm transition-colors",
      overdue 
        ? "hover:bg-red-950/15" 
        : isApproved
          ? "hover:bg-emerald-950/10"
          : "hover:bg-white/[0.03]"
    )}>
      {/* Status signal — lean icon */}
      <div className="w-[60px] shrink-0 flex items-center gap-1">
        <StatusSignal type={statusType} />
        {isStalled && (
          <span className="text-[9px] font-medium text-orange-400/80">{stalledDays}d</span>
        )}
      </div>

      {/* Title — PRIMARY hierarchy */}
      <Link
        to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&bucket=${effectiveBucket}`}
        className="flex-1 min-w-0 flex items-center gap-2"
      >
        {showProject && request._projectName && (
          <span className="text-[10px] text-gray-600 font-medium shrink-0 max-w-[100px] truncate">
            {request._projectName}
          </span>
        )}
        <span className={cn(
          "text-[13px] truncate transition-colors",
          overdue ? "text-gray-200 font-medium" : isApproved ? "text-gray-400" : "text-gray-300",
          "group-hover:text-white"
        )}>
          {request.title}
        </span>
      </Link>

      {/* Type — tertiary, text-only */}
      <span className="text-[10px] text-gray-600 shrink-0 hidden sm:inline">
        {typeInfo.label}
      </span>

      {/* Comment count — subtle */}
      {request.totalCommentCount > 0 && (
        <span className="text-[10px] text-gray-600 flex items-center gap-0.5 shrink-0">
          <MessageSquareText className="w-2.5 h-2.5" />
          {request.totalCommentCount}
        </span>
      )}

      {/* Time — tertiary, emphasized for recent activity */}
      {timeAgo && (
        <span className={cn(
          "text-[10px] shrink-0 w-14 text-right hidden md:inline tabular-nums",
          statusType === 'replied' ? "text-blue-400/70 font-medium" : "text-gray-600"
        )}>
          {timeAgo}
        </span>
      )}

      {/* Quick actions — appear on hover */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.preventDefault()}>
        {!isDraft && onUpdateDueDate && (
          <InlineDueDatePicker
            dueDate={request.due_date}
            isOverdue={overdue}
            onDateChange={(date) => onUpdateDueDate(request.id, date)}
          />
        )}
        {!isDraft && (
          <CopyRequestLinkButton
            slug={getProjectClientSlug(request.project_id)}
            requestId={request.id}
          />
        )}
      </div>

      <Link
        to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&bucket=${effectiveBucket}`}
      >
        <ChevronRight className="w-3 h-3 text-gray-700 group-hover:text-gray-400 transition-colors shrink-0" />
      </Link>
    </div>
  );
}

export { StatusSignal };