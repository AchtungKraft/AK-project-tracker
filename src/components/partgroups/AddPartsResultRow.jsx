import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryPathLabel } from "@/lib/categoryTreeHelpers";

export default function AddPartsResultRow({ part, isSelected, isExisting, inventoryData, vendorsMap, catLookups, onToggle }) {
  const photo = part.featured_photo || part.photos?.[0];
  const vendor = vendorsMap?.[part.default_vendor_id];
  const onHand = inventoryData?.physical_stock ?? null;
  const demand = inventoryData?.required_total ?? null;

  // Full recursive category path label using shared lookups
  const catLabel = React.useMemo(() => {
    if (!part.part_category_id || !catLookups?.byId?.[part.part_category_id]) return null;
    return getCategoryPathLabel(part.part_category_id, catLookups.byId);
  }, [part.part_category_id, catLookups]);

  return (
    <label
      className={cn(
        "flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors group",
        isExisting && "opacity-50 cursor-default",
        isSelected && !isExisting && "bg-red-950/30 border border-red-800/40",
        !isSelected && !isExisting && "hover:bg-gray-800/40"
      )}
      onClick={e => { if (isExisting) e.preventDefault(); }}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        disabled={isExisting}
        className="shrink-0"
      />

      {/* Image */}
      <div className="w-9 h-9 shrink-0 bg-gray-800 rounded overflow-hidden">
        {photo ? (
          <img src={photo} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-3.5 h-3.5 text-gray-600" />
          </div>
        )}
      </div>

      {/* Primary info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white font-medium truncate">{part.part_name}</div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {part.vendor_part_number && (
            <span className="text-[11px] text-gray-500 font-mono">{part.vendor_part_number}</span>
          )}
          {catLabel && (
            <span className="text-[10px] text-gray-500 truncate max-w-[200px]" title={catLabel}>{catLabel}</span>
          )}
          {vendor && (
            <span className="text-[10px] text-gray-500 truncate max-w-[100px]">· {vendor.vendor_name}</span>
          )}
        </div>
      </div>

      {/* Operational values */}
      <div className="hidden sm:flex items-center gap-3 text-[11px] shrink-0">
        <div className="text-center min-w-[36px]">
          <div className="text-gray-600 text-[9px]">Stock</div>
          <div className={cn("font-semibold", onHand === null ? "text-gray-600" : onHand > 0 ? "text-green-400" : "text-gray-500")}>
            {onHand === null ? "—" : onHand}
          </div>
        </div>
        <div className="text-center min-w-[36px]">
          <div className="text-gray-600 text-[9px]">Demand</div>
          <div className={cn("font-semibold", demand === null ? "text-gray-600" : demand > 0 ? "text-cyan-400" : "text-gray-500")}>
            {demand === null ? "—" : demand}
          </div>
        </div>
      </div>

      {/* Already in group badge */}
      {isExisting && (
        <Badge variant="outline" className="text-[10px] border-gray-600 text-gray-400 shrink-0 whitespace-nowrap">
          Already in Group
        </Badge>
      )}
    </label>
  );
}