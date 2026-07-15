import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  ChevronDown,
  ChevronRight,
  Flame,
  User,
  Plus,
  Printer,
  CalendarDays,
  CheckCircle2,
  Clock,
  Lock,
  Unlock,
  ListChecks,
  Check,
} from "lucide-react";
import { format, startOfDay, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import WorkloadDependencyEditor from "@/components/workload/WorkloadDependencyEditor";
import WorkloadProjectPrintModal from "@/components/workload/WorkloadProjectPrintModal";
import buildProjectWorkPacketHTML from "@/components/workload/buildProjectWorkPacketHTML";
import PhaseSelectorPopover from "@/components/workload/PhaseSelectorPopover";
import { useToast } from "@/components/ui/use-toast";

const DONE_STATUS_ID = "6913f57422230d8c7ee2ef54";

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
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

// ── Collapse memory helpers ──
const COLLAPSE_KEY = "ak_workload_collapse";
function loadCollapseState() {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}"); } catch { return {}; }
}
function saveCollapseState(state) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// ── Fixed gutter width constants ──
// Bulk-select slot: 18px (checkbox 14px + gap). Completion slot: 18px.
const GUTTER_SELECT_W = "w-[18px]"; // reserved slot for bulk-select checkbox
const GUTTER_TASK_INDENT = "pl-8 md:pl-10"; // task rows: phase indent + task indent
const GUTTER_PHASE_INDENT = "pl-4 md:pl-5"; // phase headers: one level in from project

