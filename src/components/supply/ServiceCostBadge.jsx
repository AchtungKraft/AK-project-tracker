import React from "react";
import { cn } from "@/lib/utils";

/**
 * ServiceCostBadge - Cost/retail source badges for ServiceCommitments
 * 
 * ALIGNED with parts pricing language:
 * 
 * Cost labels:
 * - COST FROM VENDOR    (green)  — has vendor cost > 0, no override
 * - COST MISSING        (red)    — no cost at all
 * - COST PENDING        (gray)   — planned, no cost yet
 * - MANUAL COST OVERRIDE (amber) — cost_override flag set
 * - LOCKED AFTER BILLING (red)   — billed status
 * 
 * Retail labels:
 * - MANUAL RETAIL        (amber) — retail_override or billing_rate manually set
 */
const CONFIGS = {
  COST_FROM_VENDOR:  { label: 'COST FROM VENDOR',    border: 'border-l-emerald-600', text: 'text-emerald-500/80' },
  COST_MISSING:      { label: 'COST MISSING',        border: 'border-l-red-600',     text: 'text-red-400/80' },
  COST_PENDING:      { label: 'COST PENDING',        border: 'border-l-gray-600',    text: 'text-gray-500' },
  MANUAL_COST:       { label: 'MANUAL COST OVERRIDE', border: 'border-l-amber-500',  text: 'text-amber-400/80' },
  MANUAL_RETAIL:     { label: 'MANUAL RETAIL',        border: 'border-l-amber-500',  text: 'text-amber-400/80' },
  LOCKED:            { label: 'LOCKED AFTER BILLING', border: 'border-l-red-700',    text: 'text-red-400/70' },
};

function BadgeChip({ config, className }) {
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

export default function ServiceCostBadge({ commitment, className }) {
  if (!commitment) return null;

  // Use canonical total_cost from read model (already resolved by backend)
  const totalCost = commitment.total_cost || 0;
  const totalBillable = commitment.total_billable || 0;
  const status = commitment.status || 'planned';
  const hasCostOverride = commitment.cost_override === true;
  const hasRetailOverride = commitment.retail_override === true;

  // Billing locked
  if (status === 'billed') {
    return <BadgeChip config={CONFIGS.LOCKED} className={className} />;
  }

  // Determine cost badge
  let costConfig;
  if (hasCostOverride) {
    costConfig = CONFIGS.MANUAL_COST;
  } else if (totalCost > 0) {
    costConfig = CONFIGS.COST_FROM_VENDOR;
  } else if (status === 'ordered' || status === 'completed') {
    costConfig = CONFIGS.COST_MISSING;
  } else {
    costConfig = CONFIGS.COST_PENDING;
  }

  // Determine retail badge (only show if explicitly set)
  const showRetail = hasRetailOverride && !hasCostOverride;

  return (
    <div className={cn("flex gap-1 flex-wrap", className)}>
      <BadgeChip config={costConfig} />
      {showRetail && <BadgeChip config={CONFIGS.MANUAL_RETAIL} />}
    </div>
  );
}

/**
 * getServiceMarginPct - Compute margin for a service commitment
 * Matches Parts margin logic: (retail - cost) / retail * 100
 * Uses canonical total_cost from read model.
 */
export function getServiceMarginPct(commitment) {
  // Use canonical total_cost from read model (already resolved by backend)
  const totalCost = commitment?.total_cost || 0;
  const totalBillable = commitment?.total_billable || 0;
  if (totalBillable <= 0) return null;
  return ((totalBillable - totalCost) / totalBillable) * 100;
}