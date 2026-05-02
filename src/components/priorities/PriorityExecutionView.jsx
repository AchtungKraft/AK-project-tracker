import React, { useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { FolderKanban } from "lucide-react";
import { sortChecklistItems } from "@/components/tasks/checklistHelpers";
import { toast } from "sonner";
import ExecutionTaskRow from "./ExecutionTaskRow";

export default function PriorityExecutionView({
  tasks,
  projects,
  teamMembers,
  categories,
  statuses,
  onToggleComplete,
  onTaskClick,
}) {
  const queryClient = useQueryClient();

  // Fetch checklist items for all priority tasks
  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks]);
  const { data: allChecklistItems = [] } = useQuery({
    queryKey: ['executionChecklist', taskIds],
    queryFn: () => taskIds.length > 0
      ? base44.entities.TaskChecklistItem.filter({ task_id: { $in: taskIds } })
      : [],
    enabled: taskIds.length > 0,
  });

  // Build checklistByTaskId map
  const checklistByTaskId = useMemo(() => {
    const map = {};
    allChecklistItems.forEach(item => {
      if (!map[item.task_id]) map[item.task_id] = [];
      map[item.task_id].push(item);
    });
    // Sort each group
    Object.keys(map).forEach(tid => {
      map[tid] = sortChecklistItems(map[tid]);
    });
    return map;
  }, [allChecklistItems]);

  // Checklist toggle mutation
  const toggleChecklistMutation = useMutation({
    mutationFn: (item) =>
      base44.entities.TaskChecklistItem.update(item.id, {
        is_complete: !item.is_complete,
        completed_at: !item.is_complete ? new Date().toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executionChecklist'] });
    },
  });

  const handleToggleChecklistItem = useCallback((item) => {
    toggleChecklistMutation.mutate(item);
    toast.success(item.is_complete ? 'Item unchecked' : 'Item checked');
  }, [toggleChecklistMutation]);

  // Group tasks by project
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
    return Object.values(groups).sort((a, b) =>
      (a.project?.name || '').localeCompare(b.project?.name || '')
    );
  }, [tasks, projects]);

  // Unique client names for filtering
  const clientNames = useMemo(() => {
    const names = new Set();
    projects.forEach(p => { if (p.client_name) names.add(p.client_name); });
    return [...names].sort();
  }, [projects]);

  // Local filters
  const [clientFilter, setClientFilter] = useState('all');
  const [assignedFilter, setAssignedFilter] = useState('all');

  const filteredGroups = useMemo(() => {
    return projectGroups
      .filter(g => {
        if (clientFilter !== 'all' && g.project?.client_name !== clientFilter) return false;
        return true;
      })
      .map(g => ({
        ...g,
        tasks: g.tasks.filter(t => {
          if (assignedFilter !== 'all' && t.assigned_team_member_id !== assignedFilter) return false;
          return true;
        }),
      }))
      .filter(g => g.tasks.length > 0);
  }, [projectGroups, clientFilter, assignedFilter]);

  const activeTeamMembers = useMemo(() =>
    teamMembers.filter(tm => tm.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [teamMembers]
  );

  const totalFiltered = filteredGroups.reduce((sum, g) => sum + g.tasks.length, 0);

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No priority tasks to display.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Execution-local filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
          className="bg-gray-900/60 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-red-600"
        >
          <option value="all">All Clients</option>
          {clientNames.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={assignedFilter}
          onChange={e => setAssignedFilter(e.target.value)}
          className="bg-gray-900/60 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-red-600"
        >
          <option value="all">All Assignees</option>
          {activeTeamMembers.map(tm => (
            <option key={tm.id} value={tm.id}>{tm.full_name}</option>
          ))}
        </select>

        <span className="text-[11px] text-gray-600 ml-auto">
          {totalFiltered} task{totalFiltered !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Project groups */}
      {filteredGroups.map(group => (
        <div
          key={group.project?.id || 'none'}
          className="bg-black/40 border border-gray-700/50 rounded-lg overflow-hidden"
        >
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
              <ExecutionTaskRow
                key={task.id}
                task={task}
                assignee={teamMembers.find(tm => tm.id === task.assigned_team_member_id)}
                checklistItems={checklistByTaskId[task.id] || []}
                onToggleComplete={onToggleComplete}
                onToggleChecklistItem={handleToggleChecklistItem}
                onTaskClick={onTaskClick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}