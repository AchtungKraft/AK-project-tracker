import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import WorkloadTaskRow from "./WorkloadTaskRow";

const INITIAL_VISIBLE = 6;

const GROUP_CONFIG = {
  READY: { label: "Ready", color: "text-green-400", dot: "bg-green-400", defaultExpanded: true },
  WORKING: { label: "Working", color: "text-amber-400", dot: "bg-amber-400", defaultExpanded: true },
  WAITING: { label: "Waiting", color: "text-orange-400", dot: "bg-orange-400", defaultExpanded: false },
  BLOCKED: { label: "Blocked", color: "text-red-400", dot: "bg-red-400", defaultExpanded: false },
  NOT_STARTED: { label: "Not Started", color: "text-gray-500", dot: "bg-gray-500", defaultExpanded: false },
  COMPLETED: { label: "Completed", color: "text-emerald-400", dot: "bg-emerald-400", defaultExpanded: false },
};

export default function PhaseTaskGroup({ groupKey, tasks, shared }) {
  const config = GROUP_CONFIG[groupKey] || GROUP_CONFIG.NOT_STARTED;
  const [expanded, setExpanded] = useState(config.defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  if (!tasks.length) return null;

  const visibleTasks = showAll ? tasks : tasks.slice(0, INITIAL_VISIBLE);
  const hiddenCount = tasks.length - INITIAL_VISIBLE;

  return (
    <div className="ml-3">
      {/* Group header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-gray-800/20 transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-2.5 h-2.5 text-gray-600 shrink-0" />
          : <ChevronRight className="w-2.5 h-2.5 text-gray-600 shrink-0" />
        }
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dot)} />
        <span className={cn("text-[11px] font-medium uppercase tracking-wide", config.color)}>
          {config.label}
        </span>
        <span className="text-[10px] text-gray-600 tabular-nums">{tasks.length}</span>
      </button>

      {expanded && (
        <div className="ml-1">
          {visibleTasks.map(task => (
            <WorkloadTaskRow
              key={task.id}
              task={task}
              assignee={shared.teamMemberMap.get(task.assigned_team_member_id)}
              status={shared.statusMap.get(task.status_id)}
              phaseName={null}
              successorCount={shared.successorCounts[task.id] || 0}
              teamMembers={shared.teamMembers}
              statuses={shared.statuses}
              onToggleComplete={shared.onToggleComplete}
              onTaskClick={shared.onTaskClick}
              onUpdateDueDate={shared.onUpdateDueDate}
              onTogglePriority={shared.onTogglePriority}
              updateTaskMutation={shared.updateTaskMutation}
              isSelected={shared.selectedTaskIds?.has(task.id)}
              onToggleSelection={shared.onToggleTaskSelection}
              showOperationalState={shared.showOperationalState}
            />
          ))}
          {!showAll && hiddenCount > 0 && (
            <div className="flex items-center gap-2 px-2 py-1">
              <button
                onClick={() => setShowAll(true)}
                className="text-[10px] text-gray-500 hover:text-white transition-colors"
              >
                Show {hiddenCount} More
              </button>
            </div>
          )}
          {showAll && hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(false)}
              className="w-full py-1 text-center text-[10px] text-gray-500 hover:text-white transition-colors"
            >
              Collapse
            </button>
          )}
        </div>
      )}
    </div>
  );
}