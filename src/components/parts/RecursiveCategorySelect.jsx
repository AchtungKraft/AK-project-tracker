import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildCategoryLookups, getCategoryPathLabel, getCategoryPath } from "@/lib/categoryTreeHelpers";

/**
 * Shared recursive category selector for Part Create/Edit.
 * Features:
 * - Searchable tree with recursive depth
 * - Controlled expand/collapse with auto-expand to selected
 * - Scroll-to-selected on open
 * - Viewport-aware height via ScrollArea
 * - Indentation capped at depth 6 to prevent overflow
 */
export default function RecursiveCategorySelect({ categories, value, onChange, className }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const scrollRef = useRef(null);
  const selectedRef = useRef(null);

  const catLookups = useMemo(() => buildCategoryLookups(categories), [categories]);
  const activeCategories = useMemo(() => categories.filter(c => c.active !== false), [categories]);

  // Build set of ancestor IDs for the current value (auto-expand on open)
  const valueAncestors = useMemo(() => {
    if (!value || !catLookups.byId[value]) return new Set();
    const ancestors = new Set();
    const path = getCategoryPath(value, catLookups.byId);
    for (const seg of path) {
      if (seg.id !== value) ancestors.add(seg.id);
    }
    return ancestors;
  }, [value, catLookups]);

  // Expanded state — auto-expand ancestors of selected value
  const [expanded, setExpanded] = useState(() => new Set(valueAncestors));

  // When value changes or popover opens, ensure ancestors are expanded
  useEffect(() => {
    if (open) {
      setExpanded(prev => {
        const next = new Set(prev);
        for (const id of valueAncestors) next.add(id);
        return next;
      });
      // Scroll to selected after a brief render delay
      requestAnimationFrame(() => {
        setTimeout(() => {
          selectedRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 100);
      });
    }
  }, [open, valueAncestors]);

  // Selected category path label
  const selectedLabel = useMemo(() => {
    if (!value || !catLookups.byId[value]) return null;
    return getCategoryPathLabel(value, catLookups.byId);
  }, [value, catLookups]);

  // Search filtering
  const searchMatched = useMemo(() => {
    if (!searchTerm) return null;
    const term = searchTerm.toLowerCase();
    const matched = new Set();
    for (const cat of activeCategories) {
      const pathLabel = getCategoryPathLabel(cat.id, catLookups.byId);
      if (cat.name?.toLowerCase().includes(term) || pathLabel?.toLowerCase().includes(term)) {
        matched.add(cat.id);
        let cur = cat.parent_id;
        while (cur && catLookups.byId[cur]) {
          matched.add(cur);
          cur = catLookups.byId[cur].parent_id;
        }
      }
    }
    return matched;
  }, [searchTerm, activeCategories, catLookups]);

  const handleSelect = (catId) => {
    onChange(catId);
    setOpen(false);
    setSearchTerm("");
  };

  const toggleExpand = useCallback((catId, e) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }, []);

  const renderCategory = (cat, level = 0) => {
    if (cat.active === false) return null;
    if (searchMatched && !searchMatched.has(cat.id)) return null;

    const children = (catLookups.childrenByParentId[cat.id] || []).filter(c => c.active !== false);
    const hasChildren = children.length > 0;
    const isSelected = value === cat.id;
    const isExpanded = searchMatched ? true : expanded.has(cat.id);
    // Cap indentation at depth 6 to prevent horizontal overflow
    const indent = Math.min(level, 6) * 14 + 8;

    return (
      <div key={cat.id}>
        <div
          ref={isSelected ? selectedRef : undefined}
          className={cn(
            "flex items-center w-full text-left px-2 py-1.5 text-sm transition-colors rounded group",
            isSelected ? "bg-red-950/50 text-red-400 font-medium" : "text-gray-200 hover:bg-gray-800"
          )}
          style={{ paddingLeft: `${indent}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => toggleExpand(cat.id, e)}
              className="w-4 h-4 flex items-center justify-center shrink-0 text-gray-500 hover:text-gray-300 mr-1"
            >
              {isExpanded
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />
              }
            </button>
          ) : (
            <div className="w-4 mr-1 shrink-0" />
          )}
          <button
            type="button"
            onClick={() => handleSelect(cat.id)}
            className="flex items-center gap-1.5 flex-1 min-w-0"
            title={getCategoryPathLabel(cat.id, catLookups.byId)}
          >
            <div
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: (cat.color || "#6366F1") + "80" }}
            />
            <span className="truncate">{cat.name}</span>
          </button>
        </div>
        {isExpanded && children.map(child => renderCategory(child, level + 1))}
      </div>
    );
  };

  const roots = (catLookups.childrenByParentId["__root__"] || []).filter(c => c.active !== false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-9 font-normal",
            "bg-gray-800 border-gray-700 text-white hover:bg-gray-700",
            !value && "text-gray-400",
            className
          )}
        >
          <span className="truncate text-left flex-1" title={selectedLabel || undefined}>
            {selectedLabel || "Select category..."}
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] p-0"
        align="start"
        side="bottom"
        avoidCollisions
        collisionPadding={16}
      >
        {/* Search — pinned above scroll */}
        <div className="p-2 border-b border-gray-800">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <Input
              placeholder="Search categories..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-7 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        {/* Scrollable tree */}
        <ScrollArea className="max-h-[min(320px,50vh)]" ref={scrollRef}>
          <div className="p-1">
            {/* None option */}
            <button
              type="button"
              onClick={() => handleSelect("")}
              className={cn(
                "flex items-center gap-1.5 w-full text-left px-2 py-1.5 text-sm rounded",
                !value ? "bg-red-950/50 text-red-400 font-medium" : "text-gray-400 hover:bg-gray-800"
              )}
            >
              <X className="w-3 h-3 shrink-0 opacity-50" />
              <span>None</span>
            </button>
            {roots.map(cat => renderCategory(cat))}
            {searchMatched && searchMatched.size === 0 && (
              <div className="text-center py-4 text-sm text-gray-500">No categories match</div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}