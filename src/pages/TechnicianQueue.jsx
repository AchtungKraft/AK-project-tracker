import React, { useState, useMemo, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Wrench, RefreshCw, Loader2, ChevronDown, ChevronRight, Flame,
  Clock, CheckCircle2, AlertTriangle, Ban, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay, isBefore } from "date-fns";
import { Link } from "react-router-dom";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import TaskDetailDrawer from "@/components/tasks/TaskDetailDrawer";
import { useTaskData } from "@/components/tasks/useTaskData";
import CompleteTaskConfirm from "@/components/tasks/CompleteTaskConfirm";
import UninstalledPartsWarning from "@/components/tasks/UninstalledPartsWarning";
import TaskCompletionModal from "@/components/tasks/TaskCompletionModal";
import { BLOCKER_TYPE_LABELS } from "@/components/workload/workloadConfig";
import { sortTasksByPriority } from "@/utils/taskPrioritySort";

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function TechTaskRow({ task, project, status, onTaskClick, onToggleComplete }) {
  const due = parseLocalDate(task.due_date);
  const today = startOfDay(new Date());
  const isOverdue = due && isBefore(due, today);
  const blockers = task.blocking_reasons || [];
  const opState = task.operational_state;

  const stateStyles = {
    READY: "bg-green-900/20 text-green-400 border-green-600/30",
    IN_PROGRESS: "bg-amber-900/20 text-amber-400 border-amber-600/30",
    BLOCKED: "bg-red-900/20 text-red-400 border-red-600/30",
    WAITING_ON_PARTS: "bg-orange-900/20 text-orange-300 border-orange-600/30",
    WAITING_ON_VENDOR: "bg-purple-900/20 text-purple-300 border-purple-600/30",
    WAITING_ON_CUSTOMER: "bg-blue-900/20 text-blue-300 border-blue-600/30",
    REVIEW_REQUIRED: "bg-violet-900/20 text-violet-300 border-violet-600/30",
  };

  const stateLabels = {
    READY: "Ready",
    IN_PROGRESS: "In Progress",
    BLOCKED: "Blocked",
    WAITING_ON_PARTS: "Parts",
    WAITING_ON_VENDOR: "Vendor",
    WAITING_ON_CUSTOMER: "Customer",
    REVIEW_REQUIRED: "Review",
  };

  return (
    <div
      className={cn(
        "bg-gray-800/30 rounded-lg border p-3 cursor-pointer hover:bg-gray-800/50 transition-colors",
        opState === "BLOCKED" ? "border-red-700/30" :
        opState === "IN_PROGRESS" ? "border-amber-700/30" :
        opState === "READY" ? "border-green-700/30" : "border-gray-700/30"
      )}
      onClick={() => onTaskClick(task)}
    >
      <div className="flex items-center gap-2">
        {/* Complete button */}
        <button
          onClick={e => { e.stopPropagation(); onToggleComplete(task); }}
          className="text-gray-600 hover:text-green-400 shrink-0"
        >
          <CheckCircle2 className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {task.is_priority && <Flame className="w-3.5 h-3.5 text-red-500 shrink-0" />}
            <span className="text-sm font-medium text-white truncate">{task.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {project && (
              <Link
                to={buildProjectDetailUrl(project.id, { source: SOURCES.PRIORITIES })}
                className="text-[11px] text-gray-400 hover:text-red-400 hover:underline truncate max-w-[160px]"
                onClick={e => e.stopPropagation()}
              >
                {project.name}
              </Link>
            )}
            {status && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: status.color, color: status.color }}>
                {status.label}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {opState && stateLabels[opState] && (
            <Badge className={cn("text-[10px] px-1.5 py-0 border", stateStyles[opState] || "bg-gray-800 text-gray-400 border-gray-700")}>
              {stateLabels[opState]}
            </Badge>
          )}
          {due && (
            <span className={cn("text-[11px] tabular-nums", isOverdue ? "text-red-400 font-semibold" : "text-gray-500")}>
              {format(due, "M/d")}
            </span>
          )}
          {task.estimated_hours > 0 && (
            <span className="text-[10px] text-gray-600 tabular-nums flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />{Math.round(task.estimated_hours * 10) / 10}h
            </span>
          )}
        </div>
      </div>

      {/* Blockers */}
      {blockers.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-400">
          <Ban className="w-3 h-3 shrink-0" />
          <span className="truncate">{blockers.map(b => b.label || BLOCKER_TYPE_LABELS[b.type] || b.type).join(", ")}</span>
        </div>
      )}
    </div>
  );
}