// ── Compact task row ──
function WorkloadTaskRow({
  task,
  assignee,
  status,
  blocked,
  blockingLabel,
  teamMembers,
  statuses,
  onToggleComplete,
  onTaskClick,
  onUpdateDueDate,
  onTogglePriority,
  updateTaskMutation,
  isSelected,
  onToggleSelection,
  projectTasks,
  allTasks,
  bucketMap,
  teamMemberMap,
  checklistProgress,
  successorCount,
  successorNames,
  editMode,
}) {
  const due = parseLocalDate(task.due_date);
  const todayStart = startOfDay(new Date());
  const isOverdue = due && isBefore(due, todayStart);

  const [dateOpen, setDateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const activeMembers = useMemo(
    () => (teamMembers || []).filter((tm) => tm.active),
    [teamMembers]
  );
  const taskStatuses = useMemo(
    () => (statuses || []).filter((s) => s.scope === "Task" && s.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [statuses]
  );

  const handleDateSelect = useCallback((date) => {
    if (onUpdateDueDate) onUpdateDueDate(task, date);
    setDateOpen(false);
  }, [task, onUpdateDueDate]);

  const handleAssign = useCallback((memberId) => {
    if (updateTaskMutation) updateTaskMutation.mutate({ id: task.id, data: { assigned_team_member_id: memberId } });
    setAssignOpen(false);
  }, [task, updateTaskMutation]);

  const handleStatusChange = useCallback((statusId) => {
    if (updateTaskMutation) updateTaskMutation.mutate({ id: task.id, data: { status_id: statusId } });
    setStatusOpen(false);
  }, [task, updateTaskMutation]);

  const depCount = (task.dependencies || []).length;

  return (
    <div
      className={cn(
        "flex items-center gap-1 pr-3 py-[3px] hover:bg-gray-800/40 transition-colors group/row border-b border-gray-800/20 last:border-b-0",
        GUTTER_TASK_INDENT,
        blocked && "opacity-60"
      )}
    >
      {/* Fixed-width gutter slot for bulk selection */}
      <span className={cn("shrink-0 flex items-center justify-center", GUTTER_SELECT_W)} onClick={(e) => e.stopPropagation()}>
        {editMode && onToggleSelection ? (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelection(task.id)}
            className="h-3.5 w-3.5 border-gray-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
          />
        ) : null}
      </span>

      {/* Complete checkbox */}
      <span onClick={(e) => e.stopPropagation()} className="shrink-0">
        <Checkbox
          checked={false}
          onCheckedChange={() => onToggleComplete(task)}
          className="h-3.5 w-3.5 border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
        />
      </span>

      {/* Priority toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); if (onTogglePriority) onTogglePriority(task); }}
        className={cn(
          "shrink-0 p-0 transition-colors",
          task.is_priority
            ? "text-red-500 hover:text-red-400"
            : "text-gray-700 hover:text-red-400 opacity-0 group-hover/row:opacity-100"
        )}
        title={task.is_priority ? "Remove priority" : "Set priority"}
      >
        <Flame className="w-3 h-3" />
      </button>

      {/* Task name — tighter to checkbox */}
      <button
        onClick={() => onTaskClick(task)}
        className="flex-1 min-w-0 text-left text-[13px] text-gray-200 hover:text-white truncate leading-tight -ml-0.5"
      >
        {task.name}
      </button>

      {/* Checklist progress */}
      {checklistProgress && checklistProgress.total > 0 && (
        <span
          className={cn(
            "text-[10px] shrink-0 flex items-center gap-0.5",
            checklistProgress.done === checklistProgress.total ? "text-green-500" : "text-gray-500"
          )}
          title={`Checklist: ${checklistProgress.done}/${checklistProgress.total}`}
        >
          <ListChecks className="w-2.5 h-2.5" />
          {checklistProgress.done}/{checklistProgress.total}
        </span>
      )}

      {/* Dependency indicators — depends on / unlocks */}
      <TooltipProvider delayDuration={200}>
        {depCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("text-[10px] shrink-0 flex items-center gap-0.5", blocked ? "text-red-400" : "text-blue-400/70")}>
                <Lock className="w-2.5 h-2.5" />
                {depCount}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs bg-gray-800 border-gray-700 text-xs">
              <p className="font-medium text-gray-300 mb-0.5">Depends on:</p>
              {(task.dependencies || []).map(depId => {
                const depTask = (projectTasks || []).find(t => t.id === depId) || (allTasks || []).find(t => t.id === depId);
                return <p key={depId} className="text-gray-400">{depTask?.name || depId}</p>;
              })}
            </TooltipContent>
          </Tooltip>
        )}
        {successorCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] shrink-0 flex items-center gap-0.5 text-cyan-400/70">
                <Unlock className="w-2.5 h-2.5" />
                {successorCount}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs bg-gray-800 border-gray-700 text-xs">
              <p className="font-medium text-gray-300 mb-0.5">Unlocks:</p>
              {(successorNames || []).map((name, i) => <p key={i} className="text-gray-400">{name}</p>)}
            </TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>

      {/* Blocking reason — clean single-line display */}
      {blocked && blockingLabel && (
        <span className="text-[9px] text-red-400/80 shrink-0 flex items-center gap-0.5 max-w-[200px] truncate" title={`Blocked by: ${blockingLabel}`}>
          <Clock className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">
            Blocked by: {blockingLabel}
          </span>
        </span>
      )}

      {/* Dependency editor */}
      <span onClick={(e) => e.stopPropagation()} className="shrink-0">
        <WorkloadDependencyEditor
          task={task}
          projectTasks={projectTasks}
          allTasks={allTasks}
          bucketMap={bucketMap}
          teamMemberMap={teamMemberMap}
          updateTaskMutation={updateTaskMutation}
        />
      </span>

      {/* Inline controls — visible on hover */}
      <div className="flex items-center gap-0 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <button className="text-gray-600 hover:text-blue-400 p-0.5 rounded" title="Set due date">
              <CalendarDays className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-700" side="left" align="start">
            <Calendar mode="single" selected={due || undefined} onSelect={handleDateSelect} className="bg-gray-900" />
          </PopoverContent>
        </Popover>

        <Popover open={assignOpen} onOpenChange={setAssignOpen}>
          <PopoverTrigger asChild>
            <button className="text-gray-600 hover:text-blue-400 p-0.5 rounded" title="Assign">
              <User className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1 bg-gray-900 border-gray-700" side="left" align="start">
            <div className="space-y-px max-h-52 overflow-y-auto">
              <button
                onClick={() => handleAssign(null)}
                className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors", !task.assigned_team_member_id ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white")}
              >Unassigned</button>
              {activeMembers.map((tm) => (
                <button key={tm.id} onClick={() => handleAssign(tm.id)}
                  className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors", task.assigned_team_member_id === tm.id ? "bg-blue-900/40 text-blue-300" : "text-gray-300 hover:bg-gray-800")}
                >{tm.full_name}</button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild>
            <button className="text-gray-600 hover:text-blue-400 p-0.5 rounded" title="Change status">
              <CheckCircle2 className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-1 bg-gray-900 border-gray-700" side="left" align="start">
            <div className="space-y-px max-h-52 overflow-y-auto">
              {taskStatuses.map((s) => (
                <button key={s.id} onClick={() => handleStatusChange(s.id)}
                  className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5", task.status_id === s.id ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800")}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Phase move */}
        {updateTaskMutation && (
          <PhaseSelectorPopover
            task={task}
            buckets={bucketMap}
            allTasks={projectTasks}
            onMove={(bucketId) => updateTaskMutation.mutate({ id: task.id, data: { kanban_bucket_id: bucketId || null } })}
          />
        )}
      </div>

      {/* Status badge */}
      {status && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 hidden sm:inline-flex cursor-default" style={{ borderColor: status.color, color: status.color }}>
          {status.label}
        </Badge>
      )}

      {/* Assignee */}
      <span className="text-[11px] text-gray-500 w-14 truncate shrink-0 hidden md:block text-right">
        {assignee?.full_name?.split(" ")[0] || "\u2014"}
      </span>

      {/* Due date */}
      <span className={cn("text-[11px] w-12 shrink-0 text-right hidden sm:block tabular-nums", isOverdue ? "text-red-400 font-semibold" : "text-gray-500")}>
        {due ? format(due, "M/d") : "\u2014"}
      </span>

      {/* Estimated hours */}
      <span className="text-[10px] text-gray-600 w-8 shrink-0 text-right hidden lg:block tabular-nums">
        {task.estimated_hours ? fmtHours(task.estimated_hours) : ""}
      </span>
    </div>
  );
}

