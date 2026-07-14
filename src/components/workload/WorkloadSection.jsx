import React, { useState } from "react";
import { cn } from "@/lib/utils";
import WorkloadSectionHeader from "./WorkloadSectionHeader";
import ProjectProductionCard from "./ProjectProductionCard";
import PhaseProductionLane from "./PhaseProductionLane";
import WorkloadTaskRow from "./WorkloadTaskRow";

const INITIAL_VISIBLE = 8;

function ProjectGroup({ group, shared, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  const allTasks = group.tasks;

  return (
    <div className="border-b border-gray-800/20 last:border-b-0">
      <ProjectProductionCard
        project={group.project}
        taskCount={allTasks.length}
        expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
        onAddTask={shared.onAddTask}
        sectionTasks={allTasks}
      />

      {expanded && (
        <div>
          {/* Phase sub-groups with production lanes */}
          {group.phaseGroups.map(pg => (
            <PhaseProductionLane
              key={pg.phase.id}
              phase={pg.phase}
              tasks={pg.tasks}
              shared={shared}
            />
          ))}

          {/* Unphased tasks */}
          {group.unphased.length > 0 && (
            <div className="ml-2 border-l-2 border-gray-700/30">
              {(showAll ? group.unphased : group.unphased.slice(0, INITIAL_VISIBLE)).map(task => (
                <WorkloadTaskRow
                  key={task.id}
                  task={task}
                  assignee={shared.teamMemberMap.get(task.assigned_team_member_id)}
                  status={shared.statusMap.get(task.status_id)}
                  phaseName={shared.phaseMap.get(task.kanban_bucket_id)?.name}
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
                  showPhase
                  showOperationalState={shared.showOperationalState}
                />
              ))}
              {!showAll && group.unphased.length > INITIAL_VISIBLE && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full py-1 text-center text-[11px] text-gray-500 hover:text-white hover:bg-gray-800/40 transition-colors"
                >
                  Show {group.unphased.length - INITIAL_VISIBLE} More Tasks
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkloadSection({ section, shared }) {
  // Zero-count sections: collapsed single-line header
  const [expanded, setExpanded] = useState(
    section.count === 0 ? false : section.defaultExpanded
  );

  return (
    <div className={cn(
      "bg-black/40 backdrop-blur-xl border rounded-lg overflow-hidden",
      section.borderColor,
      section.count === 0 && "opacity-60"
    )}>
      <WorkloadSectionHeader
        section={section}
        expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
      />

      {expanded && section.count === 0 && (
        <p className="text-gray-600 text-[11px] text-center py-2">No tasks</p>
      )}

      {expanded && section.count > 0 && (
        <div>
          {section.projectGroups.map(group => (
            <ProjectGroup
              key={group.projectId}
              group={group}
              shared={shared}
              defaultExpanded={section.projectGroups.length <= 5}
            />
          ))}
        </div>
      )}
    </div>
  );
}