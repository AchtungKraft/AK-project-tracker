import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ProjectStack from "./ProjectStack";
import CompactRequestRow from "./CompactRequestRow";
import { isRequestOverdue, countOverdue } from "./lifecycleHelpers";

/**
 * Group requests by project, sorted by urgency.
 */
function groupByProject(requests) {
  const map = new Map();
  for (const r of requests) {
    const pid = r._projectId || r.project_id || 'unknown';
    if (!map.has(pid)) {
      map.set(pid, { projectId: pid, projectName: r._projectName || 'Unknown', requests: [] });
    }
    map.get(pid).requests.push(r);
  }
  
  return Array.from(map.values()).sort((a, b) => {
    // Overdue projects first
    const aOd = a.requests.some(r => r.isOverdue);
    const bOd = b.requests.some(r => r.isOverdue);
    if (aOd && !bOd) return -1;
    if (!aOd && bOd) return 1;
    // Stalled projects next (no activity 3+ days)
    const aStale = Math.max(...a.requests.map(r => r.latestActivityAt ? Date.now() - new Date(r.latestActivityAt).getTime() : Infinity));
    const bStale = Math.max(...b.requests.map(r => r.latestActivityAt ? Date.now() - new Date(r.latestActivityAt).getTime() : Infinity));
    if (aStale > 3 * 86400000 && bStale <= 3 * 86400000) return -1;
    if (bStale > 3 * 86400000 && aStale <= 3 * 86400000) return 1;
    // Then by count
    return b.requests.length - a.requests.length;
  });
}

/**
 * PriorityLane — a single operational lane (Immediate / Active / Background).
 * Contains project stacks with collapsible request rows.
 */
export default function PriorityLane({
  label,
  sublabel,
  icon: Icon,
  color,           // e.g. 'red', 'blue', 'gray'
  requests,
  bucket,
  getProjectClientSlug,
  onUpdateDueDate,
  defaultExpanded = true,
  showProjectStacks = true,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const groups = useMemo(() => groupByProject(requests), [requests]);
  const overdueCount = useMemo(() => countOverdue(requests, bucket || 'awaiting_client'), [requests, bucket]);

  if (requests.length === 0) return null;

  const colorMap = {
    red: {
      border: 'border-red-500/40',
      headerBg: 'bg-red-950/20',
      headerBorder: 'border-red-500/30',
      text: 'text-red-400',
      badge: 'bg-red-500/20 text-red-400 border-red-500/40',
      glow: 'shadow-red-900/10',
    },
    blue: {
      border: 'border-blue-500/30',
      headerBg: 'bg-blue-950/15',
      headerBorder: 'border-blue-500/20',
      text: 'text-blue-400',
      badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
      glow: '',
    },
    amber: {
      border: 'border-amber-500/30',
      headerBg: 'bg-amber-950/15',
      headerBorder: 'border-amber-500/20',
      text: 'text-amber-400',
      badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      glow: '',
    },
    gray: {
      border: 'border-gray-700/40',
      headerBg: 'bg-gray-900/30',
      headerBorder: 'border-gray-700/30',
      text: 'text-gray-400',
      badge: 'bg-gray-700/50 text-gray-400 border-gray-600/40',
      glow: '',
    },
    emerald: {
      border: 'border-emerald-500/30',
      headerBg: 'bg-emerald-950/15',
      headerBorder: 'border-emerald-500/20',
      text: 'text-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      glow: '',
    },
    slate: {
      border: 'border-slate-500/30',
      headerBg: 'bg-slate-900/20',
      headerBorder: 'border-slate-500/20',
      text: 'text-slate-400',
      badge: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
      glow: '',
    },
  };

  const c = colorMap[color] || colorMap.gray;

  return (
    <div className={cn("rounded-lg border overflow-hidden", c.border, c.glow && `shadow-lg ${c.glow}`)}>
      {/* Lane header */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 transition-colors",
          c.headerBg, "border-b", c.headerBorder
        )}
      >
        <div className="text-gray-500 shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
        <Icon className={cn("w-4 h-4 shrink-0", c.text)} />
        <span className={cn("font-semibold text-sm", c.text)}>{label}</span>
        {sublabel && (
          <span className="text-[10px] text-gray-500 hidden lg:inline">{sublabel}</span>
        )}
        <div className="flex-1" />
        {overdueCount > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-medium">
            <AlertCircle className="w-3 h-3" />{overdueCount}
          </span>
        )}
        <Badge className={cn("text-[10px] px-1.5 py-0", c.badge)}>
          {requests.length}
        </Badge>
      </button>

      {/* Lane content */}
      {expanded && (
        <div className="p-2 space-y-1.5 bg-black/10">
          {showProjectStacks ? (
            groups.map(group => (
              <ProjectStack
                key={group.projectId}
                projectName={group.projectName}
                projectId={group.projectId}
                requests={group.requests}
                bucket={bucket}
                getProjectClientSlug={getProjectClientSlug}
                onUpdateDueDate={onUpdateDueDate}
                defaultCollapsed={group.requests.length > 1}
              />
            ))
          ) : (
            requests.map(request => (
              <CompactRequestRow
                key={request.id}
                request={request}
                bucket={bucket}
                getProjectClientSlug={getProjectClientSlug}
                onUpdateDueDate={onUpdateDueDate}
                showProject
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}