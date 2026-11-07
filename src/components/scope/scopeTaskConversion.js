import { formatHoursRange } from "./scopeHelpers";
import { computeScopeItemPricing, formatDollarRange } from "./scopePricingHelpers";

/** Approved scope items that have not been converted to a task yet. */
export function getConvertibleScopeItems(items) {
  return items.filter(i => i.decision_status === "approved" && !(i.linked_task_ids || []).length);
}

/** Build a Task payload from an approved scope item, carrying its details over. */
export function buildTaskFromScopeItem({ item, laborEstimates, categoryName, groupName, requestTitle, projectId, bucketId, statusId }) {
  const itemLabor = laborEstimates.filter(le => le.scope_item_id === item.id);
  const p = computeScopeItemPricing(item, itemLabor);
  const lines = [];

  if (item.description) lines.push(item.description.trim(), "");
  lines.push(`From scope review: ${requestTitle || "Scope Review"}`);
  lines.push(`Category / Group: ${[categoryName, groupName].filter(Boolean).join(" / ")}`);

  if (p.pricing_model === "legacy_estimate") {
    lines.push(`Budget: ${p.legacy_budget_tbd ? "TBD" : formatDollarRange(p.legacy_budget_min, p.legacy_budget_max) || "—"}`);
  } else {
    lines.push(`Hard cost / parts: ${p.hard_cost_tbd ? "TBD" : formatDollarRange(p.hard_cost_min, p.hard_cost_max) || "$0"}`);
  }
  if (item.hard_cost_note) lines.push(`Hard cost note: ${item.hard_cost_note}`);
  if (p.labor_estimated) {
    lines.push(`AK labor: ${formatHoursRange(p.ak_hours_min, p.ak_hours_max)} (${formatDollarRange(p.ak_labor_min, p.ak_labor_max)})`);
    for (const le of itemLabor) {
      lines.push(`  • ${le.labor_group_name_snapshot || "Labor"}: ${formatHoursRange(le.hours_min, le.hours_max)} @ $${le.rate_snapshot || 0}/hr`);
    }
  }
  if (p.pricing_model !== "legacy_estimate" && !p.hard_cost_tbd) {
    const total = formatDollarRange(p.total_estimate_min, p.total_estimate_max);
    if (total) lines.push(`Total estimate: ${total}`);
  }
  if (item.budget_note) lines.push(`Note: ${item.budget_note}`);
  if (item.images?.length) lines.push("", "Reference images:", ...item.images);

  const hours = p.ak_hours_max || p.ak_hours_min;
  return {
    name: item.title,
    description: lines.join("\n"),
    project_id: projectId,
    ...(bucketId ? { kanban_bucket_id: bucketId } : {}),
    ...(statusId ? { status_id: statusId } : {}),
    ...(hours ? { estimated_hours: hours } : {}),
  };
}