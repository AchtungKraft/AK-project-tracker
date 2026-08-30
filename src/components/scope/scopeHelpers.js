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
 * Compute rollup stats for a list of ScopeItems
 */
export function computeRollup(items) {
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
  };

  for (const item of items) {
    const s = item.decision_status || 'needs_review';
    stats[s] = (stats[s] || 0) + 1;

    if (item.budget_tbd) {
      stats.tbd_count++;
    } else {
      if (item.budget_min != null) stats.budget_min += item.budget_min;
      if (item.budget_max != null) stats.budget_max += item.budget_max;
    }

    if (s === 'approved') {
      if (!item.budget_tbd) {
        if (item.budget_min != null) stats.approved_budget_min += item.budget_min;
        if (item.budget_max != null) stats.approved_budget_max += item.budget_max;
      }
    }
  }

  return stats;
}

/**
 * Compute a deterministic hash of material fields for reapproval detection.
 */
export function computeMaterialHash(item) {
  const fields = {
    title: item.title || '',
    description: item.description || '',
    budget_min: item.budget_min ?? null,
    budget_max: item.budget_max ?? null,
    budget_note: item.budget_note || '',
    images: (item.images || []).slice().sort(),
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