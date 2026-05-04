import React, { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Package, FolderKanban, Flame } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { sortTasksByPriority, isUrgentPriority, isFuturePriority } from "@/utils/taskPrioritySort";

function TaskRow({ task, project, assignee, status, commentCount, partsProgress, onToggleComplete, onTaskClick }) {
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = dueDate && dueDate < new Date() && status?.label?.toLowerCase() !== 'complete';
  const urgent = isUrgentPriority(task);
  const future = isFuturePriority(task);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800/40 transition-colors group border-b border-gray-800/30 last:border-b-0",
        urgent && "border-l-2 border-l-red-500 bg-red-950/10"
      )}
    >
      {/* Checkbox */}
      <Checkbox
        checked={false}
        onCheckedChange={() => onToggleComplete(task)}
        className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 shrink-0"
      />

      {/* Priority indicator */}
      {urgent && <Flame className="w-3.5 h-3.5 text-red-400 shrink-0" />}
      {future && <Flame className="w-3 h-3 text-gray-600 shrink-0" />}

      {/* Task name — clickable */}
      <button
        onClick={() => onTaskClick(task)}
        className="flex-1 min-w-0 text-left text-sm text-gray-200 hover:text-white truncate font-medium"
      >
        {task.name}
      </button>

      {/* Status badge */}
      {status && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 shrink-0 hidden sm:inline-flex"
          style={{ borderColor: status.color, color: status.color }}
        >
          {status.label}
        </Badge>
      )}

      {/* Assigned */}
      <span className="text-xs text-gray-500 w-20 truncate shrink-0 hidden md:block text-right">
        {assignee?.full_name?.split(' ')[0] || '—'}
      </span>

      {/* Due date */}
      <span className={cn(
        "text-xs w-16 shrink-0 text-right hidden sm:block",
        isOverdue ? "text-red-400 font-semibold" : "text-gray-500"
      )}>
        {dueDate ? format(dueDate, 'MMM d') : '—'}
      </span>

      {/* Comments */}
      {commentCount > 0 ? (
        <span className="flex items-center gap-0.5 text-xs text-gray-500 w-8 shrink-0 justify-end">
          <MessageSquare className="w-3 h-3" />
          {commentCount}
        </span>
      ) : (
        <span className="w-8 shrink-0" />
      )}

      {/* Parts progress */}
      {partsProgress ? (
        <span className={cn(
          "flex items-center gap-0.5 text-xs w-14 shrink-0 justify-end",
          partsProgress.installed >= partsProgress.total ? "text-green-400" : "text-gray-500"
        )}>
          <Package className="w-3 h-3" />
          {partsProgress.installed}/{partsProgress.total}
        </span>
      ) : (
        <span className="w-14 shrink-0" />
      )}
    </div>
  );
}

export default function PriorityListView({
  tasks,
  projects,
  teamMembers,
  categories,
  statuses,
  commentCountByTaskId,
  partsProgressByTaskId,
  onToggleComplete,
  onTaskClick,
}) {
  // Group by project, apply canonical sort within each group
  const projectGroups = useMemo(() => {
    const groups = {};
    tasks.forEach(task => {
      const pid = task.project_id || 'no-project';
      if (!groups[pid]) {
        const project = projects.find(p => p.id === pid);
        groups[pid] = { project, tasks: [] };
      }
      groups[pid].tasks.push(task);
    });
    // Sort tasks within each group, then sort groups by project name
    return Object.values(groups)
      .map(g => ({ ...g, tasks: sortTasksByPriority(g.tasks) }))
      .sort((a, b) => (a.project?.name || '').localeCompare(b.project?.name || ''));
  }, [tasks, projects]);

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No priority tasks to display.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {projectGroups.map(group => (
        <div key={group.project?.id || 'none'} className="bg-black/40 backdrop-blur-xl border border-gray-700/50 rounded-lg overflow-hidden">
          {/* Project header */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/40 border-b border-gray-700/50">
            <FolderKanban className="w-4 h-4 text-red-400/70 shrink-0" />
            <span className="text-sm font-semibold text-gray-200 truncate">
              {group.project?.name || 'No Project'}
            </span>
            {group.project?.client_name && (
              <span className="text-xs text-gray-500 truncate hidden sm:inline">
                — {group.project.client_name}
              </span>
            )}
            <Badge className="ml-auto bg-gray-800 text-gray-400 border-gray-700 text-[10px] px-1.5 py-0 shrink-0">
              {group.tasks.length}
            </Badge>
          </div>

          {/* Task rows */}
          <div>
            {group.tasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                project={group.project}
                assignee={teamMembers.find(tm => tm.id === task.assigned_team_member_id)}
                status={statuses.find(s => s.id === task.status_id)}
                commentCount={commentCountByTaskId[task.id] || 0}
                partsProgress={partsProgressByTaskId[task.id]}
                onToggleComplete={onToggleComplete}
                onTaskClick={onTaskClick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}