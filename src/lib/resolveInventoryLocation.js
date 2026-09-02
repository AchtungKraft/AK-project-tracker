/**
 * CANONICAL INVENTORY LOCATION RESOLVER — Storage Platform V2 Phase 1
 *
 * RULE:
 *   IF InventoryItem.container_id IS SET:
 *     authoritative physical location = StorageContainer.location_id → Location hierarchy
 *   IF InventoryItem.container_id IS NOT SET:
 *     authoritative physical location = InventoryItem.location_id → Location hierarchy
 *
 * COMPATIBILITY NOTE (Phase 1):
 *   InventoryItem.location_id is kept SYNCHRONIZED with StorageContainer.location_id
 *   as a denormalized compatibility field. This resolver still treats container_id as
 *   authoritative when present, so consumers that adopt this resolver are future-proof
 *   for when the sync is eventually removed.
 *
 * ALL Storage V2 surfaces MUST use this resolver. Individual components must NOT
 * independently decide whether InventoryItem.location_id or StorageContainer.location_id wins.
 */

import { buildLocationPath, buildLocationPathString } from "@/components/inventory/locationTypeConfig";

/**
 * Resolve the effective physical location of an InventoryItem.
 *
 * @param {Object} item - InventoryItem record
 * @param {Object} options
 * @param {Map|Object} options.containersMap - Map<id, StorageContainer> or plain object
 * @param {Array} options.locations - Array of Location records
 * @returns {Object} Normalized location result
 */
export function resolveInventoryLocation(item, { containersMap, locations }) {
  if (!item) return null;

  let effectiveLocationId = item.location_id || null;
  let container = null;
  let containerResolved = false;

  // Container takes authority when present
  if (item.container_id) {
    container = containersMap instanceof Map
      ? containersMap.get(item.container_id)
      : containersMap?.[item.container_id];

    if (container?.location_id) {
      effectiveLocationId = container.location_id;
      containerResolved = true;
    }
  }

  const location = effectiveLocationId
    ? locations.find(l => l.id === effectiveLocationId)
    : null;

  const breadcrumb = effectiveLocationId
    ? buildLocationPath(effectiveLocationId, locations)
    : [];

  const breadcrumbString = effectiveLocationId
    ? buildLocationPathString(effectiveLocationId, locations)
    : '';

  return {
    // IDs
    location_id: effectiveLocationId,
    container_id: item.container_id || null,

    // Resolved records
    location,
    container,

    // Display
    breadcrumb,
    breadcrumb_string: breadcrumbString,

    // Context
    project_id: container?.project_id || location?.project_id || null,
    is_project_storage: location?.is_project_storage || false,

    // Resolution metadata
    resolved_via: containerResolved ? 'container' : 'direct',
  };
}

/**
 * Build a containersMap from an array of StorageContainer records.
 * Use this to avoid repeated .find() calls in list renders.
 */
export function buildContainersMap(containers) {
  const map = new Map();
  for (const c of containers) {
    map.set(c.id, c);
  }
  return map;
}

/**
 * Resolve effective location for a StorageContainer itself.
 * Used when displaying "where is this container?"
 */
export function resolveContainerLocation(container, { locations }) {
  if (!container) return null;

  const location = container.location_id
    ? locations.find(l => l.id === container.location_id)
    : null;

  const breadcrumb = container.location_id
    ? buildLocationPath(container.location_id, locations)
    : [];

  const breadcrumbString = container.location_id
    ? buildLocationPathString(container.location_id, locations)
    : '';

  return {
    location_id: container.location_id || null,
    location,
    breadcrumb,
    breadcrumb_string: breadcrumbString,
    project_id: container.project_id || location?.project_id || null,
    is_project_storage: location?.is_project_storage || false,
  };
}