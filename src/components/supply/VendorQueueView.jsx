import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Building2, Package, DollarSign, ShoppingCart, CheckCircle2,
  TrendingDown, TrendingUp, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * VendorQueueView — Vendor-grouped summary with multi-source intelligence.
 * Loads all PartVendorSource records for items, shows pricing comparison per vendor.
 *
 * Props:
 *  - items: filteredItems from GlobalNeedToOrder (to_order > 0, canonical)
 *  - onSelectVendor(vendorSummary): called when user clicks a vendor row
 */
export default function VendorQueueView({ items, onSelectVendor }) {
  // Collect all unique part_ids from items
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

  // Load vendor names for sources
  const sourceVendorIds = useMemo(() => [...new Set(vendorSources.map(s => s.vendor_id).filter(Boolean))], [vendorSources]);
  const { data: sourceVendors = [] } = useQuery({
    queryKey: ['vendors', 'vendorQueueSources', sourceVendorIds.join(',')],
    queryFn: async () => {
      if (sourceVendorIds.length === 0) return [];
      return base44.entities.Vendor.filter({ id: { $in: sourceVendorIds } });
    },
    enabled: sourceVendorIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const vendorMap = useMemo(() => new Map(sourceVendors.map(v => [v.id, v])), [sourceVendors]);

  // Build source map: part_id -> sources[]
  const sourcesByPart = useMemo(() => {
    const map = new Map();
    for (const s of vendorSources) {
      if (!map.has(s.part_id)) map.set(s.part_id, []);
      map.get(s.part_id).push({
        ...s,
        vendor_name: vendorMap.get(s.vendor_id)?.vendor_name || 'Unknown',
        vendor_color: vendorMap.get(s.vendor_id)?.color || '#3B82F6',
      });
    }
    return map;
  }, [vendorSources, vendorMap]);

  // Build vendor queue with source intelligence
  const vendorQueue = useMemo(() => {
    // First, collect ALL vendor_ids that can supply these parts (from sources + item defaults)
    const allVendorIds = new Set();
    
    // From item default vendors
    for (const item of items) {
      const vid = item.vendor?.id || item.vendor_id;
      if (vid) allVendorIds.add(vid);
    }
    
    // From PartVendorSource records
    for (const s of vendorSources) {
      allVendorIds.add(s.vendor_id);
    }

    const agg = {};

    for (const vendorId of allVendorIds) {
      const vendor = vendorMap.get(vendorId);
      
      // Find items this vendor can supply (via sources or default assignment)
      const suppliedItems = items.filter(item => {
        const defaultVid = item.vendor?.id || item.vendor_id;
        if (defaultVid === vendorId) return true;
        const sources = sourcesByPart.get(item.part_id) || [];
        return sources.some(s => s.vendor_id === vendorId);
      });

      if (suppliedItems.length === 0) continue;

      const parts = new Set();
      let totalValue = 0;
      let urgentCount = 0;
      let savingsVsDefault = 0;
      let bestPriceCount = 0;

      for (const item of suppliedItems) {
        parts.add(item.part_id);
        const toOrder = item.to_order ?? 0;
        if (toOrder <= 0) continue;

        // Find this vendor's cost for this part
        const sources = sourcesByPart.get(item.part_id) || [];
        const thisVendorSource = sources.find(s => s.vendor_id === vendorId);
        const vendorCost = thisVendorSource?.unit_cost ?? item.unit_cost ?? 0;

        // Find cheapest source across all vendors
        const allCosts = sources.filter(s => (s.unit_cost ?? 0) > 0).map(s => s.unit_cost);
        const defaultCost = item.unit_cost ?? 0;
        if (defaultCost > 0) allCosts.push(defaultCost);
        const cheapest = allCosts.length > 0 ? Math.min(...allCosts) : 0;

        totalValue += toOrder * vendorCost;

        if (vendorCost > 0 && vendorCost <= cheapest) {
          bestPriceCount++;
        }

        // Calculate savings vs item's default vendor cost
        if (vendorCost > 0 && defaultCost > 0 && vendorCost < defaultCost) {
          savingsVsDefault += (defaultCost - vendorCost) * toOrder;
        }

        // Urgent = zero coverage
        const coveredFromPO = item.covered_from_po ?? 0;
        const reserved = item.reserved_from_stock ?? 0;
        if (coveredFromPO === 0 && reserved === 0) {
          urgentCount++;
        }
      }

      agg[vendorId] = {
        vendor_id: vendorId,
        vendor_name: vendor?.vendor_name || items.find(i => (i.vendor?.id || i.vendor_id) === vendorId)?.vendor_name || "Unknown",
        color: vendor?.color || items.find(i => (i.vendor?.id || i.vendor_id) === vendorId)?.vendor?.color || "#3B82F6",
        group_name: vendor?.vendor_group_id || "",
        parts_count: parts.size,
        total_value: Math.round(totalValue * 100) / 100,
        urgent_count: urgentCount,
        best_price_count: bestPriceCount,
        savings_vs_default: Math.round(savingsVsDefault * 100) / 100,
        item_count: suppliedItems.filter(i => (i.to_order ?? 0) > 0).length,
        items: suppliedItems,
      };
    }

    return Object.values(agg)
      .sort((a, b) => {
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

  const globalTotalValue = vendorQueue.reduce((s, v) => s + v.total_value, 0);
  const globalUrgent = vendorQueue.reduce((s, v) => s + v.urgent_count, 0);

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="flex items-center gap-4 text-xs text-gray-400 px-1">
        <span>{vendorQueue.length} vendor{vendorQueue.length !== 1 ? "s" : ""} with supply capability</span>
        <span className="text-emerald-400 font-mono">
          {formatCurrencyUSD(globalTotalValue)} total
        </span>
        {globalUrgent > 0 && (
          <span className="text-red-400">
            {globalUrgent} urgent items
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
              <div className="flex items-center gap-2 mt-0.5">
                {v.best_price_count > 0 && (
                  <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" />
                    Best price on {v.best_price_count} part{v.best_price_count !== 1 ? 's' : ''}
                  </span>
                )}
                {v.savings_vs_default > 0 && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                    <TrendingDown className="w-2.5 h-2.5" />
                    Save {formatCurrencyUSD(v.savings_vs_default)}
                  </span>
                )}
              </div>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-4 shrink-0 text-xs font-mono">
              <span className="text-gray-400 flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                {v.item_count} item{v.item_count !== 1 ? "s" : ""}
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