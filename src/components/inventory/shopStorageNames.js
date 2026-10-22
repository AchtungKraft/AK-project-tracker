/** Display-only labels for legacy/system storage records. Never change persisted IDs or location_area. */
export function shopStorageName(name) {
  if (name === 'UNASSIGNED_SYSTEM') return 'Unassigned Stock';
  if (name === 'unassigned') return 'No Location Set';
  return name || 'Unknown location';
}
