import React, { useState, useCallback } from "react";
import { MessageSquare, Send, Loader2, FolderKanban, User, ChevronDown, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TaskQuickPreview({
  task,
  projectName,
  latestComment,
  teamMembers,
  assignmentMode,
  onAssign,
  onTaskClick,
  children,
}) {
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const handleAddNote = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = noteText.trim();
    if (!text) return;
    setIsSaving(true);
    try {
      await base44.entities.TaskComment.create({
        task_id: task.id,
        content: text,
      });
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["priorityTaskComments"] });
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setIsSaving(false);
    }
  }, [noteText, task.id, queryClient]);

  const handleAssignChange = useCallback((memberId) => {
    if (onAssign) {
      onAssign(task, memberId === "__unassign" ? null : memberId);
    }
  }, [task, onAssign]);

  const handleRowClick = useCallback(() => {
    if (assignmentMode) return; // In assignment mode, don't open drawer
    onTaskClick(task);
  }, [assignmentMode, onTaskClick, task]);

  const activeMembers = teamMembers.filter(tm => tm.active);
  const assignedMember = teamMembers.find(m => m.id === task.assigned_team_member_id);

  return (
    <div className="group">
      {/* Project label */}
      {projectName && (
        <div className="flex items-center gap-1 px-1 mb-0.5">
          <FolderKanban className="w-3 h-3 text-gray-500" />
          <span className="text-[10px] text-gray-500 font-medium truncate">{projectName}</span>
        </div>
      )}

      {/* TaskCard wrapper - delegates click */}
      <div onClick={handleRowClick} className="cursor-pointer">
        {children}
      </div>

      {/* Assignment mode inline selector */}
      {assignmentMode && (
        <div className="px-1 mt-1" onClick={e => e.stopPropagation()}>
          <Select
            value={task.assigned_team_member_id || "__unassign"}
            onValueChange={handleAssignChange}
          >
            <SelectTrigger className="h-7 text-xs bg-gray-900/50 border-gray-700 text-white">
              <div className="flex items-center gap-1">
                <User className="w-3 h-3" />
                <SelectValue placeholder="Assign..." />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassign">
                <span className="text-gray-400">Unassigned</span>
              </SelectItem>
              {activeMembers.map(tm => (
                <SelectItem key={tm.id} value={tm.id}>{tm.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Expand toggle + quick preview */}
      <div className="flex items-center gap-1 px-1 mt-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span>{expanded ? "Hide" : "Details"}</span>
        </button>
        {!expanded && latestComment && (
          <div className="flex items-center gap-1 text-[10px] text-gray-500 truncate ml-1 flex-1 min-w-0">
            <MessageSquare className="w-3 h-3 shrink-0" />
            <span className="truncate">{latestComment.content}</span>
          </div>
        )}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-1.5 ml-1 pl-2 border-l-2 border-gray-700 space-y-2" onClick={e => e.stopPropagation()}>
          {/* Latest note */}
          {latestComment ? (
            <div className="bg-gray-800/40 rounded px-2 py-1.5">
              <div className="flex items-center gap-1 mb-0.5">
                <MessageSquare className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] text-gray-400">
                  Latest note · {new Date(latestComment.created_date).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-gray-300 line-clamp-3">{latestComment.content}</p>
            </div>
          ) : (
            <p className="text-[10px] text-gray-500 italic">No notes yet</p>
          )}

          {/* Quick note input */}
          <form onSubmit={handleAddNote} className="flex gap-1.5">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="+ Quick note..."
              className="flex-1 bg-gray-800/50 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-gray-500"
              onClick={e => e.stopPropagation()}
            />
            <button
              type="submit"
              disabled={isSaving || !noteText.trim()}
              className="p-1 rounded bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-30 transition-colors"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}