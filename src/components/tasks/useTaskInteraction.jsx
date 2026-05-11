import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { normalizeTask, normalizeTasks } from './normalizeTask';
import { 
  incrementTaskVersion, 
  emitTaskStateUpdated, 
  setMutationTimestamp, 
  shouldApplyMutation,
  getTaskVersion
} from './taskStateEvents';

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
  
  // Version tracking for mutation safety
  const taskVersionRef = useRef(getTaskVersion());
  
  // UI State
  const [activeTask, setActiveTask] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingPriorityRemoval, setPendingPriorityRemoval] = useState(null);
  const [pendingChecklistCompletion, setPendingChecklistCompletion] = useState(null);
  const [pendingUninstalledPartsCompletion, setPendingUninstalledPartsCompletion] = useState(null);

  // ═══════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════

  const tasksQuery = useQuery({
    queryKey: projectId ? ['projectTasks', projectId] : (priorityOnly ? ['priorityTasks'] : ['tasks']),
    queryFn: async () => {
      let rawTasks;
      if (projectId) {
        rawTasks = await base44.entities.Task.filter({ project_id: projectId });
      } else if (priorityOnly) {
        rawTasks = await base44.entities.Task.filter({ is_priority: true });
      } else {
        rawTasks = await base44.entities.Task.list();
      }
      // Normalize tasks after fetch
      return normalizeTasks(rawTasks);
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

  const optimisticUpdateAllCaches = useCallback((taskId, updates, mutationTimestamp) => {
    // Check if this mutation should be applied (race condition guard)
    if (!shouldApplyMutation(taskId, mutationTimestamp)) {
      console.warn(`[MUTATION GUARD] Stale mutation blocked for task ${taskId}`);
      return false;
    }
    
    // Record mutation timestamp
    setMutationTimestamp(taskId, mutationTimestamp);
    
    TASK_CACHE_KEYS.forEach(key => {
      queryClient.setQueryData(key, (old) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map(t => t.id === taskId ? normalizeTask({ ...t, ...updates }) : t);
        }
        if (old.id === taskId) {
          return normalizeTask({ ...old, ...updates });
        }
        return old;
      });
    });
    return true;
  }, [queryClient]);

  // ═══════════════════════════════════════════════════════════════
  // MUTATIONS
  // ═══════════════════════════════════════════════════════════════

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data, mutationTimestamp }) => base44.entities.Task.update(id, data),
    onMutate: async ({ id, data, mutationTimestamp }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      
      // Snapshot previous values for rollback
      const previousData = {};
      TASK_CACHE_KEYS.forEach(key => {
        previousData[key.join('_')] = queryClient.getQueryData(key);
      });

      // Optimistic update with mutation guard
      const applied = optimisticUpdateAllCaches(id, data, mutationTimestamp);

      return { previousData, applied };
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
    onSuccess: (result, variables) => {
      // Increment version on successful mutation
      taskVersionRef.current = incrementTaskVersion();
      
      // Emit global state updated event
      emitTaskStateUpdated({
        taskId: variables.id,
        updates: variables.data,
        source: 'useTaskInteraction',
      });
      
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
    const mutationTimestamp = Date.now();
    return updateTaskMutation.mutateAsync({ id: taskId, data: updates, mutationTimestamp });
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

  const [pendingTimeCompletion, setPendingTimeCompletion] = useState(null);

  const executeCompletion = useCallback(async (task, actualHours = null) => {
    if (completedStatus) {
      const updates = {
        status_id: completedStatus.id,
        completed_date: new Date().toISOString(),
      };
      if (actualHours != null) {
        updates.actual_hours = actualHours;
      }
      await updateTask(task.id, updates);
      toast.success('Task completed');
    }
  }, [completedStatus, updateTask]);

  /**
   * countUninstalledCommitments
   * 
   * TaskPartLink → PartCommitment → count installable.
   * Used to show a warning when completing a task that still has uninstalled parts.
   */
  const countUninstalledCommitments = useCallback(async (task) => {
    const links = await base44.entities.TaskPartLink.filter({ task_id: task.id });
    if (links.length === 0) return 0;

    const commitmentIds = [...new Set(links.map(l => l.commitment_id).filter(Boolean))];
    if (commitmentIds.length === 0) return 0;

    const commitments = await base44.entities.PartCommitment.filter({ id: commitmentIds });

    return commitments.filter(c => {
      const remaining = Math.max(0, (c.reserved_from_stock ?? 0) - (c.qty_installed ?? 0));
      const status = (c.commitment_status || '').toLowerCase();
      return remaining > 0 && status !== 'cancelled' && status !== 'installed';
    }).length;
  }, []);

  const proceedToUninstalledCheck = useCallback(async (task) => {
    const count = await countUninstalledCommitments(task);
    if (count > 0) {
      setPendingUninstalledPartsCompletion({ task, uninstalledCount: count });
      return { requiresConfirmation: true };
    }
    // Show time completion modal instead of immediate completion
    setPendingTimeCompletion({ task, incompleteChecklistCount: 0 });
  }, [countUninstalledCommitments]);

  const toggleComplete = useCallback(async (task, skipChecklistCheck = false) => {
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
      if (!skipChecklistCheck) {
        // Check for incomplete checklist items before completing
        const checklistItems = await base44.entities.TaskChecklistItem.filter({ task_id: task.id });
        const incompleteCount = checklistItems.filter(i => !i.is_complete).length;
        if (incompleteCount > 0) {
          setPendingChecklistCompletion({ task, incompleteCount });
          return { requiresConfirmation: true };
        }
      }
      // Checklist passed — now check for uninstalled parts warning
      await proceedToUninstalledCheck(task);
    }
  }, [completedStatus, taskStatuses, updateTask, proceedToUninstalledCheck]);

  // Also handle checklist completion -> time modal with count info
  const proceedToTimeModal = useCallback((task, incompleteChecklistCount = 0) => {
    setPendingTimeCompletion({ task, incompleteChecklistCount });
  }, []);

  const confirmChecklistCompletion = useCallback(async () => {
    if (!pendingChecklistCompletion) return;
    const { task } = pendingChecklistCompletion;
    setPendingChecklistCompletion(null);
    // After checklist confirm, proceed to uninstalled parts check
    await proceedToUninstalledCheck(task);
  }, [pendingChecklistCompletion, proceedToUninstalledCheck]);

  const cancelChecklistCompletion = useCallback(() => {
    setPendingChecklistCompletion(null);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API - Uninstalled Parts Warning on Completion
  // ═══════════════════════════════════════════════════════════════

  const confirmUninstalledPartsCompletion = useCallback(async () => {
    if (!pendingUninstalledPartsCompletion) return;
    const { task } = pendingUninstalledPartsCompletion;
    setPendingUninstalledPartsCompletion(null);
    // Show time completion modal after uninstalled parts confirmation
    setPendingTimeCompletion({ task, incompleteChecklistCount: 0 });
  }, [pendingUninstalledPartsCompletion]);

  const cancelUninstalledPartsCompletion = useCallback(() => {
    setPendingUninstalledPartsCompletion(null);
  }, []);

  // Time completion modal handlers
  const confirmTimeCompletion = useCallback(async (actualHours) => {
    if (!pendingTimeCompletion) return;
    const { task } = pendingTimeCompletion;
    setPendingTimeCompletion(null);
    await executeCompletion(task, actualHours);
  }, [pendingTimeCompletion, executeCompletion]);

  const cancelTimeCompletion = useCallback(() => {
    setPendingTimeCompletion(null);
  }, []);

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

    // Checklist Completion Confirmation State
    pendingChecklistCompletion,
    confirmChecklistCompletion,
    cancelChecklistCompletion,

    // Uninstalled Parts Warning State
    pendingUninstalledPartsCompletion,
    confirmUninstalledPartsCompletion,
    cancelUninstalledPartsCompletion,

    // Time Completion Modal State
    pendingTimeCompletion,
    confirmTimeCompletion,
    cancelTimeCompletion,

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