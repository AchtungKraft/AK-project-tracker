import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * PSMFinancialSummary — 5-Section Financial Overview
 * 
 * Sections:
 * 1. PROJECT PLAN — Planned Revenue, Planned Cost, Projected Margin
 * 2. SHOP COMMITMENT (RISK) — Committed Cost, Stock Allocated, On Order
 * 3. ACTUAL SPEND — Purchased (Actual Cost), Installed Cost
 * 4. CLIENT BILLING — Invoiced, Paid, Outstanding
 * 5. PROFIT SNAPSHOT — Projected Margin, Actual Margin, Revenue Remaining
 * 
 * All derived from enrichedCommitments + metrics + servicesSummary — no API calls.
 * NO new backend calculations. ONLY remap + relabel + corrected exposure.
 */
export default function PSMFinancialSummary({ enrichedCommitments, metrics, servicesSummary }) {
  const financial = useMemo(() => {
    // Parts cost breakdown from enrichedCommitments
    const totalStockCost = enrichedCommitments.reduce(
      (sum, c) => sum + ((c.reserved_from_stock ?? 0) * (c.unit_cost ?? 0)), 0
    );
    const totalOrderCost = enrichedCommitments.reduce(
      (sum, c) => sum + ((c.covered_from_po ?? 0) * (c.unit_cost ?? 0)), 0
    );
    const totalInstalledCost = enrichedCommitments.reduce(
      (sum, c) => sum + ((c.qty_installed ?? 0) * (c.unit_cost ?? 0)), 0
    );

    // PLANNED vs ACTUAL aggregation
    const totalPlannedMargin = enrichedCommitments.reduce(
      (sum, c) => sum + (c.planned_margin ?? 0), 0
    );
    const totalActualMargin = enrichedCommitments.reduce(
      (sum, c) => sum + (c.actual_margin ?? c.resolved_margin ?? 0), 0
    );
    const totalActualCost = enrichedCommitments.reduce(
      (sum, c) => sum + (c.actual_cost_total ?? c.resolved_cost_total ?? c.planned_cost_total ?? 0), 0
    );

    const partsCost = metrics.totalPlannedCost ?? 0;
    const serviceCost = metrics.servicesCost ?? servicesSummary?.total_cost ?? 0;
    const serviceBillable = metrics.servicesRetail ?? servicesSummary?.total_billable ?? 0;
    const totalCommittedCost = totalActualCost + serviceCost;

    return {
      totalCommittedCost, totalStockCost, totalOrderCost, totalInstalledCost,
      partsCost, serviceCost, serviceBillable,
      totalPlannedMargin, totalActualMargin, totalActualCost,
    };
  }, [enrichedCommitments, metrics, servicesSummary]);

  // All totals from backend resolver — no recomputation
  const plannedRevenue = metrics.totalPlannedRetail;
  const plannedCost = financial.totalCommittedCost;
  const totalInvoiced = metrics.totalInvoiced;
  const totalPaid = metrics.totalPaid;
  const outstanding = metrics.invoiceOutstanding;

  // PLANNED vs ACTUAL margins
  const plannedMargin = financial.totalPlannedMargin + (financial.serviceBillable - financial.serviceCost);
  const actualMargin = financial.totalActualMargin + (financial.serviceBillable - financial.serviceCost);
  const marginDelta = actualMargin - plannedMargin;
  // CORRECTED: cost-based exposure = max(0, committed_cost - invoiced)
  const committedCostRisk = Math.max(0, plannedCost - totalInvoiced);
  const revenueRemaining = Math.max(0, plannedRevenue - totalInvoiced);

  // Edge case: no planned items but invoiced exists
  const noPlannedScope = enrichedCommitments.length === 0 && totalInvoiced > 0;

  return (
    <div className="space-y-3">
      {/* Edge case banner */}
      {noPlannedScope && (
        <div className="flex items-center gap-3 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <p className="text-sm text-blue-300">This project has historical billing but no active planned scope.</p>
        </div>
      )}

      {/* 5-Section Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {/* 1. PROJECT PLAN */}
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Project Plan</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Revenue</span>
                <span className="text-sm font-bold text-white font-mono">{formatCurrencyUSD(plannedRevenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Planned Cost</span>
                <span className="text-xs text-gray-400 font-mono">{formatCurrencyUSD(metrics.totalPlannedCost + financial.serviceCost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Actual Cost</span>
                <span className="text-xs text-red-400 font-mono">{formatCurrencyUSD(plannedCost)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. SHOP COMMITMENT (RISK) */}
        <Card className="bg-black/40 border-red-900/30">
          <CardContent className="p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Committed Cost</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Total Committed</span>
                <span className="text-sm font-bold text-red-400 font-mono">{formatCurrencyUSD(plannedCost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">├ Stock Allocated</span>
                <span className="text-xs text-cyan-400 font-mono">{formatCurrencyUSD(financial.totalStockCost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">├ On Order</span>
                <span className="text-xs text-purple-400 font-mono">{formatCurrencyUSD(financial.totalOrderCost)}</span>
              </div>
              {financial.serviceCost > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 flex items-center gap-1">├ Services <Truck className="w-2.5 h-2.5" /></span>
                  <span className="text-xs text-amber-400 font-mono">{formatCurrencyUSD(financial.serviceCost)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 3. ACTUAL SPEND */}
        <Card className="bg-black/40 border-purple-900/30">
          <CardContent className="p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Actual Spend</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Purchased Cost</span>
                <span className="text-sm font-bold text-purple-400 font-mono">
                  {formatCurrencyUSD(financial.totalStockCost + financial.totalOrderCost)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Installed Cost</span>
                <span className="text-xs text-emerald-400 font-mono">{formatCurrencyUSD(financial.totalInstalledCost)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. CLIENT BILLING */}
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

        {/* 5. PROFIT SNAPSHOT — Planned vs Actual */}
        <Card className={cn("bg-black/40", actualMargin >= 0 ? "border-emerald-900/40" : "border-red-900/40")}>
          <CardContent className="p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Margin Analysis</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Planned Margin</span>
                <span className={cn("text-xs font-mono", plannedMargin >= 0 ? "text-gray-300" : "text-red-400")}>
                  {formatCurrencyUSD(plannedMargin)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Actual Margin</span>
                <span className={cn("text-sm font-bold font-mono", actualMargin >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {formatCurrencyUSD(actualMargin)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-800 pt-1">
                <span className="text-[10px] text-gray-500">Margin Delta</span>
                <span className={cn("text-xs font-bold font-mono", marginDelta < -0.01 ? "text-red-400" : marginDelta > 0.01 ? "text-emerald-400" : "text-gray-500")}>
                  {marginDelta < 0 ? '' : '+'}{formatCurrencyUSD(marginDelta)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Revenue Remaining</span>
                <span className="text-xs text-white font-mono">{formatCurrencyUSD(revenueRemaining)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CORRECTED Cashflow Risk Banner */}
      {committedCostRisk > 0 && plannedCost > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Cost at Risk</p>
            <p className="text-xs text-amber-400/80">
              You have committed {formatCurrencyUSD(plannedCost)} in cost but billed {formatCurrencyUSD(totalInvoiced)} → <span className="font-bold text-amber-300">{formatCurrencyUSD(committedCostRisk)} at risk</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}