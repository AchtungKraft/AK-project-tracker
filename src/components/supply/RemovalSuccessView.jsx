import React, { useState } from "react";
import { DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { cn } from "@/lib/utils";

/**
 * RemovalSuccessView — Clean, calm post-action confirmation.
 * Primary: what happened. Advanced diagnostics collapsed by default.
 */
export default function RemovalSuccessView({ result, onClose }) {
  const [showDetails, setShowDetails] = useState(false);
  const driftDetected = result.post_state?.drift_detected;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-5 h-5" />
          Part Removed
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        {/* Primary Summary — what the user cares about */}
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
          <p className="text-sm text-white">
            <span className="font-semibold">{result.qty_removed}</span>
            {' '}unit{result.qty_removed !== 1 ? 's' : ''} removed from project
          </p>
          {result.qty_remaining > 0 && (
            <p className="text-sm text-gray-400">
              {result.qty_remaining} remaining on this item
            </p>
          )}
        </div>

        {/* Compact changes */}
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-1.5">
          <Row label="Project cost reduced" value={formatCurrencyUSD(result.cost_reduction ?? 0)} color="text-red-400" />
          <Row label="Client total reduced" value={formatCurrencyUSD(result.retail_reduction ?? 0)} color="text-red-400" />
          {result.credit_created ? (
            <Row label="Client credit" value={formatCurrencyUSD(result.credit_amount)} color="text-amber-400" bold />
          ) : null}
          <Row
            label="Inventory"
            value={result.inventory_returned ? `${result.inventory_return_qty} returned to stock` : "No change"}
            color={result.inventory_returned ? "text-blue-400" : "text-gray-500"}
          />
        </div>

        {/* Status banner */}
        {driftDetected ? (
          <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-red-400 font-medium">Totals need review</p>
              <p className="text-gray-400 text-xs">
                A discrepancy of {formatCurrencyUSD(result.post_state?.drift_delta ?? 0)} was detected. Check Financial Exceptions.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-2.5 bg-emerald-900/20 border border-emerald-700/30 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-400">Project updated successfully.</span>
          </div>
        )}

        {/* Collapsed advanced details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-400 transition-colors w-full"
        >
          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showDetails ? "Hide details" : "Show details"}
        </button>

        {showDetails && (
          <div className="text-[10px] font-mono text-gray-500 bg-gray-800/30 rounded p-2.5 space-y-1">
            {result.qty_removed_cumulative > result.qty_removed && (
              <div className="flex justify-between">
                <span>Total removed (cumulative)</span>
                <span>{result.qty_removed_cumulative}</span>
              </div>
            )}
            {result.calculation_method && result.calculation_method !== 'none' && (
              <div className="flex justify-between">
                <span>Credit method</span>
                <span>{result.calculation_method === 'line_based_uniform' ? 'Line-based' : result.calculation_method === 'line_based_mixed' ? 'Line-based (mixed)' : 'Average'}</span>
              </div>
            )}
            {result.installed_qty_at_removal > 0 && (
              <div className="flex justify-between">
                <span>Installed at removal</span>
                <span>{result.installed_qty_at_removal}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Removal type</span>
              <span>{result.is_full_removal ? "Full" : "Partial"}</span>
            </div>
            {result.post_state && (
              <>
                <div className="border-t border-gray-700/50 my-1 pt-1 flex justify-between">
                  <span>Post-state cost</span>
                  <span>{formatCurrencyUSD(result.post_state.planned_cost ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Post-state retail</span>
                  <span>{formatCurrencyUSD(result.post_state.planned_retail ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Invoiced</span>
                  <span>{formatCurrencyUSD(result.post_state.invoiced_total ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Credits</span>
                  <span>{formatCurrencyUSD(result.post_state.credit_total ?? 0)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button onClick={onClose} className="bg-gray-700 hover:bg-gray-600">
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

function Row({ label, value, color, bold }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={cn("font-mono", bold && "font-bold", color || "text-white")}>
        {value}
      </span>
    </div>
  );
}