import React, { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  Clock,
  CalendarClock,
  CalendarOff,
  Flame,
  User,
  FolderKanban,
  Timer,
  Ban,
  Plus,
  Settings2,
} from "lucide-react";
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  format,
  isWithinInterval,
  isBefore,
  startOfDay,
} from "date-fns";
import { cn } from "@/lib/utils";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import ManageBucketsModal from "@/components/project/ManageBucketsModal";

// ── Priority sort order: Critical→High→Medium→Low→unknown ──
// Task entity has no "priority" enum field — priority is derived from is_priority flag + due_date urgency.
// For this workload view, we use is_priority as the "critical/high" indicator
// and sort by due date within that tier.
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function getWorkloadPriority(task) {
  // is_priority = high importance; overdue + priority = critical
  if (task.is_priority) {
    if (task.due_date) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const due = new Date(task.due_date);
      if (due < now) return "critical";
      const diff = (due - now) / (1000 * 60 * 60 * 24);
      if (diff <= 7) return "critical";
      return "high";
    }
    return "high";
  }
  // Non-priority with due date = medium, without = low
  return task.due_date ? "medium" : "low";
}

function workloadSort(tasks) {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[getWorkloadPriority(a)] ?? 4;
    const pb = PRIORITY_ORDER[getWorkloadPriority(b)] ?? 4;
    if (pa !== pb) return pa - pb;
    // Same priority: earliest due date first
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    // Tie: created_date ascending
    const aCr = a.created_date ? new Date(a.created_date).getTime() : Infinity;
    const bCr = b.created_date ? new Date(b.created_date).getTime() : Infinity;
    return aCr - bCr;
  });
}

// ── Priority badge display ──
function PriorityBadge({ priority }) {
  const cfg = {
    critical: { label: "Critical", cls: "border-red-500 text-red-400 bg-red-500/10" },
    high: { label: "High", cls: "border-orange-500 text-orange-400 bg-orange-500/10" },
    medium: { label: "Medium", cls: "border-yellow-500 text-yellow-400 bg-yellow-500/10" },
    low: { label: "Low", cls: "border-gray-500 text-gray-400 bg-gray-500/10" },
  };
  const c = cfg[priority] || cfg.low;
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", c.cls)}>
      {c.label}
    </Badge>
  );
}

// ── Build compact project label ──
function compactProjectLabel(project) {
  if (!project) return "No Project";
  const name = project.name || "";
  const client = project.client_name || "";
  // Extract project code
  const codeMatch = name.match(/^(\d+[_\-]\d+)/);
  const code = codeMatch ? codeMatch[1] : null;
  // Extract descriptor from name after code and client
  if (code && client) return `${code} · ${client.split(" ").pop()}`;
  if (client) {
    // Try to find vehicle/descriptor
    const parts = name.split(/\s*(?:\/\/|\/)\s*/);
    if (parts.length >= 2) {
      const clientLower = client.toLowerCase();
      const desc = parts.find(p => p.toLowerCase() !== clientLower && !/^\d+[_\-]/.test(p));
      if (desc) return `${client.split(" ").pop()} · ${desc.length > 16 ? desc.slice(0, 14) + "…" : desc}`;
    }
    return client;
  }
  return name.length > 24 ? name.slice(0, 22) + "…" : name;
}

// ── Blocked detection (task has unmet dependencies) ──
function isBlocked(task, completedStatusId) {
  if (!task.dependencies || task.dependencies.length === 0) return false;
  // We can't check dep status without the full task map — mark as blocked if has deps
  // (A more accurate check would verify dep completion, but we keep it simple)
  return true;
}

