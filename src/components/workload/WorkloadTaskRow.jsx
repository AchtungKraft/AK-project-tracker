import React, { useState, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Flame, Ban, User, CalendarDays, CheckCircle2, Clock, GitBranch, AlertTriangle,
} from "lucide-react";
import { format, startOfDay, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import { OPERATIONAL_STATE_CONFIG } from "@/components/workflow/useProjectWorkflow";
import { BLOCKER_TYPE_LABELS } from "./workloadConfig";

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtHours(h) {
  if (!h) return "";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h${mins}m`;
}

function BlockerSummary({ reasons }) {
  if (!reasons || reasons.length === 0) return null;
  const primary = reasons[0];
  const typeLabel = BLOCKER_TYPE_LABELS[primary.type] || primary.type;
  const extra = reasons.length - 1;

  const content = (
    <span className="flex items-center gap-1 text-[10px] text-red-400 truncate max-w-[180px]">
      <Ban className="w-2.5 h-2.5 shrink-0" />
      <span className="truncate">{primary.label || typeLabel}</span>
      {extra > 0 && <span className="text-red-500 shrink-0">+{extra}</span>}
    </span>
  );

  if (reasons.length <= 1) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs bg-gray-800 border-gray-700">
        <div className="space-y-1">
          <p className="text-xs font-medium text-white">Blocking Reasons:</p>
          {reasons.map((r, i) => (
            <p key={i} className="text-xs text-gray-300">
              • <span className="text-gray-500">{BLOCKER_TYPE_LABELS[r.type] || r.type}:</span> {r.label}
            </p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default function WorkloadTaskRow({
  task,
  assignee,
  status,
  phaseName,
  successorCount = 0,
  teamMembers,
  statuses,
  onToggleComplete,
  onTaskClick,
  onUpdateDueDate,
  onTogglePriority,
  updateTaskMutation,
  isSelected,
  onToggleSelection,
  showPhase = false,
  showOperationalState = false,
}) {
  const due = parseLocalDate(task.due_date);
  const todayStart = startOfDay(new Date());
  const isOverdue = due && isBefore(due, todayStart);
  const opState = task.operational_state;
  const stateConfig = opState ? OPERATIONAL_STATE_CONFIG[opState] : null;
  const blockingReasons = task.blocking_reasons || [];
  const isOverride = !!task.manual_override;

  const [dateOpen, setDateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const activeMembers = useMemo(() => (teamMembers || []).filter(tm => tm.active), [teamMembers]);
  const taskStatuses = useMemo(
    () => (statuses || []).filter(s => s.scope === "Task" && s.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
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

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-[5px] hover:bg-gray-800/40 transition-colors group/row border-b border-gray-800/20 last:border-b-0",
      )}
    >
      {/* Selection checkbox */}
      {onToggleSelection && (
        <span onClick={e => e.stopPropagation()} className="shrink-0">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelection(task.id)}
            className="h-3.5 w-3.5 border-gray-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
          />
        </span>
      )}

      {/* Complete checkbox */}
      <span onClick={e => e.stopPropagation()} className="shrink-0">
        <Checkbox
          checked={false}
          onCheckedChange={() => onToggleComplete(task)}
          className="h-3.5 w-3.5 border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
        />
      </span>

      {/* Priority toggle */}
      <button
        onClick={e => { e.stopPropagation(); if (onTogglePriority) onTogglePriority(task); }}
        className={cn(
          "shrink-0 p-0 transition-colors",
          task.is_priority ? "text-red-500 hover:text-red-400" : "text-gray-700 hover:text-red-400 opacity-0 group-hover/row:opacity-100"
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

      {/* Phase badge */}
      {showPhase && phaseName && (
        <span className="text-[9px] text-gray-500 bg-gray-800/60 px-1 py-0 rounded shrink-0 hidden lg:inline truncate max-w-[80px]">
          {phaseName}
        </span>
      )}

      {/* Blocker summary — only in non-blocked sections or when showing operational state */}
      {blockingReasons.length > 0 && (
        <BlockerSummary reasons={blockingReasons} />
      )}

      {/* Operational state badge — only when showOperationalState is true (e.g. IN_PROGRESS with conflict) */}
      {showOperationalState && stateConfig && opState !== "COMPLETED" && (
        <Badge
          className={cn("text-[9px] px-1 py-0 h-4 border-0 shrink-0", stateConfig.bgClass, stateConfig.textClass, isOverride && "ring-1 ring-amber-500/50")}
        >
          {stateConfig.label}
        </Badge>
      )}

      {/* Downstream count */}
      {successorCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-0.5 text-[10px] text-cyan-400 shrink-0">
              <GitBranch className="w-2.5 h-2.5" />
              {successorCount}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-gray-800 border-gray-700">
            <p className="text-xs">Blocks {successorCount} downstream task{successorCount !== 1 ? "s" : ""}</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Unassigned indicator */}
      {!task.assigned_team_member_id && (
        <span className="text-[9px] text-yellow-500 bg-yellow-900/20 px-1 rounded shrink-0 hidden sm:inline">
          Unassigned
        </span>
      )}

      {/* Inline controls — visible on hover */}
      <div className="flex items-center gap-0 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
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
              <button onClick={() => handleAssign(null)} className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors", !task.assigned_team_member_id ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white")}>
                Unassigned
              </button>
              {activeMembers.map(tm => (
                <button key={tm.id} onClick={() => handleAssign(tm.id)} className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors", task.assigned_team_member_id === tm.id ? "bg-blue-900/40 text-blue-300" : "text-gray-300 hover:bg-gray-800")}>
                  {tm.full_name}
                </button>
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
              {taskStatuses.map(s => (
                <button key={s.id} onClick={() => handleStatusChange(s.id)} className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5", task.status_id === s.id ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800")}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Status badge */}
      {status && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 hidden sm:inline-flex cursor-default" style={{ borderColor: status.color, color: status.color }}>
          {status.label}
        </Badge>
      )}

      {/* Assignee */}
      <span className="text-[11px] text-gray-500 w-14 truncate shrink-0 hidden md:block text-right">
        {assignee?.full_name?.split(" ")[0] || ""}
      </span>

      {/* Due date */}
      <span className={cn("text-[11px] w-12 shrink-0 text-right hidden sm:block tabular-nums", isOverdue ? "text-red-400 font-semibold" : "text-gray-500")}>
        {due ? format(due, "M/d") : "—"}
      </span>

      {/* Estimated hours */}
      <span className="text-[10px] text-gray-600 w-8 shrink-0 text-right hidden lg:block tabular-nums">
        {task.estimated_hours ? fmtHours(task.estimated_hours) : ""}
      </span>
    </div>
  );
}