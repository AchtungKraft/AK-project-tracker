import { useState, useMemo, useCallback } from 'react';

/**
 * useSupplyFilters - Shared filter hook for Supply Manager pages
 * 
 * Used by:
 * - SupplyLanding
 * - ProjectSupplyManager
 * - SupplyQueues
 * - GlobalNeedToOrder
 */

export const SUPPLY_FILTER_DEFAULTS = {
  searchTerm: '',
  projectId: 'all',
  vendorId: 'all',
  statusFilter: 'all',
  typeFilter: 'all',
  coverageFilter: 'all', // 'all', 'covered', 'partial', 'uncovered'
  prepayFilter: 'all', // 'all', 'required', 'not_required'
  procurementStatus: 'all', // 'all', 'need_order', 'on_order', 'received', 'installed'
  poolStatus: 'all', // 'all', 'active', 'overdrawn', 'closed'
};

export function useSupplyFilters(initialFilters = {}) {
  const [filters, setFilters] = useState({
    ...SUPPLY_FILTER_DEFAULTS,
    ...initialFilters,
  });

  const setFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(SUPPLY_FILTER_DEFAULTS);
  }, []);

  const applyFiltersFromUrl = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlFilters = {};
    
    if (urlParams.get('project_id')) urlFilters.projectId = urlParams.get('project_id');
    if (urlParams.get('vendor_id')) urlFilters.vendorId = urlParams.get('vendor_id');
    if (urlParams.get('status')) urlFilters.statusFilter = urlParams.get('status');
    if (urlParams.get('coverage')) urlFilters.coverageFilter = urlParams.get('coverage');
    if (urlParams.get('prepay')) urlFilters.prepayFilter = urlParams.get('prepay');
    if (urlParams.get('queue')) urlFilters.procurementStatus = urlParams.get('queue');
    
    if (Object.keys(urlFilters).length > 0) {
      setFilters(prev => ({ ...prev, ...urlFilters }));
    }
  }, []);

  // Active filter count (for badges)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.searchTerm) count++;
    if (filters.projectId !== 'all') count++;
    if (filters.vendorId !== 'all') count++;
    if (filters.statusFilter !== 'all') count++;
    if (filters.typeFilter !== 'all') count++;
    if (filters.coverageFilter !== 'all') count++;
    if (filters.prepayFilter !== 'all') count++;
    if (filters.procurementStatus !== 'all') count++;
    if (filters.poolStatus !== 'all') count++;
    return count;
  }, [filters]);

  return {
    filters,
    setFilter,
    resetFilters,
    applyFiltersFromUrl,
    activeFilterCount,
  };
}

/**
 * Filter commitments based on current filter state
 */
export function filterCommitments(commitments, filters, parts = [], projects = [], vendors = []) {
  return commitments.filter(commitment => {
    const part = parts.find(p => p.id === commitment.part_id);
    const project = projects.find(p => p.id === commitment.project_id);
    const vendor = part ? vendors.find(v => v.id === part.default_vendor_id) : null;

    // Search filter
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const matchesSearch = 
        part?.part_name?.toLowerCase().includes(term) ||
        part?.vendor_part_number?.toLowerCase().includes(term) ||
        project?.name?.toLowerCase().includes(term) ||
        project?.client_name?.toLowerCase().includes(term) ||
        vendor?.vendor_name?.toLowerCase().includes(term);
      if (!matchesSearch) return false;
    }

    // Project filter
    if (filters.projectId !== 'all' && commitment.project_id !== filters.projectId) {
      return false;
    }

    // Vendor filter
    if (filters.vendorId !== 'all' && vendor?.id !== filters.vendorId) {
      return false;
    }

    // Status filter
    if (filters.statusFilter !== 'all' && commitment.commitment_status !== filters.statusFilter) {
      return false;
    }

    // Coverage filter
    if (filters.coverageFilter !== 'all') {
      const plannedRetail = commitment.planned_retail_total || 0;
      const coveredRetail = commitment.covered_retail_total || 0;
      const coveragePct = plannedRetail > 0 ? (coveredRetail / plannedRetail) * 100 : 0;
      
      if (filters.coverageFilter === 'covered' && coveragePct < 100) return false;
      if (filters.coverageFilter === 'partial' && (coveragePct === 0 || coveragePct >= 100)) return false;
      if (filters.coverageFilter === 'uncovered' && coveragePct > 0) return false;
    }

    // Prepay filter
    if (filters.prepayFilter === 'required' && !commitment.requires_prepay) return false;
    if (filters.prepayFilter === 'not_required' && commitment.requires_prepay) return false;

    // Procurement status filter
    if (filters.procurementStatus !== 'all') {
      const needsOrder = commitment.commitment_status === 'planned' || 
        (commitment.qty_committed || 0) > (commitment.qty_ordered || 0);
      const onOrder = ['ordered', 'partially_received'].includes(commitment.commitment_status);
      const received = commitment.commitment_status === 'received';
      const installed = commitment.commitment_status === 'installed';

      if (filters.procurementStatus === 'need_order' && !needsOrder) return false;
      if (filters.procurementStatus === 'on_order' && !onOrder) return false;
      if (filters.procurementStatus === 'received' && !received) return false;
      if (filters.procurementStatus === 'installed' && !installed) return false;
    }

    return true;
  });
}

/**
 * Filter pools based on current filter state
 */
export function filterPools(pools, filters, projects = []) {
  return pools.filter(pool => {
    const project = projects.find(p => p.id === pool.project_id);

    // Search filter
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const matchesSearch = 
        pool.pool_name?.toLowerCase().includes(term) ||
        project?.name?.toLowerCase().includes(term) ||
        project?.client_name?.toLowerCase().includes(term);
      if (!matchesSearch) return false;
    }

    // Project filter
    if (filters.projectId !== 'all' && pool.project_id !== filters.projectId) {
      return false;
    }

    // Pool status filter
    if (filters.poolStatus !== 'all') {
      const isOverdrawn = pool.status === 'overdrawn' || (pool.balance || 0) < 0;
      const isClosed = pool.status === 'closed';
      const isActive = !isOverdrawn && !isClosed;

      if (filters.poolStatus === 'active' && !isActive) return false;
      if (filters.poolStatus === 'overdrawn' && !isOverdrawn) return false;
      if (filters.poolStatus === 'closed' && !isClosed) return false;
    }

    return true;
  });
}

export default useSupplyFilters;