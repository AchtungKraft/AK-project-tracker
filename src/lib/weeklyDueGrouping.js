/**
 * Canonical weekly due-date grouping — shared by the Weekly Work Packet print
 * and the interactive WEEKLY DUE workload view. Pure functions; never mutates tasks.
 * Due dates are read as date-only local calendar dates (no UTC shift).
 */

const DONE_STATUS_ID = "6913f57422230d8c7ee2ef54";
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseDateOnly(s) {
  const m = typeof s === "string" && s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday of the week containing d (local calendar). */
export function mondayOf(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export const hasEstimate = (t) => typeof t.estimated_hours === "number" && t.estimated_hours > 0;

/** Open task whose due date is before today (date-only compare). */
export function isTaskOverdue(task, today = new Date()) {
  return task.status_id !== DONE_STATUS_ID && !!task.due_date && task.due_date.slice(0, 10) < toKey(today);
}

/** [{ key, start, end, tasks }] ascending by week, plus unscheduled tasks. Input order kept within a week. */
export function groupTasksByWeek(tasks) {
  const weeks = new Map();
  const unscheduled = [];
  tasks.forEach(t => {
    const d = parseDateOnly(t.due_date);
    if (!d) { unscheduled.push(t); return; }
    const start = mondayOf(d);
    const key = toKey(start);
    if (!weeks.has(key)) {
      const end = new Date(start); end.setDate(end.getDate() + 6);
      weeks.set(key, { key, start, end, tasks: [] });
    }
    weeks.get(key).tasks.push(t);
  });
  const sorted = [...weeks.values()].sort((a, b) => a.key.localeCompare(b.key));
  return { weeks: sorted, unscheduled };
}

/** Totals for exactly the given tasks. Missing/zero estimates are counted as missing, never as 0h. */
export function summarizeWeek(tasks, today = new Date()) {
  const estimated = tasks.filter(hasEstimate);
  return {
    total: tasks.length,
    estHours: estimated.reduce((s, t) => s + t.estimated_hours, 0),
    missing: tasks.length - estimated.length,
    overdue: tasks.filter(t => isTaskOverdue(t, today)).length,
  };
}

/** Stable sort: earliest due first; equal dates keep the incoming order. */
export function sortByDue(list) {
  return list
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.due_date || "").slice(0, 10).localeCompare((b.t.due_date || "").slice(0, 10)) || a.i - b.i)
    .map(x => x.t);
}

const md = (d) => `${DAY[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
export function weekTitle(week) {
  return `Week of ${md(week.start)} \u2013 ${md(week.end)}, ${week.end.getFullYear()}`;
}