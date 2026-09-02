import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Package, ArrowRightLeft, Printer, Home, Plus, Trash2, ExternalLink, X, MapPin, Box } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContainerTypeConfig } from "./containerTypeConfig";
import { printContainerQRLabel } from "./containerQRLabel";
import LocationBreadcrumb from "./LocationBreadcrumb";

/**
 * Desktop right panel — Inspector.
 * Shows Part or Container preview without navigating away.
 */
export default function StorageObjectPreview({
  selectedPart, selectedContainer,
  locations, inventoryItems, parts, projects, vendors, containers = [],
  onMoveContainer, onReturnHomeContainer, onAddPartsToContainer, onEmptyContainer,
  onMoveFromContainer,
  onPartClick, onClose, getInventoryStats,
  currentLocationId,
}) {
  if (!selectedPart && !selectedContainer) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="w-12 h-12 rounded-xl bg-gray-800/50 flex items-center justify-center mb-3">
          <Package className="w-6 h-6 text-gray-600" />
        </div>
        <p className="text-sm text-gray-400 font-medium">Inspector</p>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">Select a part or container to see details and actions.</p>
      </div>
    );
  }

  if (selectedContainer) {
    return <ContainerInspector container={selectedContainer} locations={locations} inventoryItems={inventoryItems}
      parts={parts} projects={projects} onMove={onMoveContainer} onReturnHome={onReturnHomeContainer}
      onAddParts={onAddPartsToContainer} onEmpty={onEmptyContainer}
      onMoveFromContainer={onMoveFromContainer} onClose={onClose} />;
  }

  return <PartInspector part={selectedPart} inventoryItems={inventoryItems} locations={locations}
    vendors={vendors} containers={containers} getInventoryStats={getInventoryStats} onPartClick={onPartClick} onClose={onClose}
    currentLocationId={currentLocationId} />;
}

// ─── CONTAINER INSPECTOR ────────────────────────────────────────────

