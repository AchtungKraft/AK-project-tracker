import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, ArrowRightLeft, Printer, Home, Plus, Trash2, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContainerTypeConfig } from "./containerTypeConfig";
import { printContainerQRLabel } from "./containerQRLabel";
import LocationBreadcrumb from "./LocationBreadcrumb";

/**
 * Desktop right panel — Selected Object preview.
 * Shows either a Part preview or a Container preview inline,
 * without navigating away from the location.
 */
export default function StorageObjectPreview({
  // Selection
  selectedPart,
  selectedContainer,
  // Data
  locations, inventoryItems, parts, projects, vendors,
  // Container actions
  onMoveContainer, onReturnHomeContainer, onAddPartsToContainer, onEmptyContainer,
  // Part actions
  onPartClick,
  // General
  onClose,
  getInventoryStats,
}) {
  // --- EMPTY STATE ---
  if (!selectedPart && !selectedContainer) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <Package className="w-10 h-10 text-gray-700 mb-3" />
        <p className="text-sm text-gray-500">Select a part or container</p>
        <p className="text-xs text-gray-600 mt-1">to see details and actions</p>
      </div>
    );
  }

  // --- CONTAINER PREVIEW ---
  if (selectedContainer) {
    return (
      <ContainerPreview
        container={selectedContainer} locations={locations} inventoryItems={inventoryItems}
        parts={parts} projects={projects}
        onMove={onMoveContainer} onReturnHome={onReturnHomeContainer}
        onAddParts={onAddPartsToContainer} onEmpty={onEmptyContainer}
        onClose={onClose}
      />
    );
  }

  // --- PART PREVIEW ---
  return (
    <PartPreview
      part={selectedPart} inventoryItems={inventoryItems} locations={locations}
      vendors={vendors} containers={inventoryItems} allContainers={[]}
      getInventoryStats={getInventoryStats} onPartClick={onPartClick} onClose={onClose}
    />
  );
}

