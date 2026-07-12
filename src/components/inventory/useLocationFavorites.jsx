import { useState, useCallback, useEffect } from "react";

const FAVORITES_KEY = 'ak_location_favorites';
const RECENTS_KEY = 'ak_location_recents';
const MAX_RECENTS = 10;

/**
 * Hook for managing location favorites and recently viewed locations.
 * Per-browser (localStorage). Provides fast access to frequently used locations.
 */
export default function useLocationFavorites() {
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []; }
    catch { return []; }
  });

  const [recents, setRecents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENTS_KEY)) || []; }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  }, [recents]);

  const toggleFavorite = useCallback((locationId) => {
    setFavorites(prev =>
      prev.includes(locationId)
        ? prev.filter(id => id !== locationId)
        : [...prev, locationId]
    );
  }, []);

  const isFavorite = useCallback((locationId) => {
    return favorites.includes(locationId);
  }, [favorites]);

  const addRecent = useCallback((locationId) => {
    if (!locationId || locationId === 'unassigned') return;
    setRecents(prev => {
      const filtered = prev.filter(id => id !== locationId);
      return [locationId, ...filtered].slice(0, MAX_RECENTS);
    });
  }, []);

  return { favorites, recents, toggleFavorite, isFavorite, addRecent };
}