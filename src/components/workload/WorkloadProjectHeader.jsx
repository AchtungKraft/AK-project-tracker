import React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus, Printer } from "lucide-react";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import { cn } from "@/lib/utils";

function fmtHours(h) {
  if (!h || h === 0) return null;
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

export default function WorkloadProjectHeader({
  project,
  taskCount,
  expanded,
  onToggle,
  onAddTask,
}) {
  if (!project) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-800/20 cursor-pointer" onClick={onToggle}>
        {expanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
        <span className="text-sm font-bold text-gray-400">No Project</span>
        <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[9px] px-1 py-0">{taskCount}</Badge>
      </div>
    );
  }

  const wh = project.workflow_health || {};
  const currentPhase = project.current_phase_name;
  const nextPhase = project.next_phase_name;
  const blocker = project.current_blocker;
  const hoursRemaining = fmtHours(wh.hours_remaining);

  return (
    <div className="bg-gray-800/20 hover:bg-gray-800/30 transition-colors">
      <div className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer" onClick={onToggle}>
        {expanded ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to={buildProjectDetailUrl(project.id, { source: SOURCES.PRIORITIES })}
              className="text-sm font-bold text-gray-100 truncate hover:text-red-400 hover:underline transition-colors"
              onClick={e => e.stopPropagation()}
            >
              {project.name}
            </Link>
            <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[9px] px-1 py-0 shrink-0">
              {taskCount}
            </Badge>
          </div>
          
          {/* Context line */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {currentPhase && (
              <span className="text-[10px] text-gray-400">
                <span className="text-gray-600">Current:</span> {currentPhase}
              </span>
            )}
            {nextPhase && (
              <span className="text-[10px] text-gray-500">
                <span className="text-gray-600">Next:</span> {nextPhase}
              </span>
            )}
            {/* Compact stats */}
            {wh.tasks_ready > 0 && <span className="text-[10px] text-green-400 tabular-nums">Ready {wh.tasks_ready}</span>}
            {wh.tasks_in_progress > 0 && <span className="text-[10px] text-amber-400 tabular-nums">Active {wh.tasks_in_progress}</span>}
            {(wh.tasks_blocked > 0 || wh.tasks_waiting > 0) && (
              <span className="text-[10px] text-red-400 tabular-nums">
                Waiting {(wh.tasks_blocked || 0) + (wh.tasks_waiting || 0)}
              </span>
            )}
            {hoursRemaining && <span className="text-[10px] text-gray-500 tabular-nums">{hoursRemaining} remaining</span>}
          </div>
          
          {/* Blocker */}
          {blocker && (
            <div className="text-[10px] text-red-400 mt-0.5 truncate">
              Blocker: {blocker}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0 ml-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onAddTask?.(project.id)}
            className="text-green-500 hover:text-green-300 px-0.5 py-0.5 rounded hover:bg-green-900/20 transition-colors"
            title="Add task"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={() => window.open(`/projectprintview?id=${project.id}`, "_blank")}
            className="text-gray-600 hover:text-white px-0.5 py-0.5 rounded hover:bg-gray-700 transition-colors"
            title="Print"
          >
            <Printer className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}