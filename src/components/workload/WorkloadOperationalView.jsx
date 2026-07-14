import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { format, addDays } from "date-fns";
import useWorkloadData from "./useWorkloadData";
import WorkloadTaskFirstSection from "./WorkloadTaskFirstSection";
import WorkloadFilters from "./WorkloadFilters";
import ShopBottleneckSummary from "./ShopBottleneckSummary";
import WorkflowHealthIndicator from "./WorkflowHealthIndicator";
import WorkloadBulkActionBar from "@/components/priorities/WorkloadBulkActionBar";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";

function ShopSummaryCard({ label, value, color, onClick, active }) {
  if (!value && value !== 0) return null;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center px-3 py-2 rounded-lg border text-center min-w-[72px] transition-all",
        active ? "ring-1 ring-white/30 scale-[1.02]" : "hover:brightness-110",
        color
      )}
    >
      <span className="text-xl font-bold tabular-nums leading-tight">{value}</span>
      <span className="text-[10px] leading-tight opacity-80 whitespace-nowrap">{label}</span>
    </button>
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
  const { toast } = useToast();

  // Filters state
  const [searchValue, setSearchValue] = useState("");
  const [dateFilter, setDateFilter] = useState("7d");
  const [completedWindow, setCompletedWindow] = useState("7d");
  const [filters, setFilters] = useState({});
  const [createTaskForProjectId, setCreateTaskForProjectId] = useState(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Load phases (single query)
  const { data: allPhases = [] } = useQuery({
    queryKey: ["allPhases"],
    queryFn: () => base44.entities.ProjectKanbanBucket.list(),
    staleTime: 60000,
  });

  // Search filtering
  const searchFilteredTasks = useMemo(() => {
    if (!searchValue.trim()) return tasks;
    const q = searchValue.toLowerCase();
    const projectNameMap = new Map();
    projects.forEach(p => projectNameMap.set(p.id, (p.name || "").toLowerCase()));
    const teamMap = new Map();
    teamMembers.forEach(tm => teamMap.set(tm.id, (tm.full_name || "").toLowerCase()));
    const phaseNameMap = new Map();
    allPhases.forEach(p => phaseNameMap.set(p.id, (p.name || "").toLowerCase()));

    return tasks.filter(t => {
      if ((t.name || "").toLowerCase().includes(q)) return true;
      if (projectNameMap.get(t.project_id)?.includes(q)) return true;
      if (phaseNameMap.get(t.kanban_bucket_id)?.includes(q)) return true;
      if (teamMap.get(t.assigned_team_member_id)?.includes(q)) return true;
      if (t.blocking_reasons?.some(r => (r.label || "").toLowerCase().includes(q) || (r.type || "").toLowerCase().includes(q))) return true;
      if ((t.description || "").toLowerCase().includes(q)) return true;
      return false;
    });
  }, [tasks, searchValue, projects, teamMembers, allPhases]);

  const { sections, stats, staleProjects, staleMissingSet, projectMap, phaseMap, teamMemberMap, statusMap, successorCounts } = useWorkloadData({
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
    let recalculated = 0;
    let errors = 0;
    for (const pid of staleProjects) {
      try {
        await base44.functions.invoke("resolveProjectWorkflow", { project_id: pid, mode: "resolve" });
        recalculated++;
      } catch { errors++; }
    }
    await queryClient.invalidateQueries({ queryKey: ["allTasks"] });
    setIsRecalculating(false);
    toast({
      title: `Recalculated ${recalculated} project${recalculated !== 1 ? "s" : ""}`,
      description: errors > 0 ? `${errors} failed` : "All task records preserved. Only derived fields updated.",
    });
  }, [staleProjects, queryClient, toast]);

  // Shared props
  const shared = {
    teamMemberMap, statusMap, phaseMap, successorCounts,
    teamMembers, statuses,
    onToggleComplete, onTaskClick, onUpdateDueDate, onTogglePriority, updateTaskMutation,
    selectedTaskIds, onToggleTaskSelection: toggleTaskSelection,
    onAddTask: setCreateTaskForProjectId,
    showOperationalState: false,
  };

  // Projects with active tasks (for filter dropdown)
  const projectsWithTasks = useMemo(() => {
    const pids = new Set(tasks.map(t => t.project_id).filter(Boolean));
    return projects.filter(p => pids.has(p.id)).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [tasks, projects]);

  // Section-level counts (shop scope)
  const waitingParts = useMemo(() => sections.find(s => s.key === "WAITING_ON_PARTS")?.count || 0, [sections]);
  const waitingVendor = useMemo(() => sections.find(s => s.key === "WAITING_ON_VENDOR")?.count || 0, [sections]);
  const waitingCustomer = useMemo(() => sections.find(s => s.key === "WAITING_ON_CUSTOMER")?.count || 0, [sections]);
  const blockedCount = useMemo(() => sections.find(s => s.key === "BLOCKED")?.count || 0, [sections]);

  // Count unique blocked projects (shop scope)
  const blockedProjectCount = useMemo(() => {
    const pids = new Set();
    sections.forEach(sec => {
      if (["BLOCKED", "WAITING_ON_PARTS", "WAITING_ON_VENDOR", "WAITING_ON_CUSTOMER"].includes(sec.key)) {
        sec.tasks.forEach(t => { if (t.project_id) pids.add(t.project_id); });
      }
    });
    return pids.size;
  }, [sections]);

  return (
    <div className="space-y-3">
      {/* Workflow Health — compact, expandable */}
      <WorkflowHealthIndicator
        staleProjects={staleProjects}
        staleMissingSet={staleMissingSet}
        projectMap={projectMap}
        onRecalculate={handleRecalculate}
        isRecalculating={isRecalculating}
      />

      {/* Shop Production Summary — each card represents SHOP scope */}
      <div className="flex items-stretch gap-2 flex-wrap">
        <ShopSummaryCard label="In Progress" value={stats.inProgress} color="border-amber-700/40 bg-amber-900/15 text-amber-400" />
        <ShopSummaryCard label="Ready" value={stats.ready} color="border-green-700/40 bg-green-900/15 text-green-400" />
        <ShopSummaryCard label="Blocked" value={blockedCount} color="border-red-700/40 bg-red-900/15 text-red-400" />
        <ShopSummaryCard label="Parts" value={waitingParts} color="border-orange-700/40 bg-orange-900/15 text-orange-300" />
        <ShopSummaryCard label="Vendor" value={waitingVendor} color="border-purple-700/40 bg-purple-900/15 text-purple-300" />
        <ShopSummaryCard label="Customer" value={waitingCustomer} color="border-blue-700/40 bg-blue-900/15 text-blue-300" />
        <ShopSummaryCard label="Review" value={stats.review} color="border-violet-700/40 bg-violet-900/15 text-violet-300" />
        <ShopSummaryCard label="Proj Blocked" value={blockedProjectCount} color="border-red-700/40 bg-red-900/10 text-red-300" />
        <ShopSummaryCard label="Overdue" value={stats.overdue} color="border-red-700/40 bg-red-900/15 text-red-400" />
        <ShopSummaryCard label="Unassigned" value={stats.unassigned} color="border-yellow-700/40 bg-yellow-900/15 text-yellow-400" />

        {stats.totalEstHours > 0 && (
          <div className="flex flex-col items-center px-3 py-2 rounded-lg border border-emerald-700/40 bg-emerald-900/15 text-emerald-400 min-w-[72px]">
            <span className="text-xl font-bold tabular-nums leading-tight">{Math.round(stats.totalEstHours)}h</span>
            <span className="text-[10px] leading-tight opacity-80">Est Hours</span>
          </div>
        )}

        {/* Select all — pushed right */}
        <Button
          variant="outline"
          size="sm"
          onClick={selectedTaskIds.size > 0 ? clearSelection : selectAllVisible}
          className={cn("border-gray-700 text-white hover:bg-gray-800 h-auto px-3 text-xs ml-auto self-center", selectedTaskIds.size > 0 && "border-blue-600/50 bg-blue-600/10")}
        >
          <CheckSquare className="w-3 h-3 mr-1" />
          {selectedTaskIds.size > 0 ? `${selectedTaskIds.size} Selected` : "Select All"}
        </Button>
      </div>

      {/* Shop Bottlenecks — expanded detail */}
      <ShopBottleneckSummary sections={sections} projectMap={projectMap} />

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

      {/* Operational Sections — task-first: flat task rows under project headers */}
      {sections.map(section => {
        const sectionShared = section.key === "IN_PROGRESS"
          ? { ...shared, showOperationalState: true }
          : shared;

        return (
          <WorkloadTaskFirstSection
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