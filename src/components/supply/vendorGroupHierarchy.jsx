/**
 * vendorGroupHierarchy — Shared helpers for hierarchical vendor groups.
 *
 * Core rule: A vendor is valid for a service if the vendor's group
 * is the service's group OR any descendant of it (subtree match).
 * Services can belong to ANY group level (root or child).
 */

/**
 * Build a lookup map from group ID → group object.
 */
export function buildGroupsById(groups) {
  const map = new Map();
  for (const g of groups) map.set(g.id, g);
  return map;
}

/**
 * Check if `groupId` is within the subtree rooted at `rootGroupId`.
 * Returns true if groupId === rootGroupId, or groupId is a descendant.
 */
export function isGroupWithin(groupId, rootGroupId, groupsById) {
  if (!groupId || !rootGroupId) return false;
  let current = groupId;
  const visited = new Set();
  while (current) {
    if (current === rootGroupId) return true;
    if (visited.has(current)) return false; // cycle guard
    visited.add(current);
    const group = groupsById instanceof Map ? groupsById.get(current) : groupsById[current];
    current = group?.parent_group_id || null;
  }
  return false;
}

/**
 * Get all descendant group IDs (inclusive of root) for a given rootGroupId.
 */
export function getSubtreeIds(rootGroupId, groups) {
  const ids = new Set([rootGroupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of groups) {
      if (g.parent_group_id && ids.has(g.parent_group_id) && !ids.has(g.id)) {
        ids.add(g.id);
        changed = true;
      }
    }
  }
  return ids;
}

/**
 * Get the root group ID for a given group (walks up parent chain).
 */
export function getRootGroupId(groupId, groupsById) {
  let current = groupId;
  const visited = new Set();
  while (current) {
    const group = groupsById instanceof Map ? groupsById.get(current) : groupsById[current];
    if (!group) return current;
    if (!group.parent_group_id) return current;
    if (visited.has(current)) return current; // cycle guard
    visited.add(current);
    current = group.parent_group_id;
  }
  return groupId;
}

/**
 * Build a flat list of groups with hierarchy labels for dropdowns.
 * Returns: [{ id, name, label, depth, parentId, vendorType }]
 * label example: "Finishing / Chrome Plating"
 */
export function buildHierarchicalOptions(groups, vendorType = null) {
  const filtered = vendorType
    ? groups.filter(g => g.vendor_type === vendorType)
    : groups;

  const byId = new Map(filtered.map(g => [g.id, g]));
  const roots = filtered.filter(g => !g.parent_group_id || !byId.has(g.parent_group_id));
  const childrenOf = new Map();
  for (const g of filtered) {
    if (g.parent_group_id && byId.has(g.parent_group_id)) {
      if (!childrenOf.has(g.parent_group_id)) childrenOf.set(g.parent_group_id, []);
      childrenOf.get(g.parent_group_id).push(g);
    }
  }

  // Sort by priority
  const sortFn = (a, b) => (a.sort_priority || 0) - (b.sort_priority || 0);
  roots.sort(sortFn);
  for (const [, children] of childrenOf) children.sort(sortFn);

  const result = [];
  function walk(group, depth, pathPrefix) {
    const label = pathPrefix ? `${pathPrefix} / ${group.name}` : group.name;
    result.push({
      id: group.id,
      name: group.name,
      label,
      depth,
      parentId: group.parent_group_id || null,
      vendorType: group.vendor_type,
      isRoot: depth === 0,
    });
    const children = childrenOf.get(group.id) || [];
    for (const child of children) {
      walk(child, depth + 1, group.name);
    }
  }

  for (const root of roots) walk(root, 0, "");
  return result;
}

/**
 * Filter vendors that belong to a service's group subtree.
 * vendors: ServiceVendor[]
 * serviceGroupId: string (the service's group — can be root or child)
 * allGroups: VendorGroup[]
 * Returns: ServiceVendor[] — vendors whose group is serviceGroupId or any descendant
 */
