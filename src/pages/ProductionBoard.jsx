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
import ProjectBriefingCard from "@/components/production/ProjectBriefingCard";
import MeetingSectionHeader from "@/components/production/MeetingSectionHeader";
import { deriveAttentionStatus, getAttentionSortPriority } from "@/components/production/deriveAttentionStatus";
import { deriveCurrentIssue } from "@/components/production/deriveCurrentIssue";
import { classifyMeetingSection, getDiscussionSortPriority } from "@/components/production/deriveMeetingSection";
import { deriveMomentum } from "@/components/production/ProjectMomentum";
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
  const { data: meetingNotes = [] } = useQuery({
    queryKey: ["meetingNotes"],
    queryFn: () => base44.entities.MeetingNote.list("-created_date", 500),
    staleTime: 30000,
  });

  const updateTaskMutation = useMemo(() => ({
    mutate: ({ id, data }) => {
      base44.entities.Task.update(id, data).then(() => {
        queryClient.invalidateQueries({ queryKey: ["allTasks"] });
      });
    },
  }), [queryClient]);

  // ── Derived maps ──
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

  const notesByProject = useMemo(() => {
    const m = new Map();
    meetingNotes.forEach(n => {
      if (!m.has(n.project_id)) m.set(n.project_id, []);
      m.get(n.project_id).push(n);
    });
    return m;
  }, [meetingNotes]);

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

  // All tasks by project (including completed — for momentum)
  const allTasksByProject = useMemo(() => {
    const m = new Map();
    allTasks.forEach(t => {
      if (!t.project_id) return;
      if (!m.has(t.project_id)) m.set(t.project_id, []);
      m.get(t.project_id).push(t);
    });
    return m;
  }, [allTasks]);

  // ── Week boundaries ──
  const now = new Date();
  const weekStart = startOfWeek(addWeeks(now, weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(now, weekOffset), { weekStartsOn: 1 });

  // ── Active tasks with checklist data ──
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

  // ── Build project groups ──
  const projectGroups = useMemo(() => {
    const byProject = new Map();
    filteredTasks.forEach(task => {
      const pid = task.project_id;
      if (!pid) return;
      if (!byProject.has(pid)) byProject.set(pid, []);
      byProject.get(pid).push(task);
    });

    // Also include projects with no active tasks but with meeting notes
    projects.forEach(p => {
      if (!byProject.has(p.id) && !searchValue.trim()) {
        // Only include if they have open meeting notes
        const notes = notesByProject.get(p.id) || [];
        if (notes.some(n => !n.is_resolved)) {
          byProject.set(p.id, []);
        }
      }
    });

    return Array.from(byProject.entries())
      .map(([pid, tasks]) => {
        const project = projectMap.get(pid);
        if (!project) return null;
        const milestones = milestonesByProject.get(pid) || [];
        const fb = feedbackByProject.get(pid) || [];
        const attention = deriveAttentionStatus(project, tasks, milestones);
        const currentIssue = deriveCurrentIssue(project, tasks, fb);
        const allProjTasks = allTasksByProject.get(pid) || [];
        const momentum = deriveMomentum(project, allProjTasks);
        return {
          projectId: pid,
          project,
          tasks,
          phases: phasesByProject.get(pid) || [],
          milestones,
          attention,
          feedbackRequests: fb,
          currentIssue,
          meetingNotes: notesByProject.get(pid) || [],
          momentum,
          allProjectTasks: allProjTasks,
        };
      })
      .filter(Boolean);
  }, [filteredTasks, projectMap, phasesByProject, milestonesByProject, feedbackByProject, notesByProject, allTasksByProject, projects, searchValue]);

  // ── Classify into meeting sections ──
  const sections = useMemo(() => {
    const discussion = [];
    const active = [];
    const lowPriority = [];

    projectGroups.forEach(g => {
      const section = classifyMeetingSection(g);
      if (section === "DISCUSSION") discussion.push(g);
      else if (section === "ACTIVE") active.push(g);
      else lowPriority.push(g);
    });

    // Sort DISCUSSION by urgency
    discussion.sort((a, b) => {
      const aPri = getDiscussionSortPriority(a);
      const bPri = getDiscussionSortPriority(b);
      if (aPri !== bPri) return aPri - bPri;
      // Secondary: idle projects first (no activity = more urgent to discuss)
      const aDays = a.momentum?.daysSinceActivity ?? 999;
      const bDays = b.momentum?.daysSinceActivity ?? 999;
      if (aDays !== bDays) return bDays - aDays;
      return (a.project.name || "").localeCompare(b.project.name || "");
    });

    // Sort ACTIVE by progress
    active.sort((a, b) => {
      const aWh = a.project?.workflow_health || {};
      const bWh = b.project?.workflow_health || {};
      const aTotal = (aWh.tasks_completed || 0) + (aWh.tasks_ready || 0) + (aWh.tasks_in_progress || 0) + (aWh.tasks_blocked || 0) + (aWh.tasks_waiting || 0);
      const bTotal = (bWh.tasks_completed || 0) + (bWh.tasks_ready || 0) + (bWh.tasks_in_progress || 0) + (bWh.tasks_blocked || 0) + (bWh.tasks_waiting || 0);
      const aPct = aTotal > 0 ? (aWh.tasks_completed || 0) / aTotal : 0;
      const bPct = bTotal > 0 ? (bWh.tasks_completed || 0) / bTotal : 0;
      return aPct - bPct; // least complete first
    });

    // Sort LOW_PRIORITY alphabetically
    lowPriority.sort((a, b) => (a.project.name || "").localeCompare(b.project.name || ""));

    return { discussion, active, lowPriority };
  }, [projectGroups]);

  // ── Agenda metrics ──
  const agendaMetrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEndDate = endOfWeek(now, { weekStartsOn: 1 });
    let overdueCount = 0;
    let waitingPartsProjects = new Set();
    let customerDecisionProjects = new Set();
    let vendorFollowUpProjects = new Set();
    let deliveriesThisWeek = new Set();
    let idleProjects = 0;

    activeTasks.forEach(t => {
      if (t.due_date) {
        const dueStr = t.due_date.length === 10 ? t.due_date + "T00:00:00" : t.due_date;
        const due = new Date(dueStr);
        if (!isNaN(due.getTime()) && due < today) overdueCount++;
      }
      const os = t.operational_state;
      if (os === "WAITING_ON_PARTS" && t.project_id) waitingPartsProjects.add(t.project_id);
      if (os === "WAITING_ON_CUSTOMER" && t.project_id) customerDecisionProjects.add(t.project_id);
      if (os === "WAITING_ON_VENDOR" && t.project_id) vendorFollowUpProjects.add(t.project_id);
    });

    projects.forEach(p => {
      if (p.target_completion) {
        const target = new Date(p.target_completion + "T00:00:00");
        if (!isNaN(target.getTime())) {
          const daysLeft = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
          if (daysLeft >= 0 && daysLeft <= 7) deliveriesThisWeek.add(p.id);
        }
      }
    });

    idleProjects = sections.lowPriority.filter(g => (g.momentum?.daysSinceActivity ?? 0) > 7).length;

    return {
      discussionCount: sections.discussion.length,
      waitingPartsCount: waitingPartsProjects.size,
      customerDecisionCount: customerDecisionProjects.size,
      vendorFollowUpCount: vendorFollowUpProjects.size,
      deliveriesThisWeekCount: deliveriesThisWeek.size,
      idleProjectCount: idleProjects,
      overdueCount,
    };
  }, [activeTasks, projects, sections]);

  // ── Shared context ──
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

  const todayStr = format(new Date(), "EEEE, MMMM d");
  const totalProjects = sections.discussion.length + sections.active.length + sections.lowPriority.length;

  const renderSection = (sectionKey, groups) => {
    if (groups.length === 0) return null;
    return (
      <div key={sectionKey}>
        <MeetingSectionHeader section={sectionKey} count={groups.length} />
        <div className="space-y-2 mt-2">
          {groups.map(group => (
            <ProjectBriefingCard
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
              currentIssue={group.currentIssue}
              meetingNotes={group.meetingNotes}
              momentum={group.momentum}
              allProjectTasks={group.allProjectTasks}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-3">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center bg-purple-600/20 rounded-lg border-2 border-purple-600 w-10 h-10">
              <Factory className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">PRODUCTION REVIEW</h1>
              <p className="text-xs text-gray-500">{todayStr} · {totalProjects} projects</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 mr-2">
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-400 h-6 text-[10px] px-2" onClick={() => setWeekOffset(o => o - 1)}>←</Button>
              <Button
                variant={weekOffset === 0 ? "default" : "outline"}
                size="sm"
                className={cn("h-6 text-[10px] px-2", weekOffset === 0 ? "bg-red-600 text-white hover:bg-red-700" : "border-gray-700 text-gray-400")}
                onClick={() => setWeekOffset(0)}
              >This Week</Button>
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-400 h-6 text-[10px] px-2" onClick={() => setWeekOffset(o => o + 1)}>→</Button>
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

        {/* ── Meeting Agenda Metrics ── */}
        <ProductionCompactMetrics {...agendaMetrics} />

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

        {/* ── Meeting Flow: Discussion → Active → Low Priority ── */}
        <div className="space-y-2">
          {renderSection("DISCUSSION", sections.discussion)}
          {renderSection("ACTIVE", sections.active)}
          {renderSection("LOW_PRIORITY", sections.lowPriority)}
        </div>

        {totalProjects === 0 && (
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