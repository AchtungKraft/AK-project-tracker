import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  ChevronDown, 
  ChevronRight, 
  FolderKanban, 
  AlertCircle, 
  Clock, 
  MessageSquareText, 
  CheckCircle2,
  Flame,
  Pause,
  Zap
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import CompactRequestRow from "./CompactRequestRow";

/**
 * Health tag — project-level health indicator in header
 */
const HEALTH_TAGS = {
  critical: { label: 'Needs Attention', icon: Flame, bg: 'bg-red-500/15 text-red-400 border-red-500/30' },
  stalled: { label: 'Stalled', icon: Pause, bg: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  active: { label: 'Active', icon: Zap, bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  approved: { label: 'Approved', icon: CheckCircle2, bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  waiting: { label: 'Waiting', icon: Clock, bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

/**
 * UnifiedProjectContainer — ONE project = ONE queue object.
 * 
 * Contains ALL requests across all lifecycle buckets,
 * rendered as compact timeline rows grouped by status.
 * Header shows project health at a glance.
 */
export default function UnifiedProjectContainer({
  project,
  health,
  allRequests,   // all requests for this project, with _bucket set
  getProjectClientSlug,
  onUpdateDueDate,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  const total = allRequests.length;

  // Sort requests for timeline display:
  // overdue first, then replied, then waiting, then drafts, then approved
  const sortedRequests = useMemo(() => {
    const order = { overdue: 0, client_replied: 1, awaiting_client: 2, draft: 3, recently_approved: 4, approved: 5 };
    return [...allRequests].sort((a, b) => {
      const aKey = a.isOverdue ? 'overdue' : a._bucket;
      const bKey = b.isOverdue ? 'overdue' : b._bucket;
      return (order[aKey] ?? 6) - (order[bKey] ?? 6);
    });
  }, [allRequests]);

  if (total === 0) return null;

  // Auto-expand single-request projects
  const isSingle = total === 1;
  const showExpanded = expanded || isSingle;

  // Determine health tag
  let healthKey = 'waiting';
  if (health.overdue > 0 || health.replied > 0) healthKey = 'critical';
  else if (health.isStalled) healthKey = 'stalled';
  else if (health.recentApproval > 0 && health.active === 0) healthKey = 'approved';
  else if (health.active > 0) healthKey = 'active';
  const tag = HEALTH_TAGS[healthKey];
  const TagIcon = tag.icon;

  const projectName = project?.name || 'Unknown Project';

  return (
    <div className={cn(
      "rounded-md border overflow-hidden transition-all",
      "border-l-[3px]",
      health.accent.border,
      health.overdue > 0 && "shadow-sm shadow-red-900/10",
      health.recentApproval > 0 && "shadow-sm shadow-emerald-900/10",
    )}>
      {/* === PROJECT HEADER === */}
      <button
        type="button"
        onClick={() => !isSingle && setExpanded(prev => !prev)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
          showExpanded ? health.accent.headerBg : 'bg-gray-900/20 hover:bg-gray-900/40',
          isSingle && 'cursor-default'
        )}
      >
        {/* Expand toggle */}
        {!isSingle && (
          <div className="shrink-0 text-gray-500">
            {showExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>
        )}
        
        {/* Project icon */}
        <FolderKanban className={cn("w-4 h-4 shrink-0", health.accent.text)} />
        
        {/* Project name — PRIMARY hierarchy */}
        <span className="text-white font-semibold text-sm truncate">
          {projectName}
        </span>

        {/* Health tag */}
        <span className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border shrink-0",
          tag.bg
        )}>
          <TagIcon className="w-3 h-3" />
          {tag.label}
        </span>

        <div className="flex-1" />

        {/* Status breakdown chips — SECONDARY hierarchy */}
        <div className="flex items-center gap-1.5 shrink-0">
          {health.overdue > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-bold">
              <AlertCircle className="w-3 h-3" />{health.overdue}
            </span>
          )}
          {health.replied > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-blue-400 font-medium">
              <MessageSquareText className="w-3 h-3" />{health.replied}
            </span>
          )}
          {health.waiting > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-400/70">
              <Clock className="w-3 h-3" />{health.waiting}
            </span>
          )}
          {health.recentApproval > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />{health.recentApproval}
            </span>
          )}
        </div>

        {/* Stalled badge */}
        {health.isStalled && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/30 shrink-0">
            {Math.floor(health.daysSinceActivity)}d
          </span>
        )}

        {/* Last activity */}
        {health.latestTs && !health.isStalled && (
          <span className="text-[10px] text-gray-500 shrink-0">
            {formatDistanceToNow(new Date(health.latestTs), { addSuffix: false })}
          </span>
        )}

        {/* Total count */}
        {total > 1 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400 shrink-0">
            {total}
          </span>
        )}
      </button>

      {/* === WORKFLOW TIMELINE === */}
      {showExpanded && (
        <div className="px-1.5 pb-1.5 space-y-0.5 bg-black/10">
          {sortedRequests.map(request => (
            <CompactRequestRow
              key={request.id}
              request={request}
              bucket={request._bucket}
              getProjectClientSlug={getProjectClientSlug}
              onUpdateDueDate={onUpdateDueDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}