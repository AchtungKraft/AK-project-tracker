import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Building2, Package, DollarSign, ShoppingCart, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * VendorQueueView — Vendor-grouped summary derived from canonical procurement data.
 * No separate backend call — groups the same filteredItems used by the parts view.
 *
 * Props:
 *  - items: filteredItems from GlobalNeedToOrder (to_order > 0, canonical)
 *  - onSelectVendor(vendorSummary): called when user clicks a vendor row
 */
export default function VendorQueueView({ items, onSelectVendor }) {
  const vendorQueue = useMemo(() => {
    const agg = {};

    for (const item of items) {
      const vendorId = item.vendor?.id || item.vendor_id;
      if (!vendorId) continue;

      const toOrder = item.to_order ?? 0;
      if (toOrder <= 0) continue;

      if (!agg[vendorId]) {
        agg[vendorId] = {
          vendor_id: vendorId,
          vendor_name: item.vendor?.vendor_name || item.vendor_name || "Unknown",
          color: item.vendor?.color || "#3B82F6",
          group_name: item.vendor?.group_name || "",
          parts: new Set(),
          total_value: 0,
          urgent_count: 0,
          items: [],
        };
      }

      agg[vendorId].parts.add(item.part_id);
      const unitCost = item.unit_cost ?? 0;
      agg[vendorId].total_value += toOrder * unitCost;
      agg[vendorId].items.push(item);

      // Urgent = zero coverage
      const coveredFromPO = item.covered_from_po ?? 0;
      const reserved = item.reserved_from_stock ?? 0;
      if (coveredFromPO === 0 && reserved === 0) {
        agg[vendorId].urgent_count += 1;
      }
    }

    return Object.values(agg)
      .map((v) => ({
        ...v,
        parts_count: v.parts.size,
        total_value: Math.round(v.total_value * 100) / 100,
      }))
      .sort((a, b) => {
        if (b.urgent_count !== a.urgent_count) return b.urgent_count - a.urgent_count;
        if (b.total_value !== a.total_value) return b.total_value - a.total_value;
        return b.parts_count - a.parts_count;
      });
  }, [items]);

  if (vendorQueue.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400" />
        <p>No vendors need ordering</p>
        <p className="text-xs text-gray-500 mt-1">All commitments are covered or filters exclude results</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="flex items-center gap-4 text-xs text-gray-400 px-1">
        <span>{vendorQueue.length} vendor{vendorQueue.length !== 1 ? "s" : ""} with demand</span>
        <span className="text-emerald-400 font-mono">
          {formatCurrencyUSD(vendorQueue.reduce((s, v) => s + v.total_value, 0))} total
        </span>
        {vendorQueue.reduce((s, v) => s + v.urgent_count, 0) > 0 && (
          <span className="text-red-400">
            {vendorQueue.reduce((s, v) => s + v.urgent_count, 0)} urgent items
          </span>
        )}
      </div>

      {/* Vendor rows */}
      <div className="border border-gray-800 rounded-lg overflow-hidden bg-black/30">
        {vendorQueue.map((v, idx) => (
          <button
            key={v.vendor_id}
            onClick={() =>
              onSelectVendor({
                id: v.vendor_id,
                vendor_name: v.vendor_name,
                color: v.color,
              })
            }
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-800/60",
              idx !== vendorQueue.length - 1 && "border-b border-gray-800/60"
            )}
          >
            {/* Color dot */}
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: v.color }}
            />

            {/* Vendor info */}
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-white truncate block">
                {v.vendor_name}
              </span>
              {v.group_name && (
                <span className="text-[10px] text-gray-500 truncate block">
                  {v.group_name}
                </span>
              )}
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-4 shrink-0 text-xs font-mono">
              <span className="text-gray-400 flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                {v.parts_count} part{v.parts_count !== 1 ? "s" : ""}
              </span>
              <span className="text-emerald-400 flex items-center gap-1 min-w-[70px] justify-end">
                <DollarSign className="w-3.5 h-3.5" />
                {formatCurrencyUSD(v.total_value)}
              </span>
              {v.urgent_count > 0 && (
                <Badge className="bg-red-900/50 text-red-400 border-red-700/40 text-[9px] px-1.5 py-0">
                  {v.urgent_count} urgent
                </Badge>
              )}
            </div>

            {/* Action hint */}
            <Badge className="bg-green-900/30 text-green-400 border-green-700/40 text-[9px] px-2 py-0.5 shrink-0">
              Select All
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}