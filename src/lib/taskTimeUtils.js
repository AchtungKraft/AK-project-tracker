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

  let totalEstimatedHours = 0;
  let totalLoggedHours = 0;
  let estimatedTaskLoggedHours = 0;
  let unestimatedTaskLoggedHours = 0;
  let openTaskLoggedHours = 0;
  let completedTaskLoggedHours = 0;
  let completedCount = 0;
  let openCount = 0;
  let estimatedTaskCount = 0;
  let unestimatedTaskCount = 0;
  let tasksWithLoggedHours = 0;
  let estimatedTasksWithLoggedHours = 0;
  let unestimatedTasksWithLoggedHours = 0;
  let completedZeroHours = 0;
  let tasksOverEstimate = 0;

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
    const hasEstimate = est > 0;
    const isComplete = task.status_id === DONE_STATUS_ID;

    totalLoggedHours += logged;

    if (hasEstimate) {
      totalEstimatedHours += est;
      estimatedTaskCount++;
      estimatedTaskLoggedHours += logged;
      if (logged > est) tasksOverEstimate++;
      if (logged > 0) estimatedTasksWithLoggedHours++;
    } else {
      unestimatedTaskCount++;
      unestimatedTaskLoggedHours += logged;
      if (logged > 0) unestimatedTasksWithLoggedHours++;
    }

    if (logged > 0) tasksWithLoggedHours++;

    if (isComplete) {
      completedCount++;
      completedTaskLoggedHours += logged;
      if (logged === 0) completedZeroHours++;
    } else {
      openCount++;
      openTaskLoggedHours += logged;
    }

    // Estimate status for display
    let estimateStatus;
    if (!hasEstimate) {
      estimateStatus = 'missing_estimate';
    } else if (logged > est) {
      estimateStatus = 'over_estimate';
    } else if (logged < est) {
      estimateStatus = 'under_estimate';
    } else {
      estimateStatus = 'on_estimate';
    }

    // By task
    byTask[task.id] = {
      taskId: task.id,
      taskName: task.name,
      status: isComplete ? 'completed' : 'open',
      estimatedHours: est || null,
      loggedHours: logged,
      varianceHours: hasEstimate ? roundHours(logged - est) : null,
      estimateStatus,
      bucketId: task.kanban_bucket_id,
      assigneeId: task.assigned_team_member_id,
      entryCount: taskEntries.length,
      firstWorkDate: taskEntries.length > 0
        ? taskEntries.reduce((e, c) => (c.work_date < e ? c.work_date : e), taskEntries[0].work_date)
        : null,
      latestWorkDate: taskEntries.length > 0
        ? taskEntries.reduce((l, e) => (e.work_date > l ? e.work_date : l), taskEntries[0].work_date)
        : null,
    };

    // By bucket
    const bucketId = task.kanban_bucket_id || '__unphased__';
    if (!byBucket[bucketId]) {
      const bucket = buckets.find(b => b.id === bucketId);
      byBucket[bucketId] = { bucketId, bucketName: bucket?.name || 'Unphased', estimated: 0, logged: 0, unestimatedLogged: 0, missingEstimates: 0, tasksOverEstimate: 0 };
    }
    byBucket[bucketId].estimated += est;
    byBucket[bucketId].logged += logged;
    if (!hasEstimate) {
      byBucket[bucketId].unestimatedLogged += logged;
      byBucket[bucketId].missingEstimates++;
    } else if (logged > est) {
      byBucket[bucketId].tasksOverEstimate++;
    }

    // By category
    const catId = task.category_id || '__uncategorized__';
    if (!byCategory[catId]) {
      const cat = categories.find(c => c.id === catId);
      byCategory[catId] = { categoryId: catId, categoryName: cat?.name || 'Uncategorized', estimated: 0, logged: 0 };
    }
    byCategory[catId].estimated += est;
    byCategory[catId].logged += logged;
  }

  // Build team member with estimated/unestimated split from entries
  // First, build a set of estimated task IDs for quick lookup
  const estimatedTaskIds = new Set();
  for (const task of tasks) {
    if ((Number(task.estimated_hours) || 0) > 0) estimatedTaskIds.add(task.id);
  }

  for (const entry of projectEntries) {
    const mid = entry.team_member_id || '__unknown__';
    if (!byTeamMember[mid]) {
      const member = teamMembers.find(m => m.id === mid);
      byTeamMember[mid] = {
        memberId: mid,
        memberName: member?.full_name || entry.performed_by_name || 'Unknown',
        hours: 0,
        estimatedTaskHours: 0,
        unestimatedTaskHours: 0,
        entryCount: 0,
      };
    }
    const hrs = Number(entry.hours) || 0;
    byTeamMember[mid].hours += hrs;
    byTeamMember[mid].entryCount++;
    if (estimatedTaskIds.has(entry.task_id)) {
      byTeamMember[mid].estimatedTaskHours += hrs;
    } else {
      byTeamMember[mid].unestimatedTaskHours += hrs;
    }

    // By date
    const d = entry.work_date || 'unknown';
    byDate[d] = (byDate[d] || 0) + hrs;
  }

  // Round aggregates
  for (const k of Object.keys(byTeamMember)) {
    byTeamMember[k].hours = roundHours(byTeamMember[k].hours);
    byTeamMember[k].estimatedTaskHours = roundHours(byTeamMember[k].estimatedTaskHours);
    byTeamMember[k].unestimatedTaskHours = roundHours(byTeamMember[k].unestimatedTaskHours);
  }
  for (const k of Object.keys(byBucket)) {
    byBucket[k].estimated = roundHours(byBucket[k].estimated);
    byBucket[k].logged = roundHours(byBucket[k].logged);
    byBucket[k].unestimatedLogged = roundHours(byBucket[k].unestimatedLogged);
  }
  for (const k of Object.keys(byCategory)) {
    byCategory[k].estimated = roundHours(byCategory[k].estimated);
    byCategory[k].logged = roundHours(byCategory[k].logged);
  }
  for (const k of Object.keys(byDate)) byDate[k] = roundHours(byDate[k]);

  // Canonical derived values
  const tEstimated = roundHours(totalEstimatedHours);
  const tLogged = roundHours(totalLoggedHours);
  const tEstimatedTaskLogged = roundHours(estimatedTaskLoggedHours);
  const tUnestimatedTaskLogged = roundHours(unestimatedTaskLoggedHours);
  const varianceOnEstimatedTasks = roundHours(tEstimatedTaskLogged - tEstimated);
  const remainingOnEstimatedTasks = roundHours(Math.max(tEstimated - tEstimatedTaskLogged, 0));

  return {
    // Primary totals
    totalEstimatedHours: tEstimated,
    totalLoggedHours: tLogged,
    estimatedTaskLoggedHours: tEstimatedTaskLogged,
    unestimatedTaskLoggedHours: tUnestimatedTaskLogged,
    varianceOnEstimatedTasks,
    remainingOnEstimatedTasks,

    // Task counts
    estimatedTaskCount,
    unestimatedTaskCount,
    tasksWithLoggedHours,
    estimatedTasksWithLoggedHours,
    unestimatedTasksWithLoggedHours,
    tasksOverEstimate,

    // Status breakdowns
    completedTaskLoggedHours: roundHours(completedTaskLoggedHours),
    openTaskLoggedHours: roundHours(openTaskLoggedHours),
    completedCount,
    openCount,
    completedZeroHours,

    // Backward-compatible aliases (DEPRECATED — use new names)
    totalEstimated: tEstimated,
    totalLogged: tLogged,
    totalVariance: varianceOnEstimatedTasks,
    missingEstimates: unestimatedTaskCount,
    unestimatedLogged: tUnestimatedTaskLogged,
    openTaskLogged: roundHours(openTaskLoggedHours),
    completedTaskLogged: roundHours(completedTaskLoggedHours),

    // Breakdowns
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

// ─── Batch Helpers ────────────────────────────────────────────

/**
 * Build a map of taskId → logged hours from a batch of time entries.
 * Used by parent components to avoid N+1 queries.
 *
 * @param {Array} timeEntries
 * @returns {Object<string, number>}
 */
export function buildLoggedHoursByTaskId(timeEntries) {
  const map = {};
  for (const e of timeEntries) {
    if (e.task_id) {
      map[e.task_id] = (map[e.task_id] || 0) + (Number(e.hours) || 0);
    }
  }
  for (const k of Object.keys(map)) map[k] = roundHours(map[k]);
  return map;
}

/**
 * Invalidate all TaskTimeEntry-related caches.
 * Call after add/edit/delete of time entries.
 *
 * @param {QueryClient} queryClient
 * @param {Object} [opts]
 * @param {string} [opts.taskId]
 * @param {string} [opts.projectId]
 */
export function invalidateTaskTimeCaches(queryClient, { taskId, projectId } = {}) {
  // Task-specific
  if (taskId) queryClient.invalidateQueries({ queryKey: ['taskTimeEntries', taskId] });
  // Project-specific
  if (projectId) queryClient.invalidateQueries({ queryKey: ['projectTimeEntries', projectId] });
  // Global
  queryClient.invalidateQueries({ queryKey: ['taskTimeEntries'] });
  queryClient.invalidateQueries({ queryKey: ['projectTimeEntries'] });
  queryClient.invalidateQueries({ queryKey: ['taskTimeEntriesByIds'] });
}

// ─── CSV Export ───────────────────────────────────────────────

const ENTRY_SOURCE_LABELS = {
  MANUAL: 'Manual',
  TASK_COMPLETION: 'Task Completion',
  LEGACY_MIGRATION: 'Migrated',
  ADMIN_ADJUSTMENT: 'Admin Adjustment',
};

/**
 * Escape a CSV cell value.
 * Quotes if contains commas/quotes/newlines, escapes internal quotes,
 * and prefixes formula-dangerous characters.
 */
function csvEscape(value) {
  if (value == null) return '';
  let s = String(value);
  // Formula injection prevention
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  // Quote if needed
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Generate a task summary CSV from project labor summary.
 *
 * @param {string} projectName
 * @param {Object} laborSummary - from buildProjectLaborSummary()
 * @param {Array} tasks
 * @param {Array} buckets
 * @param {Array} categories
 * @param {Array} teamMembers
 * @returns {string} CSV content
 */
export const ESTIMATE_STATUS_LABELS = {
  missing_estimate: 'Missing Estimate',
  over_estimate: 'Over Estimate',
  under_estimate: 'Under Estimate',
  on_estimate: 'On Estimate',
};

export function generateTaskSummaryCSV(projectName, laborSummary, tasks, { buckets = [], categories = [], teamMembers = [] } = {}) {
  const bucketMap = new Map(buckets.map(b => [b.id, b.name]));
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));
  const memberMap = new Map(teamMembers.map(m => [m.id, m.full_name]));

  const headers = ['Project', 'Task', 'Task Status', 'Assignee', 'Phase', 'Category', 'Estimated Hours', 'Logged Hours', 'Variance on Estimated Work', 'Estimate Status', 'Time Entry Count', 'First Work Date', 'Latest Work Date'];
  const rows = [headers.map(csvEscape).join(',')];

  const taskEntries = Object.values(laborSummary.byTask).sort((a, b) => (b.loggedHours || 0) - (a.loggedHours || 0));

  for (const t of taskEntries) {
    const task = tasks.find(tk => tk.id === t.taskId);
    const row = [
      projectName || '',
      t.taskName || '',
      t.status === 'completed' ? 'Completed' : 'Open',
      task ? (memberMap.get(task.assigned_team_member_id) || '') : '',
      task ? (bucketMap.get(task.kanban_bucket_id) || '') : '',
      task ? (categoryMap.get(task.category_id) || '') : '',
      t.estimatedHours || '',
      t.loggedHours || 0,
      t.varianceHours != null ? t.varianceHours : '',
      ESTIMATE_STATUS_LABELS[t.estimateStatus] || '',
      t.entryCount || 0,
      t.firstWorkDate || '',
      t.latestWorkDate || '',
    ];
    rows.push(row.map(csvEscape).join(','));
  }

  return rows.join('\n');
}

