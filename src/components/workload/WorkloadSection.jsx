import React, { useState } from "react";
import { cn } from "@/lib/utils";
import WorkloadSectionHeader from "./WorkloadSectionHeader";
import WorkloadProjectHeader from "./WorkloadProjectHeader";
import WorkloadTaskRow from "./WorkloadTaskRow";

const INITIAL_VISIBLE = 8;

function PhaseGroup({ phaseName, tasks, shared }) {
  if (!tasks.length) return null;
  return (
    <div className="ml-3">
      <div className="text-[9px] text-gray-600 tracking-wider uppercase pl-1 py-0.5 border-b border-gray-800/20">
        {phaseName}
      </div>
      {tasks.map(task => (
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
    </div>
  );
}

function ProjectGroup({ group, shared, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  const allTasks = group.tasks;
  const visibleCount = showAll ? allTasks.length : Math.min(allTasks.length, INITIAL_VISIBLE);

  return (
    <div className="border-b border-gray-800/20 last:border-b-0">
      <WorkloadProjectHeader
        project={group.project}
        taskCount={allTasks.length}
        expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
        onAddTask={shared.onAddTask}
      />

      {expanded && (
        <div>
          {/* Phase sub-groups */}
          {group.phaseGroups.map(pg => (
            <PhaseGroup key={pg.phase.id} phaseName={pg.phase.name} tasks={pg.tasks} shared={shared} />
          ))}

          {/* Unphased tasks */}
          {group.unphased.slice(0, showAll ? undefined : Math.max(0, INITIAL_VISIBLE - group.phaseGroups.reduce((s, pg) => s + pg.tasks.length, 0))).map(task => (
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

          {!showAll && allTasks.length > INITIAL_VISIBLE && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-1.5 text-center text-xs text-gray-500 hover:text-white hover:bg-gray-800/40 transition-colors"
            >
              Show {allTasks.length - INITIAL_VISIBLE} More Tasks
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkloadSection({ section, shared }) {
  const [expanded, setExpanded] = useState(section.defaultExpanded);

  return (
    <div className={cn("bg-black/40 backdrop-blur-xl border rounded-lg overflow-hidden", section.borderColor)}>
      <WorkloadSectionHeader
        section={section}
        expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
      />

      {expanded && section.count === 0 && (
        <p className="text-gray-600 text-xs text-center py-3">No tasks in this section.</p>
      )}

      {expanded && section.count > 0 && (
        <div className="divide-y divide-gray-800/30">
          {section.projectGroups.map(group => (
            <ProjectGroup
              key={group.projectId}
              group={group}
              shared={shared}
              defaultExpanded={section.defaultExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}