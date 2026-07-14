import React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus, AlertTriangle, Flag } from "lucide-react";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import { cn } from "@/lib/utils";

function fmtHours(h) {
  if (!h || h === 0) return null;
  return `${Math.round(h * 10) / 10}h`;
}

function ProgressBar({ completed, total }) {
  if (!total || total === 0) return null;
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-500"
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 tabular-nums font-medium whitespace-nowrap">
        {pct}%
      </span>
    </div>
  );
}

function StatPill({ label, value, color }) {
  if (!value) return null;
  return (
    <div className={cn("flex items-center gap-1 text-[11px] tabular-nums px-1.5 py-0.5 rounded", color)}>
      <span className="font-semibold">{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}

export default function ProjectProductionCard({
  project,
  taskCount,
  expanded,
  onToggle,
  onAddTask,
  sectionTasks = [],
}) {
  if (!project) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/20 cursor-pointer" onClick={onToggle}>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        <span className="text-sm font-bold text-gray-500">Unassigned Tasks</span>
        <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[10px] px-1.5 py-0">{taskCount}</Badge>
      </div>
    );
  }

  const wh = project.workflow_health || {};
  const currentPhase = project.current_phase_name;
  const nextMilestone = project.next_milestone_name;
  const blocker = project.current_blocker;
  const hoursRemaining = fmtHours(wh.hours_remaining);

  // Required task progress
  const completedTasks = wh.tasks_completed || 0;
  const totalRequired = completedTasks +
    (wh.tasks_ready || 0) + (wh.tasks_in_progress || 0) +
    (wh.tasks_blocked || 0) + (wh.tasks_waiting || 0);

  const readyCount = wh.tasks_ready || 0;
  const workingCount = wh.tasks_in_progress || 0;
  const waitingCount = (wh.tasks_blocked || 0) + (wh.tasks_waiting || 0);

  return (
    <div className={cn(
      "border-l-3 transition-colors",
      blocker ? "border-l-red-500/60" : readyCount > 0 ? "border-l-green-500/40" : "border-l-gray-600/30",
      expanded ? "bg-gray-800/25" : "bg-gray-800/10 hover:bg-gray-800/20"
    )}>
      <div className="px-4 py-3 cursor-pointer" onClick={onToggle}>
        {/* Row 1: Project name + phase + chevron */}
        <div className="flex items-center gap-2">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
          }
          <Link
            to={buildProjectDetailUrl(project.id, { source: SOURCES.PRIORITIES })}
            className="text-base font-bold text-gray-100 truncate hover:text-red-400 hover:underline transition-colors"
            onClick={e => e.stopPropagation()}
          >
            {project.name}
          </Link>

          {currentPhase && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-600 text-gray-400 uppercase tracking-wide shrink-0 hidden md:inline-flex">
              {currentPhase}
            </Badge>
          )}

          {/* Add task — far right */}
          <div className="ml-auto flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onAddTask?.(project.id)}
              className="text-gray-600 hover:text-green-400 p-1 rounded hover:bg-green-900/20 transition-colors"
              title="Add task"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2: Progress + Stats — always visible (collapsed state still useful) */}
        <div className="flex items-center gap-3 mt-1.5 ml-6 flex-wrap">
          {totalRequired > 0 && (
            <div className="flex items-center gap-2">
              <ProgressBar completed={completedTasks} total={totalRequired} />
              <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
                {completedTasks}/{totalRequired}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1 flex-wrap">
            <StatPill label="Ready" value={readyCount} color="bg-green-900/20 text-green-400" />
            <StatPill label="Working" value={workingCount} color="bg-amber-900/20 text-amber-400" />
            <StatPill label="Waiting" value={waitingCount} color="bg-red-900/20 text-red-400" />
          </div>

          {hoursRemaining && (
            <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
              {hoursRemaining} remaining
            </span>
          )}

          {nextMilestone && (
            <span className="text-[10px] text-gray-600 hidden lg:inline truncate max-w-[140px]">
              <Flag className="w-2.5 h-2.5 inline mr-0.5 text-amber-500" />
              {nextMilestone}
            </span>
          )}
        </div>

        {/* Row 3: Blocker — only when present */}
        {blocker && (
          <div className="flex items-center gap-1.5 mt-1 ml-6">
            <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
            <span className="text-[11px] text-red-400 truncate">{blocker}</span>
          </div>
        )}
      </div>
    </div>
  );
}