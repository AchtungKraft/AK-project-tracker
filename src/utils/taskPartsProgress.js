/**
 * Canonical helper: compute task-level parts progress from TaskPartLink records.
 * Single source of truth — use across print views, dashboards, modals.
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
    const done = Math.min(link.qty_installed ?? 0, required);
    total += required;
    installed += done;
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