import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Package, Trash2, MoreVertical, Check, X } from "lucide-react";
import { formatCurrency } from "@/components/supply/pricingHelpers";
import { getCategoryPathLabel } from "@/lib/categoryTreeHelpers";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

export default function PartGroupItemRow({ item, sections, vendorsMap, catLookups, onUpdate, onRemove }) {
  const { part, inv, unitCost, extCost } = item;
  const [editingQty, setEditingQty] = useState(false);
  const [qtyValue, setQtyValue] = useState(String(item.quantity || 1));

  const vendor = vendorsMap?.[part.default_vendor_id];
  const onHand = inv?.physical_stock ?? null;
  const demand = inv?.required_total ?? null;
  const featuredPhoto = part.featured_photo || part.photos?.[0];
  const catLabel = part.part_category_id && catLookups?.byId?.[part.part_category_id]
    ? getCategoryPathLabel(part.part_category_id, catLookups.byId) : null;

  const saveQty = () => {
    const num = parseFloat(qtyValue);
    if (num > 0) onUpdate({ quantity: num });
    setEditingQty(false);
  };

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2 p-2.5 bg-gray-900/30 rounded-lg border border-gray-800 hover:border-gray-700 transition-all group/item">
      {/* Part Info */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className="w-10 h-10 flex-shrink-0 bg-gray-800 rounded overflow-hidden">
          {featuredPhoto ? (
            <img src={featuredPhoto} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-4 h-4 text-gray-600" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-white font-medium truncate">{part.part_name}</span>
            {item.is_optional && (
              <Badge variant="outline" className="border-yellow-600 text-yellow-400 text-[10px] px-1 py-0">Optional</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {part.vendor_part_number && (
              <span className="text-[11px] text-gray-500 font-mono">{part.vendor_part_number}</span>
            )}
            {catLabel && (
              <span className="text-[10px] text-gray-500 truncate max-w-[180px]" title={catLabel}>{catLabel}</span>
            )}
          </div>
          {item.notes && (
            <div className="text-[11px] text-blue-400 truncate mt-0.5">📝 {item.notes}</div>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-around md:justify-end gap-3 text-xs shrink-0 pt-1.5 md:pt-0 border-t md:border-t-0 border-gray-800/50">
        {/* Quantity */}
        <div className="text-center min-w-[45px]">
          <div className="text-gray-500 mb-0.5">Qty</div>
          {editingQty ? (
            <div className="flex items-center gap-1">
              <Input
                value={qtyValue}
                onChange={e => setQtyValue(e.target.value)}
                className="w-14 h-6 text-xs text-center p-0"
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") saveQty(); if (e.key === "Escape") setEditingQty(false); }}
              />
              <button onClick={saveQty} className="text-green-400"><Check className="w-3 h-3" /></button>
              <button onClick={() => setEditingQty(false)} className="text-gray-400"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <button
              onClick={() => { setQtyValue(String(item.quantity || 1)); setEditingQty(true); }}
              className="text-white font-semibold hover:text-red-400 transition-colors"
            >
              {item.quantity || 1}
            </button>
          )}
        </div>

        {/* Vendor */}
        <div className="text-center min-w-[60px] hidden md:block">
          <div className="text-gray-500 mb-0.5">Source</div>
          <div className="text-gray-300 text-[11px] truncate max-w-[80px]">{vendor?.vendor_name || "—"}</div>
        </div>

        {/* Unit Cost */}
        <div className="text-center min-w-[50px]">
          <div className="text-gray-500 mb-0.5">Cost</div>
          <div className="text-gray-300 font-mono">{formatCurrency(unitCost)}</div>
        </div>

        {/* Extended Cost */}
        <div className="text-center min-w-[55px]">
          <div className="text-gray-500 mb-0.5">Ext</div>
          <div className="text-white font-mono font-semibold">{formatCurrency(extCost)}</div>
        </div>

        {/* On Hand */}
        <div className="text-center min-w-[45px]">
          <div className="text-gray-500 mb-0.5">Stock</div>
          <div className={cn("font-semibold", onHand === null ? "text-gray-600" : onHand > 0 ? "text-green-400" : "text-gray-500")}>
            {onHand === null ? "—" : onHand}
          </div>
        </div>

        {/* Demand */}
        <div className="text-center min-w-[45px]">
          <div className="text-gray-500 mb-0.5">Demand</div>
          <div className={cn("font-semibold", demand === null ? "text-gray-600" : demand > 0 ? "text-cyan-400" : "text-gray-500")}>
            {demand === null ? "—" : demand}
          </div>
        </div>

        {/* Section indicator */}
        {item.section_name && item.section_name !== "General Parts" && (
          <div className="text-center min-w-[50px] hidden lg:block">
            <div className="text-gray-500 mb-0.5">Section</div>
            <div className="text-gray-400 text-[11px] truncate max-w-[70px]">{item.section_name}</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="hidden md:block ml-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 opacity-0 group-hover/item:opacity-100 transition-opacity">
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onUpdate({ is_optional: !item.is_optional })} className="cursor-pointer text-xs">
              {item.is_optional ? "Mark as Required" : "Mark as Optional"}
            </DropdownMenuItem>
            {sections.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-xs">Move to Section</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => onUpdate({ section_name: null })} className="cursor-pointer text-xs">General Parts</DropdownMenuItem>
                  {sections.map(s => (
                    <DropdownMenuItem key={s} onClick={() => onUpdate({ section_name: s })} className="cursor-pointer text-xs">{s}</DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuItem onClick={onRemove} className="cursor-pointer text-xs text-red-400">
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove from Group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}