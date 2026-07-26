import React, { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { FolderKanban, ChevronRight } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import InlineDueDatePicker from "./InlineDueDatePicker";
import { ATTENTION_BADGE_CONFIG, getWaitingTimeLabel } from "./attentionHelpers";
import { Badge } from "@/components/ui/badge";
import AttentionCardActions from "./AttentionCardActions";

const BORDER_COLORS = {
  needs_response: 'border-l-red-500',
  overdue: 'border-l-red-600',
  needs_review: 'border-l-amber-500',
  follow_up: 'border-l-orange-500',
  approved_recent: 'border-l-green-500',
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
  const { request, project, type, isOverdue, lastActor, lastActivityAt } = item;
  const config = ATTENTION_BADGE_CONFIG[type];
  const risk = item.followUpMeta?.riskTier;
  const requestUrl = createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&tab=attention`;

  // Portal hover preview state
  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hoverPosition, setHoverPosition] = useState(null);

  const onEnter = () => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Position directly over the card
    setHoverPosition({
      top: rect.top,
      left: rect.left,
      width: rect.width,
    });
    setIsHovered(true);
  };

  const onLeave = () => setIsHovered(false);

  // Message snippet for inline display — unified across comments and decisions
  const snippet = request.latestCommentContent || null;
  const truncatedSnippet = snippet ? (snippet.length > 80 ? snippet.slice(0, 80) + '…' : snippet) : null;

  // Hover preview snippet (longer, from unified field)
  const hoverSnippet = item.lastCommentSnippet
    ? (item.lastCommentSnippet.length > 200 ? item.lastCommentSnippet.slice(0, 200) + '…' : item.lastCommentSnippet)
    : null;

  // Waiting time label for needs_response
  const waitingLabel = type === 'needs_response' && lastActivityAt
    ? getWaitingTimeLabel(lastActivityAt)
    : null;

  const isNewClientActivity = lastActor === 'client' && type !== 'approved_recent';

  // Resolve border color — risk tier overrides for follow-up
  const borderColor = type === 'follow_up' && risk
    ? RISK_BORDER[risk]
    : (BORDER_COLORS[type] || 'border-l-gray-500');

  // Card background
  let cardClasses;
  if (isOverdue) {
    cardClasses = 'bg-red-950/30 border-red-500/50 border-l-4 border-l-red-500';
  } else if (type === 'approved_recent') {
    cardClasses = 'border-l-[3px] border-l-emerald-500 bg-emerald-950/25 border border-emerald-500/30 hover:border-emerald-400/50 hover:bg-emerald-950/35';
  } else if (type === 'follow_up' && risk) {
    const borderWidth = risk === 'high' ? 'border-l-[4px] border-2' : 'border-l-[3px]';
    cardClasses = `${borderWidth} ${borderColor} ${RISK_BG[risk]} hover:border-gray-500 hover:bg-gray-900/80`;
  } else {
    cardClasses = `border-l-[3px] ${borderColor} ${muted ? 'bg-black/20 border-gray-800 opacity-70' : 'bg-black/40 border-gray-700 hover:border-gray-500 hover:bg-gray-900/80'}`;
  }

  return (
    <div
      ref={cardRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={`relative rounded-lg border transition-all duration-200 group/card min-h-[44px] hover:shadow-lg hover:scale-[1.01] ${cardClasses}`}
    >
      <div className="p-2.5 md:p-3">
        {/* Navigable content zone */}
        <Link to={requestUrl} className="block hover:opacity-90 transition-opacity">
          {/* Top row: badges */}
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            {config && (
              <Badge className={`${config.bgClass} ${config.textClass} ${config.borderClass} text-[10px] px-1.5 py-0`}>
                {config.label}
              </Badge>
            )}
            {isOverdue && (
              <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0 font-semibold">
                OVERDUE
              </Badge>
            )}
            {request.review_state === 'in_review' && !isNewClientActivity && (
              <Badge className={`text-[10px] px-1.5 py-0 ${
                item.isReviewStale
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  : 'bg-blue-500/20 text-blue-400 border-blue-500/40'
              }`}>
                {item.isReviewStale ? 'REVIEW DELAYED' : 'IN REVIEW'}
              </Badge>
            )}
            {isNewClientActivity && (
              <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                NEW
              </span>
            )}
            {item.isStalled && (
              <span className="text-[10px] text-yellow-400 font-semibold">⚠ Stalled</span>
            )}
            {/* Operational overlay badges */}
            {item.isReviewStale && !item.request.queue_hidden && (
              <Badge className="bg-amber-600/15 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                Stale Review
              </Badge>
            )}
            {item.request.queue_hidden && item.request.queue_resume_date && (
              <Badge className="bg-gray-600/20 text-gray-400 border-gray-500/30 text-[10px] px-1.5 py-0">
                Resume {format(new Date(item.request.queue_resume_date), 'MMM d')}
              </Badge>
            )}
            {item.request.queue_hidden && !item.request.queue_resume_date && (
              <Badge className="bg-gray-600/20 text-gray-400 border-gray-500/30 text-[10px] px-1.5 py-0">
                Hidden Until Resumed
              </Badge>
            )}
          </div>

          {/* Title */}
          <h4 className="font-medium text-sm text-white group-hover/card:text-red-400 transition-colors line-clamp-2 mb-1">
            {request.title}
          </h4>

          {/* Project name */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
            <FolderKanban className="w-3 h-3 shrink-0" />
            <span className="truncate">{project?.name || 'Unknown Project'}</span>
          </div>

          {/* Comment snippet */}
          <p className="text-xs text-gray-500 italic line-clamp-1 mb-1">
            {truncatedSnippet ? `"${truncatedSnippet}"` : 'No recent message'}
          </p>

          {/* Activity / Waiting / Follow-up label */}
          {waitingLabel ? (
            <p className="text-[11px] text-red-400 font-medium">{waitingLabel}</p>
          ) : item.followUpLabel ? (
            <div>
              <p className="text-[11px] text-orange-400 font-medium">{item.followUpLabel}</p>
              <p className="text-[10px] text-gray-500">Last message: Team</p>
            </div>
          ) : item.lastActivityLabel ? (
            <p className="text-[11px] text-gray-500">{item.lastActivityLabel}</p>
          ) : null}

          {/* Follow-up action guidance */}
          {type === 'follow_up' && item.followUpMeta && (
            <p className={`text-xs mt-1 font-medium ${
              risk === 'high' ? 'text-orange-400' : risk === 'medium' ? 'text-amber-400' : 'text-gray-400'
            }`}>
              → {item.followUpMeta.actionLabel}
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
            {onAction && (
              <AttentionCardActions item={item} onAction={onAction} />
            )}
            <Link to={requestUrl} className="shrink-0 flex items-center gap-1">
              <span className="text-xs text-gray-600 hidden group-hover/card:inline transition-opacity">Open</span>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover/card:text-red-400 transition-colors" />
            </Link>
          </div>
        </div>
      </div>

      {/* Hover comment preview — portalled over the card */}
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