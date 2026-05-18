import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle, ChevronDown, ChevronUp, Truck,
  TrendingUp, Info, ShieldAlert, Package, CheckCircle2,
  Receipt, Clock, Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { deriveServiceFinancials } from "@/components/supply/deriveServiceFinancials";

const DEFS = {
  projected: "Planned Billable − Planned Cost (best case if all services complete as estimated)",
  realized: "Realized Billable − Actual Cost (current financial truth from completed/billed work)",
  actualCost: "Cost of completed + billed services ONLY — not estimates or ordered commitments",
  committed: "Ordered services — vendor engaged but work not yet done (ordered exposure)",
  plannedExp: "Planned-only services — no vendor engagement yet (uncommitted risk)",
  orderedExp: "Vendor committed, awaiting completion (future liability)",
  uninvoicedActuals: "Completed services not yet billed to client (accounting risk)",
  pendingVendor: "Ordered vendor services awaiting completion",
  unbilledSpend: "Actual cost not yet covered by client billing (accounting risk)",
  unrealized: "Projected margin not yet realized — project is incomplete, NOT a loss",
  futureLiability: "Money likely owed to vendors (ordered services)",
  opRisk: "Services not yet ordered — unresolved procurement gap",
  acctRisk: "Actual cost not yet covered by client billing",
};

function Tip({ id, children }) {
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

function Line({ label, value, color = "text-gray-300", bold = false, tipId, isCurrency = true }) {
  const labelEl = tipId
    ? <Tip id={tipId}><span className="text-[10px] text-gray-500">{label}</span></Tip>
    : <span className="text-[10px] text-gray-500">{label}</span>;
  return (
    <div className="flex items-center justify-between">
      {labelEl}
      <span className={cn("font-mono", bold ? "text-sm font-bold" : "text-xs", color)}>
        {isCurrency ? formatCurrencyUSD(value) : value}
      </span>
    </div>
  );
}

const STATUS_STYLE = {
  planned: { bg: "bg-gray-700/60", text: "text-gray-300", icon: Clock },
  ordered: { bg: "bg-purple-900/40", text: "text-purple-300", icon: Package },
  completed: { bg: "bg-blue-900/40", text: "text-blue-300", icon: CheckCircle2 },
  billed: { bg: "bg-green-900/40", text: "text-green-300", icon: Receipt },
};

function StatusPill({ status, count }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.planned;
  const Icon = s.icon;
  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg", s.bg)}>
      <Icon className={cn("w-4 h-4", s.text)} />
      <div>
        <p className={cn("text-lg font-bold", s.text)}>{count}</p>
        <p className="text-[10px] text-gray-500 capitalize">{status}</p>
      </div>
    </div>
  );
}

