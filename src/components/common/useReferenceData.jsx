/**
 * CENTRALIZED REFERENCE DATA HOOK
 * 
 * PHASE 2 Implementation: Global Reference Data Layer
 * 
 * This hook centralizes ALL reference entity fetching to:
 * - Prevent repeated entity fetches across components
 * - Prevent rendering before reference data is loaded
 * - Eliminate per-row .find() lookups via pre-built maps
 * - Prevent rate limit bursts from multiple components
 * 
 * CANONICAL RULE:
 * - NO component may call base44.entities.[ReferenceEntity].list() directly
 * - ALL reference lookups MUST use the maps provided by this hook
 * - UI MUST wait for ready === true before rendering lists
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Reference data query configuration
// Long stale times prevent refetch storms
const REFERENCE_QUERY_CONFIG = {
  staleTime: 300000,    // 5 minutes
  gcTime: 600000,       // 10 minutes
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
  retry: 2,
};

/**
 * Build a lookup map from an array of entities
 * @param {Array} items - Array of entities
 * @param {string} keyField - Field to use as key (default: 'id')
 * @returns {Object} Lookup map { [keyField]: entity }
 */
function buildMap(items, keyField = 'id') {
  const map = {};
  if (!items) return map;
  for (const item of items) {
    if (item[keyField]) {
      map[item[keyField]] = item;
    }
  }
  return map;
}

/**
 * useReferenceData - Centralized reference data provider
 * 
 * @returns {Object} {
 *   ready: boolean,           // True when ALL reference data is loaded
 *   isLoading: boolean,       // True while any query is loading
 *   error: Error | null,      // First error encountered
 *   
 *   // Raw arrays
 *   categories: Array,
 *   vendors: Array,
 *   makes: Array,
 *   models: Array,
 *   years: Array,
 *   locations: Array,
 *   
 *   // Lookup maps (O(1) access)
 *   categoriesMap: Object,    // { [id]: PartCategory }
 *   vendorsMap: Object,       // { [id]: Vendor }
 *   makeMap: Object,          // { [id]: CarMake }
 *   modelMap: Object,         // { [id]: CarModel }
 *   yearMap: Object,          // { [id]: CarYear }
 *   locationMap: Object,      // { [id]: Location }
 *   
 *   // Utility functions
 *   getCategoryPath: Function,   // (categoryId) => "Parent > Child"
 *   getVendorName: Function,     // (vendorId) => "Vendor Name"
 *   getCarDescription: Function, // (makeId, modelId, yearId) => "Make Model Year"
 *   getLocationLabel: Function,  // (locationId) => "Area - Bin"
 *   
 *   // Refresh function
 *   refetchAll: Function,
 * }
 */
