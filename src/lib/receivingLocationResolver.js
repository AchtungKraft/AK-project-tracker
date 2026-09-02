/**
 * Receiving Location Resolver — Phase 4 Storage V2
 *
 * Finds the canonical RECEIVING location from a list of Location entities.
 * Strategies (in order): location_type='receiving', short_code='RCV', name contains 'receiving'.
 */
export function findReceivingLocation(locations) {
  if (!locations || locations.length === 0) return null;
  const active = locations.filter(l => l.active !== false);

  // 1. Exact type match
  const byType = active.find(l => l.location_type === 'receiving');
  if (byType) return byType;

  // 2. Short code
  const byCode = active.find(l => l.short_code?.toUpperCase() === 'RCV');
  if (byCode) return byCode;

  // 3. Name heuristic
  const byName = active.find(l => l.location_area?.toLowerCase().includes('receiving'));
  if (byName) return byName;

  return null;
}

export function getReceivingLocationId(locations) {
  return findReceivingLocation(locations)?.id || null;
}