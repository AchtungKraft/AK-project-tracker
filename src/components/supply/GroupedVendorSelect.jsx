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
 * GroupedVendorSelect — Renders vendors grouped by VendorGroup.
 *
 * Props:
 *  - value: string (vendor id or "__none__")
 *  - onValueChange: (id) => void
 *  - vendors: ServiceVendor[] (filtered list to show)
 *  - vendorGroups: VendorGroup[] (all groups)
 *  - groupsMap: Map<groupId, VendorGroup>
 *  - vendorsByGroup: Map<groupId, ServiceVendor[]>
 *  - matchedGroup: VendorGroup | null (highlighted group)
 *  - placeholder?: string
 *  - disabled?: boolean
 *  - className?: string
 *  - showNone?: boolean
 *  - showAllGrouped?: boolean — if true, render ALL vendors grouped (ignores vendors prop for grouping)
 */
export default function GroupedVendorSelect({
  value,
  onValueChange,
  vendors = [],
  vendorGroups = [],
  groupsMap = new Map(),
  vendorsByGroup = new Map(),
  matchedGroup = null,
  placeholder = "Select vendor...",
  disabled = false,
  className = "bg-gray-800 border-gray-600 text-white mt-1",
  showNone = true,
  showAllGrouped = false,
}) {
  // Build grouped structure from the provided vendor list
  const vendorIds = new Set(vendors.map(v => v.id));

  // Group vendors that are in the filtered list
  const groupedEntries = [];
  const usedIds = new Set();

  // Sort groups by priority
  const sortedGroups = [...vendorGroups].sort((a, b) =>
    (a.sort_priority || 0) - (b.sort_priority || 0)
  );

  for (const group of sortedGroups) {
    const groupVendors = showAllGrouped
      ? (vendorsByGroup.get(group.id) || [])
      : (vendorsByGroup.get(group.id) || []).filter(v => vendorIds.has(v.id));
    if (groupVendors.length > 0) {
      groupedEntries.push({ group, vendors: groupVendors });
      groupVendors.forEach(v => usedIds.add(v.id));
    }
  }

  // Ungrouped vendors
  const ungrouped = vendors.filter(v => !usedIds.has(v.id));

  return (
    <Select value={value || "__none__"} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {showNone && <SelectItem value="__none__">None</SelectItem>}

        {groupedEntries.map(({ group, vendors: gv }) => (
          <React.Fragment key={group.id}>
            {/* Group header — rendered as a disabled item for visual separation */}
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-t border-gray-700/50 mt-1 first:mt-0 first:border-t-0 flex items-center gap-1.5">
              {group.name}
              {matchedGroup?.id === group.id && (
                <Badge variant="outline" className="text-[8px] px-1 py-0 border-green-600 text-green-400 ml-auto">
                  Match
                </Badge>
              )}
            </div>
            {gv.map(v => (
              <SelectItem key={v.id} value={v.id}>
                <span className="flex items-center gap-2">
                  <span>{v.name}</span>
                </span>
              </SelectItem>
            ))}
          </React.Fragment>
        ))}

        {ungrouped.length > 0 && (
          <>
            {groupedEntries.length > 0 && (
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-t border-gray-700/50 mt-1">
                Other
              </div>
            )}
            {ungrouped.map(v => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </>
        )}

        {vendors.length === 0 && (
          <div className="px-2 py-2 text-xs text-gray-500">No vendors available</div>
        )}
      </SelectContent>
    </Select>
  );
}