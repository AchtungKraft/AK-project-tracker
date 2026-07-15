import React, { useState, useMemo } from "react";
import { ChevronDown, Clock, Flame, AlertTriangle, User, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  splitPriorityEstimatedHours,
  groupEstimatedHoursByAssignee,
  groupEstimatedHoursByPhase,
  formatDuration,
} from "@/lib/workloadRollups";
import { useIsMobile } from "@/components/mobile/useIsMobile";

export default function WeeklyHoursSummary({
  tasks,
  teamMemberMap,
  phaseLookup,
  weekLabel,
  onFilterAssignee,
  onFilterPhase,
}) {
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();

  const summary = useMemo(() => splitPriorityEstimatedHours(tasks), [tasks]);
  const assigneeGroups = useMemo(
    () => (expanded ? groupEstimatedHoursByAssignee(tasks, teamMemberMap) : []),
    [tasks, teamMemberMap, expanded]
  );
  const phaseGroups = useMemo(
    () => (expanded ? groupEstimatedHoursByPhase(tasks, phaseLookup) : []),
    [tasks, phaseLookup, expanded]
  );

  const totalDisplay = formatDuration(summary.totalHours) || "0h";
  const priorityDisplay = formatDuration(summary.priorityHours) || "0h";

  if (isMobile) {
    return (
      <div className="bg-black/40 border border-gray-800 rounded-lg">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left"
        >
          <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs text-gray-300">
            <span className="text-white font-semibold">{totalDisplay}</span> Total
            {" · "}
            <span className="text-red-400 font-semibold">{priorityDisplay}</span> Priority
            {summary.missingTotal > 0 && (
              <> · <span className="text-yellow-500">{summary.missingTotal} Missing</span></>
            )}
          </span>
          <ChevronDown className={cn("w-3 h-3 text-gray-500 ml-auto transition-transform", expanded && "rotate-180")} />
        </button>
        {expanded && (
          <div className="px-3 pb-3 space-y-3 border-t border-gray-800">
            <AssigneeSection groups={assigneeGroups} onFilter={onFilterAssignee} compact />
            <PhaseSection groups={phaseGroups} onFilter={onFilterPhase} compact />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-black/40 border border-gray-800 rounded-lg">
      {/* Compact top line */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-800/30 transition-colors"
      >
        <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
        {weekLabel && (
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold shrink-0">
            {weekLabel}
          </span>
        )}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white font-bold tabular-nums">{totalDisplay} <span className="text-gray-400 font-normal text-xs">Total</span></span>
          <span className="text-red-400 font-bold tabular-nums">{priorityDisplay} <span className="text-gray-400 font-normal text-xs">Priority</span></span>
          {summary.missingTotal > 0 && (
            <span className="text-yellow-500 font-bold tabular-nums flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {summary.missingTotal} <span className="text-gray-400 font-normal text-xs">Missing Est.</span>
            </span>
          )}
        </div>
        <ChevronDown className={cn("w-4 h-4 text-gray-500 ml-auto transition-transform", expanded && "rotate-180")} />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800 grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3">
          {/* Priority breakdown */}
          <div className="space-y-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold flex items-center gap-1">
              <Flame className="w-3 h-3 text-red-400" /> Hours Breakdown
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label="Total" value={totalDisplay} color="text-white" />
              <MetricCard label="Priority" value={priorityDisplay} color="text-red-400" />
              <MetricCard label="Non-Priority" value={formatDuration(summary.nonPriorityHours) || "0h"} color="text-gray-300" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label="Missing Est. (Priority)" value={summary.missingPriority} color="text-yellow-500" small />
              <MetricCard label="Missing Est. (Other)" value={summary.missingOther} color="text-yellow-600" small />
              <MetricCard label="Missing Est. (Total)" value={summary.missingTotal} color="text-yellow-500" small />
            </div>
          </div>

          {/* Assignee rollup */}
          <AssigneeSection groups={assigneeGroups} onFilter={onFilterAssignee} />

          {/* Phase rollup */}
          <PhaseSection groups={phaseGroups} onFilter={onFilterPhase} />
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color, small }) {
  return (
    <div className="bg-gray-900/50 rounded px-2 py-1.5">
      <div className={cn("font-bold tabular-nums", small ? "text-sm" : "text-lg", color)}>
        {value}
      </div>
      <div className="text-[9px] text-gray-500">{label}</div>
    </div>
  );
}

function AssigneeSection({ groups, onFilter, compact }) {
  if (!groups || groups.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold flex items-center gap-1 pt-1">
        <User className="w-3 h-3 text-cyan-400" /> By Assignee
      </div>
      <div className={cn("space-y-0.5", compact && "max-h-40 overflow-y-auto")}>
        {groups.map(g => (
          <button
            key={g.memberId}
            onClick={() => onFilter?.(g.memberId === "__unassigned__" ? null : g.memberId)}
            className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800/50 transition-colors text-left group"
          >
            <span className="text-xs text-gray-300 flex-1 truncate group-hover:text-white">{g.memberName}</span>
            <span className="text-xs text-white font-semibold tabular-nums">{formatDuration(g.totalHours) || "—"}</span>
            {g.priorityHours > 0 && (
              <span className="text-[10px] text-red-400/70 tabular-nums">{formatDuration(g.priorityHours)}</span>
            )}
            {g.missingCount > 0 && (
              <span className="text-[9px] text-yellow-600 tabular-nums">{g.missingCount} no est.</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function PhaseSection({ groups, onFilter, compact }) {
  if (!groups || groups.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold flex items-center gap-1 pt-1">
        <Layers className="w-3 h-3 text-purple-400" /> By Phase
      </div>
      <div className={cn("space-y-0.5", compact && "max-h-40 overflow-y-auto")}>
        {groups.map(g => (
          <button
            key={g.phaseName}
            onClick={() => onFilter?.(g.phaseName)}
            className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800/50 transition-colors text-left group"
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.phaseColor }} />
            <span className="text-xs text-gray-300 flex-1 truncate group-hover:text-white">{g.phaseName}</span>
            <span className="text-[10px] text-gray-500 tabular-nums">{g.taskCount} tasks</span>
            <span className="text-xs text-white font-semibold tabular-nums">{formatDuration(g.totalHours) || "—"}</span>
            {g.missingCount > 0 && (
              <span className="text-[9px] text-yellow-600 tabular-nums">{g.missingCount} no est.</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}