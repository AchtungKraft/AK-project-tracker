import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, AlertTriangle, DollarSign, TrendingUp, Calculator } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * PricingModeEditor - PHASE 15 Pricing Control Component
 * 
 * Enforces HARD pricing_mode invariants:
 * - Matrix: retail_override=null, applied_markup_pct set
 * - Manual: retail_override set, applied_markup_pct=null
 * 
 * UI:
 * - Toggle between Matrix/Manual mode
 * - Matrix shows: Cost, Applied Markup %, Computed Retail (read-only)
 * - Manual shows: Cost, Manual Retail input
 * - Pricing badges: MATRIX, OVERRIDE, NO COST, NEGATIVE MARGIN
 * 
 * Validation:
 * - Blocks save if pricing_mode=matrix AND cost <= 0
 * - Blocks save if pricing_mode=manual AND retail_override <= 0
 */
export default function PricingModeEditor({ part, onPricingChange }) {
  const queryClient = useQueryClient();
  const [pricingMode, setPricingMode] = useState(part?.pricing_mode || 'matrix');
  const [cost, setCost] = useState(part?.cost || 0);
  const [retailOverride, setRetailOverride] = useState(part?.retail_override || null);
  const [computing, setComputing] = useState(false);
  const [matrixResult, setMatrixResult] = useState(null);

  // Fetch matrix result when cost changes in matrix mode
  useEffect(() => {
    if (pricingMode === 'matrix' && cost > 0) {
      setComputing(true);
      base44.functions.invoke('computeRetailFromMatrix', { cost })
        .then(res => {
          if (res.data.success) {
            setMatrixResult(res.data);
          } else {
            setMatrixResult({ error: res.data.error || res.data.message });
          }
        })
        .catch(err => {
          setMatrixResult({ error: err.message });
        })
        .finally(() => setComputing(false));
    } else {
      setMatrixResult(null);
    }
  }, [cost, pricingMode]);

  // Compute effective retail for display
  const retail_effective = pricingMode === 'manual' 
    ? retailOverride 
    : (matrixResult?.retail_matrix_price || part?.retail_matrix_price || 0);

  // Compute margin
  const margin = cost > 0 && retail_effective > 0
    ? ((retail_effective - cost) / retail_effective) * 100
    : null;

  // Validation states
  const hasCost = cost > 0;
  const hasRetail = retail_effective > 0;
  const hasNegativeMargin = margin !== null && margin < 0;
  const isValid = pricingMode === 'matrix' 
    ? hasCost && hasRetail
    : hasRetail;

  // Notify parent of changes
  useEffect(() => {
    const pricingData = {
      pricing_mode: pricingMode,
      cost,
      retail_override: pricingMode === 'manual' ? retailOverride : null,
      retail_matrix_price: pricingMode === 'matrix' ? matrixResult?.retail_matrix_price : null,
      applied_markup_pct: pricingMode === 'matrix' ? matrixResult?.applied_markup_pct : null,
      retail_effective,
      is_valid: isValid
    };
    onPricingChange?.(pricingData);
  }, [pricingMode, cost, retailOverride, matrixResult, isValid]);

  return (
    <div className="space-y-4 p-4 bg-gray-800/20 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Pricing Configuration
        </h4>
        <div className="flex items-center gap-2">
          {/* Pricing Mode Badges */}
          {pricingMode === 'matrix' && (
            <Badge className="bg-blue-600 text-white">
              <Calculator className="w-3 h-3 mr-1" />
              MATRIX
            </Badge>
          )}
          {pricingMode === 'manual' && (
            <Badge className="bg-purple-600 text-white">
              <TrendingUp className="w-3 h-3 mr-1" />
              OVERRIDE
            </Badge>
          )}
          {!hasCost && (
            <Badge className="bg-red-600 text-white">
              <AlertTriangle className="w-3 h-3 mr-1" />
              NO COST
            </Badge>
          )}
          {hasNegativeMargin && (
            <Badge className="bg-red-700 text-white">
              NEGATIVE MARGIN
            </Badge>
          )}
        </div>
      </div>

      {/* Pricing Mode Toggle */}
      <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded border border-gray-700">
        <div>
          <p className="text-sm text-white font-medium">Use Matrix Pricing</p>
          <p className="text-xs text-gray-400">
            {pricingMode === 'matrix' 
              ? 'Retail auto-calculated from cost using markup matrix' 
              : 'Manual retail price (bypasses matrix)'}
          </p>
        </div>
        <Switch
          checked={pricingMode === 'matrix'}
          onCheckedChange={(checked) => setPricingMode(checked ? 'matrix' : 'manual')}
        />
      </div>

      {/* Cost Input (always visible) */}
      <div>
        <Label className="text-gray-300 text-xs">Cost (What we pay) *</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={cost || ''}
          onChange={(e) => setCost(parseFloat(e.target.value) || 0)}
          className="bg-gray-800 border-gray-700 text-white"
          placeholder="0.00"
        />
        {!hasCost && (
          <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Cost required for pricing
          </p>
        )}
      </div>

      {/* MATRIX MODE */}
      {pricingMode === 'matrix' && (
        <div className="space-y-3 p-3 bg-blue-900/10 border border-blue-700/30 rounded">
          <p className="text-xs text-blue-300 font-medium">Matrix Pricing Mode</p>
          
          {computing ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Computing retail from matrix...
            </div>
          ) : matrixResult?.error ? (
            <div className="text-xs text-red-400">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              {matrixResult.error}
            </div>
          ) : matrixResult ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">Applied Markup</p>
                  <p className="text-white font-semibold">
                    {Math.round((matrixResult.applied_markup_pct || 0) * 100)}%
                  </p>
                  <p className="text-xs text-gray-500">{matrixResult.tier_label}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Computed Retail</p>
                  <p className="text-xl text-blue-400 font-bold">
                    ${matrixResult.retail_matrix_price?.toFixed(2) || '0.00'}
                  </p>
                </div>
              </div>
              {margin !== null && (
                <div className={cn(
                  "text-xs p-2 rounded border",
                  margin >= 0 
                    ? "bg-green-900/20 border-green-700/30 text-green-300"
                    : "bg-red-900/20 border-red-700/30 text-red-300"
                )}>
                  Margin: {margin >= 0 ? '+' : ''}{margin.toFixed(1)}%
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-500">Enter cost to compute retail</p>
          )}
        </div>
      )}

      {/* MANUAL MODE */}
      {pricingMode === 'manual' && (
        <div className="space-y-3 p-3 bg-purple-900/10 border border-purple-700/30 rounded">
          <p className="text-xs text-purple-300 font-medium">Manual Override Mode</p>
          
          <div>
            <Label className="text-gray-300 text-xs">Manual Retail Price *</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={retailOverride || ''}
              onChange={(e) => setRetailOverride(parseFloat(e.target.value) || null)}
              className="bg-gray-800 border-gray-700 text-white"
              placeholder="0.00"
            />
            {(!retailOverride || retailOverride <= 0) && (
              <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Retail required for manual mode
              </p>
            )}
          </div>

          {margin !== null && (
            <div className={cn(
              "text-xs p-2 rounded border",
              margin >= 0 
                ? "bg-green-900/20 border-green-700/30 text-green-300"
                : "bg-red-900/20 border-red-700/30 text-red-300"
            )}>
              Margin: {margin >= 0 ? '+' : ''}{margin.toFixed(1)}%
            </div>
          )}

          <p className="text-xs text-gray-400">
            Matrix would calculate: ${matrixResult?.retail_matrix_price?.toFixed(2) || '—'}
          </p>
        </div>
      )}

      {/* Validation Summary */}
      {!isValid && (
        <div className="bg-red-900/20 border border-red-700/50 rounded p-3">
          <p className="text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {pricingMode === 'matrix' 
              ? 'Matrix pricing requires cost > 0'
              : 'Manual pricing requires retail > 0'}
          </p>
        </div>
      )}
    </div>
  );
}