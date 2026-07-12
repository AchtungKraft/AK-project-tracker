import React from "react";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import InventoryLocationEditor from "./InventoryLocationEditor";
import PartActionsDropdown from "../parts/PartActionsDropdown";

export default function StoragePartRow({
  part, locationQty, locationReserved, locationId,
  selectedLocationId, getInventoryStats, getInventoryItemId,
  vendors, onPartClick, onOpenGallery, partActions, containerName,
  isSelected = false, isFlashing = false,
}) {
  const images = part.photos || [];
  const featuredPhoto = part.featured_photo || images[0];
  const hasLocationQty = locationQty !== undefined;
  const stats = hasLocationQty
    ? { onHand: locationQty, reserved: locationReserved || 0, available: locationQty - (locationReserved || 0) }
    : (selectedLocationId && selectedLocationId !== 'unassigned'
        ? getInventoryStats(part.id, selectedLocationId)
        : getInventoryStats(part.id));
  const vendor = vendors.find(v => v.id === part.default_vendor_id);
  const isFullyReserved = stats.onHand > 0 && stats.available === 0;
  const isLowStock = stats.available <= (part.reorder_point || 0) && stats.available > 0;
  const inventoryItemId = locationId ? getInventoryItemId(part.id, locationId) : null;

  return (
    <div
      onClick={() => onPartClick?.(part)}
      className={cn(
        "flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group min-h-[88px]",
        isSelected
          ? "bg-red-950/20 border-red-800/50 ring-1 ring-red-900/30"
          : "bg-gray-900/30 border-gray-800 hover:border-red-900/50",
        isFlashing && "animate-storage-flash"
      )}
    >
      <div className="flex items-start gap-3 w-full md:w-auto md:flex-1">
        <div
          className="relative w-16 h-16 md:w-12 md:h-12 flex-shrink-0 bg-gray-800 rounded overflow-hidden cursor-pointer"
          onClick={(e) => { e.stopPropagation(); if (images.length > 0) onOpenGallery(images, 0); }}
        >
          {featuredPhoto ? (
            <>
              <img src={featuredPhoto} alt={part.part_name} className="w-full h-full object-cover" loading="lazy" />
              {images.length > 1 && <div className="absolute bottom-0 right-0 bg-black/80 text-white text-xs px-1 rounded-tl">{images.length}</div>}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Package className="w-6 h-6 text-gray-600" /></div>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start gap-2">
            <h4 className="text-white text-sm font-medium line-clamp-2 flex-1 group-hover:text-red-400 transition-colors">{part.part_name}</h4>
            {isFullyReserved && <Badge variant="outline" className="border-orange-500 text-orange-400 text-xs shrink-0">Reserved</Badge>}
            {isLowStock && !isFullyReserved && <Badge variant="outline" className="border-yellow-500 text-yellow-400 text-xs shrink-0">Low Stock</Badge>}
          </div>
          {part.vendor_part_number && <div className="text-xs text-gray-400 font-mono truncate">{part.vendor_part_number}</div>}
          {containerName && <div className="text-[10px] text-indigo-400">📦 {containerName}</div>}
          {vendor && <div className="text-xs text-gray-500 truncate">{vendor.vendor_name}</div>}
        </div>
      </div>
      <div className="flex justify-around md:justify-end md:gap-4 text-xs shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-800">
        <div className="text-center min-w-[50px]">
          <div className="text-gray-500 mb-0.5">Qty</div>
          <div className="text-white font-semibold">
            {stats.onHand}
            {stats.reserved > 0 && <span className="text-orange-400 font-normal ml-1">({stats.reserved} rsv)</span>}
          </div>
        </div>
        <div className="text-center min-w-[50px]">
          <div className="text-gray-500 mb-0.5">Available</div>
          <div className={cn("font-semibold", stats.available > 0 ? "text-green-400" : stats.onHand > 0 ? "text-orange-400" : "text-red-400")}>{stats.available}</div>
        </div>
      </div>
      {inventoryItemId && (
        <div><InventoryLocationEditor inventoryItemId={inventoryItemId} currentLocationId={locationId === 'unassigned' ? null : locationId} compact /></div>
      )}
      <div className="ml-2">
        <PartActionsDropdown
          part={part}
          onAddInventory={partActions.onAddInventory}
          onOrderPart={partActions.onOrderPart}
          onAddToBuild={partActions.onAddToBuild}
          onAddToNeedToBuy={partActions.onAddToNeedToBuy}
          onViewDetails={partActions.onViewDetails}
        />
      </div>
    </div>
  );
}