export function filterVendorsForServiceGroup(vendors, serviceGroupId, allGroups) {
  if (!serviceGroupId) return [];
  const subtreeIds = getSubtreeIds(serviceGroupId, allGroups);
  return vendors.filter(v => v.vendor_group_id && subtreeIds.has(v.vendor_group_id));
}

/**
 * Build the full path string for a group: "Finishing / Chrome Plating"
 * Returns just the group name if it's a root group.
 */
export function buildGroupPath(groupId, groupsById) {
  if (!groupId) return "";
  const parts = [];
  let current = groupId;
  const visited = new Set();
  while (current) {
    if (visited.has(current)) break;
    visited.add(current);
    const group = groupsById instanceof Map ? groupsById.get(current) : groupsById[current];
    if (!group) break;
    parts.unshift(group.name);
    current = group.parent_group_id || null;
  }
  return parts.join(" / ");
}

/**
 * Format a service label showing the service name with its full group path context.
 * Example: "Chrome Plating (Finishing / Chrome Plating)"
 * If the service is on a root group: "UPS Ground (Shipping)"
 */
export function formatServiceLabel(service, groupsById) {
  if (!service) return "";
  const groupId = service.preferred_vendor_group_id;
  if (!groupId) return service.name || "";
  const path = buildGroupPath(groupId, groupsById);
  return path ? `${service.name} (${path})` : service.name;
}

/**
 * Format a vendor group label as its full hierarchy path.
 * Example: "Finishing / Chrome Plating"
 */
export function formatVendorGroupLabel(groupId, groupsById) {
  return buildGroupPath(groupId, groupsById);
}

/**
 * Build a hierarchical tree of vendor groups with services nested under each group.
 * Returns a flat list of entries suitable for rendering grouped dropdowns.
 * 
 * Each entry: { type: 'group'|'service', group, service, depth, groupPath }
 * - type='group': a group header row
 * - type='service': a service item nested under a group
 */
export function buildHierarchicalServiceOptions(services, groups, vendorType = "SERVICE") {
  const filtered = groups.filter(g => g.vendor_type === vendorType && g.is_active !== false);
  const byId = new Map(filtered.map(g => [g.id, g]));
  
  // Index services by their group
  const servicesByGroup = new Map();
  for (const svc of services) {
    const gid = svc.preferred_vendor_group_id;
    if (!gid || !byId.has(gid)) continue;
    if (!servicesByGroup.has(gid)) servicesByGroup.set(gid, []);
    servicesByGroup.get(gid).push(svc);
  }
  
  // Build tree
  const roots = filtered.filter(g => !g.parent_group_id || !byId.has(g.parent_group_id));
  const childrenOf = new Map();
  for (const g of filtered) {
    if (g.parent_group_id && byId.has(g.parent_group_id)) {
      if (!childrenOf.has(g.parent_group_id)) childrenOf.set(g.parent_group_id, []);
      childrenOf.get(g.parent_group_id).push(g);
    }
  }
  
  const sortFn = (a, b) => (a.sort_priority || 0) - (b.sort_priority || 0);
  roots.sort(sortFn);
  for (const [, ch] of childrenOf) ch.sort(sortFn);
  
  const result = [];
  function walk(group, depth, pathPrefix) {
    const groupPath = pathPrefix ? `${pathPrefix} / ${group.name}` : group.name;
    const groupServices = servicesByGroup.get(group.id) || [];
    const children = childrenOf.get(group.id) || [];
    
    // Only emit group header if it has services or children with services
    const hasContent = groupServices.length > 0 || children.some(ch => {
      const chSvcs = servicesByGroup.get(ch.id) || [];
      return chSvcs.length > 0 || (childrenOf.get(ch.id) || []).length > 0;
    });
    
    if (hasContent || groupServices.length > 0) {
      result.push({ type: 'group', group, depth, groupPath });
      for (const svc of groupServices) {
        result.push({ type: 'service', service: svc, group, depth: depth + 1, groupPath });
      }
    }
    
    for (const child of children) {
      walk(child, depth + 1, groupPath);
    }
  }
  
  for (const root of roots) walk(root, 0, "");
  return result;
}