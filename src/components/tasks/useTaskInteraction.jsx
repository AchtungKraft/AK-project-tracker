import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * TASK CACHE KEYS - Single source of truth for all task-related cache invalidation
 */
export const TASK_CACHE_KEYS = [
  ['tasks'],
  ['projectTasks'],
  ['priorityTasks'],
  ['allTasksForCalendar'],
  ['task'], // Individual task queries
];

/**
 * useTaskInteraction - THE ONLY allowed interface for task mutations
 * 
 * RULE: No component may call base44.entities.Task.update() directly.
 * Everything must route through this hook.
 */
export function useTaskInteraction({ projectId = null, priorityOnly = false } = {}) {
  const queryClient = useQueryClient();
  
  // UI State
  const [activeTask, setActiveTask] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingPriorityRemoval, setPendingPriorityRemoval] = useState(null);

  // ═══════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════

  const tasksQuery = useQuery({
    queryKey: projectId ? ['projectTasks', projectId] : (priorityOnly ? ['priorityTasks'] : ['tasks']),
    queryFn: () => {
      if (projectId) {
        return base44.entities.Task.filter({ project_id: projectId });
      }
      if (priorityOnly) {
        return base44.entities.Task.filter({ is_priority: true });
      }
      return base44.entities.Task.list();
    },
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: allTaskComments = [] } = useQuery({
    queryKey: ['allTaskComments'],
    queryFn: () => base44.entities.TaskComment.list(),
  });

  // ═══════════════════════════════════════════════════════════════
  // DERIVED DATA
  // ═══════════════════════════════════════════════════════════════

  const tasks = tasksQuery.data || [];

  const taskStatuses = useMemo(() => 
    statuses.filter(s => s.scope === 'Task' && s.active),
    [statuses]
  );

  const completedStatus = useMemo(() => 
    taskStatuses.find(s => {
      const label = s.label.toLowerCase();
      return label.includes('complete') || label.includes('done');
    }),
    [taskStatuses]
  );

  const commentCountByTaskId = useMemo(() => {
    const map = {};
    allTaskComments.forEach(comment => {
      map[comment.task_id] = (map[comment.task_id] || 0) + 1;
    });
    return map;
  }, [allTaskComments]);

  // ═══════════════════════════════════════════════════════════════
  // CACHE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  const invalidateAllTaskCaches = useCallback(() => {
    TASK_CACHE_KEYS.forEach(key => {
      queryClient.invalidateQueries({ queryKey: key });
    });
  }, [queryClient]);

  const optimisticUpdateAllCaches = useCallback((taskId, updates) => {
    TASK_CACHE_KEYS.forEach(key => {
      queryClient.setQueryData(key, (old) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map(t => t.id === taskId ? { ...t, ...updates } : t);
        }
        if (old.id === taskId) {
          return { ...old, ...updates };
        }
        return old;
      });
    });
  }, [queryClient]);

  // ═══════════════════════════════════════════════════════════════
  // MUTATIONS
  // ═══════════════════════════════════════════════════════════════

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      
      // Snapshot previous values for rollback
      const previousData = {};
      TASK_CACHE_KEYS.forEach(key => {
        previousData[key.join('_')] = queryClient.getQueryData(key);
      });

      // Optimistic update
      optimisticUpdateAllCaches(id, data);

      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        Object.entries(context.previousData).forEach(([key, data]) => {
          if (data) {
            queryClient.setQueryData(key.split('_'), data);
          }
        });
      }
      toast.error('Failed to update task');
    },
    onSuccess: () => {
      invalidateAllTaskCaches();
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId) => base44.entities.Task.delete(taskId),
    onSuccess: () => {
      invalidateAllTaskCaches();
      toast.success('Task deleted');
      closeTaskDrawer();
    },
    onError: () => {
      toast.error('Failed to delete task');
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API - Task Updates
  // ═══════════════════════════════════════════════════════════════

  const updateTask = useCallback(async (taskId, updates) => {
    return updateTaskMutation.mutateAsync({ id: taskId, data: updates });
  }, [updateTaskMutation]);

  const deleteTask = useCallback(async (taskId) => {
    return deleteTaskMutation.mutateAsync(taskId);
  }, [deleteTaskMutation]);

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API - Priority Toggle with Safety Guard
  // ═══════════════════════════════════════════════════════════════

  const togglePriority = useCallback(async (task, skipConfirm = false) => {
    // SAFETY GUARD: If removing priority, require confirmation
    if (task.is_priority && !skipConfirm) {
      console.log('PRIORITY CONFIRM SHOWN', task.name);
      setPendingPriorityRemoval(task);
      return { requiresConfirmation: true };
    }

    // Execute update
    await updateTask(task.id, { is_priority: !task.is_priority });
    
    if (task.is_priority) {
      console.log('PRIORITY REMOVED CONFIRMED', task.name);
      toast.success('Priority removed');
    } else {
      toast.success('Marked as priority');
    }

    return { success: true };
  }, [updateTask]);

  const confirmRemovePriority = useCallback(async () => {
    if (!pendingPriorityRemoval) return;
    
    const task = pendingPriorityRemoval;
    setPendingPriorityRemoval(null);
    
    await updateTask(task.id, { is_priority: false });
    console.log('PRIORITY REMOVED CONFIRMED', task.name);
    toast.success('Priority removed');
  }, [pendingPriorityRemoval, updateTask]);

  const cancelPriorityRemoval = useCallback(() => {
    setPendingPriorityRemoval(null);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API - Status Toggle
  // ═══════════════════════════════════════════════════════════════

  const toggleComplete = useCallback(async (task) => {
    const isCurrentlyComplete = task.status_id === completedStatus?.id;

    if (isCurrentlyComplete) {
      const firstStatus = taskStatuses.find(s => s.id !== completedStatus?.id);
      if (firstStatus) {
        await updateTask(task.id, {
          status_id: firstStatus.id,
          completed_date: null,
        });
        toast.success('Task reopened');
      }
    } else {
      if (completedStatus) {
        await updateTask(task.id, {
          status_id: completedStatus.id,
          completed_date: new Date().toISOString(),
        });
        toast.success('Task completed');
      }
    }
  }, [completedStatus, taskStatuses, updateTask]);

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API - Date Updates
  // ═══════════════════════════════════════════════════════════════

  const updateDueDate = useCallback(async (task, date) => {
    await updateTask(task.id, { due_date: date });
    toast.success(date ? 'Due date updated' : 'Due date cleared');
  }, [updateTask]);

  const updateStartDate = useCallback(async (task, date) => {
    await updateTask(task.id, { start_date: date });
    toast.success(date ? 'Start date updated' : 'Start date cleared');
  }, [updateTask]);

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API - Drawer Management
  // ═══════════════════════════════════════════════════════════════

  const openTaskDrawer = useCallback((task) => {
    setActiveTask(task);
    setIsEditing(false);
  }, []);

  const closeTaskDrawer = useCallback(() => {
    setActiveTask(null);
    setIsEditing(false);
  }, []);

  const startEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  const stopEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // RETURN API
  // ═══════════════════════════════════════════════════════════════

  return {
    // Data
    tasks,
    statuses: taskStatuses,
    categories,
    teamMembers,
    completedStatus,
    commentCountByTaskId,
    isLoading: tasksQuery.isLoading,

    // Task Mutations
    updateTask,
    deleteTask,
    toggleComplete,
    togglePriority,
    updateDueDate,
    updateStartDate,

    // Priority Confirmation State
    pendingPriorityRemoval,
    confirmRemovePriority,
    cancelPriorityRemoval,

    // Drawer State
    activeTask,
    isEditing,
    openTaskDrawer,
    closeTaskDrawer,
    startEditing,
    stopEditing,

    // Mutation States
    isUpdating: updateTaskMutation.isPending,
    isDeleting: deleteTaskMutation.isPending,
  };
}

export default useTaskInteraction;