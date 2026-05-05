import React, { useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sortChecklistItems } from "@/components/tasks/checklistHelpers";
import { toast } from "sonner";
import ExecutionTaskRow from "./ExecutionTaskRow";
import { sortTasksByPriority } from "@/utils/taskPrioritySort";

function resolveCategoryName(catId, categories) {
  const cat = categories.find(c => c.id === catId);
  if (!cat) return null;
  return cat.name;
}

export default function PriorityExecutionView({
  tasks,
  projects,
  teamMembers,
  categories,
  statuses,
  partsProgressByTaskId = {},
  commentCountByTaskId = {},
  onToggleComplete,
  onTaskClick,
  onUpdateDueDate,
  onTogglePriority,
  updateTaskMutation,
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

  const invalidateChecklists = () => {
    queryClient.invalidateQueries({ queryKey: ['executionChecklist'] });
    queryClient.invalidateQueries({ queryKey: ['taskChecklistItems'] });
  };

  const toggleChecklistMutation = useMutation({
    mutationFn: (item) =>
      base44.entities.TaskChecklistItem.update(item.id, {
        is_complete: !item.is_complete,
        completed_at: !item.is_complete ? new Date().toISOString() : null,
      }),
    onSuccess: invalidateChecklists,
  });

  const updateChecklistTitleMutation = useMutation({
    mutationFn: ({ id, title }) => base44.entities.TaskChecklistItem.update(id, { title }),
    onSuccess: invalidateChecklists,
  });

  const deleteChecklistItemMutation = useMutation({
    mutationFn: (id) => base44.entities.TaskChecklistItem.delete(id),
    onSuccess: invalidateChecklists,
  });

  const handleToggleChecklistItem = useCallback((item) => {
    toggleChecklistMutation.mutate(item);
    toast.success(item.is_complete ? 'Unchecked' : 'Checked');
  }, [toggleChecklistMutation]);

  const handleUpdateChecklistTitle = useCallback((id, title) => {
    const trimmed = title.trim();
    if (!trimmed) {
      deleteChecklistItemMutation.mutate(id);
    } else {
      updateChecklistTitleMutation.mutate({ id, title: trimmed });
    }
  }, [updateChecklistTitleMutation, deleteChecklistItemMutation]);

  const handleDeleteChecklistItem = useCallback((id) => {
    deleteChecklistItemMutation.mutate(id);
  }, [deleteChecklistItemMutation]);

  // ── Team map ──
  const teamMap = useMemo(() => {
    const m = {};
    teamMembers.forEach(tm => { m[tm.id] = tm.full_name; });
    return m;
  }, [teamMembers]);

  // ── Filters ──
  const [projectFilter, setProjectFilter] = useState('all');
  const [assignedFilter, setAssignedFilter] = useState('all');

  const projectsWithTasks = useMemo(() => {
    const ids = new Set(tasks.map(t => t.project_id));
    return projects.filter(p => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, projects]);

  const activeTeamMembers = useMemo(() =>
    teamMembers.filter(tm => tm.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [teamMembers]
  );

  // ── Build Project → Category → Tasks ──
  const groupedData = useMemo(() => {
    const filtered = tasks.filter(t => {
      if (projectFilter !== 'all' && t.project_id !== projectFilter) return false;
      if (assignedFilter !== 'all' && t.assigned_team_member_id !== assignedFilter) return false;
      return true;
    });

    const projectMap = {};
    filtered.forEach(task => {
      const pid = task.project_id || 'no-project';
      if (!projectMap[pid]) {
        projectMap[pid] = { project: projects.find(p => p.id === pid), buckets: {} };
      }
      const catName = resolveCategoryName(task.category_id, categories) || 'Uncategorized';
      if (!projectMap[pid].buckets[catName]) projectMap[pid].buckets[catName] = [];
      projectMap[pid].buckets[catName].push(task);
    });

    return Object.values(projectMap)
      .sort((a, b) => (a.project?.name || '').localeCompare(b.project?.name || ''))
      .map(pg => ({
        ...pg,
        sortedBuckets: Object.entries(pg.buckets)
          .sort(([a], [b]) => {
            if (a === 'Uncategorized') return 1;
            if (b === 'Uncategorized') return -1;
            return a.localeCompare(b);
          })
          .map(([name, tasks]) => [name, sortTasksByPriority(tasks)]),
      }));
  }, [tasks, projects, categories, projectFilter, assignedFilter]);

  const totalCount = groupedData.reduce(
    (sum, pg) => sum + pg.sortedBuckets.reduce((s, [, t]) => s + t.length, 0), 0
  );

  if (tasks.length === 0) {
    return <p className="text-gray-500 text-center py-8">No active priority tasks.</p>;
  }

  return (
    <div>
      {/* Filter bar — no-print style */}
      <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="bg-transparent border border-gray-700 text-gray-400 text-xs rounded px-1.5 py-1 focus:outline-none max-w-[200px]"
        >
          <option value="all">All Projects ({projectsWithTasks.length})</option>
          {projectsWithTasks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={assignedFilter}
          onChange={e => setAssignedFilter(e.target.value)}
          className="bg-transparent border border-gray-700 text-gray-400 text-xs rounded px-1.5 py-1 focus:outline-none"
        >
          <option value="all">All Assignees</option>
          {activeTeamMembers.map(tm => <option key={tm.id} value={tm.id}>{tm.full_name}</option>)}
        </select>
        <span className="text-xs text-gray-600 ml-auto tabular-nums">
          {totalCount} priority tasks
        </span>
      </div>

      {groupedData.map(pg => (
        <div key={pg.project?.id || 'none'} className="mb-6">
          <h1 className="text-lg font-bold border-b-2 border-gray-400 pb-1 mb-3 text-gray-100">
            {pg.project?.name || 'No Project'}
          </h1>

          {pg.sortedBuckets.map(([bucketName, bucketTasks]) => (
            <div key={bucketName} className="mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-white/10 pb-1 mb-1">
                {bucketName}
                <span className="text-gray-600 font-normal ml-2">({bucketTasks.length})</span>
              </h2>

              {bucketTasks.map(task => (
                <ExecutionTaskRow
                  key={task.id}
                  task={task}
                  assigneeName={teamMap[task.assigned_team_member_id]}
                  teamMembers={teamMembers}
                  checklistItems={checklistByTaskId[task.id] || []}
                  onToggleComplete={onToggleComplete}
                  onToggleChecklistItem={handleToggleChecklistItem}
                  onUpdateChecklistTitle={handleUpdateChecklistTitle}
                  onDeleteChecklistItem={handleDeleteChecklistItem}
                  onTaskClick={onTaskClick}
                  onUpdateDueDate={onUpdateDueDate}
                  onTogglePriority={onTogglePriority}
                  updateTaskMutation={updateTaskMutation}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}