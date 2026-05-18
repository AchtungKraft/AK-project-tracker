import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { deriveCanonicalInvoiceState, INVOICE_STATUS_CONFIG } from "./deriveCanonicalInvoiceState";

function PassFail({ pass, label }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {pass ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
      )}
      <span className={pass ? "text-gray-400" : "text-red-300"}>{label}</span>
    </div>
  );
}

function MetricRow({ label, value, color = "text-gray-300" }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className={cn("text-xs font-mono", color)}>{formatCurrencyUSD(value)}</span>
    </div>
  );
}

/**
 * InvoiceReconciliationDiagnostics — Admin/dev diagnostics panel
 * 
 * Compares canonical invoice state against backend summary and commitment snapshots.
 * Shows pass/fail assertions for financial trust verification.
 * 
 * Gated behind admin/diagnostics toggle only.
 */
export default function InvoiceReconciliationDiagnostics({
  projectInvoices = [],
  projectedRevenue = 0,
  operationalCost = 0,
  backendSummary = {},
  enrichedCommitments = [],
}) {
  const [expanded, setExpanded] = useState(false);

  // CANONICAL invoice state from actual records
  const canonical = useMemo(
    () => deriveCanonicalInvoiceState({
      invoices: projectInvoices,
      projectedRevenue,
      operationalCost,
    }),
    [projectInvoices, projectedRevenue, operationalCost]
  );

  // Backend summary values (from getProjectSupplyView)
  const beSummary = {
    total_invoiced: backendSummary.total_invoiced ?? 0,
    total_paid: backendSummary.total_paid ?? 0,
    invoice_outstanding: backendSummary.invoice_outstanding ?? 0,
    unbilled_retail: backendSummary.unbilled_retail ?? 0,
  };

  // Commitment snapshot values (deprecated — should NOT be used for billing)
  const commitmentSnapshotTotals = useMemo(() => {
    let invoicedAmt = 0, invoicedQty = 0;
    for (const c of enrichedCommitments) {
      invoicedAmt += c.invoiced_amount ?? 0;
      invoicedQty += c.invoiced_qty ?? 0;
    }
    return { invoicedAmt, invoicedQty };
  }, [enrichedCommitments]);

  // ═══════════════════════════════════════════════════════════════
  // RECONCILIATION ASSERTIONS
  // ═══════════════════════════════════════════════════════════════
  const TOL = 0.02; // 2 cent tolerance for rounding

  const assertions = [
    {
      pass: Math.abs(canonical.invoicedAmount - beSummary.total_invoiced) < TOL,
      label: `Invoiced: canonical (${formatCurrencyUSD(canonical.invoicedAmount)}) = backend (${formatCurrencyUSD(beSummary.total_invoiced)})`,
    },
    {
      pass: Math.abs(canonical.paidAmount - beSummary.total_paid) < TOL,
      label: `Paid: canonical (${formatCurrencyUSD(canonical.paidAmount)}) = backend (${formatCurrencyUSD(beSummary.total_paid)})`,
    },
    {
      pass: Math.abs(canonical.outstandingAmount - beSummary.invoice_outstanding) < TOL,
      label: `Outstanding: canonical (${formatCurrencyUSD(canonical.outstandingAmount)}) = backend (${formatCurrencyUSD(beSummary.invoice_outstanding)})`,
    },
    {
      pass: canonical.invoicedAmount >= canonical.paidAmount - TOL,
      label: `Invoiced ≥ Paid (no overpayment)`,
    },
    {
      pass: canonical.paidAmount + canonical.outstandingAmount >= canonical.invoicedAmount - TOL
        && canonical.paidAmount + canonical.outstandingAmount <= canonical.invoicedAmount + TOL,
      label: `Paid + Outstanding = Invoiced (ledger balanced)`,
    },
    {
      pass: canonical.qbSyncState.synced || canonical.invoiceCount === 0,
      label: `QB sync: ${canonical.qbSyncState.exported}/${canonical.qbSyncState.total} exported`,
    },
  ];

  const allPass = assertions.every(a => a.pass);
  const failCount = assertions.filter(a => !a.pass).length;

  const statusCfg = INVOICE_STATUS_CONFIG[canonical.invoiceStatus] || INVOICE_STATUS_CONFIG.not_billed;

  return (
    <Card className={cn(
      "border",
      allPass ? "bg-emerald-900/10 border-emerald-800/30" : "bg-red-900/10 border-red-800/30"
    )}>
      <CardContent className="p-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full text-left"
        >
          {allPass ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          )}
          <span className={cn("text-sm font-semibold", allPass ? "text-emerald-300" : "text-red-300")}>
            Invoice Reconciliation
          </span>
          <Badge variant="outline" className={cn(
            "ml-2 text-[9px] px-1.5 py-0",
            allPass ? "border-emerald-700 text-emerald-400" : "border-red-700 text-red-400"
          )}>
            {allPass ? "PASS" : `${failCount} FAIL`}
          </Badge>
          <Badge variant="outline" className={cn("ml-auto text-[9px] px-1.5 py-0 border-gray-700", statusCfg.color)}>
            {statusCfg.label}
          </Badge>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
        </button>

        {expanded && (
          <div className="mt-3 space-y-4">
            {/* Canonical Invoice Totals */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">
                Canonical (from ProjectInvoice entities)
              </p>
              <MetricRow label="Invoiced" value={canonical.invoicedAmount} color="text-blue-400" />
              <MetricRow label="Paid" value={canonical.paidAmount} color="text-emerald-400" />
              <MetricRow label="Outstanding" value={canonical.outstandingAmount} color={canonical.outstandingAmount > 0.01 ? "text-amber-400" : "text-gray-500"} />
              <MetricRow label="Remaining to Bill" value={canonical.remainingToBill} color={canonical.remainingToBill > 0.01 ? "text-yellow-400" : "text-gray-500"} />
              <MetricRow label="Uninvoiced Op Cost" value={canonical.uninvoicedOperationalCost} color={canonical.uninvoicedOperationalCost > 0.01 ? "text-amber-400" : "text-gray-500"} />
              <div className="flex items-center justify-between py-0.5 border-t border-gray-800 mt-1 pt-1">
                <span className="text-[10px] text-gray-500">Invoices</span>
                <span className="text-xs text-gray-300">
                  {canonical.invoiceCount} active · {canonical.paidInvoiceCount} paid · {canonical.openInvoiceCount} open · {canonical.draftCount} draft
                </span>
              </div>
            </div>

            {/* Commitment Snapshots (deprecated) */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">
                Commitment Snapshots (deprecated — for comparison only)
              </p>
              <MetricRow label="commitment.invoiced_amount sum" value={commitmentSnapshotTotals.invoicedAmt} color="text-gray-500" />
              <MetricRow label="commitment.invoiced_qty sum" value={commitmentSnapshotTotals.invoicedQty} color="text-gray-500" />
              {Math.abs(canonical.invoicedAmount - commitmentSnapshotTotals.invoicedAmt) > 0.01 && (
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-yellow-500">
                  <AlertTriangle className="w-3 h-3" />
                  <span>
                    Drift: canonical invoiced differs from commitment snapshots by {formatCurrencyUSD(Math.abs(canonical.invoicedAmount - commitmentSnapshotTotals.invoicedAmt))}
                  </span>
                </div>
              )}
            </div>

            {/* QB Sync State */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">QB Sync</p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{canonical.qbSyncState.exported} exported</span>
                <span>·</span>
                <span>{canonical.qbSyncState.pending} pending</span>
                <span>·</span>
                <span className={canonical.qbSyncState.synced ? "text-emerald-400" : "text-amber-400"}>
                  {canonical.qbSyncState.synced ? "All synced" : "Needs sync"}
                </span>
              </div>
            </div>

            {/* Assertions */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Assertions</p>
              <div className="space-y-1">
                {assertions.map((a, i) => (
                  <PassFail key={i} pass={a.pass} label={a.label} />
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}