import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, ChevronDown, ChevronUp, Truck,
  DollarSign, Package, Receipt, TrendingUp, Info,
  ShieldAlert
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { deriveProjectFinancials, validateProjectFinancials } from "@/components/supply/deriveProjectFinancials";

// ═══════════════════════════════════════════════════════════════
// TOOLTIP DEFINITIONS
// ═══════════════════════════════════════════════════════════════
const DEFINITIONS = {
  plannedRevenue: "Total expected revenue from parts retail + services billable",
  invoiced: "Amount billed to client via project invoices",
  paid: "Amount received from client",
  outstanding: "Invoiced but not yet paid",
  remainingToBill: "Planned revenue minus invoiced amount",
  partsPlanned: "Total cost of all planned part commitments (qty × unit cost)",
  partsOrdered: "Cost of parts with active purchase orders",
  partsReceived: "Cost of parts received into inventory and reserved",
  partsInstalled: "Cost of parts physically installed on the project",
  partsExposure: "Planned cost not yet secured by a purchase order",
  servicesPlanned: "Total planned cost of non-inventory services",
  servicesActual: "Cost of services that are ordered, completed, or billed",
  servicesExposure: "Planned service cost not yet ordered/committed",
  projectedMargin: "Planned Revenue − Planned Cost (best-case scenario)",
  realizedMargin: "Invoiced Revenue − Actual Spend (current financial truth)",
  costAtRisk: "Money spent or committed but not yet billed to the client",
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
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          {DEFINITIONS[id] || id}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ═══════════════════════════════════════════════════════════════
// METRIC ROW
// ═══════════════════════════════════════════════════════════════
function MetricRow({ label, value, color = "text-gray-300", bold = false, defId }) {
  const labelEl = defId
    ? <DefTip id={defId}><span className="text-[10px] text-gray-500">{label}</span></DefTip>
    : <span className="text-[10px] text-gray-500">{label}</span>;

  return (
    <div className="flex items-center justify-between">
      {labelEl}
      <span className={cn(
        "font-mono",
        bold ? "text-sm font-bold" : "text-xs",
        color
      )}>
        {formatCurrencyUSD(value)}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function PSMFinancialSummary({ enrichedCommitments, metrics, servicesSummary }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  // CANONICAL: All values from single derivation helper
  const fin = useMemo(
    () => deriveProjectFinancials({ enrichedCommitments, metrics, servicesSummary }),
    [enrichedCommitments, metrics, servicesSummary]
  );

  const warnings = useMemo(() => validateProjectFinancials(fin), [fin]);

  const noScope = enrichedCommitments.length === 0 && fin.revenue.invoiced > 0;
  const hasServices = fin.services.plannedCost > 0;
  const marginColor = fin.totals.projectedMargin >= 0 ? "text-emerald-400" : "text-red-400";
  const realizedColor = fin.totals.realizedMargin >= 0 ? "text-emerald-400" : "text-red-400";
  const deltaColor = fin.totals.marginDelta < -0.01 ? "text-red-400" : fin.totals.marginDelta > 0.01 ? "text-emerald-400" : "text-gray-500";

  return (
    <div className="space-y-3">
      {/* Edge case banner */}
      {noScope && (
        <div className="flex items-center gap-3 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <p className="text-sm text-blue-300">Historical billing exists but no active planned scope.</p>
        </div>
      )}

      {/* ═══ ROW 1: REVENUE + BILLING ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="bg-black/40 border-blue-900/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="w-4 h-4 text-blue-400" />
              <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold">Revenue & Billing</p>
            </div>
            <div className="space-y-1.5">
              <MetricRow label="Planned Revenue" value={fin.revenue.planned} color="text-white" bold defId="plannedRevenue" />
              <MetricRow label="Invoiced" value={fin.revenue.invoiced} color="text-blue-400" defId="invoiced" />
              <MetricRow label="Paid" value={fin.revenue.paid} color="text-emerald-400" defId="paid" />
              <MetricRow label="Outstanding" value={fin.revenue.outstanding} color={fin.revenue.outstanding > 0 ? "text-amber-400" : "text-gray-500"} defId="outstanding" />
              <div className="border-t border-gray-800 pt-1">
                <MetricRow label="Remaining to Bill" value={fin.revenue.remainingToBill} color="text-white" defId="remainingToBill" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══ MARGIN + RISK ═══ */}
        <Card className={cn("bg-black/40", fin.totals.projectedMargin >= 0 ? "border-emerald-900/40" : "border-red-900/40")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-semibold">Project Margin</p>
            </div>
            <div className="space-y-1.5">
              <MetricRow label="Projected Margin" value={fin.totals.projectedMargin} color={marginColor} bold defId="projectedMargin" />
              <MetricRow label="Realized Margin" value={fin.totals.realizedMargin} color={realizedColor} defId="realizedMargin" />
              <div className="flex items-center justify-between border-t border-gray-800 pt-1">
                <DefTip id="costAtRisk"><span className="text-[10px] text-gray-500">Margin Delta</span></DefTip>
                <span className={cn("text-xs font-bold font-mono", deltaColor)}>
                  {fin.totals.marginDelta < 0 ? '' : '+'}{formatCurrencyUSD(fin.totals.marginDelta)}
                </span>
              </div>
              <MetricRow label="Revenue Remaining" value={fin.totals.revenueRemaining} color="text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ ROW 2: PARTS + SERVICES SIDE BY SIDE ═══ */}
      <div className={cn("grid gap-3", hasServices ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
        {/* PARTS */}
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
              <MetricRow label="On PO (Ordered)" value={fin.parts.orderedCost} color="text-purple-400" defId="partsOrdered" />
              <MetricRow label="Reserved (Received)" value={fin.parts.receivedCost} color="text-cyan-400" defId="partsReceived" />
              <MetricRow label="Installed" value={fin.parts.installedCost} color="text-emerald-400" defId="partsInstalled" />
              <div className="border-t border-gray-800 pt-1">
                <MetricRow label="Actual Spend" value={fin.parts.actualSpend} color="text-white" bold />
              </div>
              {fin.parts.exposure > 0 && (
                <MetricRow label="Unordered Exposure" value={fin.parts.exposure} color="text-amber-400" defId="partsExposure" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* SERVICES */}
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
                <MetricRow label="Billable Revenue" value={fin.services.billable} color="text-blue-400" />
                <div className="border-t border-gray-800 pt-1">
                  <MetricRow label="Actual Spend" value={fin.services.actualCost} color="text-white" bold defId="servicesActual" />
                </div>
                {fin.services.exposure > 0 && (
                  <MetricRow label="Pending Exposure" value={fin.services.exposure} color="text-amber-400" defId="servicesExposure" />
                )}
                {/* Status breakdown */}
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

      {/* ═══ COST AT RISK BANNER ═══ */}
      {fin.risk.costAtRisk > 0 && fin.totals.actualSpend > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300">True Cost at Risk</p>
            <p className="text-xs text-amber-400/80">
              Actual spend {formatCurrencyUSD(fin.totals.actualSpend)} exceeds billed {formatCurrencyUSD(fin.revenue.invoiced)} →{' '}
              <span className="font-bold text-amber-300">{formatCurrencyUSD(fin.risk.costAtRisk)} unbilled exposure</span>
              {fin.totals.exposure > 0 && (
                <span> + {formatCurrencyUSD(fin.totals.exposure)} unordered</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ═══ FINANCIAL WARNINGS ═══ */}
      {warnings.filter(w => w.level === 'error' || w.level === 'warn').length > 0 && (
        <div className="flex items-start gap-3 p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            {warnings.filter(w => w.level !== 'info').map((w, i) => (
              <p key={i} className={cn("text-xs", w.level === 'error' ? "text-red-400" : "text-amber-400")}>
                {w.msg}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ═══ EXPANDABLE BREAKDOWN ═══ */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowBreakdown(!showBreakdown)}
        className="text-gray-500 hover:text-gray-300 text-xs gap-1.5 h-7"
      >
        {showBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showBreakdown ? 'Hide' : 'Show'} Financial Breakdown
      </Button>

      {showBreakdown && (
        <Card className="bg-black/30 border-gray-800">
          <CardContent className="p-4 space-y-4">
            {/* Parts Waterfall */}
            <div>
              <p className="text-[10px] text-purple-400 uppercase tracking-widest font-semibold mb-2">Parts Cost Waterfall</p>
              <FinancialBar
                segments={[
                  { label: 'Installed', value: fin.parts.installedCost, color: 'bg-emerald-600' },
                  { label: 'Reserved', value: fin.parts.receivedCost, color: 'bg-cyan-600' },
                  { label: 'On PO', value: fin.parts.orderedCost, color: 'bg-purple-600' },
                  { label: 'Unordered', value: fin.parts.unorderedCost, color: 'bg-gray-600' },
                ]}
                total={fin.parts.plannedCost}
              />
            </div>

            {/* Services Waterfall */}
            {hasServices && (
              <div>
                <p className="text-[10px] text-amber-400 uppercase tracking-widest font-semibold mb-2">Services Cost Waterfall</p>
                <FinancialBar
                  segments={[
                    { label: 'Actual', value: fin.services.actualCost, color: 'bg-amber-600' },
                    { label: 'Pending', value: fin.services.exposure, color: 'bg-gray-600' },
                  ]}
                  total={fin.services.plannedCost}
                />
              </div>
            )}

            {/* Reconciliation Table */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Reconciliation</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                <span className="text-gray-500">Parts Planned</span>
                <span className="text-gray-300 text-right">{formatCurrencyUSD(fin.parts.plannedCost)}</span>
                <span className="text-gray-500">+ Services Planned</span>
                <span className="text-gray-300 text-right">{formatCurrencyUSD(fin.services.plannedCost)}</span>
                <span className="text-gray-500 font-semibold border-t border-gray-800 pt-1">= Total Planned Cost</span>
                <span className="text-white text-right font-semibold border-t border-gray-800 pt-1">{formatCurrencyUSD(fin.totals.plannedCost)}</span>
                <span className="text-gray-500 mt-2">Planned Revenue</span>
                <span className="text-blue-400 text-right mt-2">{formatCurrencyUSD(fin.revenue.planned)}</span>
                <span className="text-gray-500">− Planned Cost</span>
                <span className="text-gray-300 text-right">{formatCurrencyUSD(fin.totals.plannedCost)}</span>
                <span className="text-gray-500 font-semibold border-t border-gray-800 pt-1">= Projected Margin</span>
                <span className={cn("text-right font-semibold border-t border-gray-800 pt-1", marginColor)}>{formatCurrencyUSD(fin.totals.projectedMargin)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FINANCIAL BAR — visual waterfall
// ═══════════════════════════════════════════════════════════════
function FinancialBar({ segments, total }) {
  if (total <= 0) return <p className="text-xs text-gray-600 italic">No cost data</p>;

  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden bg-gray-800">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div
            key={i}
            className={cn(seg.color, "transition-all")}
            style={{ width: `${Math.max(1, (seg.value / total) * 100)}%` }}
            title={`${seg.label}: ${formatCurrencyUSD(seg.value)}`}
          />
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