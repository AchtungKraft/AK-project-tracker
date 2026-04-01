import React from "react";
import { cn } from "@/lib/utils";

/**
 * CostSourceBadge - Shows cost provenance on commitments
 * 
 * Rules:
 * - Has PO lines + cost > 0 → "COST FROM PO" (green accent)
 * - Has PO lines + cost = 0 → "PO COST $0" (amber accent) 
 * - No PO lines → "COST PENDING" (gray accent)
 * - Billing locked → show nothing extra
 */

export default function CostSourceBadge({ commitment, className }) {
  if (!commitment) return null;

  const hasPOLines = (commitment.order_line_item_ids || []).length > 0;
  const cost = commitment.unit_cost_snapshot ?? 0;
  const hasOrders = (commitment.qty_ordered || 0) > 0;

  // If billed/invoiced, cost is locked - no badge needed
  if (['invoiced', 'paid'].includes(commitment.billing_status)) return null;

  let config;
  if (hasPOLines || hasOrders) {
    if (cost > 0) {
      config = { label: 'COST FROM PO', accent: 'border-l-emerald-600', text: 'text-emerald-500/80' };
    } else {
      config = { label: 'PO COST $0', accent: 'border-l-amber-600', text: 'text-amber-500/80' };
    }
  } else {
    if (cost > 0) {
      // Has cost but from estimate/part, not PO
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