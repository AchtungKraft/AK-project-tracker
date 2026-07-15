/**
 * Shared estimated-hours utilities.
 * Single source of truth for formatting, summing, and counting missing estimates.
 */

const DONE_STATUS_ID = "6913f57422230d8c7ee2ef54";
const CANCELLED_STATES = ["CANCELLED"];

/**
 * Is this task "open" for estimate-remaining purposes?
 * Includes: not-started, ready, in-progress, blocked, waiting — excludes completed & cancelled.
 */
export function isOpenTask(task) {
  if (task.status_id === DONE_STATUS_ID) return false;
  if (CANCELLED_STATES.includes(task.operational_state)) return false;
  return true;
}

/**
 * Format decimal hours into compact display.
 *   0.25 → "15m"
 *   0.5  → "30m"
 *   1    → "1h"
 *   1.5  → "1h 30m"
 *   2.25 → "2h 15m"
 */
export function formatDuration(hours) {
  if (hours == null || hours <= 0) return null;
  const hrs = Math.floor(hours);
  const mins = Math.round((hours - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

/** Compact format without space — for tight row display */
export function formatDurationCompact(hours) {
  if (hours == null || hours <= 0) return null;
  const hrs = Math.floor(hours);
  const mins = Math.round((hours - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h${mins}m`;
}

/**
 * Sum estimated_hours across open tasks (excludes completed/cancelled).
 * Tasks with null/0 estimates are skipped.
 */
export function sumEstimatedHours(tasks) {
  let total = 0;
  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    if (t.estimated_hours && t.estimated_hours > 0) {
      total += t.estimated_hours;
    }
  }
  return total;
}

/**
 * Count open tasks that have no estimate.
 */
export function countMissingEstimates(tasks) {
  let count = 0;
  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    if (!t.estimated_hours || t.estimated_hours <= 0) {
      count++;
    }
  }
  return count;
}

/**
 * Parse user input into decimal hours.
 * Accepts: "30m", "1h", "1h 30m", "1.5", "2.25", "45m", "1h15m"
 * Returns null if invalid.
 */
export function parseEstimateInput(input) {
  if (!input || typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;

  // Pure number → decimal hours
  const num = parseFloat(s);
  if (/^\d+(\.\d+)?$/.test(s) && !isNaN(num)) return num > 0 ? num : null;

  // "30m" or "45m"
  const mMatch = s.match(/^(\d+)\s*m$/);
  if (mMatch) {
    const mins = parseInt(mMatch[1], 10);
    return mins > 0 ? mins / 60 : null;
  }

  // "2h" 
  const hMatch = s.match(/^(\d+(\.\d+)?)\s*h$/);
  if (hMatch) {
    const hrs = parseFloat(hMatch[1]);
    return hrs > 0 ? hrs : null;
  }

  // "1h 30m" or "1h30m"
  const hmMatch = s.match(/^(\d+)\s*h\s*(\d+)\s*m$/);
  if (hmMatch) {
    const hrs = parseInt(hmMatch[1], 10);
    const mins = parseInt(hmMatch[2], 10);
    const total = hrs + mins / 60;
    return total > 0 ? total : null;
  }

  return null;
}

/** Quick options for the estimate picker (in decimal hours) */
export const QUICK_ESTIMATE_OPTIONS = [
  { label: "15m", value: 0.25 },
  { label: "30m", value: 0.5 },
  { label: "45m", value: 0.75 },
  { label: "1h", value: 1 },
  { label: "2h", value: 2 },
  { label: "4h", value: 4 },
  { label: "8h", value: 8 },
];