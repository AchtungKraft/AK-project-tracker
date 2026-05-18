import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Receipt, TrendingUp, DollarSign, ShieldAlert,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { deriveProjectFinancials, validateProjectFinancials } from "@/components/supply/deriveProjectFinancials";
import { normalizePartCommitments } from "@/components/supply/resolveFinancialSource";
import FinancialHealthBanner from "@/components/financial/FinancialHealthBanner";
import FinancialDetailDrawer from "@/components/financial/FinancialDetailDrawer";

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

/**
 * Executive-style financial summary.
 * 4 cards: Revenue, Costs, Margin, Risk
 * Health banner replaces multiple warnings.
 * All advanced details behind progressive disclosure.
 */
export default function PSMFinancialSummary({ enrichedCommitments, metrics, servicesSummary }) {
  const { items: normalizedCommitments, stats: sourceStats } = useMemo(
    () => normalizePartCommitments(enrichedCommitments),
    [enrichedCommitments]
  );

  const fin = useMemo(
    () => deriveProjectFinancials({ enrichedCommitments: normalizedCommitments, metrics, servicesSummary }),
    [normalizedCommitments, metrics, servicesSummary]
  );
  const warnings = useMemo(() => validateProjectFinancials(fin), [fin]);

  const noScope = enrichedCommitments.length === 0 && fin.revenue.invoiced > 0;
  const projColor = fin.totals.projectedMargin >= 0 ? "text-emerald-400" : "text-red-400";
  const marginPct = fin.revenue.planned > 0
    ? ((fin.totals.projectedMargin / fin.revenue.planned) * 100).toFixed(0)
    : "0";

  return (
    <div className="space-y-3">
      {noScope && (
        <div className="flex items-center gap-3 p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <p className="text-xs text-blue-300">Historical billing exists but no active planned scope.</p>
        </div>
      )}

      {/* Health Banner — single status */}
      <FinancialHealthBanner fin={fin} sourceStats={sourceStats} />

      {/* Executive Cards — 4 core sections */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* REVENUE */}
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold">Revenue</p>
            </div>
            <BigMetric label="Planned" value={fin.revenue.planned} tip="Total expected revenue from parts + services" />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric label="Invoiced" value={fin.revenue.invoiced} color="text-blue-400" tip="Amount billed to client" />
              <SmallMetric
                label="Outstanding"
                value={fin.revenue.outstanding}
                color={fin.revenue.outstanding > 0 ? "text-amber-400" : "text-gray-500"}
                tip="Invoiced but not yet paid"
              />
            </div>
          </CardContent>
        </Card>

        {/* COSTS */}
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Costs</p>
            </div>
            <BigMetric label="Total Cost" value={fin.totals.plannedCost} color="text-gray-200" tip="Parts + services planned cost" />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric label="Parts" value={fin.parts.plannedCost} />
              {fin.services.plannedCost > 0 && (
                <SmallMetric label="Services" value={fin.services.plannedCost} />
              )}
              <SmallMetric label="Spent" value={fin.totals.actualSpend} color="text-white" tip="Cost already realized" />
            </div>
          </CardContent>
        </Card>

        {/* MARGIN */}
        <Card className={cn("bg-black/40", fin.totals.projectedMargin >= 0 ? "border-emerald-900/30" : "border-red-900/30")}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className={cn("w-3.5 h-3.5", projColor)} />
              <p className={cn("text-[10px] uppercase tracking-widest font-semibold", projColor)}>Margin</p>
              <Badge variant="outline" className={cn("text-[8px] px-1 py-0 ml-auto border-gray-700", projColor)}>
                {marginPct}%
              </Badge>
            </div>
            <BigMetric label="Projected" value={fin.totals.projectedMargin} color={projColor} tip="Revenue − Cost (if everything completes as planned)" />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric
                label="Realized"
                value={fin.totals.realizedMargin}
                color={fin.totals.realizedMargin >= 0 ? "text-emerald-400" : "text-red-400"}
                tip="Invoiced − Actual Spend (current truth)"
              />
              <SmallMetric label="Remaining" value={fin.totals.unrealizedMarginRemaining} tip="Projected margin not yet realized" />
            </div>
          </CardContent>
        </Card>

        {/* RISK */}
        <Card className={cn("bg-black/40",
          (fin.risk.accounting.total > 0 || fin.risk.operational.total > 0)
            ? "border-amber-900/30"
            : "border-gray-800"
        )}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className={cn("w-3.5 h-3.5",
                fin.risk.accounting.total > 0 ? "text-amber-400" : "text-gray-500"
              )} />
              <p className={cn("text-[10px] uppercase tracking-widest font-semibold",
                fin.risk.accounting.total > 0 ? "text-amber-400" : "text-gray-500"
              )}>Risk</p>
            </div>
            <BigMetric
              label="Unbilled Cost"
              value={fin.risk.accounting.total}
              color={fin.risk.accounting.total > 0 ? "text-amber-400" : "text-gray-500"}
              tip="Actual cost not yet billed to client"
            />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric
                label="Unordered"
                value={fin.risk.operational.total}
                color={fin.risk.operational.total > 0 ? "text-yellow-400" : "text-gray-500"}
                tip="Cost not yet committed to vendor"
              />
              <SmallMetric
                label="Pending Orders"
                value={fin.exposure.ordered}
                color={fin.exposure.ordered > 0 ? "text-blue-400" : "text-gray-500"}
                tip="Committed to vendor, awaiting delivery"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progressive Disclosure — Financial Details + Diagnostics */}
      <FinancialDetailDrawer fin={fin} warnings={warnings} />
    </div>
  );
}