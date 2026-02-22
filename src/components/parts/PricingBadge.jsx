import React from "react";
import { cn } from "@/lib/utils";
import { getPricingBadge } from "@/components/supply/pricingHelpers";

/**
 * PricingBadge - AK Industrial Mode
 * 
 * RULES:
 * - If status = 'ok' or 'matrix' → render NOTHING (remove green/blue OK badges)
 * - Only show warning states
 * - Small, uppercase, monochrome, left border accent only
 * - NO bright colors, NO icons
 */

const BADGE_CONFIG = {
  // DO NOT RENDER these - they are "normal" states
  MATRIX: null,
  OK: null,
  
  // RENDER these warning states only
  OVERRIDE: { label: 'RETAIL OVERRIDDEN', accent: 'border-l-amber-600' },
  NO_COST: { label: 'MISSING COST', accent: 'border-l-red-700' },
  NEG_MARGIN: { label: 'NEGATIVE MARGIN', accent: 'border-l-red-700' },
  REVIEW: { label: 'NEEDS REVIEW', accent: 'border-l-amber-600' },
};

export default function PricingBadge({ 
  part, 
  commitment,
  showLabel = true,
}) {
  // PHASE 15V.2: Check for open adjustment request on commitment
  if (commitment?.retail_adjustment_request_id && commitment?.invoice_blocked_reason === 'OPEN_ADJUSTMENT_REQUEST') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-gray-900/80 text-gray-400 border-l-2 border-l-red-700">
        OPEN REQUEST
      </span>
    );
  }

  // PHASE 15V.2: Show commitment-level negative margin
  if (commitment?.pricing_integrity_status && commitment.pricing_integrity_status !== 'ok') {
    const commitmentConfig = {
      margin_negative: { label: 'NEGATIVE MARGIN', accent: 'border-l-red-700' },
      missing_cost: { label: 'MISSING COST', accent: 'border-l-amber-600' },
      missing_retail: { label: 'MISSING RETAIL', accent: 'border-l-red-700' },
      overridden_retail: { label: 'RETAIL OVERRIDDEN', accent: 'border-l-amber-600' },
      estimated_cost: { label: 'ESTIMATED COST', accent: 'border-l-gray-500' },
      cost_retail_mismatch: { label: 'COST/RETAIL MISMATCH', accent: 'border-l-amber-600' },
    };
    
    const config = commitmentConfig[commitment.pricing_integrity_status];
    if (config) {
      return (
        <span className={cn(
          "inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider",
          "bg-gray-900/80 text-gray-400 border-l-2",
          config.accent
        )}>
          {showLabel && config.label}
        </span>
      );
    }
  }

  // Use part badge if available
  const badge = part ? getPricingBadge(part) : null;
  
  // RULE: Do not show OK or MATRIX badges
  if (!badge || badge.type === 'MATRIX') return null;
  
  const config = BADGE_CONFIG[badge.type];
  if (!config) return null;

  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider",
      "bg-gray-900/80 text-gray-400 border-l-2",
      config.accent
    )}>
      {showLabel && config.label}
    </span>
  );
}

/**
 * CommitmentPricingBadge - AK Industrial Mode
 * 
 * RULE: NEVER show 'ok' status. Only show warnings.
 */
export function CommitmentPricingBadge({ commitment }) {
  if (!commitment) return null;

  const status = commitment.pricing_integrity_status || 'ok';
  
  // RULE: Do not render 'ok' status
  if (status === 'ok') return null;
  
  const statusConfig = {
    overridden_retail: { label: 'RETAIL OVERRIDDEN', accent: 'border-l-amber-600' },
    missing_retail: { label: 'MISSING RETAIL', accent: 'border-l-red-700' },
    missing_cost: { label: 'MISSING COST', accent: 'border-l-amber-600' },
    margin_negative: { label: 'NEGATIVE MARGIN', accent: 'border-l-red-700' },
    estimated_cost: { label: 'ESTIMATED COST', accent: 'border-l-gray-500' },
    cost_retail_mismatch: { label: 'COST/RETAIL MISMATCH', accent: 'border-l-amber-600' }
  };

  const config = statusConfig[status];
  if (!config) return null;

  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider",
      "bg-gray-900/80 text-gray-400 border-l-2",
      config.accent
    )}>
      {config.label}
    </span>
  );
}