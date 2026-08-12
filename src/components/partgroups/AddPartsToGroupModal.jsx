import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Search, Package, Plus, X, CheckSquare, Home,
  ChevronRight, Layers,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import { useReferenceData } from "@/components/common/useReferenceData";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { operationalDataConfig } from "@/components/common/queryConfig";
import { buildCategoryLookups, getCategoryPath, getAllDescendantIds as getDescendantIds } from "@/lib/categoryTreeHelpers";
import CategoryTree from "@/components/parts/CategoryTree";
import PartsBreadcrumb from "@/components/parts/PartsBreadcrumb";
import AddPartsResultRow from "./AddPartsResultRow";

const PAGE_SIZE = 40;

export default function AddPartsToGroupModal({ groupId, groupName, existingPartIds, onClose }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Category tree state
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [catSearchTerm, setCatSearchTerm] = useState("");
  const [showMobileCatTree, setShowMobileCatTree] = useState(false);

  const { categories, vendors, vendorsMap } = useReferenceData();

  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date"),
    ...operationalDataConfig,
  });

  const { data: partsInventoryView = [] } = useQuery({
    queryKey: ["partsInventoryView"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getPartsInventoryView", {});
      return res.data?.parts || [];
    },
  });

  const inventoryMap = useMemo(() => {
    const m = {};
    partsInventoryView.forEach(p => { m[p.part_id] = p; });
    return m;
  }, [partsInventoryView]);

  const existingSet = useMemo(() => new Set(existingPartIds), [existingPartIds]);

  // Shared category lookups — canonical helpers from categoryTreeHelpers
  const catLookups = useMemo(() => buildCategoryLookups(categories), [categories]);

  const categoryNameToId = useMemo(() => {
    const map = {};
    categories.forEach(cat => { if (cat.name) map[cat.name.toLowerCase()] = cat.id; });
    return map;
  }, [categories]);

  const getPartCategoryId = useCallback((part) => {
    if (part.part_category_id) return part.part_category_id;
    if (part.category) return categoryNameToId[part.category.toLowerCase()];
    return null;
  }, [categoryNameToId]);

  // Build category breadcrumb path using shared helper
  const categoryPath = useMemo(() => {
    if (!selectedCategoryId || !categories.length) return [];
    return getCategoryPath(selectedCategoryId, catLookups.byId);
  }, [selectedCategoryId, categories, catLookups]);

  // Filtered parts (search + category, excluding archived)
  const filtered = useMemo(() => {
    let result = parts.filter(p => !p.is_archived);

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p =>
        p.part_name?.toLowerCase().includes(s) ||
        p.vendor_part_number?.toLowerCase().includes(s) ||
        p.sku?.toLowerCase().includes(s) ||
        p.description?.toLowerCase().includes(s) ||
        p.manufacturer?.toLowerCase().includes(s) ||
        p.brand?.toLowerCase().includes(s) ||
        p.notes?.toLowerCase().includes(s)
      );
    }

    if (selectedCategoryId) {
      const catIds = getDescendantIds(selectedCategoryId, catLookups.childrenByParentId);
      result = result.filter(p => {
        const pcId = getPartCategoryId(p);
        return pcId && catIds.has(pcId);
      });
    }

    return result;
  }, [parts, search, selectedCategoryId, catLookups, getPartCategoryId]);

  // Separate existing vs selectable for display
  const { selectableParts, existingInView } = useMemo(() => {
    const selectable = [];
    let existCount = 0;
    for (const p of filtered) {
      if (existingSet.has(p.id)) existCount++;
      selectable.push(p);
    }
    return { selectableParts: selectable, existingInView: existCount };
  }, [filtered, existingSet]);

  // Pagination
  const totalPages = Math.ceil(selectableParts.length / PAGE_SIZE);
  const paginatedParts = selectableParts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [search, selectedCategoryId]);

  // Selection handlers
  const toggle = (partId) => {
    if (existingSet.has(partId)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId); else next.add(partId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev);
      for (const p of paginatedParts) {
        if (!existingSet.has(p.id)) next.add(p.id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const newCount = [...selected].filter(id => !existingSet.has(id)).length;

  // Submit
  const handleAdd = async () => {
    const newParts = [...selected].filter(id => !existingSet.has(id));
    if (!newParts.length) {
      toast({ title: "No new parts to add", description: "Selected parts are already in the group." });
      return;
    }
    setSaving(true);
    try {
      await base44.entities.PartGroupItem.bulkCreate(
        newParts.map((partId, idx) => ({
          part_group_id: groupId,
          part_id: partId,
          quantity: 1,
          sort_order: idx + 1,
          is_optional: false,
        }))
      );
      queryClient.invalidateQueries({ queryKey: ["partGroupItems", groupId] });
      queryClient.invalidateQueries({ queryKey: ["partGroupItems"] });
      toast({ title: "Parts added", description: `${newParts.length} part${newParts.length !== 1 ? "s" : ""} added to group.` });
      onClose();
    } catch (err) {
      toast({ title: "Error adding parts", description: err?.message || "Some parts may not have been added.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Category tree handlers
  const handleCategorySelect = (catId) => {
    setSelectedCategoryId(catId);
    if (catId && categories.length) {
      const newExp = { ...expandedCategories };
      let cur = catId;
      while (cur) {
        const cat = categories.find(c => c.id === cur);
        if (!cat) break;
        newExp[cur] = true;
        cur = cat.parent_id;
      }
      setExpandedCategories(newExp);
    }
    if (isMobile) setShowMobileCatTree(false);
  };

  const handleToggleExpand = (catId) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  // Count selectable visible parts (not already in group)
  const visibleSelectableCount = paginatedParts.filter(p => !existingSet.has(p.id)).length;

  // All-in-group empty state
  const allInGroup = filtered.length > 0 && filtered.every(p => existingSet.has(p.id));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className={cn(
        "flex flex-col p-0 gap-0",
        isMobile ? "max-w-full h-[100dvh] rounded-none" : "max-w-5xl max-h-[88vh]"
      )}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-red-400 shrink-0" />
              Add Parts to Group
            </DialogTitle>
            {groupName && (
              <p className="text-xs text-gray-400 truncate mt-0.5">{groupName}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left: Category Tree (desktop) */}
          {!isMobile && (
            <div className="w-[30%] lg:w-[28%] flex flex-col border-r border-gray-800 bg-black/20 overflow-hidden">
              <CategoryTree
                categories={categories}
                parts={parts.filter(p => !p.is_archived)}
                selectedCategoryId={selectedCategoryId}
                expandedCategories={expandedCategories}
                searchTerm={catSearchTerm}
                onCategorySelect={handleCategorySelect}
                onToggleExpand={handleToggleExpand}
                onSearchChange={setCatSearchTerm}
              />
            </div>
          )}

          {/* Right: Results */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Mobile: Category selector button */}
            {isMobile && (
              <div className="px-3 pt-2 pb-1 shrink-0">
                <button
                  onClick={() => setShowMobileCatTree(true)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg border border-gray-700 bg-gray-900/50 text-sm text-gray-300 hover:border-gray-600"
                >
                  <Layers className="w-4 h-4 text-gray-500" />
                  <span className="flex-1 text-left truncate">
                    {categoryPath.length > 0 ? categoryPath.map(c => c.name).join(" / ") : "All Categories"}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            )}

            {/* Breadcrumb + Search */}
            <div className="px-3 pt-2 pb-2 space-y-2 shrink-0 border-b border-gray-800">
              {/* Breadcrumb */}
              {!isMobile && (
                <div className="flex items-center gap-2 min-h-[28px]">
                  {categoryPath.length > 0 ? (
                    <PartsBreadcrumb
                      path={categoryPath}
                      onNavigate={handleCategorySelect}
                      onClearSelection={() => setSelectedCategoryId(null)}
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 text-sm text-gray-400">
                      <Home className="w-3.5 h-3.5" /> ALL PARTS
                    </div>
                  )}
                </div>
              )}

              {/* Search + Select All */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search parts..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {visibleSelectableCount > 0 && (
                  <Button variant="outline" size="sm" onClick={selectAllVisible} className="h-8 text-xs gap-1 shrink-0">
                    <CheckSquare className="w-3.5 h-3.5" /> Select All
                  </Button>
                )}
              </div>

              {/* Results count */}
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
                <span>{filtered.length} part{filtered.length !== 1 ? "s" : ""}</span>
                {existingInView > 0 && <span>· {existingInView} already in group</span>}
              </div>
            </div>

            {/* Part Results */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {filtered.length === 0 ? (
                <EmptyState search={search} selectedCategoryId={selectedCategoryId} onClearSearch={() => setSearch("")} onClearCategory={() => setSelectedCategoryId(null)} />
              ) : allInGroup ? (
                <div className="text-center py-12">
                  <Layers className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">All matching parts are already in this Parts Group.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearch(""); setSelectedCategoryId(null); }}>
                    View All Parts
                  </Button>
                </div>
              ) : (
                <>
                  {paginatedParts.map(part => (
                    <AddPartsResultRow
                      key={part.id}
                      part={part}
                      isSelected={selected.has(part.id)}
                      isExisting={existingSet.has(part.id)}
                      inventoryData={inventoryMap[part.id]}
                      vendorsMap={vendorsMap}
                      catLookups={catLookups}
                      onToggle={() => toggle(part.id)}
                    />
                  ))}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-3 pb-1 text-xs">
                      <span className="text-gray-500">
                        Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, selectableParts.length)} of {selectableParts.length}
                      </span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Previous</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between shrink-0 bg-gray-950/80">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="font-medium text-white">{selected.size} selected</span>
            {selected.size > 0 && (
              <button onClick={clearSelection} className="text-red-400 hover:text-red-300 underline underline-offset-2">Clear</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={saving || newCount === 0}
              className="bg-red-600 hover:bg-red-700 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {saving ? "Adding…" : `Add ${newCount} Part${newCount !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>

        {/* Mobile Category Tree Sheet */}
        {isMobile && showMobileCatTree && (
          <MobileCategorySheet
            categories={categories}
            parts={parts.filter(p => !p.is_archived)}
            selectedCategoryId={selectedCategoryId}
            expandedCategories={expandedCategories}
            catSearchTerm={catSearchTerm}
            onCategorySelect={handleCategorySelect}
            onToggleExpand={handleToggleExpand}
            onSearchChange={setCatSearchTerm}
            onClose={() => setShowMobileCatTree(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ search, selectedCategoryId, onClearSearch, onClearCategory }) {
  if (search) {
    return (
      <div className="text-center py-12">
        <Search className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">No parts match this search.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onClearSearch}>Clear Search</Button>
      </div>
    );
  }
  return (
    <div className="text-center py-12">
      <Package className="w-10 h-10 text-gray-600 mx-auto mb-3" />
      <p className="text-gray-400 text-sm">No parts are available in this category.</p>
      {selectedCategoryId && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onClearCategory}>View All Parts</Button>
      )}
    </div>
  );
}

function MobileCategorySheet({ categories, parts, selectedCategoryId, expandedCategories, catSearchTerm, onCategorySelect, onToggleExpand, onSearchChange, onClose }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-950">
      <div className="flex items-center justify-between p-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Select Category</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-3 py-2 border-b border-gray-800">
        <button
          onClick={() => { onCategorySelect(null); }}
          className={cn(
            "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            !selectedCategoryId ? "bg-red-950/40 text-red-400" : "text-gray-300 hover:bg-gray-800/50"
          )}
        >
          All Parts
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <CategoryTree
          categories={categories}
          parts={parts}
          selectedCategoryId={selectedCategoryId}
          expandedCategories={expandedCategories}
          searchTerm={catSearchTerm}
          onCategorySelect={onCategorySelect}
          onToggleExpand={onToggleExpand}
          onSearchChange={onSearchChange}
        />
      </div>
    </div>
  );
}