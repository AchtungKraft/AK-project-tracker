import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRightLeft, Printer, Package, MapPin, Plus, Home, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContainerTypeConfig } from "./containerTypeConfig";
import { printContainerQRLabel } from "./containerQRLabel";
import LocationBreadcrumb from "./LocationBreadcrumb";
import StoragePartRow from "./StoragePartRow";

export default function ContainerDetailPanel({
  container, locations, inventoryItems, parts, projects, vendors,
  onClose, onMove, onReturnHome, onAddParts, onEmptyContainer,
  onPartClick, onOpenGallery, partActions,
  getInventoryStats, getInventoryItemId,
}) {
  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;
  const displayColor = container.color || tc.color;
  const location = locations.find(l => l.id === container.location_id);
  const homeLocation = container.home_location_id ? locations.find(l => l.id === container.home_location_id) : null;
  const isAwayFromHome = homeLocation && container.location_id !== container.home_location_id;
  const project = container.project_id ? projects.find(p => p.id === container.project_id) : null;

  const containedItems = inventoryItems.filter(i => i.container_id === container.id && (i.quantity_on_hand || 0) > 0);
  const containedPartIds = new Set(containedItems.map(i => i.part_id));
  const containedParts = parts.filter(p => containedPartIds.has(p.id));
  const totalUnits = containedItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-red-900/20 bg-gray-900/40 shrink-0">
        <Button size="icon" variant="ghost" onClick={onClose} className="h-9 w-9 text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        {container.photo ? (
          <img src={container.photo} alt={container.name} className="w-12 h-12 rounded-lg object-cover border border-gray-700 shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: displayColor + '20' }}>
            <TypeIcon className="w-6 h-6" style={{ color: displayColor }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-white truncate">{container.name}</h3>
          <div className="flex items-center gap-2 text-xs">
            {container.short_code && (
              <span className="font-mono font-bold text-gray-300">{container.short_code}</span>
            )}
            <Badge variant="outline" className="text-[10px] py-0" style={{ borderColor: displayColor + '60', color: displayColor }}>
              {tc.label}
            </Badge>
            {containedParts.length === 0 && (
              <Badge variant="outline" className="text-[10px] py-0 border-gray-600 text-gray-400">Empty</Badge>
            )}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={() => printContainerQRLabel(container, { locations })} className="h-9 w-9 text-gray-400 hover:text-white" title="Print QR Label">
          <Printer className="w-5 h-5" />
        </Button>
      </div>

      {/* Location, Home & Project */}
      <div className="px-4 py-3 border-b border-red-900/20 bg-gray-900/20 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="text-gray-500 shrink-0">At:</span>
          {location ? (
            <LocationBreadcrumb locationId={location.id} locations={locations} compact />
          ) : (
            <span className="text-yellow-400">No location</span>
          )}
        </div>

        {homeLocation && (
          <div className="flex items-center gap-2 text-sm">
            <Home className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="text-gray-500 shrink-0">Home:</span>
            <span className={cn("truncate", isAwayFromHome ? "text-amber-400" : "text-gray-300")}>
              {homeLocation.location_area}
            </span>
            {isAwayFromHome && (
              <Button
                size="sm" variant="ghost"
                onClick={() => onReturnHome?.(container)}
                className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 gap-1 ml-auto shrink-0"
              >
                <Home className="w-3.5 h-3.5" /> Return Home
              </Button>
            )}
          </div>
        )}

        {project && (
          <div className="flex items-center gap-2 text-sm">
            <Package className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-gray-300">{project.name}</span>
            {project.client_name && <span className="text-gray-500">({project.client_name})</span>}
          </div>
        )}

        {container.description && (
          <p className="text-xs text-gray-500 italic">{container.description}</p>
        )}

        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">Contents</span>
          <span className="text-white font-semibold">{containedParts.length} part{containedParts.length !== 1 ? 's' : ''}</span>
          <span className="text-gray-500">{totalUnits} units</span>
        </div>
      </div>

      {/* Actions bar — large touch targets */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-red-900/20 bg-gray-900/10 flex-wrap">
        {onAddParts && (
          <Button size="sm" variant="ghost" onClick={() => onAddParts(container)} className="gap-1.5 h-9 text-sm text-gray-400 hover:text-white">
            <Plus className="w-4 h-4" /> Add Parts
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onMove(container)} className="gap-1.5 h-9 text-sm border-gray-700 text-gray-300">
          <ArrowRightLeft className="w-4 h-4" /> Move
        </Button>
        {isAwayFromHome && (
          <Button size="sm" variant="outline" onClick={() => onReturnHome?.(container)} className="gap-1.5 h-9 text-sm border-amber-700/50 text-amber-400 hover:bg-amber-950/30">
            <Home className="w-4 h-4" /> Return Home
          </Button>
        )}
        {containedParts.length > 0 && onEmptyContainer && (
          <Button size="sm" variant="ghost" onClick={() => onEmptyContainer(container)} className="gap-1.5 h-9 text-sm text-gray-500 hover:text-red-400 ml-auto">
            <Trash2 className="w-4 h-4" /> Empty
          </Button>
        )}
      </div>

      {/* Contents */}
      <div className="flex-1 overflow-y-auto p-4">
        {containedParts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Package className="w-14 h-14 text-gray-700 mb-3" />
            <p className="text-base text-gray-400 font-medium">Container is empty</p>
            <p className="text-sm text-gray-600 mt-1">0 parts · Ready for use</p>
            {onAddParts && (
              <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => onAddParts(container)}>
                <Plus className="w-4 h-4" /> Add Parts
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {containedParts.map(part => {
              const item = containedItems.find(i => i.part_id === part.id);
              return (
                <StoragePartRow
                  key={part.id}
                  part={part}
                  locationQty={item?.quantity_on_hand || 0}
                  locationReserved={item?.quantity_reserved || 0}
                  locationId={container.location_id}
                  selectedLocationId={container.location_id}
                  getInventoryStats={getInventoryStats}
                  getInventoryItemId={getInventoryItemId}
                  vendors={vendors}
                  onPartClick={onPartClick}
                  onOpenGallery={onOpenGallery}
                  partActions={partActions}
                  containerName={container.name}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}