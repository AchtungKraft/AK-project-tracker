/**
 * CANONICAL TASK NORMALIZER
 * 
 * Single source of truth for task shape normalization.
 * Apply after fetch, after optimistic patch, before cache write.
 */

/**
 * Normalizes a task to canonical shape
 * @param {Object} task - Raw task data
 * @returns {Object} Normalized task
 */
export function normalizeTask(task) {
  if (!task) return null;
  
  return {
    ...task,
    // Canonical display date: start_date takes precedence, then due_date
    displayDate: task.start_date ?? task.due_date ?? null,
    // Ensure boolean priority
    is_priority: Boolean(task.is_priority),
    // Ensure dates are strings or null (not undefined)
    start_date: task.start_date || null,
    due_date: task.due_date || null,
    completed_date: task.completed_date || null,
    // Ensure arrays exist
    dependencies: task.dependencies || [],
  };
}

/**
 * Normalizes an array of tasks
 * @param {Array} tasks - Raw tasks array
 * @returns {Array} Normalized tasks
 */
export function normalizeTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.map(normalizeTask).filter(Boolean);
}

/**
 * Checks if a task has a valid calendar date
 * Tasks without start_date AND due_date should be excluded from calendar
 * @param {Object} task - Normalized task
 * @returns {boolean}
 */
export function hasCalendarDate(task) {
  return !!(task?.start_date || task?.due_date);
}

/**
 * Gets the effective date for calendar positioning
 * @param {Object} task - Task object
 * @returns {string|null} Date string or null
 */
export function getTaskCalendarDate(task) {
  return task?.start_date ?? task?.due_date ?? null;
}