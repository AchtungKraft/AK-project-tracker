import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function ExecutionTaskRow({
  task,
  assignee,
  checklistItems,
  onToggleComplete,
  onToggleChecklistItem,
  onTaskClick,
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChecklist = checklistItems && checklistItems.length > 0;
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = dueDate && dueDate < new Date();
  const completedCount = hasChecklist ? checklistItems.filter(i => i.is_complete).length : 0;

  return (
    <div className="border-b border-gray-800/30 last:border-b-0">
      {/* Task row */}
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/30 transition-colors">
        {/* Expand toggle */}
        <button
          onClick={() => hasChecklist && setExpanded(!expanded)}
          className={cn(
            "w-5 h-5 flex items-center justify-center shrink-0",
            hasChecklist ? "text-gray-500 hover:text-gray-300" : "invisible"
          )}
        >
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />
          }
        </button>

        {/* Complete checkbox */}
        <Checkbox
          checked={false}
          onCheckedChange={() => onToggleComplete(task)}
          className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 shrink-0"
        />

        {/* Task name */}
        <button
          onClick={() => onTaskClick(task)}
          className="flex-1 min-w-0 text-left text-sm text-gray-200 hover:text-white truncate font-medium"
        >
          {task.name}
        </button>

        {/* Checklist progress */}
        {hasChecklist && (
          <span className={cn(
            "text-[11px] shrink-0 tabular-nums",
            completedCount >= checklistItems.length ? "text-green-400" : "text-gray-500"
          )}>
            {completedCount}/{checklistItems.length}
          </span>
        )}

        {/* Assigned */}
        <span className="text-xs text-gray-500 w-20 truncate shrink-0 text-right hidden md:block">
          {assignee?.full_name?.split(' ')[0] || '—'}
        </span>

        {/* Due date */}
        <span className={cn(
          "text-xs w-16 shrink-0 text-right hidden sm:block",
          isOverdue ? "text-red-400 font-semibold" : "text-gray-500"
        )}>
          {dueDate ? format(dueDate, 'MMM d') : '—'}
        </span>
      </div>

      {/* Description (always visible if present, muted) */}
      {task.description && (
        <div className="pl-12 pr-3 pb-1">
          <p className="text-xs text-gray-600 truncate max-w-xl">{task.description}</p>
        </div>
      )}

      {/* Checklist sub-items (expanded) */}
      {expanded && hasChecklist && (
        <div className="pl-12 pr-3 pb-2 space-y-0.5">
          {checklistItems.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-800/20 transition-colors"
            >
              <Checkbox
                checked={item.is_complete}
                onCheckedChange={() => onToggleChecklistItem(item)}
                className="border-gray-600 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 shrink-0 h-3.5 w-3.5"
              />
              <span className={cn(
                "text-xs",
                item.is_complete ? "text-gray-600 line-through" : "text-gray-400"
              )}>
                {item.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}