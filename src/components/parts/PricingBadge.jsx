import React from "react";
import { Badge } from "@/components/ui/badge";
import { Calculator, TrendingUp, AlertTriangle, DollarSign, Search, FileWarning } from "lucide-react";
import { getPricingBadge } from "@/components/supply/pricingHelpers";
import { cn } from "@/lib/utils";

/**
 * PricingBadge - PHASE 15V.2 Display Component
 * 
 * Shows pricing status badge for a part or commitment:
 * - MATRIX (blue) - Matrix pricing active
 * - OVERRIDE (orange) - Manual override
 * - NO COST (red) - Cost is 0 or missing
 * - NEG MARGIN (red) - Retail < Cost
 * - REVIEW (yellow) - needs_cost_review flag
 * - OPEN REQUEST (red pulse) - Open RetailAdjustmentRequest
 */
export default function PricingBadge({ 
  part, 
  commitment,
  size = "sm", 
  showLabel = true,
  showOpenRequest = true
}) {
  // PHASE 15V.2: Check for open adjustment request on commitment
  if (showOpenRequest && commitment?.retail_adjustment_request_id && commitment?.invoice_blocked_reason === 'OPEN_ADJUSTMENT_REQUEST') {
    return (
      <Badge 
        className={cn(
          "bg-red-600 text-white animate-pulse",
          size === "xs" && "text-[10px] px-1.5 py-0",
          size === "sm" && "text-xs px-2 py-0.5"
        )}
      >
        <FileWarning className={cn(
          "mr-1",
          size === "xs" && "w-2.5 h-2.5",
          size === "sm" && "w-3 h-3"
        )} />
        {showLabel && "OPEN REQUEST"}
      </Badge>
    );
  }

  // PHASE 15V.2: Show commitment-level negative margin
  if (commitment?.pricing_integrity_status === 'margin_negative') {
    return (
      <Badge 
        className={cn(
          "bg-red-700 text-white",
          size === "xs" && "text-[10px] px-1.5 py-0",
          size === "sm" && "text-xs px-2 py-0.5"
        )}
      >
        <AlertTriangle className={cn(
          "mr-1",
          size === "xs" && "w-2.5 h-2.5",
          size === "sm" && "w-3 h-3"
        )} />
        {showLabel && "NEG MARGIN"}
      </Badge>
    );
  }

  // Use part badge if available
  const badge = part ? getPricingBadge(part) : null;
  
  if (!badge) return null;

  const iconMap = {
    MATRIX: Calculator,
    OVERRIDE: TrendingUp,
    NO_COST: AlertTriangle,
    NEG_MARGIN: AlertTriangle,
    REVIEW: Search
  };

  const Icon = iconMap[badge.type] || DollarSign;

  return (
    <Badge 
      className={cn(
        badge.color, 
        "text-white",
        size === "xs" && "text-[10px] px-1.5 py-0",
        size === "sm" && "text-xs px-2 py-0.5"
      )}
    >
      <Icon className={cn(
        "mr-1",
        size === "xs" && "w-2.5 h-2.5",
        size === "sm" && "w-3 h-3"
      )} />
      {showLabel && badge.label}
    </Badge>
  );
}

/**
 * CommitmentPricingBadge - Shows frozen retail + integrity status
 */
export function CommitmentPricingBadge({ commitment, size = "sm" }) {
  if (!commitment) return null;

  const status = commitment.pricing_integrity_status || 'ok';
  
  const statusConfig = {
    ok: { color: 'bg-green-600', label: 'OK', icon: DollarSign },
    overridden_retail: { color: 'bg-orange-600', label: 'OVERRIDE', icon: TrendingUp },
    missing_retail: { color: 'bg-red-600', label: 'NO RETAIL', icon: AlertTriangle },
    missing_cost: { color: 'bg-yellow-600', label: 'NO COST', icon: AlertTriangle },
    margin_negative: { color: 'bg-red-700', label: 'NEG MARGIN', icon: AlertTriangle },
    estimated_cost: { color: 'bg-blue-600', label: 'ESTIMATED', icon: Calculator },
    cost_retail_mismatch: { color: 'bg-yellow-700', label: 'MISMATCH', icon: AlertTriangle }
  };

  const config = statusConfig[status] || statusConfig.ok;
  const Icon = config.icon;

  return (
    <Badge 
      className={cn(
        config.color, 
        "text-white",
        size === "xs" && "text-[10px] px-1.5 py-0",
        size === "sm" && "text-xs px-2 py-0.5"
      )}
    >
      <Icon className={cn(
        "mr-1",
        size === "xs" && "w-2.5 h-2.5",
        size === "sm" && "w-3 h-3"
      )} />
      {config.label}
    </Badge>
  );
}