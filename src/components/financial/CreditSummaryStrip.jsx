import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, DollarSign, ArrowRight, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { useProjectFinancialSnapshot, validateTotalsGate } from "./useProjectFinancialSnapshot";

/**
 * CreditSummaryStrip - Shows credit allocation summary
 * 
 * PHASE 4 REFACTORED: Now uses canonical financial snapshot as single source of truth.
 * Shows: Planned Retail | Credit Available | Credit Applied | Net Exposure
 * With "Apply Credit" button
 * 
 * Props can override snapshot values for backwards compatibility,
 * but projectId-based loading is preferred.
 */
export default function CreditSummaryStrip({
  projectId,
  // Legacy props - will be overridden by snapshot when projectId is provided
  grossExposure: propGrossExposure,
  creditAvailable: propCreditAvailable,
  creditApplied: propCreditApplied,
  netExposure: propNetExposure,
  onApplyCredit,
  selectedCount = 0,
  isLoading: propIsLoading = false,
}) {
  // CANONICAL SOURCE: Use financial snapshot when projectId is provided
  const { canonical, totalsGate, isLoading: snapshotLoading } = useProjectFinancialSnapshot(
    projectId,
    { enabled: !!projectId }
  );

  // Use snapshot values when available, fallback to props for backwards compatibility
  const grossExposure = canonical?.planned_retail ?? propGrossExposure ?? 0;
  const creditAvailable = canonical?.credit_available ?? propCreditAvailable ?? 0;
  const creditApplied = canonical?.credit_applied ?? propCreditApplied ?? 0;
  const netExposure = canonical?.net_exposure ?? propNetExposure ?? 0;
  const isLoading = propIsLoading || snapshotLoading;

  const hasCredit = creditAvailable > 0;
  const hasUnappliedCredit = creditAvailable > 0 && netExposure > 0;

  // Validate totals gate
  const gateValidation = totalsGate ? validateTotalsGate({ totals_gate: totalsGate }) : { valid: true };
  
  // Determine disabled reason for tooltip/accessibility
  const getDisabledReason = () => {
    if (!hasCredit) return "No credit available";
    if (netExposure <= 0) return "Nothing to apply credit to";
    return null;
  };
  const disabledReason = getDisabledReason();

  // Show loading state
  if (isLoading && projectId) {
    return (
      <div className="flex items-center justify-center p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400 mr-2" />
        <span className="text-gray-400 text-sm">Loading financial data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Totals Gate Warning */}
      {!gateValidation.valid && (
        <div className="flex items-center gap-2 p-2 bg-amber-900/20 rounded border border-amber-700">
          <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="text-amber-300 text-xs">Financial reconciliation mismatch detected</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
        {/* Planned Retail (was Gross Exposure) */}
        <div className="flex-1 min-w-[100px]">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Planned Retail</p>
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