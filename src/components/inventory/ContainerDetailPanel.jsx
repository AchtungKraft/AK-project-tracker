import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRightLeft, Printer, Package, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContainerTypeConfig } from "./containerTypeConfig";
import LocationBreadcrumb from "./LocationBreadcrumb";
import StoragePartRow from "./StoragePartRow";

export default function ContainerDetailPanel({
  container, locations, inventoryItems, parts, projects, vendors,
  onClose, onMove, onAddParts, onPartClick, onOpenGallery, partActions,
  getInventoryStats, getInventoryItemId,
}) {
  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;
  const displayColor = container.color || tc.color;
  const location = locations.find(l => l.id === container.location_id);
  const project = container.project_id ? projects.find(p => p.id === container.project_id) : null;

  // Parts inside this container
  const containedItems = inventoryItems.filter(i => i.container_id === container.id && (i.quantity_on_hand || 0) > 0);
  const containedPartIds = new Set(containedItems.map(i => i.part_id));
  const containedParts = parts.filter(p => containedPartIds.has(p.id));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-red-900/20 bg-gray-900/40 shrink-0">
        <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8 text-gray-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: displayColor + '20' }}>
          <TypeIcon className="w-5 h-5" style={{ color: displayColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-white truncate">{container.name}</h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Badge variant="outline" className="text-[10px] py-0" style={{ borderColor: displayColor + '60', color: displayColor }}>{tc.label}</Badge>
            {container.short_code && <span className="font-mono">[{container.short_code}]</span>}
          </div>
        </div>
        {onAddParts && (
          <Button size="sm" variant="ghost" onClick={() => onAddParts(container)} className="gap-1 h-8 text-gray-400 hover:text-white">
            <Plus className="w-3.5 h-3.5" /> Add Parts
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onMove(container)} className="gap-1 h-8 border-gray-700 text-gray-300">
          <ArrowRightLeft className="w-3.5 h-3.5" /> Move
        </Button>
      </div>

      {/* Location & Project */}
      <div className="px-4 py-3 border-b border-red-900/20 bg-gray-900/20 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <MapPin className="w-3.5 h-3.5 text-gray-500" />
          {location ? (
            <LocationBreadcrumb locationId={location.id} locations={locations} compact />
          ) : (
            <span className="text-yellow-400">No location assigned</span>
          )}
        </div>
        {project && (
          <div className="flex items-center gap-2 text-xs">
            <Package className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-gray-300">{project.name}</span>
            {project.client_name && <span className="text-gray-500">({project.client_name})</span>}
          </div>
        )}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">Contents</span>
          <span className="text-white font-semibold">{containedParts.length} part{containedParts.length !== 1 ? 's' : ''}</span>
          <span className="text-gray-500">{containedItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0)} units</span>
        </div>
      </div>

      {/* Contents */}
      <div className="flex-1 overflow-y-auto p-4">
        {containedParts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Package className="w-12 h-12 text-gray-600 mb-3" />
            <p className="text-sm text-gray-400">Container is empty</p>
            <p className="text-xs text-gray-600 mt-1">Add parts to this container from the location view</p>
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