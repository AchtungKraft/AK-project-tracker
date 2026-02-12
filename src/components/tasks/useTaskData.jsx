import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { TASK_CACHE_KEYS } from "./useTaskInteraction";

/**
 * useTaskData
 * Shared task data provider hook for both PriorityDashboard and ProjectDetail
 * 
 * @param {Object} options
 * @param {'all' | 'project'} options.scope - Task scope
 * @param {string} options.projectId - Project ID (required when scope='project')
 * @param {boolean} options.priorityOnly - Filter to priority tasks only
 */
export function useTaskData({ scope = 'all', projectId = null, priorityOnly = false } = {}) {
  const queryClient = useQueryClient();

  // Fetch tasks based on scope
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: scope === 'project' ? ['tasks', projectId] : ['allTasks'],
    queryFn: async () => {
      if (scope === 'project' && projectId) {
        return base44.entities.Task.filter({ project_id: projectId });
      }
      return base44.entities.Task.list();
    },
    enabled: scope === 'all' || !!projectId,
  });

  // Fetch priority tasks separately for priority filtering
  const { data: priorityTasks = [] } = useQuery({
    queryKey: ['priorityTasks'],
    queryFn: () => base44.entities.Task.filter({ is_priority: true }),
    enabled: priorityOnly,
  });

  // Fetch all related data
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: allTaskComments = [] } = useQuery({
    queryKey: ['allTaskComments'],
    queryFn: () => base44.entities.TaskComment.list(),
  });

  // Create comment count map
  const commentCountByTaskId = useMemo(() => {
    const map = {};
    allTaskComments.forEach(comment => {
      map[comment.task_id] = (map[comment.task_id] || 0) + 1;
    });
    return map;
  }, [allTaskComments]);

  // Get completed status
  const completedStatus = useMemo(() => {
    const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
    return taskStatuses.find(s => {
      const label = s.label?.toLowerCase() || '';
      return label.includes('complete') || label.includes('done');
    });
  }, [statuses]);

  // Filter tasks based on options
  const filteredTasks = useMemo(() => {
    let result = priorityOnly ? priorityTasks : tasks;
    
    // Filter by project if scope is project
    if (scope === 'project' && projectId) {
      result = result.filter(t => t.project_id === projectId);
    }

    return result;
  }, [tasks, priorityTasks, scope, projectId, priorityOnly]);

  // Active (non-completed) tasks
  const activeTasks = useMemo(() => {
    return filteredTasks.filter(t => t.status_id !== completedStatus?.id);
  }, [filteredTasks, completedStatus]);

  // Update task mutation - optimistic updates + invalidate ALL task-related queries
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      await queryClient.cancelQueries({ queryKey: ['allTasks'] });
      await queryClient.cancelQueries({ queryKey: ['priorityTasks'] });
      if (projectId) {
        await queryClient.cancelQueries({ queryKey: ['tasks', projectId] });
        await queryClient.cancelQueries({ queryKey: ['projectTasks', projectId] });
      }

      // Snapshot previous values
      const previousAllTasks = queryClient.getQueryData(['allTasks']);
      const previousProjectTasks = projectId ? queryClient.getQueryData(['tasks', projectId]) : null;
      const previousPriorityTasks = queryClient.getQueryData(['priorityTasks']);

      // Optimistically update all caches
      const updateCache = (old) => {
        if (!old) return old;
        return old.map(t => t.id === id ? { ...t, ...data } : t);
      };

      queryClient.setQueryData(['allTasks'], updateCache);
      queryClient.setQueryData(['priorityTasks'], updateCache);
      if (projectId) {
        queryClient.setQueryData(['tasks', projectId], updateCache);
        queryClient.setQueryData(['projectTasks', projectId], updateCache);
      }

      return { previousAllTasks, previousProjectTasks, previousPriorityTasks };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousAllTasks) {
        queryClient.setQueryData(['allTasks'], context.previousAllTasks);
      }
      if (context?.previousProjectTasks && projectId) {
        queryClient.setQueryData(['tasks', projectId], context.previousProjectTasks);
      }
      if (context?.previousPriorityTasks) {
        queryClient.setQueryData(['priorityTasks'], context.previousPriorityTasks);
      }
      toast.error('Failed to update task');
    },
    onSuccess: (updatedTask, variables) => {
      console.log("TASK UPDATED", variables.id, variables.data);
      
      // Use centralized cache keys
      TASK_CACHE_KEYS.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      
      // Additional keys not in centralized list
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      
      // Project-specific queries
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
        queryClient.invalidateQueries({ queryKey: ['projectTasks', projectId] });
      }
      
      // Also invalidate for any project ID in the task data or the updated task
      const taskProjectId = variables?.data?.project_id || updatedTask?.project_id;
      if (taskProjectId && taskProjectId !== projectId) {
        queryClient.invalidateQueries({ queryKey: ['tasks', taskProjectId] });
        queryClient.invalidateQueries({ queryKey: ['projectTasks', taskProjectId] });
      }
    },
  });

  // Handler functions
  const handleToggleComplete = async (task) => {
    const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
    const isCurrentlyComplete = task.status_id === completedStatus?.id;
    
    if (isCurrentlyComplete) {
      const firstStatus = taskStatuses.find(s => s.id !== completedStatus?.id);
      if (firstStatus) {
        await updateTaskMutation.mutateAsync({
          id: task.id,
          data: { status_id: firstStatus.id, completed_date: null }
        });
        toast.success('Task reopened');
      }
    } else {
      if (completedStatus) {
        await updateTaskMutation.mutateAsync({
          id: task.id,
          data: { status_id: completedStatus.id, completed_date: new Date().toISOString() }
        });
        toast.success('Task completed');
      }
    }
  };

  const handleUpdateDueDate = async (task, dueDate) => {
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { due_date: dueDate }
    });
    toast.success(dueDate ? 'Due date updated' : 'Due date removed');
  };

  const handleUpdateStartDate = async (task, startDate) => {
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { start_date: startDate }
    });
    toast.success(startDate ? 'Start date updated' : 'Start date removed');
  };

  const handleTogglePriority = async (task, skipConfirm = false) => {
    // If removing priority and skipConfirm is false, return a flag to show confirmation
    if (task.is_priority && !skipConfirm) {
      return { needsConfirmation: true, task };
    }
    
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { is_priority: !task.is_priority }
    });
    toast.success(task.is_priority ? 'Removed from priority' : 'Marked as priority');
    return { needsConfirmation: false };
  };

  // Direct priority update without confirmation (for use after confirm dialog)
  const handleConfirmRemovePriority = async (task) => {
    console.log("PRIORITY REMOVED CONFIRMED", task.name);
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { is_priority: false }
    });
    toast.success('Removed from priority');
  };

  // Generic task update function for external use
  const updateTask = async (taskId, data) => {
    await updateTaskMutation.mutateAsync({ id: taskId, data });
  };

  return {
    // Data
    tasks: filteredTasks,
    activeTasks,
    allTasks: tasks,
    projects,
    categories,
    teamMembers,
    statuses,
    commentCountByTaskId,
    completedStatus,
    
    // Loading states
    isLoading: tasksLoading,
    
    // Mutation
    updateTaskMutation,
    updateTask,
    
    // Handlers
    handleToggleComplete,
    handleUpdateDueDate,
    handleUpdateStartDate,
    handleTogglePriority,
    handleConfirmRemovePriority,
  };
}

export default useTaskData;