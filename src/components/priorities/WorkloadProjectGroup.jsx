import React, { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  ChevronDown,
  ChevronRight,
  Flame,
  User,
  Plus,
  Printer,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Square,
  Clock,
  Link2,
  ListChecks,
  Layers,
} from "lucide-react";
import { format, startOfDay, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import WorkloadDependencyEditor from "@/components/workload/WorkloadDependencyEditor";
import WorkloadProjectPrintModal from "@/components/workload/WorkloadProjectPrintModal";
import buildProjectWorkPacketHTML from "@/components/workload/buildProjectWorkPacketHTML";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
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
        "flex items-center gap-1.5 px-2 py-[5px] hover:bg-gray-800/40 transition-colors group/row border-b border-gray-800/20 last:border-b-0",
        blocked && "opacity-60"
      )}
    >
      {/* Selection checkbox */}
      {onToggleSelection && (
        <span onClick={(e) => e.stopPropagation()} className="shrink-0">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelection(task.id)}
            className="h-3.5 w-3.5 border-gray-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
          />
        </span>
      )}

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

      {/* Task name */}
      <button
        onClick={() => onTaskClick(task)}
        className="flex-1 min-w-0 text-left text-[13px] text-gray-200 hover:text-white truncate leading-tight"
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

      {/* Dependency indicator */}
      {(depCount > 0 || successorCount > 0) && (
        <span
          className={cn(
            "text-[9px] shrink-0 flex items-center gap-0.5",
            blocked ? "text-red-400" : "text-blue-400/70"
          )}
          title={blocked ? blockingLabel : `${depCount} dep${depCount !== 1 ? 's' : ''}, unlocks ${successorCount}`}
        >
          <Link2 className="w-2.5 h-2.5" />
          {blocked ? "" : (successorCount > 0 ? `↗${successorCount}` : "")}
        </span>
      )}

      {/* Blocking reason */}
      {blocked && (
        <span className="text-[9px] text-red-400 shrink-0 flex items-center gap-0.5 max-w-[180px] truncate" title={blockingLabel}>
          <Clock className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{blockingLabel}</span>
        </span>
      )}

      {/* Workflow decoration — subtle for waiting states */}
      {!blocked && (() => {
        const opState = task.operational_state;
        if (!opState || opState === "COMPLETED" || opState === "NOT_STARTED" || opState === "READY" || opState === "IN_PROGRESS") return null;
        const WAITING_LABELS = {
          WAITING_ON_PARTS: "Parts",
          WAITING_ON_VENDOR: "Vendor",
          WAITING_ON_CUSTOMER: "Customer",
          REVIEW_REQUIRED: "Review",
          BLOCKED: "Blocked",
        };
        const label = WAITING_LABELS[opState];
        if (!label) return null;
        return (
          <span className="text-[9px] text-amber-400/80 shrink-0 hidden sm:inline">
            {label}
          </span>
        );
      })()}

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
          <PhaseSelector task={task} bucketMap={bucketMap} updateTaskMutation={updateTaskMutation} />
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

