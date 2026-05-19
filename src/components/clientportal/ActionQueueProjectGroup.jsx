import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronDown, 
  ChevronRight, 
  FolderKanban, 
  AlertCircle,
  Clock,
  MessageSquareText,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import ActionQueueRequestRow from "./ActionQueueRequestRow";

/**
 * Compute summary stats for a project's items within a column.
 */
function computeStats(items) {
  let overdue = 0, stalled = 0, newActivity = 0, inReview = 0, highRisk = 0;
  for (const item of items) {
    if (item.isOverdue) overdue++;
    if (item.isStalled) stalled++;
    if (item.lastActor === 'client' && item.type !== 'approved_recent') newActivity++;
    if (item.request?.review_state === 'in_review') inReview++;
    if (item.followUpMeta?.riskTier === 'high') highRisk++;
  }
  return { overdue, stalled, newActivity, inReview, highRisk };
}

/**
 * Accent color based on column context.
 */
const COLUMN_ACCENTS = {
  needs_sending: { border: 'border-l-purple-500', icon: 'text-purple-400/70', bg: 'bg-purple-950/10' },
  client_waiting: { border: 'border-l-red-500', icon: 'text-red-400/70', bg: 'bg-red-950/10' },
  review_active: { border: 'border-l-amber-500', icon: 'text-amber-400/70', bg: 'bg-amber-950/10' },
  follow_up: { border: 'border-l-orange-500', icon: 'text-orange-400/70', bg: 'bg-orange-950/10' },
  resolved: { border: 'border-l-green-500', icon: 'text-green-400/70', bg: 'bg-green-950/10' },
};

/**
 * ActionQueueProjectGroup — collapsible project header with compact request rows.
 * 
 * Shows a one-line project summary with status micro-badges,
 * and expands to show individual request rows beneath.
 * 
 * Single-request projects: rendered with lightweight project header.
 * Multi-request projects: collapsed by default, expandable.
 */
export default function ActionQueueProjectGroup({
  projectName,
  projectId,
  items,
  columnKey,
  onUpdateDueDate,
}) {
  const isSingle = items.length === 1;
  const [expanded, setExpanded] = useState(isSingle);
  
  const stats = useMemo(() => computeStats(items), [items]);
  const accent = COLUMN_ACCENTS[columnKey] || COLUMN_ACCENTS.client_waiting;

  return (
    <div className={cn(
      "rounded-lg border border-l-[3px] overflow-hidden transition-all",
      accent.border,
      isSingle
        ? 'bg-transparent border-b border-gray-700/20'
        : expanded 
          ? cn(accent.bg, 'border-gray-700/50')
          : 'bg-gray-900/20 border-gray-700/40 hover:bg-gray-900/35'
    )}>
      {/* Project header — always visible for single and multi items */}
      {!isSingle && (
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors group/header hover:bg-gray-800/20"
        >
          {/* Chevron — more prominent */}
          <span className={cn(
            "transition-transform shrink-0",
            expanded && "rotate-90"
          )}>
            {expanded 
              ? <ChevronDown className={cn("w-4 h-4", accent.icon)} /> 
              : <ChevronRight className={cn("w-4 h-4", accent.icon)} />}
          </span>
          
          {/* Project title — stronger hierarchy */}
          <span className="text-sm font-semibold text-white truncate flex-1 min-w-0">
            {projectName || 'Unknown Project'}
          </span>

          {/* Summary micro-badges */}
          <div className="flex items-center gap-1.5 shrink-0">
            {stats.overdue > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-bold">
                <AlertCircle className="w-3 h-3" />
                {stats.overdue}
              </span>
            )}
            {stats.newActivity > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                {stats.newActivity}
              </span>
            )}
            {stats.inReview > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-blue-400 font-medium">
                <Clock className="w-3 h-3" />
                {stats.inReview}
              </span>
            )}
            {stats.highRisk > 0 && columnKey === 'follow_up' && (
              <span className="flex items-center gap-0.5 text-[10px] text-orange-400 font-bold">
                ⚠ {stats.highRisk}
              </span>
            )}
            
            {/* Count badge */}
            <Badge className={cn(
              "text-[10px] px-2 py-0.5 font-semibold shrink-0",
              isSingle
                ? 'bg-gray-700/40 text-gray-400 border-gray-600'
                : 'bg-gray-800 text-gray-300 border-gray-700'
            )}>
              {items.length}
            </Badge>
          </div>
        </button>
      )}

      {/* Single-item lightweight header */}
      {isSingle && (
        <div className="px-3 py-1.5 flex items-center gap-2 text-[11px] text-gray-600 font-medium">
          <FolderKanban className={cn("w-3 h-3 shrink-0", accent.icon)} />
          <span className="truncate">{projectName}</span>
        </div>
      )}

      {/* Expanded rows or single item */}
      {(isSingle || expanded) && (
        <div className={cn(
          isSingle ? 'space-y-0' : 'px-2.5 pb-2.5 space-y-1.5 border-t border-gray-700/20'
        )}>
          {items.map(item => (
            <ActionQueueRequestRow
              key={item.requestId}
              item={item}
              onUpdateDueDate={onUpdateDueDate}
              muted={item.followUpMeta?.riskTier === 'low'}
              isSingleInGroup={isSingle}
            />
          ))}
        </div>
      )}
    </div>
  );
}