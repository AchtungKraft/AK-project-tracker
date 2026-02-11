import React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  getPricingStatusDisplay, 
  getPricingSourceDisplay,
  PRICING_STATUS,
  PRICING_SOURCE 
} from "../inventory/pricingIntegrityUtils";

/**
 * PricingStatusBadge - Displays pricing integrity status with tooltip
 */
export function PricingStatusBadge({ status, showIcon = true, size = "default" }) {
  const display = getPricingStatusDisplay(status);
  
  const sizeClass = size === "sm" ? "text-xs px-1.5 py-0" : "text-xs px-2 py-0.5";
  
  return (
    <Badge variant="outline" className={`${display.className} ${sizeClass}`}>
      {showIcon && <span className="mr-1">{display.icon}</span>}
      {display.label}
    </Badge>
  );
}

/**
 * PricingSourceBadge - Displays pricing source with tooltip
 */
export function PricingSourceBadge({ source, size = "default" }) {
  const display = getPricingSourceDisplay(source);
  
  const sizeClass = size === "sm" ? "text-xs px-1.5 py-0" : "text-xs px-2 py-0.5";
  
  return (
    <Badge variant="outline" className={`${display.className} ${sizeClass}`}>
      {display.label}
    </Badge>
  );
}

/**
 * PricingIntegrityIndicator - Combined status and source display with tooltip
 */
export default function PricingIntegrityIndicator({ 
  pricingIntegrity, 
  showSource = false,
  showTooltip = true,
  size = "default" 
}) {
  if (!pricingIntegrity) return null;
  
  const { status, retailValue, costValue, retailSource, marginPct, isCommitmentControlled } = pricingIntegrity;
  const statusDisplay = getPricingStatusDisplay(status);
  const sourceDisplay = getPricingSourceDisplay(retailSource);
  
  const content = (
    <div className="flex items-center gap-1">
      <PricingStatusBadge status={status} size={size} />
      {showSource && <PricingSourceBadge source={retailSource} size={size} />}
    </div>
  );
  
  if (!showTooltip) return content;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent className="bg-gray-900 border-gray-700 text-white max-w-xs">
          <div className="space-y-1 text-xs">
            <div className="font-semibold border-b border-gray-700 pb-1">
              Pricing Details
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Retail:</span>
              <span className="font-mono">${retailValue?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Cost:</span>
              <span className="font-mono">${costValue?.toFixed(2) || '0.00'}</span>
            </div>
            {marginPct !== null && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Margin:</span>
                <span className={marginPct < 0 ? 'text-red-400' : 'text-green-400'}>
                  {marginPct.toFixed(1)}%
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4 pt-1 border-t border-gray-700">
              <span className="text-gray-400">Source:</span>
              <span className={sourceDisplay.className.replace('border-', 'text-').split(' ')[1]}>
                {sourceDisplay.label}
              </span>
            </div>
            {isCommitmentControlled && (
              <div className="text-purple-400 text-xs mt-1">
                ✓ Controlled by Commitment
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}