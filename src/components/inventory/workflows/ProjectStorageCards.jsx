import React, { useMemo } from "react";
import { FolderKanban, Package, Camera, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "../locationTypeConfig";
import moment from "moment";

/**
 * ProjectStorageCards — displays project storage locations as visual folder cards
 * instead of raw table/tree views. Each card shows photo, inventory count, and activity.
 */
export default function ProjectStorageCards({ locations, inventoryItems, projects, projectId, onNavigateLocation }) {
  const cards = useMemo(() => {
    // Get project locations
    const projectLocs = locations.filter(l => 
      l.project_id === projectId && l.active !== false
    ).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    return projectLocs.map(loc => {
      const items = inventoryItems.filter(i => i.location_id === loc.id && (i.quantity_on_hand || 0) > 0);
      const partCount = new Set(items.map(i => i.part_id)).size;
      const totalUnits = items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
      const reservedUnits = items.reduce((s, i) => s + (i.quantity_reserved || 0), 0);
      const tc = getLocationTypeConfig(loc.location_type);
      const TypeIcon = tc.icon;
      const photo = loc.photos?.[0];
      
      // Most recent update
      const latestItem = items.sort((a, b) => 
        new Date(b.updated_date || 0) - new Date(a.updated_date || 0)
      )[0];

      return {
        loc,
        tc,
        TypeIcon,
        photo,
        partCount,
        totalUnits,
        reservedUnits,
        lastUpdated: latestItem?.updated_date || loc.updated_date,
      };
    });
  }, [locations, inventoryItems, projectId]);

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <FolderKanban className="w-10 h-10 text-gray-600 mb-3" />
        <p className="text-sm text-gray-500">No storage locations set up for this project yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards.map(card => (
        <button
          key={card.loc.id}
          onClick={() => onNavigateLocation?.(card.loc.id)}
          className={cn(
            "flex flex-col rounded-xl border transition-all text-left group overflow-hidden",
            card.partCount > 0
              ? "border-gray-700 bg-gray-900/50 hover:border-gray-600"
              : "border-gray-800/60 bg-gray-900/20 hover:border-gray-700"
          )}
        >
          {/* Photo / Icon */}
          <div className="relative h-24 bg-gray-800/50 flex items-center justify-center overflow-hidden">
            {card.photo ? (
              <img 
                src={card.photo} 
                alt={card.loc.location_area} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                loading="lazy"
              />
            ) : (
              <card.TypeIcon className="w-10 h-10 opacity-30" style={{ color: card.loc.color || card.tc.color }} />
            )}
            {/* Count overlay */}
            {card.partCount > 0 && (
              <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {card.partCount}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-3 flex-1 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <card.TypeIcon className="w-3.5 h-3.5 shrink-0" style={{ color: card.loc.color || card.tc.color }} />
              <span className="text-sm font-medium text-white truncate">{card.loc.location_area}</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>
                <span className="text-white font-medium">{card.totalUnits}</span> units
              </span>
              {card.reservedUnits > 0 && (
                <span className="text-orange-400">
                  {card.reservedUnits} reserved
                </span>
              )}
            </div>

            {card.lastUpdated && (
              <div className="flex items-center gap-1 text-[10px] text-gray-600 mt-auto pt-1">
                <Clock className="w-3 h-3" />
                {moment(card.lastUpdated).fromNow()}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}