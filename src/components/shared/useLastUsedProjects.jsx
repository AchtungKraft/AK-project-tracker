const STORAGE_KEY = 'ak:lastUsedProjects';
const MAX_ITEMS = 5;

/**
 * Read last-used project IDs from localStorage.
 * Returns array of { id, timestamp } sorted by most recent first.
 */
export function getLastUsedProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(e => e?.id && e?.timestamp)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

/**
 * Record a project selection — moves to top, deduplicates, limits to 5.
 */
export function recordProjectUsage(projectId) {
  if (!projectId) return;
  const existing = getLastUsedProjects().filter(e => e.id !== projectId);
  const updated = [{ id: projectId, timestamp: Date.now() }, ...existing].slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}