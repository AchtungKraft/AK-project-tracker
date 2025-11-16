import React, { useState, useEffect } from "react";
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
import EditPartDrawer from "./EditPartDrawer";

const EXPLORER_STORAGE_KEY = 'achtung_parts_explorer_state';

export default function PartsExplorerLayout() {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [categoryPath, setCategoryPath] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [showLeftPane, setShowLeftPane] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [showGrouping, setShowGrouping] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

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

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list('-created_date'),
  });

  // Build category path
  useEffect(() => {
    if (selectedCategoryId && categories.length > 0) {
      const path = [];
      let currentId = selectedCategoryId;
      
      while (currentId) {
        const cat = categories.find(c => c.id === currentId);
        if (!cat) break;
        path.unshift({ id: cat.id, name: cat.name, color: cat.color });
        currentId = cat.parent_id;
      }
      
      setCategoryPath(path);
    } else {
      setCategoryPath([]);
    }
  }, [selectedCategoryId, categories]);

  const handleCategorySelect = (categoryId) => {
    setSelectedCategoryId(categoryId);
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

  const filteredParts = parts.filter(part => {
    const matchesSearch = debouncedSearchTerm ? (
      part.part_name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      part.vendor_part_number?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    ) : true;
    
    if (!selectedCategoryId) {
      return matchesSearch;
    }
    
    const relevantCategoryIds = getAllDescendantCategoryIds(selectedCategoryId, categories);
    const matchesCategory = relevantCategoryIds.includes(part.part_category_id);
    
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

  return (
    <>
      <div className="h-[calc(100vh-8rem)] flex flex-col bg-black/20 rounded-lg overflow-hidden border border-red-900/30">
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
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
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
              />
            </div>

            {/* Parts Display */}
            <div className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col">
              <div className="flex-1 md:overflow-y-auto p-4">
                {viewMode === 'cards' ? (
                  <PartsGrid
                    parts={paginatedParts}
                    categories={categories}
                    selectedCategoryId={selectedCategoryId}
                    onPartClick={(partId) => setSelectedPart(partId)}
                  />
                ) : (
                  <PartsListView
                    parts={paginatedParts}
                    categories={categories}
                    selectedCategoryId={selectedCategoryId}
                    onPartClick={(partId) => setSelectedPart(partId)}
                    showGrouping={showGrouping}
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

      {selectedPart && (
        <EditPartDrawer
          partId={selectedPart}
          onClose={() => setSelectedPart(null)}
        />
      )}


    </>
  );
}