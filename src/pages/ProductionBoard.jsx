import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Factory, RefreshCw, Loader2, Search, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import ProjectProductionCard from "@/components/workload/ProjectProductionCard";
import PhaseProductionLane from "@/components/workload/PhaseProductionLane";
import WorkloadTaskRow from "@/components/workload/WorkloadTaskRow";
import WorkflowHealthIndicator from "@/components/workload/WorkflowHealthIndicator";
import ShopBottleneckSummary from "@/components/workload/ShopBottleneckSummary";
import TaskDetailDrawer from "@/components/tasks/TaskDetailDrawer";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import useWorkloadData from "@/components/workload/useWorkloadData";
import { useTaskData } from "@/components/tasks/useTaskData";
import CompleteTaskConfirm from "@/components/tasks/CompleteTaskConfirm";
import UninstalledPartsWarning from "@/components/tasks/UninstalledPartsWarning";
import TaskCompletionModal from "@/components/tasks/TaskCompletionModal";

function ProjectCard({ group, shared, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);
  const INITIAL = 8;

  return (
    <div className="border-b border-gray-800/10 last:border-b-0">
      <ProjectProductionCard
        project={group.project}
        taskCount={group.tasks.length}
        expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
        onAddTask={shared.onAddTask}
        sectionTasks={group.tasks}
      />
      {expanded && (
        <div className="pb-1">
          {group.phaseGroups.map(pg => (
            <PhaseProductionLane
              key={pg.phase.id}
              phase={pg.phase}
              tasks={pg.tasks}
              shared={shared}
            />
          ))}
          {group.unphased.length > 0 && (
            <div className="ml-4 border-l-2 border-gray-700/20">
              <div className="px-3 py-1">
                <span className="text-[10px] text-gray-600 uppercase tracking-wide">No Phase</span>
              </div>
              {(showAll ? group.unphased : group.unphased.slice(0, INITIAL)).map(task => (
                <WorkloadTaskRow
                  key={task.id}
                  task={task}
                  assignee={shared.teamMemberMap.get(task.assigned_team_member_id)}
                  status={shared.statusMap.get(task.status_id)}
                  phaseName={null}
                  successorCount={shared.successorCounts[task.id] || 0}
                  teamMembers={shared.teamMembers}
                  statuses={shared.statuses}
                  onToggleComplete={shared.onToggleComplete}
                  onTaskClick={shared.onTaskClick}
                  onUpdateDueDate={shared.onUpdateDueDate}
                  onTogglePriority={shared.onTogglePriority}
                  updateTaskMutation={shared.updateTaskMutation}
                  showPhase
                  showOperationalState
                />
              ))}
              {!showAll && group.unphased.length > INITIAL && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full py-1 text-center text-[10px] text-gray-500 hover:text-white hover:bg-gray-800/40 transition-colors"
                >
                  Show {group.unphased.length - INITIAL} More
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductionBoard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTask, setSelectedTask] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [projectFilter, setProjectFilter] = useState("__all__");
  const [createTaskForProjectId, setCreateTaskForProjectId] = useState(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

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

  const updateTaskMutation = {
    mutate: ({ id, data }) => {
      base44.entities.Task.update(id, data).then(() => {
        queryClient.invalidateQueries({ queryKey: ["allTasks"] });
      });
    },
  };

  // Filter tasks — exclude completed
  const completedStatusId = useMemo(() => {
    const s = statuses.find(s => s.scope === "Task" && s.active && /complete|done/i.test(s.label));
    return s?.id;
  }, [statuses]);

  const activeTasks = useMemo(() => {
    return allTasks.filter(t => {
      if (t.operational_state === "COMPLETED" || t.status_id === completedStatusId) return false;
      if (projectFilter !== "__all__" && t.project_id !== projectFilter) return false;
      if (searchValue.trim()) {
        const q = searchValue.toLowerCase();
        if (!(t.name || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allTasks, completedStatusId, projectFilter, searchValue]);

  // Use the shared workload data hook for consistent project/phase grouping
  const { sections, stats, staleProjects, staleMissingSet, projectMap, phaseMap, teamMemberMap, statusMap, successorCounts } = useWorkloadData({
    tasks: activeTasks,
    allTasks,
    projects,
    phases: allPhases,
    teamMembers,
    statuses,
    dateFilter: "all",
    completedWindow: "7d",
  });

  // Build project-centric view: merge all section tasks back by project
  const projectGroups = useMemo(() => {
    const byProject = new Map();
    const phasesByProject = new Map();
    allPhases.forEach(p => {
      if (!phasesByProject.has(p.project_id)) phasesByProject.set(p.project_id, []);
      phasesByProject.get(p.project_id).push(p);
    });
    phasesByProject.forEach(arr => arr.sort((a, b) => (a.order || 0) - (b.order || 0)));

    activeTasks.forEach(task => {
      const pid = task.project_id || "__none__";
      if (!byProject.has(pid)) {
        byProject.set(pid, { project: projectMap.get(pid) || null, tasks: [] });
      }
      byProject.get(pid).tasks.push(task);
    });

    return Array.from(byProject.entries())
      .sort((a, b) => {
        if (a[0] === "__none__") return 1;
        if (b[0] === "__none__") return -1;
        return (a[1].project?.name || "").localeCompare(b[1].project?.name || "");
      })
      .map(([pid, g]) => {
        const byPhase = new Map();
        const noPhaseTasks = [];
        g.tasks.forEach(t => {
          if (t.kanban_bucket_id) {
            if (!byPhase.has(t.kanban_bucket_id)) byPhase.set(t.kanban_bucket_id, []);
            byPhase.get(t.kanban_bucket_id).push(t);
          } else {
            noPhaseTasks.push(t);
          }
        });
        const projPhases = phasesByProject.get(pid) || [];
        const phaseGroups = projPhases
          .filter(p => byPhase.has(p.id))
          .map(p => ({ phase: p, tasks: byPhase.get(p.id) }));

        return {
          projectId: pid,
          project: g.project,
          tasks: g.tasks,
          phaseGroups,
          unphased: noPhaseTasks,
        };
      });
  }, [activeTasks, projectMap, allPhases]);

  const shared = {
    teamMemberMap, statusMap, phaseMap, successorCounts,
    teamMembers, statuses,
    onToggleComplete: handleToggleComplete,
    onTaskClick: setSelectedTask,
    onUpdateDueDate: handleUpdateDueDate,
    onTogglePriority: handleTogglePriority,
    updateTaskMutation,
    onAddTask: setCreateTaskForProjectId,
    showOperationalState: true,
  };

  const handleRecalculate = useCallback(async () => {
    if (staleProjects.length === 0) return;
    setIsRecalculating(true);
    let recalculated = 0;
    for (const pid of staleProjects) {
      try {
        await base44.functions.invoke("resolveProjectWorkflow", { project_id: pid, mode: "resolve" });
        recalculated++;
      } catch {}
    }
    await queryClient.invalidateQueries({ queryKey: ["allTasks"] });
    setIsRecalculating(false);
    toast({ title: `Recalculated ${recalculated} project${recalculated !== 1 ? "s" : ""}` });
  }, [staleProjects, queryClient, toast]);

  const projectsWithTasks = useMemo(() => {
    const pids = new Set(activeTasks.map(t => t.project_id).filter(Boolean));
    return projects.filter(p => pids.has(p.id)).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [activeTasks, projects]);

  if (isLoading) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <>
      <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center bg-purple-600/20 rounded-lg border-2 border-purple-600 w-10 h-10 md:w-12 md:h-12">
              <Factory className="w-5 h-5 md:w-6 md:h-6 text-purple-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-white">PRODUCTION BOARD</h1>
              <p className="text-xs md:text-sm text-gray-400">
                {projectGroups.length} projects · {activeTasks.length} active tasks
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

        {/* Workflow Health */}
        <WorkflowHealthIndicator
          staleProjects={staleProjects}
          staleMissingSet={staleMissingSet}
          projectMap={projectMap}
          onRecalculate={handleRecalculate}
          isRecalculating={isRecalculating}
        />

        {/* Bottleneck summary */}
        <ShopBottleneckSummary sections={sections} projectMap={projectMap} />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <Input
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              placeholder="Search projects or tasks..."
              className="h-8 pl-7 pr-7 text-xs bg-gray-900/50 border-gray-700 text-white placeholder:text-gray-500"
            />
            {searchValue && (
              <button onClick={() => setSearchValue("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className={cn("w-44 bg-gray-900/50 border-gray-700 text-white h-8 text-xs", projectFilter !== "__all__" && "border-cyan-500/50")}>
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Projects</SelectItem>
              {projectsWithTasks.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Project cards */}
        <div className="space-y-2">
          {projectGroups.map(group => (
            <div key={group.projectId} className="bg-black/30 backdrop-blur-xl border border-gray-700/50 rounded-lg overflow-hidden">
              <ProjectCard
                group={group}
                shared={shared}
                defaultExpanded={projectGroups.length <= 5}
              />
            </div>
          ))}
        </div>

        {projectGroups.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            No active projects match the current filters.
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