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
    <div>
      {/* Task row — entire row toggles expand */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800/20 transition-colors cursor-pointer group"
        onClick={() => hasChecklist && setExpanded(!expanded)}
      >
        {/* Expand indicator */}
        <span className={cn("w-4 shrink-0 flex items-center justify-center", !hasChecklist && "invisible")}>
          {expanded
            ? <ChevronDown className="w-3 h-3 text-gray-500" />
            : <ChevronRight className="w-3 h-3 text-gray-600" />
          }
        </span>

        {/* Complete checkbox — stop propagation so click doesn't expand */}
        <span onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={false}
            onCheckedChange={() => onToggleComplete(task)}
            className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 shrink-0"
          />
        </span>

        {/* Task name — click opens drawer */}
        <button
          onClick={e => { e.stopPropagation(); onTaskClick(task); }}
          className="flex-1 min-w-0 text-left text-[13px] text-gray-200 hover:text-white truncate leading-tight"
        >
          {task.name}
        </button>

        {/* Checklist tally */}
        {hasChecklist && (
          <span className={cn(
            "text-[10px] shrink-0 tabular-nums font-mono",
            completedCount >= checklistItems.length ? "text-green-500" : "text-gray-600"
          )}>
            {completedCount}/{checklistItems.length}
          </span>
        )}

        {/* Assigned */}
        <span className="text-[11px] text-gray-600 w-16 truncate shrink-0 text-right hidden md:block">
          {assignee?.full_name?.split(' ')[0] || ''}
        </span>

        {/* Due date */}
        <span className={cn(
          "text-[11px] w-14 shrink-0 text-right hidden sm:block font-mono",
          isOverdue ? "text-red-400" : "text-gray-600"
        )}>
          {dueDate ? format(dueDate, 'M/d') : ''}
        </span>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-[11px] text-gray-700 pl-10 pr-3 pb-0.5 truncate max-w-2xl leading-tight">
          {task.description}
        </p>
      )}

      {/* Checklist sub-items */}
      {expanded && hasChecklist && (
        <div className="pl-10 pr-3 pb-1.5 pt-0.5">
          {checklistItems.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-2 py-0.5 hover:bg-gray-800/10 transition-colors rounded px-1"
            >
              <Checkbox
                checked={item.is_complete}
                onCheckedChange={() => onToggleChecklistItem(item)}
                className="border-gray-700 data-[state=checked]:bg-green-700 data-[state=checked]:border-green-700 shrink-0 h-3 w-3"
              />
              <span className={cn(
                "text-[11px] leading-tight",
                item.is_complete ? "text-gray-700 line-through" : "text-gray-400"
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