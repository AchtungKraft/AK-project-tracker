import React from "react";
import { cn } from "@/lib/utils";

/**
 * PricingIntegrityBadge - Minimal Industrial AK Mode
 * 
 * Rules:
 * - If status = 'ok' → render NOTHING
 * - If status != 'ok' → render compact monochrome badge
 * - Small, uppercase, left border accent only
 * - NO bright colors, NO icons
 */

const INTEGRITY_CONFIG = {
  ok: null, // Never rendered
  missing_cost: { label: 'MISSING COST', accent: 'border-l-amber-600' },
  missing_retail: { label: 'MISSING RETAIL', accent: 'border-l-red-700' },
  margin_negative: { label: 'NEGATIVE MARGIN', accent: 'border-l-red-700' },
  estimated_cost: { label: 'ESTIMATED COST', accent: 'border-l-gray-500' },
  overridden_retail: { label: 'RETAIL OVERRIDDEN', accent: 'border-l-amber-600' },
  cost_retail_mismatch: { label: 'COST/RETAIL MISMATCH', accent: 'border-l-amber-600' },
};

export default function PricingIntegrityBadge({ 
  status, 
  commitment,
  className 
}) {
  // Determine status from commitment if provided
  const effectiveStatus = status || commitment?.pricing_integrity_status || 'ok';
  
  // Rule: NEVER show 'ok' status
  if (effectiveStatus === 'ok') return null;
  
  const config = INTEGRITY_CONFIG[effectiveStatus];
  if (!config) return null;

  return (
    <span 
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider",
        "bg-gray-900/80 text-gray-400 border-l-2",
        config.accent,
        className
      )}
    >
      {config.label}
    </span>
  );
}

/**
 * Check if pricing has any warning status
 */
export function hasPricingWarning(commitment) {
  if (!commitment) return false;
  const status = commitment.pricing_integrity_status || 'ok';
  return status !== 'ok';
}

/**
 * Get pricing integrity status text (for accessibility)
 */
export function getPricingIntegrityText(commitment) {
  if (!commitment) return null;
  const status = commitment.pricing_integrity_status || 'ok';
  if (status === 'ok') return null;
  return INTEGRITY_CONFIG[status]?.label || status.toUpperCase();
}