/**
 * taskCompletion.js — CANONICAL shared handler for task completion persistence.
 *
 * RULE: Both useTaskInteraction and useTaskData MUST delegate to this module.
 *       No other file may independently create TASK_COMPLETION time entries.
 *
 * Execution: Delegates to the `completeTaskWithTimeEntry` BACKEND FUNCTION
 * for server-side enforcement of:
 *   - Authentication
 *   - Server-derived project_id (cannot be forged)
 *   - Performer permission (non-admins locked to self)
 *   - Checklist ownership validation
 *   - Input validation (hours, note, date)
 *   - Atomic entry creation + task completion
 *   - Rollback on partial failure
 *
 * Callers:
 *   - useTaskInteraction.executeCompletion
 *   - useTaskData.executeCompletion
 */

import { base44 } from "@/api/base44Client";
import { toDateString } from "@/lib/dateUtils";

/**
 * Get today's date as "YYYY-MM-DD" using local timezone (no UTC shift).
 */
export function todayLocalDateString() {
  return toDateString(new Date());
}

/**
 * executeTaskCompletion — THE canonical completion persistence function.
 *
 * Calls the `completeTaskWithTimeEntry` backend function for server-side
 * validation and persistence. The frontend only submits the payload.
 *
 * @param {Object} payload - { additionalHours, note, workDate, performedByUserId, checklistItemId }
 * @param {Object} ctx     - { task, completedStatusId, updateTaskFn, queryClient, teamMembers, currentUser }
 * @returns {Promise<{ success: boolean, entryId?: string, error?: string }>}
 */
export async function executeTaskCompletion(payload, ctx) {
  const { task, queryClient } = ctx;
  const {
    additionalHours: rawHours,
    note,
    workDate,
    performedByUserId,
    checklistItemId,
  } = payload;

  try {
    const response = await base44.functions.invoke('completeTaskWithTimeEntry', {
      taskId: task.id,
      additionalHours: Number(rawHours) || 0,
      note: (note || '').trim() || null,
      workDate: workDate || todayLocalDateString(),
      performedByUserId: performedByUserId || null,
      checklistItemId: checklistItemId || null,
    });

    const result = response.data;

    if (!result.success) {
      return { success: false, error: result.error || 'Completion failed.' };
    }

    // Invalidate caches after successful server-side completion
    invalidateCompletionCaches(queryClient, task);

    return { success: true, entryId: result.entryId };
  } catch (err) {
    // Backend returned an error status
    const errorData = err?.response?.data;
    const errorMsg = errorData?.error || err?.message || 'Completion failed unexpectedly.';
    return { success: false, error: errorMsg };
  }
}

/**
 * Invalidate all caches that should refresh after a task completion.
 */
export function invalidateCompletionCaches(queryClient, task) {
  // Time entry caches
  queryClient.invalidateQueries({ queryKey: ["taskTimeEntries"] });
  queryClient.invalidateQueries({ queryKey: ["taskTimeEntries", task.id] });
  queryClient.invalidateQueries({ queryKey: ["projectTimeEntries"] });
  if (task.project_id) {
    queryClient.invalidateQueries({ queryKey: ["projectTimeEntries", task.project_id] });
  }
  // Task caches — force refetch so the task disappears from lists
  queryClient.invalidateQueries({ queryKey: ["projectTasks"] });
  queryClient.invalidateQueries({ queryKey: ["allTasks"] });
  queryClient.invalidateQueries({ queryKey: ["tasks"] });
  // Workload / person report caches
  queryClient.invalidateQueries({ queryKey: ["taskTimeEntriesByIds"] });
  queryClient.invalidateQueries({ queryKey: ["personReport"] });
  queryClient.invalidateQueries({ queryKey: ["projectWorkflow"] });
  // Comments (for zero-hour notes saved as comments)
  queryClient.invalidateQueries({ queryKey: ["taskComments"] });
}