function ContainerPreview({ container, locations, inventoryItems, parts, projects, onMove, onReturnHome, onAddParts, onEmpty, onClose }) {
  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;
  const displayColor = container.color || tc.color;
  const location = locations.find(l => l.id === container.location_id);
  const homeLocation = container.home_location_id ? locations.find(l => l.id === container.home_location_id) : null;
  const isAwayFromHome = homeLocation && container.location_id !== container.home_location_id;
  const project = container.project_id ? projects.find(p => p.id === container.project_id) : null;
  const containedItems = inventoryItems.filter(i => i.container_id === container.id && (i.quantity_on_hand || 0) > 0);
  const containedParts = parts.filter(p => containedItems.some(i => i.part_id === p.id));
  const totalUnits = containedItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[9px] text-gray-500 uppercase tracking-wide">Container</div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-start gap-3">
          {container.photo ? (
            <img src={container.photo} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-700 shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: displayColor + '20' }}>
              <TypeIcon className="w-7 h-7" style={{ color: displayColor }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-white truncate">{container.name}</h3>
            {container.short_code && <div className="text-xs font-mono font-bold text-gray-400">{container.short_code}</div>}
            <div className="text-xs text-gray-400 mt-0.5">{containedParts.length} parts · {totalUnits} units</div>
            {location && <LocationBreadcrumb locationId={location.id} locations={locations} compact />}
          </div>
        </div>
        {/* Status callouts */}
        {isAwayFromHome && homeLocation && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-400 bg-amber-950/20 rounded px-2 py-1">
            <Home className="w-3 h-3" /> Away from home · {homeLocation.location_area}
          </div>
        )}
        {container.notes && (
          <div className="text-xs text-yellow-300 bg-yellow-950/20 rounded px-2 py-1 mt-1 truncate">
            {container.notes}
          </div>
        )}
        {project && <div className="text-xs text-blue-400 mt-1">📁 {project.name}</div>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-800 shrink-0 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => onMove?.(container)} className="gap-1 h-7 text-xs border-gray-700 text-gray-300">
          <ArrowRightLeft className="w-3 h-3" /> Move
        </Button>
        {isAwayFromHome && (
          <Button size="sm" variant="outline" onClick={() => onReturnHome?.(container)} className="gap-1 h-7 text-xs border-amber-700/50 text-amber-400">
            <Home className="w-3 h-3" /> Return
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => printContainerQRLabel(container, { locations })} className="h-7 w-7 p-0 text-gray-400">
          <Printer className="w-3 h-3" />
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => onAddParts?.(container)} className="gap-1 h-7 text-xs text-gray-400">
          <Plus className="w-3 h-3" /> Add
        </Button>
        {containedParts.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onEmpty?.(container)} className="gap-1 h-7 text-xs text-gray-500 hover:text-red-400">
            <Trash2 className="w-3 h-3" /> Empty
          </Button>
        )}
      </div>

      {/* Contents list */}
      <div className="flex-1 overflow-y-auto p-2">
        {containedParts.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500">Empty container</div>
        ) : (
          <div className="space-y-1">
            {containedParts.map(part => {
              const item = containedItems.find(i => i.part_id === part.id);
              const qty = item?.quantity_on_hand || 0;
              const photo = part.featured_photo || part.photos?.[0];
              return (
                <div key={part.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800/50 text-sm">
                  {photo ? (
                    <img src={photo} alt="" className="w-8 h-8 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-gray-600" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate text-xs">{part.part_name}</div>
                    {part.vendor_part_number && <div className="text-[10px] font-mono text-gray-500">{part.vendor_part_number}</div>}
                  </div>
                  <div className="text-xs text-white font-semibold shrink-0">{qty}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PartPreview({ part, inventoryItems, locations, vendors, getInventoryStats, onPartClick, onClose }) {
  const photo = part.featured_photo || part.photos?.[0];
  const allImages = part.photos || [];
  const stats = getInventoryStats(part.id);
  const vendor = vendors.find(v => v.id === part.default_vendor_id);

  // Find all locations where this part exists
  const partLocations = useMemo(() => {
    return inventoryItems
      .filter(i => i.part_id === part.id && (i.quantity_on_hand || 0) > 0)
      .map(i => {
        const loc = i.location_id ? locations.find(l => l.id === i.location_id) : null;
        return { loc, qty: i.quantity_on_hand || 0, reserved: i.quantity_reserved || 0 };
      });
  }, [part.id, inventoryItems, locations]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[9px] text-gray-500 uppercase tracking-wide">Part</div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        {/* Photo - larger in preview */}
        {photo && (
          <img src={photo} alt={part.part_name} className="w-full h-32 object-cover rounded-lg border border-gray-700 mb-3" loading="lazy" />
        )}
        <h3 className="text-base font-bold text-white">{part.part_name}</h3>
        {part.vendor_part_number && <div className="text-xs font-mono font-bold text-gray-400 mt-0.5">{part.vendor_part_number}</div>}
        {vendor && <div className="text-xs text-gray-500 mt-0.5">{vendor.vendor_name}</div>}
      </div>

      {/* Stats */}
      <div className="px-3 py-2 border-b border-gray-800 shrink-0">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[10px] text-gray-500">Qty</div>
            <div className="text-sm text-white font-semibold">{stats.onHand}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">Reserved</div>
            <div className="text-sm text-orange-400 font-semibold">{stats.reserved}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">Available</div>
            <div className={cn("text-sm font-semibold", stats.available > 0 ? "text-green-400" : "text-red-400")}>{stats.available}</div>
          </div>
        </div>
      </div>

      {/* Locations */}
      <div className="flex-1 overflow-y-auto p-3">
        {partLocations.length > 0 && (
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-1.5">Locations</div>
            <div className="space-y-1">
              {partLocations.map((pl, idx) => (
                <div key={idx} className="flex items-center gap-2 px-2 py-1.5 bg-gray-800/30 rounded text-xs">
                  <div className="flex-1 text-gray-300 truncate">{pl.loc?.location_area || 'Unassigned'}</div>
                  <div className="text-white font-semibold">{pl.qty}</div>
                  {pl.reserved > 0 && <div className="text-orange-400">({pl.reserved} rsv)</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Open full details */}
      <div className="p-3 border-t border-gray-800 shrink-0">
        <Button size="sm" variant="outline" onClick={() => onPartClick?.(part)} className="w-full gap-1.5 text-xs border-gray-700 text-gray-300">
          <ExternalLink className="w-3 h-3" /> Open Full Details
        </Button>
      </div>
    </div>
  );
}