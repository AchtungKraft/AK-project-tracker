import React, { useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sortChecklistItems } from "@/components/tasks/checklistHelpers";
import { toast } from "sonner";
import ExecutionTaskRow from "./ExecutionTaskRow";

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
    toast.success(item.is_complete ? 'Unchecked' : 'Checked');
  }, [toggleChecklistMutation]);

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

  // ── Build Project → Category → Tasks structure ──
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
      const catName = resolveCategoryName(task.category_id, categories) || 'UNCATEGORIZED';
      if (!projectMap[pid].buckets[catName]) projectMap[pid].buckets[catName] = [];
      projectMap[pid].buckets[catName].push(task);
    });

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

  // ── Helpers for rollup stats ──
  function bucketStats(bucketTasks) {
    let partsInstalled = 0, partsTotal = 0;
    bucketTasks.forEach(t => {
      const pp = partsProgressByTaskId[t.id];
      if (pp) { partsInstalled += pp.installed; partsTotal += pp.total; }
    });
    return { count: bucketTasks.length, partsInstalled, partsTotal };
  }

  function projectStats(pg) {
    let total = 0, partsInstalled = 0, partsTotal = 0;
    pg.sortedBuckets.forEach(([, tasks]) => {
      total += tasks.length;
      tasks.forEach(t => {
        const pp = partsProgressByTaskId[t.id];
        if (pp) { partsInstalled += pp.installed; partsTotal += pp.total; }
      });
    });
    return { total, partsInstalled, partsTotal };
  }

  if (tasks.length === 0) {
    return <div className="text-center py-12 text-gray-600 text-sm">No priority tasks.</div>;
  }

  return (
    <div>
      {/* Filters — compact bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="bg-transparent border border-gray-700/60 text-gray-400 text-[11px] rounded px-1.5 py-1 focus:outline-none focus:border-red-600 max-w-[200px]"
        >
          <option value="all">All Projects ({projectsWithTasks.length})</option>
          {projectsWithTasks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={assignedFilter}
          onChange={e => setAssignedFilter(e.target.value)}
          className="bg-transparent border border-gray-700/60 text-gray-400 text-[11px] rounded px-1.5 py-1 focus:outline-none focus:border-red-600"
        >
          <option value="all">All Assignees</option>
          {activeTeamMembers.map(tm => <option key={tm.id} value={tm.id}>{tm.full_name}</option>)}
        </select>
      </div>

      {/* Document body */}
      <div className="space-y-5">
        {groupedData.map(pg => {
          const ps = projectStats(pg);
          return (
            <div key={pg.project?.id || 'none'}>
              {/* ── PROJECT HEADER ── */}
              <div className="border-b border-gray-500 pb-0.5 mb-1.5 flex items-baseline justify-between">
                <h2 className="text-[13px] font-bold text-gray-200 uppercase tracking-wide leading-none">
                  {pg.project?.name || 'No Project'}
                  {pg.project?.client_name && (
                    <span className="font-normal text-gray-600 normal-case ml-2 text-[11px]">
                      {pg.project.client_name}
                    </span>
                  )}
                </h2>
                <span className="text-[9px] text-gray-600 tabular-nums font-mono shrink-0">
                  {ps.total} tasks
                  {ps.partsTotal > 0 && <> · {ps.partsInstalled}/{ps.partsTotal} parts</>}
                </span>
              </div>

              {/* ── CATEGORY BUCKETS ── */}
              {pg.sortedBuckets.map(([bucketName, bucketTasks]) => {
                const bs = bucketStats(bucketTasks);
                return (
                  <div key={bucketName} className="mb-2">
                    {/* Bucket label */}
                    <div className="flex items-baseline justify-between pl-1 mb-px">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.08em] leading-none">
                        {bucketName}
                      </span>
                      <span className="text-[9px] text-gray-700 tabular-nums font-mono">
                        {bs.count} tasks
                        {bs.partsTotal > 0 && <> · {bs.partsInstalled}/{bs.partsTotal}p</>}
                      </span>
                    </div>
                    <div className="border-t border-gray-800/50" />

                    {/* Task rows */}
                    {bucketTasks.map(task => (
                      <ExecutionTaskRow
                        key={task.id}
                        task={task}
                        assignee={teamMembers.find(tm => tm.id === task.assigned_team_member_id)}
                        status={statuses.find(s => s.id === task.status_id)}
                        checklistItems={checklistByTaskId[task.id] || []}
                        partsProgress={partsProgressByTaskId[task.id]}
                        commentCount={commentCountByTaskId[task.id] || 0}
                        onToggleComplete={onToggleComplete}
                        onToggleChecklistItem={handleToggleChecklistItem}
                        onTaskClick={onTaskClick}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}