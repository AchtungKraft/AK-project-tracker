import React from "react";
import { MapPin, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig, buildLocationPath } from "./locationTypeConfig";

/**
 * Persistent workspace header spanning center + inspector.
 * Shows the current location anchor so the user always knows "Where am I?"
 */
export default function StorageWorkspaceHeader({ locationId, locations, selectedObjectLabel }) {
  if (!locationId || locationId === 'unassigned') {
    if (locationId === 'unassigned') {
      return (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-yellow-950/15 border-b border-yellow-900/20 shrink-0 min-h-[32px]">
          <MapPin className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          <span className="text-xs font-semibold text-yellow-400">Unassigned Parts</span>
        </div>
      );
    }
    return null;
  }

  const path = buildLocationPath(locationId, locations);
  if (path.length === 0) return null;

  const current = path[path.length - 1];
  const tc = getLocationTypeConfig(current.type);
  const TypeIcon = tc.icon;

  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-900/40 border-b border-gray-800/60 shrink-0 min-h-[32px] overflow-hidden">
      {/* Breadcrumb trail */}
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
        {path.map((node, idx) => {
          const isLast = idx === path.length - 1;
          const ntc = getLocationTypeConfig(node.type);
          const NIcon = ntc.icon;
          return (
            <React.Fragment key={node.id}>
              {idx > 0 && <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />}
              <div className={cn(
                "flex items-center gap-1 shrink-0",
                isLast ? "text-white" : "text-gray-500"
              )}>
                <NIcon className="w-3 h-3 shrink-0" style={{ color: isLast ? (node.color || ntc.color) : undefined }} />
                <span className={cn(
                  "text-xs truncate max-w-[140px]",
                  isLast ? "font-semibold" : "font-normal"
                )}>
                  {node.shortCode || node.name}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Selected object indicator */}
      {selectedObjectLabel && (
        <div className="flex items-center gap-1 shrink-0 ml-2 pl-2 border-l border-gray-700/50">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{selectedObjectLabel}</span>
        </div>
      )}
    </div>
  );
}