export function useReferenceData() {
  // Part Categories
  const categoriesQuery = useQuery({
    queryKey: ['referenceData', 'partCategories'],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    ...REFERENCE_QUERY_CONFIG,
  });

  // Vendors
  const vendorsQuery = useQuery({
    queryKey: ['referenceData', 'vendors'],
    queryFn: () => base44.entities.Vendor.list(),
    ...REFERENCE_QUERY_CONFIG,
  });

  // Car Makes
  const makesQuery = useQuery({
    queryKey: ['referenceData', 'carMakes'],
    queryFn: () => base44.entities.CarMake.list(),
    ...REFERENCE_QUERY_CONFIG,
  });

  // Car Models
  const modelsQuery = useQuery({
    queryKey: ['referenceData', 'carModels'],
    queryFn: () => base44.entities.CarModel.list(),
    ...REFERENCE_QUERY_CONFIG,
  });

  // Car Years
  const yearsQuery = useQuery({
    queryKey: ['referenceData', 'carYears'],
    queryFn: () => base44.entities.CarYear.list(),
    ...REFERENCE_QUERY_CONFIG,
  });

  // Locations
  const locationsQuery = useQuery({
    queryKey: ['referenceData', 'locations'],
    queryFn: () => base44.entities.Location.list(),
    ...REFERENCE_QUERY_CONFIG,
  });

  // Determine ready state
  const isLoading = 
    categoriesQuery.isLoading ||
    vendorsQuery.isLoading ||
    makesQuery.isLoading ||
    modelsQuery.isLoading ||
    yearsQuery.isLoading ||
    locationsQuery.isLoading;

  const isError = 
    categoriesQuery.isError ||
    vendorsQuery.isError ||
    makesQuery.isError ||
    modelsQuery.isError ||
    yearsQuery.isError ||
    locationsQuery.isError;

  const error = 
    categoriesQuery.error ||
    vendorsQuery.error ||
    makesQuery.error ||
    modelsQuery.error ||
    yearsQuery.error ||
    locationsQuery.error;

  // Ready = all queries succeeded and have data
  const ready = 
    categoriesQuery.isSuccess &&
    vendorsQuery.isSuccess &&
    makesQuery.isSuccess &&
    modelsQuery.isSuccess &&
    yearsQuery.isSuccess &&
    locationsQuery.isSuccess;

  // Raw data arrays (with fallback to empty arrays)
  const categories = categoriesQuery.data ?? [];
  const vendors = vendorsQuery.data ?? [];
  const makes = makesQuery.data ?? [];
  const models = modelsQuery.data ?? [];
  const years = yearsQuery.data ?? [];
  const locations = locationsQuery.data ?? [];

  // Build lookup maps (memoized to prevent re-renders)
  const categoriesMap = useMemo(() => buildMap(categories), [categories]);
  const vendorsMap = useMemo(() => buildMap(vendors), [vendors]);
  const makeMap = useMemo(() => buildMap(makes), [makes]);
  const modelMap = useMemo(() => buildMap(models), [models]);
  const yearMap = useMemo(() => buildMap(years), [years]);
  const locationMap = useMemo(() => buildMap(locations), [locations]);

  // Utility: Get category path string
  const getCategoryPath = useMemo(() => {
    return (categoryId) => {
      if (!categoryId || !categoriesMap[categoryId]) return null;
      
      const path = [];
      let current = categoriesMap[categoryId];
      
      while (current) {
        path.unshift(current.name);
        current = current.parent_id ? categoriesMap[current.parent_id] : null;
      }
      
      return path.join(' > ');
    };
  }, [categoriesMap]);

  // Utility: Get vendor name
  const getVendorName = useMemo(() => {
    return (vendorId) => {
      if (!vendorId) return null;
      return vendorsMap[vendorId]?.vendor_name ?? null;
    };
  }, [vendorsMap]);

  // Utility: Get car description
  const getCarDescription = useMemo(() => {
    return (makeId, modelId, yearId) => {
      const parts = [];
      if (makeId && makeMap[makeId]) parts.push(makeMap[makeId].name);
      if (modelId && modelMap[modelId]) parts.push(modelMap[modelId].name);
      if (yearId && yearMap[yearId]) parts.push(yearMap[yearId].year);
      return parts.length > 0 ? parts.join(' ') : null;
    };
  }, [makeMap, modelMap, yearMap]);

  // Utility: Get location label
  const getLocationLabel = useMemo(() => {
    return (locationId) => {
      if (!locationId) return null;
      const loc = locationMap[locationId];
      if (!loc) return null;
      
      const parts = [loc.location_area];
      if (loc.bin_description) parts.push(loc.bin_description);
      return parts.join(' - ');
    };
  }, [locationMap]);

  // Refetch all reference data
  const refetchAll = async () => {
    await Promise.all([
      categoriesQuery.refetch(),
      vendorsQuery.refetch(),
      makesQuery.refetch(),
      modelsQuery.refetch(),
      yearsQuery.refetch(),
      locationsQuery.refetch(),
    ]);
  };

  return {
    // State
    ready,
    isLoading,
    isError,
    error,
    
    // Raw arrays
    categories,
    vendors,
    makes,
    models,
    years,
    locations,
    
    // Lookup maps
    categoriesMap,
    vendorsMap,
    makeMap,
    modelMap,
    yearMap,
    locationMap,
    
    // Utility functions
    getCategoryPath,
    getVendorName,
    getCarDescription,
    getLocationLabel,
    
    // Actions
    refetchAll,
  };
}

/**
 * ReferenceDataGate - Render children only when reference data is ready
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content to render when ready
 * @param {React.ReactNode} props.fallback - Content to render while loading (optional)
 */
export function ReferenceDataGate({ children, fallback }) {
  const { ready, isError, error } = useReferenceData();
  
  if (isError) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-2">Reference data unavailable</p>
        <p className="text-gray-500 text-sm">{error?.message || 'Failed to load required data'}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
        >
          Retry
        </button>
      </div>
    );
  }
  
  if (!ready) {
    return fallback || (
      <div className="space-y-4 p-4">
        <div className="animate-pulse h-8 bg-gray-800 rounded w-1/3" />
        <div className="animate-pulse h-12 bg-gray-800 rounded" />
        <div className="animate-pulse h-12 bg-gray-800 rounded" />
        <div className="animate-pulse h-12 bg-gray-800 rounded" />
      </div>
    );
  }
  
  return children;
}

export default useReferenceData;