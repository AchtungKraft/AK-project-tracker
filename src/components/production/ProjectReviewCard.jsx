import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown, ChevronRight, Plus, AlertTriangle, Flag, Clock,
  CalendarDays, ArrowRight, Package, Truck, Users, ClipboardCheck,
} from "lucide-react";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import { getPhaseColors } from "@/components/workload/phaseColorConfig";
import { PHASE_STATE_CONFIG } from "@/components/workflow/useProjectWorkflow";
import { cn } from "@/lib/utils";
import { deriveOperationalActions } from "./deriveOperationalActions";
import AttentionStatusBadge from "./AttentionStatusBadge";
import ProjectDiscussionPanel from "./ProjectDiscussionPanel";
import ProductionTaskRow from "./ProductionTaskRow";

function fmtHours(h) {
  if (!h || h === 0) return null;
  return `${Math.round(h * 10) / 10}h`;
}

/** Classify tasks into time buckets */
function classifyByTime(tasks, weekStart, weekEnd) {
  const thisWeek = [];
  const overdue = [];
  const upcoming = [];
  const unscheduled = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  tasks.forEach(t => {
    if (!t.due_date) { unscheduled.push(t); return; }
    const due = new Date(t.due_date + "T00:00:00");
    if (due < today && due < weekStart) overdue.push(t);
    else if (due <= weekEnd) thisWeek.push(t);
    else upcoming.push(t);
  });

  const byDue = (a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999");
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
        {expanded ? <ChevronDown className="w-3 h-3 text-gray-600 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />}
        <Icon className={cn("w-3 h-3 shrink-0", color)} />
        <span className={cn("text-[11px] font-semibold uppercase tracking-wide", color)}>{label}</span>
        <span className="text-[10px] text-gray-600 tabular-nums">{tasks.length}</span>
      </button>
      {expanded && (
        <div className="ml-3">
          {visible.map(task => <ProductionTaskRow key={task.id} task={task} shared={shared} />)}
          {!showAll && remaining > 0 && (
            <button onClick={() => setShowAll(true)} className="w-full py-1.5 text-center text-[10px] text-gray-500 hover:text-white hover:bg-gray-800/30 transition-colors flex items-center justify-center gap-1">
              <ChevronDown className="w-3 h-3" />Show {remaining} More
            </button>
          )}
          {showAll && remaining > 0 && (
            <button onClick={() => setShowAll(false)} className="w-full py-1 text-center text-[10px] text-gray-600 hover:text-gray-400 transition-colors">Collapse</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProjectReviewCard({
  project,
  tasks,
  phases,
  milestones,
  weekStart,
  weekEnd,
  shared,
  attention,
  feedbackRequests,
}) {
  const [expanded, setExpanded] = useState(false);

  const wh = project?.workflow_health || {};
  const currentPhase = project?.current_phase_name;
  const nextPhase = project?.next_phase_name;
  const currentBlocker = project?.current_blocker;
  const nextMilestone = project?.next_milestone_name;
  const hoursRemaining = fmtHours(wh.hours_remaining);

  // Progress
  const completedTasks = wh.tasks_completed || 0;
  const totalTasks = completedTasks + (wh.tasks_ready || 0) + (wh.tasks_in_progress || 0) + (wh.tasks_blocked || 0) + (wh.tasks_waiting || 0);
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Time classification
  const { overdue, thisWeek, upcoming, unscheduled } = useMemo(
    () => classifyByTime(tasks, weekStart, weekEnd),
    [tasks, weekStart, weekEnd]
  );

  // Phase colors
  const phaseColors = currentPhase ? getPhaseColors(currentPhase) : null;

  // Operational actions for summary strip
  const operationalActions = useMemo(() => deriveOperationalActions(tasks), [tasks]);

  // Customer actions from feedback requests
  const pendingCustomerActions = (feedbackRequests || []).filter(
    fr => fr.status === "posted" || fr.status === "draft"
  );

  if (!project) return null;

  // Border color by attention
  const borderColor = attention?.status === "NEEDS_MANAGEMENT"
    ? "border-red-700/50"
    : attention?.status === "BLOCKED"
      ? "border-orange-700/40"
      : attention?.status === "AT_RISK"
        ? "border-amber-700/40"
        : "border-gray-700/30";

  return (
    <div className={cn("rounded-lg border overflow-hidden transition-colors", borderColor, "bg-black/30")}>
      {/* ── Collapsed Summary — answers all 4 questions ── */}
      <div className="cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {/* Row 1: Expand icon + Project name + Phase (LARGE) + Attention Status */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-3">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}

          <Link
            to={buildProjectDetailUrl(project.id, { source: SOURCES.PRIORITIES })}
            className="text-base font-bold text-gray-100 truncate hover:text-red-400 hover:underline transition-colors"
            onClick={e => e.stopPropagation()}
          >
            {project.name}
          </Link>

          {/* Current Phase — visually dominant */}
          {currentPhase && (
            <span
              className="text-sm font-black uppercase tracking-wider shrink-0"
              style={{ color: phaseColors?.dot || "#6B7280" }}
            >
              {currentPhase}
            </span>
          )}

          {nextPhase && (
            <span className="text-[10px] text-gray-600 hidden lg:flex items-center gap-0.5 shrink-0">
              <ArrowRight className="w-2.5 h-2.5" />{nextPhase}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <AttentionStatusBadge attention={attention} size="sm" />
          </div>
        </div>

        {/* Row 2: Progress bar + stats strip — dense horizontal */}
        <div className="px-4 pb-1 ml-8 flex items-center gap-3 flex-wrap">
          {totalTasks > 0 && (
            <div className="flex items-center gap-2 min-w-[100px]">
              <Progress value={progressPct} className="h-1.5 flex-1 bg-gray-800 max-w-[80px]" />
              <span className="text-[11px] text-gray-400 tabular-nums font-semibold">{progressPct}%</span>
              <span className="text-[10px] text-gray-600 tabular-nums">{completedTasks}/{totalTasks}</span>
            </div>
          )}

          {hoursRemaining && (
            <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />{hoursRemaining}
            </span>
          )}

          {nextMilestone && (
            <span className="text-[10px] text-amber-500/80 flex items-center gap-0.5 hidden md:flex">
              <Flag className="w-2.5 h-2.5" />{nextMilestone}
            </span>
          )}

          {/* Task counts — quick scan */}
          {overdue.length > 0 && (
            <span className="text-[10px] text-red-400 font-semibold tabular-nums flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" />{overdue.length} overdue
            </span>
          )}
          {thisWeek.length > 0 && (
            <span className="text-[10px] text-blue-400 tabular-nums flex items-center gap-0.5">
              <CalendarDays className="w-2.5 h-2.5" />{thisWeek.length} this week
            </span>
          )}
          {upcoming.length > 0 && (
            <span className="text-[10px] text-gray-500 tabular-nums">{upcoming.length} upcoming</span>
          )}
          {unscheduled.length > 0 && (
            <span className="text-[10px] text-gray-600 tabular-nums">{unscheduled.length} unscheduled</span>
          )}
        </div>

        {/* Row 3: Blocker callout — one dominant blocker, always visible */}
        {currentBlocker && (
          <div className="px-4 pb-1.5 ml-8">
            <div className="flex items-center gap-1.5 bg-red-900/15 border border-red-800/30 rounded px-2.5 py-1">
              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
              <span className="text-[12px] text-red-300 font-medium truncate">{currentBlocker}</span>
            </div>
          </div>
        )}

        {/* Row 4: Operational action chips — visible collapsed */}
        {(operationalActions.length > 0 || pendingCustomerActions.length > 0) && (
          <div className="px-4 pb-2 ml-8 flex items-center gap-1.5 flex-wrap">
            {operationalActions.map(action => {
              const Icon = action.icon;
              return (
                <span key={action.key} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium border", action.bgClass, action.borderClass, action.color)}>
                  <Icon className="w-2.5 h-2.5" />{action.count} {action.label}
                </span>
              );
            })}
            {pendingCustomerActions.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium border bg-blue-900/15 border-blue-800/30 text-blue-400">
                <Users className="w-2.5 h-2.5" />{pendingCustomerActions.length} Customer Action{pendingCustomerActions.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Expanded: Discussion → Tasks ── */}
      {expanded && (
        <div className="border-t border-gray-800/30">
          {/* Discussion Panel — frames the management conversation */}
          <ProjectDiscussionPanel
            project={project}
            tasks={tasks}
            milestones={milestones}
            overdueTasks={overdue.length}
            attention={attention}
          />

          {/* Customer Actions */}
          {pendingCustomerActions.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-800/30">
              <span className="text-[10px] text-blue-400/70 uppercase tracking-wide font-medium block mb-1">Customer Actions</span>
              <div className="space-y-1">
                {pendingCustomerActions.map(fr => (
                  <div key={fr.id} className="flex items-center gap-2 text-[12px]">
                    <Users className="w-3 h-3 text-blue-400 shrink-0" />
                    <span className="text-blue-300 truncate">{fr.title}</span>
                    <Badge className="text-[9px] px-1 py-0 bg-blue-900/20 text-blue-400 border-0 shrink-0">{fr.request_type?.replace(/_/g, " ")}</Badge>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-gray-700 text-gray-400 shrink-0">{fr.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add task button */}
          <div className="px-4 py-1 flex justify-end" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => shared.onAddTask?.(project.id)}
              className="text-[10px] text-gray-600 hover:text-green-400 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" />Add Task
            </button>
          </div>

          {/* Time-based task breakdown */}
          <div className="pb-2">
            <TimeBucket label="Overdue" icon={AlertTriangle} tasks={overdue} color="text-red-400" shared={shared} defaultExpanded={true} />
            <TimeBucket label="This Week" icon={CalendarDays} tasks={thisWeek} color="text-blue-400" shared={shared} defaultExpanded={true} />
            <TimeBucket label="Upcoming" icon={CalendarDays} tasks={upcoming} color="text-gray-400" shared={shared} defaultExpanded={false} />
            <TimeBucket label="Unscheduled" icon={Clock} tasks={unscheduled} color="text-gray-600" shared={shared} defaultExpanded={false} />

            {tasks.length === 0 && (
              <div className="px-6 py-3 text-center text-[11px] text-gray-600">No active tasks</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}