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
              <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold">Revenue</p>
            </div>
            <BigMetric label="Planned" value={fin.revenue.planned} tip="Total expected revenue from parts + services" />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric
                label="Invoiced"
                value={billingLedger.invoicedRevenue}
                color="text-blue-400"
                tip="Sum of actual invoice totals (not operational state)"
              />
              <SmallMetric
                label="Outstanding"
                value={billingLedger.outstandingRevenue}
                color={billingLedger.outstandingRevenue > 0.01 ? "text-amber-400" : "text-gray-500"}
                tip="Invoiced minus paid (from invoice records)"
              />
              <SmallMetric
                label="Remaining"
                value={billingLedger.remainingToBill}
                color={billingLedger.remainingToBill > 0.01 ? "text-yellow-400" : "text-gray-500"}
                tip="Projected revenue minus invoiced"
              />
            </div>
          </CardContent>
        </Card>

        {/* COSTS — 3 canonical layers */}
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Costs</p>
            </div>
            <BigMetric label="Planned" value={costLedger.plannedCost} color="text-gray-200" tip="Total expected project cost (parts + services)" />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric
                label="Operational"
                value={costLedger.operationalCost}
                color="text-white"
                tip="Cost incurred: parts received + services completed/billed"
              />
              <SmallMetric
                label="On Order"
                value={costLedger.exposure.committed}
                color={costLedger.exposure.committed > 0 ? "text-yellow-400" : "text-gray-500"}
                tip="PO/vendor committed, awaiting delivery/completion"
              />
              <SmallMetric
                label="Unordered"
                value={costLedger.exposure.uncommitted}
                color={costLedger.exposure.uncommitted > 0 ? "text-amber-400" : "text-gray-500"}
                tip="Planned but no vendor engagement yet"
              />
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
            <BigMetric label="Projected" value={fin.totals.projectedMargin} color={projColor} tip="Planned revenue − planned cost" />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric
                label="Realized"
                value={billingLedger.invoicedRevenue - costLedger.operationalCost}
                color={(billingLedger.invoicedRevenue - costLedger.operationalCost) >= 0 ? "text-emerald-400" : "text-red-400"}
                tip="Invoiced revenue − operational cost incurred"
              />
              <SmallMetric
                label="Collected"
                value={billingLedger.paidRevenue}
                color={billingLedger.paidRevenue > 0 ? "text-emerald-400" : "text-gray-500"}
                tip="Cash collected from invoices"
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
              )}>Exposure</p>
            </div>
            <BigMetric
              label="Op. Cost Not Billed"
              value={Math.max(0, costLedger.operationalCost - billingLedger.invoicedRevenue)}
              color={costLedger.operationalCost > billingLedger.invoicedRevenue ? "text-amber-400" : "text-gray-500"}
              tip="Operational cost incurred minus invoiced revenue"
            />
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <SmallMetric
                label="Unordered"
                value={costLedger.exposure.uncommitted}
                color={costLedger.exposure.uncommitted > 0 ? "text-yellow-400" : "text-gray-500"}
                tip="Cost not yet committed to vendor"
              />
              <SmallMetric
                label="Pending Orders"
                value={costLedger.exposure.committed}
                color={costLedger.exposure.committed > 0 ? "text-blue-400" : "text-gray-500"}
                tip="Committed to vendor, awaiting delivery"
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