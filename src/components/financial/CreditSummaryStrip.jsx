import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, DollarSign, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * CreditSummaryStrip - Shows credit allocation summary
 * 
 * PHASE 4: UI component for Invoice Tab header
 * Shows: Gross Exposure | Available Credit | Credit Applied | Net Exposure
 * With "Apply Credit" button
 */
export default function CreditSummaryStrip({
  grossExposure = 0,
  creditAvailable = 0,
  creditApplied = 0,
  netExposure = 0,
  onApplyCredit,
  selectedCount = 0,
  isLoading = false,
}) {
  const hasCredit = creditAvailable > 0;
  const hasUnappliedCredit = creditAvailable > 0 && netExposure > 0;
  
  // Determine disabled reason for tooltip/accessibility
  const getDisabledReason = () => {
    if (!hasCredit) return "No credit available";
    if (netExposure <= 0) return "Nothing to apply credit to";
    return null;
  };
  const disabledReason = getDisabledReason();

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
      {/* Gross Exposure */}
      <div className="flex-1 min-w-[100px]">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Gross Exposure</p>
        <p className="text-lg font-bold text-white font-mono">
          {formatCurrencyUSD(grossExposure)}
        </p>
      </div>

      {/* Available Credit */}
      <div className="flex-1 min-w-[100px]">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Credit Available</p>
        <p className={cn(
          "text-lg font-bold font-mono",
          hasCredit ? "text-green-400" : "text-gray-500"
        )}>
          {formatCurrencyUSD(creditAvailable)}
        </p>
      </div>

      {/* Credit Applied */}
      <div className="flex-1 min-w-[100px]">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Credit Applied</p>
        <p className={cn(
          "text-lg font-bold font-mono",
          creditApplied > 0 ? "text-blue-400" : "text-gray-500"
        )}>
          {creditApplied > 0 ? `-${formatCurrencyUSD(creditApplied)}` : formatCurrencyUSD(0)}
        </p>
      </div>

      {/* Arrow */}
      <div className="flex items-center justify-center px-1">
        <ArrowRight className="w-4 h-4 text-gray-500" />
      </div>

      {/* Net Exposure */}
      <div className="flex-1 min-w-[100px]">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Net Exposure</p>
        <p className={cn(
          "text-lg font-bold font-mono",
          netExposure > 0 ? "text-amber-400" : "text-green-400"
        )}>
          {formatCurrencyUSD(netExposure)}
        </p>
      </div>

      {/* Apply Credit Button - always render when handler provided, disabled state shown */}
      {onApplyCredit && (
        <div className="flex-shrink-0 flex items-center gap-2">
          <Button
            onClick={onApplyCredit}
            disabled={!hasUnappliedCredit || isLoading}
            variant={hasUnappliedCredit ? "default" : "outline"}
            size="sm"
            title={disabledReason || undefined}
            className={cn(
              "gap-2",
              hasUnappliedCredit && "bg-green-600 hover:bg-green-700"
            )}
          >
            <Wallet className="w-4 h-4" />
            {selectedCount > 0 ? (
              `Apply to ${selectedCount} Selected`
            ) : (
              "Apply Credit"
            )}
          </Button>
          {/* Show reason when disabled */}
          {disabledReason && !isLoading && (
            <span className="text-xs text-gray-500">{disabledReason}</span>
          )}
        </div>
      )}

      {/* Status indicator */}
      {creditApplied > 0 && netExposure === 0 && (
        <Badge className="bg-green-600/20 text-green-400 gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Fully Covered
        </Badge>
      )}
    </div>
  );
}