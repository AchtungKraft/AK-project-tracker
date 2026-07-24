import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Menu, Plus, X } from "lucide-react";
import { useDebounce } from "./useDebounce";
import CategoryTree from "./CategoryTree";
import PartsGrid from "./PartsGrid";
import PartsListView from "./PartsListView";
import PartsViewToolbar from "./PartsViewToolbar";
import PartsBreadcrumb from "./PartsBreadcrumb";
import UnifiedAddPartModal from "./UnifiedAddPartModal";
import PartModal from "./PartModal";
import AdjustInventoryModal from "../inventory/AdjustInventoryModal";
import OrderPartModal from "./OrderPartModal";
import AddToBuildModal from "./AddToBuildModal";
import AddToNeedToBuyModal from "./AddToNeedToBuyModal";
import { useReferenceData, ReferenceDataGate } from "@/components/common/useReferenceData";
import { operationalDataConfig } from "@/components/common/queryConfig";
import { printPartsList } from "./PartsListPrintView";

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
    isError: referenceError,
  } = useReferenceData();

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

  // Additional data for print: inventory items (locations), locations, vendor sources
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems-print'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });
  const { data: locationsList = [] } = useQuery({
    queryKey: ['locations-print'],
    queryFn: () => base44.entities.Location.list(),
  });
  const { data: vendorSources = [] } = useQuery({
    queryKey: ['vendorSources-print'],
    queryFn: () => base44.entities.PartVendorSource.list(),
  });

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

  // Helper to get all descendant category IDs
  const getAllDescendantCategoryIds = (categoryId, allCategories) => {
    const descendants = new Set();
    const queue = [categoryId];
    
    while (queue.length > 0) {
      const current = queue.shift();
      descendants.add(current);
      allCategories.forEach(cat => {
        if (cat.parent_id === current && !descendants.has(cat.id)) {
          queue.push(cat.id);
        }
      });
    }
    return Array.from(descendants);
  };

  // Helper to get the category ID for a part (supports both part_category_id and category string)
  const getPartCategoryId = (part) => {
    if (part.part_category_id) return part.part_category_id;
    if (part.category) {
      return categoryNameToId[part.category.toLowerCase()];
    }
    return null;
  };

  const filteredParts = parts.filter(part => {
    // Archive filter - exclude archived unless showArchived is true
    if (!showArchived && part.is_archived) {
      return false;
    }
    
    const searchLower = debouncedSearchTerm?.toLowerCase() || '';
    
    // Get related data for comprehensive search
    const partCategory = categories.find(c => c.id === part.part_category_id);
    const categoryName = partCategory?.name?.toLowerCase() || '';
    const vendor = vendors.find(v => v.id === part.default_vendor_id);
    const vendorName = vendor?.vendor_name?.toLowerCase() || '';
    const carMake = carMakes.find(m => m.id === part.car_make_id);
    const makeName = carMake?.name?.toLowerCase() || '';
    const carModel = carModels.find(m => m.id === part.car_model_id);
    const modelName = carModel?.name?.toLowerCase() || '';
    const carYear = carYears.find(y => y.id === part.car_year_id);
    const yearName = carYear?.year?.toLowerCase() || '';
    
    const matchesSearch = debouncedSearchTerm ? (
      part.part_name?.toLowerCase().includes(searchLower) ||
      part.vendor_part_number?.toLowerCase().includes(searchLower) ||
      part.notes?.toLowerCase().includes(searchLower) ||
      part.order_url?.toLowerCase().includes(searchLower) ||
      categoryName.includes(searchLower) ||
      vendorName.includes(searchLower) ||
      makeName.includes(searchLower) ||
      modelName.includes(searchLower) ||
      yearName.includes(searchLower)
    ) : true;
    
    if (!selectedCategoryId) {
      return matchesSearch;
    }
    
    const relevantCategoryIds = getAllDescendantCategoryIds(selectedCategoryId, categories);
    const partCategoryId = getPartCategoryId(part);
    const matchesCategory = partCategoryId && relevantCategoryIds.includes(partCategoryId);
    
    return matchesSearch && matchesCategory;
  });

  // Pagination
  const totalPages = Math.ceil(filteredParts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedParts = filteredParts.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, selectedCategoryId]);

  // Print handler — prints ALL filtered parts (not just current page)
  const handlePrint = () => {
    const selectedCat = selectedCategoryId ? categories.find(c => c.id === selectedCategoryId) : null;
    let categoryLabel = null;
    if (selectedCat) {
      if (selectedCat.parent_id) {
        const parent = categories.find(c => c.id === selectedCat.parent_id);
        categoryLabel = parent ? `${parent.name} › ${selectedCat.name}` : selectedCat.name;
      } else {
        categoryLabel = selectedCat.name;
      }
    }
    printPartsList({
      parts: filteredParts,
      categories,
      vendors,
      makes: carMakes,
      models: carModels,
      years: carYears,
      inventoryViewMap,
      inventoryItems,
      locations: locationsList,
      vendorSources,
      title: "Parts Catalog",
      categoryLabel,
    });
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
                onPrint={handlePrint}
              />
            </div>

            {/* Parts Display */}
            <div className="flex-1 flex flex-col md:overflow-hidden">
              <div className="flex-1 p-4 md:overflow-y-auto">
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
    </>
  );
}