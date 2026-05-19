import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  ChevronDown, 
  ChevronRight, 
  AlertCircle, 
  Clock, 
  MessageSquareText, 
  CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import CompactRequestRow from "./CompactRequestRow";

/**
 * UnifiedProjectContainer — one project = one lean row group.
 * 
 * Header is a single compressed operational line:
 *   PROJECT NAME  •  counts  •  movement signal
 * 
 * Expanded body is a borderless timeline of request events.
 */
export default function UnifiedProjectContainer({
  project,
  health,
  allRequests,
  getProjectClientSlug,
  onUpdateDueDate,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  const total = allRequests.length;

  const sortedRequests = useMemo(() => {
    const order = { overdue: 0, client_replied: 1, awaiting_client: 2, draft: 3, recently_approved: 4, approved: 5 };
    return [...allRequests].sort((a, b) => {
      const aKey = a.isOverdue ? 'overdue' : a._bucket;
      const bKey = b.isOverdue ? 'overdue' : b._bucket;
      return (order[aKey] ?? 6) - (order[bKey] ?? 6);
    });
  }, [allRequests]);

  if (total === 0) return null;

  const isSingle = total === 1;
  const showExpanded = expanded || isSingle;

  const projectName = project?.name || 'Unknown Project';

  // Movement signal — the most important operational data
  const movementText = health.isStalled
    ? `stalled ${Math.floor(health.daysSinceActivity)}d`
    : health.latestTs
      ? formatDistanceToNow(new Date(health.latestTs), { addSuffix: true })
      : null;

  // Inline summary: "3 items · 1 overdue · replied 2h ago"
  const summaryParts = [];
  if (total > 1) summaryParts.push(`${total} items`);
  if (health.overdue > 0) summaryParts.push(`${health.overdue} overdue`);
  if (health.replied > 0) summaryParts.push(`${health.replied} replied`);
  if (health.waiting > 0 && health.overdue === 0 && health.replied === 0) summaryParts.push(`${health.waiting} waiting`);
  if (health.recentApproval > 0) summaryParts.push(`${health.recentApproval} approved`);

  return (
    <div className="group/project">
      {/* === PROJECT HEADER — single compressed line === */}
      <button
        type="button"
        onClick={() => !isSingle && setExpanded(prev => !prev)}
        className={cn(
          "w-full flex items-center gap-2 px-2.5 py-[6px] text-left rounded-sm transition-colors",
          "hover:bg-white/[0.03]",
          isSingle && 'cursor-default'
        )}
      >
        {/* Expand toggle */}
        {!isSingle && (
          <div className="shrink-0 text-gray-600">
            {showExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </div>
        )}
        {isSingle && <div className="w-3 shrink-0" />}
        
        {/* Accent dot — replaces heavy left-border */}
        <div className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          health.overdue > 0 ? "bg-red-400" :
          health.replied > 0 ? "bg-blue-400" :
          health.isStalled ? "bg-orange-400" :
          health.recentApproval > 0 && health.active === 0 ? "bg-emerald-400" :
          "bg-gray-600"
        )} />

        {/* Project name — PRIMARY */}
        <span className="text-[13px] text-gray-200 font-medium truncate">
          {projectName}
        </span>

        {/* Inline health counters — icon micro-badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          {health.overdue > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-semibold">
              <AlertCircle className="w-2.5 h-2.5" />{health.overdue}
            </span>
          )}
          {health.replied > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-blue-400 font-medium">
              <MessageSquareText className="w-2.5 h-2.5" />{health.replied}
            </span>
          )}
          {health.recentApproval > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
              <CheckCircle2 className="w-2.5 h-2.5" />{health.recentApproval}
            </span>
          )}
        </div>

        {/* Summary text — SECONDARY */}
        {summaryParts.length > 0 && (
          <span className="text-[10px] text-gray-600 truncate hidden lg:inline">
            {summaryParts.join(' · ')}
          </span>
        )}

        <div className="flex-1" />

        {/* Movement signal — EMPHASIZED */}
        {movementText && (
          <span className={cn(
            "text-[10px] shrink-0 tabular-nums",
            health.isStalled ? "text-orange-400/80 font-medium" : "text-gray-500"
          )}>
            {movementText}
          </span>
        )}
      </button>

      {/* === WORKFLOW TIMELINE — borderless event stream === */}
      {showExpanded && (
        <div className={cn(
          "ml-4 border-l transition-colors",
          health.overdue > 0 ? "border-red-500/15" :
          health.replied > 0 ? "border-blue-500/10" :
          health.recentApproval > 0 && health.active === 0 ? "border-emerald-500/10" :
          "border-gray-800/40"
        )}>
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