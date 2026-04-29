import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { FolderKanban, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import InlineDueDatePicker from "./InlineDueDatePicker";
import { ATTENTION_BADGE_CONFIG } from "./attentionHelpers";
import { Badge } from "@/components/ui/badge";

const BORDER_COLORS = {
  needs_response: 'border-l-red-500',
  overdue: 'border-l-red-500',
  needs_review: 'border-l-amber-500',
  approved_recent: 'border-l-green-500',
};

export default function AttentionCard({ item, onUpdateDueDate }) {
  const { request, project, type, isOverdue, lastActivityLabel } = item;
  const config = ATTENTION_BADGE_CONFIG[type];
  const borderColor = BORDER_COLORS[type] || 'border-l-gray-500';
  const requestUrl = createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&tab=attention`;

  // Get last comment snippet
  const snippet = request.lastClientComment?.content_fallback
    || request.lastClientComment?.body
    || null;
  const truncatedSnippet = snippet ? (snippet.length > 80 ? snippet.slice(0, 80) + '…' : snippet) : null;

  return (
    <div className={`relative rounded-lg border border-l-[3px] ${borderColor} transition-all group min-h-[44px] ${
      isOverdue
        ? 'bg-red-950/20 border-red-500/40'
        : 'bg-black/40 border-gray-700 hover:border-gray-500 hover:bg-gray-900/80'
    }`}>
      <div className="p-2.5 md:p-3">
        {/* Navigable content zone */}
        <Link to={requestUrl} className="block hover:opacity-90 transition-opacity">
          {/* Top row: badge + project */}
          <div className="flex items-center gap-2 mb-1.5">
            {config && (
              <Badge className={`${config.bgClass} ${config.textClass} ${config.borderClass} text-[10px] px-1.5 py-0`}>
                {config.label}
              </Badge>
            )}
            {isOverdue && type !== 'overdue' && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/50 text-[10px] px-1.5 py-0">
                Overdue
              </Badge>
            )}
          </div>

          {/* Title */}
          <h4 className="font-medium text-sm text-white group-hover:text-red-400 transition-colors line-clamp-1 mb-1">
            {request.title}
          </h4>

          {/* Project name */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
            <FolderKanban className="w-3 h-3 shrink-0" />
            <span className="truncate">{project?.name || 'Unknown Project'}</span>
          </div>

          {/* Last comment snippet */}
          {truncatedSnippet && (
            <p className="text-xs text-gray-500 italic line-clamp-1 mb-1">
              "{truncatedSnippet}"
            </p>
          )}

          {/* Activity label */}
          {lastActivityLabel && (
            <p className="text-[11px] text-gray-500">
              {lastActivityLabel}
            </p>
          )}
        </Link>

        {/* Action zone — outside Link */}
        <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-800/50">
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            {request.clientCommentCount > 0 && (
              <span>{request.clientCommentCount} client {request.clientCommentCount === 1 ? 'reply' : 'replies'}</span>
            )}
            {request.due_date && (
              <span className={isOverdue ? 'text-red-400 font-medium' : ''}>
                Due {formatDistanceToNow(new Date(request.due_date), { addSuffix: true })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {onUpdateDueDate && (
              <InlineDueDatePicker
                dueDate={request.due_date}
                isOverdue={isOverdue}
                onDateChange={(date) => onUpdateDueDate(request.id, date)}
              />
            )}
            <Link to={requestUrl} className="shrink-0">
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-red-400 transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}