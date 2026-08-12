/**
 * Canonical Parts Category recursive tree helpers.
 * 
 * Shared by: Parts Catalog, Parts Groups, Admin Config, print/reports.
 * Supports arbitrary depth hierarchy via self-referencing parent_id.
 */

/**
 * Build lookup maps from a flat categories array.
 * Returns { byId, childrenByParentId }.
 */
export function buildCategoryLookups(categories) {
  const byId = {};
  const childrenByParentId = {};

  for (const cat of categories) {
    byId[cat.id] = cat;
    const pid = cat.parent_id || "__root__";
    if (!childrenByParentId[pid]) childrenByParentId[pid] = [];
    childrenByParentId[pid].push(cat);
  }

  // Sort children by sort_order within each parent
  for (const key of Object.keys(childrenByParentId)) {
    childrenByParentId[key].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  return { byId, childrenByParentId };
}

/**
 * Get the full ancestor path for a category (root → … → category).
 * Returns an array of { id, name, color }.
 */
export function getCategoryPath(categoryId, byId) {
  const path = [];
  let cur = categoryId;
  const visited = new Set();
  while (cur && byId[cur] && !visited.has(cur)) {
    visited.add(cur);
    const cat = byId[cur];
    path.unshift({ id: cat.id, name: cat.name, color: cat.color });
    cur = cat.parent_id;
  }
  return path;
}

/**
 * Get the full path label string for a category: "MECHANICAL / EFI SYSTEM / WIRING HARNESS".
 */
export function getCategoryPathLabel(categoryId, byId, separator = " / ") {
  const path = getCategoryPath(categoryId, byId);
  return path.map(p => p.name).join(separator);
}

/**
 * Get all descendant category IDs (including the category itself).
 * Uses BFS — works at any depth.
 */
export function getAllDescendantIds(categoryId, childrenByParentId) {
  const descendants = new Set();
  const queue = [categoryId];
  while (queue.length > 0) {
    const cur = queue.shift();
    descendants.add(cur);
    const children = childrenByParentId[cur] || [];
    for (const child of children) {
      if (!descendants.has(child.id)) queue.push(child.id);
    }
  }
  return descendants;
}

/**
 * Check whether `potentialAncestorId` is an ancestor of (or equal to) `categoryId`.
 * Used for cycle prevention: a category cannot be moved under its own descendant.
 */
export function isAncestorOf(categoryId, potentialDescendantId, byId) {
  let cur = potentialDescendantId;
  const visited = new Set();
  while (cur && byId[cur] && !visited.has(cur)) {
    if (cur === categoryId) return true;
    visited.add(cur);
    cur = byId[cur].parent_id;
  }
  return false;
}

/**
 * Validate a parent assignment: returns an error string or null if valid.
 * Prevents:
 *  - self-parenting
 *  - circular references (assigning under own descendant)
 */
export function validateParentAssignment(categoryId, newParentId, byId, childrenByParentId) {
  if (!newParentId) return null; // Moving to root is always valid
  if (categoryId === newParentId) return "A category cannot be its own parent.";
  
  // Check if newParentId is a descendant of categoryId
  const descendants = getAllDescendantIds(categoryId, childrenByParentId);
  if (descendants.has(newParentId)) {
    return "Cannot move a category under one of its own descendants (would create a cycle).";
  }
  
  return null;
}

/**
 * Get the depth of a category (0 = root).
 */
export function getCategoryDepth(categoryId, byId) {
  let depth = 0;
  let cur = byId[categoryId]?.parent_id;
  const visited = new Set();
  while (cur && byId[cur] && !visited.has(cur)) {
    visited.add(cur);
    depth++;
    cur = byId[cur].parent_id;
  }
  return depth;
}

/**
 * Build a flat list of categories with indented labels for use in dropdowns.
 * Each item: { id, label, depth, category }.
 * Optionally exclude a category and its descendants (for parent selectors).
 */
export function buildFlatCategoryOptions(categories, excludeId = null) {
  const { byId, childrenByParentId } = buildCategoryLookups(categories);
  const options = [];

  // Compute descendants to exclude
  let excludeSet = new Set();
  if (excludeId) {
    excludeSet = getAllDescendantIds(excludeId, childrenByParentId);
  }

  function walk(parentId, depth) {
    const children = childrenByParentId[parentId || "__root__"] || [];
    for (const cat of children) {
      if (excludeSet.has(cat.id)) continue;
      const pathLabel = getCategoryPathLabel(cat.id, byId);
      const indent = "\u00A0\u00A0".repeat(depth); // non-breaking spaces for visual indent
      options.push({
        id: cat.id,
        label: pathLabel,
        indentedLabel: `${indent}${cat.name}`,
        depth,
        category: cat,
      });
      walk(cat.id, depth + 1);
    }
  }

  walk(null, 0);
  return options;
}