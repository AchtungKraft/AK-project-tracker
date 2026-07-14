import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import WorkloadSectionHeader from "./WorkloadSectionHeader";
import WorkloadTaskRow from "./WorkloadTaskRow";

function ProjectTaskGroup({ group, shared, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const project = group.project;
  const tasks = group.tasks;

  return (
    <div className="border-b border-gray-800/10 last:border-b-0">
      {/* Compact project header — task-first: project is context, not the primary object */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
          expanded ? "bg-gray-800/20" : "hover:bg-gray-800/15"
        )}
        onClick={() => setExpanded(e => !e)}
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        }
        {project ? (
          <Link
            to={buildProjectDetailUrl(project.id, { source: SOURCES.PRIORITIES })}
            className="text-sm font-semibold text-gray-200 truncate hover:text-red-400 hover:underline transition-colors"
            onClick={e => e.stopPropagation()}
          >
            {project.name}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-gray-500">Unassigned</span>
        )}
        <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[10px] px-1.5 py-0 ml-auto shrink-0">
          {tasks.length}
        </Badge>
        {shared.onAddTask && project && (
          <button
            onClick={e => { e.stopPropagation(); shared.onAddTask(project.id); }}
            className="text-gray-600 hover:text-green-400 p-0.5 rounded hover:bg-green-900/20 transition-colors shrink-0"
            title="Add task"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {expanded && (
        <div>
          {tasks.map(task => (
            <WorkloadTaskRow
              key={task.id}
              task={task}
              assignee={shared.teamMemberMap.get(task.assigned_team_member_id)}
              status={shared.statusMap.get(task.status_id)}
              phaseName={shared.phaseMap?.get(task.kanban_bucket_id)?.name}
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
        </div>
      )}
    </div>
  );
}

export default function WorkloadTaskFirstSection({ section, shared }) {
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
            <ProjectTaskGroup
              key={group.projectId}
              group={group}
              shared={shared}
              defaultExpanded={section.projectGroups.length <= 6}
            />
          ))}
        </div>
      )}
    </div>
  );
}