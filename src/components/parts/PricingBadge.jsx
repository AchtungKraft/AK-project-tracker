import React from "react";
import { Badge } from "@/components/ui/badge";
import { Calculator, TrendingUp, AlertTriangle, DollarSign, Search } from "lucide-react";
import { getPricingBadge } from "@/components/supply/pricingHelpers";
import { cn } from "@/lib/utils";

/**
 * PricingBadge - PHASE 15V Display Component
 * 
 * Shows pricing status badge for a part:
 * - MATRIX (blue) - Matrix pricing active
 * - OVERRIDE (orange) - Manual override
 * - NO COST (red) - Cost is 0 or missing
 * - NEG MARGIN (red) - Retail < Cost
 * - REVIEW (yellow) - needs_cost_review flag
 */
export default function PricingBadge({ part, size = "sm", showLabel = true }) {
  const badge = getPricingBadge(part);
  
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