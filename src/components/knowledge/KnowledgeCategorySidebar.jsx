import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, FolderOpen, Folder } from "lucide-react";

export default function KnowledgeCategorySidebar({ 
  categories, 
  selectedCategoryId, 
  onSelectCategory, 
  itemCountsByCategory 
}) {
  const tree = useMemo(() => {
    const parents = categories
      .filter(c => !c.parent_id && c.active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    return parents.map(parent => ({
      ...parent,
      children: categories
        .filter(c => c.parent_id === parent.id && c.active)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    }));
  }, [categories]);

  const [expanded, setExpanded] = React.useState(() => {
    // Auto-expand the parent of the selected category
    if (selectedCategoryId) {
      const selected = categories.find(c => c.id === selectedCategoryId);
      if (selected?.parent_id) return new Set([selected.parent_id]);
    }
    return new Set();
  });

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getCount = (id) => itemCountsByCategory?.[id] || 0;
  const getParentCount = (parent) => {
    let total = getCount(parent.id);
    parent.children.forEach(c => total += getCount(c.id));
    return total;
  };

  return (
    <nav className="space-y-0.5">
      {/* All items */}
      <button
        onClick={() => onSelectCategory(null)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
          !selectedCategoryId
            ? "bg-red-600/20 text-red-400 border border-red-500/30"
            : "text-gray-300 hover:bg-gray-800/50"
        )}
      >
        <FolderOpen className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">All Items</span>
      </button>

      {tree.map(parent => {
        const isExpanded = expanded.has(parent.id);
        const isSelected = selectedCategoryId === parent.id;
        const parentCount = getParentCount(parent);

        return (
          <div key={parent.id}>
            <button
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                isSelected
                  ? "bg-red-600/20 text-red-400 border border-red-500/30"
                  : "text-gray-300 hover:bg-gray-800/50"
              )}
              onClick={() => {
                if (parent.children.length > 0) toggleExpand(parent.id);
                onSelectCategory(parent.id);
              }}
            >
              {parent.children.length > 0 && (
                <ChevronRight className={cn("w-3 h-3 shrink-0 transition-transform", isExpanded && "rotate-90")} />
              )}
              {parent.children.length === 0 && <div className="w-3" />}
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: parent.color }} />
              <span className="flex-1 text-left truncate">{parent.name}</span>
              {parentCount > 0 && (
                <span className="text-xs text-gray-500">{parentCount}</span>
              )}
            </button>

            {isExpanded && parent.children.map(child => {
              const isChildSelected = selectedCategoryId === child.id;
              const childCount = getCount(child.id);
              return (
                <button
                  key={child.id}
                  className={cn(
                    "w-full flex items-center gap-2 pl-9 pr-3 py-1.5 rounded-md text-sm transition-colors",
                    isChildSelected
                      ? "bg-red-600/20 text-red-400 border border-red-500/30"
                      : "text-gray-400 hover:bg-gray-800/50"
                  )}
                  onClick={() => onSelectCategory(child.id)}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: child.color }} />
                  <span className="flex-1 text-left truncate">{child.name}</span>
                  {childCount > 0 && (
                    <span className="text-xs text-gray-500">{childCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}