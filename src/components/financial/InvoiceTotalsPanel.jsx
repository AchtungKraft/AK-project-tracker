import React from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * InvoiceTotalsPanel — Live totals display for invoice builder.
 * Shows subtotal, the credit selector (children), the credit selected by kind, and the remaining balance.
 */
export default function InvoiceTotalsPanel({ subtotal, totalCost = 0, creditDeposit = 0, creditGeneral = 0, creditValid = true, balanceDue, children }) {
  const totalMargin = subtotal - totalCost;
  const marginPct = subtotal > 0 ? ((totalMargin / subtotal) * 100).toFixed(1) : 0;

  return (
    <div className="flex-shrink-0 p-3 bg-gray-800/60 border border-gray-700 rounded-lg space-y-2">
      {totalCost > 0 && (
        <div className="grid grid-cols-3 gap-2 text-xs pb-2 border-b border-gray-700/50">
          <div><span className="text-gray-500 block">Total Cost</span><span className="font-mono text-gray-300">{formatCurrencyUSD(totalCost)}</span></div>
          <div><span className="text-gray-500 block">Total Retail</span><span className="font-mono text-white">{formatCurrencyUSD(subtotal)}</span></div>
          <div>
            <span className="text-gray-500 block">Margin</span>
            <span className={cn("font-mono", totalMargin >= 0 ? "text-green-400" : "text-red-400")}>{formatCurrencyUSD(totalMargin)} ({marginPct}%)</span>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-400">Subtotal</span>
        <span className="font-mono text-white font-medium">{formatCurrencyUSD(subtotal)}</span>
      </div>

      {subtotal > 0 && children}

      {creditValid && creditDeposit > 0 && (
        <div className="flex justify-between items-center text-sm"><span className="text-amber-300">Deposit credit</span><span className="font-mono text-amber-300">-{formatCurrencyUSD(creditDeposit)}</span></div>
      )}
      {creditValid && creditGeneral > 0 && (
        <div className="flex justify-between items-center text-sm"><span className="text-sky-300">General project credit</span><span className="font-mono text-sky-300">-{formatCurrencyUSD(creditGeneral)}</span></div>
      )}

      <Separator className="bg-gray-700" />

      <div className="flex justify-between items-center">
        <span className="text-white font-semibold">Remaining balance</span>
        <span className="font-mono text-white text-lg font-bold">{formatCurrencyUSD(balanceDue)}</span>
      </div>

      <p className="text-[10px] text-gray-500">Creates a draft. Selected credit is reserved, and deducted only when the invoice is sent.</p>
    </div>
  );
}