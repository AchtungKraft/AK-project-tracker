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
 * Canonical sort for ALL task lists across the app.
 * 
 * Order:
 * 1. Urgent priority tasks (due ≤ 14 days) — by due_date ASC
 * 2. All other tasks — by due_date ASC
 * 3. Within same urgency tier and due_date: priority flag wins
 * 4. Tie-breaker: priority_set_at ASC
 * 5. Tasks with no due_date sort last
 */
export function sortTasksByPriority(tasks) {
  return [...tasks].sort((a, b) => {
    const aUrgent = isUrgentPriority(a);
    const bUrgent = isUrgentPriority(b);

    // 1. Urgent priority first
    if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;

    // 2. Due date ascending (no date = last)
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;

    // 3. Priority flag tiebreaker
    if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;

    // 4. priority_set_at tiebreaker
    const aSet = a.priority_set_at ? new Date(a.priority_set_at).getTime() : Infinity;
    const bSet = b.priority_set_at ? new Date(b.priority_set_at).getTime() : Infinity;
    return aSet - bSet;
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