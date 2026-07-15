import { useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { TASK_CACHE_KEYS, invalidateProjectCaches } from "./useTaskInteraction";
import { normalizeTask, normalizeTasks } from "./normalizeTask";
import { 
  incrementTaskVersion, 
  emitTaskStateUpdated, 
  setMutationTimestamp, 
  shouldApplyMutation,
  getTaskVersion
} from "./taskStateEvents";

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
  const taskVersionRef = useRef(getTaskVersion());

  // Fetch tasks based on scope - normalize after fetch
  // Use canonical key ['projectTasks', pid] for project scope to match ProjectDetail
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: scope === 'project' ? ['projectTasks', projectId] : ['allTasks'],
    queryFn: async () => {
      let rawTasks;
      if (scope === 'project' && projectId) {
        rawTasks = await base44.entities.Task.filter({ project_id: projectId });
      } else {
        rawTasks = await base44.entities.Task.list();
      }
      return normalizeTasks(rawTasks);
    },
    enabled: scope === 'all' || !!projectId,
  });

  // Priority tasks are derived client-side from the main task list — no separate query

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

  // Filter tasks based on options — priority tasks derived client-side
  const filteredTasks = useMemo(() => {
    let result = tasks;
    
    // Filter by project if scope is project
    if (scope === 'project' && projectId) {
      result = result.filter(t => t.project_id === projectId);
    }

    // priorityOnly no longer filters — priority affects sort order, not inclusion
    return result;
  }, [tasks, scope, projectId]);

  // Active (non-completed) tasks
  const activeTasks = useMemo(() => {
    return filteredTasks.filter(t => t.status_id !== completedStatus?.id);
  }, [filteredTasks, completedStatus]);

  // Update task mutation - optimistic updates + invalidate ALL task-related queries
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data, mutationTimestamp }) => base44.entities.Task.update(id, data),
    onMutate: async ({ id, data, mutationTimestamp }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['allTasks'] });
      if (projectId) {
        await queryClient.cancelQueries({ queryKey: ['projectTasks', projectId] });
      }

      // Mutation version guard - prevent stale overwrites
      if (!shouldApplyMutation(id, mutationTimestamp)) {
        console.warn(`[MUTATION GUARD] Stale mutation blocked for task ${id}`);
        return { blocked: true };
      }
      
      // Record mutation timestamp
      setMutationTimestamp(id, mutationTimestamp);

      // Snapshot previous values
      const previousAllTasks = queryClient.getQueryData(['allTasks']);
      const previousProjectTasks = projectId ? queryClient.getQueryData(['projectTasks', projectId]) : null;

      // Optimistically update all caches with normalization
      const updateCache = (old) => {
        if (!old) return old;
        return old.map(t => t.id === id ? normalizeTask({ ...t, ...data }) : t);
      };

      queryClient.setQueryData(['allTasks'], updateCache);
      if (projectId) {
        queryClient.setQueryData(['projectTasks', projectId], updateCache);
      }

      return { previousAllTasks, previousProjectTasks };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousAllTasks) {
        queryClient.setQueryData(['allTasks'], context.previousAllTasks);
      }
      if (context?.previousProjectTasks && projectId) {
        queryClient.setQueryData(['projectTasks', projectId], context.previousProjectTasks);
      }
      toast({ title: 'Failed to update task', variant: 'destructive' });
    },
    onSuccess: (updatedTask, variables) => {
      // Increment version on successful mutation
      taskVersionRef.current = incrementTaskVersion();
      
      // Emit global state updated event for all subscribed components
      emitTaskStateUpdated({
        taskId: variables.id,
        updates: variables.data,
        source: 'useTaskData',
      });
      
      // Use canonical invalidation — covers both Project and Global Workload
      invalidateProjectCaches(queryClient, projectId);
      
      // Also invalidate for the task's own project if different from the hook's scope
      const taskProjectId = variables?.data?.project_id || updatedTask?.project_id;
      if (taskProjectId && taskProjectId !== projectId) {
        invalidateProjectCaches(queryClient, taskProjectId);
      }
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // COMPLETION ORCHESTRATION STATE
  // Checklist enforcement + Uninstalled parts warning
  // ═══════════════════════════════════════════════════════════════
  const [pendingChecklistCompletion, setPendingChecklistCompletion] = useState(null);
  const [pendingUninstalledPartsCompletion, setPendingUninstalledPartsCompletion] = useState(null);
  const [pendingTimeCompletion, setPendingTimeCompletion] = useState(null);

  const executeCompletion = useCallback(async (task, actualHours = null) => {
    if (completedStatus) {
      const mutationTimestamp = Date.now();
      const updates = {
        status_id: completedStatus.id,
        completed_date: new Date().toISOString(),
      };
      if (actualHours != null) {
        updates.actual_hours = actualHours;
      }
      await updateTaskMutation.mutateAsync({
        id: task.id,
        data: updates,
        mutationTimestamp,
      });
      toast({ title: 'Task completed' });
    }
  }, [completedStatus, updateTaskMutation]);

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
      return;
    }
    // Show time completion modal instead of immediate completion
    setPendingTimeCompletion({ task, incompleteChecklistCount: 0 });
  }, [countUninstalledCommitments]);

  const confirmChecklistCompletion = useCallback(async () => {
    if (!pendingChecklistCompletion) return;
    const { task } = pendingChecklistCompletion;
    setPendingChecklistCompletion(null);
    await proceedToUninstalledCheck(task);
  }, [pendingChecklistCompletion, proceedToUninstalledCheck]);

  const cancelChecklistCompletion = useCallback(() => {
    setPendingChecklistCompletion(null);
  }, []);

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

  // Handler functions
  const handleToggleComplete = useCallback(async (task) => {
    const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
    const isCurrentlyComplete = task.status_id === completedStatus?.id;
    
    if (isCurrentlyComplete) {
      const firstStatus = taskStatuses.find(s => s.id !== completedStatus?.id);
      if (firstStatus) {
        const mutationTimestamp = Date.now();
        await updateTaskMutation.mutateAsync({
          id: task.id,
          data: { status_id: firstStatus.id, completed_date: null },
          mutationTimestamp,
        });
        toast({ title: 'Task reopened' });
      }
    } else {
      // Step 1: Check for incomplete checklist items
      const checklistItems = await base44.entities.TaskChecklistItem.filter({ task_id: task.id });
      const incompleteCount = checklistItems.filter(i => !i.is_complete).length;
      if (incompleteCount > 0) {
        setPendingChecklistCompletion({ task, incompleteCount });
        return;
      }
      // Step 2: Check for uninstalled parts
      await proceedToUninstalledCheck(task);
    }
  }, [statuses, completedStatus, updateTaskMutation, proceedToUninstalledCheck]);

  const handleUpdateDueDate = async (task, dueDate) => {
    const mutationTimestamp = Date.now();
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { due_date: dueDate },
      mutationTimestamp
    });
    toast({ title: dueDate ? 'Due date updated' : 'Due date removed' });
  };

  const handleUpdateStartDate = async (task, startDate) => {
    const mutationTimestamp = Date.now();
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { start_date: startDate },
      mutationTimestamp
    });
    toast({ title: startDate ? 'Start date updated' : 'Start date removed' });
  };

  const handleTogglePriority = async (task, skipConfirm = false) => {
    // If removing priority and skipConfirm is false, return a flag to show confirmation
    if (task.is_priority && !skipConfirm) {
      return { needsConfirmation: true, task };
    }
    
    const mutationTimestamp = Date.now();
    const newIsPriority = !task.is_priority;
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: {
        is_priority: newIsPriority,
        priority_set_at: newIsPriority ? new Date().toISOString() : null,
      },
      mutationTimestamp
    });
    toast({ title: task.is_priority ? 'Removed from priority' : 'Marked as priority' });
    return { needsConfirmation: false };
  };

  // Direct priority update without confirmation (for use after confirm dialog)
  const handleConfirmRemovePriority = async (task) => {
    console.log("PRIORITY REMOVED CONFIRMED", task.name);
    const mutationTimestamp = Date.now();
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { is_priority: false, priority_set_at: null },
      mutationTimestamp
    });
    toast({ title: 'Removed from priority' });
  };

  // Generic task update function for external use
  const updateTask = async (taskId, data) => {
    const mutationTimestamp = Date.now();
    await updateTaskMutation.mutateAsync({ id: taskId, data, mutationTimestamp });
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
    isUpdating: updateTaskMutation.isPending,
    
    // Mutation
    updateTaskMutation,
    updateTask,
    
    // Handlers
    handleToggleComplete,
    handleUpdateDueDate,
    handleUpdateStartDate,
    handleTogglePriority,
    handleConfirmRemovePriority,

    // Completion orchestration state (for mounting confirmation modals)
    pendingChecklistCompletion,
    confirmChecklistCompletion,
    cancelChecklistCompletion,
    pendingUninstalledPartsCompletion,
    confirmUninstalledPartsCompletion,
    cancelUninstalledPartsCompletion,
    pendingTimeCompletion,
    confirmTimeCompletion,
    cancelTimeCompletion,
  };
}

export default useTaskData;