import React from "react";
import { ExternalLink, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Resolve the primary URL for a part based on the PO vendor.
 * Priority: override sources → commitment sources → item fallback
 */
export function resolvePrimaryURL(partEntries, groupVendorId) {
  const vendorId = groupVendorId;
  if (!vendorId || vendorId === 'unassigned') return null;

  // Scan all entries for a source matching this vendor
  for (const entry of partEntries) {
    const item = entry.item || entry;
    const sources = item.sources || item.vendor_sources || [];
    const match = sources.find(s => s.vendor_id === vendorId);
    if (match?.order_url) return match.order_url;
  }

  // Fallback: first entry's order_url if it belongs to this vendor
  const first = partEntries[0]?.item || partEntries[0];
  if (first?.order_url && first.order_url.startsWith('http')) {
    return first.order_url;
  }

  return null;
}

/**
 * Collect all unique vendor sources across all commitments for a part.
 * Returns array of { vendor_id, vendor_name, order_url, unit_cost }
 */
export function getAllSources(partEntries) {
  const map = new Map();

  for (const entry of partEntries) {
    const item = entry.item || entry;
    const sources = item.sources || item.vendor_sources || [];
    for (const s of sources) {
      if (s.vendor_id && s.order_url && !map.has(s.vendor_id)) {
        map.set(s.vendor_id, {
          vendor_id: s.vendor_id,
          vendor_name: s.vendor_name || s.vendor_id,
          order_url: s.order_url,
          unit_cost: s.unit_cost,
        });
      }
    }
  }

  return Array.from(map.values());
}

/**
 * VendorSourceLink — Click opens primary URL, hover/click shows all available sources.
 *
 * Props:
 *  - primaryUrl: resolved URL for the PO vendor
 *  - primaryVendorName: name of the PO vendor (shown as label)
 *  - allSources: array from getAllSources()
 */
export default function VendorSourceLink({ primaryUrl, primaryVendorName, allSources = [] }) {
  const hasMultiple = allSources.length > 1;
  const hasAny = primaryUrl || allSources.length > 0;

  if (!hasAny) return null;

  // Single source — just a labeled link
  if (!hasMultiple) {
    if (!primaryUrl) return null;
    return (
      <a
        href={primaryUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-[10px] flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
        title={`Open ${primaryVendorName || 'vendor page'}`}
      >
        <ExternalLink className="w-3 h-3" />
        <span className="hidden sm:inline max-w-[100px] truncate">{primaryVendorName || 'Order'}</span>
      </a>
    );
  }

  // Multiple sources — popover with list
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-[10px] flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
          title="View all vendor sources"
        >
          <ExternalLink className="w-3 h-3" />
          <span className="hidden sm:inline max-w-[100px] truncate">{primaryVendorName || 'Order'}</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-1 bg-gray-900 border-gray-700"
        align="start"
        side="bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] text-gray-500 px-2 py-1 uppercase tracking-wider">
          Available Sources
        </div>
        {allSources.map(source => {
          const isPrimary = source.order_url === primaryUrl;
          return (
            <a
              key={source.vendor_id}
              href={source.order_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs transition-colors",
                "hover:bg-gray-800",
                isPrimary ? "text-blue-400 font-medium" : "text-gray-300"
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{source.vendor_name}</span>
                {isPrimary && (
                  <span className="text-[8px] bg-blue-900/50 text-blue-400 px-1 rounded flex-shrink-0">PO</span>
                )}
              </div>
              {source.unit_cost > 0 && (
                <span className="text-gray-500 font-mono flex-shrink-0">${source.unit_cost.toFixed(2)}</span>
              )}
            </a>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}