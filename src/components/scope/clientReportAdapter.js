/**
 * Maps the client-safe clientScopeReview response into the record shapes the existing
 * Scope Review print generators expect. No rates exist in this data: each item gets one
 * description-less labor entry carrying its server-computed labor dollars (labor_cost_min/max),
 * which computeScopeItemPricing sums exactly like rate math.
 */
export function toPrintModel(data) {
  const items = data.items.map(i => ({
    id: i.id, request_id: i.request_id, category_id: i.category_id, group_id: i.group_id,
    title: i.title, description: i.description, images: i.images, sort_order: i.sort_order,
    pricing_model: i.pricing_model, decision_status: i.decision_status,
    hard_cost_lines: i.hard_cost_lines, hard_cost_note: i.hard_cost_note, budget_note: i.budget_note,
    hard_cost_min: i.pricing.hard_cost_min, hard_cost_max: i.pricing.hard_cost_max, hard_cost_tbd: i.pricing.hard_cost_tbd,
    budget_min: i.pricing.legacy_budget_min, budget_max: i.pricing.legacy_budget_max, budget_tbd: i.pricing.legacy_budget_tbd,
  }));
  const laborEstimates = data.items.flatMap(i => [
    ...i.labor_lines.map(l => ({ scope_item_id: i.id, labor_group_name_snapshot: l.labor_category, description: l.description,
      hours_min: l.hours_min, hours_max: l.hours_max, sort_order: l.sort_order, labor_cost_min: 0, labor_cost_max: 0 })),
    ...(i.labor_lines.length ? [{ scope_item_id: i.id, hours_min: 0, hours_max: 0, labor_cost_min: i.pricing.ak_labor_min, labor_cost_max: i.pricing.ak_labor_max }] : []),
  ]);
  const latest = data.confirmation?.latest;
  return {
    request: data.request, project: data.project, categories: data.categories, groups: data.groups,
    items, laborEstimates, confirmations: latest ? [latest] : [],
  };
}