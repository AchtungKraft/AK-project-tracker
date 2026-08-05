/**
 * taskCompletion.js — CANONICAL shared handler for task completion persistence.
 *
 * RULE: Both useTaskInteraction and useTaskData MUST delegate to this module.
 *       No other file may independently create TASK_COMPLETION time entries.
 *
 * Responsibilities:
 *   1. Validation (hours, note, performer, checklist ownership)
 *   2. TaskTimeEntry creation (when hours > 0)
 *   3. Task status update (completed)
 *   4. Legacy actual_hours synchronization
 *   5. Rollback on partial failure
 *   6. Cache invalidation
 *
 * Callers:
 *   - useTaskInteraction.executeCompletion
 *   - useTaskData.executeCompletion
 */

import { base44 } from "@/api/base44Client";
import { toDateString } from "@/lib/dateUtils";

/**
 * @typedef {Object} CompletionPayload
 * @property {number|null}  additionalHours    - Hours to log (null or 0 = no entry)
 * @property {string|null}  note               - Work note (required when hours > 0)
 * @property {string}       workDate           - "YYYY-MM-DD" date work was performed
 * @property {string|null}  performedByUserId  - TeamMember.id who did the work
 * @property {string|null}  checklistItemId    - Optional TaskChecklistItem.id
 */

/**
 * @typedef {Object} CompletionContext
 * @property {Object}   task                - The task being completed
 * @property {string}   completedStatusId   - StatusList.id for the completed status
 * @property {Function} updateTaskFn        - async (taskId, data) => void
 * @property {Object}   queryClient         - TanStack queryClient for cache invalidation
 * @property {Array}    teamMembers         - Cached team members array
 * @property {Object}   currentUser         - { id, role } from base44.auth.me()
 */

/**
 * Resolve the performer name from a TeamMember ID.
 */
function resolvePerformerName(teamMembers, performerId) {
  const member = teamMembers.find(m => m.id === performerId);
  return member?.full_name || "Unknown";
}

/**
 * Get today's date as "YYYY-MM-DD" using local timezone (no UTC shift).
 */
export function todayLocalDateString() {
  return toDateString(new Date());
}

/**
 * Validate the completion payload. Returns { valid, error }.
 */
function validatePayload(payload, task, currentUser, teamMembers) {
  const { additionalHours, note, performedByUserId, checklistItemId } = payload;
  const hours = Number(additionalHours) || 0;

  if (hours > 0) {
    // Note required
    const trimmedNote = (note || "").trim();
    if (!trimmedNote) {
      return { valid: false, error: "A work note is required when logging hours." };
    }
    // Performer required
    if (!performedByUserId) {
      return { valid: false, error: "A performer is required when logging hours." };
    }
    // Performer permission: standard users (role !== 'admin') can only log for themselves
    if (currentUser.role !== "admin") {
      const myMember = teamMembers.find(m => m.user_id === currentUser.id);
      if (myMember && performedByUserId !== myMember.id) {
        return { valid: false, error: "You can only log time for yourself." };
      }
    }
  }

  // Checklist ownership: if provided, must belong to this task
  // (validated at creation time via the filter query in the modal)
  // No additional check needed here since the modal only shows task-scoped items.

  return { valid: true, error: null };
}

/**
 * executeTaskCompletion — THE canonical completion persistence function.
 *
 * @param {CompletionPayload} payload
 * @param {CompletionContext}  ctx
 * @returns {Promise<{ success: boolean, entryId?: string, error?: string }>}
 */
export async function executeTaskCompletion(payload, ctx) {
  const { task, completedStatusId, updateTaskFn, queryClient, teamMembers, currentUser } = ctx;
  const {
    additionalHours: rawHours,
    note,
    workDate,
    performedByUserId,
    checklistItemId,
  } = payload;

  const hours = Number(rawHours) || 0;

  // ── 1. VALIDATE ──
  const { valid, error } = validatePayload(payload, task, currentUser, teamMembers);
  if (!valid) {
    return { success: false, error };
  }

  let createdEntryId = null;

  // ── 2. CREATE TaskTimeEntry (when hours > 0) ──
  if (hours > 0) {
    const performerName = resolvePerformerName(teamMembers, performedByUserId);
    const trimmedNote = (note || "").trim();

    // Resolve checklist snapshot name
    let checklistSnapshot = null;
    if (checklistItemId) {
      try {
        const items = await base44.entities.TaskChecklistItem.filter({ task_id: task.id });
        const item = items.find(i => i.id === checklistItemId);
        if (item) {
          checklistSnapshot = item.title;
        } else {
          // Checklist item doesn't belong to this task — reject
          return { success: false, error: "Selected checklist item does not belong to this task." };
        }
      } catch {
        // Non-blocking: proceed without snapshot
      }
    }

    const entryPayload = {
      task_id: task.id,
      project_id: task.project_id,
      hours,
      work_date: workDate || todayLocalDateString(),
      note: trimmedNote,
      team_member_id: performedByUserId,
      performed_by_name: performerName,
      entry_source: "TASK_COMPLETION",
    };
    if (checklistItemId) {
      entryPayload.checklist_item_id = checklistItemId;
    }
    if (checklistSnapshot) {
      entryPayload.checklist_item_name_snapshot = checklistSnapshot;
    }

    try {
      const created = await base44.entities.TaskTimeEntry.create(entryPayload);
      createdEntryId = created?.id;
    } catch (err) {
      return { success: false, error: "Failed to create time entry. Task remains open." };
    }
  }

  // ── 3. RECALCULATE canonical actual_hours from ALL entries ──
  let totalLogged = 0;
  try {
    const allEntries = await base44.entities.TaskTimeEntry.filter({ task_id: task.id });
    totalLogged = allEntries.reduce((s, e) => s + (Number(e.hours) || 0), 0);
  } catch {
    // Fallback: use task's existing actual_hours + new hours
    totalLogged = (Number(task.actual_hours) || 0) + hours;
  }

  // ── 4. UPDATE task to completed ──
  try {
    await updateTaskFn(task.id, {
      status_id: completedStatusId,
      completed_date: new Date().toISOString(),
      actual_hours: Math.round(totalLogged * 100) / 100,
    });
  } catch (err) {
    // Task update failed AFTER entry creation — attempt rollback
    if (createdEntryId) {
      try {
        await base44.entities.TaskTimeEntry.delete(createdEntryId);
      } catch {
        // Rollback failed — report partial failure
        return {
          success: false,
          error: "Task update failed. A time entry was created but the task remains open. Please complete the task manually.",
          entryId: createdEntryId,
        };
      }
    }
    return { success: false, error: "Failed to complete task. No changes were saved." };
  }

  // ── 5. INVALIDATE caches ──
  invalidateCompletionCaches(queryClient, task);

  return { success: true, entryId: createdEntryId };
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
  // Workload / person report caches
  queryClient.invalidateQueries({ queryKey: ["taskTimeEntriesByIds"] });
  queryClient.invalidateQueries({ queryKey: ["personReport"] });
  queryClient.invalidateQueries({ queryKey: ["projectWorkflow"] });
}