import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  CalendarClock,
  CalendarOff,
  Clock,
  Printer,
  Pencil,
  X,
  ListChecks,
  Eye,
} from "lucide-react";
import { startOfWeek, endOfWeek, addWeeks, addDays, format, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { toDateString } from "@/lib/dateUtils";
import { sortTasksByPriority } from "@/utils/taskPrioritySort";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import WorkloadProjectGroup from "./WorkloadProjectGroup";
import WorkloadPrintOptionsModal from "./WorkloadPrintOptionsModal";
import WorkloadBulkActionBar from "./WorkloadBulkActionBar";
import buildWorkloadPrintHTML from "./buildWorkloadPrintHTML";
import WeeklyHoursSummary from "./WeeklyHoursSummary";
import { buildWorkloadRollup, getProjectPhaseRollups } from "@/lib/workloadRollups";
import { useToast } from "@/components/ui/use-toast";

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
    label: g.project?.name || "No Project",
    tasks: sortTasksByPriority(g.tasks),
    allProjectTasks: allTasksByProject.get(pid) || [],
  }));
}

// ── Section config ──
const SECTIONS = [
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

// ── Main View ──
export default function WeeklyWorkloadView({
  tasks,
  allTasks = [],
  projects,
  projectTypes = [],
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
  const [editMode, setEditMode] = useState(false);
  const [showChecklists, setShowChecklists] = useState(false);
  const [showCompletedChecklist, setShowCompletedChecklist] = useState(false);

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

  const projectTypeMap = useMemo(() => {
    const m = new Map();
    projectTypes.forEach((pt) => m.set(pt.id, pt));
    return m;
  }, [projectTypes]);

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

  // Specific blocking labels — "Blocked by: Install Carpet" format
  const blockingLabels = useMemo(() => {
    const labels = {};
    tasks.forEach((task) => {
      if (!blockedSet.has(task.id)) return;
      // Check task.blocking_reasons from the workflow engine first
      if (task.blocking_reasons?.length > 0) {
        const reason = task.blocking_reasons[0];
        if (reason.label) {
          // Strip existing "Blocked by: " or "Waiting on " prefix from engine labels
          const cleaned = reason.label.replace(/^(Blocked by:\s*|Waiting on\s*)/i, "");
          labels[task.id] = cleaned; return;
        }
        if (reason.type === "DEPENDENCY" && reason.relatedTaskId) {
          const dep = taskById.get(reason.relatedTaskId);
          labels[task.id] = dep ? dep.name : "dependency"; return;
        }
      }
      // Fallback: derive from dependencies array
      if (task.dependencies?.length > 0) {
        const incompleteDeps = task.dependencies
          .map(depId => taskById.get(depId))
          .filter(dep => dep && dep.status_id !== DONE_STATUS_ID);
        if (incompleteDeps.length === 1) {
          labels[task.id] = incompleteDeps[0].name;
        } else if (incompleteDeps.length > 1) {
          labels[task.id] = `${incompleteDeps[0].name} +${incompleteDeps.length - 1}`;
        } else {
          labels[task.id] = null;
        }
        return;
      }
      labels[task.id] = null;
    });
    return labels;
  }, [tasks, blockedSet, taskById]);

  // Fetch all phase buckets for phase grouping
  const { data: allBuckets = [] } = useQuery({
    queryKey: ["workloadBuckets"],
    queryFn: () => base44.entities.ProjectKanbanBucket.list(),
  });

  // Fetch all checklist items for visible tasks (one query, not per-task)
  const { data: allChecklistItems = [] } = useQuery({
    queryKey: ["workloadChecklists"],
    queryFn: () => base44.entities.TaskChecklistItem.list(),
    staleTime: 60000,
  });

  const checklistsByTaskId = useMemo(() => {
    const m = {};
    allChecklistItems.forEach(item => {
      if (!m[item.task_id]) m[item.task_id] = [];
      m[item.task_id].push(item);
    });
    return m;
  }, [allChecklistItems]);

  const bucketsByProjectId = useMemo(() => {
    const m = {};
    allBuckets.forEach((b) => {
      if (!m[b.project_id]) m[b.project_id] = [];
      m[b.project_id].push(b);
    });
    return m;
  }, [allBuckets]);

  // Phase lookup for hours summary
  const phaseLookup = useMemo(() => {
    const m = new Map();
    allBuckets.forEach(b => m.set(b.id, b));
    return m;
  }, [allBuckets]);

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

  // ── Canonical rollup — built once, consumed everywhere ──
  const weekRollup = useMemo(
    () => buildWorkloadRollup(buckets.dueThisWeek, { teamMemberMap, phaseLookup }),
    [buckets.dueThisWeek, teamMemberMap, phaseLookup]
  );
  const overdueRollup = useMemo(
    () => buildWorkloadRollup(buckets.overdue),
    [buckets.overdue]
  );

  const sectionGroups = useMemo(
    () => ({
      overdue: buildProjectGroups(buckets.overdue, projectMap, allTasksByProject),
      dueThisWeek: buildProjectGroups(buckets.dueThisWeek, projectMap, allTasksByProject),
      upcoming: buildProjectGroups(buckets.upcoming, projectMap, allTasksByProject),
      unscheduled: buildProjectGroups(buckets.unscheduled, projectMap, allTasksByProject),
    }),
    [buckets, projectMap, allTasksByProject]
  );

  // ── Section counts for jump pills ──
  const stats = useMemo(() => ({
    overdue: buckets.overdue.length,
    dueThisWeek: buckets.dueThisWeek.length,
    upcoming: buckets.upcoming.length,
    unscheduled: buckets.unscheduled.length,
  }), [buckets]);

  // ── Section refs ──
  const sectionRefs = useRef({});
  const scrollToSection = useCallback((key) => {
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const [createTaskForProjectId, setCreateTaskForProjectId] = useState(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const { toast, dismiss } = useToast();

  // ── Bulk selection state ──
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());

  const toggleTaskSelection = useCallback((taskId) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const selectProjectTasks = useCallback((taskIds) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      taskIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    const allIds = new Set();
    Object.values(buckets).forEach((arr) => arr.forEach((t) => allIds.add(t.id)));
    setSelectedTaskIds(allIds);
  }, [buckets]);

  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
    setEditMode(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.key === "e" || e.key === "E") { e.preventDefault(); setEditMode(v => !v); }
      if (e.key === "Escape" && editMode) { e.preventDefault(); clearSelection(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editMode, clearSelection]);

  // ── Checklist item toggle handler — optimistic UI with error rollback ──
  const queryClient = useQueryClient();
  const pendingToggles = useRef(new Set());
  const handleToggleChecklistItem = useCallback((item) => {
    if (pendingToggles.current.has(item.id)) return; // prevent double submission
    pendingToggles.current.add(item.id);
    const newValue = !item.is_complete;
    // Optimistic update — mutate cache immediately
    queryClient.setQueryData(["workloadChecklists"], (old) => {
      if (!old) return old;
      return old.map(ci => ci.id === item.id ? { ...ci, is_complete: newValue } : ci);
    });
    // Persist with error rollback
    base44.entities.TaskChecklistItem.update(item.id, { is_complete: newValue })
      .catch(() => {
        // Rollback on failure
        queryClient.setQueryData(["workloadChecklists"], (old) => {
          if (!old) return old;
          return old.map(ci => ci.id === item.id ? { ...ci, is_complete: !newValue } : ci);
        });
        toast({ title: "Failed to update checklist item", variant: "destructive" });
      })
      .finally(() => { pendingToggles.current.delete(item.id); });
  }, [queryClient, toast]);

  // ── Bulk action handlers ──
  const selectedTasks = useMemo(() => {
    if (selectedTaskIds.size === 0) return [];
    const all = [...buckets.overdue, ...buckets.dueThisWeek, ...buckets.upcoming, ...buckets.unscheduled];
    return all.filter((t) => selectedTaskIds.has(t.id));
  }, [selectedTaskIds, buckets]);

  const handleBulkShiftDates = useCallback((days) => {
    if (!updateTaskMutation || selectedTasks.length === 0) return;
    const count = selectedTasks.length;
    selectedTasks.forEach((task) => {
      const base = parseLocalDate(task.due_date) || new Date();
      const shifted = addDays(base, days);
      const dateStr = toDateString(shifted);
      updateTaskMutation.mutate({ id: task.id, data: { due_date: dateStr } });
    });
    clearSelection();
    dismiss();
    toast({ title: `Shifted ${count} task dates by ${days > 0 ? "+" : ""}${days} day${Math.abs(days) !== 1 ? "s" : ""}` });
  }, [selectedTasks, updateTaskMutation, toast, dismiss, clearSelection]);

  const handleBulkSetDueDate = useCallback((date) => {
    if (!updateTaskMutation || !date) return;
    const count = selectedTasks.length;
    const dateStr = toDateString(date);
    selectedTasks.forEach((task) => {
      updateTaskMutation.mutate({ id: task.id, data: { due_date: dateStr } });
    });
    clearSelection();
    dismiss();
    toast({ title: `Set due date for ${count} tasks` });
  }, [selectedTasks, updateTaskMutation, toast, dismiss, clearSelection]);

  const handleBulkAssign = useCallback((memberId) => {
    if (!updateTaskMutation) return;
    const count = selectedTasks.length;
    selectedTasks.forEach((task) => {
      updateTaskMutation.mutate({ id: task.id, data: { assigned_team_member_id: memberId } });
    });
    clearSelection();
    dismiss();
    toast({ title: `Assigned ${count} tasks` });
  }, [selectedTasks, updateTaskMutation, toast, dismiss, clearSelection]);

  const handleBulkStatus = useCallback((statusId) => {
    if (!updateTaskMutation) return;
    const count = selectedTasks.length;
    selectedTasks.forEach((task) => {
      updateTaskMutation.mutate({ id: task.id, data: { status_id: statusId } });
    });
    clearSelection();
    dismiss();
    toast({ title: `Updated status for ${count} tasks` });
  }, [selectedTasks, updateTaskMutation, toast, dismiss, clearSelection]);

  const handleBulkPriority = useCallback(() => {
    if (!updateTaskMutation) return;
    const count = selectedTasks.length;
    const allPriority = selectedTasks.every((t) => t.is_priority);
    selectedTasks.forEach((task) => {
      updateTaskMutation.mutate({ id: task.id, data: { is_priority: !allPriority } });
    });
    clearSelection();
    dismiss();
    toast({ title: allPriority ? `Removed priority from ${count} tasks` : `Set priority on ${count} tasks` });
  }, [selectedTasks, updateTaskMutation, toast, dismiss, clearSelection]);

  const handleBulkMovePhase = useCallback((bucketId) => {
    if (!updateTaskMutation || selectedTasks.length === 0) return;
    const count = selectedTasks.length;
    selectedTasks.forEach((task) => {
      updateTaskMutation.mutate({ id: task.id, data: { kanban_bucket_id: bucketId || null } });
    });
    clearSelection();
    dismiss();
    toast({ title: bucketId ? `Moved ${count} tasks to new phase` : `Moved ${count} tasks to General / No Phase` });
  }, [selectedTasks, updateTaskMutation, toast, dismiss, clearSelection]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedTasks.length === 0) return;
    const count = selectedTasks.length;
    await Promise.all(selectedTasks.map(t => base44.entities.Task.delete(t.id)));
    clearSelection();
    dismiss();
    queryClient.invalidateQueries({ queryKey: ['allTasks'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    toast({ title: `Deleted ${count} task${count !== 1 ? 's' : ''}` });
  }, [selectedTasks, clearSelection, dismiss, queryClient, toast]);

  const handleBulkPrint = useCallback(() => {
    if (selectedTasks.length === 0) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "Print window blocked", description: "Please allow popups.", variant: "destructive" });
      return;
    }
    // Build print data from selected tasks only, grouped by project
    const groupedByProject = new Map();
    selectedTasks.forEach((t) => {
      const pid = t.project_id || "__no_project__";
      if (!groupedByProject.has(pid)) groupedByProject.set(pid, []);
      groupedByProject.get(pid).push(t);
    });
    const groups = Array.from(groupedByProject.entries()).map(([pid, tks]) => ({
      projectId: pid,
      project: projectMap.get(pid) || null,
      label: projectMap.get(pid)?.name || "No Project",
      tasks: tks,
    }));
    const printData = {
      selectedSections: ["selected"],
      sectionGroups: { selected: groups },
      fields: { showAssignee: true, showDueDate: true, showEstimate: true, showActualBlank: true, showNotesLine: true, showStatus: true, showPriority: true, showBlocked: true, showCompletionMarks: true },
      weekLabel: `Week of ${format(selectedWeek.start, "MMMM d")}–${format(selectedWeek.end, "d, yyyy")}`,
      teamMembers: teamMembers.map((tm) => ({ id: tm.id, full_name: tm.full_name })),
      statuses: statuses.map((s) => ({ id: s.id, label: s.label, color: s.color, scope: s.scope })),
      blockedTaskIds: Array.from(blockedSet),
      blockingLabels,
      checklistsByTaskId,
      bucketsByProjectId,
      activeFilters: [`${selectedTasks.length} selected tasks`],
    };
    const html = buildWorkloadPrintHTML(printData);
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }, [selectedTasks, projectMap, selectedWeek, teamMembers, statuses, blockedSet, toast]);

  // ── Print handler — direct document.write into a new window ──
  const handlePrint = useCallback(({ sections: selectedSections, fields }) => {
    // 1. Open window SYNCHRONOUSLY inside the click event to avoid popup blockers.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        title: "Print window blocked",
        description: "Your browser blocked the print window. Please allow popups for this app and try again.",
        variant: "destructive",
      });
      return;
    }

    // 2. Build the print data from the current derived state.
    const printSectionGroups = {};
    let totalTasks = 0;
    selectedSections.forEach((secKey) => {
      const groups = sectionGroups[secKey] || [];
      printSectionGroups[secKey] = groups.map((g) => {
        const filtered = fields.showCompleted
          ? g.tasks
          : g.tasks.filter((t) => t.status_id !== DONE_STATUS_ID);
        totalTasks += filtered.length;
        return {
          projectId: g.projectId,
          project: g.project,
          label: g.label,
          tasks: filtered,
        };
      });
    });

    // 3. Validate — if no tasks match, close the blank window and inform the user.
    if (totalTasks === 0) {
      printWindow.close();
      toast({
        title: "Nothing to print",
        description: "No workload tasks match the selected print options.",
      });
      return;
    }

    const weekLabel = `Week of ${format(selectedWeek.start, "MMMM d")}–${format(selectedWeek.end, "d, yyyy")}`;

    const printData = {
      selectedSections,
      sectionGroups: printSectionGroups,
      fields,
      weekLabel,
      teamMembers: teamMembers.map((tm) => ({ id: tm.id, full_name: tm.full_name })),
      statuses: statuses.map((s) => ({ id: s.id, label: s.label, color: s.color, scope: s.scope })),
      blockedTaskIds: Array.from(blockedSet),
      blockingLabels,
      checklistsByTaskId,
      bucketsByProjectId,
      activeFilters: [],
    };

    // 4. Generate HTML and write to the print window.
    const html = buildWorkloadPrintHTML(printData);
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }, [sectionGroups, selectedWeek, teamMembers, statuses, blockedSet]);

  return (
    <div className="space-y-2">
      {/* ── Toolbar — STICKY ── */}
      <div className="sticky top-0 z-20 bg-gray-900/95 backdrop-blur-sm -mx-3 md:-mx-6 px-3 md:px-6 py-2 border-b border-gray-800/50">
        <div className="flex items-center justify-between gap-2">
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
            <span className="text-xs text-gray-400 ml-1 hidden sm:inline">
              {format(selectedWeek.start, "MMM d")} – {format(selectedWeek.end, "MMM d, yyyy")}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrintModalOpen(true)}
              className="border-gray-700 text-white hover:bg-gray-800 h-7 px-2 text-xs"
            >
              <Printer className="w-3 h-3 mr-1" />
              Print
            </Button>
            <Button
              variant={showChecklists ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setShowChecklists(v => {
                  if (v) setShowCompletedChecklist(false); // reset review mode when turning off
                  return !v;
                });
              }}
              className={cn(
                "h-7 px-2 text-xs",
                showChecklists
                  ? "bg-emerald-700 hover:bg-emerald-800 text-white"
                  : "border-gray-700 text-white hover:bg-gray-800"
              )}
              title="Toggle inline checklists"
            >
              <ListChecks className="w-3 h-3 mr-1" />
              Checklists
            </Button>
            {showChecklists && (
              <Button
                variant={showCompletedChecklist ? "default" : "outline"}
                size="sm"
                onClick={() => setShowCompletedChecklist(v => !v)}
                className={cn(
                  "h-7 px-2 text-xs",
                  showCompletedChecklist
                    ? "bg-gray-600 hover:bg-gray-700 text-white"
                    : "border-gray-700 text-white hover:bg-gray-800"
                )}
                title="Show completed checklist items"
              >
                <Eye className="w-3 h-3 mr-1" />
                Done
              </Button>
            )}
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              onClick={() => { if (editMode) clearSelection(); else setEditMode(true); }}
              className={cn(
                "h-7 px-2 text-xs",
                editMode
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "border-gray-700 text-white hover:bg-gray-800"
              )}
            >
              {editMode ? <><X className="w-3 h-3 mr-1" />Exit Edit</> : <><Pencil className="w-3 h-3 mr-1" />Edit</>}
            </Button>
          </div>
        </div>

        {/* Jump pills */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {[
            { key: "overdue", label: "Overdue", count: stats.overdue, color: "text-red-400 border-red-600/40" },
            { key: "dueThisWeek", label: "This Week", count: stats.dueThisWeek, color: "text-blue-400 border-blue-600/40" },
            { key: "upcoming", label: "Upcoming", count: stats.upcoming, color: "text-purple-400 border-purple-600/40" },
            { key: "unscheduled", label: "Unscheduled", count: stats.unscheduled, color: "text-amber-400 border-amber-600/40" },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => scrollToSection(p.key)}
              className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors hover:brightness-125 tabular-nums", p.color)}
            >
              {p.label} {p.count}
            </button>
          ))}
        </div>
      </div>

      {/* ── Weekly Hours Summary — consumes canonical rollup, no recalculation ── */}
      <WeeklyHoursSummary
        rollup={weekRollup}
        overdueRollup={overdueRollup}
        weekLabel={`${format(selectedWeek.start, "MMM d")} – ${format(selectedWeek.end, "MMM d")}`}
      />

      {/* ── Per-section rollups for project/phase headers ── */}
      {/* Each section builds its own rollup so project & phase totals are section-scoped */}

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
                    projectTypeMap={projectTypeMap}
                    teamMemberMap={teamMemberMap}
                    statusMap={statusMap}
                    blockedSet={blockedSet}
                    blockingLabels={blockingLabels}
                    buckets={bucketsByProjectId[g.projectId] || []}
                    defaultExpanded={sec.defaultExpanded}
                    teamMembers={teamMembers}
                    statuses={statuses}
                    onToggleComplete={onToggleComplete}
                    onTaskClick={onTaskClick}
                    onAddTask={setCreateTaskForProjectId}
                    onUpdateDueDate={onUpdateDueDate}
                    onTogglePriority={onTogglePriority}
                    updateTaskMutation={updateTaskMutation}
                    selectedTaskIds={selectedTaskIds}
                    onToggleTaskSelection={editMode ? toggleTaskSelection : null}
                    onSelectProjectTasks={editMode ? selectProjectTasks : null}
                    allTasks={allTasks.length > 0 ? allTasks : tasks}
                    checklistsByTaskId={checklistsByTaskId}
                    weekLabel={`Week of ${format(selectedWeek.start, "MMMM d")}–${format(selectedWeek.end, "d, yyyy")}`}
                    editMode={editMode}
                    showChecklists={showChecklists}
                    showCompletedChecklist={showCompletedChecklist}
                    onToggleChecklistItem={handleToggleChecklistItem}
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

      {/* ── Bulk Action Bar ── */}
      <WorkloadBulkActionBar
        selectedCount={selectedTaskIds.size}
        onClear={clearSelection}
        onSetDueDate={handleBulkSetDueDate}
        onShiftDates={handleBulkShiftDates}
        onAssign={handleBulkAssign}
        onSetStatus={handleBulkStatus}
        onTogglePriority={handleBulkPriority}
        onPrintSelected={handleBulkPrint}
        onMovePhase={handleBulkMovePhase}
        onBulkDelete={handleBulkDelete}
        teamMembers={teamMembers}
        statuses={statuses}
        buckets={allBuckets}
        selectedTasks={selectedTasks}
      />

      <WorkloadPrintOptionsModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        onPrint={handlePrint}
        sectionCounts={{
          dueThisWeek: buckets.dueThisWeek.length,
          overdue: buckets.overdue.length,
          upcoming: buckets.upcoming.length,
          unscheduled: buckets.unscheduled.length,
        }}
      />
    </div>
  );
}