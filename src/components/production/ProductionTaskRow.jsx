import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CheckCircle2, Circle, AlertTriangle, CalendarDays, User, Clock,
} from "lucide-react";
import { OPERATIONAL_STATE_CONFIG } from "@/components/workflow/useProjectWorkflow";
import { cn } from "@/lib/utils";
import { format, startOfDay, isBefore } from "date-fns";

function fmtHours(h) {
  if (!h || h === 0) return "";
  return `${Math.round(h * 10) / 10}h`;
}

function parseLocalDate(str) {
  if (!str) return null;
  return new Date(str + "T00:00:00");
}

export default function ProductionTaskRow({ task, shared }) {
  const [dateOpen, setDateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const assignee = shared.teamMemberMap.get(task.assigned_team_member_id);
  const status = shared.statusMap.get(task.status_id);
  const due = parseLocalDate(task.due_date);
  const today = startOfDay(new Date());
  const isOverdue = due && isBefore(due, today);

  // Operational state badge (workflow condition)
  const opState = task.operational_state;
  const showOpBadge = opState && !["COMPLETED", "NOT_STARTED", "READY", "IN_PROGRESS"].includes(opState);
  const opCfg = showOpBadge ? OPERATIONAL_STATE_CONFIG[opState] : null;

  // Blocking reasons summary
  const blockingReasons = task.blocking_reasons || [];
  const primaryBlocker = blockingReasons.length > 0 ? blockingReasons[0].label : null;

  // Checklist progress
  const checklistTotal = task._checklistTotal;
  const checklistDone = task._checklistDone;
  const hasChecklist = checklistTotal > 0;

  // Completed status detection
  const isCompleted = opState === "COMPLETED" || task.status_id === shared.completedStatusId;

  const activeMembers = useMemo(() =>
    (shared.teamMembers || []).filter(m => m.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [shared.teamMembers]
  );

  const taskStatuses = useMemo(() =>
    (shared.statuses || []).filter(s => s.scope === "Task" && s.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [shared.statuses]
  );

  const handleDateSelect = (date) => {
    if (date) {
      shared.onUpdateDueDate(task, format(date, "yyyy-MM-dd"));
    }
    setDateOpen(false);
  };

  const handleAssign = (tmId) => {
    shared.updateTaskMutation.mutate({ id: task.id, data: { assigned_team_member_id: tmId } });
    setAssignOpen(false);
  };

  return (
    <div className="group/row flex items-center gap-1.5 px-4 py-1.5 hover:bg-gray-800/30 transition-colors text-sm">
      {/* Completion toggle */}
      <button
        onClick={() => shared.onToggleComplete(task)}
        className="shrink-0 text-gray-600 hover:text-green-400 transition-colors"
      >
        {isCompleted
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          : <Circle className="w-3.5 h-3.5" />
        }
      </button>

      {/* Priority indicator */}
      {task.is_priority && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Priority" />
      )}

      {/* Task name */}
      <button
        onClick={() => shared.onTaskClick(task)}
        className="flex-1 min-w-0 text-left text-[13px] text-gray-200 hover:text-white truncate leading-tight"
      >
        {task.name}
      </button>

      {/* Checklist progress */}
      {hasChecklist && (
        <span className={cn(
          "text-[10px] tabular-nums shrink-0 px-1",
          checklistDone === checklistTotal ? "text-emerald-500" : "text-gray-500"
        )}>
          {checklistDone}/{checklistTotal}
        </span>
      )}

      {/* Operational state badge — workflow condition */}
      {opCfg && (
        <Badge className={cn("text-[9px] px-1 py-0 h-4 border-0 shrink-0", opCfg.bgClass, opCfg.textClass)}>
          {opCfg.label}
        </Badge>
      )}

      {/* Primary blocker reason */}
      {primaryBlocker && !opCfg && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 border-red-800 text-red-500 bg-red-900/20 shrink-0 gap-0.5 hidden md:inline-flex">
          <AlertTriangle className="w-2.5 h-2.5" />
          {primaryBlocker}
        </Badge>
      )}

      {/* Inline controls — visible on hover */}
      <div className="flex items-center gap-0 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
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
              {activeMembers.map(tm => (
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
      </div>

      {/* Status badge */}
      {status && (
        <Badge
          variant="outline"
          className="text-[9px] px-1 py-0 shrink-0 hidden sm:inline-flex cursor-default"
          style={{ borderColor: status.color, color: status.color }}
        >
          {status.label}
        </Badge>
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
        {fmtHours(task.estimated_hours)}
      </span>
    </div>
  );
}