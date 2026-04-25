import React from "react";
import { cn } from "@/lib/utils";

/**
 * CostSourceBadge - Shows cost provenance on commitments
 * 
 * COST AUTHORITY LIFECYCLE LABELS:
 * - Cost (Actual)      (green) — PO exists, cost from PO
 * - Cost (Planned)     (gray)  — no PO, using estimate
 * - COST MISSING       (red)   — cost is $0
 * - LOCKED AFTER BILLING (red) — invoiced/paid
 * - MANUAL COST OVERRIDE (amber) — cost_override = true
 * - MANUAL RETAIL       (amber) — retail_override = true
 * - COST LOCKED         (blue)  — cost_locked = true (PO/received/installed/invoiced)
 */

export default function CostSourceBadge({ commitment, className }) {
  if (!commitment) return null;

  // Use canonical cost_source from backend view model
  const costSource = commitment.cost_source;
  const costLocked = commitment.cost_locked;
  const hasPOLines = (commitment.order_line_item_ids || []).length > 0 || costSource === 'po';
  const cost = commitment.resolved_unit_cost ?? commitment.unit_cost_snapshot ?? commitment.unit_cost ?? 0;
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
        LOCKED AFTER BILLING
      </span>
    );
  }

  // Cost override badge
  if (hasCostOverride) {
    return (
      <span
        className={cn(
          "inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
          "bg-amber-900/30 border-l-2 border-l-amber-500 text-amber-400/80",
          className
        )}
      >
        MANUAL COST OVERRIDE
      </span>
    );
  }

  // Retail override (without cost override)
  if (hasRetailOverride) {
    return (
      <span
        className={cn(
          "inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
          "bg-amber-900/30 border-l-2 border-l-amber-500 text-amber-400/80",
          className
        )}
      >
        MANUAL RETAIL
      </span>
    );
  }

  // PHASE 6: Clear labels — "Cost (Actual)" when PO exists, "Cost (Planned)" before ordering
  let config;
  if (costSource === 'po' || hasPOLines) {
    if (cost > 0) {
      config = { label: 'Cost (Actual)', accent: 'border-l-emerald-600', text: 'text-emerald-500/80' };
    } else {
      config = { label: 'COST MISSING', accent: 'border-l-red-600', text: 'text-red-400/80' };
    }
  } else {
    if (cost > 0) {
      config = { label: 'Cost (Planned)', accent: 'border-l-gray-500', text: 'text-gray-500' };
    } else {
      config = { label: 'COST PENDING', accent: 'border-l-gray-600', text: 'text-gray-500' };
    }
  }

  // Retail mode badge
  const retailMode = hasRetailOverride ? 'MANUAL RETAIL' : (commitment.unit_retail_snapshot > 0 ? 'MATRIX RETAIL' : null);
  const retailConfig = hasRetailOverride
    ? { accent: 'border-l-amber-500', text: 'text-amber-400/80' }
    : { accent: 'border-l-blue-600', text: 'text-blue-400/80' };

  return (
    <div className={cn("flex gap-1 flex-wrap", className)}>
      <span
        className={cn(
          "inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
          "bg-gray-900/60 border-l-2",
          config.accent,
          config.text,
        )}
      >
        {config.label}
      </span>
      {costLocked && costSource === 'po' && (
        <span
          className={cn(
            "inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
            "bg-gray-900/60 border-l-2 border-l-blue-600 text-blue-400/80",
          )}
        >
          LOCKED
        </span>
      )}
      {retailMode && (
        <span
          className={cn(
            "inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
            "bg-gray-900/60 border-l-2",
            retailConfig.accent,
            retailConfig.text,
          )}
        >
          {retailMode}
        </span>
      )}
    </div>
  );
}