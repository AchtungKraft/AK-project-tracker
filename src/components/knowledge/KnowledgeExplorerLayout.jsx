import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import KnowledgeCategoryTree from "./KnowledgeCategoryTree";
import KnowledgeBreadcrumb from "./KnowledgeBreadcrumb";
import KnowledgeListView from "./KnowledgeListView";
import KnowledgeDetailDrawer from "./KnowledgeDetailDrawer";
import SubsystemContextPanel from "./SubsystemContextPanel";

const STORAGE_KEY = 'achtung_knowledge_explorer_state';

const POST_TYPE_FILTERS = [
  { value: "all", label: "All Posts" },
  { value: "procedure", label: "Procedures" },
  { value: "observation", label: "Observations" },
  { value: "known_issue", label: "Known Issues" },
  { value: "reference", label: "References" },
  { value: "tip", label: "Tips" },
];

export default function KnowledgeExplorerLayout({ categories, onItemEdit, onItemCreate }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [postTypeFilter, setPostTypeFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);

  // Persist state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        setSelectedCategoryId(state.selectedCategoryId || null);
        setExpandedCategories(state.expandedCategories || {});
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedCategoryId, expandedCategories,
      }));
    } catch (e) {}
  }, [selectedCategoryId, expandedCategories]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['buildKnowledgeItems'],
    queryFn: () => base44.entities.BuildKnowledgeItem.list('-updated_date'),
  });

  // Fetch parts + part links for weighted search
  const { data: allParts = [] } = useQuery({
    queryKey: ['parts_for_knowledge'],
    queryFn: () => base44.entities.Part.list(),
    staleTime: 120000,
  });
  const { data: allPartLinks = [] } = useQuery({
    queryKey: ['allKnowledgePartLinks'],
    queryFn: () => base44.entities.BuildKnowledgePartLink.list(),
    staleTime: 60000,
  });
  // Fetch procedure entries for entry headline search
  const { data: allEntries = [] } = useQuery({
    queryKey: ['allProcedureEntries'],
    queryFn: () => base44.entities.ProcedureEntry.list(),
    staleTime: 60000,
  });

  // Map item IDs to part names for search
  const partNamesByItemId = useMemo(() => {
    const map = {};
    allPartLinks.forEach(link => {
      const part = allParts.find(p => p.id === link.part_id);
      if (part) {
        if (!map[link.knowledge_item_id]) map[link.knowledge_item_id] = [];
        map[link.knowledge_item_id].push((part.part_name || part.name || '').toLowerCase());
      }
    });
    return map;
  }, [allPartLinks, allParts]);

  // Map item IDs to entry headlines for deep search
  const entryHeadlinesByItemId = useMemo(() => {
    const map = {};
    allEntries.forEach(entry => {
      if (!entry.procedure_id) return;
      if (!map[entry.procedure_id]) map[entry.procedure_id] = [];
      if (entry.headline) map[entry.procedure_id].push(entry.headline.toLowerCase());
    });
    return map;
  }, [allEntries]);

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

  // Get all descendant category IDs
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

  // Smart search: prioritize title, category, tags, parts before HTML content
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Category filter
      if (selectedCategoryId) {
        const relevantIds = getAllDescendantIds(selectedCategoryId);
        if (!relevantIds.includes(item.category_id) && !relevantIds.includes(item.subcategory_id)) {
          return false;
        }
      }
      // Post type filter
      if (postTypeFilter !== 'all') {
        const itemPostType = item.post_type || item.type || 'procedure';
        if (itemPostType !== postTypeFilter) return false;
      }
      // Weighted search: title > tags > parts > entry headlines > category > post_type > summary > content
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (item.title?.toLowerCase().includes(term)) return true;
        if (item.vehicle_tags?.some(t => t.toLowerCase().includes(term))) return true;
        // Search related part names
        const itemParts = partNamesByItemId[item.id] || [];
        if (itemParts.some(name => name.includes(term))) return true;
        // Search entry headlines (deep search into procedure steps)
        const headlines = entryHeadlinesByItemId[item.id] || [];
        if (headlines.some(h => h.includes(term))) return true;
        // Known issues title match
        if (item.known_issues?.some(ki => ki.title?.toLowerCase().includes(term))) return true;
        // Category name match
        const cat = categories.find(c => c.id === item.category_id);
        if (cat?.name?.toLowerCase().includes(term)) return true;
        // Post type match
        const postType = item.post_type || item.type || '';
        if (postType.replace('_', ' ').includes(term)) return true;
        // Summary
        if (item.summary?.toLowerCase().includes(term)) return true;
        // Fallback: body content (stripped of tags)
        const matchContent = item.content_html?.replace(/<[^>]*>/g, '').toLowerCase().includes(term);
        return matchContent;
      }
      return true;
    });
  }, [items, selectedCategoryId, searchTerm, postTypeFilter, categories, partNamesByItemId, entryHeadlinesByItemId]);

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
      <div className="flex flex-col bg-black/20 rounded-xl border border-red-900/30 md:h-[calc(100vh-8rem)] md:overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-3 md:p-4 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white truncate">Execution Intelligence</h2>
            <p className="text-[11px] text-gray-400">
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} {selectedCategoryId ? 'in subsystem' : 'total'}
              {searchTerm && ` · searching "${searchTerm}"`}
            </p>
          </div>
          <Button onClick={onItemCreate} size="sm" className="bg-red-600 hover:bg-red-700 gap-2 h-11 px-4 text-sm shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Procedure</span>
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
          {/* Left — Category Tree */}
          <div className="flex w-full md:w-[28%] lg:w-[22%] flex-col border-b md:border-b-0 md:border-r border-red-900/30 bg-black/20 max-h-[35vh] md:max-h-none">
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

          {/* Right — Feed */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="p-3 border-b border-red-900/20 bg-gray-900/30 flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search procedures, parts, steps..."
                  className="pl-8 bg-gray-900/50 border-gray-700 text-white h-9 text-sm"
                />
              </div>
              <Select value={postTypeFilter} onValueChange={setPostTypeFilter}>
                <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white h-9 text-xs w-32">
                  <Filter className="w-3 h-3 mr-1 text-gray-500" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_TYPE_FILTERS.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-gray-500">{filteredItems.length}</span>
            </div>

            <div className="flex-1 p-3 md:p-4 md:overflow-y-auto space-y-4">
              {/* Subsystem workspace context — shows related parts, tasks, photos */}
              {selectedCategoryId && !searchTerm && (
                <SubsystemContextPanel
                  categoryId={selectedCategoryId}
                  categories={categories}
                  items={items}
                />
              )}

              <KnowledgeListView
                items={filteredItems}
                categories={categories}
                selectedCategoryId={selectedCategoryId}
                showGrouping={false}
                onItemClick={setSelectedItem}
              />
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