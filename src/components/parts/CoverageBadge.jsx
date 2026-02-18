import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, AlertCircle, TrendingUp, TrendingDown, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phase 9.7d — CoverageBadge Component
 * 
 * Renders commitment coverage status from precomputed backend values.
 * GOVERNANCE: No local coverage computation allowed. All values from validator/resolver.
 * 
 * Props:
 * - coverage_status: 'FULL' | 'PARTIAL' | 'NONE' | 'OVER'
 * - gap_qty: number (uncovered qty)
 * - overage_qty: number (over-covered qty)
 * - breakdown: { qty_needed, qty_reserved, qty_ordered, qty_received, qty_installed, qty_to_order }
 * - poAdjustmentRequired: boolean
 * - undoAvailable: boolean (shows undo indicator)
 * - onClick: () => void
 * - compact: boolean
 */

const STATUS_CONFIG = {
  FULL: {
    label: "Covered",
    shortLabel: "✓",
    color: "bg-green-600 text-white border-green-500",
    hoverColor: "hover:bg-green-500",
    Icon: CheckCircle2,
    iconColor: "text-green-100"
  },
  PARTIAL: {
    label: "Partial",
    shortLabel: "~",
    color: "bg-amber-600 text-white border-amber-500",
    hoverColor: "hover:bg-amber-500",
    Icon: TrendingDown,
    iconColor: "text-amber-100"
  },
  NONE: {
    label: "Uncovered",
    shortLabel: "!",
    color: "bg-red-600 text-white border-red-500",
    hoverColor: "hover:bg-red-500",
    Icon: AlertCircle,
    iconColor: "text-red-100"
  },
  OVER: {
    label: "Over",
    shortLabel: "+",
    color: "bg-purple-600 text-white border-purple-500",
    hoverColor: "hover:bg-purple-500",
    Icon: TrendingUp,
    iconColor: "text-purple-100"
  }
};

// Legacy status mapping for backward compatibility
const LEGACY_STATUS_MAP = {
  'FULLY_COVERED': 'FULL',
  'PARTIALLY_COVERED': 'PARTIAL',
  'NOT_COVERED': 'NONE',
  'OVERCOVERED': 'OVER'
};

export function CoverageBadge({
  coverage_status,
  gap_qty = 0,
  overage_qty = 0,
  breakdown,
  poAdjustmentRequired = false,
  onClick,
  compact = false,
  className
}) {
  // Normalize status (handle legacy values)
  const normalizedStatus = LEGACY_STATUS_MAP[coverage_status] || coverage_status || 'NONE';
  const config = STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.NONE;
  const Icon = config.Icon;

  // Build label
  let displayLabel = config.label;
  if (normalizedStatus === 'PARTIAL' && gap_qty > 0) {
    displayLabel = compact ? `${gap_qty}` : `Partial (${gap_qty})`;
  } else if (normalizedStatus === 'NONE' && (breakdown?.qty_needed || gap_qty) > 0) {
    const needed = breakdown?.qty_needed ?? gap_qty;
    displayLabel = compact ? `${needed}` : `Uncovered (${needed})`;
  } else if (normalizedStatus === 'OVER' && overage_qty > 0) {
    displayLabel = compact ? `+${overage_qty}` : `Over (+${overage_qty})`;
  }

  const badge = (
    <Badge
      className={cn(
        config.color,
        onClick && `${config.hoverColor} cursor-pointer`,
        "gap-1 font-medium transition-colors",
        className
      )}
      onClick={onClick}
    >
      <Icon className={cn("w-3 h-3", config.iconColor)} />
      {displayLabel}
    </Badge>
  );

  // If no breakdown provided, return simple badge
  if (!breakdown && !poAdjustmentRequired) {
    return badge;
  }

  // Build tooltip content
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent 
          className="bg-gray-900 border-gray-700 p-3 max-w-xs"
          side="top"
        >
          <div className="space-y-2 text-sm">
            <div className="font-semibold text-white border-b border-gray-700 pb-1">
              Quantity Breakdown
            </div>
            
            {breakdown && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-gray-400">Needed:</span>
                <span className="text-white font-medium">{breakdown.qty_needed ?? '-'}</span>
                
                <span className="text-gray-400">Reserved:</span>
                <span className="text-cyan-400">{breakdown.qty_reserved ?? 0}</span>
                
                {(breakdown.qty_to_order ?? 0) > 0 && (
                  <>
                    <span className="text-gray-400">To Order:</span>
                    <span className="text-purple-400">{breakdown.qty_to_order}</span>
                  </>
                )}
                
                <span className="text-gray-400">Ordered:</span>
                <span className="text-purple-400">{breakdown.qty_ordered ?? 0}</span>
                
                <span className="text-gray-400">Received:</span>
                <span className="text-blue-400">{breakdown.qty_received ?? 0}</span>
                
                <span className="text-gray-400">Installed:</span>
                <span className="text-green-400">{breakdown.qty_installed ?? 0}</span>
              </div>
            )}

            {gap_qty > 0 && (
              <div className="pt-1 border-t border-gray-700">
                <span className="text-red-400">
                  Gap: {gap_qty} unit{gap_qty !== 1 ? 's' : ''} uncovered
                </span>
              </div>
            )}

            {overage_qty > 0 && (
              <div className="pt-1 border-t border-gray-700">
                <span className="text-purple-400">
                  Overage: +{overage_qty} unit{overage_qty !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {poAdjustmentRequired && (
              <div className="pt-1 border-t border-gray-700">
                <span className="text-amber-400 text-xs flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  PO adjustment may be required
                </span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Inline variant for table rows - more compact
 */
export function CoverageBadgeInline({ coverage, onClick }) {
  if (!coverage) {
    return <span className="text-gray-500 text-xs">-</span>;
  }

  return (
    <CoverageBadge
      coverage_status={coverage.coverage_status}
      gap_qty={coverage.gap_qty}
      overage_qty={coverage.overage_qty}
      breakdown={coverage}
      poAdjustmentRequired={coverage.poAdjustmentRequired}
      onClick={onClick}
      compact
    />
  );
}

export default CoverageBadge;