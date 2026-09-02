import React, { useState, useMemo } from "react";
import { Package, Search, MapPin, Box, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getContainerTypeConfig } from "@/components/inventory/containerTypeConfig";
import LocationBreadcrumb from "@/components/inventory/LocationBreadcrumb";

/**
 * Displays all inventory physically stored in project-associated locations/containers.
 * Props:
 *   items        — from resolveProjectInventory().items
 *   locations    — all Location records
 *   commitments  — project commitments for demand context
 *   onNavigate   — (locId) navigate to location in global storage
 */
export default function ProjectStorageInventoryList({ items, locations, commitments, onNavigate }) {
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState('location'); // location | part

  const commitmentMap = useMemo(() => {
    const map = {};
    (commitments || []).forEach(c => {
      if (!map[c.part_id]) map[c.part_id] = { required: 0, reserved: 0 };
      map[c.part_id].required += (c.required_total || 0);
      map[c.part_id].reserved += (c.reserved_from_stock || 0);
    });
    return map;
  }, [commitments]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const term = search.toLowerCase();
    return items.filter(i =>
      i.part?.part_name?.toLowerCase().includes(term) ||
      i.part?.vendor_part_number?.toLowerCase().includes(term) ||
      i.container?.name?.toLowerCase().includes(term) ||
      i.location?.location_area?.toLowerCase().includes(term)
    );
  }, [items, search]);

  const grouped = useMemo(() => {
    if (groupBy === 'part') {
      const map = {};
      filtered.forEach(item => {
        const key = item.inventoryItem.part_id;
        if (!map[key]) map[key] = { part: item.part, items: [] };
        map[key].items.push(item);
      });
      return Object.values(map).sort((a, b) =>
        (a.part?.part_name || '').localeCompare(b.part?.part_name || '')
      );
    }
    // Group by physical location
    const map = {};
    filtered.forEach(item => {
      const locId = item.location?.id || 'unknown';
      const ctrId = item.container?.id;
      const key = ctrId ? `ctr_${ctrId}` : `loc_${locId}`;
      if (!map[key]) {
        map[key] = {
          type: ctrId ? 'container' : 'location',
          entity: ctrId ? item.container : item.location,
          location: item.location,
          items: [],
        };
      }
      map[key].items.push(item);
    });
    return Object.values(map).sort((a, b) =>
      (a.entity?.name || a.entity?.location_area || '').localeCompare(b.entity?.name || b.entity?.location_area || '')
    );
  }, [filtered, groupBy]);

  if (items.length === 0) {
    return (
      <div className="text-center py-10">
        <Package className="w-12 h-12 text-gray-700 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">No inventory physically stored for this project</p>
        <p className="text-gray-600 text-xs mt-1">Stage parts from general inventory to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parts, containers, locations…"
            className="pl-9 bg-gray-900/50 border-gray-700 text-white h-9 text-sm"
          />
        </div>
        <div className="flex border border-gray-700 rounded-md overflow-hidden shrink-0">
          <button onClick={() => setGroupBy('location')}
            className={cn("px-3 py-1.5 text-xs transition-colors", groupBy === 'location' ? "bg-gray-700 text-white" : "text-gray-400 hover:bg-gray-800")}>
            <MapPin className="w-3.5 h-3.5 inline mr-1" />Location
          </button>
          <button onClick={() => setGroupBy('part')}
            className={cn("px-3 py-1.5 text-xs transition-colors", groupBy === 'part' ? "bg-gray-700 text-white" : "text-gray-400 hover:bg-gray-800")}>
            <Package className="w-3.5 h-3.5 inline mr-1" />Part
          </button>
        </div>
      </div>

      {/* Grouped list */}
      <div className="space-y-2">
        {groupBy === 'part' ? (
          grouped.map((group, gi) => {
            const demand = commitmentMap[group.part?.id] || {};
            const totalQty = group.items.reduce((s, i) => s + (i.inventoryItem.quantity_on_hand || 0), 0);
            return (
              <div key={gi} className="border border-gray-800 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2 bg-gray-900/40">
                  <Package className="w-4 h-4 text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white font-medium truncate block">{group.part?.part_name || 'Unknown'}</span>
                    {group.part?.vendor_part_number && (
                      <span className="text-xs text-gray-500 font-mono">{group.part.vendor_part_number}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <div className="text-center">
                      <div className="text-white font-bold">{totalQty}</div>
                      <div className="text-gray-500">staged</div>
                    </div>
                    {demand.required > 0 && (
                      <div className="text-center">
                        <div className="text-blue-400 font-bold">{demand.required}</div>
                        <div className="text-gray-500">required</div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-gray-800/50">
                  {group.items.map((item, ii) => (
                    <div key={ii} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      {item.container ? (
                        <span className="text-purple-400 truncate">
                          <Box className="w-3 h-3 inline mr-1" />{item.container.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 truncate">
                          <MapPin className="w-3 h-3 inline mr-1" />{item.location?.location_area || 'Unknown'}
                        </span>
                      )}
                      <span className="ml-auto text-white font-mono">{item.inventoryItem.quantity_on_hand}</span>
                      {(item.inventoryItem.quantity_reserved || 0) > 0 && (
                        <span className="text-orange-400">({item.inventoryItem.quantity_reserved} rsv)</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          grouped.map((group, gi) => {
            const isContainer = group.type === 'container';
            const totalQty = group.items.reduce((s, i) => s + (i.inventoryItem.quantity_on_hand || 0), 0);
            const ctc = isContainer ? getContainerTypeConfig(group.entity?.container_type) : null;
            return (
              <div key={gi} className="border border-gray-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => group.location?.id && onNavigate?.(group.location.id)}
                  className="flex items-center gap-3 px-3 py-2 bg-gray-900/40 w-full text-left hover:bg-gray-800/50 transition-colors"
                >
                  {isContainer ? (
                    <div className="w-8 h-8 rounded flex items-center justify-center shrink-0"
                      style={{ backgroundColor: (group.entity.color || ctc?.color || '#6366F1') + '15' }}>
                      {ctc && <ctc.icon className="w-4 h-4" style={{ color: group.entity.color || ctc.color }} />}
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white font-medium truncate block">
                      {isContainer ? group.entity.name : group.entity?.location_area || 'Unknown'}
                    </span>
                    {group.location && (
                      <LocationBreadcrumb locationId={group.location.id} locations={locations} compact />
                    )}
                  </div>
                  <div className="text-xs text-right shrink-0">
                    <div className="text-white font-bold">{totalQty}</div>
                    <div className="text-gray-500">{group.items.length} parts</div>
                  </div>
                </button>
                <div className="divide-y divide-gray-800/50">
                  {group.items.map((item, ii) => {
                    const demand = commitmentMap[item.inventoryItem.part_id] || {};
                    return (
                      <div key={ii} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        <span className="text-gray-300 flex-1 truncate">{item.part?.part_name || 'Unknown'}</span>
                        <span className="text-white font-mono shrink-0">{item.inventoryItem.quantity_on_hand}</span>
                        {(item.inventoryItem.quantity_reserved || 0) > 0 && (
                          <span className="text-orange-400 shrink-0">({item.inventoryItem.quantity_reserved} rsv)</span>
                        )}
                        {demand.required > 0 && (
                          <span className="text-blue-400 shrink-0 text-[10px]">need {demand.required}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}