import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Zap, AlertTriangle } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * MatrixPricingPreview — Non-blocking pricing guidance panel
 * 
 * Shows suggested retail from the RetailMarkupMatrix based on current cost.
 * NEVER auto-applies. User must click "Apply" buttons explicitly.
 * 
 * Props:
 *   cost           — current cost value (number)
 *   billingRate    — current billing rate value (number)
 *   onApplyRetail  — (suggestedRetail, tierId) => void
 *   onApplyBoth    — (cost, suggestedRetail, tierId) => void
 */
export default function MatrixPricingPreview({ cost, billingRate, onApplyRetail, onApplyBoth }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const lastCostRef = useRef(null);

  const costNum = parseFloat(cost) || 0;
  const rateNum = parseFloat(billingRate) || 0;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (costNum <= 0) {
      setPreview(null);
      lastCostRef.current = null;
      return;
    }

    // Skip if cost hasn't changed
    if (lastCostRef.current === costNum) return;

    debounceRef.current = setTimeout(async () => {
      lastCostRef.current = costNum;
      setLoading(true);
      try {
        const res = await base44.functions.invoke("computeServiceMatrixPreview", { cost: costNum });
        setPreview(res.data);
      } catch {
        setPreview({ available: false, reason: "Failed to fetch" });
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [costNum]);

  if (costNum <= 0) return null;
  if (loading) {
    return (
      <div className="bg-blue-950/20 border border-blue-800/30 rounded p-2 text-xs text-blue-400/70 flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
        Loading pricing guidance...
      </div>
    );
  }
  if (!preview || !preview.available) return null;

  const { suggested_retail, margin_pct, markup_pct, tier_label, tier_id } = preview;

  // Deviation detection
  const hasDeviation = rateNum > 0 && rateNum !== suggested_retail;
  const userMargin = rateNum > 0 ? ((rateNum - costNum) / rateNum) * 100 : 0;
  const belowTarget = hasDeviation && rateNum < suggested_retail;

  return (
    <div className="bg-blue-950/20 border border-blue-800/30 rounded p-2.5 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium">
          <TrendingUp className="w-3.5 h-3.5" />
          Pricing Guidance
        </div>
        <Badge variant="outline" className="text-[9px] border-blue-700/50 text-blue-400/70 px-1.5 py-0">
          {tier_label}
        </Badge>
      </div>

      {/* Suggested values */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-gray-500">Cost</span>
          <p className="text-white font-mono">{formatCurrencyUSD(costNum)}</p>
        </div>
        <div>
          <span className="text-gray-500">Suggested Retail</span>
          <p className="text-blue-300 font-mono font-semibold">{formatCurrencyUSD(suggested_retail)}</p>
        </div>
        <div>
          <span className="text-gray-500">Target Margin</span>
          <p className="text-blue-300">{margin_pct}%</p>
        </div>
      </div>

      {/* Deviation warning */}
      {hasDeviation && (
        <div className={`flex items-start gap-1.5 text-[10px] rounded px-2 py-1.5 ${
          belowTarget 
            ? "bg-amber-950/30 border border-amber-800/30 text-amber-400" 
            : "bg-emerald-950/30 border border-emerald-800/30 text-emerald-400"
        }`}>
          {belowTarget && <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />}
          <div>
            <span className="font-medium">Your Price: {formatCurrencyUSD(rateNum)}</span>
            <span className="mx-1">·</span>
            <span>Suggested: {formatCurrencyUSD(suggested_retail)}</span>
            <span className="mx-1">·</span>
            <span>Your Margin: {userMargin.toFixed(1)}%{belowTarget ? " (below target)" : ""}</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 text-[10px] border-blue-700/50 text-blue-400 hover:bg-blue-950/40 gap-1"
          onClick={() => onApplyRetail(suggested_retail, tier_id)}
        >
          <Zap className="w-2.5 h-2.5" />
          Apply Suggested Retail
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 text-[10px] border-blue-700/50 text-blue-400 hover:bg-blue-950/40 gap-1"
          onClick={() => onApplyBoth(costNum, suggested_retail, tier_id)}
        >
          <Zap className="w-2.5 h-2.5" />
          Apply Both
        </Button>
      </div>
    </div>
  );
}