/**
 * Canonical Workload Rollup — SINGLE SOURCE OF TRUTH
 *
 * Every displayed hour total in the app originates from this module.
 * No UI component should calculate hours independently.
 *
 * Data flow:
 *   visibleTasks → buildWorkloadRollup() → { totals, byProject, byPhase, byAssignee }
 *
 * Consumers:
 *   - WeeklyHoursSummary (totals + byAssignee + byPhase)
 *   - WorkloadProjectGroup headers (byProject[id])
 *   - Phase headers (byPhase[compositeKey])
 *   - ProjectWorkloadView (same builder, different task scope)
 *   - Print views (same rollup)
 *
 * ESTIMATE RULES:
 * - Include: open tasks (not completed, not cancelled)
 * - Exclude: completed, cancelled
 * - Missing estimate: null, undefined, 0 → counts as "missing", not zero hours
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
    if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
    const aDue = parseDateValue(a.due_date);
    const bDue = parseDateValue(b.due_date);
    if (aDue !== bDue) {
      if (aDue === null) return 1;
      if (bDue === null) return -1;
      return aDue - bDue;
    }
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
    if (aTime !== bTime) return bTime - aTime;
    return (a.name || "").localeCompare(b.name || "");
  });
}

// ─── Internal accumulator ─────────────────────────────────────

function createBucket() {
  return { hours: 0, priorityHours: 0, nonPriorityHours: 0, missingEstimates: 0, taskCount: 0 };
}

function accumulateTask(bucket, task) {
  bucket.taskCount++;
  const hasEst = task.estimated_hours && task.estimated_hours > 0;
  if (hasEst) {
    bucket.hours += task.estimated_hours;
    if (task.is_priority) bucket.priorityHours += task.estimated_hours;
    else bucket.nonPriorityHours += task.estimated_hours;
  } else {
    bucket.missingEstimates++;
  }
}

// ─── Canonical Rollup Builder ─────────────────────────────────

/**
 * Build the complete canonical rollup from a set of visible tasks.
 *
 * This is the ONLY function that should calculate hours.
 * Every view renders from the returned object — no recalculation.
 *
 * @param {Array} visibleTasks - the tasks to roll up (already filtered to the correct scope)
 * @param {Object} [opts]
 * @param {Map} [opts.teamMemberMap] - Map<id, teamMember> for assignee grouping
 * @param {Map} [opts.phaseLookup]   - Map<bucketId, bucket> for phase grouping
 * @returns {WorkloadRollup}
 *
 * @typedef {Object} WorkloadRollup
 * @property {RollupBucket} totals
 * @property {Object<string, RollupBucket & {projectName: string}>} byProject
 * @property {Object<string, RollupBucket & {phaseId: string, phaseName: string, phaseColor: string}>} byPhase
 * @property {Array<RollupBucket & {memberId: string, memberName: string}>} byAssignee
 *
 * @typedef {Object} RollupBucket
 * @property {number} hours
 * @property {number} priorityHours
 * @property {number} nonPriorityHours
 * @property {number} missingEstimates
 * @property {number} taskCount
 */
export function buildWorkloadRollup(visibleTasks, opts = {}) {
  const { teamMemberMap, phaseLookup } = opts;

  const totals = createBucket();
  const byProject = {};     // keyed by project_id
  const byPhaseMap = {};    // keyed by composite "projectId::bucketId" for uniqueness
  const byAssigneeMap = new Map();

  for (const task of visibleTasks) {
    if (!isOpenTask(task)) continue;

    // ── Totals ──
    accumulateTask(totals, task);

    // ── By Project ──
    const pid = task.project_id || "__no_project__";
    if (!byProject[pid]) {
      byProject[pid] = { ...createBucket(), projectId: pid };
    }
    accumulateTask(byProject[pid], task);

    // ── By Phase (composite key: projectId::bucketId) ──
    const bucketId = task.kanban_bucket_id || "__unphased__";
    const phaseKey = `${pid}::${bucketId}`;
    if (!byPhaseMap[phaseKey]) {
      const bucket = phaseLookup?.get(bucketId);
      byPhaseMap[phaseKey] = {
        ...createBucket(),
        phaseId: bucketId,
        projectId: pid,
        phaseName: bucket?.name || "General / No Phase",
        phaseColor: bucket?.color || "#6B7280",
      };
    }
    accumulateTask(byPhaseMap[phaseKey], task);

    // ── By Assignee ──
    const mid = task.assigned_team_member_id || "__unassigned__";
    if (!byAssigneeMap.has(mid)) {
      const member = teamMemberMap?.get(mid);
      byAssigneeMap.set(mid, {
        ...createBucket(),
        memberId: mid,
        memberName: member?.full_name || "Unassigned",
      });
    }
    accumulateTask(byAssigneeMap.get(mid), task);
  }

  // Sort assignees by hours DESC
  const byAssignee = Array.from(byAssigneeMap.values()).sort((a, b) => b.hours - a.hours);

  return { totals, byProject, byPhase: byPhaseMap, byAssignee };
}

// ─── Convenience: phase rollup for a specific project ─────────

/**
 * Extract phase rollups for a single project from the canonical rollup.
 * Returns a Map<bucketId, RollupBucket> for quick lookup.
 */
export function getProjectPhaseRollups(rollup, projectId) {
  const result = new Map();
  const pid = projectId || "__no_project__";
  for (const [key, value] of Object.entries(rollup.byPhase)) {
    if (key.startsWith(`${pid}::`)) {
      result.set(value.phaseId, value);
    }
  }
  return result;
}

// ─── Legacy compatibility re-exports ──────────────────────────
// These are kept for any remaining callers during transition.
// New code should use buildWorkloadRollup() exclusively.

/** @deprecated Use buildWorkloadRollup().totals.hours instead */
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