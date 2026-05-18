import React from "react";
import { ArrowDown } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * RemovalImpactPreview — Clean, operational summary of what changes when parts are removed.
 * Language: project-first, not accounting-first.
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
    <div className="p-3 bg-gray-800/40 border border-gray-700/50 rounded-lg space-y-1.5">
      <p className="text-xs font-medium text-gray-400 mb-1">Project Changes</p>

      <div className="flex items-center gap-2 text-sm">
        <ArrowDown className="w-3 h-3 text-red-400 shrink-0" />
        <span className="text-gray-300">Project cost reduced</span>
        <span className="text-red-400 font-mono font-medium ml-auto">{formatCurrencyUSD(costReduction)}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <ArrowDown className="w-3 h-3 text-red-400 shrink-0" />
        <span className="text-gray-300">Client total reduced</span>
        <span className="text-red-400 font-mono font-medium ml-auto">{formatCurrencyUSD(retailReduction)}</span>
      </div>
      {isInvoiced && creditPreview > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="w-3 h-3 text-amber-400 text-center text-xs font-bold shrink-0">+</span>
          <span className="text-gray-300">Client credit</span>
          <span className="text-amber-400 font-mono font-bold ml-auto">{formatCurrencyUSD(creditPreview)}</span>
        </div>
      )}

      {!isInvoiced && (
        <p className="text-[10px] text-gray-500 pt-1">
          No credit needed — not yet invoiced.
        </p>
      )}
      {isInvoiced && creditPreview > 0 && (
        <p className="text-[10px] text-gray-500 pt-1">
          Credit is approximate — final amount based on invoice line pricing.
        </p>
      )}
    </div>
  );
}