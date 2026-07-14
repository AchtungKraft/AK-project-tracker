import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPhaseColors } from "./phaseColorConfig";
import WorkloadTaskRow from "./WorkloadTaskRow";

const PHASE_INITIAL_VISIBLE = 8;

export default function PhaseProductionLane({ phase, tasks, shared }) {
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);

  if (!tasks.length) return null;

  const colors = getPhaseColors(phase.name, phase.color);
  const phaseStatus = phase.phase_status;
  const blocker = phase.current_blocker;

  // Compute phase stats from tasks in this section
  const ready = tasks.filter(t => t.operational_state === "READY").length;
  const inProgress = tasks.filter(t => t.operational_state === "IN_PROGRESS").length;
  const waiting = tasks.filter(t => ["WAITING_ON_PARTS", "WAITING_ON_VENDOR", "WAITING_ON_CUSTOMER", "BLOCKED"].includes(t.operational_state)).length;
  const estHours = tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);

  const visibleTasks = showAll ? tasks : tasks.slice(0, PHASE_INITIAL_VISIBLE);
  const hiddenCount = tasks.length - PHASE_INITIAL_VISIBLE;

  return (
    <div className={cn("ml-2 border-l-2 mb-1", colors.border)}>
      {/* Phase header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:brightness-110",
          colors.bg
        )}
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
          : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
        }
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: colors.dot }}
        />
        <span className={cn("text-xs font-semibold uppercase tracking-wide", colors.text)}>
          {phase.name}
        </span>

        {/* Phase stats */}
        <span className="text-[10px] text-gray-500 tabular-nums">
          {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          {ready > 0 && <span className="text-[10px] text-green-400 tabular-nums">R {ready}</span>}
          {inProgress > 0 && <span className="text-[10px] text-amber-400 tabular-nums">A {inProgress}</span>}
          {waiting > 0 && <span className="text-[10px] text-red-400 tabular-nums">W {waiting}</span>}
          {estHours > 0 && <span className="text-[10px] text-gray-600 tabular-nums">{Math.round(estHours)}h</span>}
        </div>
      </button>

      {/* Blocker */}
      {expanded && blocker && (
        <div className="px-5 py-1 text-[10px] text-red-400 border-b border-gray-800/20">
          ⚠ {blocker}
        </div>
      )}

      {/* Tasks */}
      {expanded && (
        <div>
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
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-1 text-center text-[11px] text-gray-500 hover:text-white hover:bg-gray-800/40 transition-colors"
            >
              Show {hiddenCount} More Tasks
            </button>
          )}
          {showAll && hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(false)}
              className="w-full py-1 text-center text-[11px] text-gray-500 hover:text-white hover:bg-gray-800/40 transition-colors"
            >
              Collapse
            </button>
          )}
        </div>
      )}
    </div>
  );
}