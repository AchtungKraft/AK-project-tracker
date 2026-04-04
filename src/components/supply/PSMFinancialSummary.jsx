import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * PSMFinancialSummary — Unified Financial Overview + Profitability Indicator
 * 
 * Three sections: PROJECT VALUE | SHOP CAPITAL | CLIENT BILLING
 * Plus: Profitability panel (Margin, Capital At Risk, Revenue Secured)
 * Plus: Cashflow risk warning banner
 * Plus: Services totals (merged into cost/billing when servicesSummary provided)
 * 
 * All derived from enrichedCommitments + metrics + servicesSummary — no API calls.
 */
export default function PSMFinancialSummary({ enrichedCommitments, metrics, servicesSummary }) {
  const financial = useMemo(() => {
    // ASSERTION: enrichedCommitments MUST only contain type="part" items.
    // Services are passed separately via servicesSummary to prevent double counting.
    const partsCostExposure = enrichedCommitments.reduce(
      (sum, c) => sum + (c.planned_cost_total ?? 0), 0
    );
    const totalStockCost = enrichedCommitments.reduce(
      (sum, c) => sum + ((c.reserved_from_stock ?? 0) * (c.unit_cost ?? 0)), 0
    );
    const totalOrderCost = enrichedCommitments.reduce(
      (sum, c) => sum + ((c.to_order ?? 0) * (c.unit_cost ?? 0)), 0
    );
    
    // Services financial data (from canonical getServicesView read model)
    const serviceCost = servicesSummary?.total_cost ?? 0;
    const serviceBillable = servicesSummary?.total_billable ?? 0;
    const serviceCount = servicesSummary?.total ?? 0;
    
    // Combined totals
    const totalCostExposure = partsCostExposure + serviceCost;
    
    return { 
      totalCostExposure, totalStockCost, totalOrderCost,
      partsCostExposure, serviceCost, serviceBillable, serviceCount,
    };
  }, [enrichedCommitments, servicesSummary]);

  const retailValue = metrics.totalPlannedRetail + financial.serviceBillable;
  const totalInvoiced = metrics.totalInvoiced;
  const totalPaid = metrics.totalPaid;
  const outstanding = metrics.invoiceOutstanding;

  // Profitability
  const estimatedMargin = retailValue - financial.totalCostExposure;
  const capitalAtRisk = Math.max(0, financial.totalCostExposure - totalInvoiced);
  const revenueSecured = retailValue > 0 ? (totalPaid / retailValue) * 100 : 0;
  const costAheadOfBilling = capitalAtRisk > 0 && financial.totalCostExposure > 0;

  return (
    <div className="space-y-3">
      {/* Unified Financial Overview — 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* PROJECT VALUE */}
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Project Value</p>
            <div>
              <p className="text-[10px] text-gray-500">Retail Value</p>
              <p className="text-xl font-bold text-white font-mono">{formatCurrencyUSD(retailValue)}</p>
            </div>
          </CardContent>
        </Card>

        {/* SHOP CAPITAL */}
        <Card className="bg-black/40 border-red-900/30">
          <CardContent className="p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Shop Capital</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Cost Exposure (Total)</span>
                <span className="text-sm font-bold text-red-400 font-mono">{formatCurrencyUSD(financial.totalCostExposure)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">├ Parts Cost</span>
                <span className="text-xs text-red-400/70 font-mono">{formatCurrencyUSD(financial.partsCostExposure)}</span>
              </div>
              {financial.serviceCost > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 flex items-center gap-1">├ Services Cost <Truck className="w-2.5 h-2.5" /></span>
                  <span className="text-xs text-amber-400 font-mono">{formatCurrencyUSD(financial.serviceCost)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Stock Capital</span>
                <span className="text-xs text-cyan-400 font-mono">{formatCurrencyUSD(financial.totalStockCost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Purchase Required</span>
                <span className="text-xs text-purple-400 font-mono">{formatCurrencyUSD(financial.totalOrderCost)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CLIENT BILLING */}
        <Card className="bg-black/40 border-blue-900/30">
          <CardContent className="p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Client Billing</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Invoiced</span>
                <span className="text-sm font-bold text-blue-400 font-mono">{formatCurrencyUSD(totalInvoiced)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Paid</span>
                <span className="text-xs text-emerald-400 font-mono">{formatCurrencyUSD(totalPaid)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Outstanding</span>
                <span className={cn("text-xs font-mono", outstanding > 0 ? "text-amber-400" : "text-gray-500")}>
                  {formatCurrencyUSD(outstanding)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profitability Indicator */}
      <div className="grid grid-cols-3 gap-3">
        <Card className={cn("bg-black/40", estimatedMargin >= 0 ? "border-emerald-900/40" : "border-red-900/40")}>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Est. Margin</p>
            <p className={cn("text-lg font-bold font-mono", estimatedMargin >= 0 ? "text-emerald-400" : "text-red-400")}>
              {formatCurrencyUSD(estimatedMargin)}
            </p>
          </CardContent>
        </Card>
        <Card className={cn("bg-black/40", capitalAtRisk > 0 ? "border-amber-800/50" : "border-gray-800")}>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Capital At Risk</p>
            <p className={cn("text-lg font-bold font-mono", capitalAtRisk > 0 ? "text-amber-400" : "text-gray-500")}>
              {formatCurrencyUSD(capitalAtRisk)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Revenue Secured</p>
            <p className={cn("text-lg font-bold font-mono", revenueSecured >= 100 ? "text-emerald-400" : "text-white")}>
              {revenueSecured.toFixed(0)}%
            </p>
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
              Project requires {formatCurrencyUSD(financial.totalCostExposure)} cost (parts + services) but only {formatCurrencyUSD(totalInvoiced)} has been invoiced.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}