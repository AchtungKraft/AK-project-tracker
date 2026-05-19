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
 * Single-request projects: always expanded.
 * Multi-request projects: collapsed by default.
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

  // For single items, render directly without a group header
  if (isSingle) {
    return (
      <ActionQueueRequestRow
        item={items[0]}
        onUpdateDueDate={onUpdateDueDate}
      />
    );
  }

  return (
    <div className={cn(
      "rounded-lg border border-gray-700/40 overflow-hidden border-l-[3px]",
      accent.border,
      expanded ? accent.bg : 'bg-gray-900/15 hover:bg-gray-900/30'
    )}>
      {/* Project summary header */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors group/header"
      >
        <span className="text-gray-500 shrink-0">
          {expanded 
            ? <ChevronDown className="w-3.5 h-3.5" /> 
            : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        
        <FolderKanban className={cn("w-3.5 h-3.5 shrink-0", accent.icon)} />
        
        <span className="text-sm font-medium text-white truncate flex-1 min-w-0">
          {projectName || 'Unknown Project'}
        </span>

        {/* Summary micro-badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          {stats.overdue > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-semibold">
              <AlertCircle className="w-3 h-3" />
              {stats.overdue}
            </span>
          )}
          {stats.newActivity > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {stats.newActivity} new
            </span>
          )}
          {stats.inReview > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-blue-400">
              <Clock className="w-3 h-3" />
              {stats.inReview}
            </span>
          )}
          {stats.highRisk > 0 && columnKey === 'follow_up' && (
            <span className="flex items-center gap-0.5 text-[10px] text-orange-400 font-semibold">
              ⚠ {stats.highRisk}
            </span>
          )}
          
          {/* Total count badge */}
          <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[10px] px-1.5 py-0">
            {items.length}
          </Badge>
        </div>
      </button>

      {/* Expanded: compact request rows */}
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          {items.map(item => (
            <ActionQueueRequestRow
              key={item.requestId}
              item={item}
              onUpdateDueDate={onUpdateDueDate}
              muted={item.followUpMeta?.riskTier === 'low'}
            />
          ))}
        </div>
      )}
    </div>
  );
}