import { useState, useEffect, useCallback, useMemo } from 'react';

// SHARED storage key for project type/status filters (synced across pages)
const SHARED_FILTER_KEY = 'ak_shared_filters';
// Page-specific storage key for page-only settings (viewMode, groupBy, tab)
const PAGE_STORAGE_PREFIX = 'ak_page_';

/**
 * Shared hook for sticky filter state across Dashboard, PriorityDashboard, ClientPortalHub
 * 
 * SHARED filters (synced across all pages): selectedTypes, statusFilter
 * PAGE-SPECIFIC filters: viewMode, groupBy, tab
 * 
 * @param {string} pageKey - Unique key for the page ('dashboard', 'priority', 'clientportal')
 * @param {Object} defaultFilters - Default filter values
 */
export function useFilterState(pageKey, defaultFilters = {}) {
  const pageStorageKey = `${PAGE_STORAGE_PREFIX}${pageKey}`;
  
  // Keys that are shared across all pages
  const sharedKeys = ['selectedTypes', 'statusFilter', 'assignedTo'];
  
  // Initialize state from shared storage + page storage + URL params
  const [filters, setFiltersInternal] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Load shared filters (selectedTypes, statusFilter)
    const sharedStored = localStorage.getItem(SHARED_FILTER_KEY);
    const parsedShared = sharedStored ? JSON.parse(sharedStored) : {};
    
    // Load page-specific filters (viewMode, groupBy, tab)
    const pageStored = localStorage.getItem(pageStorageKey);
    const parsedPage = pageStored ? JSON.parse(pageStored) : {};
    
    const result = { ...defaultFilters };
    
    // Apply shared stored values
    sharedKeys.forEach(key => {
      if (key in defaultFilters && parsedShared[key] !== undefined) {
        result[key] = parsedShared[key];
      }
    });
    
    // Apply page-specific stored values
    Object.keys(defaultFilters).forEach(key => {
      if (!sharedKeys.includes(key) && parsedPage[key] !== undefined) {
        result[key] = parsedPage[key];
      }
    });
    
    // URL params take precedence over localStorage
    Object.keys(defaultFilters).forEach(key => {
      const urlValue = urlParams.get(key);
      if (urlValue !== null) {
        if (Array.isArray(defaultFilters[key])) {
          result[key] = urlValue ? urlValue.split(',').filter(Boolean) : [];
        } else {
          result[key] = urlValue;
        }
      }
    });
    
    return result;
  });

  // Sync filters to storage (shared + page-specific)
  const syncToStorage = useCallback((newFilters) => {
    // Separate shared vs page-specific
    const sharedFilters = {};
    const pageFilters = {};
    
    Object.entries(newFilters).forEach(([key, value]) => {
      if (sharedKeys.includes(key)) {
        sharedFilters[key] = value;
      } else {
        pageFilters[key] = value;
      }
    });
    
    // Save shared filters (available to all pages)
    localStorage.setItem(SHARED_FILTER_KEY, JSON.stringify(sharedFilters));
    
    // Save page-specific filters
    localStorage.setItem(pageStorageKey, JSON.stringify(pageFilters));
    
    // Update URL without triggering navigation
    const url = new URL(window.location.href);
    
    Object.entries(newFilters).forEach(([key, value]) => {
      const isDefault = Array.isArray(value) 
        ? value.length === 0 
        : value === defaultFilters[key];
      
      if (isDefault) {
        url.searchParams.delete(key);
      } else {
        const serialized = Array.isArray(value) ? value.join(',') : value;
        url.searchParams.set(key, serialized);
      }
    });
    
    window.history.replaceState({}, '', url.toString());
  }, [pageStorageKey, defaultFilters]);

  // Main setter function
  const setFilters = useCallback((updater) => {
    setFiltersInternal(prev => {
      const newFilters = typeof updater === 'function' ? updater(prev) : updater;
      queueMicrotask(() => syncToStorage(newFilters));
      return newFilters;
    });
  }, [syncToStorage]);

  // Individual filter setter
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

  // Check if any filters are active
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
  assignedTo: [],
  groupBy: 'projectType',
  viewMode: 'list',
};

export const PRIORITY_DEFAULTS = {
  selectedTypes: [],
  statusFilter: 'all',
  assignedTo: [],
};

export const CLIENT_PORTAL_DEFAULTS = {
  selectedTypes: [],
  statusFilter: 'all',
  assignedTo: [],
  viewMode: 'cards',
  tab: 'awaiting',
};