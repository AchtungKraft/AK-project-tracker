import React, { useMemo } from "react";
import { Package, ShoppingCart, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AkStockInventorySummary — Shows the two questions AK STOCK should answer:
 * 
 * WHAT DO WE HAVE?   On Hand - Reserved to Builds = Available
 * WHAT DO WE NEED?   Replenishment Required - On PO = To Order
 * 
 * Only rendered for AK STOCK (is_system_project + AK_STOCK type).
 * Uses inventory_snapshot from each commitment's part-level data,
 * deduplicated by part_id to avoid double-counting.
 */
export default function AkStockInventorySummary({ items }) {
  const stats = useMemo(() => {
    // Deduplicate by part_id — each part's physical inventory counts once
    const seenParts = new Map();
    let replenishmentRequired = 0;
    let replenishmentOnPO = 0;
    let replenishmentToOrder = 0;
    let replenishmentCount = 0;
    let legacyHoldingCount = 0;

    for (const item of items) {
      // Aggregate part-level inventory (deduplicated)
      const partId = item.part_id;
      if (partId && !seenParts.has(partId)) {
        const snap = item.inventory_snapshot || {};
        seenParts.set(partId, {
          physical: snap.physical_stock ?? snap.physical ?? 0,
          reserved: snap.reserved_global ?? snap.reserved ?? 0,
          available: snap.available ?? 0,
        });
      }

      // Separate replenishment vs legacy
      const ds = item.demand_source || item._raw?.demand_source;
      if (ds === 'STOCK_REPLENISHMENT' || ds === 'STOCK_MANUAL') {
        replenishmentCount++;
        replenishmentRequired += item.effective_required ?? item.required_total ?? 0;
        replenishmentOnPO += item.covered_from_po ?? 0;
        replenishmentToOrder += item.to_order_qty ?? item.to_order ?? 0;
      } else if (item.isAkStockLegacy) {
        legacyHoldingCount++;
      }
    }

    // Sum part-level inventory
    let totalOnHand = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    for (const inv of seenParts.values()) {
      totalOnHand += inv.physical;
      totalReserved += inv.reserved;
      totalAvailable += inv.available;
    }

    return {
      partCount: seenParts.size,
      totalOnHand,
      totalReserved,
      totalAvailable,
      replenishmentCount,
      replenishmentRequired,
      replenishmentOnPO,
      replenishmentToOrder,
      legacyHoldingCount,
    };
  }, [items]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* WHAT DO WE HAVE? */}
      <div className="bg-black/40 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">
            Inventory On Hand
          </span>
          <span className="text-[10px] text-gray-500 ml-auto">
            {stats.partCount} unique parts
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Metric label="On Hand" value={stats.totalOnHand} color="text-white" />
          <span className="text-gray-600">−</span>
          <Metric label="Reserved to Builds" value={stats.totalReserved} color="text-yellow-400" />
          <span className="text-gray-600">=</span>
          <Metric label="Available" value={stats.totalAvailable} color="text-emerald-400" large />
        </div>
      </div>

      {/* WHAT DO WE NEED TO BUY? */}
      <div className="bg-black/40 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingCart className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-wide">
            Replenishment Demand
          </span>
          <span className="text-[10px] text-gray-500 ml-auto">
            {stats.replenishmentCount} orders
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Metric label="Required" value={stats.replenishmentRequired} color="text-white" />
          <span className="text-gray-600">−</span>
          <Metric label="On PO" value={stats.replenishmentOnPO} color="text-blue-400" />
          <span className="text-gray-600">=</span>
          <Metric label="To Order" value={stats.replenishmentToOrder} color={stats.replenishmentToOrder > 0 ? "text-red-400" : "text-emerald-400"} large />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, color, large }) {
  return (
    <div className="text-center">
      <div className={cn(
        "font-bold font-mono",
        large ? "text-2xl" : "text-lg",
        color
      )}>
        {value}
      </div>
      <div className="text-[10px] text-gray-500 uppercase whitespace-nowrap">{label}</div>
    </div>
  );
}