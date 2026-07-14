import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Factory, RefreshCw, Loader2, Search, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { startOfWeek, endOfWeek, addWeeks, format } from "date-fns";

import ProductionCompactMetrics from "@/components/production/ProductionCompactMetrics";
import ProjectReviewCard from "@/components/production/ProjectReviewCard";
import { deriveAttentionStatus, getAttentionSortPriority } from "@/components/production/deriveAttentionStatus";
import TaskDetailDrawer from "@/components/tasks/TaskDetailDrawer";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import { useTaskData } from "@/components/tasks/useTaskData";
import CompleteTaskConfirm from "@/components/tasks/CompleteTaskConfirm";
import UninstalledPartsWarning from "@/components/tasks/UninstalledPartsWarning";
import TaskCompletionModal from "@/components/tasks/TaskCompletionModal";

export default function ProductionBoard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTask, setSelectedTask] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [createTaskForProjectId, setCreateTaskForProjectId] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const {
    handleToggleComplete,
    handleUpdateDueDate,
    handleTogglePriority,
    isUpdating,
    pendingChecklistCompletion,
    confirmChecklistCompletion,
    cancelChecklistCompletion,
    pendingUninstalledPartsCompletion,
    confirmUninstalledPartsCompletion,
    cancelUninstalledPartsCompletion,
    pendingTimeCompletion,
    confirmTimeCompletion,
    cancelTimeCompletion,
  } = useTaskData({});

  // ── Data queries ──
  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ["allTasks"],
    queryFn: () => base44.entities.Task.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["teamMembers"],
    queryFn: () => base44.entities.TeamMember.list(),
  });
  const { data: statuses = [] } = useQuery({
    queryKey: ["statuses"],
    queryFn: () => base44.entities.StatusList.list(),
  });
  const { data: allPhases = [] } = useQuery({
    queryKey: ["allPhases"],
    queryFn: () => base44.entities.ProjectKanbanBucket.list(),
    staleTime: 60000,
  });
  const { data: allMilestones = [] } = useQuery({
    queryKey: ["allMilestones"],
    queryFn: () => base44.entities.ProjectMilestone.list(),
    staleTime: 60000,
  });
  const { data: checklistItems = [] } = useQuery({
    queryKey: ["allChecklistItems"],
    queryFn: () => base44.entities.TaskChecklistItem.list(),
    staleTime: 30000,
  });
  const { data: feedbackRequests = [] } = useQuery({
    queryKey: ["allFeedbackRequests"],
    queryFn: () => base44.entities.ClientFeedbackRequest.list(),
    staleTime: 60000,
  });

  const updateTaskMutation = useMemo(() => ({
    mutate: ({ id, data }) => {
      base44.entities.Task.update(id, data).then(() => {
        queryClient.invalidateQueries({ queryKey: ["allTasks"] });
      });
    },
  }), [queryClient]);

  // ── Derived data ──
  const completedStatusId = useMemo(() => {
    const s = statuses.find(s => s.scope === "Task" && s.active && /complete|done/i.test(s.label));
    return s?.id;
  }, [statuses]);

  const projectMap = useMemo(() => {
    const m = new Map();
    projects.forEach(p => m.set(p.id, p));
    return m;
  }, [projects]);

  const teamMemberMap = useMemo(() => {
    const m = new Map();
    teamMembers.forEach(tm => m.set(tm.id, tm));
    return m;
  }, [teamMembers]);

  const statusMap = useMemo(() => {
    const m = new Map();
    statuses.forEach(s => m.set(s.id, s));
    return m;
  }, [statuses]);

  const phasesByProject = useMemo(() => {
    const m = new Map();
    allPhases.forEach(p => {
      if (!m.has(p.project_id)) m.set(p.project_id, []);
      m.get(p.project_id).push(p);
    });
    m.forEach(arr => arr.sort((a, b) => (a.order || 0) - (b.order || 0)));
    return m;
  }, [allPhases]);

  const milestonesByProject = useMemo(() => {
    const m = new Map();
    allMilestones.forEach(ms => {
      if (!m.has(ms.project_id)) m.set(ms.project_id, []);
      m.get(ms.project_id).push(ms);
    });
    return m;
  }, [allMilestones]);

  const feedbackByProject = useMemo(() => {
    const m = new Map();
    feedbackRequests.forEach(fr => {
      if (!m.has(fr.project_id)) m.set(fr.project_id, []);
      m.get(fr.project_id).push(fr);
    });
    return m;
  }, [feedbackRequests]);

  const checklistByTask = useMemo(() => {
    const m = new Map();
    checklistItems.forEach(ci => {
      if (!m.has(ci.task_id)) m.set(ci.task_id, { total: 0, done: 0 });
      const entry = m.get(ci.task_id);
      entry.total++;
      if (ci.is_completed) entry.done++;
    });
    return m;
  }, [checklistItems]);

  // ── Week boundaries ──
  const now = new Date();
  const weekStart = startOfWeek(addWeeks(now, weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(now, weekOffset), { weekStartsOn: 1 });

  // ── Active (non-completed) tasks with checklist data injected ──
  const activeTasks = useMemo(() => {
    return allTasks
      .filter(t => t.operational_state !== "COMPLETED" && t.status_id !== completedStatusId)
      .map(t => {
        const cl = checklistByTask.get(t.id);
        return cl ? { ...t, _checklistTotal: cl.total, _checklistDone: cl.done } : t;
      });
  }, [allTasks, completedStatusId, checklistByTask]);

  // ── Search filter ──
  const filteredTasks = useMemo(() => {
    if (!searchValue.trim()) return activeTasks;
    const q = searchValue.toLowerCase();
    return activeTasks.filter(t => {
      if ((t.name || "").toLowerCase().includes(q)) return true;
      const proj = projectMap.get(t.project_id);
      if (proj && (proj.name || "").toLowerCase().includes(q)) return true;
      return false;
    });
  }, [activeTasks, searchValue, projectMap]);

  // ── Build project groups with attention status ──
  const projectGroups = useMemo(() => {
    const byProject = new Map();
    filteredTasks.forEach(task => {
      const pid = task.project_id;
      if (!pid) return;
      if (!byProject.has(pid)) byProject.set(pid, []);
      byProject.get(pid).push(task);
    });

    return Array.from(byProject.entries())
      .map(([pid, tasks]) => {
        const project = projectMap.get(pid);
        const milestones = milestonesByProject.get(pid) || [];
        const attention = deriveAttentionStatus(project, tasks, milestones);
        return {
          projectId: pid,
          project,
          tasks,
          phases: phasesByProject.get(pid) || [],
          milestones,
          attention,
          feedbackRequests: feedbackByProject.get(pid) || [],
        };
      })
      .filter(g => g.project)
      // Sort by attention priority — meeting starts with projects needing decisions
      .sort((a, b) => {
        const aPri = getAttentionSortPriority(a.attention.status);
        const bPri = getAttentionSortPriority(b.attention.status);
        if (aPri !== bPri) return aPri - bPri;
        // Secondary: overdue task count descending
        const aOverdue = a.tasks.filter(t => {
          if (!t.due_date) return false;
          const d = new Date(t.due_date + "T00:00:00");
          return d < new Date(new Date().setHours(0, 0, 0, 0));
        }).length;
        const bOverdue = b.tasks.filter(t => {
          if (!t.due_date) return false;
          const d = new Date(t.due_date + "T00:00:00");
          return d < new Date(new Date().setHours(0, 0, 0, 0));
        }).length;
        if (aOverdue !== bOverdue) return bOverdue - aOverdue;
        return (a.project.name || "").localeCompare(b.project.name || "");
      });
  }, [filteredTasks, projectMap, phasesByProject, milestonesByProject, feedbackByProject]);

  // ── Shop-wide metrics ──
  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let overdueCount = 0;
    let thisWeekCount = 0;
    let blockedCount = 0;
    let totalHours = 0;

    activeTasks.forEach(t => {
      if (t.due_date) {
        const due = new Date(t.due_date + "T00:00:00");
        if (due < today) overdueCount++;
        else if (due <= weekEnd) thisWeekCount++;
      }
      const os = t.operational_state;
      if (["WAITING_ON_PARTS", "WAITING_ON_VENDOR", "WAITING_ON_CUSTOMER", "BLOCKED", "REVIEW_REQUIRED"].includes(os)) {
        blockedCount++;
      }
      totalHours += t.estimated_hours || 0;
    });

    const needsAttentionCount = projectGroups.filter(
      g => g.attention.status === "NEEDS_MANAGEMENT" || g.attention.status === "BLOCKED"
    ).length;

    return {
      projectCount: projectGroups.length,
      needsAttentionCount,
      overdueCount,
      thisWeekCount,
      blockedCount,
      totalHoursRemaining: totalHours,
    };
  }, [activeTasks, projectGroups, weekEnd]);

  // ── Shared context for task rows ──
  const shared = useMemo(() => ({
    teamMemberMap,
    statusMap,
    teamMembers,
    statuses,
    completedStatusId,
    onToggleComplete: handleToggleComplete,
    onTaskClick: setSelectedTask,
    onUpdateDueDate: handleUpdateDueDate,
    onTogglePriority: handleTogglePriority,
    updateTaskMutation,
    onAddTask: setCreateTaskForProjectId,
  }), [teamMemberMap, statusMap, teamMembers, statuses, completedStatusId, handleToggleComplete, handleUpdateDueDate, handleTogglePriority, updateTaskMutation]);

  if (isLoading) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  // Today's date for header
  const todayStr = format(new Date(), "EEEE, MMMM d");

  return (
    <>
      <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-3">
        {/* ── Header — Meeting agenda framing ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center bg-purple-600/20 rounded-lg border-2 border-purple-600 w-10 h-10">
              <Factory className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">PRODUCTION REVIEW</h1>
              <p className="text-xs text-gray-500">{todayStr}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Week navigation — compact */}
            <div className="flex items-center gap-1 mr-2">
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-400 h-6 text-[10px] px-2" onClick={() => setWeekOffset(o => o - 1)}>
                ←
              </Button>
              <Button
                variant={weekOffset === 0 ? "default" : "outline"}
                size="sm"
                className={cn("h-6 text-[10px] px-2", weekOffset === 0 ? "bg-red-600 text-white hover:bg-red-700" : "border-gray-700 text-gray-400")}
                onClick={() => setWeekOffset(0)}
              >
                This Week
              </Button>
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-400 h-6 text-[10px] px-2" onClick={() => setWeekOffset(o => o + 1)}>
                →
              </Button>
              <span className="text-[10px] text-gray-600 ml-1 hidden sm:inline">
                {format(weekStart, "MMM d")}–{format(weekEnd, "MMM d")}
              </span>
            </div>
            <Button
              onClick={async () => {
                setIsRefreshing(true);
                await queryClient.invalidateQueries();
                setIsRefreshing(false);
              }}
              variant="outline"
              className="border-gray-700 text-white h-7 text-xs gap-1"
              size="sm"
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ── Compact Metrics Bar ── */}
        <ProductionCompactMetrics {...metrics} />

        {/* ── Search ── */}
        <div className="relative max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <Input
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            placeholder="Search projects or tasks..."
            className="h-7 pl-7 pr-7 text-xs bg-gray-900/50 border-gray-700 text-white placeholder:text-gray-500"
          />
          {searchValue && (
            <button onClick={() => setSearchValue("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* ── Project Review Cards — The Meeting Agenda ── */}
        <div className="space-y-2">
          {projectGroups.map(group => (
            <ProjectReviewCard
              key={group.projectId}
              project={group.project}
              tasks={group.tasks}
              phases={group.phases}
              milestones={group.milestones}
              weekStart={weekStart}
              weekEnd={weekEnd}
              shared={shared}
              attention={group.attention}
              feedbackRequests={group.feedbackRequests}
            />
          ))}
        </div>

        {projectGroups.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            No active projects match the current filters.
          </div>
        )}
      </div>

      {/* ── Drawers & Modals ── */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          projectId={selectedTask.project_id}
          onClose={() => setSelectedTask(null)}
        />
      )}
      {createTaskForProjectId && (
        <CreateTaskModal
          projectId={createTaskForProjectId}
          onClose={() => setCreateTaskForProjectId(null)}
        />
      )}
      <CompleteTaskConfirm
        isOpen={!!pendingChecklistCompletion}
        onClose={cancelChecklistCompletion}
        onConfirm={confirmChecklistCompletion}
        taskName={pendingChecklistCompletion?.task?.name}
        incompleteChecklistCount={pendingChecklistCompletion?.incompleteCount || 0}
        isLoading={isUpdating}
      />
      <UninstalledPartsWarning
        isOpen={!!pendingUninstalledPartsCompletion}
        onClose={cancelUninstalledPartsCompletion}
        onConfirm={confirmUninstalledPartsCompletion}
        taskName={pendingUninstalledPartsCompletion?.task?.name}
        uninstalledCount={pendingUninstalledPartsCompletion?.uninstalledCount || 0}
        isLoading={isUpdating}
      />
      <TaskCompletionModal
        isOpen={!!pendingTimeCompletion}
        onClose={cancelTimeCompletion}
        onConfirm={confirmTimeCompletion}
        task={pendingTimeCompletion?.task}
        incompleteChecklistCount={pendingTimeCompletion?.incompleteChecklistCount || 0}
        isLoading={isUpdating}
      />
    </>
  );
}