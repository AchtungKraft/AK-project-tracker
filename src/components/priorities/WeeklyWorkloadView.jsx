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
  FolderKanban,
  HelpCircle,
} from "lucide-react";
import { startOfWeek, endOfWeek, addWeeks, format, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { sortTasksByPriority } from "@/utils/taskPrioritySort";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import WorkloadProjectGroup from "./WorkloadProjectGroup";

const DONE_STATUS_ID = "6913f57422230d8c7ee2ef54";

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fmtHours(h) {
  if (!h || h === 0) return "0h";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

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

function buildProjectGroups(tasks, projectMap, allTasksByProject) {
  const groups = new Map();
  tasks.forEach((task) => {
    const pid = task.project_id || "__no_project__";
    if (!groups.has(pid)) {
      groups.set(pid, { project: projectMap.get(pid) || null, tasks: [] });
    }
    groups.get(pid).tasks.push(task);
  });
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
    allProjectTasks: allTasksByProject.get(pid) || [],
  }));
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
    emptyMessage: "No tasks due this week.",
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
    emptyMessage: "No unscheduled tasks.",
    defaultExpanded: false,
  },
];

function JumpPill({ label, count, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors hover:brightness-125",
        color
      )}
    >
      {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}

function StatCard({ label, value, icon: Icon, color, bg, sub }) {
  return (
    <div className={cn("border border-gray-800 rounded-lg px-2 py-1.5 flex flex-col items-center justify-center min-w-0", bg)}>
      <Icon className={cn("w-3.5 h-3.5 mb-0.5", color)} />
      <span className={cn("text-sm font-bold tabular-nums leading-none", color)}>{value}</span>
      <span className="text-[9px] text-gray-500 leading-tight">{label}</span>
      {sub && <span className="text-[9px] text-amber-500 leading-tight">{sub}</span>}
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

  // ── Lookup maps ──
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

  // ── All tasks by project (for progress calc) ──
  const allTasksByProject = useMemo(() => {
    const m = new Map();
    (allTasks.length > 0 ? allTasks : tasks).forEach((t) => {
      const pid = t.project_id || "__no_project__";
      if (!m.has(pid)) m.set(pid, []);
      m.get(pid).push(t);
    });
    return m;
  }, [allTasks, tasks]);

  // ── Dep resolution map ──
  const taskById = useMemo(() => {
    const m = new Map();
    (allTasks.length > 0 ? allTasks : tasks).forEach((t) => m.set(t.id, t));
    return m;
  }, [allTasks, tasks]);

  const blockedSet = useMemo(() => {
    const blocked = new Set();
    tasks.forEach((task) => {
      if (!task.dependencies || task.dependencies.length === 0) return;
      const hasIncompleteDep = task.dependencies.some((depId) => {
        const dep = taskById.get(depId);
        if (!dep) return false;
        return dep.status_id !== DONE_STATUS_ID;
      });
      if (hasIncompleteDep) blocked.add(task.id);
    });
    return blocked;
  }, [tasks, taskById]);

  const activeTasks = useMemo(() => tasks.filter((t) => t.status_id !== DONE_STATUS_ID), [tasks]);

  const today = useMemo(() => startOfDay(new Date()), []);

  const buckets = useMemo(() => {
    const overdue = [];
    const dueThisWeek = [];
    const upcoming = [];
    const unscheduled = [];

    activeTasks.forEach((task) => {
      const due = parseLocalDate(task.due_date);
      if (!due) { unscheduled.push(task); return; }
      if (due < today) { overdue.push(task); return; }
      if (due >= selectedWeek.start && due <= selectedWeek.end) { dueThisWeek.push(task); return; }
      if (due >= nextWeek.start && due <= nextWeek.end) { upcoming.push(task); return; }
    });

    return { overdue, dueThisWeek, upcoming, unscheduled };
  }, [activeTasks, today, selectedWeek, nextWeek]);

  const sectionGroups = useMemo(
    () => ({
      overdue: buildProjectGroups(buckets.overdue, projectMap, allTasksByProject),
      dueThisWeek: buildProjectGroups(buckets.dueThisWeek, projectMap, allTasksByProject),
      upcoming: buildProjectGroups(buckets.upcoming, projectMap, allTasksByProject),
      unscheduled: buildProjectGroups(buckets.unscheduled, projectMap, allTasksByProject),
    }),
    [buckets, projectMap, allTasksByProject]
  );

  // ── Summary stats ──
  const stats = useMemo(() => {
    const allVisible = [...buckets.overdue, ...buckets.dueThisWeek, ...buckets.upcoming, ...buckets.unscheduled];
    const unassigned = allVisible.filter((t) => !t.assigned_team_member_id).length;
    const weekEst = buckets.dueThisWeek.filter((t) => t.estimated_hours > 0);
    const estThisWeek = weekEst.reduce((s, t) => s + t.estimated_hours, 0);
    const missingEstWeek = buckets.dueThisWeek.length - weekEst.length;
    const allEst = allVisible.filter((t) => t.estimated_hours > 0);
    const totalEstAll = allEst.reduce((s, t) => s + t.estimated_hours, 0);
    const missingEstAll = allVisible.length - allEst.length;

    // Projects this week
    const weekProjects = new Set();
    buckets.dueThisWeek.forEach((t) => { if (t.project_id) weekProjects.add(t.project_id); });

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
      projectsThisWeek: weekProjects.size,
    };
  }, [buckets]);

  // ── Section refs ──
  const sectionRefs = useRef({});
  const scrollToSection = useCallback((key) => {
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const [createTaskForProjectId, setCreateTaskForProjectId] = useState(null);

  return (
    <div className="space-y-3">
      {/* ── Week Nav + Jump — STICKY ── */}
      <div className="sticky top-0 z-20 bg-gray-900/95 backdrop-blur-sm -mx-3 md:-mx-6 px-3 md:px-6 py-2 border-b border-gray-800/50 space-y-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o - 1)} className="border-gray-700 text-white hover:bg-gray-800 h-7 w-7 p-0">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekOffset(0)}
              className={cn("border-gray-700 text-white hover:bg-gray-800 h-7 px-2 text-xs", weekOffset === 0 && "border-red-600/50 bg-red-600/10")}
            >
              <Calendar className="w-3 h-3 mr-1" />
              This Week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o + 1)} className="border-gray-700 text-white hover:bg-gray-800 h-7 w-7 p-0">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs text-gray-400 ml-1">
              {format(selectedWeek.start, "MMM d")} – {format(selectedWeek.end, "MMM d, yyyy")}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            <JumpPill label="This Week" count={stats.dueThisWeek} color="border-blue-600/50 text-blue-400 bg-blue-600/10" onClick={() => scrollToSection("dueThisWeek")} />
            <JumpPill label="Overdue" count={stats.overdue} color="border-red-600/50 text-red-400 bg-red-600/10" onClick={() => scrollToSection("overdue")} />
            <JumpPill label="Upcoming" count={stats.upcoming} color="border-purple-600/50 text-purple-400 bg-purple-600/10" onClick={() => scrollToSection("upcoming")} />
            <JumpPill label="Unscheduled" count={stats.unscheduled} color="border-amber-600/50 text-amber-400 bg-amber-600/10" onClick={() => scrollToSection("unscheduled")} />
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
        <StatCard label="Due This Week" value={stats.dueThisWeek} icon={CalendarClock} color="text-blue-400" bg="bg-blue-500/10" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} color="text-red-400" bg="bg-red-500/10" />
        <StatCard label="Unscheduled" value={stats.unscheduled} icon={CalendarOff} color="text-amber-400" bg="bg-amber-500/10" />
        <StatCard label="Unassigned" value={stats.unassigned} icon={User} color="text-yellow-400" bg="bg-yellow-500/10" />
        <div className={cn("border border-gray-800 rounded-lg px-2 py-1.5 flex flex-col items-center justify-center", "bg-emerald-500/10")}>
          <Timer className="w-3.5 h-3.5 text-emerald-400 mb-0.5" />
          <span className="text-sm font-bold text-white tabular-nums leading-none">{fmtHours(stats.estThisWeek)}</span>
          <span className="text-[9px] text-gray-500 leading-tight">Est. This Week</span>
          {stats.totalEstAll > 0 && stats.totalEstAll !== stats.estThisWeek && (
            <span className="text-[8px] text-gray-600 leading-tight">{fmtHours(stats.totalEstAll)} all</span>
          )}
        </div>
        <StatCard label="Projects" value={stats.projectsThisWeek} icon={FolderKanban} color="text-cyan-400" bg="bg-cyan-500/10" />
        <StatCard
          label="Missing Est."
          value={stats.missingEstAll}
          icon={HelpCircle}
          color={stats.missingEstAll > 0 ? "text-amber-400" : "text-gray-600"}
          bg={stats.missingEstAll > 0 ? "bg-amber-500/10" : "bg-gray-500/5"}
        />
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
            className={cn("bg-black/40 backdrop-blur-xl border rounded-lg overflow-hidden", sec.borderColor)}
          >
            <div className={cn("flex items-center gap-2 px-3 py-1.5 border-b", sec.headerBg, sec.borderColor)}>
              <SectionIcon className={cn("w-3.5 h-3.5", sec.iconColor)} />
              <span className={cn("text-xs font-semibold", sec.iconColor)}>{sec.title}</span>
              <Badge variant="outline" className={cn("ml-auto text-[9px] px-1 py-0", sec.borderColor, sec.iconColor)}>
                {taskCount}
              </Badge>
            </div>

            {taskCount === 0 ? (
              <p className="text-gray-600 text-xs text-center py-3">{sec.emptyMessage}</p>
            ) : (
              <div className="divide-y divide-gray-800/30">
                {groups.map((g) => (
                  <WorkloadProjectGroup
                    key={g.projectId}
                    project={g.project}
                    label={g.label}
                    tasks={g.tasks}
                    allProjectTasks={g.allProjectTasks}
                    teamMemberMap={teamMemberMap}
                    statusMap={statusMap}
                    blockedSet={blockedSet}
                    defaultExpanded={sec.defaultExpanded}
                    teamMembers={teamMembers}
                    statuses={statuses}
                    onToggleComplete={onToggleComplete}
                    onTaskClick={onTaskClick}
                    onAddTask={setCreateTaskForProjectId}
                    onUpdateDueDate={onUpdateDueDate}
                    onTogglePriority={onTogglePriority}
                    updateTaskMutation={updateTaskMutation}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {createTaskForProjectId && (
        <CreateTaskModal
          projectId={createTaskForProjectId}
          defaultIsPriority={true}
          onClose={() => setCreateTaskForProjectId(null)}
        />
      )}
    </div>
  );
}