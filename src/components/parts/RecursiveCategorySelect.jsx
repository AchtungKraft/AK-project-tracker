import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildCategoryLookups, getCategoryPathLabel } from "@/lib/categoryTreeHelpers";

/**
 * Shared recursive category selector for Part Create/Edit.
 * Replaces the flat <Select> with a searchable, indented tree popover.
 * Supports arbitrary depth and shows full path when closed.
 */
export default function RecursiveCategorySelect({ categories, value, onChange, className }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const catLookups = useMemo(() => buildCategoryLookups(categories), [categories]);

  const activeCategories = useMemo(() => categories.filter(c => c.active !== false), [categories]);

  // Selected category path label
  const selectedLabel = useMemo(() => {
    if (!value || !catLookups.byId[value]) return null;
    return getCategoryPathLabel(value, catLookups.byId);
  }, [value, catLookups]);

  // Search filtering — match by name or full path
  const searchMatched = useMemo(() => {
    if (!searchTerm) return null;
    const term = searchTerm.toLowerCase();
    const matched = new Set();
    for (const cat of activeCategories) {
      const pathLabel = getCategoryPathLabel(cat.id, catLookups.byId);
      if (cat.name?.toLowerCase().includes(term) || pathLabel?.toLowerCase().includes(term)) {
        matched.add(cat.id);
        // Add ancestors
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

  const renderCategory = (cat, level = 0) => {
    if (cat.active === false) return null;
    if (searchMatched && !searchMatched.has(cat.id)) return null;

    const children = (catLookups.childrenByParentId[cat.id] || []).filter(c => c.active !== false);
    const isSelected = value === cat.id;

    return (
      <div key={cat.id}>
        <button
          type="button"
          onClick={() => handleSelect(cat.id)}
          className={cn(
            "flex items-center gap-1.5 w-full text-left px-2 py-1.5 text-sm transition-colors rounded",
            isSelected ? "bg-red-950/50 text-red-400 font-medium" : "text-gray-200 hover:bg-gray-800"
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          title={getCategoryPathLabel(cat.id, catLookups.byId)}
        >
          {children.length > 0 ? (
            <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
          ) : (
            <div className="w-3 shrink-0" />
          )}
          <div
            className="w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: (cat.color || "#6366F1") + "80" }}
          />
          <span className="truncate">{cat.name}</span>
        </button>
        {children.map(child => renderCategory(child, level + 1))}
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
      <PopoverContent className="w-[320px] p-0" align="start">
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
        <div className="max-h-[280px] overflow-y-auto p-1">
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
      </PopoverContent>
    </Popover>
  );
}