import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
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
  ['allTasks'],
  ['task'], // Individual task queries
];

/**
 * Canonical query key helpers — every component must use these
 * to avoid key mismatches between views.
 */
export const executionKeys = {
  projectTasks: (pid) => ['projectTasks', pid],
  projectBuckets: (pid) => ['projectBuckets', pid],
  projectChecklists: (pid) => ['projectChecklistItems', pid],
  projectWorkflow: (pid) => ['projectWorkflow', pid],
  allTasks: () => ['allTasks'],
  allPhases: () => ['allPhases'],
  allChecklists: () => ['workloadChecklists'],
};

/**
 * Invalidate all task-related caches for a specific project.
 * Call this after any task/phase/checklist mutation.
 */
export function invalidateProjectCaches(queryClient, projectId) {
  // Task caches
  TASK_CACHE_KEYS.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
  queryClient.invalidateQueries({ queryKey: ['myTasks'] });
  
  // Project-scoped caches
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: executionKeys.projectTasks(projectId) });
    queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    queryClient.invalidateQueries({ queryKey: executionKeys.projectBuckets(projectId) });
    queryClient.invalidateQueries({ queryKey: ['kanbanBuckets', projectId] });
    queryClient.invalidateQueries({ queryKey: executionKeys.projectChecklists(projectId) });
    queryClient.invalidateQueries({ queryKey: executionKeys.projectWorkflow(projectId) });
    queryClient.invalidateQueries({ queryKey: ['projectTaskComments', projectId] });
    // Time entry caches — canonical labor data
    queryClient.invalidateQueries({ queryKey: ['projectTimeEntries', projectId] });
  }
  
  // Global caches used by Global Workload
  queryClient.invalidateQueries({ queryKey: executionKeys.allChecklists() });
  queryClient.invalidateQueries({ queryKey: executionKeys.allPhases() });
  // Time entry caches
  queryClient.invalidateQueries({ queryKey: ['taskTimeEntries'] });
  queryClient.invalidateQueries({ queryKey: ['projectTimeEntries'] });
}

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
  
  // Double-completion guard
  const [isCompletingTask, setIsCompletingTask] = useState(false);

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
    queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    queryClient.invalidateQueries({ queryKey: ['projectWorkflow'] });
    queryClient.invalidateQueries({ queryKey: ['projectChecklistItems'] });
    queryClient.invalidateQueries({ queryKey: ['workloadChecklists'] });
    queryClient.invalidateQueries({ queryKey: ['projectBuckets'] });
    queryClient.invalidateQueries({ queryKey: ['kanbanBuckets'] });
    queryClient.invalidateQueries({ queryKey: ['taskTimeEntries'] });
    queryClient.invalidateQueries({ queryKey: ['projectTimeEntries'] });
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
      toast({ title: 'Failed to update task', variant: 'destructive' });
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
      toast({ title: 'Task deleted' });
      closeTaskDrawer();
    },
    onError: () => {
      toast({ title: 'Failed to delete task', variant: 'destructive' });
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
      toast({ title: 'Priority removed' });
    } else {
      toast({ title: 'Marked as priority' });
    }

    return { success: true };
  }, [updateTask]);

  const confirmRemovePriority = useCallback(async () => {
    if (!pendingPriorityRemoval) return;
    
    const task = pendingPriorityRemoval;
    setPendingPriorityRemoval(null);
    
    await updateTask(task.id, { is_priority: false });
    console.log('PRIORITY REMOVED CONFIRMED', task.name);
    toast({ title: 'Priority removed' });
  }, [pendingPriorityRemoval, updateTask]);

  const cancelPriorityRemoval = useCallback(() => {
    setPendingPriorityRemoval(null);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API - Status Toggle
  // ═══════════════════════════════════════════════════════════════

  const [pendingTimeCompletion, setPendingTimeCompletion] = useState(null);

  const executeCompletion = useCallback(async (task, payload = {}) => {
    if (!completedStatus) return;
    const { additionalHours = null, note = null, performedByUserId = null } = payload;

    setIsCompletingTask(true);
    try {
      // Create a completion time entry if additional hours provided
      if (additionalHours != null && additionalHours > 0) {
        // Resolve performer name from ID
        let performerName = 'Unknown';
        let performerId = performedByUserId;
        if (performerId) {
          const members = queryClient.getQueryData(['teamMembers']) || [];
          const member = members.find(m => m.id === performerId);
          if (member) performerName = member.full_name;
        }
        if (!performerId) {
          // Fallback: use current user
          try {
            const me = await base44.auth.me();
            const members = await base44.entities.TeamMember.filter({ user_id: me.id });
            if (members[0]) {
              performerId = members[0].id;
              performerName = members[0].full_name;
            }
          } catch {}
        }

        const today = new Date();
        const workDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        await base44.entities.TaskTimeEntry.create({
          task_id: task.id,
          project_id: task.project_id,
          hours: additionalHours,
          work_date: workDate,
          note: note || 'Task completion',
          team_member_id: performerId,
          performed_by_name: performerName,
          entry_source: 'TASK_COMPLETION',
        });
      }

      // Mark task complete (keep actual_hours in sync for legacy)
      const allEntries = await base44.entities.TaskTimeEntry.filter({ task_id: task.id });
      const totalLogged = allEntries.reduce((s, e) => s + (Number(e.hours) || 0), 0);

      const updates = {
        status_id: completedStatus.id,
        completed_date: new Date().toISOString(),
        actual_hours: Math.round(totalLogged * 100) / 100,
      };
      await updateTask(task.id, updates);
      
      // Invalidate time entries
      queryClient.invalidateQueries({ queryKey: ['taskTimeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['projectTimeEntries'] });
      
      toast({ title: 'Task completed' });
    } finally {
      setIsCompletingTask(false);
    }
  }, [completedStatus, updateTask, queryClient]);

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

  /**
   * beginTaskCompletion — CANONICAL entry point for ALL task completions.
   * 
   * EVERY surface that completes a task MUST call this function.
   * Flow: Checklist check → Uninstalled parts check → Time entry modal → Final mutation
   * 
   * For reopening completed tasks, call toggleComplete instead.
   */
  const beginTaskCompletion = useCallback(async (task) => {
    // Guard against double-completion
    if (isCompletingTask) return;
    if (!completedStatus) {
      toast({ title: 'No completed status found', variant: 'destructive' });
      return;
    }
    // Already complete? Ignore — use toggleComplete for reopen
    if (task.status_id === completedStatus.id) return;

    // Step 1: Check for incomplete checklist items
    const checklistItems = await base44.entities.TaskChecklistItem.filter({ task_id: task.id });
    const incompleteCount = checklistItems.filter(i => !i.is_complete).length;
    if (incompleteCount > 0) {
      setPendingChecklistCompletion({ task, incompleteCount });
      return;
    }
    // Step 2: Proceed to uninstalled parts check → time modal
    await proceedToUninstalledCheck(task);
  }, [isCompletingTask, completedStatus, proceedToUninstalledCheck]);

  const toggleComplete = useCallback(async (task, skipChecklistCheck = false) => {
    const isCurrentlyComplete = task.status_id === completedStatus?.id;

    if (isCurrentlyComplete) {
      // REOPEN — preserves actual_hours/completed_date history per contract
      const firstStatus = taskStatuses.find(s => s.id !== completedStatus?.id);
      if (firstStatus) {
        await updateTask(task.id, {
          status_id: firstStatus.id,
          completed_date: null,
        });
        toast({ title: 'Task reopened' });
      }
    } else {
      // Delegate to canonical completion flow
      await beginTaskCompletion(task);
    }
  }, [completedStatus, taskStatuses, updateTask, beginTaskCompletion]);

  // Helper for status-change interception: is this a "completed" status?
  const isCompletedStatusId = useCallback((statusId) => {
    if (!completedStatus) return false;
    return statusId === completedStatus.id;
  }, [completedStatus]);

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

  // Time completion modal handlers — accepts structured payload from TaskCompletionModal
  const confirmTimeCompletion = useCallback(async (payload) => {
    if (!pendingTimeCompletion) return;
    const { task } = pendingTimeCompletion;
    setPendingTimeCompletion(null);
    await executeCompletion(task, payload);
  }, [pendingTimeCompletion, executeCompletion]);

  const cancelTimeCompletion = useCallback(() => {
    setPendingTimeCompletion(null);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API - Date Updates
  // ═══════════════════════════════════════════════════════════════

  const updateDueDate = useCallback(async (task, date) => {
    await updateTask(task.id, { due_date: date });
    toast({ title: date ? 'Due date updated' : 'Due date cleared' });
  }, [updateTask]);

  const updateStartDate = useCallback(async (task, date) => {
    await updateTask(task.id, { start_date: date });
    toast({ title: date ? 'Start date updated' : 'Start date cleared' });
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
    beginTaskCompletion,
    toggleComplete,
    togglePriority,
    updateDueDate,
    updateStartDate,
    isCompletedStatusId,

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
    isCompletingTask,
  };
}

export default useTaskInteraction;