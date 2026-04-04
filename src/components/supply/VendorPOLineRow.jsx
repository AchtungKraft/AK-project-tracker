import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { cn } from "@/lib/utils";
import { CheapestBadge, SourceComparisonPopover } from "./SourceComparisonBadges";

/**
 * VendorPOAvailableRow — A single available item in the "Add to PO" list.
 */
export function VendorPOAvailableRow({ item, onAdd }) {
  const cost = item.unit_cost || 0;
  const extCost = cost * item.qty_to_order;

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50 hover:border-gray-600 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-white font-medium truncate">{item.part_name}</p>
          <CheapestBadge
            isCheapest={item.is_cheapest_overall ?? item.is_cheapest_source}
            isCheapestForVendor={item.is_cheapest_for_vendor}
            priceDelta={item.price_delta}
            priceDeltaOverall={item.price_delta_overall}
            context="vendor"
          />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500">{item.project_name}</span>
          {item.vendor_part_number && (
            <span className="text-xs text-gray-600">SKU: {item.vendor_part_number}</span>
          )}
          <SourceComparisonPopover allSources={item.all_sources} currentVendorId={null} />
        </div>
      </div>

      <div className="text-right shrink-0 w-16">
        <p className="text-xs text-gray-500">Need</p>
        <p className="text-sm font-mono text-amber-400">{item.qty_to_order}</p>
      </div>

      <div className="text-right shrink-0 w-20">
        <p className="text-xs text-gray-500">Unit Cost</p>
        <p className={cn("text-sm font-mono", cost > 0 ? "text-emerald-400" : "text-red-400")}>
          {cost > 0 ? formatCurrencyUSD(cost) : '$0'}
        </p>
      </div>

      <div className="text-right shrink-0 w-20">
        <p className="text-xs text-gray-500">Ext.</p>
        <p className="text-sm font-mono text-gray-300">{formatCurrencyUSD(extCost)}</p>
      </div>

      <Button
        size="sm"
        onClick={() => onAdd(item)}
        className="bg-green-700 hover:bg-green-600 text-white shrink-0 gap-1"
      >
        <Plus className="w-3 h-3" />
        Add
      </Button>
    </div>
  );
}

/**
 * VendorPOSelectedRow — A line item added to the PO cart.
 */
export function VendorPOSelectedRow({ line, vendorSources, onChange, onRemove }) {
  const extCost = (line.unit_cost || 0) * (line.qty || 0);

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border",
      line.is_cheapest_source === false && line.price_delta > 0
        ? "bg-amber-900/10 border-amber-800/30"
        : "bg-gray-900/60 border-green-800/30"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-white font-medium truncate">{line.part_name}</p>
          <CheapestBadge
            isCheapest={line.is_cheapest_overall ?? line.is_cheapest_source}
            isCheapestForVendor={line.is_cheapest_for_vendor}
            priceDelta={line.price_delta}
            priceDeltaOverall={line.price_delta_overall}
            context="vendor"
          />
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-500">{line.project_name}</p>
          <SourceComparisonPopover allSources={line.all_sources} currentVendorId={null} />
        </div>
      </div>

      {/* Qty input */}
      <div className="shrink-0">
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            value={line.qty}
            onChange={e => onChange({ qty: Math.max(0, Number(e.target.value) || 0) })}
            className="bg-gray-800 border-gray-700 text-white text-center h-8 text-sm w-20"
          />
        </div>
        {line.qty_requested > 0 && (
          <div className="text-[9px] text-center mt-0.5">
            <span className="text-gray-500">{line.qty_requested} needed</span>
            {line.qty > line.qty_requested && (
              <span className="text-amber-400 ml-1">(+{line.qty - line.qty_requested} extra)</span>
            )}
          </div>
        )}
        {line.is_manual && (
          <div className="text-[9px] text-center mt-0.5 text-blue-400">manual</div>
        )}
      </div>

      {/* Source selector (if multiple sources for this vendor) */}
      {vendorSources.length > 1 ? (
        <div className="w-40 shrink-0">
          <Select value={line.source_id || 'default'} onValueChange={val => {
            const src = vendorSources.find(s => s.source_id === val);
            if (src) onChange({ source_id: src.source_id, unit_cost: src.unit_cost });
          }}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {vendorSources.map(s => (
                <SelectItem key={s.source_id} value={s.source_id}>
                  {formatCurrencyUSD(s.unit_cost)} {s.vendor_part_number ? `(${s.vendor_part_number})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="w-20 text-right shrink-0">
          <p className={cn("text-sm font-mono", line.unit_cost > 0 ? "text-emerald-400" : "text-red-400")}>
            {line.unit_cost > 0 ? formatCurrencyUSD(line.unit_cost) : '$0'}
          </p>
        </div>
      )}

      {/* Extended cost */}
      <div className="w-24 text-right shrink-0">
        <p className="text-sm font-mono text-gray-300">{formatCurrencyUSD(extCost)}</p>
      </div>

      <Button
        size="icon"
        variant="ghost"
        onClick={onRemove}
        className="text-red-400 hover:text-red-300 hover:bg-red-900/30 h-8 w-8 shrink-0"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}