import React, { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildHierarchicalServiceOptions } from "@/components/supply/vendorGroupHierarchy";

/**
 * HierarchicalServiceSelect — PHASE 5 hardened.
 * 
 * Visual hierarchy with group separators, depth indentation, and arrow indicators:
 *   ── Finishing ──────────────────
 *     ↳ Chrome Plating
 *         Chrome Plating Service
 *         Nickel Chrome
 *     ↳ Powder Coating
 *         Powder Coat
 *   ── Shipping ──────────────────
 *       UPS Ground
 *       FedEx Express
 */
export default function HierarchicalServiceSelect({
  services = [],
  vendorGroups = [],
  groupsMap = new Map(),
  value,
  onValueChange,
  disabled = false,
  placeholder = "Select a service...",
}) {
  const hierarchicalEntries = useMemo(() => {
    const validServices = services.filter(
      s => s.preferred_vendor_group_id && groupsMap.has(s.preferred_vendor_group_id)
    );
    return buildHierarchicalServiceOptions(validServices, vendorGroups, "SERVICE");
  }, [services, vendorGroups, groupsMap]);

  // Track previous entry to insert separators between root groups
  let lastRootGroupId = null;

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {hierarchicalEntries.map((entry) => {
          if (entry.type === "group") {
            const leftPad = 8 + entry.depth * 16;
            const isRoot = entry.depth === 0;

            // Insert separator between root groups
            const needsSeparator = isRoot && lastRootGroupId !== null;
            if (isRoot) lastRootGroupId = entry.group.id;

            return (
              <div key={`group-${entry.group.id}`}>
                {/* PHASE 5: Group separation */}
                {needsSeparator && (
                  <div className="border-t border-gray-700/40 my-1" />
                )}
                <div
                  className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 select-none"
                  style={{ paddingLeft: `${leftPad}px`, paddingRight: '8px' }}
                >
                  {entry.depth > 0 && <span className="opacity-50 mr-1">↳</span>}
                  {entry.group.name}
                </div>
              </div>
            );
          }

          // type === 'service' — indent under its group
          const leftPad = entry.depth * 16 + 12;
          return (
            <SelectItem
              key={entry.service.id}
              value={entry.service.id}
              className="text-sm"
              style={{ paddingLeft: `${leftPad}px` }}
            >
              {entry.service.name}
            </SelectItem>
          );
        })}
        {hierarchicalEntries.filter(e => e.type === "service").length === 0 && (
          <div className="px-2 py-2 text-xs text-gray-500">No services available</div>
        )}
      </SelectContent>
    </Select>
  );
}