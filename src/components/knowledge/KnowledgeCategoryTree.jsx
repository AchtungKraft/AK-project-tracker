import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, ChevronDown, FolderOpen, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

export default function KnowledgeCategoryTree({
  categories,
  items,
  selectedCategoryId,
  expandedCategories,
  searchTerm,
  onCategorySelect,
  onToggleExpand,
  onSearchChange,
}) {
  const [showEmpty, setShowEmpty] = React.useState(false);

  // Count items per category (including descendants)
  const categoryCounts = useMemo(() => {
    const counts = {};
    items.forEach(item => {
      if (item.category_id) counts[item.category_id] = (counts[item.category_id] || 0) + 1;
      if (item.subcategory_id) counts[item.subcategory_id] = (counts[item.subcategory_id] || 0) + 1;
    });
    // Roll up to parents
    const addDescendants = (categoryId) => {
      const children = categories.filter(c => c.parent_id === categoryId);
      let total = counts[categoryId] || 0;
      children.forEach(child => { total += addDescendants(child.id); });
      counts[categoryId] = total;
      return total;
    };
    categories.filter(c => !c.parent_id).forEach(c => addDescendants(c.id));
    return counts;
  }, [items, categories]);

  const filteredCategories = useMemo(() => {
    if (!searchTerm) return categories;
    const term = searchTerm.toLowerCase();
    return categories.filter(cat => cat.name?.toLowerCase().includes(term));
  }, [categories, searchTerm]);

  const renderCategory = (category, level = 0) => {
    const children = filteredCategories.filter(c => c.parent_id === category.id && c.active);
    const hasChildren = children.length > 0;
    const isExpanded = expandedCategories[category.id];
    const isSelected = selectedCategoryId === category.id;
    const count = categoryCounts[category.id] || 0;
    const isEmpty = count === 0;

    if (isEmpty && !showEmpty && !searchTerm) return null;

    return (
      <div key={category.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group",
            isSelected ? "bg-red-950/40 text-red-400" : "hover:bg-gray-800/50 text-gray-300",
            level > 0 && "border-l-2 border-gray-800",
            isEmpty && "opacity-50"
          )}
          style={{
            paddingLeft: `${(level * 16) + 12}px`,
            borderLeftColor: level > 0 ? category.color + '40' : 'transparent'
          }}
          onClick={() => {
            if (!isEmpty) {
              onCategorySelect(category.id);
              if (hasChildren && !isExpanded) onToggleExpand(category.id);
            }
          }}
        >
          {hasChildren && (
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(category.id); }} className="shrink-0 hover:text-red-400">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
          <div className="shrink-0">
            {hasChildren ? (
              isExpanded ? <FolderOpen className="w-4 h-4" style={{ color: category.color }} /> : <Folder className="w-4 h-4" style={{ color: category.color }} />
            ) : (
              <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: category.color + '50' }} />
            )}
          </div>
          <span className={cn("flex-1 text-sm font-medium truncate", isSelected && "font-semibold")} style={{ color: isSelected ? category.color : undefined }}>
            {category.name}
          </span>
          {count > 0 && (
            <span className={cn("shrink-0 text-xs px-2 py-0.5 rounded-full", isSelected ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400")}>
              {count}
            </span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>{children.map(child => renderCategory(child, level + 1))}</div>
        )}
      </div>
    );
  };

  const rootCategories = filteredCategories.filter(c => !c.parent_id && c.active);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-red-900/20">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input placeholder="Search categories..." value={searchTerm} onChange={e => onSearchChange(e.target.value)}
            className="pl-10 bg-gray-900/50 border-gray-700 text-white text-sm" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {rootCategories.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">{searchTerm ? 'No categories found' : 'No categories configured'}</div>
        ) : (
          <div className="py-2">{rootCategories.map(cat => renderCategory(cat, 0))}</div>
        )}
      </div>
      <div className="p-3 border-t border-red-900/20 space-y-2">
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-white transition-colors">
          <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} className="rounded border-gray-700 bg-gray-900 text-red-600 focus:ring-red-600" />
          Show empty categories
        </label>
        {selectedCategoryId && (
          <button onClick={() => onCategorySelect(null)} className="w-full text-sm text-gray-400 hover:text-red-400 transition-colors text-left">
            Clear Selection (Show All)
          </button>
        )}
      </div>
    </div>
  );
}