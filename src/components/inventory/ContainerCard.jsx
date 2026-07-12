import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, Printer, ChevronRight, Home, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContainerTypeConfig } from "./containerTypeConfig";
import { printContainerQRLabel } from "./containerQRLabel";

export default function ContainerCard({
  container, itemCount, location, homeLocation, project, locations = [],
  onMove, onSelect, onReturnHome, compact = false,
}) {
  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;
  const displayColor = container.color || tc.color;
  const isAwayFromHome = homeLocation && container.location_id !== container.home_location_id;
  const isEmpty = itemCount === 0;

  const handlePrintQR = (e) => {
    e.stopPropagation();
    printContainerQRLabel(container, { locations });
  };

  return (
    <div
      onClick={() => onSelect?.(container)}
      className={cn(
        "flex items-center gap-3 rounded-lg border transition-all cursor-pointer group",
        compact
          ? "p-2 bg-gray-800/30 border-gray-800 hover:border-indigo-800/50"
          : "p-3 bg-gray-900/40 border-gray-800 hover:border-indigo-700/50"
      )}
    >
      {/* Photo or Icon */}
      {container.photo ? (
        <img
          src={container.photo}
          alt={container.name}
          className={cn("rounded-lg object-cover border border-gray-700 shrink-0", compact ? "w-8 h-8" : "w-12 h-12")}
          loading="lazy"
        />
      ) : (
        <div
          className={cn("rounded-lg flex items-center justify-center shrink-0", compact ? "w-8 h-8" : "w-12 h-12")}
          style={{ backgroundColor: displayColor + '15' }}
        >
          <TypeIcon className={cn(compact ? "w-4 h-4" : "w-6 h-6")} style={{ color: displayColor }} />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-semibold text-white truncate group-hover:text-indigo-300 transition-colors",
            compact ? "text-xs" : "text-sm"
          )}>
            {container.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {container.short_code && (
            <span className={cn("font-mono font-bold", compact ? "text-[10px] text-gray-400" : "text-xs text-gray-300")}>
              {container.short_code}
            </span>
          )}
          <span className={cn("text-gray-500", compact ? "text-[10px]" : "text-xs")}>
            · {tc.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5 flex-wrap">
          {isEmpty ? (
            <span className="text-gray-600">0 parts · Ready for use</span>
          ) : (
            <span>{itemCount} part{itemCount !== 1 ? 's' : ''}</span>
          )}
          {project && <span className="text-blue-400">· {project.name}</span>}
          {isAwayFromHome && (
            <span className="text-amber-400 flex items-center gap-0.5">
              · <Home className="w-2.5 h-2.5" /> away
            </span>
          )}
        </div>
      </div>

      {/* Actions — always visible on mobile, hover on desktop */}
      <div className="flex items-center gap-1 shrink-0">
        {isAwayFromHome && onReturnHome && (
          <Button
            size="icon" variant="ghost"
            onClick={(e) => { e.stopPropagation(); onReturnHome(container); }}
            className="h-8 w-8 text-amber-500 hover:text-amber-300 hover:bg-amber-950/30"
            title="Return Home"
          >
            <Home className="w-4 h-4" />
          </Button>
        )}
        {onMove && (
          <Button
            size="icon" variant="ghost"
            onClick={(e) => { e.stopPropagation(); onMove(container); }}
            className="h-8 w-8 text-gray-500 hover:text-white md:opacity-0 md:group-hover:opacity-100"
            title="Move"
          >
            <ArrowRightLeft className="w-4 h-4" />
          </Button>
        )}
        <Button
          size="icon" variant="ghost"
          onClick={handlePrintQR}
          className="h-8 w-8 text-gray-500 hover:text-white md:opacity-0 md:group-hover:opacity-100"
          title="Print QR"
        >
          <Printer className="w-4 h-4" />
        </Button>
        <ChevronRight className="w-4 h-4 text-gray-600" />
      </div>
    </div>
  );
}