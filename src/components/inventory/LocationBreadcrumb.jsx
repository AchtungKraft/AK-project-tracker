import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildLocationPath, getLocationTypeConfig } from "./locationTypeConfig";

/**
 * Reusable location breadcrumb component.
 * Props:
 *   locationId - ID of the leaf location
 *   locations  - full locations array (from query cache)
 *   onNavigate - (locationId) => void — click handler for breadcrumb segments
 *   compact    - smaller text for tables/mobile
 *   plainText  - render as plain string instead of interactive breadcrumb
 */
export default function LocationBreadcrumb({ locationId, locations, onNavigate, compact = false, plainText = false }) {
  if (!locationId || !locations?.length) return null;

  const path = buildLocationPath(locationId, locations);
  if (path.length === 0) return null;

  if (plainText) {
    return <span className="text-gray-400 text-xs">{path.map(p => p.name).join(' > ')}</span>;
  }

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", compact ? "text-xs" : "text-sm")}>
      {path.map((segment, idx) => {
        const tc = getLocationTypeConfig(segment.type);
        const Icon = tc.icon;
        const isLast = idx === path.length - 1;

        return (
          <React.Fragment key={segment.id}>
            {idx > 0 && <ChevronRight className={cn("text-gray-600 shrink-0", compact ? "w-3 h-3" : "w-3.5 h-3.5")} />}
            <button
              onClick={() => onNavigate?.(segment.id)}
              className={cn(
                "flex items-center gap-1 transition-colors rounded px-1",
                isLast ? "text-white font-medium" : "text-gray-400 hover:text-white",
                onNavigate && "hover:bg-gray-800/50 cursor-pointer"
              )}
              disabled={!onNavigate}
            >
              <Icon className={cn("shrink-0", compact ? "w-3 h-3" : "w-3.5 h-3.5")} style={{ color: segment.color }} />
              <span className="truncate max-w-[120px]">{segment.shortCode || segment.name}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}