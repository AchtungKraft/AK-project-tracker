import React, { useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sortChecklistItems } from "@/components/tasks/checklistHelpers";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Printer, Plus } from "lucide-react";
import ExecutionTaskRow from "./ExecutionTaskRow";
import ProjectTypeGroupHeader from "./ProjectTypeGroupHeader";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import { sortTasksByPriority } from "@/utils/taskPrioritySort";
import { groupProjectsByType } from "@/utils/projectTypeGroups";

function resolveCategoryName(catId, categories) {
  const cat = categories.find(c => c.id === catId);
  if (!cat) return null;
  return cat.name;
}

export default function PriorityExecutionView({
  tasks,
  projects,
  projectTypes = [],
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

  // ── Create task modal state ──
  const [createTaskForProjectId, setCreateTaskForProjectId] = useState(null);

  // ── Filters ──
  const [projectFilter, setProjectFilter] = useState('all');
  const [assignedFilter, setAssignedFilter] = useState('all');

  const activeTeamMembers = useMemo(() =>
    teamMembers.filter(tm => tm.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [teamMembers]
  );

  // ── Build ProjectType → Project → Category → Tasks ──
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (projectFilter !== 'all' && t.project_id !== projectFilter) return false;
      if (assignedFilter !== 'all' && t.assigned_team_member_id !== assignedFilter) return false;
      return true;
    });
  }, [tasks, projectFilter, assignedFilter]);

  // All projects that have tasks (for filter dropdown, before project filter applied)
  const allProjectsWithTasks = useMemo(() => {
    const pids = new Set(tasks.map(t => t.project_id));
    return projects.filter(p => pids.has(p.id)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [tasks, projects]);

  // Projects with tasks after filtering (for type grouping)
  const filteredProjectsWithTasks = useMemo(() => {
    const pids = new Set(filteredTasks.map(t => t.project_id));
    return projects.filter(p => pids.has(p.id));
  }, [projects, filteredTasks]);

  const typeGroups = useMemo(() => groupProjectsByType(filteredProjectsWithTasks, projectTypes), [filteredProjectsWithTasks, projectTypes]);

  // Build tasks grouped by project then category
  const tasksByProject = useMemo(() => {
    const map = {};
    filteredTasks.forEach(task => {
      const pid = task.project_id || 'no-project';
      if (!map[pid]) map[pid] = {};
      const catName = resolveCategoryName(task.category_id, categories) || 'Uncategorized';
      if (!map[pid][catName]) map[pid][catName] = [];
      map[pid][catName].push(task);
    });
    // Sort categories and tasks within each
    Object.keys(map).forEach(pid => {
      Object.keys(map[pid]).forEach(cat => {
        map[pid][cat] = sortTasksByPriority(map[pid][cat]);
      });
    });
    return map;
  }, [filteredTasks, categories]);

  const totalCount = filteredTasks.length;

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
          <option value="all">All Projects ({allProjectsWithTasks.length})</option>
          {allProjectsWithTasks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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

      {typeGroups.map(typeGroup => {
        // Count tasks in this type group
        const typeTaskCount = typeGroup.projects.reduce((sum, p) => {
          const cats = tasksByProject[p.id];
          if (!cats) return sum;
          return sum + Object.values(cats).reduce((s, arr) => s + arr.length, 0);
        }, 0);
        if (typeTaskCount === 0) return null;

        return (
          <ProjectTypeGroupHeader
            key={typeGroup.typeId}
            typeName={typeGroup.typeName}
            typeColor={typeGroup.typeColor}
            taskCount={typeTaskCount}
            projectIds={typeGroup.projects.filter(p => tasksByProject[p.id]).map(p => p.id)}
          >
            {typeGroup.projects.map(project => {
              const cats = tasksByProject[project.id];
              if (!cats) return null;
              const sortedCats = Object.entries(cats).sort(([a], [b]) => {
                if (a === 'Uncategorized') return 1;
                if (b === 'Uncategorized') return -1;
                return a.localeCompare(b);
              });

              return (
                <div key={project.id} className="mb-6 ml-2">
                  <div className="flex items-center gap-2 border-b-2 border-gray-400 pb-1 mb-3">
                    <h1 className="text-lg font-bold text-gray-100 flex-1 min-w-0">
                      <Link to={createPageUrl("ProjectDetail") + "?id=" + project.id} className="hover:text-red-400 hover:underline transition-colors">
                        {project.name}
                      </Link>
                    </h1>
                    <button
                      onClick={() => setCreateTaskForProjectId(project.id)}
                      className="text-[10px] text-green-500 hover:text-green-300 transition-colors shrink-0 px-1.5 py-0.5 rounded hover:bg-gray-800 flex items-center gap-0.5 no-print"
                      title="Add task to this project"
                    >
                      <Plus className="w-3 h-3" />
                      Add Task
                    </button>
                    <button
                      onClick={() => window.open(`/projectprintview?id=${project.id}`, '_blank')}
                      className="text-[10px] text-gray-500 hover:text-white transition-colors shrink-0 px-1.5 py-0.5 rounded hover:bg-gray-800"
                      title="Print checklist"
                    >
                      <Printer className="w-3 h-3" />
                    </button>
                  </div>

                  {sortedCats.map(([catName, catTasks]) => (
                    <div key={catName} className="mb-4">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-white/10 pb-1 mb-1">
                        {catName}
                        <span className="text-gray-600 font-normal ml-2">({catTasks.length})</span>
                      </h2>

                      {catTasks.map(task => (
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
              );
            })}
          </ProjectTypeGroupHeader>
        );
      })}

      {/* Create Task Modal */}
      {createTaskForProjectId && (
        <CreateTaskModal
          projectId={createTaskForProjectId}
          defaultIsPriority={true}
          onClose={() => setCreateTaskForProjectId(null)}
        />
      )}
    </div>
  );
}