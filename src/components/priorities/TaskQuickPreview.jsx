import React, { useCallback } from "react";
import { User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function TaskQuickPreview({
  task,
  projectName,
  latestComment,
  teamMembers,
  onAssign,
  onTaskClick,
  children,
}) {
  const handlePick = useCallback((memberId) => {
    if (onAssign) onAssign(task, memberId);
  }, [task, onAssign]);

  const activeMembers = teamMembers.filter(tm => tm.active);
  const assigned = teamMembers.find(m => m.id === task.assigned_team_member_id);

  return (
    <div className="flex items-start gap-1 py-px">
      {/* Task content — click opens detail */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onTaskClick(task)}>
        {children}
        {(projectName || latestComment) && (
          <div className="pl-[22px] -mt-px space-y-0">
            {projectName && (
              <div className="text-[10px] text-gray-500 truncate leading-tight">{projectName}</div>
            )}
            {latestComment && (
              <div className="text-[10px] text-gray-600 truncate leading-tight">
                💬 {latestComment.content}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assign popover trigger — icon only, hover reveals name */}
      <div className="shrink-0 mt-0.5 group/assign" onClick={e => e.stopPropagation()}>
        <Popover>
          <PopoverTrigger asChild>
            <button
              title={assigned ? assigned.full_name : "Assign"}
              className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] transition-colors ${
                assigned
                  ? "text-gray-500 hover:bg-blue-900/30 hover:text-blue-400"
                  : "text-yellow-600/60 hover:bg-yellow-900/20 hover:text-yellow-500"
              }`}
            >
              <User className="w-3 h-3 shrink-0" />
              {assigned && (
                <span className="font-medium max-w-[60px] truncate opacity-0 group-hover/assign:opacity-100 transition-opacity text-gray-500">
                  {assigned.full_name.split(" ")[0]}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1 bg-gray-900 border-gray-700" side="left" align="start">
            <div className="space-y-px max-h-52 overflow-y-auto">
              <button
                onClick={() => handlePick(null)}
                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                  !task.assigned_team_member_id ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <User className="w-3 h-3" />
                Unassigned
              </button>
              {activeMembers.map(tm => {
                const tmInitials = tm.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                const isSelected = task.assigned_team_member_id === tm.id;
                return (
                  <button
                    key={tm.id}
                    onClick={() => handlePick(tm.id)}
                    className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                      isSelected ? "bg-blue-900/40 text-blue-300" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-blue-600/20 flex items-center justify-center text-[8px] font-bold text-blue-400 shrink-0">
                      {tmInitials}
                    </span>
                    {tm.full_name}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}