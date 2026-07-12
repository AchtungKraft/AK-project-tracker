import React from "react";
import { Star, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "./locationTypeConfig";

/**
 * Compact bar showing favorite and recently viewed locations for quick access.
 * Appears above the location tree.
 */
export default function LocationFavoritesBar({
  favorites,
  recents,
  locations,
  selectedLocationId,
  onSelect,
  onToggleFavorite,
}) {
  if (favorites.length === 0 && recents.length === 0) return null;

  const resolveLocation = (id) => locations.find(l => l.id === id);
  
  // Show favorites first, then recents that aren't favorites (limit total to 8)
  const favLocs = favorites.map(resolveLocation).filter(Boolean);
  const recentLocs = recents
    .filter(id => !favorites.includes(id))
    .map(resolveLocation)
    .filter(Boolean)
    .slice(0, 8 - favLocs.length);

  if (favLocs.length === 0 && recentLocs.length === 0) return null;

  const renderPill = (loc, isFav) => {
    const tc = getLocationTypeConfig(loc.location_type);
    const Icon = tc.icon;
    const isSelected = selectedLocationId === loc.id;

    return (
      <button
        key={loc.id}
        onClick={() => onSelect(loc.id)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors border",
          isSelected
            ? "bg-red-950/50 border-red-700/50 text-white"
            : "bg-gray-800/60 border-gray-700/50 text-gray-300 hover:bg-gray-800 hover:text-white"
        )}
        title={loc.location_area}
      >
        {isFav && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />}
        {!isFav && <Clock className="w-3 h-3 text-gray-500 shrink-0" />}
        <Icon className="w-3 h-3 shrink-0" style={{ color: loc.color || tc.color }} />
        <span className="truncate max-w-[100px]">
          {loc.short_code || loc.location_area}
        </span>
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-2 px-3 scrollbar-hide">
      {favLocs.map(loc => renderPill(loc, true))}
      {recentLocs.length > 0 && favLocs.length > 0 && (
        <div className="w-px h-5 bg-gray-700 shrink-0 mx-1" />
      )}
      {recentLocs.map(loc => renderPill(loc, false))}
    </div>
  );
}