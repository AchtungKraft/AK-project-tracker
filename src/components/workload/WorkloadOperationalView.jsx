import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Play, CircleCheck, Ban, Clock, CheckSquare, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { format, addDays } from "date-fns";
import useWorkloadData from "./useWorkloadData";
import WorkloadSection from "./WorkloadSection";
import WorkloadFilters from "./WorkloadFilters";
import WorkloadBulkActionBar from "@/components/priorities/WorkloadBulkActionBar";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";

function StatPill({ label, value, color, textColor }) {
  if (!value) return null;
  return (
    <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border tabular-nums", color)}>
      {label} <span className={textColor}>{value}</span>
    </div>
  );
}

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export default function WorkloadOperationalView({
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
  const queryClient = useQueryClient();
  const { toast, dismiss } = useToast();

  // Filters state
  const [searchValue, setSearchValue] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [completedWindow, setCompletedWindow] = useState("7d");
  const [filters, setFilters] = useState({});
  const [createTaskForProjectId, setCreateTaskForProjectId] = useState(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Load phases for all projects (batched, single query)
  const { data: allPhases = [] } = useQuery({
    queryKey: ["allPhases"],
    queryFn: () => base44.entities.ProjectKanbanBucket.list(),
    staleTime: 60000,
  });

  // Search filtering — applied before workload data
  const searchFilteredTasks = useMemo(() => {
    if (!searchValue.trim()) return tasks;
    const q = searchValue.toLowerCase();
    const projectNameMap = new Map();
    projects.forEach(p => projectNameMap.set(p.id, (p.name || "").toLowerCase()));
    const teamMap = new Map();
    teamMembers.forEach(tm => teamMap.set(tm.id, (tm.full_name || "").toLowerCase()));

    return tasks.filter(t => {
      if ((t.name || "").toLowerCase().includes(q)) return true;
      if (projectNameMap.get(t.project_id)?.includes(q)) return true;
      if (teamMap.get(t.assigned_team_member_id)?.includes(q)) return true;
      // Search blocking reasons
      if (t.blocking_reasons?.some(r => (r.label || "").toLowerCase().includes(q))) return true;
      return false;
    });
  }, [tasks, searchValue, projects, teamMembers]);

  const { sections, stats, staleProjects, projectMap, phaseMap, teamMemberMap, statusMap, successorCounts } = useWorkloadData({
    tasks: searchFilteredTasks,
    allTasks,
    projects,
    phases: allPhases,
    teamMembers,
    statuses,
    dateFilter,
    completedWindow,
    filters,
  });

  // Bulk selection
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const toggleTaskSelection = useCallback(taskId => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedTaskIds(new Set()), []);
  const selectAllVisible = useCallback(() => {
    const ids = new Set();
    sections.forEach(sec => sec.tasks.forEach(t => ids.add(t.id)));
    setSelectedTaskIds(ids);
  }, [sections]);

  const selectedTasks = useMemo(() => {
    if (selectedTaskIds.size === 0) return [];
    const all = [];
    sections.forEach(sec => sec.tasks.forEach(t => { if (selectedTaskIds.has(t.id)) all.push(t); }));
    return all;
  }, [selectedTaskIds, sections]);

  // Bulk handlers
  const handleBulkShiftDates = useCallback(days => {
    if (!updateTaskMutation || selectedTasks.length === 0) return;
    const count = selectedTasks.length;
    selectedTasks.forEach(task => {
      const base = parseLocalDate(task.due_date) || new Date();
      const shifted = addDays(base, days);
      updateTaskMutation.mutate({ id: task.id, data: { due_date: format(shifted, "yyyy-MM-dd") } });
    });
    clearSelection();
    toast({ title: `Shifted ${count} task dates by ${days > 0 ? "+" : ""}${days} day${Math.abs(days) !== 1 ? "s" : ""}` });
  }, [selectedTasks, updateTaskMutation, toast, clearSelection]);

  const handleBulkSetDueDate = useCallback(date => {
    if (!updateTaskMutation || !date) return;
    const count = selectedTasks.length;
    selectedTasks.forEach(task => {
      updateTaskMutation.mutate({ id: task.id, data: { due_date: format(date, "yyyy-MM-dd") } });
    });
    clearSelection();
    toast({ title: `Set due date for ${count} tasks` });
  }, [selectedTasks, updateTaskMutation, toast, clearSelection]);

  const handleBulkAssign = useCallback(memberId => {
    if (!updateTaskMutation) return;
    const count = selectedTasks.length;
    selectedTasks.forEach(task => {
      updateTaskMutation.mutate({ id: task.id, data: { assigned_team_member_id: memberId } });
    });
    clearSelection();
    toast({ title: `Assigned ${count} tasks` });
  }, [selectedTasks, updateTaskMutation, toast, clearSelection]);

  const handleBulkStatus = useCallback(statusId => {
    if (!updateTaskMutation) return;
    const count = selectedTasks.length;
    selectedTasks.forEach(task => {
      updateTaskMutation.mutate({ id: task.id, data: { status_id: statusId } });
    });
    clearSelection();
    toast({ title: `Updated status for ${count} tasks` });
  }, [selectedTasks, updateTaskMutation, toast, clearSelection]);

  const handleBulkPriority = useCallback(() => {
    if (!updateTaskMutation) return;
    const count = selectedTasks.length;
    const allPriority = selectedTasks.every(t => t.is_priority);
    selectedTasks.forEach(task => {
      updateTaskMutation.mutate({ id: task.id, data: { is_priority: !allPriority } });
    });
    clearSelection();
    toast({ title: allPriority ? `Removed priority from ${count} tasks` : `Set priority on ${count} tasks` });
  }, [selectedTasks, updateTaskMutation, toast, clearSelection]);

  // Recalculate stale projects
  const handleRecalculate = useCallback(async () => {
    if (staleProjects.length === 0) return;
    setIsRecalculating(true);
    for (const pid of staleProjects) {
      await base44.functions.invoke("resolveProjectWorkflow", { project_id: pid, mode: "resolve" });
    }
    await queryClient.invalidateQueries({ queryKey: ["allTasks"] });
    setIsRecalculating(false);
    toast({ title: `Recalculated ${staleProjects.length} project(s)` });
  }, [staleProjects, queryClient, toast]);

  // Shared props for child components
  const shared = {
    teamMemberMap,
    statusMap,
    phaseMap,
    successorCounts,
    teamMembers,
    statuses,
    onToggleComplete,
    onTaskClick,
    onUpdateDueDate,
    onTogglePriority,
    updateTaskMutation,
    selectedTaskIds,
    onToggleTaskSelection: toggleTaskSelection,
    onAddTask: setCreateTaskForProjectId,
    showOperationalState: false,
  };

  // Projects with active tasks (for filter dropdown)
  const projectsWithTasks = useMemo(() => {
    const pids = new Set(tasks.map(t => t.project_id).filter(Boolean));
    return projects.filter(p => pids.has(p.id)).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [tasks, projects]);

  return (
    <div className="space-y-3">
      {/* Stale data warning */}
      {staleProjects.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-600/30 bg-amber-600/5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs text-amber-300">
            {staleProjects.length} project{staleProjects.length !== 1 ? "s" : ""} missing workflow data.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRecalculate}
            disabled={isRecalculating}
            className="border-amber-600/50 text-amber-300 hover:bg-amber-600/20 h-6 text-xs gap-1 ml-auto"
          >
            <RefreshCw className={cn("w-3 h-3", isRecalculating && "animate-spin")} />
            Recalculate
          </Button>
        </div>
      )}

      {/* Summary stats */}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatPill label="Active" value={stats.totalActive} color="border-gray-700 bg-gray-800/50" textColor="text-white" />
        <StatPill label="In Progress" value={stats.inProgress} color="border-amber-600/30 bg-amber-600/10" textColor="text-amber-400" />
        <StatPill label="Ready" value={stats.ready} color="border-green-600/30 bg-green-600/10" textColor="text-green-400" />
        <StatPill label="Blocked/Waiting" value={stats.blocked} color="border-red-600/30 bg-red-600/10" textColor="text-red-400" />
        <StatPill label="Overdue" value={stats.overdue} color="border-red-600/30 bg-red-600/10" textColor="text-red-400" />
        <StatPill label="Unassigned" value={stats.unassigned} color="border-yellow-600/30 bg-yellow-600/10" textColor="text-yellow-400" />
        {stats.totalEstHours > 0 && (
          <StatPill label="Est." value={`${Math.round(stats.totalEstHours)}h`} color="border-emerald-600/30 bg-emerald-600/10" textColor="text-emerald-400" />
        )}

        {/* Select all toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={selectedTaskIds.size > 0 ? clearSelection : selectAllVisible}
          className={cn("border-gray-700 text-white hover:bg-gray-800 h-7 px-2 text-xs ml-auto", selectedTaskIds.size > 0 && "border-blue-600/50 bg-blue-600/10")}
        >
          <CheckSquare className="w-3 h-3 mr-1" />
          {selectedTaskIds.size > 0 ? `${selectedTaskIds.size} Selected` : "Select All"}
        </Button>
      </div>

      {/* Filters */}
      <WorkloadFilters
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        completedWindow={completedWindow}
        onCompletedWindowChange={setCompletedWindow}
        filters={filters}
        onFilterChange={setFilters}
        projects={projectsWithTasks}
        phases={allPhases}
        teamMembers={teamMembers}
        stats={stats}
      />

      {/* Sections */}
      {sections.map(section => {
        // Don't render empty sections when collapsed by default (except if they have tasks)
        if (section.count === 0 && !section.defaultExpanded) return null;

        // For IN_PROGRESS section, show operational state on tasks that have conflicts
        const sectionShared = section.key === "IN_PROGRESS"
          ? { ...shared, showOperationalState: true }
          : shared;

        return (
          <WorkloadSection
            key={section.key}
            section={section}
            shared={sectionShared}
          />
        );
      })}

      {/* Empty state */}
      {stats.totalActive === 0 && stats.completed === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">
          No tasks match the current filters.
        </div>
      )}

      {/* Bulk Action Bar */}
      <WorkloadBulkActionBar
        selectedCount={selectedTaskIds.size}
        onClear={clearSelection}
        onSetDueDate={handleBulkSetDueDate}
        onShiftDates={handleBulkShiftDates}
        onAssign={handleBulkAssign}
        onSetStatus={handleBulkStatus}
        onTogglePriority={handleBulkPriority}
        onPrintSelected={() => {}}
        teamMembers={teamMembers}
        statuses={statuses}
      />

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