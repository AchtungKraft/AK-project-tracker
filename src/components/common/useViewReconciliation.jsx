import { useEffect, useRef } from 'react';

/**
 * Reconciles the saved-view label with the actual filter state on mount.
 *
 * Problem: `active_project_view` (localStorage) and `ak_shared_filters`
 * (localStorage) are two independent stores. The view name can say
 * "ALL CLIENT" while the filter values are empty or stale — so the UI
 * shows the right label but the data is unfiltered.
 *
 * Solution: once the SavedView DB query resolves (savedViews includes
 * non-default entries), compare the active view's selectedTypes with the
 * current filter state. If they differ, apply the view's filters.
 * Runs exactly once per mount (guarded by a ref).
 *
 * @param {Object} params
 * @param {Array}  params.savedViews      - from useSavedProjectViews
 * @param {string} params.activeViewName  - from useSavedProjectViews
 * @param {Object} params.filters         - from useFilterState
 * @param {Function} params.applyView     - from useFilterState
 */
export function useViewReconciliation({ savedViews, activeViewName, filters, applyView }) {
  const reconciledRef = useRef(false);

  useEffect(() => {
    // Only reconcile once per component mount
    if (reconciledRef.current) return;

    // "All Projects" means selectedTypes=[] — which is the default.
    if (activeViewName === 'All Projects') {
      if (filters.selectedTypes && filters.selectedTypes.length > 0) {
        applyView({ selectedTypes: [], statusFilter: filters.statusFilter || 'all' });
      }
      reconciledRef.current = true;
      return;
    }

    // Active view is not "All Projects" — find it in savedViews
    const view = savedViews.find(v => v.name === activeViewName);
    if (!view) {
      // savedViews hasn't loaded from DB yet (only the default entry).
      // Once DB views arrive savedViews.length > 1, so if the view is
      // still missing the name was deleted — fall back.
      if (savedViews.length > 1) {
        applyView({ selectedTypes: [], statusFilter: 'all' });
        reconciledRef.current = true;
      }
      // Don't set reconciledRef — wait for the DB query to populate savedViews
      return;
    }

    // View found — always apply its canonical filters on mount.
    // This fixes the split-brain where localStorage selectedTypes is stale.
    // We compare first to avoid a no-op re-render when already in sync.
    const viewTypes = view.selectedTypes || [];
    const currentTypes = filters.selectedTypes || [];

    const typesInSync =
      viewTypes.length === currentTypes.length &&
      viewTypes.every(t => currentTypes.includes(t));

    const statusInSync =
      (view.statusFilter || 'all') === (filters.statusFilter || 'all');

    if (!typesInSync || !statusInSync) {
      applyView(view);
    }

    reconciledRef.current = true;
  }, [savedViews, activeViewName, filters, applyView]);
}