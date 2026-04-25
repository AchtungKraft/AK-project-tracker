import React from "react";
import { DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { cn } from "@/lib/utils";

/**
 * RemovalSuccessView — Post-action confirmation screen
 *
 * Displays: qty removed, credit amount + method, inventory change,
 * cost/retail reduction, drift status, and financial post-state.
 */
export default function RemovalSuccessView({ result, onClose }) {
  const driftDetected = result.post_state?.drift_detected;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-5 h-5" />
          Part Removed Successfully
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        {/* Primary Summary */}
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
          <Row label="Quantity removed" value={result.qty_removed} bold />
          {result.qty_remaining > 0 && (
            <Row label="Remaining on commitment" value={result.qty_remaining} />
          )}
          {result.qty_removed_cumulative > result.qty_removed && (
            <Row label="Total removed (cumulative)" value={result.qty_removed_cumulative} muted />
          )}
        </div>

        {/* Financial Impact */}
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Financial Impact</p>
          <Row label="Planned cost reduced by" value={formatCurrencyUSD(result.cost_reduction ?? 0)} color="text-red-400" />
          <Row label="Planned revenue reduced by" value={formatCurrencyUSD(result.retail_reduction ?? 0)} color="text-red-400" />
          {result.credit_created ? (
            <Row label="Credit created" value={formatCurrencyUSD(result.credit_amount)} color="text-amber-400" bold />
          ) : (
            <Row label="Credit" value="None (not invoiced)" muted />
          )}
          {result.calculation_method && result.calculation_method !== 'none' && (
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-500">Calculation method</span>
              <Badge variant="outline" className={cn(
                "text-[9px] px-1.5 py-0",
                result.calculation_method.includes('line_based') ? "border-emerald-600 text-emerald-400" : "border-amber-600 text-amber-400"
              )}>
                {result.calculation_method === 'line_based_uniform' && 'Line-based (uniform)'}
                {result.calculation_method === 'line_based_mixed' && 'Line-based (mixed pricing)'}
                {result.calculation_method === 'average_fallback' && 'Average (no lines)'}
              </Badge>
            </div>
          )}
        </div>

        {/* Inventory */}
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Inventory</p>
          <Row
            label="Inventory returned"
            value={result.inventory_returned ? `${result.inventory_return_qty} unit${result.inventory_return_qty > 1 ? 's' : ''}` : "No change"}
            color={result.inventory_returned ? "text-blue-400" : undefined}
          />
          {result.installed_qty_at_removal > 0 && (
            <Row label="Installed (not returned)" value={`${result.installed_qty_at_removal} unit${result.installed_qty_at_removal > 1 ? 's' : ''}`} muted />
          )}
          <Row label="Type" value={result.is_full_removal ? "Full Removal" : "Partial Removal"}
            color={result.is_full_removal ? "text-red-400" : "text-purple-400"} />
        </div>

        {/* Drift Warning */}
        {driftDetected && (
          <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-red-400 font-medium">Financial drift detected after removal</p>
              <p className="text-gray-400">
                Delta: {formatCurrencyUSD(result.post_state?.drift_delta ?? 0)}.
                Check Financial Exceptions dashboard.
              </p>
            </div>
          </div>
        )}

        {!driftDetected && (
          <div className="p-3 bg-emerald-900/20 border border-emerald-700/30 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-400">Financials updated — no drift detected</span>
          </div>
        )}

        {/* Post-State Summary (compact) */}
        <div className="text-[10px] font-mono text-gray-500 px-1 flex flex-wrap gap-x-3">
          <span>Cost: {formatCurrencyUSD(result.post_state?.planned_cost ?? 0)}</span>
          <span>Rev: {formatCurrencyUSD(result.post_state?.planned_retail ?? 0)}</span>
          <span>Invoiced: {formatCurrencyUSD(result.post_state?.invoiced_total ?? 0)}</span>
          <span>Credits: {formatCurrencyUSD(result.post_state?.credit_total ?? 0)}</span>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={onClose} className="bg-gray-700 hover:bg-gray-600">
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

function Row({ label, value, color, bold, muted }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={muted ? "text-gray-500" : "text-gray-400"}>{label}</span>
      <span className={cn(
        "font-mono",
        bold && "font-bold",
        color || (muted ? "text-gray-500" : "text-white")
      )}>
        {value}
      </span>
    </div>
  );
}