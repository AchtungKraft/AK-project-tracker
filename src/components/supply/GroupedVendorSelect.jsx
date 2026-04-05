import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

/**
 * GroupedVendorSelect — Renders ALL vendors grouped by VendorGroup.
 *
 * Data flows GROUPED from source → UI. No flattening.
 *
 * Props:
 *  - value: string (vendor id or "__none__")
 *  - onValueChange: (id) => void
 *  - vendorGroups: VendorGroup[] (sorted by priority)
 *  - vendorsByGroup: Map<groupId, ServiceVendor[]>
 *  - selectedGroupId?: string — the preferred group for the selected service (highlighted)
 *  - placeholder?: string
 *  - disabled?: boolean
 *  - className?: string
 *  - showNone?: boolean
 */
export default function GroupedVendorSelect({
  value,
  onValueChange,
  vendorGroups = [],
  vendorsByGroup = new Map(),
  selectedGroupId = null,
  placeholder = "Select vendor...",
  disabled = false,
  className = "bg-gray-800 border-gray-600 text-white mt-1",
  showNone = true,
}) {
  // Sort groups by priority
  const sortedGroups = [...vendorGroups].sort((a, b) =>
    (a.sort_priority || 0) - (b.sort_priority || 0)
  );

  // If a selectedGroupId is provided, show that group first, then the rest
  const orderedGroups = selectedGroupId
    ? [
        ...sortedGroups.filter(g => g.id === selectedGroupId),
        ...sortedGroups.filter(g => g.id !== selectedGroupId),
      ]
    : sortedGroups;

  // Build visible entries
  const groupedEntries = [];
  const usedIds = new Set();

  for (const group of orderedGroups) {
    const groupVendors = vendorsByGroup.get(group.id) || [];
    if (groupVendors.length > 0) {
      groupedEntries.push({ group, vendors: groupVendors });
      groupVendors.forEach(v => usedIds.add(v.id));
    }
  }

  // Ungrouped vendors (those in __ungrouped__ bucket)
  const ungrouped = vendorsByGroup.get("__ungrouped__") || [];
  const ungroupedFiltered = ungrouped.filter(v => !usedIds.has(v.id));

  const hasAnyVendors = groupedEntries.length > 0 || ungroupedFiltered.length > 0;

  return (
    <Select value={value || "__none__"} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {showNone && <SelectItem value="__none__">None</SelectItem>}

        {groupedEntries.map(({ group, vendors: gv }) => (
          <React.Fragment key={group.id}>
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-t border-gray-700/50 mt-1 first:mt-0 first:border-t-0 flex items-center gap-1.5">
              {group.name}
              {selectedGroupId === group.id && (
                <Badge variant="outline" className="text-[8px] px-1 py-0 border-green-600 text-green-400 ml-auto">
                  Match
                </Badge>
              )}
            </div>
            {gv.map(v => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </React.Fragment>
        ))}

        {ungroupedFiltered.length > 0 && (
          <>
            {groupedEntries.length > 0 && (
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-t border-gray-700/50 mt-1">
                Other
              </div>
            )}
            {ungroupedFiltered.map(v => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </>
        )}

        {!hasAnyVendors && (
          <div className="px-2 py-2 text-xs text-gray-500">No vendors available</div>
        )}
      </SelectContent>
    </Select>
  );
}