import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useDebounce } from "./useDebounce";
import CategoryTree from "./CategoryTree";
import PartsGrid from "./PartsGrid";
import PartsListView from "./PartsListView";
import PartsViewToolbar from "./PartsViewToolbar";
import PartsBreadcrumb from "./PartsBreadcrumb";
import UnifiedAddPartModal from "./UnifiedAddPartModal";
import AdjustInventoryModal from "../inventory/AdjustInventoryModal";
import OrderPartModal from "./OrderPartModal";
import AddToBuildModal from "./AddToBuildModal";
import AddToNeedToBuyModal from "./AddToNeedToBuyModal";
import { useReferenceData } from "@/components/common/useReferenceData";
import { operationalDataConfig } from "@/components/common/queryConfig";
import { buildSummaryReport, buildIllustratedCatalog, buildPriceList, openPrintWindow } from "./PartsListPrintView";
import PrintOptionsModal from "./print/PrintOptionsModal";
import { buildCategoryLookups, getCategoryPathLabel } from "@/lib/categoryTreeHelpers";

const EXPLORER_STORAGE_KEY = 'achtung_parts_explorer_state';

export default function PartsExplorerLayout({ onPartClick }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [showLeftPane, setShowLeftPane] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list'); // Default to list view
  const [showGrouping, setShowGrouping] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  
  // New modals for inventory, ordering, builds, and need to buy
  const [inventoryModalPart, setInventoryModalPart] = useState(null);
  const [orderModalPart, setOrderModalPart] = useState(null);
  const [buildModalPart, setBuildModalPart] = useState(null);
  const [needToBuyModalPart, setNeedToBuyModalPart] = useState(null);
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // PHASE 2: Use centralized reference data
  const { 
    ready: referenceReady,
    categories, 
    vendors, 
    makes: carMakes, 
    models: carModels, 
    years: carYears,
    categoriesMap,
    vendorsMap,
    makeMap,
    modelMap,
    yearMap,
    isError: referenceError,
  } = useReferenceData({
    // Catalog browsing/search does not use storage locations or vendor groups.
    // Do not make the initial list wait on unrelated reference datasets.
    includeLocations: false,
    includeVendorGroups: false,
  });

  // Inventory view for print detail
  const { data: partsInventoryView = [] } = useQuery({
    queryKey: ['partsInventoryView'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getPartsInventoryView', {});
      return res.data?.parts || [];
    },
  });

  const inventoryViewMap = useMemo(() => {
    const map = new Map();
    partsInventoryView.forEach(p => map.set(p.part_id, p));
    return map;
  }, [partsInventoryView]);

  // Load saved state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EXPLORER_STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        setSelectedCategoryId(state.selectedCategoryId || null);
        setExpandedCategories(state.expandedCategories || {});
        setShowLeftPane(state.showLeftPane !== false);
        setViewMode(state.viewMode || 'list');
        setShowGrouping(state.showGrouping !== undefined ? state.showGrouping : true);
      }
    } catch (e) {}
  }, []);

  // Save state
  useEffect(() => {
    try {
      localStorage.setItem(EXPLORER_STORAGE_KEY, JSON.stringify({
        selectedCategoryId,
        expandedCategories,
        showLeftPane,
        viewMode,
        showGrouping,
      }));
    } catch (e) {}
  }, [selectedCategoryId, expandedCategories, showLeftPane, viewMode, showGrouping]);

  // Parts - operational data with shorter cache
  const { data: parts = [], isLoading: partsLoading } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list('-created_date'),
    ...operationalDataConfig,
  });

  // Build category path — derived via useMemo to avoid render loops
  const categoryPath = useMemo(() => {
    if (selectedCategoryId && categories.length > 0) {
      const path = [];
      let currentId = selectedCategoryId;
      
      while (currentId) {
        const cat = categories.find(c => c.id === currentId);
        if (!cat) break;
        path.unshift({ id: cat.id, name: cat.name, color: cat.color });
        currentId = cat.parent_id;
      }
      
      return path;
    }
    return [];
  }, [selectedCategoryId, categories]);

  const handleCategorySelect = (categoryId) => {
    setSelectedCategoryId(categoryId);
    
    // Auto-expand all ancestor categories to show the selected category
    if (categoryId && categories.length > 0) {
      const newExpanded = { ...expandedCategories };
      let currentId = categoryId;
      
      while (currentId) {
        const cat = categories.find(c => c.id === currentId);
        if (!cat) break;
        newExpanded[currentId] = true;
        currentId = cat.parent_id;
      }
      
      setExpandedCategories(newExpanded);
    }
  };

  const handleBreadcrumbClick = (categoryId) => {
    setSelectedCategoryId(categoryId);
  };

  const handleToggleExpand = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  // Build a map of category name -> category id for matching
  const categoryNameToId = useMemo(() => {
    const map = {};
    categories.forEach(cat => {
      if (cat.name) {
        map[cat.name.toLowerCase()] = cat.id;
      }
    });
    return map;
  }, [categories]);

  const categoryChildrenMap = useMemo(() => {
    const map = new Map();
    for (const category of categories) {
      if (!category.parent_id) continue;
      if (!map.has(category.parent_id)) map.set(category.parent_id, []);
      map.get(category.parent_id).push(category.id);
    }
    return map;
  }, [categories]);

  const relevantCategoryIds = useMemo(() => {
    if (!selectedCategoryId) return null;
    const descendants = new Set();
    const queue = [selectedCategoryId];
    for (let i = 0; i < queue.length; i += 1) {
      const current = queue[i];
      if (descendants.has(current)) continue;
      descendants.add(current);
      const children = categoryChildrenMap.get(current) || [];
      queue.push(...children);
    }
    return descendants;
  }, [selectedCategoryId, categoryChildrenMap]);

  const getPartCategoryId = (part) => {
    if (part.part_category_id) return part.part_category_id;
    return part.category ? categoryNameToId[part.category.toLowerCase()] : null;
  };

  const filteredParts = useMemo(() => {
    const searchLower = debouncedSearchTerm?.trim().toLowerCase() || '';

    return parts.filter(part => {
      if (!showArchived && part.is_archived) return false;

      if (relevantCategoryIds) {
        const partCategoryId = getPartCategoryId(part);
        if (!partCategoryId || !relevantCategoryIds.has(partCategoryId)) return false;
      }

      if (!searchLower) return true;

      const categoryName = categoriesMap[part.part_category_id]?.name?.toLowerCase() || '';
      const vendorName = vendorsMap[part.default_vendor_id]?.vendor_name?.toLowerCase() || '';
      const makeName = makeMap[part.car_make_id]?.name?.toLowerCase() || '';
      const modelName = modelMap[part.car_model_id]?.name?.toLowerCase() || '';
      const yearName = String(yearMap[part.car_year_id]?.year || '').toLowerCase();

      return (
        part.part_name?.toLowerCase().includes(searchLower) ||
        part.vendor_part_number?.toLowerCase().includes(searchLower) ||
        part.notes?.toLowerCase().includes(searchLower) ||
        part.order_url?.toLowerCase().includes(searchLower) ||
        categoryName.includes(searchLower) ||
        vendorName.includes(searchLower) ||
        makeName.includes(searchLower) ||
        modelName.includes(searchLower) ||
        yearName.includes(searchLower)
      );
    });
  }, [
    parts, showArchived, debouncedSearchTerm, relevantCategoryIds, categoryNameToId,
    categoriesMap, vendorsMap, makeMap, modelMap, yearMap
  ]);

  // Pagination
  const totalPages = Math.ceil(filteredParts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedParts = useMemo(
    () => filteredParts.slice(startIndex, endIndex),
    [filteredParts, startIndex, endIndex]
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, selectedCategoryId]);

  // Print suite state
  const [printReportType, setPrintReportType] = useState(null);

  // Heavy print datasets are dormant during normal browsing and load only while
  // a report dialog is open. Keeping them in React Query also preserves caching
  // and avoids moving window.open() behind an async boundary.
  const { data: inventoryItems = [], isLoading: printInventoryLoading } = useQuery({
    queryKey: ['inventoryItems-print'],
    queryFn: () => base44.entities.InventoryItem.list(),
    enabled: printReportType === 'illustrated',
    staleTime: 60000,
  });
  const { data: locationsList = [], isLoading: printLocationsLoading } = useQuery({
    queryKey: ['locations-print'],
    queryFn: () => base44.entities.Location.list(),
    enabled: printReportType === 'illustrated',
    staleTime: 300000,
  });
  const { data: vendorSources = [], isLoading: printSourcesLoading } = useQuery({
    queryKey: ['vendorSources-print'],
    queryFn: () => base44.entities.PartVendorSource.list(),
    enabled: printReportType === 'summary' || printReportType === 'illustrated',
    staleTime: 60000,
  });

  const categoryByIdMap = useMemo(() => buildCategoryLookups(categories).byId, [categories]);

  const getCategoryLabel = () => {
    if (!selectedCategoryId || !categoryByIdMap[selectedCategoryId]) return null;
    return getCategoryPathLabel(selectedCategoryId, categoryByIdMap, " › ");
  };

  const handlePrintReport = (reportType) => {
    setPrintReportType(reportType);
  };

  const executePrint = (options) => {
    const baseData = {
      parts: filteredParts,
      categories,
      vendors,
      makes: carMakes,
      models: carModels,
      years: carYears,
      categoryLabel: getCategoryLabel(),
      searchTerm: debouncedSearchTerm || "",
      options,
    };

    let html;
    if (printReportType === "summary") {
      html = buildSummaryReport({ ...baseData, inventoryViewMap, vendorSources });
    } else if (printReportType === "illustrated") {
      html = buildIllustratedCatalog({ ...baseData, inventoryViewMap, inventoryItems, locations: locationsList, vendorSources });
    } else if (printReportType === "priceList") {
      html = buildPriceList(baseData);
    }

    if (html) openPrintWindow(html);
  };

  // PHASE 4: Render gate - don't render list until reference data is ready
  if (!referenceReady) {
    return (
      <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30 md:h-[calc(100vh-8rem)] p-6">
        <div className="space-y-4">
          <div className="animate-pulse h-8 bg-gray-800 rounded w-1/3" />
          <div className="animate-pulse h-12 bg-gray-800 rounded" />
          <div className="animate-pulse h-12 bg-gray-800 rounded" />
          <div className="animate-pulse h-12 bg-gray-800 rounded" />
          <div className="animate-pulse h-12 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  // PHASE 8: Fail safe for reference data errors
  if (referenceError) {
    return (
      <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30 md:h-[calc(100vh-8rem)] p-6">
        <div className="text-center py-12">
          <p className="text-red-400 mb-2">Reference data unavailable</p>
          <p className="text-gray-500 text-sm mb-4">Unable to load categories, vendors, or vehicle data</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30 md:h-[calc(100vh-8rem)] md:overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
          <div className="flex items-center gap-3">

            <div>
              <h2 className="text-lg font-bold text-white">Parts Master</h2>
              <p className="text-xs text-gray-400">
                {filteredParts.length} parts {selectedCategoryId ? 'in category' : 'total'}
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            size="sm"
            className="bg-red-600 hover:bg-red-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Part</span>
          </Button>
        </div>

        {/* Breadcrumb */}
        {categoryPath.length > 0 && (
          <div className="px-3 py-2 bg-gray-900/50 border-b border-red-900/20">
            <PartsBreadcrumb
              path={categoryPath}
              onNavigate={handleBreadcrumbClick}
              onClearSelection={() => setSelectedCategoryId(null)}
            />
          </div>
        )}

        {/* Split Pane Layout - Desktop: side-by-side, Mobile: stacked */}
        <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
          {/* Left Pane - Category Tree */}
          <div 
            className="
              flex
              w-full md:w-[30%] lg:w-[25%] 
              flex-col border-b md:border-b-0 md:border-r border-red-900/30 bg-black/20
              max-h-[40vh] md:max-h-none
            "
          >
            <CategoryTree
              categories={categories}
              parts={parts}
              selectedCategoryId={selectedCategoryId}
              expandedCategories={expandedCategories}
              searchTerm={searchTerm}
              onCategorySelect={handleCategorySelect}
              onToggleExpand={handleToggleExpand}
              onSearchChange={setSearchTerm}
            />
          </div>

          {/* Right Pane - Parts List */}
          <div className="
            flex
            flex-1 flex-col overflow-hidden
          ">
            {/* Toolbar */}
            <div className="p-3 border-b border-red-900/20 bg-gray-900/30">
              <PartsViewToolbar
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                showGrouping={showGrouping}
                onToggleGrouping={() => setShowGrouping(!showGrouping)}
                partsCount={filteredParts.length}
                showArchived={showArchived}
                onToggleArchived={() => setShowArchived(!showArchived)}
                onPrintReport={handlePrintReport}
              />
            </div>

            {/* Parts Display */}
            <div className="flex-1 flex flex-col md:overflow-hidden">
              <div className="flex-1 p-4 md:overflow-y-auto parts-tracker-scrollbar">
                {viewMode === 'cards' ? (
                  <PartsGrid
                    parts={paginatedParts}
                    categories={categories}
                    selectedCategoryId={selectedCategoryId}
                    onPartClick={onPartClick}
                    showGrouping={showGrouping}
                    onAddInventory={(part) => setInventoryModalPart(part)}
                    onOrderPart={(part) => setOrderModalPart(part)}
                    onAddToBuild={(part) => setBuildModalPart(part)}
                    onAddToNeedToBuy={(part) => setNeedToBuyModalPart(part)}
                  />
                ) : (
                  <PartsListView
                    parts={paginatedParts}
                    categories={categories}
                    selectedCategoryId={selectedCategoryId}
                    onPartClick={onPartClick}
                    showGrouping={showGrouping}
                    onAddInventory={(part) => setInventoryModalPart(part)}
                    onOrderPart={(part) => setOrderModalPart(part)}
                    onAddToBuild={(part) => setBuildModalPart(part)}
                    onAddToNeedToBuy={(part) => setNeedToBuyModalPart(part)}
                  />
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="border-t border-red-900/20 bg-gray-900/30 p-3 flex items-center justify-between">
                  <div className="text-xs text-gray-400">
                    Showing {startIndex + 1}-{Math.min(endIndex, filteredParts.length)} of {filteredParts.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-8 px-3 text-xs"
                    >
                      Previous
                    </Button>
                    <div className="text-xs text-gray-400">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-8 px-3 text-xs"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAddModal && (
        <UnifiedAddPartModal onClose={() => setShowAddModal(false)} />
      )}

      {inventoryModalPart && (
        <AdjustInventoryModal 
          onClose={() => setInventoryModalPart(null)} 
          preselectedPartId={inventoryModalPart.id}
        />
      )}

      {orderModalPart && (
        <OrderPartModal 
          part={orderModalPart}
          onClose={() => setOrderModalPart(null)} 
        />
      )}

      {buildModalPart && (
        <AddToBuildModal 
          part={buildModalPart}
          onClose={() => setBuildModalPart(null)} 
        />
      )}

      {needToBuyModalPart && (
        <AddToNeedToBuyModal 
          part={needToBuyModalPart}
          onClose={() => setNeedToBuyModalPart(null)} 
        />
      )}

      {printReportType && (
        <PrintOptionsModal
          reportType={printReportType}
          onClose={() => setPrintReportType(null)}
          onPrint={executePrint}
          isLoading={
            (printReportType === 'illustrated' && (printInventoryLoading || printLocationsLoading || printSourcesLoading)) ||
            (printReportType === 'summary' && printSourcesLoading)
          }
        />
      )}
    </>
  );
}