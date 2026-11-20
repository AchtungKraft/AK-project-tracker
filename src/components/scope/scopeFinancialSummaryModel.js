/**
 * Financial Summary section model: Category → Group → deliverables, with group and
 * category subtotals from the canonical computeScopePricingRollup (never from display strings).
 * A category subtotal is only shown when the category holds more than one group;
 * with a single group the group subtotal already covers the same deliverables.
 */
import { computeScopePricingRollup } from "./scopePricingHelpers.js";

export function buildFinancialSummarySections(hierarchy, laborEstimates = []) {
  return hierarchy
    .filter(cat => cat.groups.some(g => g.items.length > 0))
    .map(cat => {
      const groups = cat.groups
        .filter(g => g.items.length > 0)
        .map(g => ({ id: g.id, name: g.name, items: g.items, totals: computeScopePricingRollup(g.items, laborEstimates) }));
      const items = groups.flatMap(g => g.items);
      return {
        id: cat.id,
        name: cat.name,
        groups,
        count: items.length,
        totals: computeScopePricingRollup(items, laborEstimates),
        showCategorySubtotal: groups.length > 1,
      };
    });
}

/** Unpriced notes for a subtotal row. Description-only deliverables never count as TBD. */
export function subtotalNotes(t) {
  const notes = [];
  const tbd = t.hard_cost_tbd_count + t.legacy_budget_tbd_count + (t.labor_tbd_count || 0);
  if (tbd > 0) notes.push(`${tbd} TBD — not included`);
  else if (t.has_incomplete) notes.push("Partial — known amounts only");
  return notes;
}