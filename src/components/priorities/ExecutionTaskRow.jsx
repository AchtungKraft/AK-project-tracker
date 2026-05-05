import React, { useState, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Flame, CalendarDays, User, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isUrgentPriority } from "@/utils/taskPrioritySort";

export default function ExecutionTaskRow({
  task,
  assigneeName,
  teamMembers = [],
  checklistItems,
  onToggleComplete,
  onToggleChecklistItem,
  onUpdateChecklistTitle,
  onDeleteChecklistItem,
  onTaskClick,
  onUpdateDueDate,
  onTogglePriority,
  updateTaskMutation,
}) {
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const hasChecklist = checklistItems && checklistItems.length > 0;
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = dueDate && dueDate < new Date();
  const fmtDate = (d) => d ? `${d.getMonth() + 1}/${d.getDate()}` : "—";

  const urgent = isUrgentPriority(task);

  const [dateOpen, setDateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const activeMembers = teamMembers.filter(tm => tm.active);

  const handleDateSelect = useCallback((date) => {
    if (onUpdateDueDate) {
      onUpdateDueDate(task, date);
    }
    setDateOpen(false);
  }, [task, onUpdateDueDate]);

  const handleAssign = useCallback((memberId) => {
    if (updateTaskMutation) {
      updateTaskMutation.mutate({ id: task.id, data: { assigned_team_member_id: memberId } });
    }
    setAssignOpen(false);
  }, [task, updateTaskMutation]);

  return (
    <div className="break-inside-avoid group/row">
      {/* Task row */}
      <div className="flex items-start gap-2 py-[4px] border-b border-white/5">
        <span onClick={e => e.stopPropagation()} className="shrink-0 mt-0.5">
          <Checkbox
            checked={false}
            onCheckedChange={() => onToggleComplete(task)}
            className="h-4 w-4 border-2 border-gray-500 rounded-sm data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
          />
        </span>

        {/* Priority flame indicator */}
        {task.is_priority && (
          <button
            onClick={e => { e.stopPropagation(); if (onTogglePriority) onTogglePriority(task); }}
            className="shrink-0 mt-0.5 transition-colors text-red-500 hover:text-red-400"
            title="Priority"
          >
            <Flame className="w-3.5 h-3.5" fill="none" strokeWidth={2} />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <button
            onClick={e => { e.stopPropagation(); onTaskClick(task); }}
            className={cn(
              "text-sm leading-snug text-left",
              task.is_priority ? "text-gray-100 font-semibold" : "text-gray-200"
            )}
          >
            {task.name}
          </button>
          {task.description && (
            <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</div>
          )}
        </div>

        {/* Inline controls — visible on hover */}
        <div className="flex items-center gap-1 shrink-0 mt-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {/* Due date editor */}
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <button
                className="text-gray-500 hover:text-blue-400 transition-colors p-0.5 rounded"
                title="Set due date"
              >
                <CalendarDays className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-700" side="left" align="start">
              <Calendar
                mode="single"
                selected={dueDate || undefined}
                onSelect={handleDateSelect}
                className="bg-gray-900"
              />
            </PopoverContent>
          </Popover>

          {/* Priority toggle */}
          <button
            onClick={() => { if (onTogglePriority) onTogglePriority(task); }}
            className={cn(
              "transition-colors p-0.5 rounded",
              task.is_priority ? "text-red-500 hover:text-red-400" : "text-gray-600 hover:text-red-400"
            )}
            title={task.is_priority ? "Remove priority" : "Set priority"}
          >
            <Flame className="w-3.5 h-3.5" fill="none" strokeWidth={2} />
          </button>

          {/* Assignment selector */}
          <Popover open={assignOpen} onOpenChange={setAssignOpen}>
            <PopoverTrigger asChild>
              <button
                className="text-gray-500 hover:text-blue-400 transition-colors p-0.5 rounded"
                title="Assign"
              >
                <User className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1 bg-gray-900 border-gray-700" side="left" align="start">
              <div className="space-y-px max-h-52 overflow-y-auto">
                <button
                  onClick={() => handleAssign(null)}
                  className={cn(
                    "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5",
                    !task.assigned_team_member_id ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  )}
                >
                  <User className="w-3 h-3" /> Unassigned
                </button>
                {activeMembers.map(tm => (
                  <button
                    key={tm.id}
                    onClick={() => handleAssign(tm.id)}
                    className={cn(
                      "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5",
                      task.assigned_team_member_id === tm.id ? "bg-blue-900/40 text-blue-300" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    )}
                  >
                    {tm.full_name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Assignee name — always visible */}
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

      {/* Checklist items — always visible, with inline edit + delete on hover */}
      {hasChecklist && checklistItems.map(item => (
        <div key={item.id} className="flex items-center gap-2 py-[2px] ml-6 group/cl">
          <Checkbox
            checked={item.is_complete}
            onCheckedChange={() => onToggleChecklistItem(item)}
            className={cn(
              "h-3 w-3 border border-gray-500 rounded-sm shrink-0",
              "data-[state=checked]:bg-green-700 data-[state=checked]:border-green-700"
            )}
          />
          {editingItemId === item.id ? (
            <Input
              autoFocus
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              onBlur={() => {
                if (onUpdateChecklistTitle) onUpdateChecklistTitle(item.id, editingText);
                setEditingItemId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); if (onUpdateChecklistTitle) onUpdateChecklistTitle(item.id, editingText); setEditingItemId(null); }
                if (e.key === 'Escape') { e.preventDefault(); setEditingItemId(null); }
              }}
              className="flex-1 bg-gray-800/50 border-gray-700 text-white text-xs h-5 py-0 px-1"
            />
          ) : (
            <span
              onClick={() => { if (!item.is_complete) { setEditingItemId(item.id); setEditingText(item.title); } }}
              className={cn(
                "flex-1 text-xs leading-snug",
                item.is_complete ? "text-gray-600 line-through" : "text-gray-400 cursor-pointer hover:text-gray-200"
              )}
            >
              {item.title}
            </span>
          )}
          {editingItemId !== item.id && (
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/cl:opacity-100 transition-opacity">
              {!item.is_complete && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingItemId(item.id); setEditingText(item.title); }}
                  className="text-gray-600 hover:text-white p-0.5"
                  title="Edit"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); if (onDeleteChecklistItem) onDeleteChecklistItem(item.id); }}
                className="text-gray-600 hover:text-red-400 p-0.5"
                title="Delete"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}