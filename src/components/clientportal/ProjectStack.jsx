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
  CheckCircle2 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { isRequestOverdue } from "./lifecycleHelpers";
import CompactRequestRow from "./CompactRequestRow";

/**
 * Determine dominant accent + stalled state for a project group.
 */
function getProjectHealth(requests, bucket) {
  let overdue = 0, waiting = 0, replied = 0, approved = 0;
  let latestTs = null;
  
  for (const r of requests) {
    if (isRequestOverdue(r, bucket)) overdue++;
    if (r.approvedAt) approved++;
    else if (r.latestActivityActor === 'client') replied++;
    else waiting++;
    
    const ts = r.latestActivityAt || r.updated_date;
    if (ts && (!latestTs || new Date(ts) > new Date(latestTs))) latestTs = ts;
  }

  // Stalled: no activity for 3+ days
  const daysSinceActivity = latestTs 
    ? (Date.now() - new Date(latestTs).getTime()) / (1000 * 60 * 60 * 24) 
    : 999;
  const isStalled = daysSinceActivity >= 3 && !approved;

  // Accent color priority: overdue > stalled > replied > waiting > approved
  let accent = {
    border: 'border-l-amber-500/60',
    headerBg: 'bg-amber-950/10',
    text: 'text-amber-400',
  };
  if (overdue > 0) accent = {
    border: 'border-l-red-500',
    headerBg: 'bg-red-950/15',
    text: 'text-red-400',
  };
  else if (isStalled) accent = {
    border: 'border-l-orange-500',
    headerBg: 'bg-orange-950/10',
    text: 'text-orange-400',
  };
  else if (replied > 0) accent = {
    border: 'border-l-blue-500/60',
    headerBg: 'bg-blue-950/10',
    text: 'text-blue-400',
  };
  else if (approved > 0 && overdue === 0 && waiting === 0) accent = {
    border: 'border-l-emerald-500/60',
    headerBg: 'bg-emerald-950/10',
    text: 'text-emerald-400',
  };

  return { overdue, waiting, replied, approved, latestTs, isStalled, daysSinceActivity, accent };
}

/**
 * ProjectStack — collapsible project group for priority lanes.
 * Collapsed: project name + counts + time signal.
 * Expanded: compact request rows.
 */
export default function ProjectStack({
  projectName,
  projectId,
  requests,
  bucket,
  getProjectClientSlug,
  onUpdateDueDate,
  defaultCollapsed = true,
}) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  
  const health = useMemo(() => getProjectHealth(requests, bucket), [requests, bucket]);
  const total = requests.length;
  
  if (total === 0) return null;

  // Auto-expand single-request projects
  const isSingle = total === 1;

  return (
    <div className={cn(
      "rounded-md border border-gray-700/40 overflow-hidden transition-all",
      "border-l-[3px]",
      health.accent.border,
    )}>
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => !isSingle && setExpanded(prev => !prev)}
        className={cn(
          "w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
          expanded || isSingle ? health.accent.headerBg : 'hover:bg-gray-900/40',
          isSingle && 'cursor-default'
        )}
      >
        {!isSingle && (
          <div className="shrink-0 text-gray-500">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>
        )}
        
        <FolderKanban className={cn("w-3.5 h-3.5 shrink-0", health.accent.text)} />
        
        <span className="text-white font-medium text-sm truncate flex-1">
          {projectName || 'Unknown Project'}
        </span>

        {/* Inline status counts */}
        <div className="flex items-center gap-1.5 shrink-0">
          {health.overdue > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-semibold">
              <AlertCircle className="w-3 h-3" />{health.overdue}
            </span>
          )}
          {health.replied > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-blue-400">
              <MessageSquareText className="w-3 h-3" />{health.replied}
            </span>
          )}
          {health.waiting > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-400/70">
              <Clock className="w-3 h-3" />{health.waiting}
            </span>
          )}
          {health.approved > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400/70">
              <CheckCircle2 className="w-3 h-3" />{health.approved}
            </span>
          )}
        </div>

        {/* Stalled badge */}
        {health.isStalled && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/30 shrink-0">
            {Math.floor(health.daysSinceActivity)}d stalled
          </span>
        )}

        {/* Last activity time */}
        {health.latestTs && !health.isStalled && (
          <span className="text-[10px] text-gray-500 shrink-0">
            {formatDistanceToNow(new Date(health.latestTs), { addSuffix: false })}
          </span>
        )}

        {/* Count badge */}
        {total > 1 && (
          <span className={cn(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0",
            "bg-gray-700/50 text-gray-400"
          )}>
            {total}
          </span>
        )}
      </button>

      {/* Expanded: compact request rows */}
      {(expanded || isSingle) && (
        <div className="px-1.5 pb-1.5 space-y-0.5 bg-black/10">
          {requests.map(request => (
            <CompactRequestRow
              key={request.id}
              request={request}
              bucket={bucket}
              getProjectClientSlug={getProjectClientSlug}
              onUpdateDueDate={onUpdateDueDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}