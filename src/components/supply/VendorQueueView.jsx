import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import {
  Package, DollarSign, CheckCircle2,
  TrendingDown, Check, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * VendorQueueView — Vendor-grouped summary with multi-source intelligence.
 *
 * PART 1: onSelectVendor(vendor, itemIds) — passes matched item IDs
 *         so parent does selection-only, NO dataset mutation.
 *
 * PART 2: Loads PartVendorSource for ALL items, groups by vendor
 *         including alternate sources. Shows pricing comparison.
 *
 * Props:
 *  - items: filteredItems from GlobalNeedToOrder (to_order > 0, canonical)
 *  - onSelectVendor(vendor, itemIds, sourcesByPartId): called when user clicks a vendor row
 */
export default function VendorQueueView({ items, onSelectVendor }) {
  const partIds = useMemo(() => [...new Set(items.map(i => i.part_id).filter(Boolean))], [items]);

  // Load all PartVendorSource records for these parts
  const { data: vendorSources = [] } = useQuery({
    queryKey: ['partVendorSources', 'vendorQueue', partIds.join(',')],
    queryFn: async () => {
      if (partIds.length === 0) return [];
      return base44.entities.PartVendorSource.filter({ part_id: { $in: partIds }, is_active: true });
    },
    enabled: partIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Load vendor records for source vendor IDs
  const allVendorIdsFromSources = useMemo(() => {
    const ids = new Set(vendorSources.map(s => s.vendor_id).filter(Boolean));
    items.forEach(i => { const vid = i.vendor?.id || i.vendor_id; if (vid) ids.add(vid); });
    return [...ids];
  }, [vendorSources, items]);

  const { data: vendorRecords = [] } = useQuery({
    queryKey: ['vendors', 'vendorQueueSources', allVendorIdsFromSources.join(',')],
    queryFn: async () => {
      if (allVendorIdsFromSources.length === 0) return [];
      return base44.entities.Vendor.filter({ id: { $in: allVendorIdsFromSources } });
    },
    enabled: allVendorIdsFromSources.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const vendorMap = useMemo(() => new Map(vendorRecords.map(v => [v.id, v])), [vendorRecords]);

  // Build source map: part_id -> sources[]
  const sourcesByPart = useMemo(() => {
    const map = new Map();
    for (const s of vendorSources) {
      if (!map.has(s.part_id)) map.set(s.part_id, []);
      map.get(s.part_id).push(s);
    }
    return map;
  }, [vendorSources]);

  // Build vendor queue with source intelligence
  const vendorQueue = useMemo(() => {
    const allVendorIds = new Set();
    for (const item of items) {
      const vid = item.vendor?.id || item.vendor_id;
      if (vid) allVendorIds.add(vid);
    }
    for (const s of vendorSources) {
      allVendorIds.add(s.vendor_id);
    }

    const results = [];

    for (const vendorId of allVendorIds) {
      const vendor = vendorMap.get(vendorId);

      // Find items this vendor can supply (default assignment OR has a PartVendorSource)
      const matchedItems = items.filter(item => {
        const defaultVid = item.vendor?.id || item.vendor_id;
        if (defaultVid === vendorId) return true;
        const sources = sourcesByPart.get(item.part_id) || [];
        return sources.some(s => s.vendor_id === vendorId);
      });

      const orderableItems = matchedItems.filter(i => (i.to_order ?? 0) > 0);
      if (orderableItems.length === 0) continue;

      const parts = new Set();
      let totalValue = 0;
      let urgentCount = 0;
      let savingsVsDefault = 0;
      let bestPriceCount = 0;
      let totalExposure = 0;
      let totalToOrderQty = 0;

      for (const item of orderableItems) {
        parts.add(item.part_id);
        const toOrder = item.to_order ?? 0;
        totalToOrderQty += toOrder;
        totalExposure += item.exposure_gap ?? 0;

        // Find this vendor's cost for this part
        const sources = sourcesByPart.get(item.part_id) || [];
        const thisVendorSource = sources.find(s => s.vendor_id === vendorId);
        const vendorCost = thisVendorSource?.unit_cost ?? item.unit_cost ?? 0;

        // Find cheapest source across all vendors for comparison
        const allCosts = sources.filter(s => (s.unit_cost ?? 0) > 0).map(s => s.unit_cost);
        const defaultCost = item.unit_cost ?? 0;
        if (defaultCost > 0 && !allCosts.includes(defaultCost)) allCosts.push(defaultCost);
        const cheapest = allCosts.length > 0 ? Math.min(...allCosts) : 0;

        totalValue += toOrder * vendorCost;

        if (vendorCost > 0 && cheapest > 0 && vendorCost <= cheapest) {
          bestPriceCount++;
        }

        if (vendorCost > 0 && defaultCost > 0 && vendorCost < defaultCost) {
          savingsVsDefault += (defaultCost - vendorCost) * toOrder;
        }

        const coveredFromPO = item.covered_from_po ?? 0;
        const reserved = item.reserved_from_stock ?? 0;
        if (coveredFromPO === 0 && reserved === 0) urgentCount++;
      }

      const defaultName = items.find(i => (i.vendor?.id || i.vendor_id) === vendorId);

      results.push({
        vendor_id: vendorId,
        vendor_name: vendor?.vendor_name || defaultName?.vendor_name || defaultName?.vendor?.vendor_name || "Unknown",
        color: vendor?.color || defaultName?.vendor?.color || "#3B82F6",
        parts_count: parts.size,
        item_count: orderableItems.length,
        total_value: Math.round(totalValue * 100) / 100,
        total_to_order_qty: totalToOrderQty,
        exposure_gap: Math.round(totalExposure * 100) / 100,
        urgent_count: urgentCount,
        best_price_count: bestPriceCount,
        savings_vs_default: Math.round(savingsVsDefault * 100) / 100,
        // Store matched item IDs for selection callback
        _itemIds: orderableItems.map(i => i.id),
      });
    }

    return results.sort((a, b) => {
      if (b.urgent_count !== a.urgent_count) return b.urgent_count - a.urgent_count;
      if (b.total_value !== a.total_value) return b.total_value - a.total_value;
      return b.parts_count - a.parts_count;
    });
  }, [items, vendorSources, vendorMap, sourcesByPart]);

  if (vendorQueue.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400" />
        <p>No vendors need ordering</p>
        <p className="text-xs text-gray-500 mt-1">All commitments are covered or filters exclude results</p>
      </div>
    );
  }

  const globalTotal = vendorQueue.reduce((s, v) => s + v.total_value, 0);
  const globalUrgent = vendorQueue.reduce((s, v) => s + v.urgent_count, 0);

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="flex items-center gap-4 text-xs text-gray-400 px-1 flex-wrap">
        <span>{vendorQueue.length} vendor{vendorQueue.length !== 1 ? "s" : ""} with supply capability</span>
        <span className="text-emerald-400 font-mono">{formatCurrencyUSD(globalTotal)} total</span>
        {globalUrgent > 0 && (
          <span className="text-red-400">{globalUrgent} urgent items</span>
        )}
      </div>

      {/* Vendor rows */}
      <div className="border border-gray-800 rounded-lg overflow-hidden bg-black/30">
        {vendorQueue.map((v, idx) => (
          <button
            key={v.vendor_id}
            onClick={() => onSelectVendor(
              { id: v.vendor_id, vendor_name: v.vendor_name, color: v.color },
              v._itemIds,
              Object.fromEntries(sourcesByPart)
            )}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-800/60",
              idx !== vendorQueue.length - 1 && "border-b border-gray-800/60"
            )}
          >
            {/* Color dot */}
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: v.color }} />

            {/* Vendor info */}
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-white truncate block">{v.vendor_name}</span>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {v.best_price_count > 0 && (
                  <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" />
                    Best price on {v.best_price_count} part{v.best_price_count !== 1 ? "s" : ""}
                  </span>
                )}
                {v.savings_vs_default > 0 && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                    <TrendingDown className="w-2.5 h-2.5" />
                    Save {formatCurrencyUSD(v.savings_vs_default)}
                  </span>
                )}
                {v.exposure_gap > 0 && (
                  <span className="text-[10px] text-red-400 flex items-center gap-0.5">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {formatCurrencyUSD(v.exposure_gap)} exposure
                  </span>
                )}
              </div>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-4 shrink-0 text-xs font-mono">
              <span className="text-gray-400 flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                {v.item_count} item{v.item_count !== 1 ? "s" : ""}
                <span className="text-gray-600">({v.total_to_order_qty} qty)</span>
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