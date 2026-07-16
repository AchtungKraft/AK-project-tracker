import React, { useState, useMemo } from "react";
import { ChevronDown, Clock, Flame, AlertTriangle, User, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildWeeklyHoursRollup,
  formatDuration,
} from "@/lib/workloadRollups";
import { useIsMobile } from "@/components/mobile/useIsMobile";

/**
 * WeeklyHoursSummary — single canonical weekly summary.
 *
 * Props:
 *   thisWeekTasks  – tasks due in the selected week (required)
 *   overdueTasks   – tasks overdue (optional, shown separately)
 *   teamMemberMap  – Map<id, teamMember>
 *   phaseLookup    – Map<id, bucket>
 *   weekLabel      – e.g. "Jul 13 – Jul 19"
 *   onFilterAssignee / onFilterPhase – optional click handlers
 */
export default function WeeklyHoursSummary({
  thisWeekTasks = [],
  overdueTasks = [],
  teamMemberMap,
  phaseLookup,
  weekLabel,
  onFilterAssignee,
  onFilterPhase,
}) {
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();

  // Canonical rollup — selected week only
  const weekRollup = useMemo(
    () => buildWeeklyHoursRollup(thisWeekTasks, teamMemberMap, expanded ? phaseLookup : null),
    [thisWeekTasks, teamMemberMap, phaseLookup, expanded]
  );

  // Overdue rollup — separate
  const overdueRollup = useMemo(
    () => buildWeeklyHoursRollup(overdueTasks, null, null),
    [overdueTasks]
  );

  // Expanded detail: assignee & phase come from the week rollup
  const assigneeGroups = useMemo(
    () => (expanded ? weekRollup.byAssignee : []),
    [expanded, weekRollup.byAssignee]
  );
  const phaseGroups = useMemo(
    () => (expanded ? weekRollup.byPhase : []),
    [expanded, weekRollup.byPhase]
  );

  const weekDisplay = formatDuration(weekRollup.totalEstimatedHours) || "0h";
  const priorityDisplay = formatDuration(weekRollup.priorityEstimatedHours) || "0h";
  const overdueDisplay = formatDuration(overdueRollup.totalEstimatedHours);
  const hasOverdue = overdueRollup.taskCount > 0;

  // Label: "This Week" when week-scoped, "Total" when showing all open tasks
  const isWeekScoped = !weekLabel || weekLabel !== "All Open";
  const totalLabel = isWeekScoped ? "This Week" : "Total";

  if (isMobile) {
    return (
      <div className="bg-black/40 border border-gray-800 rounded-lg">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left"
        >
          <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs text-gray-300">
            <span className="text-white font-semibold">{weekDisplay}</span> {totalLabel}
            {hasOverdue && (
              <> · <span className="text-red-400 font-semibold">{overdueDisplay}</span> Overdue</>
            )}
            {weekRollup.missingEstimateCount > 0 && (
              <> · <span className="text-yellow-500">{weekRollup.missingEstimateCount} Missing</span></>
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
          <span className="text-white font-bold tabular-nums">
            {weekDisplay} <span className="text-gray-400 font-normal text-xs">{totalLabel}</span>
          </span>
          <span className="text-red-400 font-bold tabular-nums">
            {priorityDisplay} <span className="text-gray-400 font-normal text-xs">Priority</span>
          </span>
          {hasOverdue && (
            <span className="text-orange-400 font-bold tabular-nums flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {overdueDisplay} <span className="text-gray-400 font-normal text-xs">Overdue</span>
            </span>
          )}
          {weekRollup.missingEstimateCount > 0 && (
            <span className="text-yellow-500 font-bold tabular-nums flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {weekRollup.missingEstimateCount} <span className="text-gray-400 font-normal text-xs">Missing Est.</span>
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
              <MetricCard label={totalLabel} value={weekDisplay} color="text-white" />
              <MetricCard label="Priority" value={priorityDisplay} color="text-red-400" />
              <MetricCard label="Non-Priority" value={formatDuration(weekRollup.nonPriorityEstimatedHours) || "0h"} color="text-gray-300" />
            </div>
            {hasOverdue && (
              <div className="grid grid-cols-3 gap-2">
                <MetricCard label="Overdue" value={overdueDisplay} color="text-orange-400" />
                <MetricCard label="Open Commitment" value={formatDuration(weekRollup.totalEstimatedHours + overdueRollup.totalEstimatedHours) || "0h"} color="text-emerald-400" />
                <MetricCard label="Overdue Tasks" value={overdueRollup.taskCount} color="text-orange-400" small />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label="Missing Est. (Priority)" value={weekRollup.priorityMissingEstimateCount} color="text-yellow-500" small />
              <MetricCard label="Missing Est. (Other)" value={weekRollup.missingEstimateCount - weekRollup.priorityMissingEstimateCount} color="text-yellow-600" small />
              <MetricCard label="Missing Est. (Total)" value={weekRollup.missingEstimateCount} color="text-yellow-500" small />
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