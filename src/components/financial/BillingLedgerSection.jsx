import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Receipt, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { BILLING_HEALTH_CONFIG } from "@/components/financial/deriveBillingLedger";

function LedgerRow({ label, value, color = "text-gray-300", bold = false }) {
  return (
    <div className={cn("flex items-center justify-between py-1", bold && "border-t border-gray-700 pt-2 mt-1")}>
      <span className={cn("text-xs", bold ? "text-gray-300 font-semibold" : "text-gray-500")}>{label}</span>
      <span className={cn("text-xs font-mono", color, bold && "font-semibold")}>{formatCurrencyUSD(value)}</span>
    </div>
  );
}

function AgingBar({ aging }) {
  const total = aging.current + aging.days_0_30 + aging.days_31_60 + aging.days_61_90 + aging.days_90_plus;
  if (total <= 0) return null;

  const segments = [
    { label: "Current", value: aging.current, color: "bg-emerald-600" },
    { label: "0-30d", value: aging.days_0_30, color: "bg-yellow-600" },
    { label: "31-60d", value: aging.days_31_60, color: "bg-amber-600" },
    { label: "61-90d", value: aging.days_61_90, color: "bg-orange-600" },
    { label: "90+d", value: aging.days_90_plus, color: "bg-red-600" },
  ].filter(s => s.value > 0);

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Invoice Aging</p>
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-800">
        {segments.map((s, i) => (
          <div key={i} className={cn(s.color, "transition-all")} style={{ width: `${(s.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={cn("w-2 h-2 rounded-full", s.color)} />
            <span className="text-[10px] text-gray-500">{s.label}</span>
            <span className="text-[10px] text-gray-400 font-mono">{formatCurrencyUSD(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvoiceProvenance({ label, items, valueKey = "total" }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</p>
      {items.map((inv, i) => (
        <div key={i} className="flex items-center justify-between text-[10px]">
          <span className="text-gray-400 font-mono">{inv.number}</span>
          <span className="text-gray-300 font-mono">{formatCurrencyUSD(inv[valueKey] ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * BillingLedgerSection — Canonical billing truth display
 * Shows ledger metrics derived ONLY from invoice records.
 * Progressive disclosure: summary → aging → provenance
 */
export default function BillingLedgerSection({ ledger }) {
  const [expanded, setExpanded] = useState(false);

  if (!ledger) return null;

  const healthCfg = BILLING_HEALTH_CONFIG[ledger.billingHealth] || BILLING_HEALTH_CONFIG.awaiting_billing;
  const hasAging = ledger.aging && (ledger.aging.days_0_30 > 0 || ledger.aging.days_31_60 > 0 || ledger.aging.days_61_90 > 0 || ledger.aging.days_90_plus > 0);
  const billingPct = ledger.reconciliation?.billingRatio ?? 0;

  return (
    <div className="space-y-2">
      {/* Billing Health Banner */}
      <div className={cn("flex items-center gap-3 p-3 rounded-lg border", healthCfg.bg)}>
        {ledger.billingHealth === 'overdue' ? (
          <AlertTriangle className={cn("w-4 h-4 flex-shrink-0", healthCfg.color)} />
        ) : ledger.billingHealth === 'fully_billed' ? (
          <CheckCircle2 className={cn("w-4 h-4 flex-shrink-0", healthCfg.color)} />
        ) : (
          <Receipt className={cn("w-4 h-4 flex-shrink-0", healthCfg.color)} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn("text-sm font-semibold", healthCfg.color)}>{healthCfg.label}</p>
            {ledger.invoiceCount > 0 && (
              <span className="text-[10px] text-gray-500">
                {ledger.invoiceCount} invoice{ledger.invoiceCount !== 1 ? 's' : ''}
                {ledger.draftCount > 0 && ` · ${ledger.draftCount} draft`}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">{healthCfg.description}</p>
        </div>
        {billingPct > 0 && (
          <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-400 font-mono">
            {billingPct.toFixed(0)}% billed
          </Badge>
        )}
      </div>

      {/* Ledger Summary */}
      <Card className="bg-black/30 border-gray-800">
        <CardContent className="p-4 space-y-1">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Billing Ledger</p>
          <LedgerRow label="Projected Revenue" value={ledger.projectedRevenue} color="text-gray-300" />
          <LedgerRow label="Invoiced" value={ledger.invoicedRevenue} color="text-blue-400" />
          <LedgerRow label="Paid" value={ledger.paidRevenue} color="text-emerald-400" />
          <LedgerRow
            label="Outstanding"
            value={ledger.outstandingRevenue}
            color={ledger.outstandingRevenue > 0.01 ? "text-amber-400" : "text-gray-500"}
          />
          <LedgerRow
            label="Remaining to Bill"
            value={ledger.remainingToBill}
            color={ledger.remainingToBill > 0.01 ? "text-yellow-400" : "text-gray-500"}
            bold
          />

          {/* Expand for aging + provenance */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-300 text-[10px] gap-1 h-6 mt-2"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide" : "Show"} Details
          </Button>

          {expanded && (
            <div className="space-y-4 border-t border-gray-800 pt-3 mt-2">
              {/* Aging */}
              {hasAging && <AgingBar aging={ledger.aging} />}

              {/* Reconciliation */}
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Reconciliation</p>
                <LedgerRow label="Projected Revenue" value={ledger.reconciliation.projectedRevenue} />
                <LedgerRow label="Invoice Ledger Total" value={ledger.reconciliation.invoicedRevenue} color="text-blue-400" />
                <LedgerRow
                  label="Difference"
                  value={ledger.reconciliation.difference}
                  color={ledger.reconciliation.difference > 0.01 ? "text-amber-400" : "text-emerald-400"}
                />
              </div>

              {/* Provenance */}
              {ledger.provenance?.outstanding?.length > 0 && (
                <InvoiceProvenance label="Outstanding Invoices" items={ledger.provenance.outstanding} valueKey="balance" />
              )}
              {ledger.provenance?.paid?.length > 0 && (
                <InvoiceProvenance label="Paid Invoices" items={ledger.provenance.paid} valueKey="paid" />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}