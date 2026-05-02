import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export default function ExecutionTaskRow({
  task,
  assigneeName,
  checklistItems,
  onToggleComplete,
  onToggleChecklistItem,
  onTaskClick,
}) {
  const hasChecklist = checklistItems && checklistItems.length > 0;
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = dueDate && dueDate < new Date();
  const fmtDate = (d) => d ? `${d.getMonth() + 1}/${d.getDate()}` : "—";

  return (
    <div className="break-inside-avoid">
      {/* Task row */}
      <div className="flex items-start gap-2 py-[4px] border-b border-white/5">
        <span onClick={e => e.stopPropagation()} className="shrink-0 mt-0.5">
          <Checkbox
            checked={false}
            onCheckedChange={() => onToggleComplete(task)}
            className="h-4 w-4 border-2 border-gray-500 rounded-sm data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
          />
        </span>

        <div className="flex-1 min-w-0">
          <button
            onClick={e => { e.stopPropagation(); onTaskClick(task); }}
            className="text-sm leading-snug text-gray-200 text-left"
          >
            {task.name}
          </button>
          {task.description && (
            <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</div>
          )}
        </div>

        <div className="text-xs text-gray-500 shrink-0 w-20 text-right truncate mt-0.5 hidden md:block">
          {assigneeName || "—"}
        </div>

        <div className={cn(
          "text-xs shrink-0 w-12 text-right mt-0.5",
          isOverdue ? "font-bold text-gray-300" : "text-gray-500"
        )}>
          {fmtDate(dueDate)}
        </div>
      </div>

      {/* Checklist items — always visible, matching ProjectPrintView */}
      {hasChecklist && checklistItems.map(item => (
        <div key={item.id} className="flex items-start gap-2 py-[2px] ml-6">
          <Checkbox
            checked={item.is_complete}
            onCheckedChange={() => onToggleChecklistItem(item)}
            className={cn(
              "h-3 w-3 border border-gray-500 rounded-sm mt-0.5 shrink-0",
              "data-[state=checked]:bg-green-700 data-[state=checked]:border-green-700"
            )}
          />
          <span className={cn(
            "text-xs leading-snug",
            item.is_complete ? "text-gray-600 line-through" : "text-gray-400"
          )}>
            {item.title}
          </span>
        </div>
      ))}
    </div>
  );
}