import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { useProjectFinancialSnapshot, validateTotalsGate } from "./useProjectFinancialSnapshot";

/**
 * CanonicalFinancialDisplay - Display financial values from snapshot only
 * 
 * This component ensures all financial values come from the canonical source.
 * DO NOT pass computed values - only use snapshot data.
 */

/**
 * Single metric display
 */
export function FinancialMetric({ 
  label, 
  value, 
  sublabel,
  variant = "default",
  size = "md",
  className,
}) {
  const variantStyles = {
    default: "text-white",
    positive: "text-green-400",
    negative: "text-red-400",
    warning: "text-amber-400",
    muted: "text-gray-400",
  };

  const sizeStyles = {
    sm: "text-sm",
    md: "text-lg font-semibold",
    lg: "text-2xl font-bold",
  };

  return (
    <div className={cn("space-y-0.5", className)}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={cn(
        "font-mono",
        sizeStyles[size],
        variantStyles[variant],
      )}>
        {value !== null && value !== undefined ? formatCurrencyUSD(value) : "—"}
      </p>
      {sublabel && (
        <p className="text-xs text-gray-500">{sublabel}</p>
      )}
    </div>
  );
}

/**
 * Canonical financial summary strip
 */
export function CanonicalFinancialStrip({ projectId, className }) {
  const { canonical, totalsGate, isLoading, error } = useProjectFinancialSnapshot(projectId);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-4 bg-gray-800/50 rounded-lg", className)}>
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-400 text-sm">Loading financials...</span>
      </div>
    );
  }

  if (error || !canonical) {
    return (
      <div className={cn("flex items-center gap-2 p-4 bg-red-900/20 rounded-lg border border-red-800", className)}>
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-red-300 text-sm">Failed to load financial data</span>
      </div>
    );
  }

  const gateValidation = validateTotalsGate({ totals_gate: totalsGate });

  return (
    <div className={cn("space-y-3", className)}>
      {/* Totals Gate Warning */}
      {!gateValidation.valid && (
        <div className="flex items-center gap-2 p-2 bg-amber-900/20 rounded border border-amber-700">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-amber-300 text-xs">
            Financial reconciliation warning: {gateValidation.reason}
          </span>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <FinancialMetric
          label="Planned Retail"
          value={canonical.planned_retail}
          variant="default"
        />
        <FinancialMetric
          label="Total Invoiced"
          value={canonical.total_invoiced}
          variant="default"
        />
        <FinancialMetric
          label="Total Paid"
          value={canonical.total_paid}
          variant="positive"
        />
        <FinancialMetric
          label="Outstanding"
          value={canonical.outstanding_invoice_balance}
          variant={canonical.outstanding_invoice_balance > 0 ? "warning" : "muted"}
        />
        <FinancialMetric
          label="Credit Available"
          value={canonical.credit_available}
          variant={canonical.credit_available > 0 ? "positive" : "muted"}
        />
        <FinancialMetric
          label="Credit Applied"
          value={canonical.credit_applied}
          variant="positive"
        />
        <FinancialMetric
          label="Remaining to Bill"
          value={canonical.remaining_to_bill}
          variant={canonical.remaining_to_bill > 0 ? "warning" : "muted"}
        />
        <FinancialMetric
          label="Net Exposure"
          value={canonical.net_exposure}
          variant={canonical.net_exposure > 0 ? "negative" : "positive"}
          size="md"
        />
      </div>

      {/* Gate Status Indicator */}
      <div className="flex items-center gap-2 text-xs">
        {gateValidation.valid ? (
          <>
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span className="text-green-400">Financials reconciled</span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <span className="text-amber-400">Reconciliation mismatch</span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Compact credit summary for modals
 */
export function CreditSummaryCompact({ projectId, className }) {
  const { canonical, isLoading } = useProjectFinancialSnapshot(projectId);

  if (isLoading || !canonical) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-4 text-sm", className)}>
      <div>
        <span className="text-gray-500">Available: </span>
        <span className="text-green-400 font-mono font-semibold">
          {formatCurrencyUSD(canonical.credit_available)}
        </span>
      </div>
      <div>
        <span className="text-gray-500">Applied: </span>
        <span className="text-blue-400 font-mono">
          {formatCurrencyUSD(canonical.credit_applied)}
        </span>
      </div>
      <div>
        <span className="text-gray-500">Net Exposure: </span>
        <span className={cn(
          "font-mono font-semibold",
          canonical.net_exposure > 0 ? "text-amber-400" : "text-green-400"
        )}>
          {formatCurrencyUSD(canonical.net_exposure)}
        </span>
      </div>
    </div>
  );
}

/**
 * Diagnostic panel for debugging
 */
export function FinancialDiagnosticsPanel({ projectId }) {
  const { snapshot, diagnostics, isLoading, error } = useProjectFinancialSnapshot(
    projectId, 
    { includeDiagnostics: true }
  );

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
        Loading diagnostics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 rounded border border-red-700 text-red-300">
        Error: {error.message}
      </div>
    );
  }

  if (!diagnostics) {
    return (
      <div className="p-4 text-gray-400">No diagnostics available</div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-gray-900 rounded-lg border border-gray-700 text-sm font-mono">
      <h3 className="font-semibold text-white">Financial Diagnostics</h3>

      {/* Canonical Values */}
      <div>
        <h4 className="text-gray-400 mb-2">Canonical Values</h4>
        <pre className="bg-gray-800 p-3 rounded text-xs overflow-auto">
          {JSON.stringify(snapshot.canonical, null, 2)}
        </pre>
      </div>

      {/* Totals Gate */}
      <div>
        <h4 className="text-gray-400 mb-2">Totals Gate</h4>
        <pre className={cn(
          "p-3 rounded text-xs overflow-auto",
          snapshot.totals_gate?.passes ? "bg-green-900/30" : "bg-red-900/30"
        )}>
          {JSON.stringify(snapshot.totals_gate, null, 2)}
        </pre>
      </div>

      {/* Mismatches */}
      {diagnostics.mismatches?.length > 0 && (
        <div>
          <h4 className="text-red-400 mb-2">⚠️ Mismatches Detected</h4>
          <ul className="space-y-1">
            {diagnostics.mismatches.map((m, i) => (
              <li key={i} className="text-red-300">
                {m.check}: {formatCurrencyUSD(m.delta)} delta
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Raw Totals */}
      <details className="cursor-pointer">
        <summary className="text-gray-400">Raw Totals (click to expand)</summary>
        <pre className="bg-gray-800 p-3 rounded text-xs overflow-auto mt-2">
          {JSON.stringify(diagnostics.raw_totals, null, 2)}
        </pre>
      </details>

      {/* Deltas */}
      <details className="cursor-pointer">
        <summary className="text-gray-400">Delta Checks (click to expand)</summary>
        <pre className="bg-gray-800 p-3 rounded text-xs overflow-auto mt-2">
          {JSON.stringify(diagnostics.deltas, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default CanonicalFinancialStrip;