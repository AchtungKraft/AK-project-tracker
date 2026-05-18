import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, ChevronDown, ChevronUp, Truck,
  Package, Receipt, TrendingUp, Info, ShieldAlert, Target
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { deriveProjectFinancials, validateProjectFinancials } from "@/components/supply/deriveProjectFinancials";
import { normalizePartCommitments } from "@/components/supply/resolveFinancialSource";

const DEFS = {
  plannedRevenue: "Total expected revenue from parts retail + services billable",
  invoiced: "Amount billed to client via invoices (accrual = realized revenue)",
  paid: "Cash received from client",
  outstanding: "Invoiced but not yet paid",
  remainingToBill: "Planned revenue not yet invoiced",
  partsPlanned: "Total planned cost for all part commitments",
  partsOnPO: "Parts on active POs — committed to vendor, awaiting delivery",
  partsReceived: "Parts received into inventory — cost realized, not yet installed",
  partsInstalled: "Installed parts — operational complete, no additional financial impact",
  partsUnordered: "No PO yet — uncommitted procurement gap (operational risk)",
  servicesPlanned: "Total planned cost of non-inventory services",
  svcOrdered: "Vendor committed, awaiting completion (ordered exposure)",
  servicesActual: "Completed/billed — work done, cost realized",
  svcPlannedOnly: "No vendor engagement yet (planned exposure)",
  projectedMargin: "Planned Revenue − Planned Cost (if everything completes as planned)",
  realizedMargin: "Invoiced Revenue − Actual Spend (current financial truth)",
  unrealized: "Projected margin not yet realized — project is incomplete, NOT a loss",
  plannedExposure: "Estimated cost with no commitment — can still change",
  orderedExposure: "PO/vendor order exists — committed, awaiting delivery/completion",
  uninvoicedActuals: "Cost already realized but not yet billed to client",
  futureLiability: "Money likely owed to vendors (ordered exposure)",
  opRisk: "Items not yet ordered — unresolved procurement gap",
  acctRisk: "Actual cost not yet billed to client — accounting exposure",
};

function DefTip({ id, children }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help">
            {children}
            <Info className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs">{DEFS[id] || id}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MetricRow({ label, value, color = "text-gray-300", bold = false, defId, indent = false }) {
  const labelEl = defId
    ? <DefTip id={defId}><span className={cn("text-[10px] text-gray-500", indent && "pl-3")}>{label}</span></DefTip>
    : <span className={cn("text-[10px] text-gray-500", indent && "pl-3")}>{label}</span>;
  return (
    <div className="flex items-center justify-between">
      {labelEl}
      <span className={cn("font-mono", bold ? "text-sm font-bold" : "text-xs", color)}>
        {formatCurrencyUSD(value)}
      </span>
    </div>
  );
}

