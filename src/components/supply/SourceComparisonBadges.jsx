import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronDown, TrendingDown, TrendingUp, Star, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * CheapestBadge — Shows if this vendor is the cheapest source
 */
export function CheapestBadge({ isCheapest, isCheapestForVendor, priceDelta, priceDeltaOverall, context = 'global' }) {
  // In vendor PO context, prioritize vendor-specific comparison
  const showOverallBest = isCheapest;
  const showVendorBest = isCheapestForVendor && !isCheapest;
  const effectiveDelta = context === 'vendor' ? (priceDeltaOverall ?? priceDelta ?? 0) : (priceDelta ?? 0);

  if (showOverallBest) {
    return (
      <Badge className="bg-green-900/40 text-green-400 border-green-700 text-[9px] gap-0.5 shrink-0">
        <Check className="w-2.5 h-2.5" />
        BEST
      </Badge>
    );
  }
  if (showVendorBest) {
    return (
      <Badge className="bg-cyan-900/40 text-cyan-400 border-cyan-700 text-[9px] gap-0.5 shrink-0">
        <Check className="w-2.5 h-2.5" />
        BEST (Vendor)
      </Badge>
    );
  }
  if (effectiveDelta > 0) {
    return (
      <Badge className="bg-amber-900/30 text-amber-400 border-amber-700/50 text-[9px] gap-0.5 shrink-0">
        <TrendingUp className="w-2.5 h-2.5" />
        +{formatCurrencyUSD(effectiveDelta)}
      </Badge>
    );
  }
  return null;
}

/**
 * SourceComparisonPopover — Expandable list of all vendor sources for a part.
 * Shows vendor name, cost, and flags (cheapest, preferred, this vendor).
 */
export function SourceComparisonPopover({ allSources, currentVendorId, onSelectSource }) {
  if (!allSources || allSources.length <= 1) return null;

  const cheapestCost = Math.min(...allSources.filter(s => s.unit_cost > 0).map(s => s.unit_cost));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
          {allSources.length} sources
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 bg-gray-900 border-gray-700"
        align="end"
        sideOffset={4}
      >
        <div className="p-2 border-b border-gray-800">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            Vendor Source Comparison
          </p>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {allSources.map((s, idx) => {
            const isCheapest = s.unit_cost > 0 && s.unit_cost <= cheapestCost;
            return (
              <button
                key={s.source_id || `fallback-${s.vendor_id}-${idx}`}
                onClick={() => onSelectSource?.(s)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
                  s.is_this_vendor
                    ? "bg-blue-900/20 border-l-2 border-blue-500"
                    : "hover:bg-gray-800/50 border-l-2 border-transparent"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-white font-medium truncate">
                      {s.vendor_name}
                    </span>
                    {s.is_preferred && (
                      <Star className="w-3 h-3 text-yellow-400 shrink-0" fill="currentColor" />
                    )}
                    {s.is_this_vendor && (
                      <span className="text-[9px] text-blue-400 font-medium">(selected)</span>
                    )}
                  </div>
                  {s.vendor_part_number && (
                    <span className="text-[10px] text-gray-500">SKU: {s.vendor_part_number}</span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={cn(
                    "text-xs font-mono font-medium",
                    isCheapest ? "text-green-400" : "text-gray-300"
                  )}>
                    {s.unit_cost > 0 ? formatCurrencyUSD(s.unit_cost) : '$0'}
                  </span>
                  {isCheapest && (
                    <div className="flex items-center justify-end gap-0.5">
                      <TrendingDown className="w-2.5 h-2.5 text-green-500" />
                      <span className="text-[9px] text-green-500">cheapest</span>
                    </div>
                  )}
                  {!isCheapest && s.unit_cost > 0 && cheapestCost > 0 && (
                    <span className="text-[9px] text-amber-400/70">
                      +{formatCurrencyUSD(s.unit_cost - cheapestCost)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}