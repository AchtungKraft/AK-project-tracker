import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, DollarSign, TrendingUp, Receipt, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * PSMFinancialSummary - Financial clarity dashboard for ProjectSupplyManager
 * 
 * Shows: Retail Exposure, Cost Exposure, Invoiced, Paid, Outstanding
 * Plus: Capital Breakdown (Stock Capital, On-Order Capital, Total Capital)
 * Plus: Cashflow Risk warning banner
 * 
 * All computed from enrichedCommitments — no additional API calls.
 */
export default function PSMFinancialSummary({ enrichedCommitments, metrics }) {
  const financial = useMemo(() => {
    const totalCostExposure = enrichedCommitments.reduce(
      (sum, c) => sum + (c.planned_cost_total ?? 0), 0
    );
    const totalStockCost = enrichedCommitments.reduce(
      (sum, c) => sum + ((c.reserved_from_stock ?? 0) * (c.unit_cost ?? 0)), 0
    );
    const totalOrderCost = enrichedCommitments.reduce(
      (sum, c) => sum + ((c.to_order ?? 0) * (c.unit_cost ?? 0)), 0
    );

    return { totalCostExposure, totalStockCost, totalOrderCost };
  }, [enrichedCommitments]);

  const totalRetailExposure = metrics.totalPlannedRetail;
  const totalInvoiced = metrics.totalInvoiced;
  const totalPaid = metrics.totalPaid;
  const outstanding = metrics.invoiceOutstanding;
  const costAheadOfBilling = financial.totalCostExposure > totalInvoiced && financial.totalCostExposure > 0;

  return (
    <div className="space-y-3">
      {/* Main Financial Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Retail Exposure</p>
            <p className="text-lg font-bold text-white font-mono">{formatCurrencyUSD(totalRetailExposure)}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-red-900/40">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Cost Exposure</p>
            <p className="text-lg font-bold text-red-400 font-mono">{formatCurrencyUSD(financial.totalCostExposure)}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-blue-900/40">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Invoiced</p>
            <p className="text-lg font-bold text-blue-400 font-mono">{formatCurrencyUSD(totalInvoiced)}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-emerald-900/40">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Paid</p>
            <p className="text-lg font-bold text-emerald-400 font-mono">{formatCurrencyUSD(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className={cn("bg-black/40", outstanding > 0 ? "border-amber-700" : "border-gray-800")}>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Outstanding</p>
            <p className={cn("text-lg font-bold font-mono", outstanding > 0 ? "text-amber-400" : "text-gray-500")}>
              {formatCurrencyUSD(outstanding)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Capital Breakdown */}
      <div className="grid gap-3 grid-cols-3">
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Stock Capital</p>
            <p className="text-sm font-bold text-cyan-400 font-mono">{formatCurrencyUSD(financial.totalStockCost)}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">On-Order Capital</p>
            <p className="text-sm font-bold text-purple-400 font-mono">{formatCurrencyUSD(financial.totalOrderCost)}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total Capital</p>
            <p className="text-sm font-bold text-white font-mono">{formatCurrencyUSD(financial.totalCostExposure)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Cashflow Risk Banner */}
      {costAheadOfBilling && (
        <div className="flex items-center gap-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Capital Ahead of Billing</p>
            <p className="text-xs text-amber-400/80">
              Parts require {formatCurrencyUSD(financial.totalCostExposure)} cost but only {formatCurrencyUSD(totalInvoiced)} has been invoiced.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}