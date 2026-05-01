import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Package, Eye } from "lucide-react";
import useReferenceData from "@/components/common/useReferenceData";
import PartModal from "@/components/parts/PartModal";

/**
 * Availability-based grouping config.
 * Groups by what the technician can act on — NOT lifecycle state.
 */
const AVAILABILITY_GROUPS = {
  in_stock:    { priority: 0, label: "In Stock",    color: "text-emerald-400", dotColor: "bg-emerald-500" },
  ordered:     { priority: 1, label: "On Order",    color: "text-blue-400",    dotColor: "bg-blue-500" },
  installed:   { priority: 2, label: "Installed",   color: "text-gray-400",    dotColor: "bg-gray-500" },
  unavailable: { priority: 3, label: "Unavailable", color: "text-gray-600",    dotColor: "bg-gray-700" },
};

/**
 * Resolve availability from commitment quantities.
 * Simple decision logic — no lifecycle state dependency.
 */
function resolvePartAvailability(commitment) {
  if (!commitment) return "unavailable";
  const rt = commitment.required_total ?? 0;
  const qr = commitment.qty_removed ?? 0;
  const qi = commitment.qty_installed ?? 0;
  const rfs = commitment.reserved_from_stock ?? 0;
  const cfp = commitment.covered_from_po ?? 0;

  const effectiveReq = Math.max(0, rt - qr);
  const availableQty = Math.max(0, effectiveReq - qi);

  if (availableQty <= 0) {
    return qi > 0 ? "installed" : "unavailable";
  }
  if (rfs > 0) return "in_stock";
  if (cfp > 0) return "ordered";
  return "unavailable";
}

/**
 * Groups parts by availability, then by category, sorted alphabetically.
 */
function groupPartsForTaskSelection(options) {
  const groups = {};
  for (const opt of options) {
    const key = opt.availability;
    if (!groups[key]) groups[key] = [];
    groups[key].push(opt);
  }

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    return (AVAILABILITY_GROUPS[a]?.priority ?? 99) - (AVAILABILITY_GROUPS[b]?.priority ?? 99);
  });

  return sortedKeys.map(key => {
    const items = groups[key];
    // Sub-group by category
    const catBuckets = {};
    for (const item of items) {
      const cat = item.categoryName || "Other";
      if (!catBuckets[cat]) catBuckets[cat] = [];
      catBuckets[cat].push(item);
    }
    const sortedCats = Object.keys(catBuckets).sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    for (const cat of sortedCats) {
      catBuckets[cat].sort((a, b) => a.name.localeCompare(b.name));
    }
    return {
      key,
      config: AVAILABILITY_GROUPS[key],
      categories: sortedCats.map(cat => ({ name: cat, items: catBuckets[cat] })),
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
  const [viewPartId, setViewPartId] = useState(null);
  const { categoriesMap } = useReferenceData();

  // Normalize commitments into selector options
  const allOptions = useMemo(() => {
    if (!commitments || !partsMap) return [];
    return commitments
      .map(c => {
        const part = partsMap[c.part_id];
        if (!part || part.is_archived) return null;

        const rawStatus = (c.commitment_status || "").toLowerCase();
        if (rawStatus === "cancelled" || rawStatus === "closed") return null;

        const rt = c.required_total ?? 0;
        const qr = c.qty_removed ?? 0;
        const qi = c.qty_installed ?? 0;
        const rfs = c.reserved_from_stock ?? 0;
        const cfp = c.covered_from_po ?? 0;
        const availableQty = Math.max(0, rt - qr - qi);
        const availability = resolvePartAvailability(c);

        const category = categoriesMap[part.part_category_id];
        return {
          id: part.id,
          commitmentId: c.id,
          name: part.part_name,
          availableQty,
          orderedQty: cfp,
          installedQty: qi,
          availability,
          categoryName: category?.name || (part.category || "Other"),
        };
      })
      .filter(Boolean);
  }, [commitments, partsMap, categoriesMap]);

  // Apply search — preserves grouping
  const filtered = useMemo(() => {
    if (!search.trim()) return allOptions;
    const q = search.toLowerCase();
    return allOptions.filter(opt =>
      opt.name.toLowerCase().includes(q) ||
      opt.categoryName.toLowerCase().includes(q)
    );
  }, [allOptions, search]);

  // Group + sort
  const grouped = useMemo(() => groupPartsForTaskSelection(filtered), [filtered]);

  const totalCount = allOptions.length;

  return (
    <>
      <div className="bg-gray-900/60 rounded-lg border border-gray-700 overflow-hidden">
        {/* Search */}
        <div className="p-2 border-b border-gray-700/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${totalCount} parts...`}
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
              <div key={group.key}>
                {/* Availability header */}
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
                    {group.categories.length > 1 && (
                      <div className="px-4 py-1 text-[10px] text-gray-500 uppercase tracking-wide bg-gray-900/50">
                        {cat.name}
                      </div>
                    )}

                    {cat.items.map(item => {
                      const isSelected = selectedPartId === item.id;
                      return (
                        <div
                          key={item.commitmentId}
                          className={cn(
                            "w-full flex items-center transition-colors",
                            isSelected
                              ? "bg-red-900/40 border-l-2 border-red-500"
                              : "hover:bg-gray-800/70 border-l-2 border-transparent"
                          )}
                        >
                          {/* Selectable row area */}
                          <button
                            type="button"
                            onClick={() => onSelect(item.id, item.commitmentId, item.availableQty)}
                            className="flex-1 text-left px-3 py-2 flex items-center gap-3 min-w-0"
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

                          {/* View detail button — isolated click target */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewPartId(item.id);
                            }}
                            className="px-2 py-2 text-gray-500 hover:text-white hover:bg-gray-700/50 rounded-r-lg transition-colors flex-shrink-0"
                            title="View part details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Part detail modal — opens without breaking selection flow */}
      {viewPartId && (
        <PartModal
          partId={viewPartId}
          onClose={() => setViewPartId(null)}
        />
      )}
    </>
  );
}