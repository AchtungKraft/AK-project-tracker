import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function ExecutionTaskRow({
  task,
  assignee,
  status,
  checklistItems,
  partsProgress,
  commentCount,
  onToggleComplete,
  onToggleChecklistItem,
  onTaskClick,
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChecklist = checklistItems && checklistItems.length > 0;
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = dueDate && dueDate < new Date();
  const clDone = hasChecklist ? checklistItems.filter(i => i.is_complete).length : 0;

  return (
    <>
      {/* Task row */}
      <div
        className="flex items-center gap-1.5 pl-1 pr-2 py-[3px] cursor-pointer hover:bg-white/[0.02]"
        onClick={() => hasChecklist && setExpanded(v => !v)}
      >
        {/* Expand indicator */}
        <span className={cn("w-3.5 shrink-0 flex items-center justify-center", !hasChecklist && "invisible")}>
          {expanded
            ? <ChevronDown className="w-2.5 h-2.5 text-gray-500" />
            : <ChevronRight className="w-2.5 h-2.5 text-gray-700" />}
        </span>

        {/* Complete checkbox */}
        <span onClick={e => e.stopPropagation()} className="shrink-0">
          <Checkbox
            checked={false}
            onCheckedChange={() => onToggleComplete(task)}
            className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 h-3.5 w-3.5"
          />
        </span>

        {/* Status dot */}
        {status && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: status.color }}
          />
        )}

        {/* Task name */}
        <button
          onClick={e => { e.stopPropagation(); onTaskClick(task); }}
          className="flex-1 min-w-0 text-left text-[12px] text-gray-300 hover:text-white truncate leading-none"
        >
          {task.name}
        </button>

        {/* Checklist tally */}
        {hasChecklist && (
          <span className={cn(
            "text-[9px] shrink-0 tabular-nums font-mono",
            clDone >= checklistItems.length ? "text-green-600" : "text-gray-700"
          )}>
            {clDone}/{checklistItems.length}
          </span>
        )}

        {/* Parts progress */}
        {partsProgress && (
          <span className={cn(
            "text-[9px] shrink-0 tabular-nums font-mono",
            partsProgress.installed >= partsProgress.total ? "text-green-600" : "text-gray-600"
          )}>
            {partsProgress.installed}/{partsProgress.total}p
          </span>
        )}

        {/* Comment count */}
        {commentCount > 0 && (
          <span className="text-[9px] text-gray-700 shrink-0 tabular-nums">
            {commentCount}c
          </span>
        )}

        {/* Assigned */}
        <span className="text-[10px] text-gray-600 w-14 truncate shrink-0 text-right hidden md:block">
          {assignee?.full_name?.split(' ')[0] || ''}
        </span>

        {/* Due date */}
        <span className={cn(
          "text-[10px] w-10 shrink-0 text-right hidden sm:block font-mono",
          isOverdue ? "text-red-400" : "text-gray-700"
        )}>
          {dueDate ? format(dueDate, 'M/d') : ''}
        </span>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-[10px] text-gray-700 pl-9 pr-2 leading-tight truncate max-w-xl">
          {task.description}
        </p>
      )}

      {/* Subtasks */}
      {expanded && hasChecklist && (
        <div className="pl-9 pr-2 pt-px pb-0.5">
          {checklistItems.map(item => (
            <div key={item.id} className="flex items-center gap-1.5 py-px">
              <Checkbox
                checked={item.is_complete}
                onCheckedChange={() => onToggleChecklistItem(item)}
                className="border-gray-700 data-[state=checked]:bg-green-700 data-[state=checked]:border-green-700 h-2.5 w-2.5 shrink-0"
              />
              <span className={cn(
                "text-[10px] leading-tight",
                item.is_complete ? "text-gray-700 line-through" : "text-gray-500"
              )}>
                {item.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}