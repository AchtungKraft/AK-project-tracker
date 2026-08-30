/**
 * Scope Review helpers — budget formatting, rollups, material hash for reapproval.
 * Architecture: Category and Group are independent request-level entities.
 * Items reference both, and the display hierarchy is Category → Group → Item.
 */

export const DECISION_LABELS = {
  needs_review: 'Needs Review',
  approved: 'Approved',
  request_changes: 'Request Changes',
  not_now: 'Not Now',
  reapproval_required: 'Reapproval Required',
};

export const DECISION_COLORS = {
  needs_review: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  approved: 'bg-green-500/20 text-green-400 border-green-500/40',
  request_changes: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  not_now: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
  reapproval_required: 'bg-red-500/20 text-red-400 border-red-500/40',
};

export const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'request_changes', label: 'Request Changes' },
  { value: 'not_now', label: 'Not Now' },
  { value: 'reapproval_required', label: 'Reapproval Required' },
];

export function formatBudgetRange(min, max, tbd) {
  if (tbd) return 'TBD';
  if (min == null && max == null) return null;
  const fmt = (v) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max)}`;
}

export function formatBudgetCompact(min, max, tbd) {
  if (tbd) return 'TBD';
  if (min == null && max == null) return null;
  const fmt = (v) => v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${v}`;
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max)}`;
}

/**
 * Compute rollup stats for a list of ScopeItems.
 * Optionally accepts laborEstimates array to compute AK labor rollups.
 */
export function computeRollup(items, laborEstimates = []) {
  const stats = {
    total: items.length,
    needs_review: 0,
    approved: 0,
    request_changes: 0,
    not_now: 0,
    reapproval_required: 0,
    budget_min: 0,
    budget_max: 0,
    tbd_count: 0,
    approved_budget_min: 0,
    approved_budget_max: 0,
    approved_tbd_count: 0,
    not_now_budget_min: 0,
    not_now_budget_max: 0,
    not_now_tbd_count: 0,
    // AK labor rollups — overall
    ak_hours_min: 0,
    ak_hours_max: 0,
    ak_labor_min: 0,
    ak_labor_max: 0,
    // AK labor — approved disposition
    approved_ak_hours_min: 0,
    approved_ak_hours_max: 0,
    approved_ak_labor_min: 0,
    approved_ak_labor_max: 0,
    // AK labor — not now disposition
    not_now_ak_hours_min: 0,
    not_now_ak_hours_max: 0,
    not_now_ak_labor_min: 0,
    not_now_ak_labor_max: 0,
  };

  // Build lookup: scope_item_id → labor estimates
  const laborByItem = new Map();
  for (const le of laborEstimates) {
    if (!laborByItem.has(le.scope_item_id)) laborByItem.set(le.scope_item_id, []);
    laborByItem.get(le.scope_item_id).push(le);
  }

  for (const item of items) {
    const s = item.decision_status || 'needs_review';
    stats[s] = (stats[s] || 0) + 1;

    if (item.budget_tbd) {
      stats.tbd_count++;
    } else {
      if (item.budget_min != null) stats.budget_min += item.budget_min;
      if (item.budget_max != null) stats.budget_max += item.budget_max;
    }

    // Item-level labor totals
    const itemLabor = laborByItem.get(item.id) || [];
    let itemHoursMin = 0, itemHoursMax = 0, itemLaborMin = 0, itemLaborMax = 0;
    for (const le of itemLabor) {
      itemHoursMin += le.hours_min || 0;
      itemHoursMax += le.hours_max || 0;
      itemLaborMin += (le.hours_min || 0) * (le.rate_snapshot || 0);
      itemLaborMax += (le.hours_max || 0) * (le.rate_snapshot || 0);
    }

    stats.ak_hours_min += itemHoursMin;
    stats.ak_hours_max += itemHoursMax;
    stats.ak_labor_min += itemLaborMin;
    stats.ak_labor_max += itemLaborMax;

    if (s === 'approved') {
      if (item.budget_tbd) {
        stats.approved_tbd_count++;
      } else {
        if (item.budget_min != null) stats.approved_budget_min += item.budget_min;
        if (item.budget_max != null) stats.approved_budget_max += item.budget_max;
      }
      stats.approved_ak_hours_min += itemHoursMin;
      stats.approved_ak_hours_max += itemHoursMax;
      stats.approved_ak_labor_min += itemLaborMin;
      stats.approved_ak_labor_max += itemLaborMax;
    } else if (s === 'not_now') {
      if (item.budget_tbd) {
        stats.not_now_tbd_count++;
      } else {
        if (item.budget_min != null) stats.not_now_budget_min += item.budget_min;
        if (item.budget_max != null) stats.not_now_budget_max += item.budget_max;
      }
      stats.not_now_ak_hours_min += itemHoursMin;
      stats.not_now_ak_hours_max += itemHoursMax;
      stats.not_now_ak_labor_min += itemLaborMin;
      stats.not_now_ak_labor_max += itemLaborMax;
    }
  }

  return stats;
}

/**
 * Compute labor breakdown by labor group for a set of items.
 * Returns an array of { labor_group_id, name, hours_min, hours_max, cost_min, cost_max }.
 */
export function computeLaborBreakdown(items, laborEstimates = []) {
  const itemIds = new Set(items.map(i => i.id));
  const relevant = laborEstimates.filter(le => itemIds.has(le.scope_item_id));
  const byGroup = new Map();
  for (const le of relevant) {
    const key = le.labor_group_id;
    if (!byGroup.has(key)) {
      byGroup.set(key, { labor_group_id: key, name: le.labor_group_name_snapshot || 'Unknown', hours_min: 0, hours_max: 0, cost_min: 0, cost_max: 0 });
    }
    const g = byGroup.get(key);
    g.hours_min += le.hours_min || 0;
    g.hours_max += le.hours_max || 0;
    g.cost_min += (le.hours_min || 0) * (le.rate_snapshot || 0);
    g.cost_max += (le.hours_max || 0) * (le.rate_snapshot || 0);
  }
  return Array.from(byGroup.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Compute labor totals for a single scope item.
 */
export function computeItemLaborTotals(laborEstimates = []) {
  let hours_min = 0, hours_max = 0, cost_min = 0, cost_max = 0;
  for (const le of laborEstimates) {
    hours_min += le.hours_min || 0;
    hours_max += le.hours_max || 0;
    cost_min += (le.hours_min || 0) * (le.rate_snapshot || 0);
    cost_max += (le.hours_max || 0) * (le.rate_snapshot || 0);
  }
  return { hours_min, hours_max, cost_min, cost_max };
}

/** Format hours range for display */
export function formatHoursRange(min, max) {
  if (!min && !max) return null;
  const fmt = v => Number.isInteger(v) ? v.toString() : v.toFixed(1);
  if (min != null && max != null && min !== max) return `${fmt(min)}–${fmt(max)} hrs`;
  if (min != null) return `${fmt(min)} hrs`;
  return `${fmt(max)} hrs`;
}

/**
 * Compute a deterministic hash of material fields for reapproval detection.
 */
/**
 * Compute a deterministic hash of material fields for reapproval detection.
 * Includes labor estimate data so changes trigger reapproval.
 */
export function computeMaterialHash(item, laborEstimates = []) {
  const itemLabor = laborEstimates
    .filter(le => le.scope_item_id === item.id)
    .map(le => ({ gid: le.labor_group_id, hmin: le.hours_min, hmax: le.hours_max, rate: le.rate_snapshot }))
    .sort((a, b) => a.gid.localeCompare(b.gid));
  const fields = {
    title: item.title || '',
    description: item.description || '',
    budget_min: item.budget_min ?? null,
    budget_max: item.budget_max ?? null,
    budget_note: item.budget_note || '',
    images: (item.images || []).slice().sort(),
    labor: itemLabor,
  };
  return JSON.stringify(fields);
}

/**
 * Check if item has material changes since last approval
 */
export function hasMaterialChanges(item) {
  if (!item.material_hash) return false;
  return computeMaterialHash(item) !== item.material_hash;
}

/**
 * Build presentation hierarchy: Category → Group → Item.
 * Groups are request-level (independent of category). The display nests them
 * dynamically: for each category, find items in that category, group them
 * by group_id, and display only groups that have items in that category.
 */
export function buildScopeHierarchy(categories, groups, items) {
  const sortedCats = [...categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const sortedGroups = [...groups].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const groupMap = new Map(sortedGroups.map(g => [g.id, g]));

  return sortedCats.map(cat => {
    const catItems = items.filter(i => i.category_id === cat.id);

    // Group items by group_id, preserving canonical group sort order
    const groupItemMap = new Map();
    for (const item of catItems) {
      if (!groupItemMap.has(item.group_id)) groupItemMap.set(item.group_id, []);
      groupItemMap.get(item.group_id).push(item);
    }

    // Build group entries in canonical group sort order, only for groups that have items
    const displayGroups = sortedGroups
      .filter(g => groupItemMap.has(g.id))
      .map(g => ({
        ...g,
        items: (groupItemMap.get(g.id) || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
      }));

    return {
      ...cat,
      allItems: catItems, // all items in this category (for rollups)
      groups: displayGroups,
    };
  });
}