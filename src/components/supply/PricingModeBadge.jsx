import React from "react";
import { cn } from "@/lib/utils";

/**
 * PricingModeBadge - Shows cost/retail source labels on commitment rows
 * 
 * COST labels:
 * - COST FROM PO       (green)  — has PO lines, cost > 0, no override
 * - COST PENDING        (gray)  — no cost yet
 * - MANUAL COST OVERRIDE (amber) — cost_override = true
 * - LOCKED AFTER BILLING (red)   — billing invoiced/paid
 * 
 * RETAIL labels:
 * - MATRIX RETAIL        (blue)  — retail from matrix, no override
 * - MANUAL RETAIL         (amber) — retail_override = true
 * - LOCKED AFTER BILLING  (red)   — billing invoiced/paid
 */

const CONFIGS = {
  COST_FROM_PO:        { label: 'COST FROM PO',        border: 'border-l-emerald-600', text: 'text-emerald-500/80' },
  COST_PENDING:        { label: 'COST PENDING',         border: 'border-l-gray-600',    text: 'text-gray-500' },
  MANUAL_COST:         { label: 'MANUAL COST OVERRIDE',  border: 'border-l-amber-500',   text: 'text-amber-400/80' },
  MATRIX_RETAIL:       { label: 'MATRIX RETAIL',         border: 'border-l-blue-600',    text: 'text-blue-400/80' },
  MANUAL_RETAIL:       { label: 'MANUAL RETAIL',         border: 'border-l-amber-500',   text: 'text-amber-400/80' },
  LOCKED:              { label: 'LOCKED AFTER BILLING',  border: 'border-l-red-700',     text: 'text-red-400/70' },
};

export function CostModeBadge({ commitment, className }) {
  if (!commitment) return null;

  const isLocked = ['invoiced', 'paid'].includes(commitment.billing_status);
  if (isLocked) return <ModeBadge config={CONFIGS.LOCKED} className={className} />;

  if (commitment.cost_override) return <ModeBadge config={CONFIGS.MANUAL_COST} className={className} />;

  const hasPO = (commitment.order_line_item_ids || []).length > 0 || (commitment.qty_ordered ?? 0) > 0;
  const cost = commitment.unit_cost_snapshot ?? 0;

  if (hasPO && cost > 0) return <ModeBadge config={CONFIGS.COST_FROM_PO} className={className} />;
  return <ModeBadge config={CONFIGS.COST_PENDING} className={className} />;
}

export function RetailModeBadge({ commitment, className }) {
  if (!commitment) return null;

  const isLocked = ['invoiced', 'paid'].includes(commitment.billing_status);
  if (isLocked) return <ModeBadge config={CONFIGS.LOCKED} className={className} />;

  if (commitment.retail_override) return <ModeBadge config={CONFIGS.MANUAL_RETAIL} className={className} />;
  
  const retail = commitment.unit_retail_snapshot ?? 0;
  if (retail > 0) return <ModeBadge config={CONFIGS.MATRIX_RETAIL} className={className} />;
  return null;
}

function ModeBadge({ config, className }) {
  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
      "bg-gray-900/60 border-l-2",
      config.border, config.text, className
    )}>
      {config.label}
    </span>
  );
}

export default function PricingModeBadge({ commitment, className }) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      <CostModeBadge commitment={commitment} />
      <RetailModeBadge commitment={commitment} />
    </div>
  );
}