/**
 * useSupplyStateVersion — STEP 4: Cache versioning for supply state
 * 
 * Provides a monotonically increasing version counter that gets incremented
 * after every supply mutation. All supply read model queries subscribe to
 * this version, preventing stale cross-view hydration.
 * 
 * Usage:
 *   const { version, bumpVersion } = useSupplyStateVersion();
 *   // Include `version` in query keys → auto-refetch on mutation
 *   // Call `bumpVersion()` after any supply mutation succeeds
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// Global version state (shared across all hook instances)
let globalVersion = 0;
const listeners = new Set();

function notifyAll() {
  for (const fn of listeners) fn(globalVersion);
}

/**
 * Bump the global supply state version.
 * Call after: commitment mutation, PO mutation, receive, install, stock reservation.
 */
export function bumpSupplyStateVersion(source = 'unknown') {
  globalVersion++;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('supplyStateVersion', String(globalVersion));
      sessionStorage.setItem('supplyStateVersionSource', source);
      sessionStorage.setItem('supplyStateVersionAt', new Date().toISOString());
    } catch (_e) { /* SSR or storage full */ }
  }
  console.log(`[SUPPLY_STATE] Version bumped to ${globalVersion} by ${source}`);
  notifyAll();
}

/**
 * Read current version (non-reactive, for one-off checks).
 */
export function getSupplyStateVersion() {
  return globalVersion;
}

/**
 * React hook — subscribes to version changes.
 */
export function useSupplyStateVersion() {
  const [version, setVersion] = useState(globalVersion);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Initialize from session storage if page was refreshed
    try {
      const stored = sessionStorage.getItem('supplyStateVersion');
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (parsed > globalVersion) {
          globalVersion = parsed;
          setVersion(parsed);
        }
      }
    } catch (_e) { /* ignore */ }

    const handler = (v) => {
      if (mountedRef.current) setVersion(v);
    };
    listeners.add(handler);
    return () => {
      mountedRef.current = false;
      listeners.delete(handler);
    };
  }, []);

  const bumpVersion = useCallback((source = 'unknown') => {
    bumpSupplyStateVersion(source);
  }, []);

  return { version, bumpVersion };
}