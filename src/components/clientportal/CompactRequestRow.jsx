import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  ChevronRight, 
  MessageSquareText, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  Eye
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { getRequestTypeInfo } from "./utils";
import InlineDueDatePicker from "./InlineDueDatePicker";
import { CopyRequestLinkButton } from "./ClientLinksCopyButtons";

/**
 * Status chip — high-signal filled badge with consistent color
 */
function StatusChip({ type, className }) {
  const configs = {
    overdue: { label: 'OVERDUE', bg: 'bg-red-500/20 text-red-400 border-red-500/40' },
    waiting: { label: 'WAITING', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    replied: { label: 'REPLIED', bg: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
    approved: { label: 'APPROVED', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
    draft: { label: 'DRAFT', bg: 'bg-slate-500/20 text-slate-400 border-slate-500/40' },
    review: { label: 'REVIEW', bg: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
    stalled: { label: 'STALLED', bg: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  };
  const c = configs[type] || configs.waiting;
  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border shrink-0",
      c.bg,
      className
    )}>
      {c.label}
    </span>
  );
}

/**
 * CompactRequestRow — ultra-dense single-line request display.
 * ~30px height. Shows: status chip | title | type | time | actions
 */
export default function CompactRequestRow({ 
  request, 
  bucket, 
  getProjectClientSlug, 
  onUpdateDueDate,
  showProject = false,
}) {
  const overdue = request.isOverdue;
  const isApproved = bucket === 'recently_approved' || bucket === 'approved';
  const isDraft = bucket === 'draft';

  // Determine primary status
  let statusType = 'waiting';
  if (overdue) statusType = 'overdue';
  else if (isApproved) statusType = 'approved';
  else if (bucket === 'client_replied') statusType = 'replied';
  else if (isDraft) statusType = 'draft';

  // Stalled detection: no activity for 3+ days on non-draft/non-approved
  const isStalled = !isDraft && !isApproved && request.latestActivityAt && 
    (Date.now() - new Date(request.latestActivityAt).getTime()) > 3 * 24 * 60 * 60 * 1000;

  const typeInfo = getRequestTypeInfo(request.request_type);

  return (
    <div className={cn(
      "group flex items-center gap-2 px-2 py-1.5 rounded-md border transition-all",
      overdue 
        ? "bg-red-950/15 border-red-500/30 hover:border-red-500/50" 
        : isApproved
          ? "bg-emerald-950/10 border-emerald-500/20 hover:border-emerald-500/40"
          : isDraft
            ? "bg-slate-900/20 border-slate-700/30 hover:border-slate-600/50"
            : "bg-gray-900/20 border-gray-700/30 hover:border-gray-600/50"
    )}>
      {/* Status chip */}
      <StatusChip type={statusType} />
      {isStalled && <StatusChip type="stalled" />}

      {/* Title — primary visual weight */}
      <Link
        to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&bucket=${bucket}`}
        className="flex-1 min-w-0 flex items-center gap-2"
      >
        {showProject && request._projectName && (
          <span className="text-[10px] text-gray-500 font-medium shrink-0 max-w-[100px] truncate">
            {request._projectName}
          </span>
        )}
        <span className="text-sm text-white font-medium truncate group-hover:text-red-400 transition-colors">
          {request.title}
        </span>
      </Link>

      {/* Type badge — secondary */}
      <span className={cn("text-[9px] px-1.5 py-0.5 rounded shrink-0 hidden sm:inline-flex", typeInfo.color)}>
        {typeInfo.label}
      </span>

      {/* Comment count */}
      {request.totalCommentCount > 0 && (
        <span className="text-[10px] text-gray-500 flex items-center gap-0.5 shrink-0">
          <MessageSquareText className="w-3 h-3" />
          {request.totalCommentCount}
        </span>
      )}

      {/* Time signal — tertiary */}
      <span className="text-[10px] text-gray-500 shrink-0 hidden md:inline w-16 text-right">
        {request.latestActivityAt
          ? formatDistanceToNow(new Date(request.latestActivityAt), { addSuffix: false })
          : '—'}
      </span>

      {/* Quick actions */}
      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.preventDefault()}>
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
        to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&bucket=${bucket}`}
      >
        <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-red-400 transition-colors shrink-0" />
      </Link>
    </div>
  );
}

export { StatusChip };