/**
 * Generate a detailed time-entry CSV.
 *
 * @param {string} projectName
 * @param {Array} timeEntries
 * @param {Array} tasks
 * @param {Array} buckets
 * @param {Array} categories
 * @param {Array} teamMembers
 * @param {Array} checklistItems
 * @returns {string} CSV content
 */
export function generateTimeEntryCSV(projectName, timeEntries, tasks, { buckets = [], categories = [], teamMembers = [], checklistItems = [], laborSummary = null } = {}) {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const bucketMap = new Map(buckets.map(b => [b.id, b.name]));
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));
  const memberMap = new Map(teamMembers.map(m => [m.id, m.full_name]));
  const checklistMap = new Map(checklistItems.map(ci => [ci.id, ci.title]));

  // Pre-build task summary lookup for estimate status
  const taskSummaryMap = laborSummary?.byTask || {};

  const headers = ['Project', 'Task', 'Task Status', 'Phase', 'Estimate Status', 'Checklist Item', 'Work Date', 'Team Member', 'Hours', 'Work Note', 'Entry Source', 'Task Estimated Hours', 'Task Total Logged Hours', 'Created Date', 'Updated Date'];
  const rows = [headers.map(csvEscape).join(',')];

  const sorted = [...timeEntries].sort((a, b) => (a.work_date || '').localeCompare(b.work_date || ''));

  for (const e of sorted) {
    const task = taskMap.get(e.task_id);
    const isComplete = task?.completed_date;
    const tSummary = taskSummaryMap[e.task_id];
    const row = [
      projectName || '',
      task?.name || '',
      isComplete ? 'Completed' : 'Open',
      task ? (bucketMap.get(task.kanban_bucket_id) || '') : '',
      tSummary ? (ESTIMATE_STATUS_LABELS[tSummary.estimateStatus] || '') : '',
      e.checklist_item_id ? (checklistMap.get(e.checklist_item_id) || 'Removed item') : '',
      e.work_date || '',
      memberMap.get(e.team_member_id) || e.performed_by_name || '',
      e.hours || 0,
      e.note || '',
      ENTRY_SOURCE_LABELS[e.entry_source] || e.entry_source || '',
      task?.estimated_hours || '',
      tSummary?.loggedHours || '',
      e.created_date ? new Date(e.created_date).toLocaleDateString() : '',
      e.updated_date ? new Date(e.updated_date).toLocaleDateString() : '',
    ];
    rows.push(row.map(csvEscape).join(','));
  }

  return rows.join('\n');
}

// Re-export formatDuration for convenience
export { formatDuration } from "./estimateUtils";