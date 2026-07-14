import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown, ChevronRight, Plus, AlertTriangle, Flag, Clock,
  CalendarDays, ArrowRight,
} from "lucide-react";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import { getPhaseColors } from "@/components/workload/phaseColorConfig";
import { PHASE_STATE_CONFIG } from "@/components/workflow/useProjectWorkflow";
import { cn } from "@/lib/utils";
import ProductionTaskRow from "./ProductionTaskRow";

function fmtHours(h) {
  if (!h || h === 0) return null;
  return `${Math.round(h * 10) / 10}h`;
}

/** Classify tasks into time buckets: thisWeek, upcoming, unscheduled */
function classifyByTime(tasks, weekStart, weekEnd) {
  const thisWeek = [];
  const overdue = [];
  const upcoming = [];
  const unscheduled = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  tasks.forEach(t => {
    if (!t.due_date) {
      unscheduled.push(t);
      return;
    }
    const due = new Date(t.due_date + "T00:00:00");
    if (due < today && due < weekStart) {
      overdue.push(t);
    } else if (due <= weekEnd) {
      thisWeek.push(t);
    } else {
      upcoming.push(t);
    }
  });

  // Sort by due date within each bucket
  const byDue = (a, b) => {
    const da = a.due_date || "9999";
    const db = b.due_date || "9999";
    return da.localeCompare(db);
  };
  overdue.sort(byDue);
  thisWeek.sort(byDue);
  upcoming.sort(byDue);

  return { overdue, thisWeek, upcoming, unscheduled };
}

