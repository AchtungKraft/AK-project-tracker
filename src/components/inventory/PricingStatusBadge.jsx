import React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock, AlertTriangle, CheckCircle2, DollarSign } from "lucide-react";
import { getPricingStatusBadge, getPricingSourceBadge, PRICING_STATUS } from "./pricingIntegrityUtils";

/**
 * PricingStatusBadge - Displays pricing integrity status with optional source info
 */
export function PricingStatusBadge({ status, showIcon = true, size = "default" }) {
  const config = getPricingStatusBadge(status);
  const sizeClasses = size === "sm" ? "text-xs px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  
  return (
    <Badge variant="outline" className={`${config.color} ${sizeClasses}`}>
      {showIcon && <span className="mr-1">{config.icon}</span>}
      {config.label}
    </Badge>
  );
}

/**
 * PricingSourceBadge - Shows where pricing data comes from
 */
export function PricingSourceBadge({ source, size = "default" }) {
  const config = getPricingSourceBadge(source);
  const sizeClasses = size === "sm" ? "text-xs px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  
  return (
    <Badge variant="outline" className={`${config.color} ${sizeClasses}`}>
      {config.label}
    </Badge>
  );
}

/**
 * CommitmentPricingIndicator - Shows when pricing is controlled by commitment
 */
export function CommitmentPricingIndicator({ isCommitmentControlled, className = "" }) {
  if (!isCommitmentControlled) return null;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1 text-purple-400 ${className}`}>
            <Lock className="w-3 h-3" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Pricing Controlled by Commitment</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * PricingIntegrityCell - Combined cell showing status + source
 */
export function PricingIntegrityCell({ integrity, showSource = false, compact = false }) {
  if (!integrity) return <span className="text-gray-500 text-xs">—</span>;
  
  const statusConfig = getPricingStatusBadge(integrity.status);
  const sourceConfig = getPricingSourceBadge(integrity.pricingSource);
  
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help">{statusConfig.icon}</span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <p>Status: {statusConfig.label}</p>
              <p>Source: {sourceConfig.label}</p>
              {integrity.retailValue > 0 && <p>Retail: ${integrity.retailValue.toFixed(2)}</p>}
              {integrity.costValue > 0 && <p>Cost: ${integrity.costValue.toFixed(2)}</p>}
              {integrity.marginPct !== null && <p>Margin: {integrity.marginPct.toFixed(1)}%</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <div className="flex items-center gap-1.5">
      <PricingStatusBadge status={integrity.status} size="sm" showIcon={false} />
      {showSource && <PricingSourceBadge source={integrity.pricingSource} size="sm" />}
      <CommitmentPricingIndicator isCommitmentControlled={integrity.isCommitmentControlled} />
    </div>
  );
}

/**
 * PricingWarningIcon - Shows warning icon for pricing issues
 */
export function PricingWarningIcon({ status }) {
  if (status === PRICING_STATUS.OK || status === PRICING_STATUS.ESTIMATED_COST) {
    return null;
  }
  
  const isError = status === PRICING_STATUS.MISSING_RETAIL || 
                  status === PRICING_STATUS.MISSING_BOTH;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertTriangle className={`w-4 h-4 ${isError ? 'text-red-400' : 'text-amber-400'}`} />
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {status === PRICING_STATUS.MISSING_BOTH && 'Missing both cost and retail pricing'}
            {status === PRICING_STATUS.MISSING_RETAIL && 'Missing retail pricing'}
            {status === PRICING_STATUS.MISSING_COST && 'Missing cost data'}
            {status === PRICING_STATUS.ZERO_VALUE && '$0 pricing detected'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default PricingStatusBadge;