import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { deriveBillingLedger, BILLING_HEALTH_CONFIG } from "@/components/financial/deriveBillingLedger";
import { cn } from "@/lib/utils";

export default function ReportTab({ metrics, projectInvoices = [] }) {
  // Derive billing ledger from actual invoice records
  const ledger = useMemo(
    () => deriveBillingLedger({
      projectedRevenue: metrics.totalPlannedRetail || 0,
      invoices: projectInvoices,
    }),
    [metrics.totalPlannedRetail, projectInvoices]
  );

  const healthCfg = BILLING_HEALTH_CONFIG[ledger.billingHealth] || BILLING_HEALTH_CONFIG.awaiting_billing;

  return (
    <div className="space-y-4">
      {/* Lifecycle Progress Bar */}
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Lifecycle Progress</span>
            <span className="text-sm text-gray-500">{metrics.byStatus.installed} / {metrics.totalCommitments} installed</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-800">
            <div className="bg-gray-600" style={{ width: `${(metrics.byStatus.planned / metrics.totalCommitments) * 100}%` }} title="Planned" />
            <div className="bg-purple-600" style={{ width: `${((metrics.byStatus.ordered + (metrics.byStatus.partiallyReceived || 0)) / metrics.totalCommitments) * 100}%` }} title="Ordered" />
            <div className="bg-blue-600" style={{ width: `${(metrics.byStatus.received / metrics.totalCommitments) * 100}%` }} title="Received" />
            <div className="bg-cyan-600" style={{ width: `${(metrics.byStatus.allocated / metrics.totalCommitments) * 100}%` }} title="Allocated" />
            <div className="bg-green-600" style={{ width: `${(metrics.byStatus.installed / metrics.totalCommitments) * 100}%` }} title="Installed" />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Plan: {metrics.byStatus.planned}</span>
            <span>Order: {metrics.byStatus.ordered}</span>
            <span>Recv: {metrics.byStatus.received}</span>
            <span>Alloc: {metrics.byStatus.allocated}</span>
            <span>Inst: {metrics.byStatus.installed}</span>
          </div>
        </CardContent>
      </Card>

      {/* Report Summary */}
      <Card className="bg-black/40 border-gray-800">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Supply Chain Report</CardTitle>
            <Button variant="outline" className="border-gray-700 text-white gap-2">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Requirements Summary */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Requirements Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gray-800/50 p-3 rounded">
                <p className="text-xs text-gray-500">Total Commitments</p>
                <p className="text-xl font-bold text-white">{metrics.totalCommitments}</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded">
                <p className="text-xs text-gray-500">Projected Revenue</p>
                <p className="text-xl font-bold text-white font-mono">{formatCurrencyUSD(ledger.projectedRevenue)}</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded">
                <p className="text-xs text-gray-500">Invoiced</p>
                <p className="text-xl font-bold text-blue-400 font-mono">{formatCurrencyUSD(ledger.invoicedRevenue)}</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded">
                <p className="text-xs text-gray-500">Remaining to Bill</p>
                <p className={cn(
                  "text-xl font-bold font-mono",
                  ledger.remainingToBill > 0.01 ? "text-yellow-400" : "text-gray-400"
                )}>
                  {formatCurrencyUSD(ledger.remainingToBill)}
                </p>
              </div>
            </div>
          </div>

          {/* Invoice Summary — CANONICAL: from invoice records only */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">
              Billing Ledger
              <span className={cn("ml-2 text-xs font-normal", healthCfg.color)}>
                — {healthCfg.label}
              </span>
            </h4>
            <div className="bg-gray-800/50 p-3 rounded space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Total Invoiced</p>
                  <p className="text-lg font-bold text-blue-400 font-mono">{formatCurrencyUSD(ledger.invoicedRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Paid</p>
                  <p className="text-lg font-bold text-emerald-400 font-mono">{formatCurrencyUSD(ledger.paidRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Outstanding</p>
                  <p className={cn(
                    "text-lg font-bold font-mono",
                    ledger.outstandingRevenue > 0.01 ? "text-amber-400" : "text-gray-400"
                  )}>
                    {formatCurrencyUSD(ledger.outstandingRevenue)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Invoices</p>
                  <p className="text-lg font-bold text-white">
                    {ledger.invoiceCount}
                    {ledger.draftCount > 0 && (
                      <span className="text-xs text-gray-500 font-normal ml-1">+{ledger.draftCount} draft</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Billing progress bar */}
              {ledger.projectedRevenue > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Billing Progress</span>
                    <span>{(ledger.reconciliation.billingRatio || 0).toFixed(0)}% billed</span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-gray-700">
                    <div className="bg-emerald-600" style={{ width: `${Math.min(100, (ledger.paidRevenue / ledger.projectedRevenue) * 100)}%` }} title="Paid" />
                    <div className="bg-blue-600" style={{ width: `${Math.min(100, (ledger.outstandingRevenue / ledger.projectedRevenue) * 100)}%` }} title="Outstanding" />
                  </div>
                  <div className="flex gap-3 mt-1">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-600" />
                      <span className="text-[10px] text-gray-500">Paid</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-blue-600" />
                      <span className="text-[10px] text-gray-500">Outstanding</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-gray-700" />
                      <span className="text-[10px] text-gray-500">Unbilled</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Install Progress */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Installation Progress</h4>
            <div className="bg-gray-800/50 p-3 rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">
                  {metrics.byStatus.installed} of {metrics.totalCommitments} items installed
                </span>
                <span className="text-sm text-white font-bold">{metrics.installPct}%</span>
              </div>
              <Progress value={metrics.installPct} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}