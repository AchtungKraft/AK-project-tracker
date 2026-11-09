/** Approved scope items that have not been converted to a task yet. */
export function getConvertibleScopeItems(items) {
  return items.filter(i => i.decision_status === "approved" && !(i.linked_task_ids || []).length);
}