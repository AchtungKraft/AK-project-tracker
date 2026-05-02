import React, { useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sortChecklistItems } from "@/components/tasks/checklistHelpers";
import { toast } from "sonner";
import ExecutionTaskRow from "./ExecutionTaskRow";

/**
 * Resolve full category path string (handles parent hierarchy).
 */
function resolveCategoryName(catId, categories) {
  const cat = categories.find(c => c.id === catId);
  if (!cat) return null;
  if (cat.parent_id) {
    const parent = categories.find(c => c.id === cat.parent_id);
    return parent ? `${parent.name} › ${cat.name}` : cat.name;
  }
  return cat.name;
}

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

  // ── Checklist data ──
  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks]);
  const { data: allChecklistItems = [] } = useQuery({
    queryKey: ['executionChecklist', taskIds],
    queryFn: () => taskIds.length > 0
      ? base44.entities.TaskChecklistItem.filter({ task_id: { $in: taskIds } })
      : [],
    enabled: taskIds.length > 0,
  });

  const checklistByTaskId = useMemo(() => {
    const map = {};
    allChecklistItems.forEach(item => {
      if (!map[item.task_id]) map[item.task_id] = [];
      map[item.task_id].push(item);
    });
    Object.keys(map).forEach(tid => { map[tid] = sortChecklistItems(map[tid]); });
    return map;
  }, [allChecklistItems]);

  const toggleChecklistMutation = useMutation({
    mutationFn: (item) =>
      base44.entities.TaskChecklistItem.update(item.id, {
        is_complete: !item.is_complete,
        completed_at: !item.is_complete ? new Date().toISOString() : null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['executionChecklist'] }),
  });

  const handleToggleChecklistItem = useCallback((item) => {
    toggleChecklistMutation.mutate(item);
    toast.success(item.is_complete ? 'Item unchecked' : 'Item checked');
  }, [toggleChecklistMutation]);

  // ── Filters ──
  const [projectFilter, setProjectFilter] = useState('all');
  const [assignedFilter, setAssignedFilter] = useState('all');

  // Projects that actually have priority tasks
  const projectsWithTasks = useMemo(() => {
    const ids = new Set(tasks.map(t => t.project_id));
    return projects.filter(p => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, projects]);

  const activeTeamMembers = useMemo(() =>
    teamMembers.filter(tm => tm.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [teamMembers]
  );

  // ── Build grouped structure: Project → Category → Tasks ──
  const groupedData = useMemo(() => {
    const filtered = tasks.filter(t => {
      if (projectFilter !== 'all' && t.project_id !== projectFilter) return false;
      if (assignedFilter !== 'all' && t.assigned_team_member_id !== assignedFilter) return false;
      return true;
    });

    // Group by project
    const projectMap = {};
    filtered.forEach(task => {
      const pid = task.project_id || 'no-project';
      if (!projectMap[pid]) {
        const project = projects.find(p => p.id === pid);
        projectMap[pid] = { project, buckets: {} };
      }
      const catName = resolveCategoryName(task.category_id, categories) || 'UNCATEGORIZED';
      if (!projectMap[pid].buckets[catName]) {
        projectMap[pid].buckets[catName] = [];
      }
      projectMap[pid].buckets[catName].push(task);
    });

    // Sort projects alphabetically, sort buckets alphabetically within each
    return Object.values(projectMap)
      .sort((a, b) => (a.project?.name || '').localeCompare(b.project?.name || ''))
      .map(pg => ({
        ...pg,
        sortedBuckets: Object.entries(pg.buckets).sort(([a], [b]) => {
          if (a === 'UNCATEGORIZED') return 1;
          if (b === 'UNCATEGORIZED') return -1;
          return a.localeCompare(b);
        }),
      }));
  }, [tasks, projects, categories, projectFilter, assignedFilter]);

  const totalCount = groupedData.reduce(
    (sum, pg) => sum + pg.sortedBuckets.reduce((s, [, tasks]) => s + tasks.length, 0), 0
  );

  if (tasks.length === 0) {
    return <div className="text-center py-12 text-gray-600 text-sm">No priority tasks.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="bg-gray-900/60 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-red-600 max-w-[220px]"
        >
          <option value="all">All Projects ({projectsWithTasks.length})</option>
          {projectsWithTasks.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
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

        <span className="text-[10px] text-gray-700 ml-auto tabular-nums">
          {totalCount} task{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grouped output */}
      {groupedData.map(pg => (
        <div key={pg.project?.id || 'none'}>
          {/* Project header */}
          <div className="border-b-2 border-gray-600 pb-1 mb-2">
            <h2 className="text-sm font-bold text-gray-200 tracking-wide uppercase">
              {pg.project?.name || 'No Project'}
              {pg.project?.client_name && (
                <span className="font-normal text-gray-500 normal-case ml-2 text-xs">
                  {pg.project.client_name}
                </span>
              )}
            </h2>
          </div>

          {/* Category buckets */}
          {pg.sortedBuckets.map(([bucketName, bucketTasks]) => (
            <div key={bucketName} className="mb-3">
              {/* Bucket label */}
              <div className="flex items-center gap-2 mb-0.5 pl-1">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  {bucketName}
                </span>
                <span className="text-[10px] text-gray-700 tabular-nums">
                  ({bucketTasks.length})
                </span>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-800/60 mb-0.5" />

              {/* Task rows */}
              {bucketTasks.map(task => (
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
          ))}
        </div>
      ))}
    </div>
  );
}