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
 * Priority: sources matching vendor → any item.order_url fallback
 */
export function resolvePrimaryURL(partEntries, groupVendorId) {
  const vendorId = groupVendorId;

  // 1. Scan all entries for a source matching this vendor
  if (vendorId && vendorId !== 'unassigned') {
    for (const entry of partEntries) {
      const item = entry.item || entry;
      const sources = item.sources || item.vendor_sources || [];
      const match = sources.find(s => s.vendor_id === vendorId);
      if (match?.order_url) return match.order_url;
    }
  }

  // 2. Fallback: any entry's order_url
  for (const entry of partEntries) {
    const item = entry.item || entry;
    if (item.order_url && typeof item.order_url === 'string' && item.order_url.startsWith('http')) {
      return item.order_url;
    }
  }

  // 3. Fallback: first source with any order_url
  for (const entry of partEntries) {
    const item = entry.item || entry;
    const sources = item.sources || item.vendor_sources || [];
    for (const s of sources) {
      if (s.order_url) return s.order_url;
    }
  }

  return null;
}

/**
 * Collect all unique vendor sources across all commitments for a part.
 * Returns array of { vendor_id, vendor_name, order_url, unit_cost }
 * Includes sources even if they lack order_url (for display purposes).
 */
export function getAllSources(partEntries) {
  const map = new Map();

  for (const entry of partEntries) {
    const item = entry.item || entry;
    const sources = item.sources || item.vendor_sources || [];
    for (const s of sources) {
      if (s.vendor_id && !map.has(s.vendor_id)) {
        map.set(s.vendor_id, {
          vendor_id: s.vendor_id,
          vendor_name: s.vendor_name || s.vendor_id,
          order_url: s.order_url || null,
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
  // Filter sources that have URLs for the popover
  const sourcesWithUrls = allSources.filter(s => s.order_url);
  const hasMultiple = sourcesWithUrls.length > 1;
  const hasAny = primaryUrl || sourcesWithUrls.length > 0;

  if (!hasAny) {
    return <span className="text-gray-600 text-[10px] italic">no link</span>;
  }

  // Single source or no popover needed — just a labeled link
  if (!hasMultiple) {
    const url = primaryUrl || sourcesWithUrls[0]?.order_url;
    if (!url) return null;
    return (
      <a
        href={url}
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
        {sourcesWithUrls.map(source => {
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