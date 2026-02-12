import { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from './useIsMobile';

/**
 * useCategoryExpansion
 * Persists expanded category state to localStorage on mobile.
 * Desktop: No persistence.
 * 
 * @param {string} storageKey - Unique key for localStorage
 * @param {string[]} defaultExpanded - Categories expanded by default
 */
export function useCategoryExpansion(storageKey, defaultExpanded = []) {
  const isMobile = useIsMobile();
  
  const [expandedCategories, setExpandedCategories] = useState(() => {
    if (typeof window === 'undefined') return new Set(defaultExpanded);
    
    try {
      const stored = localStorage.getItem(`mobile_expanded_${storageKey}`);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to load expansion state:', e);
    }
    
    return new Set(defaultExpanded);
  });

  // Persist to localStorage on mobile
  useEffect(() => {
    if (!isMobile) return;
    
    try {
      localStorage.setItem(
        `mobile_expanded_${storageKey}`, 
        JSON.stringify([...expandedCategories])
      );
    } catch (e) {
      console.warn('Failed to save expansion state:', e);
    }
  }, [expandedCategories, storageKey, isMobile]);

  const toggleCategory = useCallback((categoryId) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const expandCategory = useCallback((categoryId) => {
    setExpandedCategories(prev => new Set([...prev, categoryId]));
  }, []);

  const collapseCategory = useCallback((categoryId) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.delete(categoryId);
      return next;
    });
  }, []);

  const expandAll = useCallback((categoryIds) => {
    setExpandedCategories(new Set(categoryIds));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedCategories(new Set());
  }, []);

  const isExpanded = useCallback((categoryId) => {
    return expandedCategories.has(categoryId);
  }, [expandedCategories]);

  return {
    expandedCategories,
    toggleCategory,
    expandCategory,
    collapseCategory,
    expandAll,
    collapseAll,
    isExpanded,
  };
}

export default useCategoryExpansion;