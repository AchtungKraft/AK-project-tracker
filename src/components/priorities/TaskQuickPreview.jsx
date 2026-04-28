import React, { useCallback } from "react";
import { MessageSquare, FolderKanban, User, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TaskQuickPreview({
  task,
  projectName,
  latestComment,
  teamMembers,
  onAssign,
  onTaskClick,
  children,
}) {
  const handleAssignChange = useCallback((memberId) => {
    if (onAssign) onAssign(task, memberId === "__unassign" ? null : memberId);
  }, [task, onAssign]);

  const activeMembers = teamMembers.filter(tm => tm.active);

  return (
    <div>
      {/* Project label */}
      {projectName && (
        <div className="flex items-center gap-1 mb-0.5">
          <FolderKanban className="w-2.5 h-2.5 text-gray-600" />
          <span className="text-[10px] text-gray-500 truncate">{projectName}</span>
        </div>
      )}

      {/* Task + assign row */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onTaskClick(task)}>
          {children}
        </div>

        {/* Inline assign dropdown */}
        <div className="shrink-0" onClick={e => e.stopPropagation()}>
          <Select
            value={task.assigned_team_member_id || "__unassign"}
            onValueChange={handleAssignChange}
          >
            <SelectTrigger className={`h-6 text-[11px] w-[100px] border-gray-700 px-1.5 ${
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

      {/* Latest note - 1 line */}
      {latestComment && (
        <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5 truncate">
          <MessageSquare className="w-2.5 h-2.5 shrink-0 text-gray-600" />
          <span className="truncate">{latestComment.content}</span>
        </div>
      )}
    </div>
  );
}