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
import { deriveBillingLedger } from "@/components/financial/deriveBillingLedger";
import { deriveCostLedger } from "@/components/financial/deriveCostLedger";
import FinancialHealthBanner from "@/components/financial/FinancialHealthBanner";
import FinancialDetailDrawer from "@/components/financial/FinancialDetailDrawer";
import BillingLedgerSection from "@/components/financial/BillingLedgerSection";

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
export default function PSMFinancialSummary({ enrichedCommitments, metrics, servicesSummary, projectInvoices = [] }) {
  const { items: normalizedCommitments, stats: sourceStats } = useMemo(
    () => normalizePartCommitments(enrichedCommitments),
    [enrichedCommitments]
  );

  const fin = useMemo(
    () => deriveProjectFinancials({ enrichedCommitments: normalizedCommitments, metrics, servicesSummary }),
    [normalizedCommitments, metrics, servicesSummary]
  );
  const warnings = useMemo(() => validateProjectFinancials(fin), [fin]);

  // ═══════════════════════════════════════════════════════════════
  // CANONICAL COST LEDGER — 3 distinct cost layers
  // Planned / Operational / Accounting — NEVER blended
  // ═══════════════════════════════════════════════════════════════
  const costLedger = useMemo(
    () => deriveCostLedger({ enrichedCommitments: normalizedCommitments, servicesSummary }),
    [normalizedCommitments, servicesSummary]
  );

  // ═══════════════════════════════════════════════════════════════
  // CANONICAL BILLING LEDGER — derived ONLY from invoice records
  // This replaces all operational-state-derived billing metrics.
  // ═══════════════════════════════════════════════════════════════
  const billingLedger = useMemo(
    () => deriveBillingLedger({
      projectedRevenue: fin.revenue.planned,
      invoices: projectInvoices,
    }),
    [fin.revenue.planned, projectInvoices]
  );

  const noScope = enrichedCommitments.length === 0 && billingLedger.invoicedRevenue > 0;
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

      {/* Health Banner — single status, now with cost ledger + billing ledger awareness */}
      <FinancialHealthBanner fin={fin} sourceStats={sourceStats} billingLedger={billingLedger} costLedger={costLedger} />

      {/* Executive Cards — 4 core sections */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* REVENUE — ledger-derived billing metrics */}
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold">Project Total</p>
            </div>
            <BigMetric label="Project Total" value={fin.revenue.planned} tip="Total project value" />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric
                label="Billed"
                value={billingLedger.invoicedRevenue}
                color="text-blue-400"
                tip="Total billed to client"
              />
              <SmallMetric
                label="Unpaid"
                value={billingLedger.outstandingRevenue}
                color={billingLedger.outstandingRevenue > 0.01 ? "text-amber-400" : "text-gray-500"}
                tip="Billed but not yet paid"
              />
              <SmallMetric
                label="Left to Bill"
                value={billingLedger.remainingToBill}
                color={billingLedger.remainingToBill > 0.01 ? "text-yellow-400" : "text-gray-500"}
                tip="Billable work not yet invoiced"
              />
            </div>
          </CardContent>
        </Card>

        {/* COSTS — 3 canonical layers */}
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Expected Cost</p>
            </div>
            <BigMetric label="Expected Cost" value={costLedger.plannedCost} color="text-gray-200" tip="Total estimated project cost" />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric
                label="Spent So Far"
                value={costLedger.operationalCost}
                color="text-white"
                tip="What you've spent on this project"
              />
              <SmallMetric
                label="Ordered"
                value={costLedger.exposure.committed}
                color={costLedger.exposure.committed > 0 ? "text-yellow-400" : "text-gray-500"}
                tip="Parts and services on order"
              />
              <SmallMetric
                label="Still Needed"
                value={costLedger.exposure.uncommitted}
                color={costLedger.exposure.uncommitted > 0 ? "text-amber-400" : "text-gray-500"}
                tip="What still needs to be ordered"
              />
            </div>
          </CardContent>
        </Card>

        {/* MARGIN */}
        <Card className={cn("bg-black/40", fin.totals.projectedMargin >= 0 ? "border-emerald-900/30" : "border-red-900/30")}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className={cn("w-3.5 h-3.5", projColor)} />
              <p className={cn("text-[10px] uppercase tracking-widest font-semibold", projColor)}>Expected Profit</p>
              <Badge variant="outline" className={cn("text-[8px] px-1 py-0 ml-auto border-gray-700", projColor)}>
                {marginPct}%
              </Badge>
            </div>
            <BigMetric label="Expected Profit" value={fin.totals.projectedMargin} color={projColor} tip="What you should make on this project" />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric
                label="Current Profit"
                value={billingLedger.invoicedRevenue - costLedger.operationalCost}
                color={(billingLedger.invoicedRevenue - costLedger.operationalCost) >= 0 ? "text-emerald-400" : "text-red-400"}
                tip="Billed amount minus what you've spent"
              />
              <SmallMetric
                label="Cash In"
                value={billingLedger.paidRevenue}
                color={billingLedger.paidRevenue > 0 ? "text-emerald-400" : "text-gray-500"}
                tip="Actual cash received from invoices"
              />
            </div>
          </CardContent>
        </Card>

        {/* RISK — operational exposure */}
        <Card className={cn("bg-black/40",
          (costLedger.operationalCost > 0 || costLedger.exposure.uncommitted > 0)
            ? "border-amber-900/30"
            : "border-gray-800"
        )}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className={cn("w-3.5 h-3.5",
                costLedger.operationalCost > billingLedger.invoicedRevenue ? "text-amber-400" : "text-gray-500"
              )} />
              <p className={cn("text-[10px] uppercase tracking-widest font-semibold",
                costLedger.operationalCost > billingLedger.invoicedRevenue ? "text-amber-400" : "text-gray-500"
              )}>Not Yet Billed</p>
            </div>
            <BigMetric
              label="Unbilled Spend"
              value={Math.max(0, costLedger.operationalCost - billingLedger.invoicedRevenue)}
              color={costLedger.operationalCost > billingLedger.invoicedRevenue ? "text-amber-400" : "text-gray-500"}
              tip="You've spent this but haven't billed it yet"
            />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric
                label="Still Needed"
                value={costLedger.exposure.uncommitted}
                color={costLedger.exposure.uncommitted > 0 ? "text-yellow-400" : "text-gray-500"}
                tip="What still needs to be ordered"
              />
              <SmallMetric
                label="On Order"
                value={costLedger.exposure.committed}
                color={costLedger.exposure.committed > 0 ? "text-blue-400" : "text-gray-500"}
                tip="Parts and services on order"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Billing Ledger — canonical invoice-record-derived billing truth */}
      {projectInvoices.length > 0 && (
        <BillingLedgerSection ledger={billingLedger} />
      )}

      {/* Progressive Disclosure — Financial Details + Diagnostics */}
      <FinancialDetailDrawer fin={fin} warnings={warnings} costLedger={costLedger} />
    </div>
  );
}