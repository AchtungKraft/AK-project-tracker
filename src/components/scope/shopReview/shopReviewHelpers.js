import { DECISION_LABELS } from "@/components/scope/scopeHelpers";

export const CONVERSION_LABELS = {
  converted: "Task created",
  approved_not_converted: "Approved — no task yet",
  not_converted: "Not converted",
};

export const statusLabel = (s) => DECISION_LABELS[s] || DECISION_LABELS.needs_review;

const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** Hours range text; "TBD" when no usable estimate. Hours only — never money. */
export function hoursText(min, max) {
  const lo = typeof min === "number" && min > 0 ? min : null;
  const hi = typeof max === "number" && max > 0 ? max : null;
  if (lo == null && hi == null) return "TBD";
  if (lo != null && hi != null && lo !== hi) return `${fmt(lo)}–${fmt(hi)} hrs`;
  return `${fmt(lo ?? hi)} hrs`;
}

export function laborTotal(labor) {
  if (!labor.length) return "TBD";
  const min = labor.reduce((a, l) => a + (l.hours_min || 0), 0);
  const max = labor.reduce((a, l) => a + (l.hours_max || 0), 0);
  return hoursText(min, max);
}

const bySort = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);

/**
 * Category → Group → Item in canonical sort order. Items whose category or group
 * no longer exists are kept under "Unassigned" so every item prints.
 */
export function buildShopHierarchy(categories, groups, items) {
  const catIds = new Set(categories.map((c) => c.id));
  const groupIds = new Set(groups.map((g) => g.id));
  const UNASSIGNED = "__unassigned__";
  const cats = [...categories].sort(bySort);
  const grps = [...groups].sort(bySort);
  if (items.some((i) => !catIds.has(i.category_id))) cats.push({ id: UNASSIGNED, name: "Unassigned" });
  const needsUngrouped = items.some((i) => !groupIds.has(i.group_id));
  const allGroups = needsUngrouped ? [...grps, { id: UNASSIGNED, name: "Ungrouped" }] : grps;

  return cats.map((cat) => {
    const catItems = items.filter((i) => (catIds.has(i.category_id) ? i.category_id : UNASSIGNED) === cat.id);
    const groupsOut = allGroups
      .map((g) => ({
        ...g,
        items: catItems.filter((i) => (groupIds.has(i.group_id) ? i.group_id : UNASSIGNED) === g.id).sort(bySort),
      }))
      .filter((g) => g.items.length > 0);
    return { ...cat, count: catItems.length, groups: groupsOut };
  }).filter((c) => c.count > 0);
}