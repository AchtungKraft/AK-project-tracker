import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, BookOpen, X } from "lucide-react";
import KnowledgeCategorySidebar from "@/components/knowledge/KnowledgeCategorySidebar";
import KnowledgeItemList from "@/components/knowledge/KnowledgeItemList";
import KnowledgeItemViewer from "@/components/knowledge/KnowledgeItemViewer";
import KnowledgeItemEditor from "@/components/knowledge/KnowledgeItemEditor";

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "procedure", label: "Procedures" },
  { value: "guide", label: "Guides" },
  { value: "issue", label: "Issues" },
  { value: "reference", label: "References" },
  { value: "document", label: "Documents" },
];

export default function BuildKnowledge() {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeType, setActiveType] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Reuse PartCategory taxonomy
  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
    staleTime: 60000,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['buildKnowledgeItems'],
    queryFn: () => base44.entities.BuildKnowledgeItem.list('-updated_date'),
  });

  // Compute category counts
  const itemCountsByCategory = useMemo(() => {
    const counts = {};
    items.forEach(item => {
      if (item.category_id) counts[item.category_id] = (counts[item.category_id] || 0) + 1;
      if (item.subcategory_id) counts[item.subcategory_id] = (counts[item.subcategory_id] || 0) + 1;
    });
    return counts;
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Category filter — match parent or subcategory
      if (selectedCategoryId) {
        const cat = categories.find(c => c.id === selectedCategoryId);
        if (cat) {
          if (cat.parent_id) {
            // Selected a subcategory
            if (item.subcategory_id !== selectedCategoryId) return false;
          } else {
            // Selected a parent — show items in parent or any child
            const childIds = categories.filter(c => c.parent_id === selectedCategoryId).map(c => c.id);
            if (item.category_id !== selectedCategoryId && !childIds.includes(item.subcategory_id) && !childIds.includes(item.category_id)) {
              return false;
            }
          }
        }
      }

      // Type filter
      if (activeType !== "all" && item.type !== activeType) return false;

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
  }, [items, selectedCategoryId, activeType, searchTerm, categories]);

  const handleEdit = useCallback((item) => {
    setEditingItem(item);
    setEditorOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditingItem(null);
    setEditorOpen(true);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="flex h-screen">
        {/* Left Sidebar — Category Navigation */}
        <div className="w-64 border-r border-red-900/30 bg-black/30 flex flex-col shrink-0">
          <div className="p-4 border-b border-red-900/30">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-5 h-5 text-red-500" />
              <h1 className="text-lg font-bold text-white">Build Knowledge</h1>
            </div>
            <Button onClick={handleCreate} className="w-full bg-red-600 hover:bg-red-700 gap-2 h-9 text-sm">
              <Plus className="w-4 h-4" /> New Item
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <KnowledgeCategorySidebar
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
              itemCountsByCategory={itemCountsByCategory}
            />
          </div>
        </div>

        {/* Center — Item List */}
        <div className="w-80 border-r border-gray-700/50 flex flex-col shrink-0">
          <div className="p-3 border-b border-gray-700/50 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search knowledge..."
                className="pl-9 bg-gray-800/50 border-gray-700 text-white h-9 text-sm"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-gray-500" />
                </button>
              )}
            </div>
            <Tabs value={activeType} onValueChange={setActiveType}>
              <TabsList className="bg-gray-800/50 border border-gray-700 h-7 w-full flex flex-wrap gap-0">
                {TYPE_TABS.map(t => (
                  <TabsTrigger key={t.value} value={t.value} className="text-[10px] px-2 h-6 data-[state=active]:bg-red-600">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="text-xs text-gray-500 mb-2 px-1">{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}</div>
            <KnowledgeItemList
              items={filteredItems}
              categories={categories}
              selectedId={selectedItem?.id}
              onSelect={setSelectedItem}
            />
          </div>
        </div>

        {/* Right — Item Viewer */}
        <div className="flex-1 overflow-y-auto p-6">
          <KnowledgeItemViewer
            item={selectedItem}
            categories={categories}
            onEdit={handleEdit}
          />
        </div>
      </div>

      {/* Editor Drawer */}
      <KnowledgeItemEditor
        item={editingItem}
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingItem(null);
        }}
        categories={categories}
      />
    </div>
  );
}