export default function PSMFinancialSummary({ enrichedCommitments, metrics, servicesSummary }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  // CANONICAL: Normalize source values before derivation (fallback chains, provenance)
  const { items: normalizedCommitments, sourceWarnings, stats: sourceStats } = useMemo(
    () => normalizePartCommitments(enrichedCommitments),
    [enrichedCommitments]
  );

  const fin = useMemo(
    () => deriveProjectFinancials({ enrichedCommitments: normalizedCommitments, metrics, servicesSummary }),
    [normalizedCommitments, metrics, servicesSummary]
  );
  const warnings = useMemo(() => validateProjectFinancials(fin), [fin]);

  const noScope = enrichedCommitments.length === 0 && fin.revenue.invoiced > 0;
  const hasServices = fin.services.plannedCost > 0;
  const projColor = fin.totals.projectedMargin >= 0 ? "text-emerald-400" : "text-red-400";
  const realColor = fin.totals.realizedMargin >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="space-y-3">
      {noScope && (
        <div className="flex items-center gap-3 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <p className="text-sm text-blue-300">Historical billing exists but no active planned scope.</p>
        </div>
      )}

      {/* ROW 1: REVENUE + MARGIN */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="bg-black/40 border-blue-900/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="w-4 h-4 text-blue-400" />
              <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold">Revenue & Billing</p>
            </div>
            <div className="space-y-1.5">
              <MetricRow label="Planned Revenue" value={fin.revenue.planned} color="text-white" bold defId="plannedRevenue" />
              <MetricRow label="Invoiced (Realized)" value={fin.revenue.invoiced} color="text-blue-400" defId="invoiced" />
              <MetricRow label="Paid" value={fin.revenue.paid} color="text-emerald-400" defId="paid" />
              <MetricRow label="Outstanding" value={fin.revenue.outstanding} color={fin.revenue.outstanding > 0 ? "text-amber-400" : "text-gray-500"} defId="outstanding" />
              <div className="border-t border-gray-800 pt-1">
                <MetricRow label="Remaining to Bill" value={fin.revenue.remainingToBill} color="text-white" defId="remainingToBill" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("bg-black/40", fin.totals.projectedMargin >= 0 ? "border-emerald-900/40" : "border-red-900/40")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-semibold">Project Margin</p>
            </div>
            <div className="space-y-1.5">
              <MetricRow label="Projected Margin" value={fin.totals.projectedMargin} color={projColor} bold defId="projectedMargin" />
              <MetricRow label="Realized Margin" value={fin.totals.realizedMargin} color={realColor} defId="realizedMargin" />
              <div className="border-t border-gray-800 pt-1">
                <MetricRow label="Unrealized Margin Remaining" value={fin.totals.unrealizedMarginRemaining} color="text-gray-400" defId="unrealized" />
              </div>
              <MetricRow label="Revenue Remaining" value={fin.totals.revenueRemaining} color="text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROW 2: PARTS + SERVICES */}
      <div className={cn("grid gap-3", hasServices ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-purple-400" />
              <p className="text-[10px] text-purple-400 uppercase tracking-widest font-semibold">Parts (Inventory)</p>
              <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-gray-700 text-gray-500 ml-auto">
                {fin.parts.commitmentCount} items
              </Badge>
            </div>
            <div className="space-y-1.5">
              <MetricRow label="Planned Cost" value={fin.parts.plannedCost} color="text-gray-300" defId="partsPlanned" />
              <MetricRow label="On PO (Ordered)" value={fin.parts.costOnPO} color="text-purple-400" defId="partsOnPO" />
              <MetricRow label="Received" value={fin.parts.costReceived} color="text-cyan-400" defId="partsReceived" />
              <MetricRow label="Installed" value={fin.parts.costInstalled} color="text-emerald-400" defId="partsInstalled" />
              <div className="border-t border-gray-800 pt-1">
                <MetricRow label="Actual Spend" value={fin.parts.actualSpend} color="text-white" bold />
              </div>
              {fin.parts.costUnordered > 0 && (
                <MetricRow label="Unordered (Exposure)" value={fin.parts.costUnordered} color="text-amber-400" defId="partsUnordered" />
              )}
            </div>
          </CardContent>
        </Card>

        {hasServices && (
          <Card className="bg-black/40 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Truck className="w-4 h-4 text-amber-400" />
                <p className="text-[10px] text-amber-400 uppercase tracking-widest font-semibold">Services (Non-Inventory)</p>
                <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-gray-700 text-gray-500 ml-auto">
                  {fin.services.totalCount} items
                </Badge>
              </div>
              <div className="space-y-1.5">
                <MetricRow label="Planned Cost" value={fin.services.plannedCost} color="text-gray-300" defId="servicesPlanned" />
                <MetricRow label="Ordered (Committed)" value={fin.services.costOrdered} color="text-purple-400" defId="svcOrdered" />
                <MetricRow label="Billable Revenue" value={fin.services.billable} color="text-blue-400" />
                <div className="border-t border-gray-800 pt-1">
                  <MetricRow label="Actual Spend" value={fin.services.actualCost} color="text-white" bold defId="servicesActual" />
                </div>
                {fin.services.costPlannedOnly > 0 && (
                  <MetricRow label="Uncommitted (Exposure)" value={fin.services.costPlannedOnly} color="text-amber-400" defId="svcPlannedOnly" />
                )}
                {fin.services.totalCount > 0 && (
                  <div className="flex items-center gap-2 pt-1 text-[9px] text-gray-600">
                    {fin.services.byStatus.planned > 0 && <span>Planned: {fin.services.byStatus.planned}</span>}
                    {fin.services.byStatus.ordered > 0 && <span>Ordered: {fin.services.byStatus.ordered}</span>}
                    {fin.services.byStatus.completed > 0 && <span>Done: {fin.services.byStatus.completed}</span>}
                    {fin.services.byStatus.billed > 0 && <span>Billed: {fin.services.byStatus.billed}</span>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ROW 3: EXPOSURE + LIABILITY + RISK */}
      {(fin.exposure.planned > 0 || fin.exposure.ordered > 0 || fin.exposure.uninvoicedActuals > 0) && (
        <Card className="bg-black/40 border-amber-900/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-amber-400" />
              <p className="text-[10px] text-amber-400 uppercase tracking-widest font-semibold">Exposure & Liability</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
              <div className="space-y-1.5">
                <p className="text-[9px] text-gray-600 uppercase tracking-wider">Exposure Buckets</p>
                {fin.exposure.planned > 0 && (
                  <MetricRow label="Planned (Uncommitted)" value={fin.exposure.planned} color="text-gray-400" defId="plannedExposure" />
                )}
                {fin.exposure.ordered > 0 && (
                  <MetricRow label="Ordered (Committed)" value={fin.exposure.ordered} color="text-purple-400" defId="orderedExposure" />
                )}
                {fin.exposure.uninvoicedActuals > 0 && (
                  <MetricRow label="Uninvoiced Actuals" value={fin.exposure.uninvoicedActuals} color="text-red-400" defId="uninvoicedActuals" />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-[9px] text-gray-600 uppercase tracking-wider">Risk Classification</p>
                {fin.risk.operational.total > 0 && (
                  <MetricRow label="Operational Risk" value={fin.risk.operational.total} color="text-amber-400" defId="opRisk" />
                )}
                {fin.risk.accounting.total > 0 && (
                  <MetricRow label="Accounting Risk" value={fin.risk.accounting.total} color="text-red-400" defId="acctRisk" />
                )}
                {fin.liability.futureLiability > 0 && (
                  <MetricRow label="Future Liability" value={fin.liability.futureLiability} color="text-orange-400" defId="futureLiability" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ACCOUNTING RISK BANNER */}
      {fin.risk.accounting.total > 0 && fin.totals.actualSpend > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <DefTip id="acctRisk"><p className="text-sm font-semibold text-amber-300">Accounting Risk</p></DefTip>
            <p className="text-xs text-amber-400/80">
              Spent {formatCurrencyUSD(fin.totals.actualSpend)} but invoiced only {formatCurrencyUSD(fin.revenue.invoiced)} →{' '}
              <span className="font-bold text-amber-300">{formatCurrencyUSD(fin.risk.accounting.total)} unbilled</span>
              {fin.risk.operational.total > 0 && (
                <span className="text-gray-500"> + {formatCurrencyUSD(fin.risk.operational.total)} unordered</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* SOURCE DATA WARNINGS */}
      {(sourceStats.missingCostCount > 0 || sourceStats.fallbackCostCount > 0) && (
        <div className="flex items-start gap-3 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {sourceStats.missingCostCount > 0 && (
              <p className="text-xs text-yellow-400">{sourceStats.missingCostCount} of {sourceStats.total} items have no cost data — showing as $0</p>
            )}
            {sourceStats.fallbackCostCount > 0 && (
              <p className="text-xs text-yellow-400">{sourceStats.fallbackCostCount} item(s) used actual cost as planned cost fallback</p>
            )}
            {sourceStats.missingRetailCount > 0 && (
              <p className="text-xs text-gray-500">{sourceStats.missingRetailCount} item(s) have no retail/revenue data</p>
            )}
          </div>
        </div>
      )}

      {/* WARNINGS */}
      {warnings.filter(w => w.level === 'error' || w.level === 'warn').length > 0 && (
        <div className="flex items-start gap-3 p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            {warnings.filter(w => w.level !== 'info').map((w, i) => (
              <p key={i} className={cn("text-xs", w.level === 'error' ? "text-red-400" : "text-amber-400")}>{w.msg}</p>
            ))}
          </div>
        </div>
      )}

      {/* EXPANDABLE BREAKDOWN */}
      <Button variant="ghost" size="sm" onClick={() => setShowBreakdown(!showBreakdown)} className="text-gray-500 hover:text-gray-300 text-xs gap-1.5 h-7">
        {showBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showBreakdown ? 'Hide' : 'Show'} Financial Breakdown
      </Button>

      {showBreakdown && (
        <Card className="bg-black/30 border-gray-800">
          <CardContent className="p-4 space-y-4">
            <div>
              <p className="text-[10px] text-purple-400 uppercase tracking-widest font-semibold mb-2">Parts Cost Waterfall (Mutually Exclusive)</p>
              <FinancialBar
                segments={[
                  { label: 'Installed', value: fin.parts.costInstalled, color: 'bg-emerald-600' },
                  { label: 'Received', value: fin.parts.costReceived, color: 'bg-cyan-600' },
                  { label: 'On PO', value: fin.parts.costOnPO, color: 'bg-purple-600' },
                  { label: 'Unordered', value: fin.parts.costUnordered, color: 'bg-gray-600' },
                ]}
                total={fin.parts.plannedCost}
              />
            </div>

            {hasServices && (
              <div>
                <p className="text-[10px] text-amber-400 uppercase tracking-widest font-semibold mb-2">Services Cost Waterfall (Mutually Exclusive)</p>
                <FinancialBar
                  segments={[
                    { label: 'Billed', value: fin.services.costBilled, color: 'bg-green-600' },
                    { label: 'Completed', value: fin.services.costCompleted, color: 'bg-blue-600' },
                    { label: 'Ordered', value: fin.services.costOrdered, color: 'bg-purple-600' },
                    { label: 'Planned', value: fin.services.costPlannedOnly, color: 'bg-gray-600' },
                  ]}
                  total={fin.services.plannedCost}
                />
              </div>
            )}

            {/* Financial Truth Table */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Financial Truth Table</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] font-mono">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-1 pr-4">Category</th>
                      <th className="text-right py-1 px-2">Planned</th>
                      <th className="text-right py-1 px-2">Ordered</th>
                      <th className="text-right py-1 px-2">Actual</th>
                      <th className="text-right py-1 px-2">Exposure</th>
                      <th className="text-right py-1 pl-2">Liability</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-400">
                    <tr className="border-b border-gray-800/50">
                      <td className="py-1 pr-4 text-purple-400">Parts</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.parts.plannedCost)}</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.parts.costOnPO)}</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.parts.actualSpend)}</td>
                      <td className="text-right py-1 px-2 text-amber-400">{formatCurrencyUSD(fin.parts.costUnordered)}</td>
                      <td className="text-right py-1 pl-2 text-orange-400">{formatCurrencyUSD(fin.parts.costOnPO)}</td>
                    </tr>
                    <tr className="border-b border-gray-800/50">
                      <td className="py-1 pr-4 text-amber-400">Services</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.services.plannedCost)}</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.services.costOrdered)}</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.services.actualCost)}</td>
                      <td className="text-right py-1 px-2 text-amber-400">{formatCurrencyUSD(fin.services.costPlannedOnly)}</td>
                      <td className="text-right py-1 pl-2 text-orange-400">{formatCurrencyUSD(fin.services.costOrdered)}</td>
                    </tr>
                    <tr className="font-semibold text-white">
                      <td className="py-1 pr-4 border-t border-gray-700">Total</td>
                      <td className="text-right py-1 px-2 border-t border-gray-700">{formatCurrencyUSD(fin.totals.plannedCost)}</td>
                      <td className="text-right py-1 px-2 border-t border-gray-700">{formatCurrencyUSD(fin.exposure.ordered)}</td>
                      <td className="text-right py-1 px-2 border-t border-gray-700">{formatCurrencyUSD(fin.totals.actualSpend)}</td>
                      <td className="text-right py-1 px-2 border-t border-gray-700 text-amber-400">{formatCurrencyUSD(fin.exposure.planned)}</td>
                      <td className="text-right py-1 pl-2 border-t border-gray-700 text-orange-400">{formatCurrencyUSD(fin.liability.futureLiability)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Revenue Reconciliation */}
            {fin._reconciliation?.revenue && (
              <div>
                <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold mb-2">Revenue Reconciliation</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                  <span className="text-gray-500">Parts Revenue (row-level)</span>
                  <span className="text-gray-300 text-right">{formatCurrencyUSD(fin._reconciliation.revenue.partsRevenueLocal)}</span>
                  <span className="text-gray-500">+ Services Revenue</span>
                  <span className="text-amber-400 text-right">{formatCurrencyUSD(fin._reconciliation.revenue.servicesRevenueLocal)}</span>
                  <span className="text-gray-500 font-semibold border-t border-gray-800 pt-1">= Total Planned Revenue</span>
                  <span className="text-white text-right font-semibold border-t border-gray-800 pt-1">{formatCurrencyUSD(fin._reconciliation.revenue.totalRevenueLocal)}</span>
                  <span className="text-gray-600 mt-2">Backend Total (parts+svc)</span>
                  <span className="text-gray-500 text-right mt-2">{formatCurrencyUSD(fin._reconciliation.revenue.backendTotalPlannedRetail)}</span>
                  <span className="text-gray-600">Backend Parts Only</span>
                  <span className="text-gray-500 text-right">{formatCurrencyUSD(fin._reconciliation.revenue.backendPartsRetail)}</span>
                  <span className="text-gray-600">Backend Services Only</span>
                  <span className="text-gray-500 text-right">{formatCurrencyUSD(fin._reconciliation.revenue.backendServicesRetail)}</span>
                  {fin._reconciliation.revenue.totalRevenueDrift > 1 && (
                    <>
                      <span className={fin._reconciliation.revenue.doubleCountDetected ? "text-red-500 mt-1" : "text-amber-500 mt-1"}>
                        {fin._reconciliation.revenue.doubleCountDetected ? '🚨 Double-Count' : '⚠ Revenue Drift'}
                      </span>
                      <span className={cn("text-right mt-1", fin._reconciliation.revenue.doubleCountDetected ? "text-red-400" : "text-amber-400")}>
                        {formatCurrencyUSD(fin._reconciliation.revenue.totalRevenueDrift)}
                      </span>
                    </>
                  )}
                  {fin._reconciliation.revenue.totalRevenueDrift <= 1 && (
                    <>
                      <span className="text-emerald-600 mt-1">✅ No Double-Count</span>
                      <span className="text-emerald-600 text-right mt-1">Match</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Cost Reconciliation */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Cost Reconciliation (Bucket Exclusivity)</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                <span className="text-gray-500">Actual Spend</span>
                <span className="text-gray-300 text-right">{formatCurrencyUSD(fin.totals.actualSpend)}</span>
                <span className="text-gray-500">+ Ordered Exposure</span>
                <span className="text-purple-400 text-right">{formatCurrencyUSD(fin.exposure.ordered)}</span>
                <span className="text-gray-500">+ Planned Exposure</span>
                <span className="text-amber-400 text-right">{formatCurrencyUSD(fin.exposure.planned)}</span>
                <span className="text-gray-500 font-semibold border-t border-gray-800 pt-1">= Total Planned Cost</span>
                <span className="text-white text-right font-semibold border-t border-gray-800 pt-1">{formatCurrencyUSD(fin.totals.plannedCost)}</span>
                {fin._reconciliation.totalBucketCheck > 0.01 && (
                  <>
                    <span className="text-red-500 mt-1">⚠ Drift</span>
                    <span className="text-red-400 text-right mt-1">{formatCurrencyUSD(fin._reconciliation.totalBucketCheck)}</span>
                  </>
                )}
                <span className="text-gray-500 mt-2">Planned Revenue</span>
                <span className="text-blue-400 text-right mt-2">{formatCurrencyUSD(fin.revenue.planned)}</span>
                <span className="text-gray-500">− Planned Cost</span>
                <span className="text-gray-300 text-right">{formatCurrencyUSD(fin.totals.plannedCost)}</span>
                <span className="text-gray-500 font-semibold border-t border-gray-800 pt-1">= Projected Margin</span>
                <span className={cn("text-right font-semibold border-t border-gray-800 pt-1", projColor)}>{formatCurrencyUSD(fin.totals.projectedMargin)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FinancialBar({ segments, total }) {
  if (total <= 0) return <p className="text-xs text-gray-600 italic">No cost data</p>;
  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden bg-gray-800">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div key={i} className={cn(seg.color, "transition-all")} style={{ width: `${Math.max(1, (seg.value / total) * 100)}%` }} title={`${seg.label}: ${formatCurrencyUSD(seg.value)}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-1.5">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={cn("w-2 h-2 rounded-full", seg.color)} />
            <span className="text-[10px] text-gray-500">{seg.label}</span>
            <span className="text-[10px] text-gray-400 font-mono">{formatCurrencyUSD(seg.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}