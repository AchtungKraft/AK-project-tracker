import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { TrendingUp, Zap, AlertTriangle, Check } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * InlinePricingSuggestion — Compact matrix pricing guidance for inline line items.
 *
 * OPTION A SAFE: Never auto-applies. User clicks to accept.
 * Persists suggested values into parent state via onSuggestionResolved.
 * Shows apply feedback, deviation indicators, and pricing source labels.
 *
 * Props:
 *   cost                  — cost string from input
 *   billingRate           — billing rate string from input
 *   onApply               — (suggestedRetail: number) => void
 *   onSuggestionResolved  — (suggestion: { suggested_retail, suggested_margin, pricing_source } | null) => void
 *   pricingSource         — current pricing_source on the line item ('matrix' | 'fallback' | null)
 */
export default function InlinePricingSuggestion({ cost, billingRate, onApply, onSuggestionResolved, pricingSource }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const debounceRef = useRef(null);
  const lastCostRef = useRef(null);
  const appliedTimerRef = useRef(null);

  const costNum = parseFloat(cost) || 0;
  const rateNum = parseFloat(billingRate) || 0;

  // Clear "Applied" feedback after 2s
  const flashApplied = useCallback(() => {
    setJustApplied(true);
    if (appliedTimerRef.current) clearTimeout(appliedTimerRef.current);
    appliedTimerRef.current = setTimeout(() => setJustApplied(false), 2000);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // PHASE 3: Guard — skip if cost invalid
    if (costNum <= 0) {
      setPreview(null);
      lastCostRef.current = null;
      onSuggestionResolved?.(null);
      return;
    }

    // PHASE 3: Skip if cost hasn't changed
    if (lastCostRef.current === costNum) return;

    debounceRef.current = setTimeout(async () => {
      lastCostRef.current = costNum;
      setLoading(true);
      try {
        const res = await base44.functions.invoke("computeServiceMatrixPreview", { cost: costNum });
        const data = res.data;
        setPreview(data);

        // PHASE 1: Persist suggestion into parent state
        if (data?.available) {
          onSuggestionResolved?.({
            suggested_retail: data.suggested_retail,
            suggested_margin: data.margin_pct,
            pricing_source: data.source || "matrix",
          });
        } else {
          onSuggestionResolved?.(null);
        }
      } catch {
        setPreview(null);
        onSuggestionResolved?.(null);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [costNum]);

  // Cleanup applied timer on unmount
  useEffect(() => () => { if (appliedTimerRef.current) clearTimeout(appliedTimerRef.current); }, []);

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

  // PHASE 10: Deviation indicator
  const deviation = hasUserRate && suggested_retail > 0
    ? ((rateNum - suggested_retail) / suggested_retail) * 100
    : null;

  const handleApplyClick = () => {
    onApply(suggested_retail);
    flashApplied();
  };

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
        {!isApplied && !justApplied && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-5 text-[9px] px-1.5 border-blue-700/50 text-blue-400 hover:bg-blue-950/40 gap-0.5"
            onClick={handleApplyClick}
          >
            <Zap className="w-2 h-2" />
            Apply
          </Button>
        )}
        {/* PHASE 6: Apply feedback */}
        {(isApplied || justApplied) && (
          <span className="flex items-center gap-0.5 text-[9px] text-emerald-500">
            <Check className="w-2.5 h-2.5" />
            Applied
          </span>
        )}
      </div>

      {/* PHASE 10: Deviation indicator with concrete target language */}
      {hasUserRate && !isApplied && deviation !== null && (
        <div className={`flex items-center gap-1 text-[9px] ${
          Math.abs(deviation) <= 5 ? "text-emerald-400" :
          deviation > 5 ? "text-blue-400" : "text-amber-400"
        }`}>
          {deviation < -5 && <AlertTriangle className="w-2.5 h-2.5 shrink-0" />}
          <span>
            {Math.abs(deviation) <= 5 && `On target (${userMargin.toFixed(1)}% margin)`}
            {deviation > 5 && `+${deviation.toFixed(0)}% above suggested (${userMargin.toFixed(1)}% margin)`}
            {deviation < -5 && `${deviation.toFixed(0)}% below suggested (${userMargin.toFixed(1)}% margin)`}
          </span>
        </div>
      )}

      {/* PHASE 7: Pricing source label */}
      {pricingSource === "fallback" && (
        <div className="text-[9px] text-gray-500 italic">Using default estimate — no matrix tier matched</div>
      )}
    </div>
  );
}