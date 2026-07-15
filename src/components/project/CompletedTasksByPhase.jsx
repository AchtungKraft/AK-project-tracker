import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { sortCompletedTasks } from "@/lib/workloadRollups";

const GUTTER_SELECT_W = "w-[18px]";

/**
 * Completed tasks grouped by their phase assignment.
 * Phase order follows the operational bucket order; "General / No Phase" comes last.
 * Within each phase, tasks sort newest-completed first.
 */
export default function CompletedTasksByPhase({
  completedTasks,
  sortedBuckets,
  bucketMap,
  teamMemberMap,
  onTaskClick,
  expanded,
  onToggleExpanded,
}) {
  // Group completed tasks by phase
  const phaseGroups = useMemo(() => {
    const byPhase = new Map();
    const unphased = [];

    completedTasks.forEach(t => {
      if (t.kanban_bucket_id && bucketMap.has(t.kanban_bucket_id)) {
        if (!byPhase.has(t.kanban_bucket_id)) byPhase.set(t.kanban_bucket_id, []);
        byPhase.get(t.kanban_bucket_id).push(t);
      } else {
        unphased.push(t);
      }
    });

    // Build ordered groups following bucket order
    const groups = [];
    sortedBuckets.forEach(bucket => {
      const tasks = byPhase.get(bucket.id);
      if (tasks && tasks.length > 0) {
        groups.push({
          id: bucket.id,
          name: bucket.name,
          color: bucket.color || "#6B7280",
          tasks: sortCompletedTasks(tasks),
        });
      }
    });

    // Unphased last
    if (unphased.length > 0) {
      groups.push({
        id: "__unphased__",
        name: "General / No Phase",
        color: "#6B7280",
        tasks: sortCompletedTasks(unphased),
      });
    }

    return groups;
  }, [completedTasks, sortedBuckets, bucketMap]);

  return (
    <div className="bg-black/40 backdrop-blur-xl border border-green-900/20 rounded-lg overflow-hidden">
      {/* Master header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-800/40 transition-colors"
        onClick={onToggleExpanded}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-green-500/60" />
        ) : (
          <ChevronRight className="w-3 h-3 text-green-500/60" />
        )}
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500/60" />
        <span className="text-[11px] font-semibold text-green-500/70 uppercase tracking-wider">
          Completed Tasks
        </span>
        <span className="text-[10px] text-gray-600">({completedTasks.length})</span>
      </div>

      {expanded && (
        <div className="border-t border-green-900/20">
          {phaseGroups.map(group => (
            <CompletedPhaseGroup
              key={group.id}
              group={group}
              teamMemberMap={teamMemberMap}
              onTaskClick={onTaskClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CompletedPhaseGroup({ group, teamMemberMap, onTaskClick }) {
  const [phaseExpanded, setPhaseExpanded] = useState(true);

  return (
    <div>
      {/* Phase sub-header */}
      <div
        className="flex items-center gap-1.5 py-[5px] px-3 cursor-pointer hover:bg-gray-700/30 transition-colors bg-gray-800/30 border-t border-gray-700/20"
        onClick={() => setPhaseExpanded(p => !p)}
      >
        {phaseExpanded ? (
          <ChevronDown className="w-3 h-3 text-gray-500" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-500" />
        )}
        <span
          className="w-[8px] h-[8px] rounded-full shrink-0"
          style={{ backgroundColor: group.color }}
        />
        <span className="text-[11px] font-bold uppercase tracking-wider text-green-500/70">
          {group.name}
        </span>
        <span className="text-[10px] text-gray-600">({group.tasks.length})</span>
      </div>

      {phaseExpanded && (
        <div>
          {group.tasks.map(task => (
            <div
              key={task.id}
              className="flex items-center gap-1.5 px-3 py-[4px] border-b border-gray-800/10 last:border-b-0 group/row pl-5"
            >
              <span className={cn("shrink-0", GUTTER_SELECT_W)} />
              <CheckCircle2 className="w-3 h-3 text-green-600/50 shrink-0" />
              <button
                onClick={() => onTaskClick(task)}
                className="flex-1 min-w-0 text-left text-[12px] text-gray-500 line-through truncate leading-tight hover:text-gray-400"
              >
                {task.name}
              </button>
              <span className="text-[10px] text-gray-600 shrink-0 hidden sm:block">
                {teamMemberMap.get(task.assigned_team_member_id)?.full_name?.split(" ")[0] || ""}
              </span>
              {task.completed_date && (
                <span className="text-[10px] text-green-700/60 shrink-0 hidden sm:block tabular-nums">
                  Completed {format(new Date(task.completed_date), "MMM d")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}