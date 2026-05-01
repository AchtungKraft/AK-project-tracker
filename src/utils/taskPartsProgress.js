/**
 * ══════════════════════════════════════════════════════════════════════
 * CANONICAL: Task-level parts progress from TaskPartLink records.
 * 
 * TaskPartLink is the SINGLE SOURCE OF TRUTH for task progress display.
 * Never derive task progress from commitment lifecycle state, 
 * resolveLifecycleState(), or commitment_status fields.
 * 
 * Commitment remains source of truth for inventory/ordering/execution,
 * but TaskPartLink owns the task display contract.
 * 
 * All install paths in executeSupplyAction MUST sync TaskPartLink
 * immediately after mutating commitment qty_installed.
 * ══════════════════════════════════════════════════════════════════════
 *
 * @param {Array} links - Array of TaskPartLink records for a single task
 * @returns {{ installed: number, total: number } | null} - null if no links
 */
export function getTaskPartsProgressFromLinks(links) {
  if (!links || links.length === 0) return null;

  let total = 0;
  let installed = 0;

  links.forEach(link => {
    const required = link.qty_allocated ?? 1;
    total += required;
    if (link.install_status === 'complete') {
      installed += required;
    } else {
      installed += Math.min(link.qty_installed ?? 0, required);
    }
  });

  return { installed, total };
}

/**
 * Group an array of TaskPartLink records by task_id for O(1) lookup.
 * Optionally filters to a set of task IDs.
 *
 * @param {Array} allLinks - All TaskPartLink records
 * @param {Set<string>} [taskIdSet] - Optional set to filter by
 * @returns {Object} Map of task_id → TaskPartLink[]
 */
export function groupTaskPartLinksByTaskId(allLinks, taskIdSet) {
  const map = {};
  allLinks.forEach(link => {
    if (taskIdSet && !taskIdSet.has(link.task_id)) return;
    if (!map[link.task_id]) map[link.task_id] = [];
    map[link.task_id].push(link);
  });
  return map;
}

/**
 * Compute parts progress for every task in a set, returning a map of
 * task_id → { installed, total } (only for tasks that have linked parts).
 *
 * @param {Array} allLinks - All TaskPartLink records
 * @param {Set<string>} taskIdSet - Task IDs to include
 * @returns {Object} Map of task_id → { installed: number, total: number }
 */
export function computePartsProgressByTaskId(allLinks, taskIdSet) {
  const grouped = groupTaskPartLinksByTaskId(allLinks, taskIdSet);
  const result = {};
  Object.entries(grouped).forEach(([taskId, links]) => {
    const progress = getTaskPartsProgressFromLinks(links);
    if (progress) result[taskId] = progress;
  });
  return result;
}