// Phase selector — delegates to shared PhaseSelectorPopover

// ── Phase header — visually distinct from task rows ──
function PhaseHeader({ bucket, openCount, expanded, onToggle, editMode, phaseTasks, selectedTaskIds, onToggleTaskSelection, onSelectProjectTasks }) {
  // Selection state for this phase (edit mode)
  const phaseTaskIds = (phaseTasks || []).map(t => t.id);
  const selectedCount = phaseTaskIds.filter(id => selectedTaskIds?.has(id)).length;
  const allSelected = phaseTaskIds.length > 0 && selectedCount === phaseTaskIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const handlePhaseSelect = (e) => {
    e.stopPropagation();
    if (allSelected) {
      phaseTaskIds.forEach(id => onToggleTaskSelection(id));
    } else {
      onSelectProjectTasks(phaseTaskIds);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 py-[5px] pr-3 cursor-pointer hover:bg-gray-700/40 transition-colors border-t border-gray-700/30 bg-gray-800/40",
        GUTTER_PHASE_INDENT
      )}
      onClick={onToggle}
    >
      {/* Fixed-width gutter slot for bulk selection — same width as task row */}
      <span className={cn("shrink-0 flex items-center justify-center", GUTTER_SELECT_W)} onClick={(e) => e.stopPropagation()}>
        {editMode && onToggleTaskSelection && phaseTaskIds.length > 0 ? (
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={handlePhaseSelect}
            className="h-3.5 w-3.5 border-gray-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=indeterminate]:bg-blue-600 data-[state=indeterminate]:border-blue-600"
          />
        ) : null}
      </span>

      {expanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
      <span className="w-[8px] h-[8px] rounded-full shrink-0" style={{ backgroundColor: bucket?.color || '#6B7280' }} />
      <span className="text-[11px] font-bold text-gray-200 uppercase tracking-wider">
        {bucket?.name || "GENERAL / NO PHASE"}
      </span>
      <span className="text-[10px] text-gray-500 font-normal">({openCount})</span>
    </div>
  );
}

