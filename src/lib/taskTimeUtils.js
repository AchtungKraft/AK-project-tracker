/**
 * Task Time Entry Utilities — SINGLE SOURCE OF TRUTH
 *
 * All task logged-hours calculations in the app must use these helpers.
 * No component should independently sum hours or read legacy fields.
 *
 * Data flow:
 *   task + timeEntries → buildTaskTimeSummary() → { loggedHours, varianceHours, ... }
 *   tasks + allTimeEntries → buildProjectLaborSummary() → project-level totals
 */

import { formatDuration } from "./estimateUtils";

// ─── Core Task Time Summary ───────────────────────────────────

/**
 * Build the canonical time summary for a single task.
 *
 * @param {Object} task - The task entity
 * @param {Array} timeEntries - TaskTimeEntry records for this task
 * @returns {TaskTimeSummary}
 */
export function buildTaskTimeSummary(task, timeEntries = []) {
  const entries = timeEntries.filter(e => e.task_id === task.id);
  const loggedHours = roundHours(entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0));
  const estimatedHours = Number(task.estimated_hours) || 0;
  const hasEstimate = estimatedHours > 0;

  return {
    estimatedHours: hasEstimate ? estimatedHours : null,
    loggedHours,
    varianceHours: hasEstimate ? roundHours(loggedHours - estimatedHours) : null,
    remainingHours: hasEstimate ? roundHours(Math.max(estimatedHours - loggedHours, 0)) : null,
    isOverEstimate: hasEstimate && loggedHours > estimatedHours,
    percentOfEstimateUsed: hasEstimate ? roundHours((loggedHours / estimatedHours) * 100) : null,
    entryCount: entries.length,
    latestEntryDate: entries.length > 0
      ? entries.reduce((latest, e) => (e.work_date > latest ? e.work_date : latest), entries[0].work_date)
      : null,
    timeEntries: entries,
  };
}

/**
 * Get canonical actual hours for a task.
 * Uses time entries as source of truth, falls back to legacy field.
 *
 * @param {Object} task
 * @param {Array} timeEntries - all time entries (will be filtered to task)
 * @returns {number}
 */
export function getTaskLoggedHours(task, timeEntries = []) {
  const entries = timeEntries.filter(e => e.task_id === task.id);
  if (entries.length > 0) {
    return roundHours(entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0));
  }
  // Fallback to legacy field for un-migrated tasks
  return Number(task.actual_hours) || 0;
}

/**
 * Build checklist-level hours attribution from time entries.
 *
 * @param {Array} timeEntries - entries for a single task
 * @returns {Object<string, number>} Map of checklist_item_id → total hours
 */
export function buildChecklistHoursMap(timeEntries) {
  const map = {};
  for (const entry of timeEntries) {
    if (entry.checklist_item_id) {
      map[entry.checklist_item_id] = (map[entry.checklist_item_id] || 0) + (Number(entry.hours) || 0);
    }
  }
  // Round each value
  for (const key of Object.keys(map)) {
    map[key] = roundHours(map[key]);
  }
  return map;
}

// ─── Project-Level Labor Summary ──────────────────────────────

/**
 * Build project labor summary from tasks and their time entries.
 *
 * @param {Object} project
 * @param {Array} tasks - project tasks
 * @param {Array} timeEntries - all time entries for this project
 * @param {Object} [opts]
 * @param {Array} [opts.teamMembers] - for grouping by person
 * @param {Array} [opts.buckets] - for grouping by phase
 * @param {Array} [opts.categories] - for grouping by category
 * @returns {ProjectLaborSummary}
 */
