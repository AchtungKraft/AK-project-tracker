import React from "react";
import { AlertTriangle, CheckCircle2, Clock, ShoppingCart, TrendingDown, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * Single health banner that replaces multiple risk/warning sections.
 * Shows ONE status with a concise explanation.
 * Now includes billing ledger health for overdue/outstanding invoice awareness.
 */
const HEALTH_STATES = {
  negative_margin: {
    icon: TrendingDown,
    bg: "bg-red-900/30 border-red-700/50",
    iconColor: "text-red-400",
    label: "Negative Margin",
  },
  overdue_invoices: {
    icon: AlertTriangle,
    bg: "bg-red-900/30 border-red-700/50",
    iconColor: "text-red-400",
    label: "Overdue Invoices",
  },
  outstanding_balance: {
    icon: Receipt,
    bg: "bg-amber-900/30 border-amber-700/50",
    iconColor: "text-amber-400",
    label: "Outstanding Balance",
  },
  needs_billing: {
    icon: Clock,
    bg: "bg-amber-900/30 border-amber-700/50",
    iconColor: "text-amber-400",
    label: "Needs Billing",
  },
  awaiting_orders: {
    icon: ShoppingCart,
    bg: "bg-yellow-900/30 border-yellow-700/50",
    iconColor: "text-yellow-400",
    label: "Awaiting Orders",
  },
  at_risk: {
    icon: AlertTriangle,
    bg: "bg-amber-900/30 border-amber-700/50",
    iconColor: "text-amber-400",
    label: "At Risk",
  },
  healthy: {
    icon: CheckCircle2,
    bg: "bg-emerald-900/20 border-emerald-700/30",
    iconColor: "text-emerald-400",
    label: "Healthy",
  },
};

export default function FinancialHealthBanner({ fin, sourceStats, billingLedger, costLedger }) {
  // Determine primary health state (priority order)
  let state, description;

  // Use costLedger for accurate operational cost, fallback to fin.totals for backward compat
  const opCost = costLedger?.operationalCost ?? fin.totals.actualSpend ?? 0;
  const invoiced = billingLedger?.invoicedRevenue ?? 0;
  const unbilledOpCost = Math.max(0, opCost - invoiced);
  const uncommitted = costLedger?.exposure?.uncommitted ?? fin.risk?.operational?.total ?? 0;

  if (fin.totals.projectedMargin < -0.01) {
    state = HEALTH_STATES.negative_margin;
    description = `Project is ${formatCurrencyUSD(Math.abs(fin.totals.projectedMargin))} over budget — costs exceed planned revenue.`;
  } else if (billingLedger?.overdueCount > 0) {
    state = HEALTH_STATES.overdue_invoices;
    description = `${billingLedger.overdueCount} invoice(s) past due — ${formatCurrencyUSD(billingLedger.outstandingRevenue)} outstanding.`;
  } else if (billingLedger?.outstandingRevenue > 0.01) {
    state = HEALTH_STATES.outstanding_balance;
    description = `${formatCurrencyUSD(billingLedger.outstandingRevenue)} invoiced but not yet paid.`;
  } else if (unbilledOpCost > 0.01 && opCost > 0) {
    state = HEALTH_STATES.needs_billing;
    description = `${formatCurrencyUSD(unbilledOpCost)} in operational costs not yet covered by invoices.`;
  } else if (uncommitted > 0) {
    state = HEALTH_STATES.awaiting_orders;
    description = `${formatCurrencyUSD(uncommitted)} still needs to be ordered.`;
  } else if (fin.risk.negativeMarginItems > 0) {
    state = HEALTH_STATES.at_risk;
    description = `${fin.risk.negativeMarginItems} item(s) losing money — check the pricing.`;
  } else {
    state = HEALTH_STATES.healthy;
    description = "Project is on track.";
  }

  const Icon = state.icon;
  const hasDataWarnings = sourceStats && (sourceStats.missingCostCount > 0 || sourceStats.missingRetailCount > 0);

  return (
    <div className="space-y-2">
      <div className={cn("flex items-center gap-3 p-3 rounded-lg border", state.bg)}>
        <Icon className={cn("w-5 h-5 flex-shrink-0", state.iconColor)} />
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold", state.iconColor)}>{state.label}</p>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
      </div>

      {hasDataWarnings && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-yellow-500/80">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>
            {sourceStats.missingCostCount > 0 && `${sourceStats.missingCostCount} items missing cost`}
            {sourceStats.missingCostCount > 0 && sourceStats.missingRetailCount > 0 && " · "}
            {sourceStats.missingRetailCount > 0 && `${sourceStats.missingRetailCount} items missing retail`}
          </span>
        </div>
      )}
    </div>
  );
}