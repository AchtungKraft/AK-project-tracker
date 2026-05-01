import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = 'ak:lastUsedProjects';
const MAX_ITEMS = 5;

/**
 * Read last-used entries from localStorage.
 * Returns array of { id: string, timestamp: number } sorted by most recent first.
 * Safe against corrupted data — always returns a clean array.
 */
function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Validate shape, deduplicate by id (keep first = most recent after sort)
    const seen = new Set();
    return parsed
      .filter(e => {
        if (!e || typeof e.id !== 'string' || typeof e.timestamp !== 'number') return false;
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

/**
 * Write entries back to localStorage.
 */
function writeRaw(entries) {
  try {
    // Only store { id, timestamp } — never full project objects
    const clean = entries.map(e => ({ id: e.id, timestamp: e.timestamp }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/**
 * Record a project selection — moves to top, deduplicates, limits to 5.
 */
export function recordProjectUsage(projectId) {
  if (!projectId || typeof projectId !== 'string') return;
  const existing = readRaw().filter(e => e.id !== projectId);
  const updated = [{ id: projectId, timestamp: Date.now() }, ...existing].slice(0, MAX_ITEMS);
  writeRaw(updated);
}

/**
 * Get last-used entries, optionally filtering to only IDs that exist in validIds set.
 * Used by components to prune deleted projects on read.
 */
export function getLastUsedEntries(validIds) {
  const entries = readRaw();
  if (!validIds) return entries;

  const filtered = entries.filter(e => validIds.has(e.id));
  // If we pruned any, persist the cleanup
  if (filtered.length < entries.length) {
    writeRaw(filtered);
  }
  return filtered;
}

/**
 * React hook for last-used projects with automatic cross-tab sync.
 * Returns [entries, refresh] where entries = [{ id, timestamp }].
 *
 * @param {Set<string>|null} validProjectIds — if provided, prunes stale IDs on read
 */
export function useLastUsedProjects(validProjectIds) {
  const [entries, setEntries] = useState(() => getLastUsedEntries(validProjectIds));

  // Re-derive when validProjectIds changes (new project data loaded)
  useEffect(() => {
    setEntries(getLastUsedEntries(validProjectIds));
  }, [validProjectIds]);

  // Cross-tab sync via storage event
  useEffect(() => {
    const handler = (e) => {
      if (e.key === STORAGE_KEY) {
        setEntries(getLastUsedEntries(validProjectIds));
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [validProjectIds]);

  const record = useCallback((projectId) => {
    recordProjectUsage(projectId);
    // Immediately update local state so UI reflects the change
    setEntries(getLastUsedEntries(validProjectIds));
  }, [validProjectIds]);

  return { entries, record };
}