export function buildProjectLaborSummary(project, tasks, timeEntries, opts = {}) {
  const { teamMembers = [], buckets = [], categories = [] } = opts;

  const projectEntries = timeEntries.filter(e => e.project_id === project.id);

  let totalEstimated = 0;
  let totalLogged = 0;
  let openTaskLogged = 0;
  let completedTaskLogged = 0;
  let unestimatedLogged = 0;
  let completedCount = 0;
  let openCount = 0;
  let missingEstimates = 0;
  let completedZeroHours = 0;

  const DONE_STATUS_ID = "6913f57422230d8c7ee2ef54";

  const byTeamMember = {};
  const byTask = {};
  const byBucket = {};
  const byCategory = {};
  const byDate = {};

  for (const task of tasks) {
    const taskEntries = projectEntries.filter(e => e.task_id === task.id);
    const logged = roundHours(taskEntries.reduce((s, e) => s + (Number(e.hours) || 0), 0));
    const est = Number(task.estimated_hours) || 0;
    const isComplete = task.status_id === DONE_STATUS_ID;

    totalEstimated += est;
    totalLogged += logged;

    if (isComplete) {
      completedCount++;
      completedTaskLogged += logged;
      if (logged === 0) completedZeroHours++;
    } else {
      openCount++;
      openTaskLogged += logged;
    }

    if (est === 0 && logged > 0) unestimatedLogged += logged;
    if (est === 0) missingEstimates++;

    // By task
    byTask[task.id] = {
      taskId: task.id,
      taskName: task.name,
      status: isComplete ? 'completed' : 'open',
      estimatedHours: est || null,
      loggedHours: logged,
      varianceHours: est > 0 ? roundHours(logged - est) : null,
      assigneeId: task.assigned_team_member_id,
      entryCount: taskEntries.length,
      latestWorkDate: taskEntries.length > 0
        ? taskEntries.reduce((l, e) => (e.work_date > l ? e.work_date : l), taskEntries[0].work_date)
        : null,
    };

    // By bucket
    const bucketId = task.kanban_bucket_id || '__unphased__';
    if (!byBucket[bucketId]) {
      const bucket = buckets.find(b => b.id === bucketId);
      byBucket[bucketId] = { bucketId, bucketName: bucket?.name || 'Unphased', estimated: 0, logged: 0 };
    }
    byBucket[bucketId].estimated += est;
    byBucket[bucketId].logged += logged;

    // By category
    const catId = task.category_id || '__uncategorized__';
    if (!byCategory[catId]) {
      const cat = categories.find(c => c.id === catId);
      byCategory[catId] = { categoryId: catId, categoryName: cat?.name || 'Uncategorized', estimated: 0, logged: 0 };
    }
    byCategory[catId].estimated += est;
    byCategory[catId].logged += logged;
  }

  // By team member (from entries, not tasks)
  for (const entry of projectEntries) {
    const mid = entry.team_member_id || '__unknown__';
    if (!byTeamMember[mid]) {
      const member = teamMembers.find(m => m.id === mid);
      byTeamMember[mid] = { memberId: mid, memberName: member?.full_name || entry.performed_by_name || 'Unknown', hours: 0, entryCount: 0 };
    }
    byTeamMember[mid].hours += Number(entry.hours) || 0;
    byTeamMember[mid].entryCount++;

    // By date
    const d = entry.work_date || 'unknown';
    byDate[d] = (byDate[d] || 0) + (Number(entry.hours) || 0);
  }

  // Round aggregates
  for (const k of Object.keys(byTeamMember)) byTeamMember[k].hours = roundHours(byTeamMember[k].hours);
  for (const k of Object.keys(byBucket)) {
    byBucket[k].estimated = roundHours(byBucket[k].estimated);
    byBucket[k].logged = roundHours(byBucket[k].logged);
  }
  for (const k of Object.keys(byCategory)) {
    byCategory[k].estimated = roundHours(byCategory[k].estimated);
    byCategory[k].logged = roundHours(byCategory[k].logged);
  }
  for (const k of Object.keys(byDate)) byDate[k] = roundHours(byDate[k]);

  return {
    totalEstimated: roundHours(totalEstimated),
    totalLogged: roundHours(totalLogged),
    totalVariance: roundHours(totalLogged - totalEstimated),
    openTaskLogged: roundHours(openTaskLogged),
    completedTaskLogged: roundHours(completedTaskLogged),
    unestimatedLogged: roundHours(unestimatedLogged),
    completedCount,
    openCount,
    missingEstimates,
    completedZeroHours,
    byTeamMember,
    byTask,
    byBucket,
    byCategory,
    byDate,
  };
}

// ─── Formatting ───────────────────────────────────────────────

/**
 * Format hours for compact task display: "6.25 / 8h" or "6.25h"
 */
export function formatLoggedVsEstimate(logged, estimated) {
  if (!logged && !estimated) return null;
  const logStr = formatDuration(logged) || '0h';
  if (estimated) {
    return `${logStr} / ${formatDuration(estimated)}`;
  }
  return logStr;
}

/**
 * Format variance for display: "+2h 15m over" or "-1h 30m under"
 */
export function formatVariance(variance) {
  if (variance == null) return null;
  if (variance === 0) return 'On target';
  const abs = Math.abs(variance);
  const formatted = formatDuration(abs);
  return variance > 0 ? `${formatted} over` : `${formatted} under`;
}

// ─── Utilities ────────────────────────────────────────────────

/** Round to 2 decimal places to avoid floating-point drift */
function roundHours(n) {
  return Math.round(n * 100) / 100;
}

/** Validate hours input. Returns error string or null. */
export function validateTimeEntryHours(value) {
  if (value == null || value === '') return 'Hours are required';
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return 'Must be a valid number';
  if (num <= 0) return 'Hours must be greater than zero';
  if (num > 24) return 'Maximum 24 hours per entry';
  return null;
}

// Re-export formatDuration for convenience
export { formatDuration } from "./estimateUtils";