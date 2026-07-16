/**
 * Shared workload rollup utilities.
 * Single source of truth for weekly hours summaries, assignee/phase grouping,
 * and canonical task sorting.
 *
 * ESTIMATE RULES:
 * - Include: open tasks (not completed, not cancelled)
 * - Exclude: completed, cancelled, skipped (if treated as non-actionable)
 * - Missing estimate: null, undefined, 0, or invalid → counts as "missing", not zero hours
 * - Zero is treated as "not estimated" (missing)
 *
 * SORT RULES (open tasks):
 *   1. Priority DESC (priority tasks first)
 *   2. Due Date ASC (nulls last within each priority tier)
 *   3. Stable tie-breaker: task name ASC, then created_date ASC
 *
 * SORT RULES (completed tasks):
 *   1. completed_date DESC (newest first)
 *   2. Tie-breaker: updated_date DESC, then name ASC
 */

import { isOpenTask, formatDuration } from "./estimateUtils";

// ─── Canonical open-task comparator ───────────────────────────

function parseDateValue(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Canonical sort for open tasks across all workload views.
 * Priority first → Due Date ASC (nulls last) → name ASC.
 */
export function sortOperationalTasks(tasks) {
  return [...tasks].sort((a, b) => {
    // 1. Priority first
    if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;

    // 2. Due date ascending, nulls last (within same priority tier)
    const aDue = parseDateValue(a.due_date);
    const bDue = parseDateValue(b.due_date);
    if (aDue !== bDue) {
      if (aDue === null) return 1;
      if (bDue === null) return -1;
      return aDue - bDue;
    }

    // 3. Tie-breaker: name then created_date
    const nameCompare = (a.name || "").localeCompare(b.name || "");
    if (nameCompare !== 0) return nameCompare;

    const aCreated = parseDateValue(a.created_date);
    const bCreated = parseDateValue(b.created_date);
    if (aCreated !== null && bCreated !== null) return aCreated - bCreated;
    return 0;
  });
}

/**
 * Canonical sort for completed tasks.
 * Newest completed first → updated_date DESC → name ASC.
 */
export function sortCompletedTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const aTime = parseDateValue(a.completed_date) || parseDateValue(a.updated_date) || 0;
    const bTime = parseDateValue(b.completed_date) || parseDateValue(b.updated_date) || 0;
    if (aTime !== bTime) return bTime - aTime; // newest first
    return (a.name || "").localeCompare(b.name || "");
  });
}

// ─── Rollup helpers ───────────────────────────────────────────

/**
 * Sum estimated_hours for open tasks that have a valid estimate.
 */
export function sumEstimatedHoursRaw(tasks) {
  let total = 0;
  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    if (t.estimated_hours && t.estimated_hours > 0) total += t.estimated_hours;
  }
  return total;
}

/**
 * Count open tasks missing an estimate.
 */
export function countMissingEstimatesRaw(tasks) {
  let count = 0;
  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    if (!t.estimated_hours || t.estimated_hours <= 0) count++;
  }
  return count;
}

/**
 * Split estimated hours into priority vs non-priority.
 * Returns { totalHours, priorityHours, nonPriorityHours, missingTotal, missingPriority, missingOther }
 */
export function splitPriorityEstimatedHours(tasks) {
  let priorityHours = 0;
  let nonPriorityHours = 0;
  let missingPriority = 0;
  let missingOther = 0;

  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    const hasEst = t.estimated_hours && t.estimated_hours > 0;
    if (t.is_priority) {
      if (hasEst) priorityHours += t.estimated_hours;
      else missingPriority++;
    } else {
      if (hasEst) nonPriorityHours += t.estimated_hours;
      else missingOther++;
    }
  }

  return {
    totalHours: priorityHours + nonPriorityHours,
    priorityHours,
    nonPriorityHours,
    missingTotal: missingPriority + missingOther,
    missingPriority,
    missingOther,
  };
}