function TechProjectGroup({ projectId, project, tasks, onTaskClick, onToggleComplete, statuses }) {
  const [expanded, setExpanded] = useState(true);
  const statusMap = useMemo(() => {
    const m = new Map();
    statuses.forEach(s => m.set(s.id, s));
    return m;
  }, [statuses]);

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 w-full text-left px-1 py-1 hover:bg-gray-800/20 rounded transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        }
        <span className="text-xs font-semibold text-gray-300 truncate">{project?.name || "Unassigned"}</span>
        <Badge className="bg-gray-800 text-gray-400 text-[10px] px-1.5 py-0 ml-auto">{tasks.length}</Badge>
      </button>
      {expanded && (
        <div className="space-y-1.5 pl-1">
          {tasks.map(task => (
            <TechTaskRow
              key={task.id}
              task={task}
              project={project}
              status={statusMap.get(task.status_id)}
              onTaskClick={onTaskClick}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TechnicianQueue() {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTech, setSelectedTech] = useState("__auto__");
  const [currentUserId, setCurrentUserId] = useState(null);

  const {
    handleToggleComplete,
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

  useEffect(() => {
    base44.auth.me().then(u => setCurrentUserId(u?.id)).catch(() => {});
  }, []);

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ["allTasks"],
    queryFn: () => base44.entities.Task.list('-created_date', 500),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list('-created_date', 200),
  });
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["teamMembers"],
    queryFn: () => base44.entities.TeamMember.list(),
  });
  const { data: statuses = [] } = useQuery({
    queryKey: ["statuses"],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const projectMap = useMemo(() => {
    const m = new Map();
    projects.forEach(p => m.set(p.id, p));
    return m;
  }, [projects]);

  const activeTeam = useMemo(() => (teamMembers || []).filter(tm => tm.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [teamMembers]);

  // Auto-detect current user's team member
  const currentTeamMemberId = useMemo(() => {
    if (!currentUserId) return null;
    const tm = teamMembers.find(m => m.user_id === currentUserId);
    return tm?.id || null;
  }, [currentUserId, teamMembers]);

  const effectiveTechId = selectedTech === "__auto__" ? currentTeamMemberId : selectedTech === "__all__" ? null : selectedTech;

  const completedStatusId = useMemo(() => {
    const s = statuses.find(s => s.scope === "Task" && s.active && /complete|done/i.test(s.label));
    return s?.id;
  }, [statuses]);

  // Filter to this technician's assigned, non-completed tasks
  const techTasks = useMemo(() => {
    return sortTasksByPriority(
      allTasks.filter(t => {
        if (t.operational_state === "COMPLETED" || t.status_id === completedStatusId) return false;
        if (effectiveTechId && t.assigned_team_member_id !== effectiveTechId) return false;
        return true;
      })
    );
  }, [allTasks, completedStatusId, effectiveTechId]);

  // Group: operational bucket → project → tasks
  const sections = useMemo(() => {
    const buckets = {
      IN_PROGRESS: { label: "Working On", icon: "🔧", color: "border-amber-600/50", tasks: [] },
      READY: { label: "Ready to Start", icon: "✅", color: "border-green-600/50", tasks: [] },
      BLOCKED: { label: "Blocked", icon: "🚫", color: "border-red-600/50", tasks: [] },
      WAITING: { label: "Waiting", icon: "⏳", color: "border-orange-600/50", tasks: [] },
      OTHER: { label: "Other", icon: "📋", color: "border-gray-600/50", tasks: [] },
    };

    techTasks.forEach(t => {
      const op = t.operational_state;
      if (op === "IN_PROGRESS") buckets.IN_PROGRESS.tasks.push(t);
      else if (op === "READY") buckets.READY.tasks.push(t);
      else if (op === "BLOCKED") buckets.BLOCKED.tasks.push(t);
      else if (["WAITING_ON_PARTS", "WAITING_ON_VENDOR", "WAITING_ON_CUSTOMER", "REVIEW_REQUIRED"].includes(op)) buckets.WAITING.tasks.push(t);
      else buckets.OTHER.tasks.push(t);
    });

    return Object.entries(buckets)
      .filter(([, b]) => b.tasks.length > 0)
      .map(([key, b]) => {
        // Group by project within bucket
        const byProject = new Map();
        b.tasks.forEach(t => {
          const pid = t.project_id || "__none__";
          if (!byProject.has(pid)) byProject.set(pid, []);
          byProject.get(pid).push(t);
        });
        const projectGroups = Array.from(byProject.entries())
          .sort((a, b) => {
            const pA = projectMap.get(a[0]);
            const pB = projectMap.get(b[0]);
            return (pA?.name || "").localeCompare(pB?.name || "");
          });
        return { key, ...b, projectGroups };
      });
  }, [techTasks, projectMap]);

  const selectedTechName = useMemo(() => {
    if (selectedTech === "__auto__") {
      const tm = teamMembers.find(m => m.id === currentTeamMemberId);
      return tm?.full_name || "My Queue";
    }
    if (selectedTech === "__all__") return "All Technicians";
    const tm = teamMembers.find(m => m.id === selectedTech);
    return tm?.full_name || "Queue";
  }, [selectedTech, currentTeamMemberId, teamMembers]);

  if (isLoading) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <>
      <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center bg-emerald-600/20 rounded-lg border-2 border-emerald-600 w-10 h-10 md:w-12 md:h-12">
              <Wrench className="w-5 h-5 md:w-6 md:h-6 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-white">TECHNICIAN QUEUE</h1>
              <p className="text-xs md:text-sm text-gray-400">
                {selectedTechName} · {techTasks.length} tasks
              </p>
            </div>
          </div>
          <Button
            onClick={async () => {
              setIsRefreshing(true);
              await queryClient.invalidateQueries();
              setIsRefreshing(false);
            }}
            variant="outline"
            className="border-gray-700 text-white gap-2"
            size="sm"
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>

        {/* Technician selector */}
        <Select value={selectedTech} onValueChange={setSelectedTech}>
          <SelectTrigger className="w-56 bg-gray-900/50 border-gray-700 text-white h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto__">My Queue</SelectItem>
            <SelectItem value="__all__">All Technicians</SelectItem>
            {activeTeam.map(tm => (
              <SelectItem key={tm.id} value={tm.id}>{tm.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Task buckets */}
        {sections.map(section => (
          <div key={section.key} className={cn("bg-black/30 backdrop-blur-xl border rounded-lg overflow-hidden", section.color)}>
            <div className="px-4 py-2.5 border-b border-gray-800/30 flex items-center gap-2">
              <span className="text-base">{section.icon}</span>
              <span className="text-sm font-bold text-white">{section.label}</span>
              <Badge className="bg-gray-800 text-gray-300 text-[10px] px-1.5 py-0">
                {section.tasks.length}
              </Badge>
            </div>
            <div className="p-3 space-y-3">
              {section.projectGroups.map(([pid, tasks]) => (
                <TechProjectGroup
                  key={pid}
                  projectId={pid}
                  project={projectMap.get(pid)}
                  tasks={tasks}
                  onTaskClick={setSelectedTask}
                  onToggleComplete={handleToggleComplete}
                  statuses={statuses}
                />
              ))}
            </div>
          </div>
        ))}

        {techTasks.length === 0 && (
          <div className="text-center py-16">
            <Wrench className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-400">Queue Empty</h3>
            <p className="text-sm text-gray-600 mt-1">
              {effectiveTechId ? "No assigned tasks right now." : "Select a technician to see their queue."}
            </p>
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          projectId={selectedTask.project_id}
          onClose={() => setSelectedTask(null)}
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