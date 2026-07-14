import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown, ChevronRight, Plus, AlertTriangle, Flag, Clock,
  CalendarDays, Package, Truck, Users, ClipboardCheck, Wrench,
} from "lucide-react";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import { getPhaseColors } from "@/components/workload/phaseColorConfig";
import { cn } from "@/lib/utils";
import { deriveOperationalActions } from "./deriveOperationalActions";
import { deriveCurrentIssue, getIssueColor } from "./deriveCurrentIssue";
import ProjectBriefingExpanded from "./ProjectBriefingExpanded";
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

export default function ProjectBriefingCard({
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
  const nextMilestone = project?.next_milestone_name;
  const hoursRemaining = fmtHours(wh.hours_remaining);

  // Progress — phase-level if possible, else project-level
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

  // Current issue — the dominant problem
  const currentIssue = useMemo(
    () => deriveCurrentIssue(project, tasks, feedbackRequests),
    [project, tasks, feedbackRequests]
  );
  const issueColor = getIssueColor(currentIssue);

  // Operational actions
  const operationalActions = useMemo(() => deriveOperationalActions(tasks), [tasks]);
  const totalActionCount = operationalActions.reduce((sum, a) => sum + a.count, 0);

  // Customer actions
  const pendingCustomerActions = (feedbackRequests || []).filter(
    fr => fr.status === "posted" || fr.status === "draft"
  );

  if (!project) return null;

  // Border color by severity
  const borderColor = currentIssue
    ? (issueColor.text === "text-red-400" ? "border-red-700/50"
      : issueColor.text === "text-amber-400" ? "border-amber-700/40"
      : issueColor.text === "text-blue-400" ? "border-blue-700/40"
      : "border-gray-700/30")
    : "border-gray-700/20";

  return (
    <div className={cn("rounded-lg border overflow-hidden transition-colors", borderColor, "bg-black/30")}>
      {/* ── COLLAPSED BRIEFING — answers all 5 questions ── */}
      <div className="cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {/* Row 1: Project name + Current Issue label */}
        <div className="px-4 pt-3 pb-0 flex items-start gap-2">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
            : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />}

          <div className="flex-1 min-w-0">
            {/* Project name */}
            <div className="flex items-center gap-2 mb-1">
              <Link
                to={buildProjectDetailUrl(project.id, { source: SOURCES.PRIORITIES })}
                className="text-[15px] font-bold text-gray-100 truncate hover:text-red-400 hover:underline transition-colors"
                onClick={e => e.stopPropagation()}
              >
                {project.name}
              </Link>
            </div>

            {/* Phase Hero — large, dominant */}
            <div className="flex items-center gap-3 mb-1.5">
              {currentPhase ? (
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: phaseColors?.dot || "#6B7280" }}
                  />
                  <span
                    className="text-lg font-black uppercase tracking-wider leading-none"
                    style={{ color: phaseColors?.dot || "#6B7280" }}
                  >
                    {currentPhase}
                  </span>
                  {totalTasks > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Progress value={progressPct} className="h-1.5 w-16 bg-gray-800" />
                      <span className="text-[12px] text-gray-400 tabular-nums font-semibold">{progressPct}%</span>
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-sm text-gray-600 italic">No active phase</span>
              )}
            </div>
          </div>

          {/* Right column — Current Issue (the actual problem, not a category) */}
          <div className="shrink-0 text-right max-w-[280px]">
            {currentIssue ? (
              <span className={cn("text-[12px] font-semibold leading-tight", issueColor.text)}>
                {currentIssue}
              </span>
            ) : (
              <span className="text-[11px] text-emerald-400/70 font-medium">No Current Issues</span>
            )}
          </div>
        </div>

        {/* Row 2: Stats strip — dense horizontal scan line */}
        <div className="px-4 pb-2 ml-8 flex items-center gap-3 flex-wrap">
          {/* Overdue */}
          {overdue.length > 0 && (
            <span className="text-[11px] text-red-400 font-semibold tabular-nums flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />{overdue.length} overdue
            </span>
          )}

          {/* This week */}
          {thisWeek.length > 0 && (
            <span className="text-[11px] text-blue-400 tabular-nums flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />{thisWeek.length} this week
            </span>
          )}

          {/* Hours remaining */}
          {hoursRemaining && (
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />{hoursRemaining} remaining
            </span>
          )}

          {/* Next Milestone */}
          {nextMilestone && (
            <span className="text-[11px] text-amber-400/80 flex items-center gap-1">
              <Flag className="w-3 h-3" />{nextMilestone}
            </span>
          )}

          {/* Operational actions count */}
          {totalActionCount > 0 && (
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              •
              <span className="tabular-nums font-medium">{totalActionCount}</span>
              <span className="text-gray-500">action{totalActionCount > 1 ? "s" : ""}</span>
            </span>
          )}
          {pendingCustomerActions.length > 0 && (
            <span className="text-[11px] text-blue-400/80 flex items-center gap-1">
              <Users className="w-3 h-3" />{pendingCustomerActions.length} customer
            </span>
          )}

          {/* Task counts — faded for context */}
          <span className="text-[10px] text-gray-600 tabular-nums ml-auto">
            {completedTasks}/{totalTasks} tasks
          </span>
        </div>
      </div>

      {/* ── EXPANDED: Briefing → Tasks ── */}
      {expanded && (
        <div className="border-t border-gray-800/30">
          {/* Project Briefing Section */}
          <ProjectBriefingExpanded
            project={project}
            tasks={tasks}
            milestones={milestones}
            phases={phases}
            currentIssue={currentIssue}
            issueColor={issueColor}
            operationalActions={operationalActions}
            pendingCustomerActions={pendingCustomerActions}
            overdueTasks={overdue.length}
          />

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