import { useState, useEffect, useCallback, useMemo } from 'react';

const STORAGE_KEY_PREFIX = 'ak_filter_';

/**
 * Shared hook for sticky filter state across Dashboard, PriorityDashboard, ClientPortalHub
 * 
 * Single source of truth for filter state with:
 * - URL query parameter sync (primary - enables sharing/bookmarking)
 * - localStorage persistence (fallback when no URL params)
 * - Consistent behavior across mobile/desktop
 * 
 * @param {string} pageKey - Unique key for the page ('dashboard', 'priority', 'clientportal')
 * @param {Object} defaultFilters - Default filter values
 */
export function useFilterState(pageKey, defaultFilters = {}) {
  const storageKey = `${STORAGE_KEY_PREFIX}${pageKey}`;
  
  // Initialize state from URL params first, then localStorage, then defaults
  const [filters, setFiltersInternal] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const stored = localStorage.getItem(storageKey);
    const parsedStored = stored ? JSON.parse(stored) : {};
    
    const result = { ...defaultFilters };
    
    // Apply stored values first (fallback)
    Object.keys(defaultFilters).forEach(key => {
      if (parsedStored[key] !== undefined) {
        result[key] = parsedStored[key];
      }
    });
    
    // URL params take precedence over localStorage
    Object.keys(defaultFilters).forEach(key => {
      const urlValue = urlParams.get(key);
      if (urlValue !== null) {
        // Parse arrays from URL (comma-separated)
        if (Array.isArray(defaultFilters[key])) {
          result[key] = urlValue ? urlValue.split(',').filter(Boolean) : [];
        } else {
          result[key] = urlValue;
        }
      }
    });
    
    return result;
  });

  // Sync filters to both localStorage and URL
  const syncToStorage = useCallback((newFilters) => {
    // Save to localStorage
    localStorage.setItem(storageKey, JSON.stringify(newFilters));
    
    // Update URL without triggering navigation
    const url = new URL(window.location.href);
    
    Object.entries(newFilters).forEach(([key, value]) => {
      // Skip if value equals default
      const isDefault = Array.isArray(value) 
        ? value.length === 0 
        : value === defaultFilters[key];
      
      if (isDefault) {
        url.searchParams.delete(key);
      } else {
        // Serialize arrays as comma-separated
        const serialized = Array.isArray(value) ? value.join(',') : value;
        url.searchParams.set(key, serialized);
      }
    });
    
    // Use replaceState to update URL without adding history entry
    window.history.replaceState({}, '', url.toString());
  }, [storageKey, defaultFilters]);

  // Main setter function - always syncs state + storage + URL
  const setFilters = useCallback((updater) => {
    setFiltersInternal(prev => {
      const newFilters = typeof updater === 'function' ? updater(prev) : updater;
      // Sync asynchronously to avoid render-during-render
      queueMicrotask(() => syncToStorage(newFilters));
      return newFilters;
    });
  }, [syncToStorage]);

  // Individual filter setters for convenience
  const setFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, [setFilters]);

  // Clear all filters to defaults
  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, [setFilters, defaultFilters]);

  // Apply a saved view's filters
  const applyView = useCallback((view) => {
    if (!view) return;
    setFilters(prev => ({
      ...prev,
      selectedTypes: view.selectedTypes || [],
      statusFilter: view.statusFilter || 'all',
    }));
  }, [setFilters]);

  // Check if any filters are active (non-default)
  const hasActiveFilters = useMemo(() => {
    return Object.entries(filters).some(([key, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== defaultFilters[key];
    });
  }, [filters, defaultFilters]);

  return {
    filters,
    setFilters,
    setFilter,
    clearFilters,
    applyView,
    hasActiveFilters,
  };
}

/**
 * Preset configurations for each page
 */
export const DASHBOARD_DEFAULTS = {
  selectedTypes: [],
  statusFilter: 'all',
  groupBy: 'projectType',
  viewMode: 'list',
};

export const PRIORITY_DEFAULTS = {
  selectedTypes: [],
  statusFilter: 'all',
};

export const CLIENT_PORTAL_DEFAULTS = {
  selectedTypes: [],
  statusFilter: 'all',
  viewMode: 'cards',
  tab: 'awaiting',
};