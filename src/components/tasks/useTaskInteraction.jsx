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
  const [pendingPartInstallCompletion, setPendingPartInstallCompletion] = useState(null);

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

  const executeCompletion = useCallback(async (task) => {
    if (completedStatus) {
      await updateTask(task.id, {
        status_id: completedStatus.id,
        completed_date: new Date().toISOString(),
      });
      toast.success('Task completed');
    }
  }, [completedStatus, updateTask]);

  /**
   * Check for installable linked parts before completing.
   * Returns { hasInstallableParts, parts } if parts are found.
   */
  const checkLinkedParts = useCallback(async (task) => {
    const links = await base44.entities.TaskPartLink.filter({ task_id: task.id });
    if (links.length === 0) return { hasInstallableParts: false, parts: [] };

    // Fetch commitments and parts for these links
    const commitmentIds = [...new Set(links.map(l => l.commitment_id).filter(Boolean))];
    const partIds = [...new Set(links.map(l => l.part_id).filter(Boolean))];

    const [commitments, parts] = await Promise.all([
      commitmentIds.length > 0
        ? base44.entities.PartCommitment.filter({ id: commitmentIds })
        : Promise.resolve([]),
      partIds.length > 0
        ? base44.entities.Part.filter({ id: partIds })
        : Promise.resolve([]),
    ]);

    const commitmentMap = new Map(commitments.map(c => [c.id, c]));
    const partMap = new Map(parts.map(p => [p.id, p]));

    const resolved = links.map(link => {
      const part = partMap.get(link.part_id);
      const commitment = link.commitment_id ? commitmentMap.get(link.commitment_id) : null;
      const reserved = commitment?.reserved_from_stock ?? 0;
      const installed = commitment?.qty_installed ?? 0;
      const installable = Math.max(0, reserved - installed);

      return {
        linkId: link.id,
        partName: part?.part_name || 'Unknown Part',
        partNumber: part?.vendor_part_number || '',
        commitmentId: link.commitment_id,
        qtyAllocated: link.qty_allocated || 0,
        qtyInstalled: installed,
        installable,
      };
    }).filter(r => r.commitmentId); // only show parts with commitments

    const hasInstallableParts = resolved.some(r => r.installable > 0);
    return { hasInstallableParts, parts: resolved };
  }, []);

  const proceedToPartCheck = useCallback(async (task) => {
    // Check for linked parts that can be installed
    const { hasInstallableParts, parts } = await checkLinkedParts(task);
    if (parts.length > 0) {
      setPendingPartInstallCompletion({ task, parts });
      return { requiresConfirmation: true };
    }
    // No linked parts — complete immediately
    await executeCompletion(task);
  }, [checkLinkedParts, executeCompletion]);

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
      // Checklist passed — now check for installable parts
      await proceedToPartCheck(task);
    }
  }, [completedStatus, taskStatuses, updateTask, proceedToPartCheck]);

  const confirmChecklistCompletion = useCallback(async () => {
    if (!pendingChecklistCompletion) return;
    const { task } = pendingChecklistCompletion;
    setPendingChecklistCompletion(null);
    // After checklist confirm, proceed to part check
    await proceedToPartCheck(task);
  }, [pendingChecklistCompletion, proceedToPartCheck]);

  const cancelChecklistCompletion = useCallback(() => {
    setPendingChecklistCompletion(null);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API - Part Install on Completion
  // ═══════════════════════════════════════════════════════════════

  const confirmPartInstallAndComplete = useCallback(async (selectedCommitmentIds) => {
    if (!pendingPartInstallCompletion) return;
    const { task, parts } = pendingPartInstallCompletion;
    setPendingPartInstallCompletion(null);

    // Install selected parts via canonical supply dispatcher
    for (const commitmentId of selectedCommitmentIds) {
      const partInfo = parts.find(p => p.commitmentId === commitmentId);
      if (!partInfo || partInfo.installable <= 0) continue;

      await base44.functions.invoke('executeSupplyAction', {
        action_type: 'INSTALL',
        commitment_ids: [commitmentId],
        payload: {
          qty_to_install: partInfo.installable,
          notes: `Auto-installed on task completion: ${task.name}`,
        },
        dry_run: false,
      });
    }

    await executeCompletion(task);
  }, [pendingPartInstallCompletion, executeCompletion]);

  const skipPartInstallAndComplete = useCallback(async () => {
    if (!pendingPartInstallCompletion) return;
    const { task } = pendingPartInstallCompletion;
    setPendingPartInstallCompletion(null);
    await executeCompletion(task);
  }, [pendingPartInstallCompletion, executeCompletion]);

  const cancelPartInstallCompletion = useCallback(() => {
    setPendingPartInstallCompletion(null);
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

    // Part Install on Completion State
    pendingPartInstallCompletion,
    confirmPartInstallAndComplete,
    skipPartInstallAndComplete,
    cancelPartInstallCompletion,

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