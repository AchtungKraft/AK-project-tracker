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
  const [viewMode, setViewMode] = useState('cards');
  const [showGrouping, setShowGrouping] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  
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
        setViewMode(state.viewMode || 'cards');
        setShowGrouping(state.showGrouping || false);
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

  const filteredParts = parts.filter(part => {
    if (!selectedCategoryId && !debouncedSearchTerm) return true;
    
    const matchesSearch = debouncedSearchTerm ? (
      part.part_name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      part.vendor_part_number?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    ) : true;
    
    const matchesCategory = selectedCategoryId ? 
      part.part_category_id === selectedCategoryId : true;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <>
      <div className="h-[calc(100vh-8rem)] flex flex-col bg-black/20 rounded-lg overflow-hidden border border-red-900/30">
        {/* Header */}
        <div className="flex items-center justify-between p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowLeftPane(!showLeftPane)}
              className="md:hidden text-gray-400 hover:text-white"
            >
              {showLeftPane ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
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

        {/* Split Pane Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane - Category Tree */}
          <div 
            className={`
              ${showLeftPane ? 'flex' : 'hidden md:flex'}
              w-full md:w-[30%] lg:w-[25%] 
              flex-col border-r border-red-900/30 bg-black/20
            `}
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
          <div className={`
            ${showLeftPane ? 'hidden md:flex' : 'flex'}
            flex-1 flex-col overflow-hidden
          `}>
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
            <div className="flex-1 overflow-y-auto p-4">
              {viewMode === 'cards' ? (
                <PartsGrid
                  parts={filteredParts}
                  categories={categories}
                  selectedCategoryId={selectedCategoryId}
                  onPartClick={(partId) => setSelectedPart(partId)}
                />
              ) : (
                <PartsListView
                  parts={filteredParts}
                  categories={categories}
                  selectedCategoryId={selectedCategoryId}
                  onPartClick={(partId) => setSelectedPart(partId)}
                  showGrouping={showGrouping}
                />
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