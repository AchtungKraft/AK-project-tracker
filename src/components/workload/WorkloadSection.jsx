import React, { useState } from "react";
import { cn } from "@/lib/utils";
import WorkloadSectionHeader from "./WorkloadSectionHeader";
import ProjectProductionCard from "./ProjectProductionCard";
import PhaseProductionLane from "./PhaseProductionLane";
import WorkloadTaskRow from "./WorkloadTaskRow";

function ProjectGroup({ group, shared, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  const allTasks = group.tasks;
  const INITIAL = 8;

  return (
    <div className="border-b border-gray-800/10 last:border-b-0">
      <ProjectProductionCard
        project={group.project}
        taskCount={allTasks.length}
        expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
        onAddTask={shared.onAddTask}
        sectionTasks={allTasks}
      />

      {expanded && (
        <div className="pb-1">
          {/* Phase sub-groups with production lanes */}
          {group.phaseGroups.map(pg => (
            <PhaseProductionLane
              key={pg.phase.id}
              phase={pg.phase}
              tasks={pg.tasks}
              shared={shared}
            />
          ))}

          {/* Unphased tasks — flat list */}
          {group.unphased.length > 0 && (
            <div className="ml-4 border-l-2 border-gray-700/20">
              <div className="px-3 py-1">
                <span className="text-[10px] text-gray-600 uppercase tracking-wide">No Phase</span>
              </div>
              {(showAll ? group.unphased : group.unphased.slice(0, INITIAL)).map(task => (
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
                  showPhase
                  showOperationalState={shared.showOperationalState}
                />
              ))}
              {!showAll && group.unphased.length > INITIAL && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full py-1 text-center text-[10px] text-gray-500 hover:text-white hover:bg-gray-800/40 transition-colors"
                >
                  Show {group.unphased.length - INITIAL} More
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
  // Zero-count sections: auto-collapse to single-line
  const [expanded, setExpanded] = useState(
    section.count === 0 ? false : section.defaultExpanded
  );

  if (section.count === 0) {
    return (
      <div className="opacity-40">
        <WorkloadSectionHeader
          section={section}
          expanded={false}
          onToggle={() => {}}
          compact
        />
      </div>
    );
  }

  return (
    <div className={cn(
      "bg-black/30 backdrop-blur-xl border rounded-lg overflow-hidden",
      section.borderColor,
    )}>
      <WorkloadSectionHeader
        section={section}
        expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
      />

      {expanded && (
        <div>
          {section.projectGroups.map(group => (
            <ProjectGroup
              key={group.projectId}
              group={group}
              shared={shared}
              defaultExpanded={section.projectGroups.length <= 4}
            />
          ))}
        </div>
      )}
    </div>
  );
}