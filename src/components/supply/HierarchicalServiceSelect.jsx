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
 * HierarchicalServiceSelect — Renders services grouped by vendor group hierarchy.
 * 
 * Shows group headers (root & child) with services nested underneath.
 * Example dropdown:
 *   ── Finishing ──
 *     ── Chrome Plating ──
 *       Chrome Plating Service
 *       Nickel Chrome
 *     ── Powder Coating ──
 *       Powder Coat
 *   ── Shipping ──
 *     UPS Ground
 *     FedEx Express
 *
 * Props:
 *  - services: Service[] (active services)
 *  - vendorGroups: VendorGroup[] (SERVICE type)
 *  - groupsMap: Map<groupId, VendorGroup>
 *  - value: string (service id)
 *  - onValueChange: (serviceId) => void
 *  - disabled?: boolean
 *  - placeholder?: string
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

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {hierarchicalEntries.map((entry, idx) => {
          if (entry.type === "group") {
            const indent = entry.depth > 0 ? "pl-" + (entry.depth * 3) : "";
            return (
              <div
                key={`group-${entry.group.id}`}
                className={`px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-t border-gray-700/50 mt-1 first:mt-0 first:border-t-0 ${indent}`}
                style={entry.depth > 0 ? { paddingLeft: `${8 + entry.depth * 12}px` } : undefined}
              >
                {entry.depth > 0 ? `↳ ${entry.group.name}` : entry.group.name}
              </div>
            );
          }
          // type === 'service'
          return (
            <SelectItem
              key={entry.service.id}
              value={entry.service.id}
              className="text-sm"
            >
              <span style={{ paddingLeft: `${entry.depth * 8}px` }}>
                {entry.service.name}
              </span>
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