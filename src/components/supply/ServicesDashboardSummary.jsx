import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle, ChevronDown, ChevronUp, Truck,
  TrendingUp, DollarSign, Receipt, Clock, CheckCircle2,
  Package, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { deriveServiceFinancials } from "@/components/supply/deriveServiceFinancials";
import { normalizeServiceCommitments } from "@/components/supply/resolveFinancialSource";

function Tip({ text, children }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function BigMetric({ label, value, color = "text-white", tip }) {
  const content = (
    <div className="space-y-0.5">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={cn("text-lg font-bold font-mono leading-tight", color)}>{formatCurrencyUSD(value)}</p>
    </div>
  );
  return tip ? <Tip text={tip}>{content}</Tip> : content;
}

function SmallMetric({ label, value, color = "text-gray-400", tip }) {
  const content = (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className={cn("text-xs font-mono", color)}>{formatCurrencyUSD(value)}</span>
    </div>
  );
  return tip ? <Tip text={tip}>{content}</Tip> : content;
}

const STATUS_ICONS = {
  planned: Clock,
  ordered: Package,
  completed: CheckCircle2,
  billed: Receipt,
};

const STATUS_COLORS = {
  planned: "text-gray-400",
  ordered: "text-yellow-400",
  completed: "text-blue-400",
  billed: "text-emerald-400",
};

function WaterfallBar({ segments, total }) {
  if (total <= 0) return <p className="text-xs text-gray-600 italic">No cost data</p>;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-800">
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

/**
 * Simplified services financial summary.
 * Status pills + 3 core metrics + optional detail drawer.
 */
export default function ServicesDashboardSummary({ commitments }) {
  const [showDetails, setShowDetails] = useState(false);

  const { items: normalizedServices, sourceWarnings } = useMemo(
    () => normalizeServiceCommitments(commitments),
    [commitments]
  );
  const fin = useMemo(() => deriveServiceFinancials(normalizedServices), [normalizedServices]);

  const projColor = fin.margin.projectedMargin >= 0 ? "text-emerald-400" : "text-red-400";
  const marginPct = fin.revenue.plannedBillable > 0
    ? ((fin.margin.projectedMargin / fin.revenue.plannedBillable) * 100).toFixed(0)
    : "0";

  // Health determination
  let healthColor = "text-emerald-400";
  let healthLabel = "Healthy";
  if (fin.margin.projectedMargin < -0.01) {
    healthColor = "text-red-400";
    healthLabel = "Negative Margin";
  } else if (fin.risk.accounting.total > 0) {
    healthColor = "text-amber-400";
    healthLabel = "Needs Billing";
  } else if (fin.risk.operational.total > 0) {
    healthColor = "text-yellow-400";
    healthLabel = "Pending Orders";
  }

  return (
    <div className="space-y-3">
      {/* Status Pills */}
      <div className="flex flex-wrap gap-2">
        {["planned", "ordered", "completed", "billed"].map(status => {
          const count = fin.counts[status] || 0;
          if (count === 0) return null;
          const Icon = STATUS_ICONS[status];
          const color = STATUS_COLORS[status];
          return (
            <div key={status} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800/50 rounded-lg">
              <Icon className={cn("w-3.5 h-3.5", color)} />
              <span className={cn("text-sm font-bold", color)}>{count}</span>
              <span className="text-[10px] text-gray-500 capitalize">{status}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 ml-auto">
          <span className={cn("text-[10px] font-semibold", healthColor)}>{healthLabel}</span>
        </div>
      </div>

      {/* 3 Core Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Billable */}
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold">Billable</p>
            </div>
            <BigMetric label="Revenue" value={fin.revenue.plannedBillable} tip="Total billable to client" />
            <SmallMetric label="Realized" value={fin.revenue.realizedBillable} color="text-blue-400" />
          </CardContent>
        </Card>

        {/* Vendor Cost */}
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Cost</p>
            </div>
            <BigMetric label="Planned" value={fin.costs.plannedCost} color="text-gray-200" />
            <SmallMetric label="Operational" value={fin.costs.actualCost} color="text-white" tip="Completed + billed cost (work performed)" />
            {fin.counts.ordered > 0 && (
              <SmallMetric label="Pending" value={fin.exposure.ordered} color="text-yellow-400" tip="Ordered, awaiting completion" />
            )}
          </CardContent>
        </Card>

        {/* Margin */}
        <Card className={cn("bg-black/40", fin.margin.projectedMargin >= 0 ? "border-emerald-900/30" : "border-red-900/30")}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className={cn("w-3.5 h-3.5", projColor)} />
              <p className={cn("text-[10px] uppercase tracking-widest font-semibold", projColor)}>Margin</p>
              <Badge variant="outline" className={cn("text-[8px] px-1 py-0 ml-auto border-gray-700", projColor)}>
                {marginPct}%
              </Badge>
            </div>
            <BigMetric label="Projected" value={fin.margin.projectedMargin} color={projColor} />
            <SmallMetric
              label="Realized"
              value={fin.margin.realizedMargin}
              color={fin.margin.realizedMargin >= 0 ? "text-emerald-400" : "text-red-400"}
            />
          </CardContent>
        </Card>
      </div>

      {/* Risk Banner — only if issues exist */}
      {fin.risk.accounting.total > 0 && fin.costs.actualCost > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-900/20 border border-amber-700/40 rounded-lg">
          <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-400">
            {formatCurrencyUSD(fin.risk.accounting.total)} in completed work not yet billed.
          </p>
        </div>
      )}

      {fin.margin.negativeMarginCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-400/80">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>{fin.margin.negativeMarginCount} service(s) with negative margin.</span>
        </div>
      )}

      {/* Detail Drawer */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowDetails(!showDetails)}
        className="text-gray-500 hover:text-gray-300 text-xs gap-1.5 h-7"
      >
        {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showDetails ? "Hide" : "Show"} Details
      </Button>

      {showDetails && (
        <Card className="bg-black/30 border-gray-800">
          <CardContent className="p-4 space-y-4">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Cost Breakdown</p>
              <WaterfallBar
                segments={[
                  { label: "Billed", value: fin.lifecycle.billedValue, color: "bg-emerald-600" },
                  { label: "Completed", value: fin.lifecycle.completedValue, color: "bg-blue-600" },
                  { label: "Ordered", value: fin.lifecycle.orderedValue, color: "bg-yellow-600" },
                  { label: "Planned", value: fin.lifecycle.plannedValue, color: "bg-gray-600" },
                ]}
                total={fin.costs.plannedCost}
              />
            </div>

            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Cost Split</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500">Vendor</p>
                  <p className="text-sm font-bold font-mono text-gray-200">{formatCurrencyUSD(fin.costs.vendorCostAll)}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500">Internal</p>
                  <p className="text-sm font-bold font-mono text-gray-200">{formatCurrencyUSD(fin.costs.internalCostAll)}</p>
                </div>
              </div>
            </div>

            {/* Reconciliation */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">Reconciliation</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                <span className="text-gray-500">Operational Cost</span>
                <span className="text-gray-300 text-right">{formatCurrencyUSD(fin.costs.actualCost)}</span>
                <span className="text-gray-500">+ Pending Orders</span>
                <span className="text-yellow-400 text-right">{formatCurrencyUSD(fin.exposure.ordered)}</span>
                <span className="text-gray-500">+ Unordered</span>
                <span className="text-amber-400 text-right">{formatCurrencyUSD(fin.exposure.planned)}</span>
                <span className="text-gray-500 font-semibold border-t border-gray-800 pt-1">= Total Cost</span>
                <span className="text-white text-right font-semibold border-t border-gray-800 pt-1">{formatCurrencyUSD(fin.costs.plannedCost)}</span>
                {fin._reconciliation.totalBucketCheck > 0.01 && (
                  <>
                    <span className="text-red-500 mt-1">⚠ Drift</span>
                    <span className="text-red-400 text-right mt-1">{formatCurrencyUSD(fin._reconciliation.totalBucketCheck)}</span>
                  </>
                )}
              </div>
            </div>

            {fin.warnings.length > 0 && (
              <div>
                <p className="text-[10px] text-red-400 uppercase tracking-widest font-semibold mb-1">Warnings</p>
                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                  {fin.warnings.map((w, i) => (
                    <p key={i} className={cn("text-[10px]", w.level === "warn" ? "text-amber-400" : "text-gray-500")}>• {w.msg}</p>
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