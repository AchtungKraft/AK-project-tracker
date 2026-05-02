import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export default function ExecutionTaskRow({
  task,
  assigneeName,
  statusColor,
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
  const formatDate = (d) => d ? `${d.getMonth() + 1}/${d.getDate()}` : "—";

  return (
    <div className="break-inside-avoid">
      {/* Main task row */}
      <div
        className="flex items-start gap-2 py-1 border-b border-gray-800/40 cursor-pointer"
        onClick={() => hasChecklist && setExpanded(v => !v)}
      >
        {/* Interactive checkbox */}
        <span onClick={e => e.stopPropagation()} className="shrink-0 mt-0.5">
          <Checkbox
            checked={false}
            onCheckedChange={() => onToggleComplete(task)}
            className="h-4 w-4 border-2 border-gray-500 rounded-sm data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
          />
        </span>

        {/* Task info */}
        <div className="flex-1 min-w-0">
          <button
            onClick={e => { e.stopPropagation(); onTaskClick(task); }}
            className="text-sm leading-snug text-gray-200 text-left w-full"
          >
            {task.name}
          </button>
          {task.description && (
            <div className="text-xs text-gray-600 mt-0.5 line-clamp-1">{task.description}</div>
          )}
        </div>

        {/* Status dot */}
        {statusColor && (
          <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: statusColor }} />
        )}

        {/* Inline counters */}
        {hasChecklist && (
          <span className={cn(
            "text-xs shrink-0 tabular-nums mt-0.5",
            clDone >= checklistItems.length ? "text-gray-600" : "text-gray-500"
          )}>
            {clDone}/{checklistItems.length}
          </span>
        )}

        {/* Parts */}
        {partsProgress && (
          <span className={cn(
            "text-xs shrink-0 tabular-nums mt-0.5",
            partsProgress.installed >= partsProgress.total ? "text-gray-600" : "text-gray-500"
          )}>
            {partsProgress.installed}/{partsProgress.total}p
          </span>
        )}

        {/* Comments */}
        {commentCount > 0 && (
          <span className="text-xs text-gray-700 shrink-0 tabular-nums mt-0.5">{commentCount}c</span>
        )}

        {/* Assigned */}
        <div className="text-xs text-gray-500 shrink-0 w-20 text-right truncate hidden md:block mt-0.5">
          {assigneeName || "—"}
        </div>

        {/* Due date */}
        <div className={cn(
          "text-xs shrink-0 w-12 text-right mt-0.5",
          isOverdue ? "font-bold text-gray-300" : "text-gray-500"
        )}>
          {formatDate(dueDate)}
        </div>
      </div>

      {/* Parts progress bar (print style) */}
      {partsProgress && partsProgress.total > 0 && (
        <div className="flex items-center gap-1.5 ml-6 py-0.5">
          <span className={cn("text-xs", partsProgress.installed >= partsProgress.total ? "text-gray-600" : "text-gray-500")}>
            Parts: {partsProgress.installed} of {partsProgress.total} Installed
            {partsProgress.installed >= partsProgress.total && " ✓"}
          </span>
          <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-500 rounded-full"
              style={{ width: `${Math.round((partsProgress.installed / partsProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Checklist sub-items (expanded) */}
      {expanded && hasChecklist && (
        <>
          {checklistItems.map(item => (
            <div key={item.id} className="flex items-start gap-2 py-0.5 ml-6">
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
                item.is_complete ? "text-gray-700 line-through" : "text-gray-400"
              )}>
                {item.title}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}