export default function ServicesDashboardSummary({ commitments }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const fin = useMemo(() => deriveServiceFinancials(commitments), [commitments]);

  const projColor = fin.margin.projectedMargin >= 0 ? "text-emerald-400" : "text-red-400";
  const realColor = fin.margin.realizedMargin >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="space-y-3">
      {/* ROW 1 — Lifecycle Counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-center">
          <p className="text-2xl font-bold text-white">{fin.counts.total}</p>
          <p className="text-[10px] text-gray-500">Total Services</p>
        </div>
        <StatusPill status="planned" count={fin.counts.planned} />
        <StatusPill status="ordered" count={fin.counts.ordered} />
        <StatusPill status="completed" count={fin.counts.completed} />
        <StatusPill status="billed" count={fin.counts.billed} />
      </div>

      {/* ROW 2 — Financials */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-black/40 border-blue-900/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="w-4 h-4 text-blue-400" />
              <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold">Revenue</p>
            </div>
            <div className="space-y-1.5">
              <Line label="Projected Revenue" value={fin.revenue.plannedBillable} color="text-white" bold tipId="projected" />
              <Line label="Realized Revenue" value={fin.revenue.realizedBillable} color="text-blue-400" />
              {fin.revenue.unrealizedBillable > 0 && (
                <Line label="Unrealized" value={fin.revenue.unrealizedBillable} color="text-gray-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-4 h-4 text-amber-400" />
              <p className="text-[10px] text-amber-400 uppercase tracking-widest font-semibold">Costs</p>
            </div>
            <div className="space-y-1.5">
              <Line label="Planned Cost" value={fin.costs.plannedCost} color="text-gray-300" />
              <Line label="Ordered (Committed)" value={fin.exposure.ordered} color="text-purple-400" tipId="committed" />
              <div className="border-t border-gray-800 pt-1">
                <Line label="Actual Spend" value={fin.costs.actualCost} color="text-white" bold tipId="actualCost" />
              </div>
              {fin.exposure.planned > 0 && (
                <Line label="Uncommitted (Planned)" value={fin.exposure.planned} color="text-amber-400" tipId="plannedExp" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={cn("bg-black/40", fin.margin.projectedMargin >= 0 ? "border-emerald-900/40" : "border-red-900/40")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-semibold">Margin</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Tip id="projected"><span className="text-[10px] text-gray-500">Projected</span></Tip>
                <span className="flex items-center gap-1.5">
                  <span className={cn("text-sm font-bold font-mono", projColor)}>{formatCurrencyUSD(fin.margin.projectedMargin)}</span>
                  <Badge variant="outline" className={cn("text-[8px] px-1 py-0 border-gray-700", projColor)}>
                    {fin.margin.projectedMarginPct.toFixed(0)}%
                  </Badge>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <Tip id="realized"><span className="text-[10px] text-gray-500">Realized</span></Tip>
                <span className="flex items-center gap-1.5">
                  <span className={cn("text-xs font-mono", realColor)}>{formatCurrencyUSD(fin.margin.realizedMargin)}</span>
                  <Badge variant="outline" className={cn("text-[8px] px-1 py-0 border-gray-700", realColor)}>
                    {fin.margin.realizedMarginPct.toFixed(0)}%
                  </Badge>
                </span>
              </div>
              {fin.margin.unrealizedMarginRemaining > 0 && (
                <div className="border-t border-gray-800 pt-1">
                  <Line label="Unrealized Margin Remaining" value={fin.margin.unrealizedMarginRemaining} color="text-gray-400" tipId="unrealized" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROW 3 — Exposure & Liability */}
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
                  <Line label="Planned (Uncommitted)" value={fin.exposure.planned} color="text-gray-400" tipId="plannedExp" />
                )}
                {fin.exposure.ordered > 0 && (
                  <Line label="Ordered (Committed)" value={fin.exposure.ordered} color="text-purple-400" tipId="orderedExp" />
                )}
                {fin.exposure.uninvoicedActuals > 0 && (
                  <Line label="Uninvoiced Actuals" value={fin.exposure.uninvoicedActuals} color="text-red-400" tipId="uninvoicedActuals" />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-[9px] text-gray-600 uppercase tracking-wider">Risk Classification</p>
                {fin.risk.operational.total > 0 && (
                  <Line label="Operational Risk" value={fin.risk.operational.total} color="text-amber-400" tipId="opRisk" />
                )}
                {fin.risk.accounting.total > 0 && (
                  <Line label="Accounting Risk" value={fin.risk.accounting.total} color="text-red-400" tipId="acctRisk" />
                )}
                {fin.liability.futureLiability > 0 && (
                  <Line label="Future Liability" value={fin.liability.futureLiability} color="text-orange-400" tipId="futureLiability" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ROW 4 — Cost Split */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MiniCard label="Vendor Cost" value={fin.costs.vendorCostAll} color="text-purple-400" />
        <MiniCard label="Internal Cost" value={fin.costs.internalCostAll} color="text-amber-400" />
        {fin.exposure.ordered > 0 && (
          <MiniCard label="Pending Vendor" value={fin.exposure.ordered} color="text-orange-400" tipId="pendingVendor" />
        )}
        {fin.risk.accounting.unbilledCompleted > 0 && (
          <MiniCard label="Unbilled Completed" value={fin.risk.accounting.unbilledCompleted} color="text-red-400" tipId="uninvoicedActuals" />
        )}
      </div>

      {/* ACCOUNTING RISK BANNER */}
      {fin.risk.accounting.total > 0 && fin.costs.actualCost > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <Tip id="acctRisk"><p className="text-sm font-semibold text-amber-300">Accounting Risk</p></Tip>
            <p className="text-xs text-amber-400/80">
              Spent {formatCurrencyUSD(fin.costs.actualCost)} on completed work but billable covers only {formatCurrencyUSD(fin.revenue.realizedBillable)} →{' '}
              <span className="font-bold text-amber-300">{formatCurrencyUSD(fin.risk.accounting.total)} unbilled</span>
              {fin.risk.operational.total > 0 && (
                <span className="text-gray-500"> + {formatCurrencyUSD(fin.risk.operational.total)} uncommitted</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* WARNINGS */}
      {fin.margin.negativeMarginCount > 0 && (
        <div className="flex items-center gap-3 p-2 bg-red-900/20 border border-red-700/30 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-400">{fin.margin.negativeMarginCount} service(s) have negative margin — cost exceeds billable</p>
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
              <p className="text-[10px] text-amber-400 uppercase tracking-widest font-semibold mb-2">Service Cost Waterfall (Mutually Exclusive)</p>
              <WaterfallBar
                segments={[
                  { label: 'Billed', value: fin.lifecycle.billedValue, color: 'bg-green-600' },
                  { label: 'Completed', value: fin.lifecycle.completedValue, color: 'bg-blue-600' },
                  { label: 'Ordered', value: fin.lifecycle.orderedValue, color: 'bg-purple-600' },
                  { label: 'Planned', value: fin.lifecycle.plannedValue, color: 'bg-gray-600' },
                ]}
                total={fin.costs.plannedCost}
              />
            </div>

            {/* Financial Truth Table */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Financial Truth Table</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] font-mono">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-1 pr-4">State</th>
                      <th className="text-right py-1 px-2">Cost</th>
                      <th className="text-right py-1 px-2">Billable</th>
                      <th className="text-right py-1 px-2">Fin. Status</th>
                      <th className="text-right py-1 pl-2">Exposure Type</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-400">
                    <tr className="border-b border-gray-800/50">
                      <td className="py-1 pr-4 text-gray-300">Planned</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.costs.costPlanned)}</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.lifecycle.plannedValue > 0 ? (fin.revenue.plannedBillable * fin.costs.costPlanned / fin.costs.plannedCost) : 0)}</td>
                      <td className="text-right py-1 px-2 text-gray-500">Estimate</td>
                      <td className="text-right py-1 pl-2 text-amber-400">Planned</td>
                    </tr>
                    <tr className="border-b border-gray-800/50">
                      <td className="py-1 pr-4 text-purple-300">Ordered</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.costs.costOrdered)}</td>
                      <td className="text-right py-1 px-2">—</td>
                      <td className="text-right py-1 px-2 text-purple-400">Committed</td>
                      <td className="text-right py-1 pl-2 text-orange-400">Ordered</td>
                    </tr>
                    <tr className="border-b border-gray-800/50">
                      <td className="py-1 pr-4 text-blue-300">Completed</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.costs.costCompleted)}</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.costs.costCompleted > 0 ? (fin.revenue.realizedBillable * fin.costs.costCompleted / (fin.costs.costCompleted + fin.costs.costBilled || 1)) : 0)}</td>
                      <td className="text-right py-1 px-2 text-cyan-400">Actualized</td>
                      <td className="text-right py-1 pl-2 text-red-400">Uninvoiced</td>
                    </tr>
                    <tr className="border-b border-gray-800/50">
                      <td className="py-1 pr-4 text-green-300">Billed</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.costs.costBilled)}</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.costs.costBilled > 0 ? (fin.revenue.realizedBillable * fin.costs.costBilled / (fin.costs.costCompleted + fin.costs.costBilled || 1)) : 0)}</td>
                      <td className="text-right py-1 px-2 text-green-400">Closed</td>
                      <td className="text-right py-1 pl-2 text-gray-600">None</td>
                    </tr>
                    <tr className="font-semibold text-white">
                      <td className="py-1 pr-4 border-t border-gray-700">Total</td>
                      <td className="text-right py-1 px-2 border-t border-gray-700">{formatCurrencyUSD(fin.costs.plannedCost)}</td>
                      <td className="text-right py-1 px-2 border-t border-gray-700">{formatCurrencyUSD(fin.revenue.plannedBillable)}</td>
                      <td className="text-right py-1 px-2 border-t border-gray-700">—</td>
                      <td className="text-right py-1 pl-2 border-t border-gray-700">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reconciliation */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Reconciliation (Bucket Exclusivity)</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                <span className="text-gray-500">Actual Spend</span>
                <span className="text-gray-300 text-right">{formatCurrencyUSD(fin.costs.actualCost)}</span>
                <span className="text-gray-500">+ Ordered Exposure</span>
                <span className="text-purple-400 text-right">{formatCurrencyUSD(fin.exposure.ordered)}</span>
                <span className="text-gray-500">+ Planned Exposure</span>
                <span className="text-amber-400 text-right">{formatCurrencyUSD(fin.exposure.planned)}</span>
                <span className="text-gray-500 font-semibold border-t border-gray-800 pt-1">= Total Planned Cost</span>
                <span className="text-white text-right font-semibold border-t border-gray-800 pt-1">{formatCurrencyUSD(fin.costs.plannedCost)}</span>
                {fin._reconciliation.totalBucketCheck > 0.01 && (
                  <>
                    <span className="text-red-500 mt-1">⚠ Drift</span>
                    <span className="text-red-400 text-right mt-1">{formatCurrencyUSD(fin._reconciliation.totalBucketCheck)}</span>
                  </>
                )}
                <span className="text-gray-500 mt-2">Vendor Actual</span>
                <span className="text-purple-400 text-right mt-2">{formatCurrencyUSD(fin.costs.vendorCostActual)}</span>
                <span className="text-gray-500">+ Internal Actual</span>
                <span className="text-amber-400 text-right">{formatCurrencyUSD(fin.costs.internalCostActual)}</span>
                <span className="text-gray-500 font-semibold border-t border-gray-800 pt-1">= Actual Spend</span>
                <span className="text-white text-right font-semibold border-t border-gray-800 pt-1">{formatCurrencyUSD(fin.costs.actualCost)}</span>
                <span className="text-gray-500 mt-2">Projected Revenue</span>
                <span className="text-blue-400 text-right mt-2">{formatCurrencyUSD(fin.revenue.plannedBillable)}</span>
                <span className="text-gray-500">− Planned Cost</span>
                <span className="text-gray-300 text-right">{formatCurrencyUSD(fin.costs.plannedCost)}</span>
                <span className="text-gray-500 font-semibold border-t border-gray-800 pt-1">= Projected Margin</span>
                <span className={cn("text-right font-semibold border-t border-gray-800 pt-1", projColor)}>{formatCurrencyUSD(fin.margin.projectedMargin)}</span>
              </div>
            </div>

            {fin.warnings.length > 0 && (
              <div>
                <p className="text-[10px] text-red-400 uppercase tracking-widest font-semibold mb-2">Integrity Warnings</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {fin.warnings.map((w, i) => (
                    <p key={i} className={cn("text-xs", w.level === 'warn' ? "text-amber-400" : "text-gray-500")}>• {w.msg}</p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MiniCard({ label, value, color, tipId }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
      {tipId ? (
        <Tip id={tipId}><p className="text-[10px] text-gray-500">{label}</p></Tip>
      ) : (
        <p className="text-[10px] text-gray-500">{label}</p>
      )}
      <p className={cn("text-lg font-bold font-mono", color)}>{formatCurrencyUSD(value)}</p>
    </div>
  );
}

function WaterfallBar({ segments, total }) {
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