/**
 * Group estimated hours by assigned team member.
 * Returns array of { memberId, memberName, totalHours, priorityHours, taskCount, missingCount }
 * sorted by totalHours DESC.
 */
export function groupEstimatedHoursByAssignee(tasks, teamMemberMap) {
  const groups = new Map();

  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    const mid = t.assigned_team_member_id || "__unassigned__";
    if (!groups.has(mid)) {
      const member = teamMemberMap?.get(mid);
      groups.set(mid, {
        memberId: mid,
        memberName: member?.full_name || "Unassigned",
        totalHours: 0,
        priorityHours: 0,
        taskCount: 0,
        missingCount: 0,
      });
    }
    const g = groups.get(mid);
    g.taskCount++;
    const hasEst = t.estimated_hours && t.estimated_hours > 0;
    if (hasEst) {
      g.totalHours += t.estimated_hours;
      if (t.is_priority) g.priorityHours += t.estimated_hours;
    } else {
      g.missingCount++;
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.totalHours - a.totalHours);
}

/**
 * Group estimated hours by phase (kanban bucket).
 * Phase names from different projects are aggregated by display name.
 * Returns array of { phaseName, phaseColor, totalHours, priorityHours, taskCount, missingCount }
 * sorted by totalHours DESC.
 */
export function groupEstimatedHoursByPhase(tasks, phaseLookup) {
  const groups = new Map();

  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    const bucket = phaseLookup?.get(t.kanban_bucket_id);
    const phaseName = bucket?.name || "General / No Phase";
    const phaseColor = bucket?.color || "#6B7280";

    if (!groups.has(phaseName)) {
      groups.set(phaseName, {
        phaseName,
        phaseColor,
        totalHours: 0,
        priorityHours: 0,
        taskCount: 0,
        missingCount: 0,
      });
    }
    const g = groups.get(phaseName);
    g.taskCount++;
    const hasEst = t.estimated_hours && t.estimated_hours > 0;
    if (hasEst) {
      g.totalHours += t.estimated_hours;
      if (t.is_priority) g.priorityHours += t.estimated_hours;
    } else {
      g.missingCount++;
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.totalHours - a.totalHours);
}

// ─── Canonical weekly rollup ──────────────────────────────────

/**
 * Build a complete weekly hours rollup from a task set.
 * Single source of truth — every weekly-hours display consumes this result.
 *
 * @param {Array} tasks - already-filtered tasks for the selected scope
 * @returns {{ taskCount, totalEstimatedHours, priorityEstimatedHours, nonPriorityEstimatedHours,
 *             missingEstimateCount, priorityMissingEstimateCount, byAssignee, byPhase }}
 */
export function buildWeeklyHoursRollup(tasks, teamMemberMap, phaseLookup) {
  const split = splitPriorityEstimatedHours(tasks);
  return {
    taskCount: tasks.filter(t => isOpenTask(t)).length,
    totalEstimatedHours: split.totalHours,
    priorityEstimatedHours: split.priorityHours,
    nonPriorityEstimatedHours: split.nonPriorityHours,
    missingEstimateCount: split.missingTotal,
    priorityMissingEstimateCount: split.missingPriority,
    byAssignee: teamMemberMap ? groupEstimatedHoursByAssignee(tasks, teamMemberMap) : [],
    byPhase: phaseLookup ? groupEstimatedHoursByPhase(tasks, phaseLookup) : [],
  };
}

/**
 * Compute scoped task-group totals (for project/phase headers in workload sections).
 * Uses the same isOpenTask + estimate rules as all other rollups.
 *
 * @returns {{ totalHours, missingCount, taskCount }}
 */
export function computeScopedTotals(tasks) {
  let totalHours = 0;
  let missingCount = 0;
  let taskCount = 0;
  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    taskCount++;
    if (t.estimated_hours && t.estimated_hours > 0) {
      totalHours += t.estimated_hours;
    } else {
      missingCount++;
    }
  }
  return { totalHours, missingCount, taskCount };
}

export { formatDuration };