import React, { useMemo } from "react";
import { Package, MapPin, ArrowRight, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "../locationTypeConfig";
import InventoryLocationEditor from "../InventoryLocationEditor";

/**
 * ZoneFilteredView — generic view for showing all inventory within a zone type.
 * Used for Receiving, Inspection, Warehouse, Shipping, etc.
 */
export default function ZoneFilteredView({ 
  locations, inventoryItems, parts, 
  zoneTypes, zoneLabel, zoneIcon: ZoneIcon, zoneColor,
  onNavigateLocation, emptyMessage
}) {
  const grouped = useMemo(() => {
    const partsMap = new Map(parts.map(p => [p.id, p]));
    
    // Find matching locations
    const zoneLocs = locations
      .filter(l => l.active !== false && zoneTypes.includes(l.location_type))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    return zoneLocs.map(loc => {
      const items = inventoryItems.filter(i => i.location_id === loc.id && (i.quantity_on_hand || 0) > 0);
      const tc = getLocationTypeConfig(loc.location_type);
      
      return {
        loc,
        tc,
        items: items.map(i => ({
          ...i,
          part: partsMap.get(i.part_id),
        })).filter(i => i.part).sort((a, b) => a.part.part_name.localeCompare(b.part.part_name)),
        totalUnits: items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0),
        partCount: new Set(items.map(i => i.part_id)).size,
      };
    });
  }, [locations, inventoryItems, parts, zoneTypes]);

  const totalParts = grouped.reduce((s, g) => s + g.partCount, 0);
  const totalUnits = grouped.reduce((s, g) => s + g.totalUnits, 0);

  if (totalParts === 0 && grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Inbox className="w-12 h-12 text-gray-600 mb-3" />
        <h3 className="text-base font-medium text-gray-400 mb-1">No {zoneLabel.toLowerCase()} locations</h3>
        <p className="text-sm text-gray-600 max-w-sm">
          {emptyMessage || `Configure ${zoneLabel.toLowerCase()} locations in Admin → Storage Locations.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-gray-300">
          {totalParts} parts · {totalUnits} units across {grouped.length} location{grouped.length !== 1 ? 's' : ''}
        </h3>
      </div>

      {grouped.map(group => {
        const TypeIcon = group.tc.icon;
        return (
          <div key={group.loc.id} className="rounded-xl border border-gray-800 bg-gray-900/30 overflow-hidden">
            {/* Location Header */}
            <button
              onClick={() => onNavigateLocation?.(group.loc.id)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800/30 hover:bg-gray-800/50 transition-colors text-left"
            >
              <TypeIcon className="w-4 h-4 shrink-0" style={{ color: group.loc.color || group.tc.color }} />
              <span className="text-sm font-medium text-white flex-1 truncate">{group.loc.location_area}</span>
              {group.loc.short_code && (
                <span className="text-[10px] font-mono text-gray-500">[{group.loc.short_code}]</span>
              )}
              <span className="text-xs text-gray-400">{group.partCount} parts</span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-600" />
            </button>

            {/* Items */}
            {group.items.length > 0 ? (
              <div className="divide-y divide-gray-800/40">
                {group.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center shrink-0">
                      {item.part.featured_photo ? (
                        <img src={item.part.featured_photo} alt="" className="w-7 h-7 rounded object-cover" />
                      ) : (
                        <Package className="w-3.5 h-3.5 text-gray-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-300 truncate block">{item.part.part_name}</span>
                      {item.part.vendor_part_number && (
                        <span className="text-[10px] font-mono text-gray-600">{item.part.vendor_part_number}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className="text-white font-medium">{item.quantity_on_hand}</span>
                      {(item.quantity_reserved || 0) > 0 && (
                        <span className="text-orange-400">{item.quantity_reserved} rsv</span>
                      )}
                    </div>
                    <InventoryLocationEditor
                      inventoryItemId={item.id}
                      currentLocationId={item.location_id}
                      compact
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-4 text-xs text-gray-600 text-center">
                Empty — no inventory at this location
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}