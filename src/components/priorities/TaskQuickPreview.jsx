import React, { useCallback, useState, useRef } from "react";
import { createPortal } from "react-dom";
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

  // Hover description panel state
  const [hoverVisible, setHoverVisible] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const hoverTimer = useRef(null);
  const rowRef = useRef(null);

  const handleMouseEnter = useCallback(() => {
    if (!task.description) return;
    hoverTimer.current = setTimeout(() => {
      if (rowRef.current) {
        const rect = rowRef.current.getBoundingClientRect();
        setPanelPos({
          top: rect.bottom + 4,
          left: rect.left,
        });
      }
      setHoverVisible(true);
    }, 200);
  }, [task.description]);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current);
    setHoverVisible(false);
  }, []);

  return (
    <div ref={rowRef} className="relative flex items-start gap-1 py-px w-full max-w-full overflow-hidden mb-1" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* Task content — click opens detail */}
      <div className="flex-1 min-w-0 cursor-pointer overflow-hidden" onClick={() => onTaskClick(task)}>
        {children}
        {(projectName || latestComment) && (
          <div className="pl-[22px] -mt-px space-y-0 overflow-hidden">
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

      {/* Hover description panel — portaled to body to escape overflow clipping */}
      {hoverVisible && task.description && createPortal(
        <div
          className="fixed z-[9999] w-72 rounded-md bg-neutral-900/95 border border-white/10 p-3 shadow-lg pointer-events-none"
          style={{ top: panelPos.top, left: panelPos.left }}
        >
          <div className="text-xs font-medium text-white mb-1 line-clamp-1">{task.name}</div>
          <div className="text-xs text-white/70 leading-snug line-clamp-5 whitespace-pre-wrap">{task.description}</div>
        </div>,
        document.body
      )}

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