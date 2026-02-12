import { useState, useCallback } from 'react';

/**
 * useTaskViewMode - Global task view mode state
 * 
 * Handles:
 * - card vs calendar view mode
 * - persistence to localStorage
 * - shared between dashboards
 */

const VIEW_MODES = {
  CARD: 'card-view',
  CALENDAR: 'calendar-view',
  KANBAN: 'kanban-view',
};

/**
 * Get the storage key for a given context
 */
const getStorageKey = (context) => {
  return `task_view_mode_${context}`;
};

/**
 * Hook for managing task view mode with persistence
 */
export function useTaskViewMode(context = 'default', defaultMode = VIEW_MODES.CALENDAR) {
  const storageKey = getStorageKey(context);
  
  const [viewMode, setViewModeState] = useState(() => {
    if (typeof window === 'undefined') return defaultMode;
    return localStorage.getItem(storageKey) || defaultMode;
  });

  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
    localStorage.setItem(storageKey, mode);
  }, [storageKey]);

  const isCardView = viewMode === VIEW_MODES.CARD;
  const isCalendarView = viewMode === VIEW_MODES.CALENDAR;
  const isKanbanView = viewMode === VIEW_MODES.KANBAN;

  return {
    viewMode,
    setViewMode,
    isCardView,
    isCalendarView,
    isKanbanView,
    VIEW_MODES,
  };
}

export { VIEW_MODES };
export default useTaskViewMode;