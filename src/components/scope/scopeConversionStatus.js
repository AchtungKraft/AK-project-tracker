/**
 * INTERNAL ONLY — derive per-item task conversion status from scope items,
 * their linked tasks and secured estimate baselines. Pure, read-only.
 *
 * States: created | approved_not_converted | pending_approval | needs_review | null (not now)
 */
export function computeConversionStatus({ items, tasks, baselines, projectId }) {
  const tasksById = new Map(tasks.map(t => [t.id, t]));
  const baselinesByItem = new Map();
  for (const b of baselines) {
    if (!baselinesByItem.has(b.scope_item_id)) baselinesByItem.set(b.scope_item_id, []);
    baselinesByItem.get(b.scope_item_id).push(b);
  }

  const byItem = {};
  const summary = { approvedConverted: 0, approvedRemaining: 0, needsReview: 0 };

  for (const item of items) {
    const linkedIds = item.linked_task_ids || [];
    const itemBaselines = baselinesByItem.get(item.id) || [];
    const reasons = [];
    const linkedTasks = [];

    for (const id of linkedIds) {
      const t = tasksById.get(id);
      if (!t) reasons.push("Linked task not found");
      else if (projectId && t.project_id !== projectId) reasons.push("Linked task is on another project");
      else linkedTasks.push({ id: t.id, name: t.name });
    }
    for (const b of itemBaselines) {
      if (!linkedIds.includes(b.task_id)) reasons.push("Estimate baseline points to an unlinked task");
      if (projectId && b.project_id !== projectId) reasons.push("Estimate baseline is on another project");
    }

    const decision = item.decision_status || "needs_review";
    let state;
    if (reasons.length) state = "needs_review";
    else if (linkedIds.length) state = "created";
    else if (decision === "approved") state = "approved_not_converted";
    else if (decision === "not_now") state = null;
    else state = "pending_approval";

    byItem[item.id] = { state, tasks: linkedTasks, reasons: [...new Set(reasons)] };

    if (state === "needs_review") summary.needsReview += 1;
    else if (decision === "approved" && state === "created") summary.approvedConverted += 1;
    else if (state === "approved_not_converted") summary.approvedRemaining += 1;
  }

  return { byItem, summary };
}