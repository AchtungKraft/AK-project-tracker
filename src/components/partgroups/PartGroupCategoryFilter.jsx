import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, FolderOpen, Folder, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { getAllDescendantIds } from "@/lib/categoryTreeHelpers";

/**
 * Lightweight category filter for Parts Group detail.
 * Shows only categories that have parts in the current group.
 * Uses the same recursive hierarchy as Parts Catalog.
 */
export default function PartGroupCategoryFilter({
  enrichedItems,
  categories,
  catLookups,
  selectedCategoryId,
  onSelect,
  onClose,
}) {
  const [expanded, setExpanded] = useState({});
  const [searchTerm, setSearchTerm] = useState("");

  // Collect category IDs present in the group's parts
  const groupCategoryIds = useMemo(() => {
    const ids = new Set();
    for (const item of enrichedItems) {
      const pcId = item.part?.part_category_id;
      if (pcId) ids.add(pcId);
    }
    return ids;
  }, [enrichedItems]);

  // Count group parts per category (recursive)
  const categoryCounts = useMemo(() => {
    const directCounts = {};
    for (const item of enrichedItems) {
      const pcId = item.part?.part_category_id;
      if (pcId) directCounts[pcId] = (directCounts[pcId] || 0) + 1;
    }

    const totalCounts = {};
    const addDescendantCounts = (catId) => {
      const children = catLookups.childrenByParentId[catId] || [];
      let total = directCounts[catId] || 0;
      for (const child of children) {
        total += addDescendantCounts(child.id);
      }
      totalCounts[catId] = total;
      return total;
    };

    const roots = catLookups.childrenByParentId["__root__"] || [];
    for (const root of roots) addDescendantCounts(root.id);
    return totalCounts;
  }, [enrichedItems, catLookups]);

  // Determine which categories to show — those with group items (recursive)
  const visibleCategoryIds = useMemo(() => {
    const visible = new Set();
    // For every category with parts in this group, add it and all its ancestors
    for (const catId of groupCategoryIds) {
      let cur = catId;
      while (cur && catLookups.byId[cur] && !visible.has(cur)) {
        visible.add(cur);
        cur = catLookups.byId[cur].parent_id;
      }
    }
    return visible;
  }, [groupCategoryIds, catLookups]);

  const filteredBySearch = useMemo(() => {
    if (!searchTerm) return null;
    const term = searchTerm.toLowerCase();
    const matched = new Set();
    for (const catId of visibleCategoryIds) {
      const cat = catLookups.byId[catId];
      if (cat?.name?.toLowerCase().includes(term)) {
        matched.add(catId);
        // Also add ancestors
        let cur = cat.parent_id;
        while (cur && catLookups.byId[cur]) {
          matched.add(cur);
          cur = catLookups.byId[cur].parent_id;
        }
      }
    }
    return matched;
  }, [searchTerm, visibleCategoryIds, catLookups]);

  const toggleExpand = (catId) => {
    setExpanded(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  const renderCategory = (cat, level = 0) => {
    if (!visibleCategoryIds.has(cat.id)) return null;
    if (filteredBySearch && !filteredBySearch.has(cat.id)) return null;

    const count = categoryCounts[cat.id] || 0;
    if (count === 0) return null;

    const children = (catLookups.childrenByParentId[cat.id] || [])
      .filter(c => visibleCategoryIds.has(c.id) && (categoryCounts[c.id] || 0) > 0);
    const hasChildren = children.length > 0;
    const isExpanded = expanded[cat.id] !== false; // default expanded
    const isSelected = selectedCategoryId === cat.id;

    return (
      <div key={cat.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-sm",
            isSelected ? "bg-red-950/40 text-red-400" : "hover:bg-gray-800/50 text-gray-300"
          )}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => onSelect(isSelected ? null : cat.id)}
        >
          {hasChildren ? (
            <button onClick={e => { e.stopPropagation(); toggleExpand(cat.id); }} className="shrink-0 hover:text-red-400">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <div className="w-3.5" />
          )}
          <div className="w-3.5 h-3.5 rounded-sm shrink-0" style={{ backgroundColor: (cat.color || "#6366F1") + "50" }} />
          <span className={cn("flex-1 truncate", isSelected && "font-semibold")}>{cat.name}</span>
          <span className={cn(
            "text-[11px] px-1.5 py-0.5 rounded-full shrink-0",
            isSelected ? "bg-red-600 text-white" : "bg-gray-800 text-gray-500"
          )}>
            {count}
          </span>
        </div>
        {hasChildren && isExpanded && children.map(child => renderCategory(child, level + 1))}
      </div>
    );
  };

  const roots = (catLookups.childrenByParentId["__root__"] || [])
    .filter(c => visibleCategoryIds.has(c.id) && (categoryCounts[c.id] || 0) > 0);

  return (
    <div className="w-[220px] flex flex-col bg-black/20 overflow-hidden shrink-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Categories</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      {roots.length > 3 && (
        <div className="px-2 py-1.5 border-b border-gray-800/50">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-7 h-7 text-xs"
            />
          </div>
        </div>
      )}

      {/* "All" option */}
      <div
        className={cn(
          "px-3 py-1.5 cursor-pointer text-sm transition-colors",
          !selectedCategoryId ? "bg-red-950/40 text-red-400 font-semibold" : "text-gray-400 hover:bg-gray-800/50"
        )}
        onClick={() => onSelect(null)}
      >
        All Categories ({enrichedItems.length})
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {roots.map(cat => renderCategory(cat))}
      </div>
    </div>
  );
}