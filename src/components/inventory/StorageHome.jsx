import React, { useState, useMemo } from "react";
import { Star, Clock, ChevronRight, ChevronDown, MapPin, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "./locationTypeConfig";
import { getContainerTypeConfig } from "./containerTypeConfig";

/**
 * StorageHome — the "where do I go?" screen.
 * Shows favorites, recents, and a collapsible browse tree.
 * No stats, no split layout, no dashboards.
 */
export default function StorageHome({
  favorites,
  recents,
  locations,
  containers,
  inventoryItems,
  locationPartCounts,
  showEmptyLocations,
  onSelectLocation,
  onSelectContainer,
  onToggleEmpty,
  expandedLocations,
  onToggleExpand,
  onToggleFavorite,
  isFavorite,
}) {
  const [browseOpen, setBrowseOpen] = useState(false);

  const resolveLocation = (id) => locations.find(l => l.id === id);
  const favLocs = favorites.map(resolveLocation).filter(Boolean);
  const recentLocs = recents
    .filter(id => !favorites.includes(id))
    .map(resolveLocation)
    .filter(Boolean)
    .slice(0, 6);

  // Recent containers (last 4 containers from recents or most recently created)
  const recentContainers = useMemo(() =>
    [...containers]
      .sort((a, b) => (b.updated_date || b.created_date || '').localeCompare(a.updated_date || a.created_date || ''))
      .slice(0, 4),
    [containers]
  );

  const rootLocations = locations
    .filter(l => !l.parent_id && l.active)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const unassignedCount = locationPartCounts['unassigned'] || 0;

  const renderLocationNode = (location, level = 0) => {
    const children = locations.filter(l => l.parent_id === location.id && l.active);
    const hasChildren = children.length > 0;
    const isExpanded = expandedLocations[location.id];
    const partCount = locationPartCounts[location.id] || 0;
    if (partCount === 0 && !showEmptyLocations) return null;

    return (
      <div key={location.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group hover:bg-gray-800/50 text-gray-300",
            partCount === 0 && "opacity-50"
          )}
          style={{ paddingLeft: `${(level * 16) + 12}px` }}
          onClick={() => onSelectLocation(location.id)}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(location.id); }} className="shrink-0 hover:text-red-400">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : <div className="w-4" />}
          {(() => { const tc = getLocationTypeConfig(location.location_type); const TIcon = tc.icon; return <TIcon className="w-4 h-4 shrink-0" style={{ color: location.color || tc.color }} />; })()}
          <span className="flex-1 text-sm font-medium truncate">{location.location_area}</span>
          <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(location.id); }} className={cn("shrink-0 p-0.5 transition-colors", isFavorite(location.id) ? "text-yellow-500" : "text-gray-700 hover:text-yellow-600 md:opacity-0 md:group-hover:opacity-100")}>
            <Star className={cn("w-3 h-3", isFavorite(location.id) && "fill-yellow-500")} />
          </button>
          {partCount > 0 && <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">{partCount}</span>}
        </div>
        {hasChildren && isExpanded && (
          <div>
            {children.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).filter(c => showEmptyLocations || (locationPartCounts[c.id] || 0) > 0).map(c => renderLocationNode(c, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Favorites */}
      {favLocs.length > 0 && (
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide mb-2">
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" /> Favorites
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {favLocs.map(loc => {
              const tc = getLocationTypeConfig(loc.location_type);
              const TIcon = tc.icon;
              const photo = loc.photos?.[0];
              const count = locationPartCounts[loc.id] || 0;
              return (
                <button key={loc.id} onClick={() => onSelectLocation(loc.id)}
                  className="flex items-center gap-2.5 p-3 rounded-lg bg-gray-800/40 border border-gray-800 hover:border-gray-600 transition-colors text-left">
                  {photo ? (
                    <img src={photo} alt="" className="w-10 h-10 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center shrink-0">
                      <TIcon className="w-5 h-5" style={{ color: loc.color || tc.color }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">{loc.location_area}</div>
                    <div className="text-[10px] text-gray-500">{count} parts</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent locations */}
      {recentLocs.length > 0 && (
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide mb-2">
            <Clock className="w-3 h-3" /> Recent
          </div>
          <div className="space-y-1">
            {recentLocs.map(loc => {
              const tc = getLocationTypeConfig(loc.location_type);
              const TIcon = tc.icon;
              const count = locationPartCounts[loc.id] || 0;
              return (
                <button key={loc.id} onClick={() => onSelectLocation(loc.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 text-left transition-colors">
                  <TIcon className="w-4 h-4 shrink-0" style={{ color: loc.color || tc.color }} />
                  <span className="flex-1 text-sm text-gray-300 truncate">{loc.location_area}</span>
                  <span className="text-xs text-gray-500">{count}</span>
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent containers */}
      {recentContainers.length > 0 && (
        <div className="px-4 pt-3 pb-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">📦 Containers</div>
          <div className="space-y-1">
            {recentContainers.map(c => {
              const ctc = getContainerTypeConfig(c.container_type);
              const loc = c.location_id ? locations.find(l => l.id === c.location_id) : null;
              const itemCount = inventoryItems.filter(i => i.container_id === c.id && (i.quantity_on_hand || 0) > 0).length;
              return (
                <button key={c.id} onClick={() => onSelectContainer(c)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 text-left transition-colors">
                  {c.photo ? (
                    <img src={c.photo} alt="" className="w-8 h-8 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-8 h-8 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: (c.color || ctc.color) + '15' }}>
                      <ctc.icon className="w-4 h-4" style={{ color: c.color || ctc.color }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{c.name}</div>
                    <div className="text-[10px] text-gray-500">{loc?.location_area || 'No location'} · {itemCount} parts</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Browse locations — collapsed by default */}
      <div className="px-4 pt-4 pb-2">
        <button onClick={() => setBrowseOpen(!browseOpen)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors w-full">
          {browseOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <MapPin className="w-4 h-4" />
          <span className="font-medium">Browse Locations</span>
        </button>
      </div>

      {browseOpen && (
        <div className="pb-4">
          {(showEmptyLocations || unassignedCount > 0) && (
            <div className={cn("flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-800/50 text-gray-300 ml-4", unassignedCount === 0 && "opacity-50")} onClick={() => onSelectLocation('unassigned')}>
              <MapPin className="w-4 h-4 text-yellow-500" />
              <span className="flex-1 text-sm font-medium">Unassigned</span>
              {unassignedCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-300">{unassignedCount}</span>}
            </div>
          )}
          {rootLocations.map(loc => renderLocationNode(loc, 0))}
          <div className="px-4 pt-2">
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer hover:text-gray-300">
              <input type="checkbox" checked={showEmptyLocations} onChange={(e) => onToggleEmpty(e.target.checked)} className="rounded border-gray-700 bg-gray-900 text-red-600 focus:ring-red-600" />
              Show empty
            </label>
          </div>
        </div>
      )}
    </div>
  );
}