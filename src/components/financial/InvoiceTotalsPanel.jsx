import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * InvoiceTotalsPanel — Live totals display for invoice builder.
 * Shows subtotal, credit input (if available), and balance due.
 * Updates in real-time as items are toggled.
 */
export default function InvoiceTotalsPanel({
  subtotal,
  totalCost = 0,
  availableCredit,
  effectiveCreditToApply,
  creditInputValue,
  creditValidationError,
  suggestedCredit,
  balanceDue,
  lineItemCount,
  onCreditChange,
  onCreditReset,
  maxCredit,
}) {
  const totalMargin = subtotal - totalCost;
  const marginPct = subtotal > 0 ? ((totalMargin / subtotal) * 100).toFixed(1) : 0;

  return (
    <div className="flex-shrink-0 p-3 bg-gray-800/60 border border-gray-700 rounded-lg space-y-2">
      {/* Cost / Retail / Margin */}
      {totalCost > 0 && (
        <div className="grid grid-cols-3 gap-2 text-xs pb-2 border-b border-gray-700/50">
          <div>
            <span className="text-gray-500 block">Total Cost</span>
            <span className="font-mono text-gray-300">{formatCurrencyUSD(totalCost)}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Total Retail</span>
            <span className="font-mono text-white">{formatCurrencyUSD(subtotal)}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Margin</span>
            <span className={cn("font-mono", totalMargin >= 0 ? "text-green-400" : "text-red-400")}>
              {formatCurrencyUSD(totalMargin)} ({marginPct}%)
            </span>
          </div>
        </div>
      )}

      {/* Subtotal */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-400">Subtotal</span>
        <span className="font-mono text-white font-medium">{formatCurrencyUSD(subtotal)}</span>
      </div>

      {/* Credit section */}
      {availableCredit > 0 && subtotal > 0 && (
        <>
          <div className="flex items-center gap-2 py-1">
            <Label className="text-xs text-green-400 whitespace-nowrap">Credit:</Label>
            <div className="flex items-center gap-1 flex-1">
              <span className="text-green-400 text-sm">$</span>
              <Input
                type="number"
                min={0}
                max={maxCredit}
                step="0.01"
                placeholder={suggestedCredit.toFixed(2)}
                value={creditInputValue}
                onChange={(e) => onCreditChange(e.target.value)}
                className={cn(
                  "h-7 text-sm font-mono bg-gray-900 border-green-800",
                  creditValidationError && "border-red-500"
                )}
              />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">
              of {formatCurrencyUSD(availableCredit)}
            </span>
            {creditInputValue && (
              <Button variant="ghost" size="sm" onClick={onCreditReset} className="h-6 px-2 text-xs text-gray-400">
                Reset
              </Button>
            )}
          </div>
          {creditValidationError && (
            <p className="text-red-400 text-xs flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {creditValidationError}
            </p>
          )}
          {effectiveCreditToApply > 0 && !creditValidationError && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-400">Credit Applied</span>
              <span className="font-mono text-green-400">-{formatCurrencyUSD(effectiveCreditToApply)}</span>
            </div>
          )}
        </>
      )}

      <Separator className="bg-gray-700" />

      {/* Balance Due */}
      <div className="flex justify-between items-center">
        <span className="text-white font-semibold">Balance Due</span>
        <span className="font-mono text-white text-lg font-bold">{formatCurrencyUSD(balanceDue)}</span>
      </div>

      {/* Draft notice */}
      <p className="text-[10px] text-gray-500">
        Creates a draft — no billing mutations until sent.
      </p>
    </div>
  );
}