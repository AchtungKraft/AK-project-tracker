/**
 * Shared filter matching Priority Dashboard's `activePriorityTasks` logic.
 * Excludes tasks whose StatusList label contains any terminal keyword.
 *
 * @param {Array} tasks - Raw tasks (already filtered by is_priority if needed)
 * @param {Array} statuses - Full StatusList records
 * @returns {Array} Active (non-completed) tasks
 */
const TERMINAL_KEYWORDS = ["complete", "done", "closed", "archived", "cancelled"];

export function filterActiveTasks(tasks, statuses) {
  const taskStatuses = statuses.filter(s => s.scope === "Task" && s.active);
  const terminalIds = new Set(
    taskStatuses
      .filter(s => {
        const label = s.label.toLowerCase();
        return TERMINAL_KEYWORDS.some(kw => label.includes(kw));
      })
      .map(s => s.id)
  );

  if (terminalIds.size === 0) return tasks;
  return tasks.filter(t => !terminalIds.has(t.status_id));
}