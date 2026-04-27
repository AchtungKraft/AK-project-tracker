import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { TrendingUp, Zap, AlertTriangle } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * InlinePricingSuggestion — Compact matrix pricing guidance for inline line items.
 *
 * Shows suggested retail from RetailMarkupMatrix with "Apply" button.
 * NEVER auto-applies. User clicks to accept. Option A safe.
 *
 * Props:
 *   cost         — cost string from input
 *   billingRate  — billing rate string from input
 *   onApply      — (suggestedRetail: number) => void
 */
export default function InlinePricingSuggestion({ cost, billingRate, onApply }) {
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

    if (lastCostRef.current === costNum) return;

    debounceRef.current = setTimeout(async () => {
      lastCostRef.current = costNum;
      setLoading(true);
      try {
        const res = await base44.functions.invoke("computeServiceMatrixPreview", { cost: costNum });
        setPreview(res.data);
      } catch {
        setPreview(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [costNum]);

  if (costNum <= 0) return null;
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-blue-400/60 mt-1">
        <div className="w-2.5 h-2.5 border border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
        Loading suggestion...
      </div>
    );
  }
  if (!preview || !preview.available) return null;

  const { suggested_retail, margin_pct, markup_pct, tier_label } = preview;
  const isApplied = rateNum > 0 && Math.abs(rateNum - suggested_retail) < 0.01;
  const hasUserRate = rateNum > 0;
  const userMargin = hasUserRate ? ((rateNum - costNum) / rateNum) * 100 : 0;
  const belowTarget = hasUserRate && rateNum < suggested_retail;

  return (
    <div className="mt-1.5 p-2 rounded border border-dashed border-blue-800/40 bg-blue-950/15 space-y-1.5">
      {/* Suggestion row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px]">
          <TrendingUp className="w-3 h-3 text-blue-400" />
          <span className="text-gray-400">Suggested:</span>
          <span className="text-blue-300 font-mono font-semibold">{formatCurrencyUSD(suggested_retail)}</span>
          <span className="text-gray-500">({markup_pct}% markup · {margin_pct}% margin)</span>
        </div>
        {!isApplied && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-5 text-[9px] px-1.5 border-blue-700/50 text-blue-400 hover:bg-blue-950/40 gap-0.5"
            onClick={() => onApply(suggested_retail)}
          >
            <Zap className="w-2 h-2" />
            Apply
          </Button>
        )}
        {isApplied && (
          <span className="text-[9px] text-emerald-500">✓ Applied</span>
        )}
      </div>

      {/* Deviation warning when user has a different rate */}
      {hasUserRate && !isApplied && (
        <div className={`flex items-center gap-1 text-[9px] ${belowTarget ? "text-amber-400" : "text-emerald-400"}`}>
          {belowTarget && <AlertTriangle className="w-2.5 h-2.5 shrink-0" />}
          <span>
            Current: {formatCurrencyUSD(rateNum)} ({userMargin.toFixed(1)}% margin)
            {belowTarget ? " — below target" : " — above target"}
          </span>
        </div>
      )}
    </div>
  );
}