import React, { useState, useCallback } from "react";
import { MessageSquare, Send, Loader2, FolderKanban, User, AlertTriangle, ArrowUp, ArrowRight, ArrowDown, StickyNote } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function TaskQuickPreview({
  task,
  projectName,
  latestComment,
  teamMembers,
  onAssign,
  onTaskClick,
  onUpdateDueDate,
  children,
}) {
  const [noteText, setNoteText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleAddNote = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = noteText.trim();
    if (!text) return;
    setIsSaving(true);
    try {
      await base44.entities.TaskComment.create({ task_id: task.id, content: text });
      setNoteText("");
      setNoteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["priorityTaskComments"] });
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setIsSaving(false);
    }
  }, [noteText, task.id, queryClient]);

  const handleAssignChange = useCallback((memberId) => {
    if (onAssign) onAssign(task, memberId === "__unassign" ? null : memberId);
  }, [task, onAssign]);

  // Quick urgency actions
  const handleMoveToNow = useCallback((e) => {
    e.stopPropagation();
    if (onUpdateDueDate) {
      const today = format(new Date(), "yyyy-MM-dd");
      onUpdateDueDate(task, today);
    }
  }, [task, onUpdateDueDate]);

  const handleMoveToNext = useCallback((e) => {
    e.stopPropagation();
    if (onUpdateDueDate) {
      const in2days = format(addDays(new Date(), 2), "yyyy-MM-dd");
      onUpdateDueDate(task, in2days);
    }
  }, [task, onUpdateDueDate]);

  const handleDeprioritize = useCallback((e) => {
    e.stopPropagation();
    if (onUpdateDueDate) {
      const in7days = format(addDays(new Date(), 7), "yyyy-MM-dd");
      onUpdateDueDate(task, in7days);
    }
  }, [task, onUpdateDueDate]);

  const activeMembers = teamMembers.filter(tm => tm.active);

  return (
    <div className="flex items-start gap-0">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Project label */}
        {projectName && (
          <div className="flex items-center gap-1 mb-0.5">
            <FolderKanban className="w-2.5 h-2.5 text-gray-600" />
            <span className="text-[10px] text-gray-500 truncate">{projectName}</span>
          </div>
        )}

        {/* TaskCard + inline assign row */}
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onTaskClick(task)}>
            {children}
          </div>

          {/* Inline assign dropdown - always visible */}
          <div className="shrink-0 pt-0.5" onClick={e => e.stopPropagation()}>
            <Select
              value={task.assigned_team_member_id || "__unassign"}
              onValueChange={handleAssignChange}
            >
              <SelectTrigger className={`h-6 text-[11px] w-24 border-gray-700 px-1.5 ${
                task.assigned_team_member_id ? "bg-gray-800/50 text-gray-300" : "bg-yellow-900/20 border-yellow-700/50 text-yellow-400"
              }`}>
                <div className="flex items-center gap-1 truncate">
                  {task.assigned_team_member_id ? (
                    <User className="w-2.5 h-2.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                  )}
                  <SelectValue placeholder="Assign" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassign"><span className="text-gray-400">Unassigned</span></SelectItem>
                {activeMembers.map(tm => (
                  <SelectItem key={tm.id} value={tm.id}>{tm.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Latest note - single line */}
        {latestComment && (
          <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5 truncate">
            <MessageSquare className="w-2.5 h-2.5 shrink-0 text-gray-600" />
            <span className="truncate">{latestComment.content}</span>
          </div>
        )}
      </div>

      {/* Quick action icons */}
      <div className="flex flex-col items-center gap-0.5 shrink-0 ml-1 pt-1" onClick={e => e.stopPropagation()}>
        <button onClick={handleMoveToNow} title="Move to NOW" className="p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors">
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleMoveToNext} title="Move to NEXT" className="p-0.5 rounded text-gray-600 hover:text-orange-400 hover:bg-orange-900/20 transition-colors">
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleDeprioritize} title="Deprioritize" className="p-0.5 rounded text-gray-600 hover:text-yellow-400 hover:bg-yellow-900/20 transition-colors">
          <ArrowDown className="w-3.5 h-3.5" />
        </button>

        {/* Note popover */}
        <Popover open={noteOpen} onOpenChange={setNoteOpen}>
          <PopoverTrigger asChild>
            <button title="Add note" className="p-0.5 rounded text-gray-600 hover:text-blue-400 hover:bg-blue-900/20 transition-colors">
              <StickyNote className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2 bg-gray-900 border-gray-700" side="left" align="start" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleAddNote} className="flex gap-1.5">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Quick note..."
                className="flex-1 bg-gray-800/50 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-gray-500"
                autoFocus
              />
              <button
                type="submit"
                disabled={isSaving || !noteText.trim()}
                className="p-1 rounded bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-30 transition-colors"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}