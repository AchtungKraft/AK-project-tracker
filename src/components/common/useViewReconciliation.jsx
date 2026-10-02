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

    // Wait until savedViews are loaded from DB (more than just the default)
    // If user has no saved views at all, savedViews will still be length 1 (the default).
    // We detect DB readiness by checking if we've seen an async render —
    // the default view "All Projects" needs no reconciliation anyway.
    if (activeViewName === 'All Projects') {
      // "All Projects" means selectedTypes=[] — which is the default.
      // If localStorage has stale selectedTypes, clear them.
      if (filters.selectedTypes && filters.selectedTypes.length > 0) {
        applyView({ selectedTypes: [], statusFilter: filters.statusFilter || 'all' });
      }
      reconciledRef.current = true;
      return;
    }

    // Active view is not "All Projects" — find it in savedViews
    const view = savedViews.find(v => v.name === activeViewName);
    if (!view) {
      // View not yet loaded from DB (savedViews is still just [default]).
      // Wait for the next render when the query resolves.
      // But if savedViews has more than 1 entry and still no match,
      // the view was deleted — fall back to All Projects.
      if (savedViews.length > 1) {
        applyView({ selectedTypes: [], statusFilter: 'all' });
        reconciledRef.current = true;
      }
      return;
    }

    // View found — compare its selectedTypes with the current filter state
    const viewTypes = view.selectedTypes || [];
    const currentTypes = filters.selectedTypes || [];

    const needsReconciliation =
      viewTypes.length !== currentTypes.length ||
      !viewTypes.every(t => currentTypes.includes(t));

    const statusNeedsReconciliation =
      (view.statusFilter || 'all') !== (filters.statusFilter || 'all');

    if (needsReconciliation || statusNeedsReconciliation) {
      applyView(view);
    }

    reconciledRef.current = true;
  }, [savedViews, activeViewName, filters.selectedTypes, filters.statusFilter, applyView]);
}