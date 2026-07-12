import React, { useMemo } from "react";
import { 
  ArrowDownToLine, Search, Package, MapPin, Truck, 
  ClipboardCheck, FolderKanban, ShoppingCart, Clock,
  AlertTriangle, Inbox
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "./locationTypeConfig";

const ZONE_CONFIGS = [
  { key: 'receiving',   label: 'Receiving',         icon: ArrowDownToLine, types: ['receiving'],   color: '#22C55E' },
  { key: 'inspection',  label: 'Inspection',        icon: ClipboardCheck,  types: ['inspection'],  color: '#F59E0B' },
  { key: 'project',     label: 'Project Storage',   icon: FolderKanban,    types: ['project_storage', 'project_shelf', 'project_cart', 'engine_stand', 'body_buck', 'parts_tote'], color: '#A855F7' },
  { key: 'warehouse',   label: 'Warehouse',         icon: Package,         types: ['warehouse', 'shelf', 'rack', 'bin', 'aisle'], color: '#3B82F6' },
  { key: 'carts',       label: 'Technician Carts',  icon: ShoppingCart,    types: ['cart', 'engine_cart', 'body_cart', 'tech_cart'], color: '#EF4444' },
  { key: 'staging',     label: 'Staging',           icon: Truck,           types: ['staging', 'shipping'], color: '#06B6D4' },
];

export default function StorageDashboard({ locations, inventoryItems, onSelectZone }) {
  const stats = useMemo(() => {
    const result = {};

    // Build location type → IDs map
    const typeLocMap = {};
    locations.forEach(loc => {
      if (!loc.active && loc.active !== undefined) return;
      const t = loc.location_type || 'other';
      if (!typeLocMap[t]) typeLocMap[t] = [];
      typeLocMap[t].push(loc.id);
    });

    // Zone stats
    ZONE_CONFIGS.forEach(zone => {
      const locIds = new Set();
      zone.types.forEach(t => (typeLocMap[t] || []).forEach(id => locIds.add(id)));
      const items = inventoryItems.filter(i => locIds.has(i.location_id) && (i.quantity_on_hand || 0) > 0);
      const partCount = new Set(items.map(i => i.part_id)).size;
      const totalUnits = items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
      result[zone.key] = { locIds, partCount, totalUnits, locationCount: locIds.size };
    });

    // Unassigned
    const unassigned = inventoryItems.filter(i => !i.location_id && (i.quantity_on_hand || 0) > 0);
    result.unassigned = {
      partCount: new Set(unassigned.map(i => i.part_id)).size,
      totalUnits: unassigned.reduce((s, i) => s + (i.quantity_on_hand || 0), 0),
    };

    // Empty locations
    const locationsWithStock = new Set(
      inventoryItems.filter(i => (i.quantity_on_hand || 0) > 0).map(i => i.location_id).filter(Boolean)
    );
    result.emptyLocations = locations.filter(l => l.active !== false && !locationsWithStock.has(l.id)).length;

    return result;
  }, [locations, inventoryItems]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {ZONE_CONFIGS.map(zone => {
        const s = stats[zone.key];
        const Icon = zone.icon;
        const hasInventory = s.partCount > 0;

        return (
          <button
            key={zone.key}
            onClick={() => onSelectZone(zone.key, zone.types)}
            className={cn(
              "flex flex-col items-start gap-2 p-4 rounded-lg border transition-colors text-left",
              hasInventory
                ? "border-gray-700 bg-gray-900/40 hover:border-gray-600"
                : "border-gray-800 bg-gray-900/20 hover:border-gray-700"
            )}
          >
            <div className="flex items-center gap-2 w-full">
              <Icon className="w-5 h-5 shrink-0" style={{ color: zone.color }} />
              <span className="text-sm font-medium text-white truncate">{zone.label}</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-gray-400">
                <span className="text-white font-medium">{s.partCount}</span> parts
              </span>
              <span className="text-gray-400">
                <span className="text-white font-medium">{s.totalUnits}</span> units
              </span>
            </div>
            <div className="text-[10px] text-gray-500">
              {s.locationCount} location{s.locationCount !== 1 ? 's' : ''}
            </div>
          </button>
        );
      })}

      {/* Unassigned */}
      <button
        onClick={() => onSelectZone('unassigned', [])}
        className={cn(
          "flex flex-col items-start gap-2 p-4 rounded-lg border transition-colors text-left",
          stats.unassigned.partCount > 0
            ? "border-yellow-800/50 bg-yellow-950/20 hover:border-yellow-700/50"
            : "border-gray-800 bg-gray-900/20 hover:border-gray-700"
        )}
      >
        <div className="flex items-center gap-2 w-full">
          <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
          <span className="text-sm font-medium text-white">Unassigned</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-400">
            <span className={cn("font-medium", stats.unassigned.partCount > 0 ? "text-yellow-400" : "text-white")}>
              {stats.unassigned.partCount}
            </span> parts
          </span>
        </div>
        <div className="text-[10px] text-gray-500">Needs location assignment</div>
      </button>

      {/* Empty Locations */}
      <button
        onClick={() => onSelectZone('empty', [])}
        className="flex flex-col items-start gap-2 p-4 rounded-lg border border-gray-800 bg-gray-900/20 hover:border-gray-700 transition-colors text-left"
      >
        <div className="flex items-center gap-2 w-full">
          <Inbox className="w-5 h-5 text-gray-500 shrink-0" />
          <span className="text-sm font-medium text-white">Empty</span>
        </div>
        <div className="text-xs text-gray-400">
          <span className="text-white font-medium">{stats.emptyLocations}</span> locations
        </div>
        <div className="text-[10px] text-gray-500">No inventory stored</div>
      </button>
    </div>
  );
}