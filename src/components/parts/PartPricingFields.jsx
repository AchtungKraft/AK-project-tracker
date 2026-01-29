import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calculator, DollarSign, Percent, AlertTriangle } from "lucide-react";

/**
 * Reusable pricing fields for Add/Edit Part modals
 * Shows pricing mode, cost, retail, and applied markup
 */
export default function PartPricingFields({ 
  defaultCost, 
  defaultRetail, 
  pricingMode, 
  appliedMarkupPct,
  onCostChange,
  onRetailChange,
  onModeChange 
}) {
  // Fetch markup matrix for preview
  const { data: matrixTiers = [] } = useQuery({
    queryKey: ['retailMarkupMatrix'],
    queryFn: () => base44.entities.RetailMarkupMatrix.list(),
  });

  const activeTiers = useMemo(() => 
    matrixTiers.filter(t => t.active !== false).sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0)),
    [matrixTiers]
  );

  // Preview what the matrix would calculate
  const matrixPreview = useMemo(() => {
    if (pricingMode !== 'matrix' || !defaultCost || defaultCost <= 0) return null;
    
    const tier = activeTiers.find(t =>
      defaultCost >= (t.min_cost || 0) &&
      (t.max_cost === null || t.max_cost === undefined || defaultCost < t.max_cost)
    );
    
    if (!tier) return { error: 'No matching tier' };
    
    const retail = Math.round(defaultCost * (1 + (tier.markup_pct || 0)) * 100) / 100;
    return {
      tier,
      retail,
      markup: tier.markup_pct
    };
  }, [defaultCost, pricingMode, activeTiers]);

  const isMatrixMode = pricingMode === 'matrix';
  const hasCost = defaultCost > 0;
  const showCostWarning = !hasCost;

  return (
    <div className="space-y-4">
      {/* Pricing Mode */}
      <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-gray-300 flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Pricing Mode
          </Label>
          <Select value={pricingMode || 'matrix'} onValueChange={onModeChange}>
            <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="matrix">
                <span className="flex items-center gap-2">
                  <Calculator className="w-3 h-3" /> Matrix
                </span>
              </SelectItem>
              <SelectItem value="manual">
                <span className="flex items-center gap-2">
                  <DollarSign className="w-3 h-3" /> Manual
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-gray-500">
          {isMatrixMode 
            ? "Retail price calculated automatically from cost using markup matrix" 
            : "Retail price set manually (not affected by cost changes)"}
        </p>
      </div>

      {/* Cost & Retail Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-gray-400 flex items-center gap-2">
            Default Cost *
            {showCostWarning && (
              <AlertTriangle className="w-3 h-3 text-amber-500" />
            )}
          </Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              type="number"
              step="0.01"
              min="0"
              value={defaultCost || ''}
              onChange={(e) => onCostChange(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className={`pl-8 bg-gray-800 border-gray-700 text-white ${showCostWarning ? 'border-amber-500/50' : ''}`}
            />
          </div>
          {showCostWarning && (
            <p className="text-xs text-amber-500">Cost required for pricing</p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-gray-400 flex items-center gap-2">
            Default Retail
            {isMatrixMode && (
              <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/50">
                Auto
              </Badge>
            )}
          </Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              type="number"
              step="0.01"
              min="0"
              value={isMatrixMode && matrixPreview?.retail ? matrixPreview.retail : (defaultRetail || '')}
              onChange={(e) => onRetailChange(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              disabled={isMatrixMode}
              className={`pl-8 bg-gray-800 border-gray-700 text-white ${isMatrixMode ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          </div>
          {isMatrixMode && (
            <p className="text-xs text-gray-500">Calculated from pricing matrix</p>
          )}
        </div>
      </div>

      {/* Matrix Preview (when matrix mode) */}
      {isMatrixMode && hasCost && matrixPreview && !matrixPreview.error && (
        <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blue-300">
              Tier: <span className="font-medium">{matrixPreview.tier.label}</span>
            </span>
            <span className="flex items-center gap-1 text-blue-400">
              <Percent className="w-3 h-3" />
              {((matrixPreview.markup || 0) * 100).toFixed(0)}% markup
            </span>
          </div>
        </div>
      )}

      {isMatrixMode && hasCost && matrixPreview?.error && (
        <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
          <p className="text-sm text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {matrixPreview.error} - configure markup matrix in Admin
          </p>
        </div>
      )}

      {/* Applied Markup Display (informational) */}
      {appliedMarkupPct != null && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Percent className="w-3 h-3" />
          Last applied markup: {(appliedMarkupPct * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}