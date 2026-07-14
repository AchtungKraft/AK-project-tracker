import React, { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronRight,
  Flame,
  Ban,
  User,
  Plus,
  Printer,
  Timer,
  CalendarDays,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Square,
} from "lucide-react";
import { format, startOfDay, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import { OPERATIONAL_STATE_CONFIG } from "@/components/workflow/useProjectWorkflow";

const INITIAL_VISIBLE = 8;

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtHours(h) {
  if (!h || h === 0) return "0h";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h${mins}m`;
}

// ── Inline task row with full editing parity ──
function WorkloadTaskRow({
  task,
  assignee,
  status,
  blocked,
  teamMembers,
  statuses,
  onToggleComplete,
  onTaskClick,
  onUpdateDueDate,
  onTogglePriority,
  updateTaskMutation,
  isSelected,
  onToggleSelection,
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

  const handleDateSelect = useCallback(
    (date) => {
      if (onUpdateDueDate) onUpdateDueDate(task, date);
      setDateOpen(false);
    },
    [task, onUpdateDueDate]
  );

  const handleAssign = useCallback(
    (memberId) => {
      if (updateTaskMutation) updateTaskMutation.mutate({ id: task.id, data: { assigned_team_member_id: memberId } });
      setAssignOpen(false);
    },
    [task, updateTaskMutation]
  );

  const handleStatusChange = useCallback(
    (statusId) => {
      if (updateTaskMutation) updateTaskMutation.mutate({ id: task.id, data: { status_id: statusId } });
      setStatusOpen(false);
    },
    [task, updateTaskMutation]
  );

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-[5px] hover:bg-gray-800/40 transition-colors group/row border-b border-gray-800/20 last:border-b-0",
        blocked && "opacity-50"
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
        onClick={(e) => {
          e.stopPropagation();
          if (onTogglePriority) onTogglePriority(task);
        }}
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

      {blocked && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 border-red-700 text-red-500 bg-red-900/20 shrink-0 gap-0.5">
          <Ban className="w-2.5 h-2.5" />
          Blocked
        </Badge>
      )}

      {/* Operational state — secondary workflow context */}
      {(() => {
        const opState = task.operational_state;
        if (!opState || opState === "COMPLETED" || opState === "NOT_STARTED" || opState === "READY") return null;
        const cfg = OPERATIONAL_STATE_CONFIG[opState];
        if (!cfg) return null;
        return (
          <Badge className={cn("text-[9px] px-1 py-0 h-4 border-0 shrink-0 hidden sm:inline-flex", cfg.bgClass, cfg.textClass)}>
            {cfg.label}
          </Badge>
        );
      })()}

      {/* Inline controls — visible on hover */}
      <div className="flex items-center gap-0 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        {/* Due date editor */}
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

        {/* Assignment selector */}
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
                className={cn(
                  "w-full text-left px-2 py-1 rounded text-xs transition-colors",
                  !task.assigned_team_member_id ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                )}
              >
                Unassigned
              </button>
              {activeMembers.map((tm) => (
                <button
                  key={tm.id}
                  onClick={() => handleAssign(tm.id)}
                  className={cn(
                    "w-full text-left px-2 py-1 rounded text-xs transition-colors",
                    task.assigned_team_member_id === tm.id ? "bg-blue-900/40 text-blue-300" : "text-gray-300 hover:bg-gray-800"
                  )}
                >
                  {tm.full_name}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Status selector */}
        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild>
            <button className="text-gray-600 hover:text-blue-400 p-0.5 rounded" title="Change status">
              <CheckCircle2 className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-1 bg-gray-900 border-gray-700" side="left" align="start">
            <div className="space-y-px max-h-52 overflow-y-auto">
              {taskStatuses.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleStatusChange(s.id)}
                  className={cn(
                    "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5",
                    task.status_id === s.id ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800"
                  )}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Status badge — always visible */}
      {status && (
        <Popover open={false}>
          <Badge
            variant="outline"
            className="text-[9px] px-1 py-0 shrink-0 hidden sm:inline-flex cursor-default"
            style={{ borderColor: status.color, color: status.color }}
          >
            {status.label}
          </Badge>
        </Popover>
      )}

      {/* Assignee */}
      <span className="text-[11px] text-gray-500 w-14 truncate shrink-0 hidden md:block text-right">
        {assignee?.full_name?.split(" ")[0] || "—"}
      </span>

      {/* Due date */}
      <span
        className={cn(
          "text-[11px] w-12 shrink-0 text-right hidden sm:block tabular-nums",
          isOverdue ? "text-red-400 font-semibold" : "text-gray-500"
        )}
      >
        {due ? format(due, "M/d") : "—"}
      </span>

      {/* Estimated hours */}
      <span className="text-[10px] text-gray-600 w-8 shrink-0 text-right hidden lg:block tabular-nums">
        {task.estimated_hours ? fmtHours(task.estimated_hours) : ""}
      </span>
    </div>
  );
}

// ── Project group with enhanced header + progressive disclosure ──
export default function WorkloadProjectGroup({
  project,
  label,
  tasks,
  allProjectTasks,
  teamMemberMap,
  statusMap,
  blockedSet,
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
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  const DONE_STATUS_ID = "6913f57422230d8c7ee2ef54";

  // Stats from the tasks in THIS section (not all project tasks)
  const sectionStats = useMemo(() => {
    let est = 0;
    let unassigned = 0;
    let blocked = 0;
    let overdue = 0;
    const today = startOfDay(new Date());
    tasks.forEach((t) => {
      if (t.estimated_hours > 0) est += t.estimated_hours;
      if (!t.assigned_team_member_id) unassigned++;
      if (blockedSet.has(t.id)) blocked++;
      const d = parseLocalDate(t.due_date);
      if (d && isBefore(d, today)) overdue++;
    });
    return { est, unassigned, blocked, overdue };
  }, [tasks, blockedSet]);

  // Progress from ALL tasks in this project (not just this section)
  const progress = useMemo(() => {
    if (!allProjectTasks || allProjectTasks.length === 0) return null;
    const total = allProjectTasks.length;
    const completed = allProjectTasks.filter((t) => t.status_id === DONE_STATUS_ID).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, pct };
  }, [allProjectTasks]);

  const visibleTasks = showAll ? tasks : tasks.slice(0, INITIAL_VISIBLE);
  const remaining = tasks.length - INITIAL_VISIBLE;

  return (
    <div>
      {/* Project header */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-800/20 hover:bg-gray-800/40 cursor-pointer transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Select project tasks button */}
        {onSelectProjectTasks && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const taskIds = tasks.map((t) => t.id);
              const allSelected = taskIds.every((id) => selectedTaskIds?.has(id));
              if (allSelected) {
                // Deselect all in this project (toggle each off)
                taskIds.forEach((id) => onToggleTaskSelection(id));
              } else {
                onSelectProjectTasks(taskIds);
              }
            }}
            className="shrink-0 text-gray-600 hover:text-blue-400 transition-colors"
            title="Select all tasks in this project"
          >
            {tasks.every((t) => selectedTaskIds?.has(t.id))
              ? <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
              : <Square className="w-3.5 h-3.5" />
            }
          </button>
        )}

        {expanded ? (
          <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
        )}

        {/* Full project name — matches Execution view */}
        <span className="text-sm font-bold text-gray-100 truncate min-w-0">
          {project?.name || label || "No Project"}
        </span>
        <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[9px] px-1 py-0 shrink-0">
          {tasks.length}
        </Badge>

        {/* Compact metrics */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {sectionStats.est > 0 && (
            <span className="text-[10px] text-gray-500 tabular-nums hidden sm:flex items-center gap-0.5" title="Estimated hours">
              <Timer className="w-2.5 h-2.5" />
              {fmtHours(sectionStats.est)}
            </span>
          )}
          {sectionStats.overdue > 0 && (
            <span className="text-[10px] text-red-500 tabular-nums hidden sm:flex items-center gap-0.5" title="Overdue">
              <AlertTriangle className="w-2.5 h-2.5" />
              {sectionStats.overdue}
            </span>
          )}
          {sectionStats.unassigned > 0 && (
            <span className="text-[10px] text-yellow-500 tabular-nums hidden sm:flex items-center gap-0.5" title="Unassigned">
              <User className="w-2.5 h-2.5" />
              {sectionStats.unassigned}
            </span>
          )}
          {sectionStats.blocked > 0 && (
            <span className="text-[10px] text-red-500 tabular-nums hidden sm:flex items-center gap-0.5" title="Blocked">
              <Ban className="w-2.5 h-2.5" />
              {sectionStats.blocked}
            </span>
          )}
          {progress && (
            <span className="text-[10px] text-gray-500 tabular-nums hidden md:flex items-center gap-1" title={`${progress.completed}/${progress.total} complete`}>
              <Progress value={progress.pct} className="w-10 h-1.5 bg-gray-800" />
              <span>{progress.pct}%</span>
            </span>
          )}
        </div>

        {/* Actions */}
        {project && (
          <div className="flex items-center gap-0.5 shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
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
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={() => window.open(`/projectprintview?id=${project.id}`, "_blank")}
              className="text-gray-600 hover:text-white px-0.5 py-0.5 rounded hover:bg-gray-700 transition-colors"
              title="Print project tasks"
            >
              <Printer className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Task rows */}
      {expanded && (
        <div>
          {visibleTasks.map((task) => (
            <WorkloadTaskRow
              key={task.id}
              task={task}
              assignee={teamMemberMap.get(task.assigned_team_member_id)}
              status={statusMap.get(task.status_id)}
              blocked={blockedSet.has(task.id)}
              teamMembers={teamMembers}
              statuses={statuses}
              onToggleComplete={onToggleComplete}
              onTaskClick={onTaskClick}
              onUpdateDueDate={onUpdateDueDate}
              onTogglePriority={onTogglePriority}
              updateTaskMutation={updateTaskMutation}
              isSelected={selectedTaskIds?.has(task.id)}
              onToggleSelection={onToggleTaskSelection}
            />
          ))}
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
              <ChevronRight className="w-3 h-3 rotate-[-90deg]" />
              Collapse Tasks
            </button>
          )}
        </div>
      )}
    </div>
  );
}