function TimeBucket({ label, icon: Icon, tasks, color, shared, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);
  const INITIAL = 8;

  if (tasks.length === 0) return null;

  const visible = showAll ? tasks : tasks.slice(0, INITIAL);
  const remaining = tasks.length - INITIAL;

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-left hover:bg-gray-800/20 transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-gray-600 shrink-0" />
          : <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />
        }
        <Icon className={cn("w-3 h-3 shrink-0", color)} />
        <span className={cn("text-[11px] font-semibold uppercase tracking-wide", color)}>
          {label}
        </span>
        <span className="text-[10px] text-gray-600 tabular-nums">{tasks.length}</span>
      </button>
      {expanded && (
        <div className="ml-3">
          {visible.map(task => (
            <ProductionTaskRow key={task.id} task={task} shared={shared} />
          ))}
          {!showAll && remaining > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-1.5 text-center text-[10px] text-gray-500 hover:text-white hover:bg-gray-800/30 transition-colors flex items-center justify-center gap-1"
            >
              <ChevronDown className="w-3 h-3" />
              Show {remaining} More
            </button>
          )}
          {showAll && remaining > 0 && (
            <button
              onClick={() => setShowAll(false)}
              className="w-full py-1 text-center text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Collapse
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductionStatusCard({
  project,
  tasks,
  phases,
  milestones,
  weekStart,
  weekEnd,
  shared,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const wh = project?.workflow_health || {};
  const currentPhase = project?.current_phase_name;
  const nextPhase = project?.next_phase_name;
  const currentBlocker = project?.current_blocker;
  const nextMilestone = project?.next_milestone_name;
  const hoursRemaining = fmtHours(wh.hours_remaining);

  // Progress from workflow_health
  const completedTasks = wh.tasks_completed || 0;
  const totalTasks = completedTasks +
    (wh.tasks_ready || 0) + (wh.tasks_in_progress || 0) +
    (wh.tasks_blocked || 0) + (wh.tasks_waiting || 0);
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Time-based classification
  const { overdue, thisWeek, upcoming, unscheduled } = useMemo(
    () => classifyByTime(tasks, weekStart, weekEnd),
    [tasks, weekStart, weekEnd]
  );

  // Current phase styling
  const phaseColors = currentPhase ? getPhaseColors(currentPhase) : null;

  // Phase status for current phase
  const currentPhaseObj = phases?.find(p => p.id === project?.current_phase_id);
  const phaseState = currentPhaseObj?.phase_status;
  const phaseStateCfg = phaseState ? PHASE_STATE_CONFIG[phaseState] : null;

  if (!project) return null;

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden transition-colors",
      currentBlocker
        ? "border-red-800/40 bg-red-950/5"
        : "border-gray-700/40 bg-black/30"
    )}>
      {/* ── Header: Project Status Report ── */}
      <div className="cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {/* Row 1: Project name + current phase */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
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
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-2 py-0 uppercase tracking-wide font-bold shrink-0",
                phaseColors?.text || "text-gray-400",
              )}
              style={phaseColors?.dot ? { borderColor: phaseColors.dot, color: phaseColors.dot } : {}}
            >
              {currentPhase}
            </Badge>
          )}

          {nextPhase && (
            <span className="text-[10px] text-gray-600 hidden lg:flex items-center gap-0.5 shrink-0">
              <ArrowRight className="w-2.5 h-2.5" />
              {nextPhase}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => shared.onAddTask?.(project.id)}
              className="text-gray-600 hover:text-green-400 p-1 rounded hover:bg-green-900/20 transition-colors"
              title="Add task"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2: Progress + metrics strip */}
        <div className="px-4 pb-1.5 ml-6 flex items-center gap-3 flex-wrap">
          {totalTasks > 0 && (
            <div className="flex items-center gap-2 min-w-[120px]">
              <Progress value={progressPct} className="h-2 flex-1 bg-gray-800 max-w-[100px]" />
              <span className="text-[11px] text-gray-400 tabular-nums font-medium">
                {progressPct}%
              </span>
              <span className="text-[10px] text-gray-600 tabular-nums">
                {completedTasks}/{totalTasks}
              </span>
            </div>
          )}

          {hoursRemaining && (
            <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {hoursRemaining} remaining
            </span>
          )}

          {nextMilestone && (
            <span className="text-[10px] text-amber-500/80 flex items-center gap-0.5 hidden md:flex">
              <Flag className="w-2.5 h-2.5" />
              {nextMilestone}
            </span>
          )}

          {/* Quick task count badges */}
          {overdue.length > 0 && (
            <Badge className="text-[9px] px-1.5 py-0 bg-red-900/30 text-red-400 border-0">
              {overdue.length} overdue
            </Badge>
          )}
          {thisWeek.length > 0 && (
            <Badge className="text-[9px] px-1.5 py-0 bg-blue-900/30 text-blue-400 border-0">
              {thisWeek.length} this week
            </Badge>
          )}
        </div>

        {/* Row 3: Blocker — prominent when present */}
        {currentBlocker && (
          <div className="px-4 pb-2 ml-6">
            <div className="flex items-center gap-1.5 bg-red-900/15 border border-red-800/30 rounded px-2 py-1">
              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
              <span className="text-[11px] text-red-400 font-medium truncate">{currentBlocker}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Expanded: Time-based task breakdown ── */}
      {expanded && (
        <div className="border-t border-gray-800/30 pt-1 pb-2">
          {/* Current phase header */}
          {currentPhase && (
            <div className="px-4 py-1 flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: phaseColors?.dot || "#6B7280" }}
              />
              <span className={cn("text-[10px] font-bold uppercase tracking-wide", phaseColors?.text || "text-gray-400")}>
                {currentPhase}
              </span>
              {phaseStateCfg && (
                <Badge className={cn("text-[9px] px-1 py-0 h-4 border-0", phaseStateCfg.bgClass, phaseStateCfg.textClass)}>
                  {phaseStateCfg.label}
                </Badge>
              )}
            </div>
          )}

          <TimeBucket
            label="Overdue"
            icon={AlertTriangle}
            tasks={overdue}
            color="text-red-400"
            shared={shared}
            defaultExpanded={true}
          />
          <TimeBucket
            label="This Week"
            icon={CalendarDays}
            tasks={thisWeek}
            color="text-blue-400"
            shared={shared}
            defaultExpanded={true}
          />
          <TimeBucket
            label="Upcoming"
            icon={CalendarDays}
            tasks={upcoming}
            color="text-gray-400"
            shared={shared}
            defaultExpanded={false}
          />
          <TimeBucket
            label="Unscheduled"
            icon={Clock}
            tasks={unscheduled}
            color="text-gray-600"
            shared={shared}
            defaultExpanded={false}
          />

          {tasks.length === 0 && (
            <div className="px-6 py-3 text-center text-[11px] text-gray-600">
              No active tasks
            </div>
          )}
        </div>
      )}
    </div>
  );
}