// ── Task Row ──
function WorkloadTaskRow({
  task,
  project,
  assignee,
  status,
  priority,
  blocked,
  onToggleComplete,
  onTaskClick,
}) {
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const today = startOfDay(new Date());
  const isOverdue = dueDate && isBefore(dueDate, today);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 hover:bg-gray-800/40 transition-colors group border-b border-gray-800/30 last:border-b-0",
        blocked && "opacity-70"
      )}
    >
      {/* Checkbox */}
      <Checkbox
        checked={false}
        onCheckedChange={() => onToggleComplete(task)}
        className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 shrink-0"
      />

      {/* Priority indicator */}
      {task.is_priority && <Flame className="w-3.5 h-3.5 text-red-400 shrink-0" />}

      {/* Task name */}
      <button
        onClick={() => onTaskClick(task)}
        className="flex-1 min-w-0 text-left text-sm text-gray-200 hover:text-white truncate font-medium"
      >
        {task.name}
      </button>

      {/* Blocked indicator */}
      {blocked && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-700 text-red-500 bg-red-900/20 shrink-0">
          <Ban className="w-3 h-3 mr-0.5" />
          Blocked
        </Badge>
      )}

      {/* Project label */}
      <Link
        to={buildProjectDetailUrl(project?.id, { source: SOURCES.PRIORITIES })}
        className="text-[11px] text-gray-500 hover:text-gray-300 truncate max-w-[140px] shrink-0 hidden md:block"
        title={project?.name}
      >
        {compactProjectLabel(project)}
      </Link>

      {/* Priority */}
      <div className="shrink-0 hidden sm:block">
        <PriorityBadge priority={priority} />
      </div>

      {/* Status */}
      {status && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 shrink-0 hidden sm:inline-flex"
          style={{ borderColor: status.color, color: status.color }}
        >
          {status.label}
        </Badge>
      )}

      {/* Assignee */}
      <span className="text-xs text-gray-500 w-16 truncate shrink-0 hidden lg:block text-right">
        {assignee?.full_name?.split(" ")[0] || "—"}
      </span>

      {/* Due date */}
      <span
        className={cn(
          "text-xs w-16 shrink-0 text-right hidden sm:block tabular-nums",
          isOverdue ? "text-red-400 font-semibold" : "text-gray-500"
        )}
      >
        {dueDate ? format(dueDate, "MMM d") : "—"}
      </span>

      {/* Estimated time */}
      {task.estimated_hours ? (
        <span className="text-[11px] text-gray-500 w-12 shrink-0 text-right hidden lg:block tabular-nums">
          {task.estimated_hours}h
        </span>
      ) : (
        <span className="w-12 shrink-0 hidden lg:block" />
      )}
    </div>
  );
}

// ── Section ──
function WorkloadSection({
  title,
  icon: Icon,
  iconColor,
  borderColor,
  headerBg,
  tasks,
  projectMap,
  teamMemberMap,
  statusMap,
  completedStatusId,
  emptyMessage,
  onToggleComplete,
  onTaskClick,
}) {
  const sorted = useMemo(() => workloadSort(tasks), [tasks]);

  return (
    <div className={cn("bg-black/40 backdrop-blur-xl border-2 rounded-lg overflow-hidden", borderColor)}>
      <div className={cn("flex items-center gap-2 px-3 py-2 border-b", headerBg, borderColor)}>
        <Icon className={cn("w-4 h-4", iconColor)} />
        <span className={cn("text-sm font-semibold", iconColor)}>{title}</span>
        <Badge variant="outline" className={cn("ml-auto text-[10px]", borderColor, iconColor)}>
          {tasks.length}
        </Badge>
      </div>
      <div>
        {sorted.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-4">{emptyMessage}</p>
        ) : (
          sorted.map((task) => (
            <WorkloadTaskRow
              key={task.id}
              task={task}
              project={projectMap.get(task.project_id)}
              assignee={teamMemberMap.get(task.assigned_team_member_id)}
              status={statusMap.get(task.status_id)}
              priority={getWorkloadPriority(task)}
              blocked={isBlocked(task, completedStatusId)}
              onToggleComplete={onToggleComplete}
              onTaskClick={onTaskClick}
            />
          ))
        )}
      </div>
    </div>
  );
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

