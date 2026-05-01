import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Package } from "lucide-react";
import { resolveLifecycleState, getLifecycleLabel } from "@/components/supply/resolveCommitmentStateLocal";
import useReferenceData from "@/components/common/useReferenceData";

/**
 * Lifecycle state → grouping priority + display config
 * Matches Supply Dashboard exactly.
 */
const STATE_GROUP_CONFIG = {
  INSTALL_READY: { priority: 0, label: "Ready to Install", color: "text-emerald-400", dotColor: "bg-emerald-500" },
  COVERED:       { priority: 1, label: "On Order",          color: "text-blue-400",    dotColor: "bg-blue-500" },
  NEEDS_ORDER:   { priority: 2, label: "Needs Order",       color: "text-amber-400",   dotColor: "bg-amber-500" },
  PLANNED:       { priority: 3, label: "Planned",           color: "text-gray-300",    dotColor: "bg-gray-400" },
  INSTALLED:     { priority: 4, label: "Installed",          color: "text-gray-500",    dotColor: "bg-gray-600" },
  CANCELLED:     { priority: 9, label: "Cancelled",          color: "text-gray-600",    dotColor: "bg-gray-700" },
  CLOSED:        { priority: 9, label: "Closed",             color: "text-gray-600",    dotColor: "bg-gray-700" },
};

/**
 * Groups parts by lifecycle state, then by category, sorted alphabetically.
 */
function groupPartsForSelection(options) {
  // Group by lifecycle state
  const stateGroups = {};
  for (const opt of options) {
    const state = opt.lifecycleState;
    if (!stateGroups[state]) stateGroups[state] = [];
    stateGroups[state].push(opt);
  }

  // Sort state groups by priority
  const sortedStates = Object.keys(stateGroups).sort((a, b) => {
    return (STATE_GROUP_CONFIG[a]?.priority ?? 99) - (STATE_GROUP_CONFIG[b]?.priority ?? 99);
  });

  // Within each state, group by category then sort by name
  return sortedStates.map(state => {
    const items = stateGroups[state];
    const categoryBuckets = {};
    for (const item of items) {
      const cat = item.categoryName || "Other";
      if (!categoryBuckets[cat]) categoryBuckets[cat] = [];
      categoryBuckets[cat].push(item);
    }
    // Sort categories alphabetically, "Other" last
    const sortedCategories = Object.keys(categoryBuckets).sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    // Sort items within each category alphabetically
    for (const cat of sortedCategories) {
      categoryBuckets[cat].sort((a, b) => a.name.localeCompare(b.name));
    }
    return {
      state,
      config: STATE_GROUP_CONFIG[state] || STATE_GROUP_CONFIG.PLANNED,
      categories: sortedCategories.map(cat => ({
        name: cat,
        items: categoryBuckets[cat],
      })),
      totalCount: items.length,
    };
  });
}

export default function TaskPartSelector({
  commitments,
  partsMap,
  selectedPartId,
  onSelect,
}) {
  const [search, setSearch] = useState("");
  const { categoriesMap } = useReferenceData();

  // Build normalized options from commitments
  const allOptions = useMemo(() => {
    if (!commitments || !partsMap) return [];
    return commitments
      .map(c => {
        const part = partsMap[c.part_id];
        if (!part || part.is_archived) return null;
        const lifecycleState = resolveLifecycleState(c);
        const rt = c.required_total ?? 0;
        const qr = c.qty_removed ?? 0;
        const qi = c.qty_installed ?? 0;
        const availableQty = Math.max(0, rt - qr - qi);
        const category = categoriesMap[part.part_category_id];
        return {
          id: part.id,
          commitmentId: c.id,
          name: part.part_name,
          availableQty,
          lifecycleState,
          lifecycleLabel: getLifecycleLabel(c),
          categoryName: category?.name || (part.category || "Other"),
          partType: part.part_type,
        };
      })
      .filter(Boolean)
      // Exclude fully installed / cancelled / closed (nothing to link)
      .filter(opt => !["INSTALLED", "CANCELLED", "CLOSED"].includes(opt.lifecycleState));
  }, [commitments, partsMap, categoriesMap]);

  // Apply search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return allOptions;
    const q = search.toLowerCase();
    return allOptions.filter(opt =>
      opt.name.toLowerCase().includes(q) ||
      opt.categoryName.toLowerCase().includes(q)
    );
  }, [allOptions, search]);

  // Group filtered options
  const grouped = useMemo(() => groupPartsForSelection(filtered), [filtered]);

  const totalAvailable = allOptions.length;

  return (
    <div className="bg-gray-900/60 rounded-lg border border-gray-700 overflow-hidden">
      {/* Search */}
      <div className="p-2 border-b border-gray-700/50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${totalAvailable} parts...`}
            className="pl-8 h-8 bg-gray-800 border-gray-700 text-white text-sm"
          />
        </div>
      </div>

      {/* Grouped list */}
      <div className="max-h-64 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {search ? "No matching parts" : "No available parts for this project"}
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.state}>
              {/* State header */}
              <div className={cn(
                "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider sticky top-0 bg-gray-900/95 border-b border-gray-800 flex items-center gap-1.5",
                group.config.color
              )}>
                <div className={cn("w-1.5 h-1.5 rounded-full", group.config.dotColor)} />
                {group.config.label}
                <span className="text-gray-600 ml-auto">{group.totalCount}</span>
              </div>

              {group.categories.map(cat => (
                <div key={cat.name}>
                  {/* Category sub-header (only if more than one category in group) */}
                  {group.categories.length > 1 && (
                    <div className="px-4 py-1 text-[10px] text-gray-500 uppercase tracking-wide bg-gray-900/50">
                      {cat.name}
                    </div>
                  )}

                  {cat.items.map(item => {
                    const isSelected = selectedPartId === item.id;
                    return (
                      <button
                        key={item.commitmentId}
                        type="button"
                        onClick={() => onSelect(item.id, item.commitmentId, item.availableQty)}
                        className={cn(
                          "w-full text-left px-3 py-2 flex items-center gap-3 transition-colors",
                          isSelected
                            ? "bg-red-900/40 border-l-2 border-red-500"
                            : "hover:bg-gray-800/70 border-l-2 border-transparent"
                        )}
                      >
                        <Package className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{item.name}</div>
                          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                            <span>{item.categoryName}</span>
                            <span>•</span>
                            <span>Available: {item.availableQty}</span>
                          </div>
                        </div>
                        {item.availableQty > 0 && (
                          <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-400 flex-shrink-0">
                            {item.availableQty}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}