import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronDown, 
  ChevronRight, 
  Clock, 
  MessageSquareText, 
  CheckCircle2,
  AlertCircle,
  FolderKanban
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { isRequestOverdue } from "./lifecycleHelpers";

/**
 * Determine dominant accent color for a project group within a bucket.
 * Overdue → red, has approval → emerald, replied → blue, waiting → amber
 */
function getGroupAccent(requests, bucket) {
  const hasOverdue = requests.some(r => isRequestOverdue(r, bucket));
  const hasApproval = requests.some(r => r.approvedAt);
  
  if (hasOverdue) return {
    border: 'border-l-red-500',
    bg: 'bg-red-950/15',
    text: 'text-red-400',
    badge: 'bg-red-500/20 text-red-400 border-red-500/40',
  };
  if (hasApproval) return {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-950/15',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  };
  if (bucket === 'client_replied') return {
    border: 'border-l-blue-500',
    bg: 'bg-blue-950/15',
    text: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  };
  return {
    border: 'border-l-amber-500',
    bg: 'bg-amber-950/15',
    text: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  };
}

/**
 * Get the most recent activity timestamp across all requests in a group
 */
function getLatestActivity(requests) {
  let latest = null;
  for (const r of requests) {
    const ts = r.latestActivityAt || r.updated_date || r.created_date;
    if (ts && (!latest || new Date(ts) > new Date(latest))) {
      latest = ts;
    }
  }
  return latest;
}

/**
 * Count status breakdown in a request group
 */
function getStatusCounts(requests, bucket) {
  let overdue = 0;
  let waiting = 0;
  let replied = 0;
  let approved = 0;
  
  for (const r of requests) {
    if (isRequestOverdue(r, bucket)) overdue++;
    if (r.approvedAt) approved++;
    else if (r.latestActivityActor === 'client') replied++;
    else waiting++;
  }
  return { overdue, waiting, replied, approved };
}

/**
 * Collapsed project group header — shown when auto-collapsed.
 * Displays project name, count, status breakdown, latest activity.
 */
export default function BucketProjectGroup({
  projectName,
  projectId,
  requests,
  bucket,
  autoCollapse,
  children,
  maxVisible = 2,
}) {
  const [expanded, setExpanded] = useState(!autoCollapse);
  const [showAll, setShowAll] = useState(false);
  
  const accent = useMemo(() => getGroupAccent(requests, bucket), [requests, bucket]);
  const latestActivity = useMemo(() => getLatestActivity(requests), [requests]);
  const statusCounts = useMemo(() => getStatusCounts(requests, bucket), [requests, bucket]);
  
  const totalCount = requests.length;
  const visibleChildren = React.Children.toArray(children);
  const visibleCount = showAll ? visibleChildren.length : Math.min(maxVisible, visibleChildren.length);
  const hiddenCount = visibleChildren.length - visibleCount;
  
  return (
    <div className={cn(
      "rounded-lg border border-gray-700/50 overflow-hidden transition-all",
      "border-l-[3px]",
      accent.border,
      expanded ? accent.bg : 'bg-gray-900/20 hover:bg-gray-900/40'
    )}>
      {/* Clickable project header */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
      >
        <div className="shrink-0 text-gray-500">
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
        
        <div className="p-1.5 rounded bg-gray-800/60 shrink-0">
          <FolderKanban className={cn("w-3.5 h-3.5", accent.text)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm truncate">
              {projectName || 'Unknown Project'}
            </span>
            <Badge className={cn("text-[10px] px-1.5 py-0", accent.badge)}>
              {totalCount}
            </Badge>
          </div>
          
          {/* Collapsed summary line */}
          {!expanded && (
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 flex-wrap">
              {statusCounts.overdue > 0 && (
                <span className="flex items-center gap-0.5 text-red-400">
                  <AlertCircle className="w-3 h-3" />
                  {statusCounts.overdue} overdue
                </span>
              )}
              {statusCounts.waiting > 0 && (
                <span className="flex items-center gap-0.5 text-amber-400/80">
                  <Clock className="w-3 h-3" />
                  {statusCounts.waiting} waiting
                </span>
              )}
              {statusCounts.replied > 0 && (
                <span className="flex items-center gap-0.5 text-blue-400/80">
                  <MessageSquareText className="w-3 h-3" />
                  {statusCounts.replied} replied
                </span>
              )}
              {statusCounts.approved > 0 && (
                <span className="flex items-center gap-0.5 text-emerald-400/80">
                  <CheckCircle2 className="w-3 h-3" />
                  {statusCounts.approved} approved
                </span>
              )}
              {latestActivity && (
                <span className="text-gray-500 ml-auto">
                  {formatDistanceToNow(new Date(latestActivity), { addSuffix: true })}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
      
      {/* Expanded: show request cards */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {visibleChildren.slice(0, visibleCount)}
          
          {hiddenCount > 0 && !showAll && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowAll(true);
              }}
              className="w-full text-center py-2 text-xs text-gray-400 hover:text-white bg-gray-800/40 rounded-lg border border-gray-700/40 hover:border-gray-600 transition-colors"
            >
              + {hiddenCount} more request{hiddenCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}