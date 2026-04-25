import React from "react";
import { DollarSign, ArrowDown } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * RemovalImpactPreview — Financial impact preview shown before confirming removal.
 *
 * Shows: cost reduction, revenue reduction, credit amount, and the formula.
 */
export default function RemovalImpactPreview({
  qtyToRemove,
  costReduction,
  retailReduction,
  creditPreview,
  isInvoiced,
  invoicedAmount,
  requiredTotal,
  isFullRemoval,
}) {
  if (qtyToRemove <= 0) return null;

  return (
    <div className="p-3 bg-gray-800/60 border border-gray-700 rounded-lg space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-300 font-medium">
        <DollarSign className="w-4 h-4 text-gray-400" />
        This action will:
      </div>

      <div className="ml-6 space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <ArrowDown className="w-3 h-3 text-red-400" />
          <span className="text-gray-400">Reduce planned cost by</span>
          <span className="text-red-400 font-mono font-medium">{formatCurrencyUSD(costReduction)}</span>
        </div>
        <div className="flex items-center gap-2">
          <ArrowDown className="w-3 h-3 text-red-400" />
          <span className="text-gray-400">Reduce planned revenue by</span>
          <span className="text-red-400 font-mono font-medium">{formatCurrencyUSD(retailReduction)}</span>
        </div>
        {isInvoiced && creditPreview > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 text-amber-400 text-center text-xs font-bold">+</span>
            <span className="text-gray-400">Create credit of</span>
            <span className="text-amber-400 font-mono font-bold">{formatCurrencyUSD(creditPreview)}</span>
          </div>
        )}
      </div>

      {/* Credit Formula */}
      {isInvoiced && creditPreview > 0 && !isFullRemoval && (
        <p className="text-[10px] text-gray-500 ml-6">
          ≈ ({formatCurrencyUSD(invoicedAmount)} ÷ {requiredTotal}) × {qtyToRemove}
          <span className="text-gray-600 ml-1">(final uses invoice line pricing)</span>
        </p>
      )}

      {!isInvoiced && (
        <p className="text-[10px] text-gray-500 ml-6">
          No credit — this commitment has not been invoiced.
        </p>
      )}
    </div>
  );
}