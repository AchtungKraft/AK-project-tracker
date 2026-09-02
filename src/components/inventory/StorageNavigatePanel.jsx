import React, { useMemo } from "react";
import { Star, Clock, ChevronRight, ChevronDown, MapPin, Package, PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "./locationTypeConfig";
import { findReceivingLocation } from "@/lib/receivingLocationResolver";

/**
 * Desktop left panel — Navigate.
 * Persistent: favorites, recents, browse tree.
 */
export default function StorageNavigatePanel({
  favorites, recents, locations, locationPartCounts, showEmptyLocations,
  selectedLocationId, expandedLocations,
  onSelectLocation, onToggleExpand, onToggleFavorite, isFavorite, onToggleEmpty,
  inventoryItems, onOpenPutAway,
}) {
  const resolveLocation = (id) => locations.find(l => l.id === id);
  const favLocs = favorites.map(resolveLocation).filter(Boolean);
  const recentLocs = recents.filter(id => !favorites.includes(id)).map(resolveLocation).filter(Boolean).slice(0, 6);
  const rootLocations = locations.filter(l => !l.parent_id && l.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const unassignedCount = locationPartCounts['unassigned'] || 0;

  const renderNode = (location, level = 0) => {
    const children = locations.filter(l => l.parent_id === location.id && l.active);
    const hasChildren = children.length > 0;
    const isExpanded = expandedLocations[location.id];
    const isSelected = selectedLocationId === location.id;
    const partCount = locationPartCounts[location.id] || 0;
    if (partCount === 0 && !showEmptyLocations) return null;

    return (
      <div key={location.id}>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors group text-sm",
            isSelected ? "bg-red-950/40 text-red-400" : "hover:bg-gray-800/50 text-gray-300",
            partCount === 0 && "opacity-50"
          )}
          style={{ paddingLeft: `${(level * 14) + 8}px` }}
          onClick={() => onSelectLocation(location.id)}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(location.id); }} className="shrink-0 hover:text-red-400">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : <div className="w-3.5" />}
          {(() => { const tc = getLocationTypeConfig(location.location_type); const TI = tc.icon; return <TI className="w-3.5 h-3.5 shrink-0" style={{ color: location.color || tc.color }} />; })()}
          <span className={cn("flex-1 truncate", isSelected && "font-semibold")}>{location.location_area}</span>
          <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(location.id); }}
            className={cn("shrink-0 p-0.5", isFavorite(location.id) ? "text-yellow-500" : "text-gray-700 opacity-0 group-hover:opacity-100 hover:text-yellow-500")}>
            <Star className={cn("w-3 h-3", isFavorite(location.id) && "fill-yellow-500")} />
          </button>
          {partCount > 0 && <span className={cn("shrink-0 text-[10px] px-1.5 py-0 rounded-full min-w-[20px] text-center", isSelected ? "bg-red-600 text-white" : "bg-gray-800 text-gray-500")}>{partCount}</span>}
        </div>
        {hasChildren && isExpanded && children.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).filter(c => showEmptyLocations || (locationPartCounts[c.id] || 0) > 0).map(c => renderNode(c, level + 1))}
      </div>
    );
  };

  // Put Away count
  const putAwayCount = useMemo(() => {
    const rcv = findReceivingLocation(locations);
    if (!rcv || !inventoryItems) return 0;
    return inventoryItems.filter(i => i.location_id === rcv.id && (i.quantity_on_hand || 0) > 0).length;
  }, [locations, inventoryItems]);

  return (
    <div className="flex flex-col h-full overflow-hidden text-[13px]">
      {/* Put Away shortcut */}
      {putAwayCount > 0 && onOpenPutAway && (
        <div className="px-2 pt-2 pb-1">
          <button onClick={onOpenPutAway}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg bg-green-950/20 border border-green-800/30 hover:bg-green-950/30 transition-colors text-left">
            <PackageOpen className="w-4 h-4 text-green-400 shrink-0" />
            <span className="flex-1 text-sm font-medium text-green-300">Put Away</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-600/20 text-green-400">{putAwayCount}</span>
          </button>
        </div>
      )}

      {/* Favorites */}
      {favLocs.length > 0 && (
        <div className="px-2 pt-2 pb-1">
          <div className="flex items-center gap-1 text-[9px] text-gray-500 uppercase tracking-widest font-semibold px-1 mb-1">
            <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" /> Favorites
          </div>
          <div className="space-y-0.5">
            {favLocs.map(loc => {
              const tc = getLocationTypeConfig(loc.location_type);
              const TI = tc.icon;
              const isSelected = selectedLocationId === loc.id;
              return (
                <button key={loc.id} onClick={() => onSelectLocation(loc.id)}
                  className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left",
                    isSelected ? "bg-red-950/40 text-red-400" : "hover:bg-gray-800/50 text-gray-300")}>
                  <TI className="w-3.5 h-3.5 shrink-0" style={{ color: loc.color || tc.color }} />
                  <span className="flex-1 truncate">{loc.short_code || loc.location_area}</span>
                  <span className="text-[10px] text-gray-500">{locationPartCounts[loc.id] || 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent */}
      {recentLocs.length > 0 && (
        <div className="px-2 pt-1 pb-1">
          <div className="flex items-center gap-1 text-[9px] text-gray-500 uppercase tracking-widest font-semibold px-1 mb-1">
            <Clock className="w-2.5 h-2.5" /> Recent
          </div>
          <div className="space-y-0.5">
            {recentLocs.map(loc => {
              const tc = getLocationTypeConfig(loc.location_type);
              const TI = tc.icon;
              const isSelected = selectedLocationId === loc.id;
              return (
                <button key={loc.id} onClick={() => onSelectLocation(loc.id)}
                  className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left",
                    isSelected ? "bg-red-950/40 text-red-400" : "hover:bg-gray-800/50 text-gray-300")}>
                  <TI className="w-3.5 h-3.5 shrink-0" style={{ color: loc.color || tc.color }} />
                  <span className="flex-1 truncate">{loc.location_area}</span>
                  <span className="text-[10px] text-gray-500">{locationPartCounts[loc.id] || 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-800 mx-2 my-1" />

      {/* Browse tree */}
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        <div className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold px-2 py-1">Browse</div>
        {(showEmptyLocations || unassignedCount > 0) && (
          <div className={cn("flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-gray-800/50 text-sm",
            selectedLocationId === 'unassigned' ? "text-yellow-400 bg-yellow-950/20" : "text-gray-300", unassignedCount === 0 && "opacity-50")}
            onClick={() => onSelectLocation('unassigned')}>
            <div className="w-3.5" />
            <MapPin className="w-3.5 h-3.5 text-yellow-500" />
            <span className="flex-1">Unassigned</span>
            {unassignedCount > 0 && <span className="text-[10px] px-1.5 rounded-full bg-yellow-900/50 text-yellow-300">{unassignedCount}</span>}
          </div>
        )}
        {rootLocations.map(loc => renderNode(loc, 0))}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-gray-800">
        <label className="flex items-center gap-2 text-[10px] text-gray-500 cursor-pointer hover:text-gray-300">
          <input type="checkbox" checked={showEmptyLocations} onChange={(e) => onToggleEmpty(e.target.checked)} className="rounded border-gray-700 bg-gray-900 text-red-600 focus:ring-red-600 w-3 h-3" />
          Show empty
        </label>
      </div>
    </div>
  );
}