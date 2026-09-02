/**
 * PROJECT STORAGE RESOLVER — Storage Platform V2 Phase 5
 *
 * Canonical utility for computing project-associated physical inventory.
 *
 * PROJECT INVENTORY is derived through:
 *   1. Location.project_id — locations assigned to the project
 *   2. StorageContainer.project_id — containers assigned to the project
 *
 * ANTI-DOUBLE-COUNTING:
 *   An InventoryItem inside a project container that ALSO sits at a project
 *   location is counted ONCE via the container path (container wins).
 *
 * STAGED definition: physical inventory currently located in a Location or
 * StorageContainer associated with that project. Does NOT imply reserved,
 * installed, or consumed.
 */

/**
 * Collect all Location IDs associated with a project.
 */
export function getProjectLocationIds(projectId, locations) {
  return new Set(
    locations
      .filter(l => l.project_id === projectId && l.active !== false)
      .map(l => l.id)
  );
}

/**
 * Collect all Container IDs associated with a project.
 */
export function getProjectContainerIds(projectId, containers) {
  return new Set(
    containers
      .filter(c => c.project_id === projectId && c.active !== false && c.status !== 'archived')
      .map(c => c.id)
  );
}

/**
 * Resolve all inventory physically in project storage.
 * Returns { items, summary } with anti-double-counting.
 *
 * @param {string} projectId
 * @param {Object} data - { locations, containers, inventoryItems, parts, commitments, reservations }
 * @returns {{ items: Array, summary: Object, projectLocations: Array, projectContainers: Array }}
 */
export function resolveProjectInventory(projectId, { locations, containers, inventoryItems, parts, commitments, reservations }) {
  const projLocationIds = getProjectLocationIds(projectId, locations);
  const projContainerIds = getProjectContainerIds(projectId, containers);

  const projectLocations = locations
    .filter(l => projLocationIds.has(l.id))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const projectContainers = containers
    .filter(c => projContainerIds.has(c.id));

  // Build part lookup
  const partsMap = new Map(parts.map(p => [p.id, p]));

  // Track items already counted via container to prevent double-counting
  const countedItemIds = new Set();
  const resultItems = [];

  // Pass 1: Items in project containers (container wins)
  for (const item of inventoryItems) {
    if ((item.quantity_on_hand || 0) <= 0) continue;
    if (item.container_id && projContainerIds.has(item.container_id)) {
      countedItemIds.add(item.id);
      const ctr = containers.find(c => c.id === item.container_id);
      resultItems.push({
        inventoryItem: item,
        part: partsMap.get(item.part_id) || null,
        source: 'container',
        container: ctr || null,
        location: locations.find(l => l.id === (ctr?.location_id || item.location_id)) || null,
      });
    }
  }

  // Pass 2: Items at project locations (NOT already counted via container)
  for (const item of inventoryItems) {
    if ((item.quantity_on_hand || 0) <= 0) continue;
    if (countedItemIds.has(item.id)) continue;
    if (item.location_id && projLocationIds.has(item.location_id)) {
      countedItemIds.add(item.id);
      resultItems.push({
        inventoryItem: item,
        part: partsMap.get(item.part_id) || null,
        source: 'location',
        container: item.container_id ? containers.find(c => c.id === item.container_id) : null,
        location: locations.find(l => l.id === item.location_id) || null,
      });
    }
  }

  // Summary
  const uniquePartIds = new Set(resultItems.map(i => i.inventoryItem.part_id));
  const totalQty = resultItems.reduce((s, i) => s + (i.inventoryItem.quantity_on_hand || 0), 0);
  const totalReserved = resultItems.reduce((s, i) => s + (i.inventoryItem.quantity_reserved || 0), 0);

  // Commitment context for this project
  const projectCommitments = (commitments || []).filter(
    c => c.project_id === projectId && !['cancelled', 'closed'].includes(c.commitment_status)
  );

  const summary = {
    locationCount: projectLocations.length,
    containerCount: projectContainers.length,
    inventoryLines: resultItems.length,
    uniqueParts: uniquePartIds.size,
    totalQty,
    totalReserved,
    commitmentCount: projectCommitments.length,
  };

  return { items: resultItems, summary, projectLocations, projectContainers };
}

/**
 * Check for project association conflict.
 * Returns a warning string if the destination belongs to a different project.
 */
export function checkProjectConflict(destinationEntity, sourceProjectId, projects) {
  const destProjectId = destinationEntity.project_id;
  if (!destProjectId || destProjectId === sourceProjectId) return null;

  const destProject = projects?.find(p => p.id === destProjectId);
  return destProject
    ? `This belongs to another project: ${destProject.name}`
    : 'This belongs to a different project';
}