// Compact phase selector for inline task row
function PhaseSelector({ task, bucketMap, updateTaskMutation }) {
  const [open, setOpen] = useState(false);
  const buckets = useMemo(() => {
    return Array.from(bucketMap.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [bucketMap]);

  if (buckets.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-gray-600 hover:text-blue-400 p-0.5 rounded" title="Move to phase">
          <Layers className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1 bg-gray-900 border-gray-700" side="left" align="start">
        <p className="text-[9px] text-gray-500 uppercase tracking-wider px-2 py-1">Move to Phase</p>
        <div className="space-y-px max-h-52 overflow-y-auto">
          {buckets.map(b => (
            <button key={b.id} onClick={() => {
              updateTaskMutation.mutate({ id: task.id, data: { kanban_bucket_id: b.id } });
              setOpen(false);
            }}
              className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5",
                task.kanban_bucket_id === b.id ? "bg-blue-900/40 text-blue-300" : "text-gray-300 hover:bg-gray-800"
              )}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color || '#6B7280' }} />
              {b.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Phase header with collapse ──
function PhaseHeader({ bucket, taskCount, openCount, doneCount, expanded, onToggle, onAddTask }) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-[4px] bg-gray-800/15 border-t border-gray-800/40 cursor-pointer hover:bg-gray-800/25 transition-colors"
      onClick={onToggle}
    >
      {expanded ? <ChevronDown className="w-2.5 h-2.5 text-gray-500" /> : <ChevronRight className="w-2.5 h-2.5 text-gray-500" />}
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: bucket?.color || '#6B7280' }} />
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{bucket?.name || "Unassigned Phase"}</span>
      <span className="text-[9px] text-gray-500 ml-1">
        {openCount} open{doneCount > 0 ? ` \u00B7 ${doneCount} done` : ""}
      </span>
      {onAddTask && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddTask(); }}
          className="ml-auto text-gray-600 hover:text-green-400 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
          title="Add task to this phase"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
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
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [collapsedPhases, setCollapsedPhases] = useState(new Set());
  const [showAll, setShowAll] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const { toast } = useToast();

  const INITIAL_VISIBLE = 12;

  // Build bucket map for this project
  const bucketMap = useMemo(() => {
    const m = new Map();
    (buckets || []).forEach(b => m.set(b.id, b));
    return m;
  }, [buckets]);

  // Successor map — derived from project tasks
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

  // Open task count for this project
  const openTaskCount = useMemo(() => {
    return (allProjectTasks || []).filter(t => t.status_id !== DONE_STATUS_ID).length;
  }, [allProjectTasks]);

  // Current phase label
  const currentPhaseLabel = project?.current_phase_name || null;

  const togglePhase = useCallback((phaseId) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }, []);

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
      {/* ── Project header — visually distinct ── */}
      <div
        className="flex items-center gap-1.5 px-2 py-2 bg-gray-800/40 hover:bg-gray-800/50 cursor-pointer transition-colors border-t-2 border-gray-700/60 group"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Select project tasks */}
        {onSelectProjectTasks && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const taskIds = tasks.map(t => t.id);
              const allSelected = taskIds.every(id => selectedTaskIds?.has(id));
              if (allSelected) taskIds.forEach(id => onToggleTaskSelection(id));
              else onSelectProjectTasks(taskIds);
            }}
            className="shrink-0 text-gray-600 hover:text-blue-400 transition-colors"
            title="Select all tasks in this project"
          >
            {tasks.every(t => selectedTaskIds?.has(t.id))
              ? <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
              : <Square className="w-3.5 h-3.5" />
            }
          </button>
        )}

        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        }

        {/* Project name — stronger typography */}
        <span className="text-sm font-bold text-white truncate min-w-0">
          {project?.name || label || "No Project"}
        </span>

        {/* Task count in this section */}
        <Badge className="bg-gray-700 text-gray-300 border-gray-600 text-[10px] px-1.5 py-0 shrink-0">
          {tasks.length}
        </Badge>

        {/* Open task count */}
        {openTaskCount > 0 && openTaskCount !== tasks.length && (
          <span className="text-[10px] text-gray-500 shrink-0 hidden sm:inline">
            {openTaskCount} open
          </span>
        )}

        {/* Current phase */}
        {currentPhaseLabel && (
          <span className="text-[10px] text-gray-500 shrink-0 hidden md:inline truncate max-w-[120px]" title={`Current: ${currentPhaseLabel}`}>
            {currentPhaseLabel}
          </span>
        )}

        {/* Actions */}
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

            const renderTaskRow = (task) => (
              <WorkloadTaskRow
                key={task.id}
                task={task}
                assignee={teamMemberMap.get(task.assigned_team_member_id)}
                status={statusMap.get(task.status_id)}
                blocked={blockedSet.has(task.id)}
                blockingLabel={blockingLabels?.[task.id] || "Blocked"}
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
                successorCount={(successorMap.get(task.id) || []).length}
              />
            );
            
            if (!hasPhases) {
              return allVisibleTasks.map(renderTaskRow);
            }

            return (
              <>
                {sortedBuckets.map(bucket => {
                  const phaseTasks = byPhase.get(bucket.id);
                  if (!phaseTasks || phaseTasks.length === 0) return null;
                  const openCount = phaseTasks.filter(t => t.status_id !== DONE_STATUS_ID).length;
                  const doneCount = phaseTasks.length - openCount;
                  const isPhaseCollapsed = collapsedPhases.has(bucket.id);

                  return (
                    <div key={bucket.id}>
                      <PhaseHeader
                        bucket={bucket}
                        taskCount={phaseTasks.length}
                        openCount={openCount}
                        doneCount={doneCount}
                        expanded={!isPhaseCollapsed}
                        onToggle={() => togglePhase(bucket.id)}
                        onAddTask={project ? () => onAddTask(project.id) : null}
                      />
                      {!isPhaseCollapsed && phaseTasks.map(renderTaskRow)}
                    </div>
                  );
                })}
                {unphased.length > 0 && (
                  <div>
                    <PhaseHeader
                      bucket={null}
                      taskCount={unphased.length}
                      openCount={unphased.filter(t => t.status_id !== DONE_STATUS_ID).length}
                      doneCount={unphased.filter(t => t.status_id === DONE_STATUS_ID).length}
                      expanded={!collapsedPhases.has("__unphased__")}
                      onToggle={() => togglePhase("__unphased__")}
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