function ContainerInspector({ container, locations, inventoryItems, parts, projects, onMove, onReturnHome, onAddParts, onEmpty, onMoveFromContainer, onClose }) {
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
          <div className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Container</div>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors p-0.5 rounded hover:bg-gray-800"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex items-start gap-3">
          {container.photo ? (
            <img src={container.photo} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-700 shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: displayColor + '15' }}>
              <TypeIcon className="w-6 h-6" style={{ color: displayColor }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white truncate">{container.name}</h3>
            {container.short_code && <div className="text-[10px] font-mono font-bold text-gray-400 mt-0.5">{container.short_code}</div>}
            <div className="text-[10px] text-gray-500 mt-0.5">{tc.label} · {containedParts.length} parts · {totalUnits} units</div>
          </div>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
          <MapPin className="w-3 h-3 text-gray-500" />
          {location ? <LocationBreadcrumb locationId={location.id} locations={locations} compact /> : <span className="text-yellow-400">No location</span>}
        </div>

        {/* Status callouts */}
        {isAwayFromHome && homeLocation && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-amber-400 bg-amber-950/20 rounded px-2 py-1">
            <Home className="w-3 h-3 shrink-0" /> Away · Home: {homeLocation.location_area}
          </div>
        )}
        {container.notes && (
          <div className="text-[10px] text-yellow-300 bg-yellow-950/15 rounded px-2 py-1 mt-1 truncate">{container.notes}</div>
        )}
        {project && <div className="text-[10px] text-blue-400 mt-1">📁 {project.name}</div>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-800 shrink-0 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => onMove?.(container)} className="gap-1 h-7 text-[10px] border-gray-700 text-gray-300">
          <ArrowRightLeft className="w-3 h-3" /> Move
        </Button>
        {isAwayFromHome && (
          <Button size="sm" variant="outline" onClick={() => onReturnHome?.(container)} className="gap-1 h-7 text-[10px] border-amber-700/50 text-amber-400">
            <Home className="w-3 h-3" /> Return
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => printContainerQRLabel(container, { locations })} className="h-7 w-7 p-0 text-gray-500 hover:text-white" title="Print QR">
          <Printer className="w-3 h-3" />
        </Button>
        {containedParts.length > 0 && onMoveFromContainer && (
          <Button size="sm" variant="outline" onClick={() => onMoveFromContainer(container)} className="gap-1 h-7 text-[10px] border-gray-700 text-gray-300">
            <Package className="w-3 h-3" /> Move Items
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => onAddParts?.(container)} className="gap-1 h-7 text-[10px] text-gray-500 hover:text-white">
          <Plus className="w-3 h-3" /> Add
        </Button>
        {containedParts.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onEmpty?.(container)} className="gap-1 h-7 text-[10px] text-gray-600 hover:text-red-400">
            <Trash2 className="w-3 h-3" /> Empty
          </Button>
        )}
      </div>

      {/* Contents */}
      <div className="flex-1 overflow-y-auto">
        {containedParts.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-600">Empty container</div>
        ) : (
          <div className="p-2 space-y-0.5">
            <div className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold px-2 py-1">Contents</div>
            {containedParts.map(part => {
              const item = containedItems.find(i => i.part_id === part.id);
              const qty = item?.quantity_on_hand || 0;
              const photo = part.featured_photo || part.photos?.[0];
              return (
                <div key={part.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800/50">
                  {photo ? <img src={photo} alt="" className="w-7 h-7 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                  : <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center shrink-0"><Package className="w-3.5 h-3.5 text-gray-600" /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate text-xs">{part.part_name}</div>
                    {part.vendor_part_number && <div className="text-[9px] font-mono text-gray-500">{part.vendor_part_number}</div>}
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

// ─── PART INSPECTOR ─────────────────────────────────────────────────

function PartInspector({ part, inventoryItems, locations, vendors, containers, getInventoryStats, onPartClick, onClose, currentLocationId }) {
  const photo = part.featured_photo || part.photos?.[0];
  const stats = getInventoryStats(part.id);
  const vendor = vendors.find(v => v.id === part.default_vendor_id);

  const partLocations = useMemo(() => {
    return inventoryItems
      .filter(i => i.part_id === part.id && (i.quantity_on_hand || 0) > 0)
      .map(i => {
        const loc = i.location_id ? locations.find(l => l.id === i.location_id) : null;
        const ctr = i.container_id && Array.isArray(containers) ? containers.find(c => c.id === i.container_id) : null;
        return { loc, ctr, qty: i.quantity_on_hand || 0, reserved: i.quantity_reserved || 0 };
      });
  }, [part.id, inventoryItems, locations, containers]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Part</div>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors p-0.5 rounded hover:bg-gray-800"><X className="w-3.5 h-3.5" /></button>
        </div>
        {photo && (
          <img src={photo} alt={part.part_name} className="w-full h-28 object-cover rounded-lg border border-gray-700 mb-2.5" loading="lazy" />
        )}
        <h3 className="text-sm font-bold text-white leading-snug">{part.part_name}</h3>
        {part.vendor_part_number && <div className="text-[10px] font-mono font-bold text-gray-400 mt-0.5">{part.vendor_part_number}</div>}
        {vendor && <div className="text-[10px] text-gray-500 mt-0.5">{vendor.vendor_name}</div>}
        {/* Current workspace location context */}
        {currentLocationId && currentLocationId !== 'unassigned' && (() => {
          const curLoc = locations.find(l => l.id === currentLocationId);
          if (!curLoc) return null;
          return (
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-500">
              <MapPin className="w-2.5 h-2.5 shrink-0" />
              <LocationBreadcrumb locationId={currentLocationId} locations={locations} compact />
            </div>
          );
        })()}
      </div>

      {/* Stats */}
      <div className="px-3 py-2 border-b border-gray-800 shrink-0">
        <div className="grid grid-cols-3 gap-1">
          <div className="text-center bg-gray-800/30 rounded py-1.5 px-1">
            <div className="text-[9px] text-gray-500 uppercase">Qty</div>
            <div className="text-sm text-white font-bold">{stats.onHand}</div>
          </div>
          <div className="text-center bg-gray-800/30 rounded py-1.5 px-1">
            <div className="text-[9px] text-gray-500 uppercase">Reserved</div>
            <div className="text-sm text-orange-400 font-bold">{stats.reserved}</div>
          </div>
          <div className="text-center bg-gray-800/30 rounded py-1.5 px-1">
            <div className="text-[9px] text-gray-500 uppercase">Available</div>
            <div className={cn("text-sm font-bold", stats.available > 0 ? "text-green-400" : "text-red-400")}>{stats.available}</div>
          </div>
        </div>
      </div>

      {/* Locations + containers */}
      <div className="flex-1 overflow-y-auto p-2">
        {partLocations.length > 0 && (
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold px-2 py-1">Where</div>
            <div className="space-y-0.5">
              {partLocations.map((pl, idx) => {
                const isCurrentLoc = currentLocationId && pl.loc?.id === currentLocationId;
                return (
                <div key={idx} className={cn("flex items-center gap-2 px-2 py-1.5 rounded text-xs",
                  isCurrentLoc ? "bg-red-950/15 border border-red-900/20" : "bg-gray-800/20"
                )}>
                  <MapPin className={cn("w-3 h-3 shrink-0", isCurrentLoc ? "text-red-400" : "text-gray-500")} />
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-300 truncate">{pl.loc?.location_area || 'Unassigned'}</div>
                    {pl.ctr && (
                      <div className="text-[10px] text-indigo-400 truncate flex items-center gap-1 mt-0.5">
                        <Box className="w-2.5 h-2.5" /> {pl.ctr.name}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-white font-semibold">{pl.qty}</div>
                    {pl.reserved > 0 && <div className="text-[9px] text-orange-400">{pl.reserved} rsv</div>}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Open full details */}
      <div className="p-2.5 border-t border-gray-800 shrink-0">
        <Button size="sm" variant="outline" onClick={() => onPartClick?.(part)} className="w-full gap-1.5 text-xs border-gray-700 text-gray-300 h-8">
          <ExternalLink className="w-3 h-3" /> Open Full Details
        </Button>
      </div>
    </div>
  );
}