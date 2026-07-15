import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronDown, ChevronRight, Flame, User, Plus, Printer,
  CalendarDays, CheckCircle2, Clock, Lock, Unlock, ListChecks,
  Check, Settings, Edit2, Search, Filter, X,
} from "lucide-react";
import { format, startOfDay, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import WorkloadDependencyEditor from "@/components/workload/WorkloadDependencyEditor";
import PhaseSelectorPopover from "@/components/workload/PhaseSelectorPopover";
import WorkloadProjectPrintModal from "@/components/workload/WorkloadProjectPrintModal";
import buildProjectWorkPacketHTML from "@/components/workload/buildProjectWorkPacketHTML";
import WorkloadBulkActionBar from "@/components/priorities/WorkloadBulkActionBar";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import ManageBucketsModal from "@/components/project/ManageBucketsModal";
import TaskDetailDrawer from "@/components/tasks/TaskDetailDrawer";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { invalidateProjectCaches } from "@/components/tasks/useTaskInteraction";

const DONE_STATUS_ID = "6913f57422230d8c7ee2ef54";

function parseLocalDate(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function fmtHours(h) {
  if (!h || h === 0) return "";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h${mins}m`;
}

// ── Collapse memory per project ──
function loadProjectCollapseState(projectId) {
  try { return JSON.parse(localStorage.getItem(`ak_pd_collapse_${projectId}`) || "{}"); } catch { return {}; }
}
function saveProjectCollapseState(projectId, state) {
  try { localStorage.setItem(`ak_pd_collapse_${projectId}`, JSON.stringify(state)); } catch {}
}
function loadProjectToggles(projectId) {
  try { return JSON.parse(localStorage.getItem(`ak_pd_toggles_${projectId}`) || "{}"); } catch { return {}; }
}
function saveProjectToggles(projectId, state) {
  try { localStorage.setItem(`ak_pd_toggles_${projectId}`, JSON.stringify(state)); } catch {}
}

// ── Gutter widths (matches Workload exactly) ──
const GUTTER_SELECT_W = "w-[18px]";
const GUTTER_TASK_INDENT = "pl-4 md:pl-5";
const GUTTER_CL_INDENT = "pl-[3.5rem] md:pl-[4rem]";

// ═══════════════════════════════════════════════
// Phase Header — strengthened visual ownership
// ═══════════════════════════════════════════════
function PhaseHeader({ bucket, openCount, totalCount, isCompleted, expanded, onToggle, editMode, phaseTasks, selectedTaskIds, onToggleTaskSelection, onSelectMultiple, onAddTask }) {
  const phaseTaskIds = (phaseTasks || []).map(t => t.id);
  const selectedCount = phaseTaskIds.filter(id => selectedTaskIds?.has(id)).length;
  const allSelected = phaseTaskIds.length > 0 && selectedCount === phaseTaskIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 py-[5px] px-3 cursor-pointer hover:bg-gray-700/40 transition-colors border-t border-gray-700/30",
        isCompleted ? "bg-gray-800/20" : "bg-gray-800/50",
      )}
      onClick={onToggle}
    >
      <span className={cn("shrink-0 flex items-center justify-center", GUTTER_SELECT_W)} onClick={e => e.stopPropagation()}>
        {editMode && phaseTaskIds.length > 0 ? (
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={() => {
              if (allSelected) phaseTaskIds.forEach(id => onToggleTaskSelection(id));
              else onSelectMultiple(phaseTaskIds);
            }}
            className="h-3.5 w-3.5 border-gray-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=indeterminate]:bg-blue-600 data-[state=indeterminate]:border-blue-600"
          />
        ) : null}
      </span>
      {expanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
      <span className="w-[8px] h-[8px] rounded-full shrink-0" style={{ backgroundColor: isCompleted ? '#10B981' : (bucket?.color || '#6B7280') }} />
      <span className={cn(
        "text-[11px] font-bold uppercase tracking-wider",
        isCompleted ? "text-green-500/70" : "text-gray-200",
      )}>
        {bucket?.name || "GENERAL / NO PHASE"}
      </span>
      {isCompleted ? (
        <span className="text-[10px] text-green-600 font-normal flex items-center gap-0.5">
          <Check className="w-2.5 h-2.5" /> Completed
        </span>
      ) : (
        <span className="text-[10px] text-gray-500 font-normal">({openCount})</span>
      )}
      <div className="ml-auto flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
        {onAddTask && !isCompleted && (
          <button onClick={() => onAddTask(bucket?.id || null)} className="text-green-500 hover:text-green-300 px-0.5 py-0.5 rounded hover:bg-green-900/20 transition-colors" title="Add task in phase">
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Task Row — reuses Workload visual language
// ═══════════════════════════════════════════════
function TaskRow({
  task, assignee, status, blocked, blockingLabel, teamMembers, statuses,
  onToggleComplete, onTaskClick, onUpdateDueDate, onTogglePriority, updateTaskMutation,
  isSelected, onToggleSelection, projectTasks, bucketMap, teamMemberMap,
  checklistProgress, successorCount, successorNames, editMode,
}) {
  const due = parseLocalDate(task.due_date);
  const todayStart = startOfDay(new Date());
  const isOverdue = due && isBefore(due, todayStart);
  const [dateOpen, setDateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const activeMembers = useMemo(() => (teamMembers || []).filter(tm => tm.active), [teamMembers]);
  const taskStatuses = useMemo(() => (statuses || []).filter(s => s.scope === "Task" && s.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [statuses]);
  const depCount = (task.dependencies || []).length;

  return (
    <div className={cn("flex items-center gap-1 pr-3 py-[3px] hover:bg-gray-800/40 transition-colors group/row border-b border-gray-800/20 last:border-b-0", GUTTER_TASK_INDENT, blocked && "opacity-60")}>
      <span className={cn("shrink-0 flex items-center justify-center", GUTTER_SELECT_W)} onClick={e => e.stopPropagation()}>
        {editMode && onToggleSelection ? (
          <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelection(task.id)} className="h-3.5 w-3.5 border-gray-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
        ) : null}
      </span>
      <span onClick={e => e.stopPropagation()} className="shrink-0">
        <Checkbox checked={false} onCheckedChange={() => onToggleComplete(task)} className="h-3.5 w-3.5 border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600" />
      </span>
      <button onClick={e => { e.stopPropagation(); if (onTogglePriority) onTogglePriority(task); }}
        className={cn("shrink-0 p-0 transition-colors", task.is_priority ? "text-red-500 hover:text-red-400" : "text-gray-700 hover:text-red-400 opacity-0 group-hover/row:opacity-100")}
        title={task.is_priority ? "Remove priority" : "Set priority"}
      >
        <Flame className="w-3 h-3" />
      </button>
      <button onClick={() => onTaskClick(task)} className="flex-1 min-w-0 text-left text-[13px] text-gray-200 hover:text-white truncate leading-tight -ml-0.5">
        {task.name}
      </button>
      {checklistProgress && checklistProgress.total > 0 && (
        <span className={cn("text-[10px] shrink-0 flex items-center gap-0.5", checklistProgress.done === checklistProgress.total ? "text-green-500" : "text-gray-500")} title={`Checklist: ${checklistProgress.done}/${checklistProgress.total}`}>
          <ListChecks className="w-2.5 h-2.5" /> {checklistProgress.done}/{checklistProgress.total}
        </span>
      )}
      <TooltipProvider delayDuration={200}>
        {depCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("text-[10px] shrink-0 flex items-center gap-0.5", blocked ? "text-red-400" : "text-blue-400/70")}>
                <Lock className="w-2.5 h-2.5" />{depCount}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs bg-gray-800 border-gray-700 text-xs">
              <p className="font-medium text-gray-300 mb-0.5">Depends on:</p>
              {(task.dependencies || []).map(depId => {
                const depTask = (projectTasks || []).find(t => t.id === depId);
                return <p key={depId} className="text-gray-400">{depTask?.name || depId}</p>;
              })}
            </TooltipContent>
          </Tooltip>
        )}
        {successorCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] shrink-0 flex items-center gap-0.5 text-cyan-400/70"><Unlock className="w-2.5 h-2.5" />{successorCount}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs bg-gray-800 border-gray-700 text-xs">
              <p className="font-medium text-gray-300 mb-0.5">Unlocks:</p>
              {(successorNames || []).map((name, i) => <p key={i} className="text-gray-400">{name}</p>)}
            </TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
      {blocked && blockingLabel && (
        <span className="text-[9px] text-red-400/80 shrink-0 flex items-center gap-0.5 max-w-[200px] truncate" title={`Blocked by: ${blockingLabel}`}>
          <Clock className="w-2.5 h-2.5 shrink-0" /><span className="truncate">Blocked by: {blockingLabel}</span>
        </span>
      )}
      <span onClick={e => e.stopPropagation()} className="shrink-0">
        <WorkloadDependencyEditor task={task} projectTasks={projectTasks} allTasks={projectTasks} bucketMap={bucketMap} teamMemberMap={teamMemberMap} updateTaskMutation={updateTaskMutation} />
      </span>
      <div className="flex items-center gap-0 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild><button className="text-gray-600 hover:text-blue-400 p-0.5 rounded" title="Set due date"><CalendarDays className="w-3 h-3" /></button></PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-700" side="left" align="start">
            <Calendar mode="single" selected={due || undefined} onSelect={(d) => { if (onUpdateDueDate) onUpdateDueDate(task, d); setDateOpen(false); }} className="bg-gray-900" />
          </PopoverContent>
        </Popover>
        <Popover open={assignOpen} onOpenChange={setAssignOpen}>
          <PopoverTrigger asChild><button className="text-gray-600 hover:text-blue-400 p-0.5 rounded" title="Assign"><User className="w-3 h-3" /></button></PopoverTrigger>
          <PopoverContent className="w-44 p-1 bg-gray-900 border-gray-700" side="left" align="start">
            <div className="space-y-px max-h-52 overflow-y-auto">
              <button onClick={() => { updateTaskMutation.mutate({ id: task.id, data: { assigned_team_member_id: null } }); setAssignOpen(false); }} className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors", !task.assigned_team_member_id ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white")}>Unassigned</button>
              {activeMembers.map(tm => (
                <button key={tm.id} onClick={() => { updateTaskMutation.mutate({ id: task.id, data: { assigned_team_member_id: tm.id } }); setAssignOpen(false); }} className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors", task.assigned_team_member_id === tm.id ? "bg-blue-900/40 text-blue-300" : "text-gray-300 hover:bg-gray-800")}>{tm.full_name}</button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild><button className="text-gray-600 hover:text-blue-400 p-0.5 rounded" title="Change status"><CheckCircle2 className="w-3 h-3" /></button></PopoverTrigger>
          <PopoverContent className="w-40 p-1 bg-gray-900 border-gray-700" side="left" align="start">
            <div className="space-y-px max-h-52 overflow-y-auto">
              {taskStatuses.map(s => (
                <button key={s.id} onClick={() => { updateTaskMutation.mutate({ id: task.id, data: { status_id: s.id } }); setStatusOpen(false); }} className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5", task.status_id === s.id ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800")}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />{s.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        {updateTaskMutation && <PhaseSelectorPopover task={task} buckets={bucketMap} allTasks={projectTasks} onMove={(bucketId) => updateTaskMutation.mutate({ id: task.id, data: { kanban_bucket_id: bucketId || null } })} />}
      </div>
      {status && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 hidden sm:inline-flex cursor-default" style={{ borderColor: status.color, color: status.color }}>{status.label}</Badge>
      )}
      <span className="text-[11px] text-gray-500 w-14 truncate shrink-0 hidden md:block text-right">{assignee?.full_name?.split(" ")[0] || "\u2014"}</span>
      <span className={cn("text-[11px] w-12 shrink-0 text-right hidden sm:block tabular-nums", isOverdue ? "text-red-400 font-semibold" : "text-gray-500")}>{due ? format(due, "M/d") : "\u2014"}</span>
      <span className="text-[10px] text-gray-600 w-8 shrink-0 text-right hidden lg:block tabular-nums">{task.estimated_hours ? fmtHours(task.estimated_hours) : ""}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Inline Checklist Items — same as Workload
// ═══════════════════════════════════════════════
function InlineChecklistItems({ items, onToggle, showCompleted = false }) {
  if (!items || items.length === 0) return null;
  const sorted = [...items].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const done = sorted.filter(i => i.is_complete).length;
  const total = sorted.length;
  const remaining = total - done;
  if (done === total) {
    return (
      <div className={GUTTER_CL_INDENT + " pr-3 pb-0.5"}>
        <span className="text-[11px] text-green-500/80 font-medium flex items-center gap-1"><Check className="w-3 h-3" />{total}/{total} Complete</span>
      </div>
    );
  }
  const openItems = sorted.filter(i => !i.is_complete);
  const completedItems = sorted.filter(i => i.is_complete);
  return (
    <div className={GUTTER_CL_INDENT + " pr-3 pb-1 animate-in slide-in-from-top-1 duration-150"}>
      <div className="text-[11px] text-gray-400 font-medium flex items-center gap-1 pb-0.5">
        <ListChecks className="w-3 h-3 text-gray-500" /> Checklist ({remaining} Remaining)
      </div>
      <div className="relative ml-[3px]">
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-700/40" />
        {openItems.map(item => (
          <div key={item.id} className="flex items-center gap-1.5 py-px pl-3 relative">
            <div className="absolute left-0 top-1/2 w-2 h-px bg-gray-700/40" />
            <button onClick={e => { e.stopPropagation(); if (onToggle) onToggle(item); }} className="shrink-0 w-2.5 h-2.5 rounded-[3px] border border-gray-600/80 hover:border-gray-400 flex items-center justify-center transition-colors" />
            <span className="text-[12px] leading-tight truncate text-white">{item.title}</span>
          </div>
        ))}
        {showCompleted && completedItems.length > 0 && (
          <div className="mt-1">
            <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider pl-3 pb-0.5">Completed ({completedItems.length})</div>
            {completedItems.map(item => (
              <div key={item.id} className="flex items-center gap-1.5 py-px pl-3 relative">
                <div className="absolute left-0 top-1/2 w-2 h-px bg-gray-700/40" />
                <button onClick={e => { e.stopPropagation(); if (onToggle) onToggle(item); }} className="shrink-0 w-2.5 h-2.5 rounded-[3px] bg-green-800/40 border border-green-700/50 text-green-500 flex items-center justify-center transition-colors hover:border-green-500" title="Uncheck to reopen">
                  <Check className="w-2 h-2" />
                </button>
                <span className="text-[12px] leading-tight truncate text-gray-400 line-through">{item.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {!showCompleted && completedItems.length > 0 && (
        <div className="text-[10px] text-gray-500/60 pl-3 mt-px">{completedItems.length} completed</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════
export default function ProjectWorkloadView({
  projectId,
  project,
  activeTasks,
  allProjectTasks,
  buckets,
  statuses,
  teamMembers,
  categories,
  onToggleComplete,
  onUpdateDueDate,
  onTogglePriority,
  updateTask,
  onTaskClick: externalTaskClick,
}) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const pendingToggles = useRef(new Set());

  // Toggles: checklist, done, edit, search
  const [toggles, setToggles] = useState(() => {
    const saved = loadProjectToggles(projectId);
    return {
      showChecklists: saved.showChecklists ?? false,
      showCompletedChecklist: saved.showCompletedChecklist ?? false,
      editMode: false,
    };
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [createTaskPhaseId, setCreateTaskPhaseId] = useState(null);
  const [showManageBuckets, setShowManageBuckets] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // Selection state for bulk actions
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());

  // Persist toggles
  useEffect(() => {
    saveProjectToggles(projectId, { showChecklists: toggles.showChecklists, showCompletedChecklist: toggles.showCompletedChecklist });
  }, [projectId, toggles.showChecklists, toggles.showCompletedChecklist]);

  // Completed tasks section
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const completedTasks = useMemo(() => (allProjectTasks || []).filter(t => t.status_id === DONE_STATUS_ID), [allProjectTasks]);

  // Phase collapse memory — auto-collapse completed phases
  const [collapsedPhases, setCollapsedPhases] = useState(() => {
    const saved = loadProjectCollapseState(projectId);
    const set = new Set();
    Object.keys(saved).forEach(k => { if (saved[k] === false) set.add(k); });
    return set;
  });
  const togglePhase = useCallback((phaseId) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev);
      const key = phaseId || "__unphased__";
      const wasCollapsed = next.has(key);
      if (wasCollapsed) next.delete(key); else next.add(key);
      const saved = loadProjectCollapseState(projectId);
      saved[key] = wasCollapsed; // true=expanded, false=collapsed
      saveProjectCollapseState(projectId, saved);
      return next;
    });
  }, [projectId]);

  // Lookup maps
  const teamMemberMap = useMemo(() => { const m = new Map(); (teamMembers || []).forEach(tm => m.set(tm.id, tm)); return m; }, [teamMembers]);
  const statusMap = useMemo(() => { const m = new Map(); (statuses || []).forEach(s => m.set(s.id, s)); return m; }, [statuses]);
  const bucketMap = useMemo(() => { const m = new Map(); (buckets || []).forEach(b => m.set(b.id, b)); return m; }, [buckets]);

  // Successor map
  const successorMap = useMemo(() => {
    const m = new Map();
    (allProjectTasks || []).forEach(t => {
      (t.dependencies || []).forEach(depId => {
        if (!m.has(depId)) m.set(depId, []);
        m.get(depId).push(t);
      });
    });
    return m;
  }, [allProjectTasks]);

  // Blocked set + labels
  const { blockedSet, blockingLabels } = useMemo(() => {
    const bs = new Set();
    const bl = {};
    const completedIds = new Set();
    (allProjectTasks || []).forEach(t => { if (t.status_id === DONE_STATUS_ID) completedIds.add(t.id); });
    (activeTasks || []).forEach(t => {
      if (t.dependencies && t.dependencies.length > 0) {
        const unmetDeps = t.dependencies.filter(depId => !completedIds.has(depId));
        if (unmetDeps.length > 0) {
          bs.add(t.id);
          const names = unmetDeps.map(depId => {
            const dep = (allProjectTasks || []).find(tt => tt.id === depId);
            return dep?.name || depId;
          });
          bl[t.id] = names.join(", ");
        }
      }
    });
    return { blockedSet: bs, blockingLabels: bl };
  }, [activeTasks, allProjectTasks]);

  // Checklist data
  const activeTaskIds = useMemo(() => (activeTasks || []).map(t => t.id), [activeTasks]);
  const { data: allChecklistItems = [] } = useQuery({
    queryKey: ['projectChecklistItems', projectId],
    queryFn: () => activeTaskIds.length > 0
      ? base44.entities.TaskChecklistItem.filter({ task_id: { $in: activeTaskIds } })
      : Promise.resolve([]),
    enabled: activeTaskIds.length > 0,
    staleTime: 30000,
  });
  const checklistsByTaskId = useMemo(() => {
    const m = {};
    allChecklistItems.forEach(item => {
      if (!m[item.task_id]) m[item.task_id] = [];
      m[item.task_id].push(item);
    });
    return m;
  }, [allChecklistItems]);
  const checklistProgressMap = useMemo(() => {
    const m = {};
    Object.entries(checklistsByTaskId).forEach(([tid, items]) => {
      if (items.length > 0) m[tid] = { done: items.filter(i => i.is_complete).length, total: items.length };
    });
    return m;
  }, [checklistsByTaskId]);

  // Checklist toggle handler
  const handleToggleChecklistItem = useCallback(async (item) => {
    if (pendingToggles.current.has(item.id)) return;
    pendingToggles.current.add(item.id);
    const newState = !item.is_complete;
    // Optimistic update — both project-scoped and global checklist caches
    const updateCl = (old) => (old || []).map(i => i.id === item.id ? { ...i, is_complete: newState } : i);
    queryClient.setQueryData(['projectChecklistItems', projectId], updateCl);
    queryClient.setQueryData(['workloadChecklists'], updateCl);
    try {
      await base44.entities.TaskChecklistItem.update(item.id, { is_complete: newState });
      // Invalidate both caches to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['projectChecklistItems', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workloadChecklists'] });
    } catch {
      const rollback = (old) => (old || []).map(i => i.id === item.id ? { ...i, is_complete: !newState } : i);
      queryClient.setQueryData(['projectChecklistItems', projectId], rollback);
      queryClient.setQueryData(['workloadChecklists'], rollback);
    } finally {
      pendingToggles.current.delete(item.id);
    }
  }, [projectId, queryClient]);

  // Update mutation for inline edits
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel and snapshot for optimistic update
      await queryClient.cancelQueries({ queryKey: ['projectTasks', projectId] });
      await queryClient.cancelQueries({ queryKey: ['allTasks'] });
      const prev = queryClient.getQueryData(['projectTasks', projectId]);
      const prevAll = queryClient.getQueryData(['allTasks']);
      const updateCache = (old) => (old || []).map(t => t.id === id ? { ...t, ...data } : t);
      queryClient.setQueryData(['projectTasks', projectId], updateCache);
      queryClient.setQueryData(['allTasks'], updateCache);
      return { prev, prevAll };
    },
    onSuccess: () => {
      invalidateProjectCaches(queryClient, projectId);
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['projectTasks', projectId], context.prev);
      if (context?.prevAll) queryClient.setQueryData(['allTasks'], context.prevAll);
    },
  });

  // Filters
  const filteredTasks = useMemo(() => {
    let list = activeTasks || [];
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(t => t.name?.toLowerCase().includes(lower) || t.description?.toLowerCase().includes(lower));
    }
    if (statusFilter !== "all") list = list.filter(t => t.status_id === statusFilter);
    if (assigneeFilter !== "all") {
      if (assigneeFilter === "unassigned") list = list.filter(t => !t.assigned_team_member_id);
      else list = list.filter(t => t.assigned_team_member_id === assigneeFilter);
    }
    return list;
  }, [activeTasks, searchTerm, statusFilter, assigneeFilter]);

  // Group by phase — use bucket order (never alphabetical)
  const sortedBuckets = useMemo(() => [...(buckets || [])].sort((a, b) => (a.order || 0) - (b.order || 0)), [buckets]);
  const { byPhase, unphased } = useMemo(() => {
    const bp = new Map();
    const up = [];
    filteredTasks.forEach(t => {
      if (t.kanban_bucket_id && bucketMap.has(t.kanban_bucket_id)) {
        if (!bp.has(t.kanban_bucket_id)) bp.set(t.kanban_bucket_id, []);
        bp.get(t.kanban_bucket_id).push(t);
      } else {
        up.push(t);
      }
    });
    return { byPhase: bp, unphased: up };
  }, [filteredTasks, bucketMap]);

  // Detect fully-completed phases and auto-collapse them (only on initial load, not overriding user action)
  const autoCollapsedRef = useRef(new Set());
  useEffect(() => {
    if (!sortedBuckets.length || !allProjectTasks?.length) return;
    const allTasksByBucket = new Map();
    (allProjectTasks || []).forEach(t => {
      if (t.kanban_bucket_id && bucketMap.has(t.kanban_bucket_id)) {
        if (!allTasksByBucket.has(t.kanban_bucket_id)) allTasksByBucket.set(t.kanban_bucket_id, []);
        allTasksByBucket.get(t.kanban_bucket_id).push(t);
      }
    });
    // Respect user's manual expansion — check saved state
    const savedState = loadProjectCollapseState(projectId);
    setCollapsedPhases(prev => {
      const next = new Set(prev);
      let changed = false;
      sortedBuckets.forEach(b => {
        const bt = allTasksByBucket.get(b.id) || [];
        const allDone = bt.length > 0 && bt.every(t => t.status_id === DONE_STATUS_ID);
        // Only auto-collapse if: completed, not already tracked, not already collapsed,
        // AND user hasn't explicitly expanded it (saved[key] === true means user expanded)
        if (allDone && !autoCollapsedRef.current.has(b.id) && !next.has(b.id) && savedState[b.id] !== true) {
          next.add(b.id);
          autoCollapsedRef.current.add(b.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [sortedBuckets, allProjectTasks, bucketMap, projectId]);

  const handleTaskClick = useCallback((task) => {
    if (externalTaskClick) externalTaskClick(task);
    else setSelectedTask(task);
  }, [externalTaskClick]);

  // Selection handlers
  const toggleTaskSelection = useCallback((id) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const selectMultiple = useCallback((ids) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedTaskIds(new Set()), []);

  // Bulk actions
  const selectedTasksList = useMemo(() => filteredTasks.filter(t => selectedTaskIds.has(t.id)), [filteredTasks, selectedTaskIds]);
  const handleBulkSetDueDate = useCallback(async (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    await Promise.all(selectedTasksList.map(t => base44.entities.Task.update(t.id, { due_date: dateStr })));
    invalidateProjectCaches(queryClient, projectId);
    clearSelection();
  }, [selectedTasksList, projectId, queryClient, clearSelection]);
  const handleBulkShiftDates = useCallback(async (days) => {
    await Promise.all(selectedTasksList.map(t => {
      const d = parseLocalDate(t.due_date);
      if (!d) return null;
      const newDate = new Date(d);
      newDate.setDate(newDate.getDate() + days);
      return base44.entities.Task.update(t.id, { due_date: format(newDate, "yyyy-MM-dd") });
    }).filter(Boolean));
    invalidateProjectCaches(queryClient, projectId);
    clearSelection();
  }, [selectedTasksList, projectId, queryClient, clearSelection]);
  const handleBulkAssign = useCallback(async (memberId) => {
    await Promise.all(selectedTasksList.map(t => base44.entities.Task.update(t.id, { assigned_team_member_id: memberId })));
    invalidateProjectCaches(queryClient, projectId);
    clearSelection();
  }, [selectedTasksList, projectId, queryClient, clearSelection]);
  const handleBulkStatus = useCallback(async (statusId) => {
    await Promise.all(selectedTasksList.map(t => base44.entities.Task.update(t.id, { status_id: statusId })));
    invalidateProjectCaches(queryClient, projectId);
    clearSelection();
  }, [selectedTasksList, projectId, queryClient, clearSelection]);
  const handleBulkPriority = useCallback(async () => {
    const allPriority = selectedTasksList.every(t => t.is_priority);
    await Promise.all(selectedTasksList.map(t => base44.entities.Task.update(t.id, { is_priority: !allPriority })));
    invalidateProjectCaches(queryClient, projectId);
    clearSelection();
  }, [selectedTasksList, projectId, queryClient, clearSelection]);
  const handleBulkMovePhase = useCallback(async (bucketId) => {
    await Promise.all(selectedTasksList.map(t => base44.entities.Task.update(t.id, { kanban_bucket_id: bucketId || null })));
    invalidateProjectCaches(queryClient, projectId);
    clearSelection();
  }, [selectedTasksList, projectId, queryClient, clearSelection]);

  // Print handler
  const handleProjectPrint = useCallback((opts) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast({ title: "Print window blocked", variant: "destructive" }); return; }
    const printTasks = opts.scope === "current" ? filteredTasks : (activeTasks || []);
    const html = buildProjectWorkPacketHTML({
      project, tasks: printTasks, buckets: buckets || [], teamMemberMap, blockingLabels, blockedSet, successorMap,
      checklistsByTaskId: opts.includeChecklists ? checklistsByTaskId : {},
      weekLabel: "",
      options: { includeChecklists: opts.includeChecklists, includeCompletionMarks: opts.includeCompletionMarks, includeNotes: opts.includeNotes },
    });
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }, [filteredTasks, activeTasks, project, buckets, teamMemberMap, blockingLabels, blockedSet, successorMap, checklistsByTaskId, toast]);

  // Add task in phase
  const handleAddTaskInPhase = useCallback((phaseId) => {
    setCreateTaskPhaseId(phaseId);
    setShowCreateTask(true);
  }, []);

  const taskStatuses = useMemo(() => (statuses || []).filter(s => s.scope === "Task" && s.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [statuses]);

  // Render task row helper
  const renderTaskRow = (task) => {
    const succs = successorMap.get(task.id) || [];
    const clItems = toggles.showChecklists ? (checklistsByTaskId[task.id] || []) : [];
    return (
      <React.Fragment key={task.id}>
        <TaskRow
          task={task}
          assignee={teamMemberMap.get(task.assigned_team_member_id)}
          status={statusMap.get(task.status_id)}
          blocked={blockedSet.has(task.id)}
          blockingLabel={blockingLabels[task.id] || null}
          teamMembers={teamMembers}
          statuses={statuses}
          onToggleComplete={onToggleComplete}
          onTaskClick={handleTaskClick}
          onUpdateDueDate={onUpdateDueDate}
          onTogglePriority={onTogglePriority}
          updateTaskMutation={updateTaskMutation}
          isSelected={selectedTaskIds.has(task.id)}
          onToggleSelection={toggleTaskSelection}
          projectTasks={allProjectTasks || activeTasks}
          bucketMap={bucketMap}
          teamMemberMap={teamMemberMap}
          checklistProgress={checklistProgressMap[task.id]}
          successorCount={succs.length}
          successorNames={succs.map(s => s.name)}
          editMode={toggles.editMode}
        />
        {clItems.length > 0 && (
          <InlineChecklistItems items={clItems} onToggle={handleToggleChecklistItem} showCompleted={toggles.showCompletedChecklist} />
        )}
      </React.Fragment>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setShowCreateTask(true)} className="bg-red-600 hover:bg-red-700 gap-1 h-7 text-xs">
            <Plus className="w-3 h-3" /> Add Task
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowManageBuckets(true)} className="border-gray-700 gap-1 h-7 text-xs">
            <Settings className="w-3 h-3" /><span className="hidden sm:inline">Manage Phases</span><span className="sm:hidden">Phases</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPrintModalOpen(true)} className="border-gray-700 gap-1 h-7 text-xs">
            <Printer className="w-3 h-3" /><span className="hidden sm:inline">Print</span>
          </Button>

          <div className="ml-auto flex items-center gap-1">
            {/* Checklists toggle */}
            <button
              onClick={() => setToggles(p => ({ ...p, showChecklists: !p.showChecklists }))}
              className={cn("text-[11px] px-2 py-0.5 rounded transition-colors", toggles.showChecklists ? "bg-gray-600 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800")}
            >Checklists</button>
            {/* Done toggle */}
            {toggles.showChecklists && (
              <button
                onClick={() => setToggles(p => ({ ...p, showCompletedChecklist: !p.showCompletedChecklist }))}
                className={cn("text-[11px] px-2 py-0.5 rounded transition-colors", toggles.showCompletedChecklist ? "bg-gray-600 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800")}
              >Done</button>
            )}
            {/* Edit Mode toggle */}
            <button
              onClick={() => { setToggles(p => ({ ...p, editMode: !p.editMode })); if (toggles.editMode) clearSelection(); }}
              className={cn("text-[11px] px-2 py-0.5 rounded transition-colors", toggles.editMode ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800")}
            >Edit</button>
          </div>
        </div>

        {/* ── Filters row ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[120px] max-w-[240px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search tasks..." className="pl-7 h-7 text-xs bg-gray-900/50 border-gray-700 text-white" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 h-7 text-xs bg-gray-900/50 border-gray-700 text-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {taskStatuses.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-28 h-7 text-xs bg-gray-900/50 border-gray-700 text-white"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Members</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {(teamMembers || []).filter(m => m.active).map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-[10px] text-gray-500 tabular-nums">{filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}</span>
        </div>

        {/* ── Task list grouped by phase ── */}
        <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg overflow-hidden">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No tasks match your filters.</div>
          ) : (
            <>
              {sortedBuckets.map(bucket => {
                const phaseTasks = byPhase.get(bucket.id);
                if (!phaseTasks || phaseTasks.length === 0) return null;
                const openCount = phaseTasks.filter(t => t.status_id !== DONE_STATUS_ID).length;
                const isPhaseCompleted = phaseTasks.length > 0 && openCount === 0;
                const phaseKey = bucket.id;
                const isCollapsed = collapsedPhases.has(phaseKey);
                return (
                  <div key={bucket.id}>
                    <PhaseHeader
                      bucket={bucket} openCount={openCount} totalCount={phaseTasks.length}
                      isCompleted={isPhaseCompleted} expanded={!isCollapsed} onToggle={() => togglePhase(phaseKey)}
                      editMode={toggles.editMode} phaseTasks={phaseTasks} selectedTaskIds={selectedTaskIds}
                      onToggleTaskSelection={toggleTaskSelection} onSelectMultiple={selectMultiple}
                      onAddTask={handleAddTaskInPhase}
                    />
                    {!isCollapsed && phaseTasks.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(renderTaskRow)}
                  </div>
                );
              })}
              {unphased.length > 0 && (() => {
                const unphasedOpen = unphased.filter(t => t.status_id !== DONE_STATUS_ID).length;
                const unphasedCompleted = unphased.length > 0 && unphasedOpen === 0;
                return (
                  <div>
                    <PhaseHeader
                      bucket={null} openCount={unphasedOpen} totalCount={unphased.length}
                      isCompleted={unphasedCompleted} expanded={!collapsedPhases.has("__unphased__")} onToggle={() => togglePhase("__unphased__")}
                      editMode={toggles.editMode} phaseTasks={unphased} selectedTaskIds={selectedTaskIds}
                      onToggleTaskSelection={toggleTaskSelection} onSelectMultiple={selectMultiple}
                      onAddTask={handleAddTaskInPhase}
                    />
                    {!collapsedPhases.has("__unphased__") && unphased.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(renderTaskRow)}
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* ── Completed Tasks — collapsed by default ── */}
        {completedTasks.length > 0 && (
          <div className="bg-black/40 backdrop-blur-xl border border-green-900/20 rounded-lg overflow-hidden">
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-800/40 transition-colors"
              onClick={() => setCompletedExpanded(p => !p)}
            >
              {completedExpanded ? <ChevronDown className="w-3 h-3 text-green-500/60" /> : <ChevronRight className="w-3 h-3 text-green-500/60" />}
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500/60" />
              <span className="text-[11px] font-semibold text-green-500/70 uppercase tracking-wider">Completed Tasks</span>
              <span className="text-[10px] text-gray-600">({completedTasks.length})</span>
            </div>
            {completedExpanded && (
              <div className="border-t border-green-900/20">
                {completedTasks.sort((a, b) => new Date(b.completed_date || b.updated_date) - new Date(a.completed_date || a.updated_date)).slice(0, 50).map(task => (
                  <div key={task.id} className="flex items-center gap-1.5 px-3 py-[4px] border-b border-gray-800/10 last:border-b-0 group/row">
                    <span className={cn("shrink-0", GUTTER_SELECT_W)} />
                    <CheckCircle2 className="w-3 h-3 text-green-600/50 shrink-0" />
                    <button onClick={() => handleTaskClick(task)} className="flex-1 min-w-0 text-left text-[12px] text-gray-500 line-through truncate leading-tight hover:text-gray-400">
                      {task.name}
                    </button>
                    <span className="text-[10px] text-gray-600 shrink-0 hidden sm:block">{teamMemberMap.get(task.assigned_team_member_id)?.full_name?.split(" ")[0] || ""}</span>
                    {task.completed_date && <span className="text-[10px] text-green-700/60 shrink-0 hidden sm:block tabular-nums">{format(new Date(task.completed_date), "M/d")}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Bulk Action Bar ── */}
        {toggles.editMode && selectedTaskIds.size > 0 && (
          <WorkloadBulkActionBar
            selectedCount={selectedTaskIds.size}
            onClear={clearSelection}
            onSetDueDate={handleBulkSetDueDate}
            onShiftDates={handleBulkShiftDates}
            onAssign={handleBulkAssign}
            onSetStatus={handleBulkStatus}
            onTogglePriority={handleBulkPriority}
            onPrintSelected={() => {
              handleProjectPrint({ scope: "current", includeChecklists: toggles.showChecklists, includeCompletionMarks: false, includeNotes: false });
            }}
            onMovePhase={handleBulkMovePhase}
            teamMembers={teamMembers}
            statuses={statuses}
            buckets={buckets}
            selectedTasks={selectedTasksList}
          />
        )}
      </div>

      {/* ── Modals ── */}
      {showCreateTask && (
        <CreateTaskModal projectId={projectId} defaultBucketId={createTaskPhaseId} onClose={() => { setShowCreateTask(false); setCreateTaskPhaseId(null); }} />
      )}
      {showManageBuckets && <ManageBucketsModal projectId={projectId} onClose={() => setShowManageBuckets(false)} />}
      {selectedTask && !externalTaskClick && <TaskDetailDrawer task={selectedTask} projectId={projectId} onClose={() => setSelectedTask(null)} />}
      <WorkloadProjectPrintModal
        open={printModalOpen} onClose={() => setPrintModalOpen(false)}
        project={project} sectionTaskCount={filteredTasks.length}
        allOpenTaskCount={(activeTasks || []).length} onPrint={handleProjectPrint}
      />
    </TooltipProvider>
  );
}