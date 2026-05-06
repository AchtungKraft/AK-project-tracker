import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import KnowledgeCategoryTree from "./KnowledgeCategoryTree";
import KnowledgeBreadcrumb from "./KnowledgeBreadcrumb";
import KnowledgeViewToolbar from "./KnowledgeViewToolbar";
import KnowledgeListView from "./KnowledgeListView";
import KnowledgeDetailDrawer from "./KnowledgeDetailDrawer";
import SubsystemWorkspace from "./SubsystemWorkspace";

const STORAGE_KEY = 'achtung_knowledge_explorer_state';

export default function KnowledgeExplorerLayout({ categories, onItemEdit, onItemCreate }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showGrouping, setShowGrouping] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);

  // Persist state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        setSelectedCategoryId(state.selectedCategoryId || null);
        setExpandedCategories(state.expandedCategories || {});
        setShowGrouping(state.showGrouping !== undefined ? state.showGrouping : true);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedCategoryId, expandedCategories, showGrouping,
      }));
    } catch (e) {}
  }, [selectedCategoryId, expandedCategories, showGrouping]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['buildKnowledgeItems'],
    queryFn: () => base44.entities.BuildKnowledgeItem.list('-updated_date'),
  });

  // Category path for breadcrumb
  const categoryPath = useMemo(() => {
    if (!selectedCategoryId || categories.length === 0) return [];
    const path = [];
    let currentId = selectedCategoryId;
    while (currentId) {
      const cat = categories.find(c => c.id === currentId);
      if (!cat) break;
      path.unshift({ id: cat.id, name: cat.name, color: cat.color });
      currentId = cat.parent_id;
    }
    return path;
  }, [selectedCategoryId, categories]);

  // Helper: get all descendant category IDs
  const getAllDescendantIds = (categoryId) => {
    const descendants = new Set([categoryId]);
    const queue = [categoryId];
    while (queue.length > 0) {
      const current = queue.shift();
      categories.forEach(cat => {
        if (cat.parent_id === current && !descendants.has(cat.id)) {
          descendants.add(cat.id);
          queue.push(cat.id);
        }
      });
    }
    return Array.from(descendants);
  };

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Category filter
      if (selectedCategoryId) {
        const relevantIds = getAllDescendantIds(selectedCategoryId);
        if (!relevantIds.includes(item.category_id) && !relevantIds.includes(item.subcategory_id)) {
          return false;
        }
      }
      // Type filter
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      // Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchTitle = item.title?.toLowerCase().includes(term);
        const matchSummary = item.summary?.toLowerCase().includes(term);
        const matchTags = item.vehicle_tags?.some(t => t.toLowerCase().includes(term));
        if (!matchTitle && !matchSummary && !matchTags) return false;
      }
      return true;
    });
  }, [items, selectedCategoryId, typeFilter, searchTerm, categories]);

  const handleCategorySelect = (categoryId) => {
    setSelectedCategoryId(categoryId);
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

  const handleToggleExpand = (categoryId) => {
    setExpandedCategories(prev => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  return (
    <>
      <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30 md:h-[calc(100vh-8rem)] md:overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
          <div>
            <h2 className="text-lg font-bold text-white">Subsystem Intelligence</h2>
            <p className="text-xs text-gray-400">
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} {selectedCategoryId ? 'in subsystem' : 'total'}
            </p>
          </div>
          <Button onClick={onItemCreate} size="sm" className="bg-red-600 hover:bg-red-700 gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Item</span>
          </Button>
        </div>

        {/* Breadcrumb */}
        {categoryPath.length > 0 && (
          <div className="px-3 py-2 bg-gray-900/50 border-b border-red-900/20">
            <KnowledgeBreadcrumb
              path={categoryPath}
              onNavigate={handleCategorySelect}
              onClearSelection={() => setSelectedCategoryId(null)}
            />
          </div>
        )}

        {/* Split Pane */}
        <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
          {/* Left Pane — Category Tree */}
          <div className="flex w-full md:w-[30%] lg:w-[25%] flex-col border-b md:border-b-0 md:border-r border-red-900/30 bg-black/20 max-h-[40vh] md:max-h-none">
            <KnowledgeCategoryTree
              categories={categories}
              items={items}
              selectedCategoryId={selectedCategoryId}
              expandedCategories={expandedCategories}
              searchTerm={searchTerm}
              onCategorySelect={handleCategorySelect}
              onToggleExpand={handleToggleExpand}
              onSearchChange={setSearchTerm}
            />
          </div>

          {/* Right Pane — Items List */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="p-3 border-b border-red-900/20 bg-gray-900/30">
              <KnowledgeViewToolbar
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
                showGrouping={showGrouping}
                onToggleGrouping={() => setShowGrouping(!showGrouping)}
                itemsCount={filteredItems.length}
              />
            </div>

            <div className="flex-1 p-4 md:overflow-y-auto">
              {selectedCategoryId ? (
                <SubsystemWorkspace
                  items={filteredItems}
                  categories={categories}
                  categoryId={selectedCategoryId}
                  onItemClick={setSelectedItem}
                />
              ) : (
                <KnowledgeListView
                  items={filteredItems}
                  categories={categories}
                  selectedCategoryId={selectedCategoryId}
                  showGrouping={showGrouping}
                  onItemClick={setSelectedItem}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {selectedItem && (
        <KnowledgeDetailDrawer
          item={selectedItem}
          categories={categories}
          onClose={() => setSelectedItem(null)}
          onEdit={onItemEdit}
        />
      )}
    </>
  );
}