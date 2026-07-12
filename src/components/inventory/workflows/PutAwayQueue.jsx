import React, { useMemo } from "react";
import { Package, MapPin, ArrowRight, Search, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "../locationTypeConfig";
import InventoryLocationEditor from "../InventoryLocationEditor";

/**
 * PutAwayQueue — shows inventory that has been received but not yet assigned permanent storage.
 * Items in receiving/inspection zones OR unassigned items.
 */
export default function PutAwayQueue({ locations, inventoryItems, parts, projects, commitments, onNavigateLocation }) {
  const putAwayItems = useMemo(() => {
    // Find receiving/inspection location IDs
    const tempLocIds = new Set();
    locations.forEach(loc => {
      if (loc.active === false) return;
      if (['receiving', 'inspection', 'temporary'].includes(loc.location_type)) {
        tempLocIds.add(loc.id);
      }
    });

    // Items at temp locations or unassigned, with stock
    const items = inventoryItems.filter(i => 
      (i.quantity_on_hand || 0) > 0 && (tempLocIds.has(i.location_id) || !i.location_id)
    );

    // Enrich with part and location data
    const partsMap = new Map(parts.map(p => [p.id, p]));
    const locsMap = new Map(locations.map(l => [l.id, l]));

    // Find project associations from commitments
    const partProjectMap = new Map();
    (commitments || []).forEach(c => {
      if ((c.reserved_from_stock || 0) > 0 || (c.required_total || 0) > 0) {
        if (!partProjectMap.has(c.part_id)) partProjectMap.set(c.part_id, []);
        partProjectMap.get(c.part_id).push(c.project_id);
      }
    });

    return items.map(item => {
      const part = partsMap.get(item.part_id);
      const loc = locsMap.get(item.location_id);
      const projectIds = partProjectMap.get(item.part_id) || [];
      const project = projectIds.length > 0 ? projects.find(p => p.id === projectIds[0]) : null;
      
      // Suggest destination based on project
      const suggestedLocations = [];
      if (project) {
        const projectLocs = locations.filter(l => l.project_id === project.id && l.active !== false);
        suggestedLocations.push(...projectLocs.slice(0, 3));
      }

      return {
        ...item,
        part,
        currentLocation: loc,
        project,
        suggestedLocations,
        isUnassigned: !item.location_id,
        daysWaiting: item.received_date 
          ? Math.floor((Date.now() - new Date(item.received_date).getTime()) / (1000 * 60 * 60 * 24))
          : null,
      };
    }).filter(i => i.part)
      .sort((a, b) => {
        // Unassigned first, then oldest
        if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? -1 : 1;
        return (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0);
      });
  }, [locations, inventoryItems, parts, projects, commitments]);

  if (putAwayItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Inbox className="w-12 h-12 text-gray-600 mb-3" />
        <h3 className="text-base font-medium text-gray-400 mb-1">All put away</h3>
        <p className="text-sm text-gray-600 max-w-sm">
          No inventory waiting for permanent storage. Items will appear here when received or left unassigned.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 mb-3">
        <h3 className="text-sm font-semibold text-gray-300">
          {putAwayItems.length} item{putAwayItems.length !== 1 ? 's' : ''} awaiting storage
        </h3>
      </div>

      {putAwayItems.map(item => {
        const tc = item.currentLocation ? getLocationTypeConfig(item.currentLocation.location_type) : null;
        const CIcon = tc?.icon || MapPin;

        return (
          <div
            key={item.id}
            className="flex flex-col gap-3 p-4 bg-gray-900/40 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors"
          >
            {/* Part Info Row */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                {item.part.featured_photo || item.part.photos?.[0] ? (
                  <img src={item.part.featured_photo || item.part.photos[0]} alt="" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <Package className="w-5 h-5 text-gray-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-white line-clamp-1">{item.part.part_name}</h4>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {item.part.vendor_part_number && (
                    <span className="text-xs font-mono text-gray-500">{item.part.vendor_part_number}</span>
                  )}
                  {item.project && (
                    <Badge variant="outline" className="text-[10px] border-purple-700/50 text-purple-400 px-1.5 py-0">
                      {item.project.name}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-white">{item.quantity_on_hand}</div>
                <div className="text-[10px] text-gray-500">units</div>
              </div>
            </div>

            {/* Current Location & Status */}
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-800/60 rounded-lg">
                <CIcon className="w-3.5 h-3.5" style={{ color: item.currentLocation?.color || '#EAB308' }} />
                <span className="text-gray-300">
                  {item.currentLocation?.location_area || 'Unassigned'}
                </span>
              </div>
              {item.daysWaiting !== null && item.daysWaiting > 0 && (
                <span className={cn(
                  "text-xs",
                  item.daysWaiting > 7 ? "text-red-400" : item.daysWaiting > 3 ? "text-yellow-400" : "text-gray-500"
                )}>
                  {item.daysWaiting}d waiting
                </span>
              )}
              {item.isUnassigned && (
                <Badge variant="outline" className="text-[10px] border-yellow-700/50 text-yellow-400">
                  Needs location
                </Badge>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <InventoryLocationEditor
                  inventoryItemId={item.id}
                  currentLocationId={item.location_id}
                  compact
                  label="Assign Storage"
                />
              </div>
              {item.suggestedLocations.length > 0 && (
                <div className="flex items-center gap-1">
                  {item.suggestedLocations.slice(0, 2).map(sl => {
                    const slc = getLocationTypeConfig(sl.location_type);
                    const SIcon = slc.icon;
                    return (
                      <button
                        key={sl.id}
                        onClick={() => onNavigateLocation?.(sl.id)}
                        className="flex items-center gap-1 px-2 py-1.5 bg-purple-950/30 border border-purple-800/30 rounded-lg text-[10px] text-purple-300 hover:bg-purple-900/40 transition-colors"
                        title={`Project: ${sl.location_area}`}
                      >
                        <SIcon className="w-3 h-3" style={{ color: slc.color }} />
                        <span className="truncate max-w-[60px]">{sl.location_area}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}