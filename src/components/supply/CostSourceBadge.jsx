import React from "react";
import { cn } from "@/lib/utils";

/**
 * CostSourceBadge - Shows cost provenance on commitments
 * 
 * Rules:
 * - Manual cost/retail override → "MANUAL OVERRIDE" (amber accent)
 * - Has PO lines + cost > 0 → "COST FROM PO" (green accent)
 * - Has PO lines + cost = 0 → "PO COST $0" (amber accent) 
 * - No PO lines + cost > 0 → "EST. COST" (gray accent)
 * - No PO lines + cost = 0 → "COST PENDING" (gray accent)
 * - Billing locked → "LOCKED" badge
 */

export default function CostSourceBadge({ commitment, className }) {
  if (!commitment) return null;

  const hasPOLines = (commitment.order_line_item_ids || []).length > 0;
  const cost = commitment.unit_cost_snapshot ?? commitment.unit_cost ?? 0;
  const hasOrders = (commitment.qty_ordered || 0) > 0;
  const hasCostOverride = commitment.cost_override === true;
  const hasRetailOverride = commitment.retail_override === true;

  // Billing locked state
  if (['invoiced', 'paid'].includes(commitment.billing_status)) {
    return (
      <span
        className={cn(
          "inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
          "bg-gray-900/60 border-l-2 border-l-red-700 text-red-400/70",
          className
        )}
      >
        LOCKED
      </span>
    );
  }

  // Manual override has highest priority
  if (hasCostOverride || hasRetailOverride) {
    return (
      <span
        className={cn(
          "inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
          "bg-amber-900/30 border-l-2 border-l-amber-500 text-amber-400/80",
          className
        )}
      >
        MANUAL OVERRIDE
      </span>
    );
  }

  let config;
  if (hasPOLines || hasOrders) {
    if (cost > 0) {
      config = { label: 'COST FROM PO', accent: 'border-l-emerald-600', text: 'text-emerald-500/80' };
    } else {
      config = { label: 'PO COST $0', accent: 'border-l-amber-600', text: 'text-amber-500/80' };
    }
  } else {
    if (cost > 0) {
      config = { label: 'EST. COST', accent: 'border-l-gray-500', text: 'text-gray-500' };
    } else {
      config = { label: 'COST PENDING', accent: 'border-l-gray-600', text: 'text-gray-500' };
    }
  }

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
        "bg-gray-900/60 border-l-2",
        config.accent,
        config.text,
        className
      )}
    >
      {config.label}
    </span>
  );
}