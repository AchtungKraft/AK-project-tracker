import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Default view that shows all projects
const DEFAULT_VIEW = {
  name: 'All Projects',
  selectedTypes: [],
  statusFilter: 'all',
  isDefault: true
};

/**
 * Hook for managing saved project views across Dashboard, PriorityDashboard, and ClientPortalHub
 * Views are stored in database and shared with all Achtung Kraft users
 */
export function useSavedProjectViews(viewType = 'projects') {
  const queryClient = useQueryClient();
  
  const [activeViewName, setActiveViewName] = useState(() => {
    return localStorage.getItem('active_project_view') || 'All Projects';
  });

  // Fetch shared views from database
  const { data: dbViews = [] } = useQuery({
    queryKey: ['savedViews', viewType],
    queryFn: async () => {
      const views = await base44.entities.SavedView.filter({ view_type: viewType });
      return views.map(v => ({
        id: v.id,
        name: v.view_name,
        selectedTypes: v.selected_types || [],
        statusFilter: v.status_filter || 'all',
        isShared: v.is_shared,
        sortOrder: v.sort_order || 0
      }));
    }
  });

  // Combine default view with database views
  const savedViews = [DEFAULT_VIEW, ...dbViews.sort((a, b) => a.sortOrder - b.sortOrder)];

  // Persist active view name to localStorage (per-user preference)
  useEffect(() => {
    localStorage.setItem('active_project_view', activeViewName);
  }, [activeViewName]);

  // Get the active view's filter state
  const activeView = savedViews.find(v => v.name === activeViewName) || DEFAULT_VIEW;

  // Save a new view
  const saveView = useCallback((name, selectedTypes, statusFilter) => {
    if (!name || name.trim() === '') return false;
    
    const trimmedName = name.trim();
    
    // Check if view with this name already exists (and isn't default)
    const existingIndex = savedViews.findIndex(v => v.name === trimmedName && !v.isDefault);
    
    if (existingIndex >= 0) {
      // Update existing view
      setSavedViews(prev => prev.map((v, i) => 
        i === existingIndex ? { ...v, selectedTypes, statusFilter } : v
      ));
    } else {
      // Add new view
      setSavedViews(prev => [...prev, { name: trimmedName, selectedTypes, statusFilter }]);
    }
    
    setActiveViewName(trimmedName);
    return true;
  }, [savedViews]);

  // Delete a view
  const deleteView = useCallback((name) => {
    // Cannot delete default view
    const view = savedViews.find(v => v.name === name);
    if (view?.isDefault) return false;
    
    setSavedViews(prev => prev.filter(v => v.name !== name));
    
    // If deleting active view, switch to default
    if (activeViewName === name) {
      setActiveViewName('All Projects');
    }
    
    return true;
  }, [savedViews, activeViewName]);

  // Rename a view
  const renameView = useCallback((oldName, newName) => {
    if (!newName || newName.trim() === '') return false;
    
    const view = savedViews.find(v => v.name === oldName);
    if (view?.isDefault) return false;
    
    const trimmedName = newName.trim();
    
    // Check if new name already exists
    if (savedViews.some(v => v.name === trimmedName)) return false;
    
    setSavedViews(prev => prev.map(v => 
      v.name === oldName ? { ...v, name: trimmedName } : v
    ));
    
    if (activeViewName === oldName) {
      setActiveViewName(trimmedName);
    }
    
    return true;
  }, [savedViews, activeViewName]);

  // Select a view
  const selectView = useCallback((name) => {
    const view = savedViews.find(v => v.name === name);
    if (view) {
      setActiveViewName(name);
      return view;
    }
    return null;
  }, [savedViews]);

  return {
    savedViews,
    activeViewName,
    activeView,
    saveView,
    deleteView,
    renameView,
    selectView,
  };
}