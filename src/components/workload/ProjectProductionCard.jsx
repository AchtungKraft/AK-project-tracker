import React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus, Printer, AlertTriangle } from "lucide-react";
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
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden min-w-[40px] max-w-[80px]">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-400 tabular-nums">{pct}%</span>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  if (!value) return null;
  return (
    <span className={cn("text-[10px] tabular-nums", color)}>
      {label} {value}
    </span>
  );
}

export default function ProjectProductionCard({
  project,
  taskCount,
  expanded,
  onToggle,
  onAddTask,
  variant = "compact", // "compact" | "expanded"
  sectionTasks = [],
}) {
  if (!project) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-800/20 cursor-pointer" onClick={onToggle}>
        {expanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
        <span className="text-sm font-bold text-gray-400">No Project</span>
        <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[9px] px-1 py-0">{taskCount}</Badge>
      </div>
    );
  }

  const wh = project.workflow_health || {};
  const currentPhase = project.current_phase_name;
  const blocker = project.current_blocker;
  const hoursRemaining = fmtHours(wh.hours_remaining);
  const hoursEst = fmtHours(wh.hours_estimated);
  const hoursActual = fmtHours(wh.hours_actual);

  // Task progress from workflow health
  const completedTasks = wh.tasks_completed || 0;
  const totalRequiredTasks = completedTasks +
    (wh.tasks_ready || 0) + (wh.tasks_in_progress || 0) +
    (wh.tasks_blocked || 0) + (wh.tasks_waiting || 0);

  return (
    <div className="bg-gray-800/15 hover:bg-gray-800/25 transition-colors border-l-2 border-l-gray-600/40">
      <div className="flex items-start gap-2 px-3 py-2 cursor-pointer" onClick={onToggle}>
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
        }

        <div className="flex-1 min-w-0">
          {/* Project name row */}
          <div className="flex items-center gap-2">
            <Link
              to={buildProjectDetailUrl(project.id, { source: SOURCES.PRIORITIES })}
              className="text-sm font-bold text-gray-100 truncate hover:text-red-400 hover:underline transition-colors"
              onClick={e => e.stopPropagation()}
            >
              {project.name}
            </Link>
            {currentPhase && (
              <span className="text-[10px] text-gray-500 uppercase tracking-wide shrink-0 hidden md:inline">
                {currentPhase}
              </span>
            )}
            {totalRequiredTasks > 0 && (
              <ProgressBar completed={completedTasks} total={totalRequiredTasks} />
            )}
          </div>

          {/* Stats row — always visible even when collapsed */}
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <MiniStat label="Ready" value={wh.tasks_ready} color="text-green-400" />
            <MiniStat label="Working" value={wh.tasks_in_progress} color="text-amber-400" />
            <MiniStat label="Waiting" value={(wh.tasks_blocked || 0) + (wh.tasks_waiting || 0)} color="text-red-400" />
            {hoursRemaining && (
              <span className="text-[10px] text-gray-500 tabular-nums">{hoursRemaining} remaining</span>
            )}
            <span className="text-[10px] text-gray-600 tabular-nums shrink-0">
              {taskCount} task{taskCount !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Blocker line */}
          {blocker && (
            <div className="flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
              <span className="text-[10px] text-red-400 truncate">{blocker}</span>
            </div>
          )}

          {/* Expanded-only details */}
          {variant === "expanded" && expanded && (
            <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
              {project.next_phase_name && (
                <span>Next: <span className="text-gray-400">{project.next_phase_name}</span></span>
              )}
              {project.next_milestone_name && (
                <span>Milestone: <span className="text-gray-400">{project.next_milestone_name}</span></span>
              )}
              {hoursActual && hoursEst && (
                <span>Hours: {hoursActual} actual / {hoursEst} est</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0 ml-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onAddTask?.(project.id)}
            className="text-green-500 hover:text-green-300 px-1 py-1 rounded hover:bg-green-900/20 transition-colors"
            title="Add task"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.open(`/projectprintview?id=${project.id}`, "_blank")}
            className="text-gray-600 hover:text-white px-1 py-1 rounded hover:bg-gray-700 transition-colors"
            title="Print"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}