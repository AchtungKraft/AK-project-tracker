import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Package, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MoveItemSelector — multi-select inventory list with per-line quantity controls.
 *
 * Props:
 *   items       — [{inventoryItem, part}] available at source
 *   selected    — Map<inventoryItemId, { qty: number }>
 *   onToggle(id)
 *   onSetQty(id, qty)
 */
export default function MoveItemSelector({ items, selected, onToggle, onSetQty }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <Package className="w-12 h-12 text-gray-700 mb-3" />
        <p className="text-sm text-gray-400 font-medium">No movable inventory</p>
        <p className="text-xs text-gray-600 mt-1">Everything here is fully reserved or empty.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(({ inventoryItem, part }) => {
        const id = inventoryItem.id;
        const isSelected = selected.has(id);
        const sel = selected.get(id);
        const onHand = inventoryItem.quantity_on_hand || 0;
        const reserved = inventoryItem.quantity_reserved || 0;
        const available = onHand - reserved;
        const moveQty = sel?.qty || 0;
        const images = part?.photos || [];
        const featuredPhoto = part?.featured_photo || images[0];

        return (
          <div key={id}
            className={cn(
              "rounded-lg border transition-all",
              isSelected
                ? "bg-red-950/20 border-red-800/50"
                : "bg-gray-900/30 border-gray-800"
            )}
          >
            {/* Top row: checkbox + part info + select toggle */}
            <button
              className="flex items-center gap-3 p-3 w-full text-left"
              onClick={() => onToggle(id)}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggle(id)}
                className="shrink-0 h-5 w-5 border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                onClick={(e) => e.stopPropagation()}
              />
              {featuredPhoto ? (
                <img src={featuredPhoto} alt="" className="w-10 h-10 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
              ) : (
                <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-gray-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm text-white font-medium truncate">{part?.part_name || 'Unknown Part'}</h4>
                {part?.vendor_part_number && (
                  <div className="text-xs text-gray-400 font-mono truncate">{part.vendor_part_number}</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm text-white font-semibold">{available}</div>
                <div className="text-[10px] text-gray-500">avail</div>
                {reserved > 0 && (
                  <div className="text-[10px] text-orange-400">{reserved} rsv</div>
                )}
              </div>
            </button>

            {/* Quantity controls — visible when selected */}
            {isSelected && available > 0 && (
              <div className="flex items-center gap-3 px-3 pb-3 pt-0">
                <span className="text-xs text-gray-400 shrink-0">Move:</span>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline"
                    className="h-8 w-8 border-gray-700 text-gray-300"
                    disabled={moveQty <= 1}
                    onClick={() => onSetQty(id, Math.max(1, moveQty - 1))}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <input
                    type="number"
                    min={1} max={available}
                    value={moveQty}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 0;
                      onSetQty(id, Math.min(available, Math.max(0, v)));
                    }}
                    className="w-14 h-8 text-center bg-gray-800 border border-gray-700 rounded text-white text-sm font-semibold"
                  />
                  <Button size="icon" variant="outline"
                    className="h-8 w-8 border-gray-700 text-gray-300"
                    disabled={moveQty >= available}
                    onClick={() => onSetQty(id, Math.min(available, moveQty + 1))}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {available > 1 && moveQty < available && (
                  <Button size="sm" variant="ghost"
                    className="h-7 px-2 text-xs text-gray-400 hover:text-white"
                    onClick={() => onSetQty(id, available)}
                  >
                    All ({available})
                  </Button>
                )}
                <span className="text-xs text-gray-500 ml-auto">of {available}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}