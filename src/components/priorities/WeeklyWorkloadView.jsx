import React, { useState, useMemo, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  Clock,
  CalendarClock,
  CalendarOff,
  User,
  Timer,
} from "lucide-react";
import { startOfWeek, endOfWeek, addWeeks, format, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import { sortTasksByPriority } from "@/utils/taskPrioritySort";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import ManageBucketsModal from "@/components/project/ManageBucketsModal";
import WorkloadProjectGroup from "./WorkloadProjectGroup";

// ── Canonical "Done" status ID — the ONLY excluded status ──
// Task statuses in this app: To Do, In Progress, Review, QA/Test, Done
// There are NO "Cancelled" or "Archived" task statuses.
// We exclude ONLY "Done" by matching the exact canonical ID.
const DONE_STATUS_ID = "6913f57422230d8c7ee2ef54";

// ── Parse a date-only string WITHOUT timezone shift ──
// Task.due_date is "YYYY-MM-DD" — parsing with new Date() interprets as UTC midnight,
// which can shift to the previous day in US timezones. Parse as local instead.
function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

// ── Format hours nicely ──
function formatHours(h) {
  if (!h || h === 0) return "0h";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

// ── Compact project label (reuses pattern from PriorityProjectNav) ──
function compactProjectLabel(project) {
  if (!project) return "No Project";
  const name = project.name || "";
  const client = project.client_name || "";
  const codeMatch = name.match(/^(\d+[_\-]\d+)/);
  const code = codeMatch ? codeMatch[1] : null;
  if (code && client) return `${code} · ${client.split(" ").pop()}`;
  if (client) {
    const parts = name.split(/\s*(?:\/\/|\/)\s*/);
    if (parts.length >= 2) {
      const clientLower = client.toLowerCase();
      const desc = parts.find(
        (p) => p.toLowerCase() !== clientLower && !/^\d+[_\-]/.test(p)
      );
      if (desc)
        return `${client.split(" ").pop()} · ${desc.length > 16 ? desc.slice(0, 14) + "…" : desc}`;
    }
    return client;
  }
  return name.length > 24 ? name.slice(0, 22) + "…" : name;
}

// ── Build project groups from a task list ──
function buildProjectGroups(tasks, projectMap) {
  const groups = new Map();
  tasks.forEach((task) => {
    const pid = task.project_id || "__no_project__";
    if (!groups.has(pid)) {
      groups.set(pid, { project: projectMap.get(pid) || null, tasks: [] });
    }
    groups.get(pid).tasks.push(task);
  });
  // Sort groups: projects with tasks sorted by project name, "No Project" last
  const entries = Array.from(groups.entries());
  entries.sort((a, b) => {
    if (a[0] === "__no_project__") return 1;
    if (b[0] === "__no_project__") return -1;
    const nameA = a[1].project?.name || "";
    const nameB = b[1].project?.name || "";
    return nameA.localeCompare(nameB);
  });
  return entries.map(([pid, g]) => ({
    projectId: pid,
    project: g.project,
    label: compactProjectLabel(g.project),
    tasks: sortTasksByPriority(g.tasks),
  }));
}

// ── Compute group stats ──
function groupStats(tasks, blockedSet) {
  let estHours = 0;
  let missingEst = 0;
  let unassigned = 0;
  let blocked = 0;
  tasks.forEach((t) => {
    if (t.estimated_hours && t.estimated_hours > 0) estHours += t.estimated_hours;
    else missingEst++;
    if (!t.assigned_team_member_id) unassigned++;
    if (blockedSet.has(t.id)) blocked++;
  });
  return { estHours, missingEst, unassigned, blocked };
}

// ── Section config ──
const SECTIONS = [
  {
    key: "dueThisWeek",
    title: "DUE THIS WEEK",
    icon: CalendarClock,
    iconColor: "text-blue-400",
    borderColor: "border-blue-600/50",
    headerBg: "bg-blue-600/10",
    emptyMessage: "No tasks are due this week.",
    defaultExpanded: true,
  },
  {
    key: "overdue",
    title: "OVERDUE",
    icon: AlertTriangle,
    iconColor: "text-red-400",
    borderColor: "border-red-600/50",
    headerBg: "bg-red-600/10",
    emptyMessage: "No overdue tasks.",
    defaultExpanded: true,
  },
  {
    key: "upcoming",
    title: "UPCOMING",
    icon: Clock,
    iconColor: "text-purple-400",
    borderColor: "border-purple-600/50",
    headerBg: "bg-purple-600/10",
    emptyMessage: "No upcoming tasks.",
    defaultExpanded: false,
  },
  {
    key: "unscheduled",
    title: "UNSCHEDULED",
    icon: CalendarOff,
    iconColor: "text-amber-400",
    borderColor: "border-amber-600/50",
    headerBg: "bg-amber-600/10",
    emptyMessage: "No active tasks are missing due dates.",
    defaultExpanded: false,
  },
];

// ── Jump pill ──
function JumpPill({ label, count, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
        "hover:brightness-125",
        color
      )}
    >
      {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}

// ── Summary Card ──
function SummaryCard({ label, value, icon: Icon, color, bg, sub }) {
  return (
    <div className={cn("border border-gray-800 rounded-lg p-2 flex flex-col items-center justify-center", bg)}>
      <Icon className={cn("w-4 h-4 mb-0.5", color)} />
      <span className={cn("text-sm font-bold tabular-nums", color)}>{value}</span>
      <span className="text-[10px] text-gray-500">{label}</span>
      {sub && <span className="text-[9px] text-amber-500 mt-0.5">{sub}</span>}
    </div>
  );
}

// ── Main View ──
export default function WeeklyWorkloadView({
  tasks,
  allTasks = [],
  projects,
  teamMembers,
  categories,
  statuses,
  commentCountByTaskId = {},
  partsProgressByTaskId = {},
  onToggleComplete,
  onTaskClick,
  onUpdateDueDate,
  onTogglePriority,
  updateTaskMutation,
}) {
  // ── Week navigation ──
  const [weekOffset, setWeekOffset] = useState(0);

  const selectedWeek = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset);
    const start = startOfWeek(base, { weekStartsOn: 1 });
    const end = endOfWeek(base, { weekStartsOn: 1 });
    return { start, end };
  }, [weekOffset]);

  const nextWeek = useMemo(() => {
    const nStart = new Date(selectedWeek.end);
    nStart.setDate(nStart.getDate() + 1);
    nStart.setHours(0, 0, 0, 0);
    const nEnd = endOfWeek(nStart, { weekStartsOn: 1 });
    return { start: nStart, end: nEnd };
  }, [selectedWeek]);

  // ── Lookup maps (memoized, O(1)) ──
  const projectMap = useMemo(() => {
    const m = new Map();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const teamMemberMap = useMemo(() => {
    const m = new Map();
    teamMembers.forEach((tm) => m.set(tm.id, tm));
    return m;
  }, [teamMembers]);

  const statusMap = useMemo(() => {
    const m = new Map();
    statuses.forEach((s) => m.set(s.id, s));
    return m;
  }, [statuses]);

  // ── Task-by-ID map for dependency resolution ──
  // Use allTasks (full dataset from PriorityDashboard) to resolve deps across the full dataset
  const taskById = useMemo(() => {
    const m = new Map();
    (allTasks.length > 0 ? allTasks : tasks).forEach((t) => m.set(t.id, t));
    return m;
  }, [allTasks, tasks]);

  // ── Blocked detection: task is blocked only if it has deps AND ≥1 dep is not Done ──
  const blockedSet = useMemo(() => {
    const blocked = new Set();
    tasks.forEach((task) => {
      if (!task.dependencies || task.dependencies.length === 0) return;
      const hasIncompleteDep = task.dependencies.some((depId) => {
        const dep = taskById.get(depId);
        // If dep doesn't exist (deleted/missing), don't block
        if (!dep) return false;
        // Blocked only if dep is NOT Done
        return dep.status_id !== DONE_STATUS_ID;
      });
      if (hasIncompleteDep) blocked.add(task.id);
    });
    return blocked;
  }, [tasks, taskById]);

  // ── Active tasks: exclude ONLY "Done" status ──
  const activeTasks = useMemo(() => {
    return tasks.filter((t) => t.status_id !== DONE_STATUS_ID);
  }, [tasks]);

  // ── Date classification — mutually exclusive ──
  const today = useMemo(() => startOfDay(new Date()), []);

  const buckets = useMemo(() => {
    const overdue = [];
    const dueThisWeek = [];
    const upcoming = [];
    const unscheduled = [];

    activeTasks.forEach((task) => {
      const due = parseLocalDate(task.due_date);
      if (!due) {
        unscheduled.push(task);
        return;
      }
      // Overdue: due < start of today
      if (due < today) {
        overdue.push(task);
        return;
      }
      // Due this week: due >= today AND due within selected week
      if (due >= selectedWeek.start && due <= selectedWeek.end) {
        dueThisWeek.push(task);
        return;
      }
      // Upcoming: due within next week
      if (due >= nextWeek.start && due <= nextWeek.end) {
        upcoming.push(task);
        return;
      }
      // Tasks due after next week or in a future selected week but not yet overdue: skip
    });

    return { overdue, dueThisWeek, upcoming, unscheduled };
  }, [activeTasks, today, selectedWeek, nextWeek]);

  // ── Project groups per section ──
  const sectionGroups = useMemo(() => ({
    overdue: buildProjectGroups(buckets.overdue, projectMap),
    dueThisWeek: buildProjectGroups(buckets.dueThisWeek, projectMap),
    upcoming: buildProjectGroups(buckets.upcoming, projectMap),
    unscheduled: buildProjectGroups(buckets.unscheduled, projectMap),
  }), [buckets, projectMap]);

  // ── Summary stats ──
  const stats = useMemo(() => {
    const allVisible = [
      ...buckets.overdue,
      ...buckets.dueThisWeek,
      ...buckets.upcoming,
      ...buckets.unscheduled,
    ];
    const unassigned = allVisible.filter((t) => !t.assigned_team_member_id).length;
    // "Estimated This Week" = only Due This Week tasks
    const weekEst = buckets.dueThisWeek.filter(
      (t) => t.estimated_hours && t.estimated_hours > 0
    );
    const estThisWeek = weekEst.reduce((s, t) => s + t.estimated_hours, 0);
    const missingEstWeek =
      buckets.dueThisWeek.length - weekEst.length;
    // All visible estimate total (secondary)
    const allEst = allVisible.filter((t) => t.estimated_hours && t.estimated_hours > 0);
    const totalEstAll = allEst.reduce((s, t) => s + t.estimated_hours, 0);
    const missingEstAll = allVisible.length - allEst.length;

    return {
      overdue: buckets.overdue.length,
      dueThisWeek: buckets.dueThisWeek.length,
      upcoming: buckets.upcoming.length,
      unscheduled: buckets.unscheduled.length,
      unassigned,
      estThisWeek,
      missingEstWeek,
      totalEstAll,
      missingEstAll,
      total: allVisible.length,
    };
  }, [buckets]);

  // ── Section refs for jump navigation ──
  const sectionRefs = useRef({});
  const scrollToSection = useCallback((key) => {
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // ── Modal state ──
  const [createTaskForProjectId, setCreateTaskForProjectId] = useState(null);
  const [manageBucketsProjectId, setManageBucketsProjectId] = useState(null);

  return (
    <div className="space-y-4">
      {/* ── Week Navigation ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-black/40 rounded-lg p-3 border border-gray-800">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset((o) => o - 1)}
            className="border-gray-700 text-white hover:bg-gray-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset(0)}
            className={cn(
              "border-gray-700 text-white hover:bg-gray-800",
              weekOffset === 0 && "border-red-600/50 bg-red-600/10"
            )}
          >
            <Calendar className="w-4 h-4 mr-1" />
            This Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset((o) => o + 1)}
            className="border-gray-700 text-white hover:bg-gray-800"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-sm text-gray-300 font-medium">
          {format(selectedWeek.start, "MMM d")} –{" "}
          {format(selectedWeek.end, "MMM d, yyyy")}
        </div>
      </div>

      {/* ── Jump Controls ── */}
      <div className="flex flex-wrap gap-1.5">
        <JumpPill
          label="Due This Week"
          count={stats.dueThisWeek}
          color="border-blue-600/50 text-blue-400 bg-blue-600/10"
          onClick={() => scrollToSection("dueThisWeek")}
        />
        <JumpPill
          label="Overdue"
          count={stats.overdue}
          color="border-red-600/50 text-red-400 bg-red-600/10"
          onClick={() => scrollToSection("overdue")}
        />
        <JumpPill
          label="Upcoming"
          count={stats.upcoming}
          color="border-purple-600/50 text-purple-400 bg-purple-600/10"
          onClick={() => scrollToSection("upcoming")}
        />
        <JumpPill
          label="Unscheduled"
          count={stats.unscheduled}
          color="border-amber-600/50 text-amber-400 bg-amber-600/10"
          onClick={() => scrollToSection("unscheduled")}
        />
      </div>

      {/* ── Summary Header ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <SummaryCard label="Due This Week" value={stats.dueThisWeek} icon={CalendarClock} color="text-blue-400" bg="bg-blue-500/10" />
        <SummaryCard label="Overdue" value={stats.overdue} icon={AlertTriangle} color="text-red-400" bg="bg-red-500/10" />
        <SummaryCard label="Unscheduled" value={stats.unscheduled} icon={CalendarOff} color="text-amber-400" bg="bg-amber-500/10" />
        <SummaryCard label="Unassigned" value={stats.unassigned} icon={User} color="text-yellow-400" bg="bg-yellow-500/10" />
        <div className="bg-black/40 border border-gray-800 rounded-lg p-2 flex flex-col items-center justify-center">
          <Timer className="w-4 h-4 text-emerald-400 mb-0.5" />
          <span className="text-sm font-bold text-white tabular-nums">
            {formatHours(stats.estThisWeek)}
          </span>
          <span className="text-[10px] text-gray-500">Est. This Week</span>
          {stats.missingEstWeek > 0 && (
            <span className="text-[9px] text-amber-500 mt-0.5">
              {stats.missingEstWeek} missing
            </span>
          )}
        </div>
        <SummaryCard
          label="Total"
          value={stats.total}
          icon={Clock}
          color="text-gray-300"
          bg="bg-gray-500/10"
        />
        {stats.totalEstAll > 0 && (
          <div className="bg-black/40 border border-gray-800 rounded-lg p-2 flex flex-col items-center justify-center">
            <Timer className="w-4 h-4 text-gray-500 mb-0.5" />
            <span className="text-xs font-medium text-gray-400 tabular-nums">
              {formatHours(stats.totalEstAll)}
            </span>
            <span className="text-[10px] text-gray-600">All Visible</span>
          </div>
        )}
      </div>

      {/* ── Sections ── */}
      {SECTIONS.map((sec) => {
        const groups = sectionGroups[sec.key];
        const taskCount = buckets[sec.key].length;
        const SectionIcon = sec.icon;

        return (
          <div
            key={sec.key}
            ref={(el) => (sectionRefs.current[sec.key] = el)}
            className={cn(
              "bg-black/40 backdrop-blur-xl border-2 rounded-lg overflow-hidden",
              sec.borderColor
            )}
          >
            {/* Sticky section header */}
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 border-b sticky top-0 z-10",
                sec.headerBg,
                sec.borderColor
              )}
            >
              <SectionIcon className={cn("w-4 h-4", sec.iconColor)} />
              <span className={cn("text-sm font-semibold", sec.iconColor)}>
                {sec.title}
              </span>
              <Badge
                variant="outline"
                className={cn("ml-auto text-[10px]", sec.borderColor, sec.iconColor)}
              >
                {taskCount}
              </Badge>
            </div>

            {/* Content */}
            {taskCount === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">
                {sec.emptyMessage}
              </p>
            ) : (
              <div className="divide-y divide-gray-800/30">
                {groups.map((g) => (
                  <WorkloadProjectGroup
                    key={g.projectId}
                    project={g.project}
                    label={g.label}
                    tasks={g.tasks}
                    teamMemberMap={teamMemberMap}
                    statusMap={statusMap}
                    blockedSet={blockedSet}
                    defaultExpanded={sec.defaultExpanded}
                    onToggleComplete={onToggleComplete}
                    onTaskClick={onTaskClick}
                    onAddTask={setCreateTaskForProjectId}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Create Task Modal */}
      {createTaskForProjectId && (
        <CreateTaskModal
          projectId={createTaskForProjectId}
          defaultIsPriority={true}
          onClose={() => setCreateTaskForProjectId(null)}
        />
      )}
      {manageBucketsProjectId && (
        <ManageBucketsModal
          projectId={manageBucketsProjectId}
          onClose={() => setManageBucketsProjectId(null)}
        />
      )}
    </div>
  );
}