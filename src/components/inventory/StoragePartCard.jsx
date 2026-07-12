import React from "react";
import { Badge } from "@/components/ui/badge";
import { Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import InventoryLocationEditor from "./InventoryLocationEditor";
import PartActionsDropdown from "../parts/PartActionsDropdown";

export default function StoragePartCard({
  part, locationQty, locationReserved, locationId,
  selectedLocationId, getInventoryStats, getInventoryItemId,
  vendors, onPartClick, onOpenGallery, partActions,
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
    <div onClick={() => onPartClick?.(part)} className={cn(
      "bg-gray-900/50 rounded-lg border transition-all cursor-pointer group",
      isSelected ? "border-red-800/50 ring-1 ring-red-900/30" : "border-gray-800 hover:border-red-900/50",
      isFlashing && "animate-storage-flash"
    )}>
      {featuredPhoto ? (
        <div className="relative h-32 bg-gray-800 rounded-t-lg flex items-center justify-center overflow-hidden" onClick={(e) => { e.stopPropagation(); onOpenGallery(images, 0); }}>
          <img src={featuredPhoto} alt={part.part_name} className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform" loading="lazy" />
          {images.length > 1 && <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded-full">{images.length}</div>}
        </div>
      ) : (
        <div className="h-32 bg-gray-800 rounded-t-lg flex items-center justify-center"><Package className="w-12 h-12 text-gray-600" /></div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="text-white text-sm font-semibold line-clamp-2 flex-1 group-hover:text-red-400 transition-colors">{part.part_name}</h4>
          {isFullyReserved && <Badge variant="outline" className="border-orange-500 text-orange-400 text-xs shrink-0">Rsv</Badge>}
          {isLowStock && !isFullyReserved && <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />}
        </div>
        {part.vendor_part_number && <p className="text-xs text-gray-400 font-mono mb-2 truncate">{part.vendor_part_number}</p>}
        <div className="grid grid-cols-2 gap-1 pt-2 border-t border-gray-800">
          <div className="text-center">
            <p className="text-xs text-gray-500">Qty</p>
            <p className="text-sm text-white font-semibold">{stats.onHand}{stats.reserved > 0 && <span className="text-orange-400 text-xs ml-1">({stats.reserved})</span>}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Available</p>
            <p className={`text-sm font-semibold ${stats.available > 0 ? 'text-green-400' : stats.onHand > 0 ? 'text-orange-400' : 'text-red-400'}`}>{stats.available}</p>
          </div>
        </div>
        {inventoryItemId && (
          <div className="mt-2 pt-2 border-t border-gray-800">
            <InventoryLocationEditor inventoryItemId={inventoryItemId} currentLocationId={locationId === 'unassigned' ? null : locationId} compact />
          </div>
        )}
        <div className="flex items-center justify-between text-xs mt-2">
          {vendor ? <span className="text-gray-400 truncate max-w-[100px]">{vendor.vendor_name}</span> : <div />}
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
    </div>
  );
}