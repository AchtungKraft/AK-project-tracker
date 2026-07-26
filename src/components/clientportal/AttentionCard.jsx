import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import InlineDueDatePicker from "./InlineDueDatePicker";
import { ATTENTION_BADGE_CONFIG, getWaitingTimeLabel } from "./attentionHelpers";
import { Badge } from "@/components/ui/badge";
import AttentionCardActions from "./AttentionCardActions";
import { OwnershipBadge } from "./NextActionPanel";

const BORDER_COLORS = {
  needs_response: 'border-l-red-500',
  overdue: 'border-l-red-600',
  needs_review: 'border-l-amber-500',
  follow_up: 'border-l-orange-500',
  approved_recent: 'border-l-green-500',
  needs_sending: 'border-l-purple-500',
};

const RISK_BORDER = {
  high: 'border-l-orange-600',
  medium: 'border-l-amber-400',
  low: 'border-l-gray-500',
};

const RISK_BG = {
  high: 'bg-orange-950/40 border-orange-500/50',
  medium: 'bg-black/40 border-gray-700',
  low: 'bg-black/30 border-gray-800',
};

export default function AttentionCard({ item, onUpdateDueDate, onAction, muted = false }) {
  const { request, project, type, isOverdue, lastActivityAt } = item;
  const config = ATTENTION_BADGE_CONFIG[type];
  const risk = item.followUpMeta?.riskTier;
  const requestUrl = createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&tab=attention`;

  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hoverPosition, setHoverPosition] = useState(null);

  const onEnter = () => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHoverPosition({ top: rect.top, left: rect.left, width: rect.width });
    setIsHovered(true);
  };
  const onLeave = () => setIsHovered(false);

  // Comment snippet
  const snippet = request.latestCommentContent || null;
  const truncatedSnippet = snippet ? (snippet.length > 70 ? snippet.slice(0, 70) + '…' : snippet) : null;

  // Hover preview
  const hoverSnippet = item.lastCommentSnippet
    ? (item.lastCommentSnippet.length > 200 ? item.lastCommentSnippet.slice(0, 200) + '…' : item.lastCommentSnippet)
    : null;

  // Waiting time
  const waitingLabel = type === 'needs_response' && lastActivityAt
    ? getWaitingTimeLabel(lastActivityAt)
    : null;

  // Border color
  const borderColor = type === 'follow_up' && risk
    ? RISK_BORDER[risk]
    : (BORDER_COLORS[type] || 'border-l-gray-500');

  // Card background
  let cardClasses;
  if (isOverdue) {
    cardClasses = 'bg-red-950/30 border-red-500/50 border-l-4 border-l-red-500';
  } else if (type === 'approved_recent') {
    cardClasses = 'border-l-[3px] border-l-emerald-500 bg-emerald-950/25 border border-emerald-500/30 hover:border-emerald-400/50';
  } else if (type === 'follow_up' && risk) {
    const borderWidth = risk === 'high' ? 'border-l-[4px] border-2' : 'border-l-[3px]';
    cardClasses = `${borderWidth} ${borderColor} ${RISK_BG[risk]} hover:border-gray-500`;
  } else {
    cardClasses = `border-l-[3px] ${borderColor} ${muted ? 'bg-black/20 border-gray-800 opacity-70' : 'bg-black/40 border-gray-700 hover:border-gray-500'}`;
  }

  return (
    <div
      ref={cardRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={`relative rounded-lg border transition-all duration-150 group/card min-h-[44px] ${cardClasses}`}
    >
      <div className="p-2.5">
        <Link to={requestUrl} className="block hover:opacity-90 transition-opacity">
          {/* Row 1: Ownership + Priority badges */}
          <div className="flex items-center justify-between mb-1">
            <OwnershipBadge item={item} />
            <div className="flex items-center gap-1">
              {isOverdue && (
                <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0 font-semibold">
                  Overdue
                </Badge>
              )}
              {item.isReviewStale && !isOverdue && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px] px-1.5 py-0">
                  Stale
                </Badge>
              )}
              {item.isStalled && !isOverdue && !item.isReviewStale && (
                <span className="text-[10px] text-yellow-400 font-semibold">⚠ Stalled</span>
              )}
            </div>
          </div>

          {/* Row 2: Title */}
          <h4 className="font-medium text-sm text-white group-hover/card:text-red-400 transition-colors line-clamp-1 mb-0.5">
            {request.title}
          </h4>

          {/* Row 3: Project + timing on same line */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 mb-1">
            <span className="truncate">{project?.name || 'Unknown'}</span>
            <span className="shrink-0">
              {waitingLabel || item.followUpLabel || item.lastActivityLabel || ''}
            </span>
          </div>

          {/* Row 4: Snippet (optional) */}
          {truncatedSnippet && (
            <p className="text-[11px] text-gray-500 italic line-clamp-1">
              "{truncatedSnippet}"
            </p>
          )}
        </Link>

        {/* Footer: due date + actions */}
        <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-gray-800/40">
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            {request.clientCommentCount > 0 && (
              <span>{request.clientCommentCount} {request.clientCommentCount === 1 ? 'reply' : 'replies'}</span>
            )}
            {request.due_date && (
              <span className={isOverdue ? 'text-red-400 font-medium' : ''}>
                Due {formatDistanceToNow(new Date(request.due_date), { addSuffix: true })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {onUpdateDueDate && (
              <InlineDueDatePicker
                dueDate={request.due_date}
                isOverdue={isOverdue}
                onDateChange={(date) => onUpdateDueDate(request.id, date)}
              />
            )}
            {onAction && (
              <AttentionCardActions item={item} onAction={onAction} />
            )}
            <Link to={requestUrl} className="shrink-0">
              <ChevronRight className="w-4 h-4 text-gray-600 group-hover/card:text-red-400 transition-colors" />
            </Link>
          </div>
        </div>
      </div>

      {/* Hover preview */}
      {isHovered && hoverSnippet && hoverPosition && createPortal(
        <div
          style={{
            position: 'fixed',
            top: hoverPosition.top,
            left: hoverPosition.left,
            width: hoverPosition.width,
            zIndex: 99999,
            pointerEvents: 'none',
          }}
          className="rounded-lg border border-gray-600 bg-black/95 backdrop-blur-md p-3 shadow-2xl"
        >
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
            {item.lastActor === 'client' ? 'Client' : 'Team'} · Latest Message
          </div>
          <div className="text-xs text-gray-200 leading-relaxed line-clamp-4">{hoverSnippet}</div>
        </div>,
        document.body
      )}
    </div>
  );
}