// ── Inline checklist items beneath a task ──
function InlineChecklistItems({ items, onToggle, showCompleted = false }) {
  if (!items || items.length === 0) return null;
  const sorted = [...items].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const done = sorted.filter(i => i.is_complete).length;
  const total = sorted.length;
  const remaining = total - done;

  // Auto-collapse when all items are complete
  if (done === total) {
    return (
      <div className="pl-[4.5rem] md:pl-[5rem] pr-3 pb-0.5">
        <span className="text-[10px] text-green-500/80 flex items-center gap-1">
          <Check className="w-2.5 h-2.5" />
          {total}/{total} Complete
        </span>
      </div>
    );
  }

  const openItems = sorted.filter(i => !i.is_complete);
  const completedItems = sorted.filter(i => i.is_complete);

  return (
    <div className="pl-[4.5rem] md:pl-[5rem] pr-3 pb-1 animate-in slide-in-from-top-1 duration-150">
      {/* Checklist header */}
      <div className="text-[10px] text-gray-500 flex items-center gap-1 pb-0.5">
        <ListChecks className="w-2.5 h-2.5 text-gray-600" />
        Checklist ({remaining} Remaining)
      </div>

      {/* Items with vertical guide */}
      <div className="relative ml-[3px]">
        {/* Subtle vertical guide line */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-700/40" />

        {/* Open items */}
        {openItems.map((item, idx) => (
          <div key={item.id} className="flex items-center gap-1.5 py-px pl-3 relative">
            {/* Branch connector */}
            <div className="absolute left-0 top-1/2 w-2 h-px bg-gray-700/40" />
            <button
              onClick={(e) => { e.stopPropagation(); if (onToggle) onToggle(item); }}
              className="shrink-0 w-2.5 h-2.5 rounded-[3px] border border-gray-600/80 hover:border-gray-400 flex items-center justify-center transition-colors"
            />
            <span className="text-[10.5px] leading-tight truncate text-gray-500">
              {item.title}
            </span>
          </div>
        ))}

        {/* Completed items — separated group, only when toggled */}
        {showCompleted && completedItems.length > 0 && (
          <div className="mt-1">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider pl-3 pb-0.5">
              Completed ({completedItems.length})
            </div>
            {completedItems.map(item => (
              <div key={item.id} className="flex items-center gap-1.5 py-px pl-3 relative">
                <div className="absolute left-0 top-1/2 w-2 h-px bg-gray-700/40" />
                <button
                  onClick={(e) => { e.stopPropagation(); if (onToggle) onToggle(item); }}
                  className="shrink-0 w-2.5 h-2.5 rounded-[3px] bg-green-800/40 border border-green-700/50 text-green-500 flex items-center justify-center transition-colors hover:border-green-500"
                  title="Uncheck to reopen"
                >
                  <Check className="w-2 h-2" />
                </button>
                <span className="text-[10px] leading-tight truncate text-gray-600/70 line-through">
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Show completed toggle hint */}
      {!showCompleted && completedItems.length > 0 && (
        <div className="text-[9px] text-gray-600/60 pl-3 mt-px">
          {completedItems.length} completed
        </div>
      )}
    </div>
  );
}

// ── Main project group ──
export default function WorkloadProjectGroup({
  project,
  label,
  tasks,
  allProjectTasks,
  teamMemberMap,
  statusMap,
  blockedSet,
  blockingLabels,
  buckets,
  defaultExpanded,
  teamMembers,
  statuses,
  onToggleComplete,
  onTaskClick,
  onAddTask,
  onUpdateDueDate,
  onTogglePriority,
  updateTaskMutation,
  selectedTaskIds,
  onToggleTaskSelection,
  onSelectProjectTasks,
  allTasks = [],
  checklistsByTaskId = {},
  weekLabel = "",
  editMode = false,
  showChecklists = false,
  showCompletedChecklist = false,
  onToggleChecklistItem,
}) {
  const projectId = project?.id || "__no_project__";
  
  // Collapse memory — projects
  const [expanded, setExpanded] = useState(() => {
    const saved = loadCollapseState();
    if (saved[`proj_${projectId}`] !== undefined) return saved[`proj_${projectId}`];
    return defaultExpanded;
  });

  // Collapse memory — phases
  const [collapsedPhases, setCollapsedPhases] = useState(() => {
    const saved = loadCollapseState();
    const set = new Set();
    Object.keys(saved).forEach(k => {
      if (k.startsWith(`phase_${projectId}_`) && saved[k] === false) {
        set.add(k.replace(`phase_${projectId}_`, ""));
      }
    });
    return set;
  });
  
  const [showAll, setShowAll] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const { toast } = useToast();

  const INITIAL_VISIBLE = 12;

  // Persist project expand/collapse
  const handleToggleProject = useCallback(() => {
    setExpanded(prev => {
      const next = !prev;
      const saved = loadCollapseState();
      saved[`proj_${projectId}`] = next;
      saveCollapseState(saved);
      return next;
    });
  }, [projectId]);

  // Persist phase expand/collapse
  const togglePhase = useCallback((phaseId) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev);
      const wasCollapsed = next.has(phaseId);
      if (wasCollapsed) next.delete(phaseId);
      else next.add(phaseId);
      // Save
      const saved = loadCollapseState();
      saved[`phase_${projectId}_${phaseId}`] = wasCollapsed; // true = expanded, false = collapsed
      saveCollapseState(saved);
      return next;
    });
  }, [projectId]);

  // Build bucket map for this project
  const bucketMap = useMemo(() => {
    const m = new Map();
    (buckets || []).forEach(b => m.set(b.id, b));
    return m;
  }, [buckets]);

  // Successor map
  const successorMap = useMemo(() => {
    const m = new Map();
    const allP = allProjectTasks || tasks;
    allP.forEach(t => {
      (t.dependencies || []).forEach(depId => {
        if (!m.has(depId)) m.set(depId, []);
        m.get(depId).push(t);
      });
    });
    return m;
  }, [allProjectTasks, tasks]);

  // Checklist progress per task
  const checklistProgressMap = useMemo(() => {
    const m = {};
    Object.entries(checklistsByTaskId).forEach(([tid, items]) => {
      if (items.length > 0) {
        m[tid] = { done: items.filter(i => i.is_complete).length, total: items.length };
      }
    });
    return m;
  }, [checklistsByTaskId]);

  // Open task count
  const openTaskCount = useMemo(() => {
    return (allProjectTasks || []).filter(t => t.status_id !== DONE_STATUS_ID).length;
  }, [allProjectTasks]);

  const currentPhaseLabel = project?.current_phase_name || null;

  // Print handler
  const handleProjectPrint = useCallback((opts) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "Print window blocked", variant: "destructive" });
      return;
    }

    const printTasks = opts.scope === "current"
      ? tasks
      : (allProjectTasks || []).filter(t => t.status_id !== DONE_STATUS_ID);

    const html = buildProjectWorkPacketHTML({
      project,
      tasks: printTasks,
      buckets: buckets || [],
      teamMemberMap,
      blockingLabels: blockingLabels || {},
      blockedSet: blockedSet || new Set(),
      successorMap,
      checklistsByTaskId: opts.includeChecklists ? checklistsByTaskId : {},
      weekLabel,
      options: {
        includeChecklists: opts.includeChecklists,
        includeCompletionMarks: opts.includeCompletionMarks,
        includeNotes: opts.includeNotes,
      },
    });

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }, [tasks, allProjectTasks, project, buckets, teamMemberMap, blockingLabels, blockedSet, successorMap, checklistsByTaskId, weekLabel, toast]);

  const visibleTasks = showAll ? tasks : tasks.slice(0, INITIAL_VISIBLE);
  const remaining = tasks.length - INITIAL_VISIBLE;

  return (
    <div>
      {/* ── Project header — primary visual anchor ── */}
      <div
        className="flex items-center gap-2 px-3 py-3 bg-gray-800/60 hover:bg-gray-800/70 cursor-pointer transition-colors mt-2 first:mt-0 border-t-2 border-gray-600/60 group"
        onClick={handleToggleProject}
      >
        {/* Fixed-width gutter slot for bulk selection — same width as task gutter */}
        <span className={cn("shrink-0 flex items-center justify-center", GUTTER_SELECT_W)} onClick={(e) => e.stopPropagation()}>
          {editMode && onSelectProjectTasks ? (() => {
            const taskIds = tasks.map(t => t.id);
            const selCount = taskIds.filter(id => selectedTaskIds?.has(id)).length;
            const allSel = taskIds.length > 0 && selCount === taskIds.length;
            const someSel = selCount > 0 && !allSel;
            return (
              <Checkbox
                checked={allSel ? true : someSel ? "indeterminate" : false}
                onCheckedChange={() => {
                  if (allSel) taskIds.forEach(id => onToggleTaskSelection(id));
                  else onSelectProjectTasks(taskIds);
                }}
                className="h-3.5 w-3.5 border-gray-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=indeterminate]:bg-blue-600 data-[state=indeterminate]:border-blue-600"
              />
            );
          })() : null}
        </span>

        {expanded
          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        }

        {/* Project name — strongest typography */}
        <span className="text-[15px] font-bold text-white tracking-tight truncate min-w-0">
          {project?.name || label || "No Project"}
        </span>

        {/* Section task count */}
        <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
          {tasks.length}
        </span>

        {/* Current phase label — subtle */}
        {currentPhaseLabel && (
          <span className="text-[9px] text-gray-600 shrink-0 hidden md:inline truncate max-w-[120px]" title={`Phase: ${currentPhaseLabel}`}>
            · {currentPhaseLabel}
          </span>
        )}

        {/* Actions — always right-aligned */}
        {project && (
          <div className="flex items-center gap-0.5 shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
            <Link
              to={buildProjectDetailUrl(project.id, { source: SOURCES.PRIORITIES })}
              className="text-[10px] text-gray-500 hover:text-white px-1 py-0.5 rounded hover:bg-gray-700 transition-colors"
              title="Open project"
            >
              Open
            </Link>
            <button
              onClick={() => onAddTask(project.id)}
              className="text-green-500 hover:text-green-300 px-0.5 py-0.5 rounded hover:bg-green-900/20 transition-colors"
              title="Add task"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPrintModalOpen(true)}
              className="text-gray-500 hover:text-white px-0.5 py-0.5 rounded hover:bg-gray-700 transition-colors"
              title="Print work packet"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Task rows — grouped by phase */}
      {expanded && (
        <div>
          {(() => {
            const projectBuckets = buckets || [];
            const sortedBuckets = [...projectBuckets].sort((a, b) => (a.order || 0) - (b.order || 0));
            
            const byPhase = new Map();
            const unphased = [];
            const allVisibleTasks = showAll ? tasks : tasks.slice(0, INITIAL_VISIBLE);
            
            allVisibleTasks.forEach(t => {
              if (t.kanban_bucket_id && bucketMap.has(t.kanban_bucket_id)) {
                if (!byPhase.has(t.kanban_bucket_id)) byPhase.set(t.kanban_bucket_id, []);
                byPhase.get(t.kanban_bucket_id).push(t);
              } else {
                unphased.push(t);
              }
            });

            const hasPhases = sortedBuckets.some(b => byPhase.has(b.id));

            const renderTaskRow = (task) => {
              const succs = successorMap.get(task.id) || [];
              const clItems = showChecklists ? (checklistsByTaskId[task.id] || []) : [];
              return (
                <React.Fragment key={task.id}>
                  <WorkloadTaskRow
                    task={task}
                    assignee={teamMemberMap.get(task.assigned_team_member_id)}
                    status={statusMap.get(task.status_id)}
                    blocked={blockedSet.has(task.id)}
                    blockingLabel={blockingLabels?.[task.id] || null}
                    teamMembers={teamMembers}
                    statuses={statuses}
                    onToggleComplete={onToggleComplete}
                    onTaskClick={onTaskClick}
                    onUpdateDueDate={onUpdateDueDate}
                    onTogglePriority={onTogglePriority}
                    updateTaskMutation={updateTaskMutation}
                    isSelected={selectedTaskIds?.has(task.id)}
                    onToggleSelection={onToggleTaskSelection}
                    projectTasks={allProjectTasks || tasks}
                    allTasks={allTasks}
                    bucketMap={bucketMap}
                    teamMemberMap={teamMemberMap}
                    checklistProgress={checklistProgressMap[task.id]}
                    successorCount={succs.length}
                    successorNames={succs.map(s => s.name)}
                    editMode={editMode}
                  />
                  {clItems.length > 0 && (
                    <InlineChecklistItems
                      items={clItems}
                      onToggle={onToggleChecklistItem}
                      showCompleted={showCompletedChecklist}
                    />
                  )}
                </React.Fragment>
              );
            };
            
            if (!hasPhases) {
              return allVisibleTasks.map(renderTaskRow);
            }

            return (
              <>
                {sortedBuckets.map(bucket => {
                  const phaseTasks = byPhase.get(bucket.id);
                  if (!phaseTasks || phaseTasks.length === 0) return null;
                  const openCount = phaseTasks.filter(t => t.status_id !== DONE_STATUS_ID).length;
                  const isPhaseCollapsed = collapsedPhases.has(bucket.id);

                  return (
                    <div key={bucket.id}>
                      <PhaseHeader
                        bucket={bucket}
                        openCount={openCount}
                        expanded={!isPhaseCollapsed}
                        onToggle={() => togglePhase(bucket.id)}
                        editMode={editMode}
                        phaseTasks={phaseTasks}
                        selectedTaskIds={selectedTaskIds}
                        onToggleTaskSelection={onToggleTaskSelection}
                        onSelectProjectTasks={onSelectProjectTasks}
                      />
                      {!isPhaseCollapsed && phaseTasks.map(renderTaskRow)}
                    </div>
                  );
                })}
                {unphased.length > 0 && (
                  <div>
                    <PhaseHeader
                      bucket={null}
                      openCount={unphased.filter(t => t.status_id !== DONE_STATUS_ID).length}
                      expanded={!collapsedPhases.has("__unphased__")}
                      onToggle={() => togglePhase("__unphased__")}
                      editMode={editMode}
                      phaseTasks={unphased}
                      selectedTaskIds={selectedTaskIds}
                      onToggleTaskSelection={onToggleTaskSelection}
                      onSelectProjectTasks={onSelectProjectTasks}
                    />
                    {!collapsedPhases.has("__unphased__") && unphased.map(renderTaskRow)}
                  </div>
                )}
              </>
            );
          })()}
          {!showAll && remaining > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-1.5 text-center text-xs text-gray-500 hover:text-white hover:bg-gray-800/40 transition-colors flex items-center justify-center gap-1"
            >
              <ChevronDown className="w-3 h-3" />
              Show {remaining} More Tasks
            </button>
          )}
          {showAll && remaining > 0 && (
            <button
              onClick={() => setShowAll(false)}
              className="w-full py-1 text-center text-[11px] text-gray-600 hover:text-gray-400 transition-colors flex items-center justify-center gap-1"
            >
              <ChevronRight className="w-3 h-3 -rotate-90" />
              Collapse Tasks
            </button>
          )}
        </div>
      )}

      {/* Project print modal */}
      <WorkloadProjectPrintModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        project={project}
        sectionTaskCount={tasks.length}
        allOpenTaskCount={openTaskCount}
        onPrint={handleProjectPrint}
      />
    </div>
  );
}