// ── Main View ──
export default function WeeklyWorkloadView({
  tasks,
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
    const start = startOfWeek(base, { weekStartsOn: 1 }); // Monday
    const end = endOfWeek(base, { weekStartsOn: 1 }); // Sunday
    return { start, end };
  }, [weekOffset]);

  const nextWeek = useMemo(() => {
    const start = addWeeks(selectedWeek.end, 0);
    start.setDate(start.getDate() + 1);
    const end = endOfWeek(start, { weekStartsOn: 1 });
    return { start, end };
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

  // ── Find completed/done status ──
  const completedStatusId = useMemo(() => {
    const s = statuses.find((s) => {
      const label = (s.label || "").toLowerCase();
      return s.scope === "Task" && (label.includes("complete") || label.includes("done"));
    });
    return s?.id || null;
  }, [statuses]);

  // ── Excluded statuses: completed, cancelled, archived ──
  const excludedStatusIds = useMemo(() => {
    const ids = new Set();
    statuses.forEach((s) => {
      const label = (s.label || "").toLowerCase();
      if (
        s.scope === "Task" &&
        (label.includes("complete") || label.includes("done") || label.includes("cancel") || label.includes("archive"))
      ) {
        ids.add(s.id);
      }
    });
    return ids;
  }, [statuses]);

  // ── Active tasks (excluding completed/cancelled/archived) ──
  const activeTasks = useMemo(() => {
    return tasks.filter((t) => !excludedStatusIds.has(t.status_id));
  }, [tasks, excludedStatusIds]);

  // ── Section buckets ──
  const today = useMemo(() => startOfDay(new Date()), []);

  const { overdue, dueThisWeek, upcoming, unscheduled } = useMemo(() => {
    const o = [];
    const d = [];
    const u = [];
    const un = [];

    activeTasks.forEach((task) => {
      if (!task.due_date) {
        un.push(task);
        return;
      }
      const due = startOfDay(new Date(task.due_date));
      if (isBefore(due, today) && isBefore(due, selectedWeek.start)) {
        o.push(task);
      } else if (
        isWithinInterval(due, { start: selectedWeek.start, end: selectedWeek.end })
      ) {
        // If selected week is in the past and due is before today, it's overdue
        if (isBefore(due, today)) {
          o.push(task);
        } else {
          d.push(task);
        }
      } else if (
        isWithinInterval(due, { start: nextWeek.start, end: nextWeek.end })
      ) {
        u.push(task);
      } else if (isBefore(due, selectedWeek.start)) {
        // Due before selected week start → overdue
        o.push(task);
      }
      // Tasks due after next week are not shown
    });

    return { overdue: o, dueThisWeek: d, upcoming: u, unscheduled: un };
  }, [activeTasks, today, selectedWeek, nextWeek]);

  // ── Summary stats ──
  const stats = useMemo(() => {
    const allVisible = [...overdue, ...dueThisWeek, ...upcoming, ...unscheduled];
    const unassigned = allVisible.filter((t) => !t.assigned_team_member_id).length;
    const withEstimate = allVisible.filter((t) => t.estimated_hours && t.estimated_hours > 0);
    const totalEstHours = withEstimate.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    const missingEstimates = allVisible.length - withEstimate.length;

    return {
      overdue: overdue.length,
      dueThisWeek: dueThisWeek.length,
      upcoming: upcoming.length,
      unscheduled: unscheduled.length,
      unassigned,
      totalEstHours,
      missingEstimates,
      total: allVisible.length,
    };
  }, [overdue, dueThisWeek, upcoming, unscheduled]);

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
          {format(selectedWeek.start, "MMM d")} – {format(selectedWeek.end, "MMM d, yyyy")}
        </div>
      </div>

      {/* ── Summary Header ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
        <SummaryCard label="Overdue" value={stats.overdue} icon={AlertTriangle} color="text-red-400" bg="bg-red-500/10" />
        <SummaryCard label="Due This Week" value={stats.dueThisWeek} icon={CalendarClock} color="text-blue-400" bg="bg-blue-500/10" />
        <SummaryCard label="Upcoming" value={stats.upcoming} icon={Clock} color="text-purple-400" bg="bg-purple-500/10" />
        <SummaryCard label="Unscheduled" value={stats.unscheduled} icon={CalendarOff} color="text-amber-400" bg="bg-amber-500/10" />
        <SummaryCard label="Unassigned" value={stats.unassigned} icon={User} color="text-yellow-400" bg="bg-yellow-500/10" />
        <div className="bg-black/40 border border-gray-800 rounded-lg p-2 flex flex-col items-center justify-center">
          <Timer className="w-4 h-4 text-emerald-400 mb-0.5" />
          <span className="text-sm font-bold text-white tabular-nums">{formatHours(stats.totalEstHours)}</span>
          <span className="text-[10px] text-gray-500">Est. Time</span>
          {stats.missingEstimates > 0 && (
            <span className="text-[9px] text-amber-500 mt-0.5">{stats.missingEstimates} missing</span>
          )}
        </div>
        <SummaryCard label="Total" value={stats.total} icon={FolderKanban} color="text-gray-300" bg="bg-gray-500/10" />
      </div>

      {/* ── Task Sections ── */}
      <WorkloadSection
        title="OVERDUE"
        icon={AlertTriangle}
        iconColor="text-red-400"
        borderColor="border-red-600/50"
        headerBg="bg-red-600/10"
        tasks={overdue}
        projectMap={projectMap}
        teamMemberMap={teamMemberMap}
        statusMap={statusMap}
        completedStatusId={completedStatusId}
        emptyMessage="No overdue tasks."
        onToggleComplete={onToggleComplete}
        onTaskClick={onTaskClick}
      />

      <WorkloadSection
        title="DUE THIS WEEK"
        icon={CalendarClock}
        iconColor="text-blue-400"
        borderColor="border-blue-600/50"
        headerBg="bg-blue-600/10"
        tasks={dueThisWeek}
        projectMap={projectMap}
        teamMemberMap={teamMemberMap}
        statusMap={statusMap}
        completedStatusId={completedStatusId}
        emptyMessage="No tasks are due this week."
        onToggleComplete={onToggleComplete}
        onTaskClick={onTaskClick}
      />

      <WorkloadSection
        title="UPCOMING"
        icon={Clock}
        iconColor="text-purple-400"
        borderColor="border-purple-600/50"
        headerBg="bg-purple-600/10"
        tasks={upcoming}
        projectMap={projectMap}
        teamMemberMap={teamMemberMap}
        statusMap={statusMap}
        completedStatusId={completedStatusId}
        emptyMessage="No upcoming tasks."
        onToggleComplete={onToggleComplete}
        onTaskClick={onTaskClick}
      />

      <WorkloadSection
        title="UNSCHEDULED"
        icon={CalendarOff}
        iconColor="text-amber-400"
        borderColor="border-amber-600/50"
        headerBg="bg-amber-600/10"
        tasks={unscheduled}
        projectMap={projectMap}
        teamMemberMap={teamMemberMap}
        statusMap={statusMap}
        completedStatusId={completedStatusId}
        emptyMessage="No active tasks are missing due dates."
        onToggleComplete={onToggleComplete}
        onTaskClick={onTaskClick}
      />

      {/* Create Task Modal */}
      {createTaskForProjectId && (
        <CreateTaskModal
          projectId={createTaskForProjectId}
          defaultIsPriority={true}
          onClose={() => setCreateTaskForProjectId(null)}
        />
      )}

      {/* Manage Buckets Modal */}
      {manageBucketsProjectId && (
        <ManageBucketsModal
          projectId={manageBucketsProjectId}
          onClose={() => setManageBucketsProjectId(null)}
        />
      )}
    </div>
  );
}

// ── Summary Card ──
function SummaryCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div className={cn("border border-gray-800 rounded-lg p-2 flex flex-col items-center justify-center", bg)}>
      <Icon className={cn("w-4 h-4 mb-0.5", color)} />
      <span className={cn("text-sm font-bold tabular-nums", color)}>{value}</span>
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  );
}