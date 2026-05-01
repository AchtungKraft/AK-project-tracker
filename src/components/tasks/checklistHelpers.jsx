import { base44 } from "@/api/base44Client";

/**
 * Compute next sort_order for a new checklist item (append to end).
 * Uses spacing of 10 for future insert flexibility.
 */
export function getNextSortOrder(items) {
  const max = Math.max(0, ...items.map(i => i.sort_order || 0));
  return max + 10;
}

/**
 * Sort checklist items: incomplete first by sort_order, then complete by sort_order.
 */
export function sortChecklistItems(items) {
  const incomplete = items.filter(i => !i.is_complete).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const complete = items.filter(i => i.is_complete).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return [...incomplete, ...complete];
}

/**
 * Determine progress color state from completed/total counts.
 * Returns null if no checklist items exist.
 */
export function getChecklistProgressColor(completed, total) {
  if (!total) return null;
  const ratio = completed / total;
  if (ratio >= 1) return 'text-green-500';
  if (ratio >= 0.5) return 'text-yellow-400';
  return 'text-red-500';
}

/**
 * Reassign sort_order for checklist items in a given order.
 * Uses spacing of 10 between items for future insert flexibility.
 *
 * @param {string} taskId - Parent task ID (for validation)
 * @param {string[]} orderedIds - Item IDs in desired order
 * @param {object[]} currentItems - Current item records (to verify ownership)
 * @returns {Promise<void>}
 */
export async function updateChecklistOrder(taskId, orderedIds, currentItems) {
  const itemMap = {};
  currentItems.forEach(i => { itemMap[i.id] = i; });

  const updates = [];
  orderedIds.forEach((id, index) => {
    const item = itemMap[id];
    if (!item || item.task_id !== taskId) return;
    const newOrder = (index + 1) * 10;
    if (item.sort_order !== newOrder) {
      updates.push({ id, sort_order: newOrder });
    }
  });

  // Execute all updates in parallel
  await Promise.all(
    updates.map(u => base44.entities.TaskChecklistItem.update(u.id, { sort_order: u.sort_order }))
  );
}

/**
 * Group checklist items by task_id and compute progress.
 * Returns { [taskId]: { completed, total } }
 */
export function computeChecklistProgress(items, taskIdSet) {
  const map = {};
  items.forEach(i => {
    if (taskIdSet && !taskIdSet.has(i.task_id)) return;
    if (!map[i.task_id]) map[i.task_id] = { completed: 0, total: 0 };
    map[i.task_id].total++;
    if (i.is_complete) map[i.task_id].completed++;
  });
  return map;
}

/**
 * Group incomplete checklist items by task_id, sorted by sort_order.
 * Returns { [taskId]: item[] }
 */
export function groupIncompleteByTaskId(items, taskIdSet) {
  const map = {};
  items
    .filter(i => !i.is_complete && (!taskIdSet || taskIdSet.has(i.task_id)))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .forEach(i => {
      if (!map[i.task_id]) map[i.task_id] = [];
      map[i.task_id].push(i);
    });
  return map;
}