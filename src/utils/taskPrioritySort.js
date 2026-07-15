/**
 * Global task priority sorting utilities.
 * 
 * RULES:
 * - "Urgent priority" = is_priority + due_date within 14 days (or overdue)
 * - Overdue tasks are ALWAYS urgent
 * - Tasks with no due_date are NEVER urgent
 * - Sort: urgent first (by due_date ASC), then all others (by due_date ASC), no-date last
 */

const URGENT_WINDOW_DAYS = 14;

/**
 * Returns true if a task is "urgent priority" — priority + due within 14 days or overdue.
 */
export function isUrgentPriority(task) {
  if (!task.is_priority || !task.due_date) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(task.due_date);
  const diffDays = (due - now) / (1000 * 60 * 60 * 24);
  return diffDays <= URGENT_WINDOW_DAYS;
}

/**
 * Returns true if a task is priority but NOT urgent (due > 14 days from now).
 */
export function isFuturePriority(task) {
  return task.is_priority && !isUrgentPriority(task);
}

/**
 * Canonical sort for ALL open task lists across the app.
 *
 * Order:
 * 1. Priority tasks first (is_priority DESC)
 * 2. Due Date ASC within each priority tier (nulls last)
 * 3. Deterministic tie-breaker: task name ASC, then created_date ASC
 *
 * This means:
 *   Priority · Due Jul 10 (overdue)
 *   Priority · Due Jul 17
 *   Priority · No Due Date
 *   Non-Priority · Due Jul 11 (overdue)
 *   Non-Priority · Due Jul 18
 *   Non-Priority · No Due Date
 */
export function sortTasksByPriority(tasks) {
  return [...tasks].sort((a, b) => {
    // 1. Priority first
    if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;

    // 2. Due date ascending, nulls last within same priority tier
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;

    // 3. Deterministic tie-breaker: name then created_date
    const nameCompare = (a.name || "").localeCompare(b.name || "");
    if (nameCompare !== 0) return nameCompare;

    const aCreated = a.created_date ? new Date(a.created_date).getTime() : Infinity;
    const bCreated = b.created_date ? new Date(b.created_date).getTime() : Infinity;
    return aCreated - bCreated;
  });
}

/**
 * Split tasks into urgent and non-urgent groups, each sorted.
 */
export function splitUrgentAndUpcoming(tasks) {
  const urgent = [];
  const upcoming = [];
  tasks.forEach(t => {
    if (isUrgentPriority(t)) {
      urgent.push(t);
    } else {
      upcoming.push(t);
    }
  });
  return {
    urgent: sortTasksByPriority(urgent),
    upcoming: sortTasksByPriority(upcoming),
  };
}