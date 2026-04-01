import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * POLineCostWarning - Shows warning badge on PO lines with zero cost
 * Also shows sync status indicator on PO lines
 */

export function POLineCostBadge({ lineItem, className }) {
  if (!lineItem) return null;

  const cost = lineItem.unit_cost ?? 0;
  const hasCostReview = lineItem.cost_requires_review === true;

  if (cost <= 0) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
        "bg-red-900/40 border-l-2 border-l-red-500 text-red-400",
        className
      )}>
        <AlertTriangle className="w-3 h-3" />
        COST MISSING
      </span>
    );
  }

  if (hasCostReview) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
        "bg-amber-900/30 border-l-2 border-l-amber-500 text-amber-400/80",
        className
      )}>
        <AlertTriangle className="w-3 h-3" />
        COST NEEDS REVIEW
      </span>
    );
  }

  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
      "bg-gray-900/60 border-l-2 border-l-emerald-600 text-emerald-500/80",
      className
    )}>
      COST FROM PO
    </span>
  );
}

/**
 * Zero-cost PO creation warning banner
 */
export function ZeroCostWarningBanner({ commitments = [], parts = [] }) {
  const partMap = new Map(parts.map(p => [p.id, p]));
  
  const zeroCostItems = commitments.filter(c => {
    const part = partMap.get(c.part_id);
    const cost = (c.unit_cost_snapshot > 0) ? c.unit_cost_snapshot : (part?.cost > 0) ? part.cost : 0;
    return cost <= 0;
  });

  if (zeroCostItems.length === 0) return null;

  return (
    <div className="p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-300">
            {zeroCostItems.length} item(s) have no cost
          </p>
          <p className="text-xs text-amber-400/70 mt-1">
            PO lines with $0 cost will not update project pricing. Review part costs before creating the PO, or edit PO line costs after creation.
          </p>
        </div>
      </div>
    </div>
  );
}

export default POLineCostBadge;