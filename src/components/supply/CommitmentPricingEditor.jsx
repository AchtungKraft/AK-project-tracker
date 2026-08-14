import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, DollarSign, RotateCcw, Lock, AlertTriangle, Calculator, Pencil } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { refreshForGenericSupply } from "@/components/supply/tieredSupplyRefresh";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { CostModeBadge, RetailModeBadge } from "@/components/supply/PricingModeBadge";

/**
 * CommitmentPricingEditor - Modal for editing cost/retail on a commitment
 * 
 * CANONICAL PRICING RULES:
 * - In MATRIX mode, retail is always freshly computed from the current cost via computeRetailFromMatrix.
 * - In MANUAL mode, the user sets retail directly; matrix is not consulted.
 * - Save always persists: unit_cost_snapshot, unit_retail_snapshot, retail_override flag, and derived totals.
 * - "Use Matrix Pricing" recalculates retail from current effective cost, clears retail_override.
 * - "Reset to PO Cost" syncs cost from PO, then recalculates retail if in matrix mode.
 * - All changes update the PartCommitment entity directly — this is PROJECT pricing, not Part master.
 */
export default function CommitmentPricingEditor({ commitment, open, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [unitCost, setUnitCost] = useState(String(commitment?.unit_cost_snapshot ?? commitment?.unit_cost ?? 0));
  const [unitRetail, setUnitRetail] = useState(String(commitment?.unit_retail_snapshot ?? commitment?.unit_retail ?? 0));
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState(null);
  const [matrixTierLabel, setMatrixTierLabel] = useState(null);
  
  // Retail mode: 'matrix' = auto from markup matrix, 'manual' = editable
  const isRetailManual = commitment?.retail_override === true;
  const [retailMode, setRetailMode] = useState(isRetailManual ? 'manual' : 'matrix');

  const isLocked = ['invoiced', 'paid'].includes(commitment?.billing_status);
  const hasPO = (commitment?.order_line_item_ids || []).length > 0 || (commitment?.qty_ordered ?? 0) > 0;
  const costVal = parseFloat(unitCost) || 0;
  const retailVal = parseFloat(unitRetail) || 0;
  const reqTotal = commitment?.required_total ?? 0;
  const margin = retailVal > 0 ? ((retailVal - costVal) / retailVal * 100).toFixed(1) : null;

  // CANONICAL: Compute matrix retail from current cost whenever cost changes in matrix mode
  const computeMatrixRetail = useCallback(async (cost) => {
    if (cost <= 0) {
      setMatrixError('Cost must be > 0 for matrix pricing');
      return;
    }
    setMatrixLoading(true);
    setMatrixError(null);
    try {
      const raw = await base44.functions.invoke("computeRetailFromMatrix", { cost });
      const result = raw?.data ?? raw;
      if (result.success) {
        setUnitRetail(String(result.retail_matrix_price));
        setMatrixTierLabel(result.tier_label);
        setMatrixError(null);
      } else {
        setMatrixError(result.error || 'Matrix computation failed');
      }
    } catch (err) {
      setMatrixError(err.message);
    } finally {
      setMatrixLoading(false);
    }
  }, []);

  // When switching to matrix mode or when cost changes in matrix mode, recompute retail
  useEffect(() => {
    if (retailMode === 'matrix' && costVal > 0) {
      computeMatrixRetail(costVal);
    }
  }, [retailMode, costVal, computeMatrixRetail]);

  const handleSavePricing = async () => {
    setSaving(true);
    const finalRetail = parseFloat(unitRetail) || 0;
    const updates = {
      unit_cost_snapshot: costVal,
      planned_cost_total: costVal * reqTotal,
      unit_retail_snapshot: finalRetail,
      planned_retail_total: finalRetail * reqTotal,
    };

    // Set override flags based on mode
    const origCost = commitment?.unit_cost_snapshot ?? 0;
    if (Math.abs(costVal - origCost) > 0.001) {
      updates.cost_override = true;
    }
    // Retail override flag follows the retail mode selector
    updates.retail_override = retailMode === 'manual';

    // Compute margin
    if (finalRetail > 0) {
      updates.margin_pct = Math.round(((finalRetail - costVal) / finalRetail) * 10000) / 100;
    } else {
      updates.margin_pct = 0;
    }

    // Pricing integrity
    if (costVal > 0 && finalRetail > 0 && finalRetail >= costVal) {
      updates.pricing_integrity_status = updates.retail_override ? 'overridden_retail' : 'ok';
    } else if (costVal > 0 && finalRetail > 0 && finalRetail < costVal) {
      updates.pricing_integrity_status = 'margin_negative';
    } else if (costVal > 0 && finalRetail <= 0) {
      updates.pricing_integrity_status = 'missing_retail';
    } else if (costVal <= 0) {
      updates.pricing_integrity_status = 'missing_cost';
    }

    try {
      await base44.entities.PartCommitment.update(commitment.id, updates);
      toast({ title: "Pricing updated", description: `Cost: ${formatCurrencyUSD(costVal)} · Retail: ${formatCurrencyUSD(finalRetail)}` });
      await refreshForGenericSupply(queryClient, {
        partIds: commitment.part_id ? [commitment.part_id] : [],
        projectIds: commitment.project_id ? [commitment.project_id] : [],
        commitmentIds: [commitment.id],
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast({ title: "Failed to update pricing", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncFromPO = async () => {
    setSyncing(true);
    try {
      // Clear cost override so sync can write
      await base44.entities.PartCommitment.update(commitment.id, { cost_override: false });
      // Sync cost from PO lines
      const syncRaw = await base44.functions.invoke("syncPOCostToCommitment", {
        commitment_id: commitment.id,
        skip_retail_update: true, // We handle retail ourselves below
      });
      const syncResult = syncRaw?.data ?? syncRaw;
      // Get the synced cost
      const syncedItem = syncResult.synced?.[0];
      const newCost = syncedItem?.new_cost ?? costVal;
      setUnitCost(String(newCost));
      // If in matrix mode, the useEffect will auto-recompute retail from new cost
      if (retailMode !== 'matrix') {
        // Manual mode: cost changed but retail stays — just update the display
      }
      toast({ title: "Cost synced from PO", description: `New cost: ${formatCurrencyUSD(newCost)}` });
      await refreshForGenericSupply(queryClient, {
        partIds: commitment.part_id ? [commitment.part_id] : [],
        projectIds: commitment.project_id ? [commitment.project_id] : [],
        commitmentIds: [commitment.id],
      });
    } catch (err) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleUseMatrixPricing = async () => {
    setRetailMode('matrix');
    // The useEffect triggered by retailMode change will compute fresh matrix retail
    // User still needs to click Save to persist
  };

  if (!commitment) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            Edit Pricing
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {commitment.part?.part_name || commitment.part_name || "Commitment"} × {reqTotal}
          </DialogDescription>
        </DialogHeader>

        {isLocked && (
          <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-700/30 rounded text-red-300 text-xs">
            <Lock className="w-4 h-4 shrink-0" />
            Pricing locked after billing ({commitment.billing_status})
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Pricing Mode Badges */}
          <div className="flex gap-2 flex-wrap">
            <CostModeBadge commitment={commitment} />
            <RetailModeBadge commitment={commitment} />
          </div>

          {/* Unit Cost */}
          <div>
            <Label className="text-gray-300 text-xs">Unit Cost</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={e => setUnitCost(e.target.value)}
                className="bg-gray-800 border-gray-600 text-white pl-7"
                disabled={isLocked}
              />
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              Total: {formatCurrencyUSD(costVal * reqTotal)}
            </p>
          </div>

          {/* Retail Mode Selector */}
          <div>
            <Label className="text-gray-300 text-xs mb-1.5 block">Retail Pricing Mode</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setRetailMode('matrix')}
                disabled={isLocked}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors",
                  retailMode === 'matrix'
                    ? "bg-blue-900/40 border-blue-600 text-blue-300"
                    : "bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500"
                )}
              >
                <Calculator className="w-3 h-3" />
                Matrix Pricing
              </button>
              <button
                onClick={() => setRetailMode('manual')}
                disabled={isLocked}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors",
                  retailMode === 'manual'
                    ? "bg-amber-900/40 border-amber-600 text-amber-300"
                    : "bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500"
                )}
              >
                <Pencil className="w-3 h-3" />
                Manual Pricing
              </button>
            </div>
          </div>

          {/* Unit Retail */}
          <div>
            <Label className="text-gray-300 text-xs">Unit Retail</Label>
            {retailMode === 'matrix' ? (
              <div className="mt-1 px-3 py-2 bg-blue-900/10 border border-blue-800/30 rounded text-sm font-mono">
                {matrixLoading ? (
                  <span className="text-blue-400 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Computing…
                  </span>
                ) : matrixError ? (
                  <span className="text-red-400 text-xs">{matrixError}</span>
                ) : (
                  <span className="text-blue-300">
                    {formatCurrencyUSD(retailVal)}
                    <span className="text-[10px] text-blue-400/60 ml-1">
                      (matrix{matrixTierLabel ? ` · ${matrixTierLabel}` : ''})
                    </span>
                  </span>
                )}
              </div>
            ) : (
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitRetail}
                  onChange={e => setUnitRetail(e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white pl-7"
                  disabled={isLocked}
                />
              </div>
            )}
            <p className="text-[10px] text-gray-500 mt-1">
              Total: {formatCurrencyUSD(retailVal * reqTotal)}
            </p>
          </div>

          {/* Margin indicator */}
          {margin !== null && (
            <div className={cn(
              "text-xs font-mono px-3 py-1.5 rounded border",
              parseFloat(margin) >= 0 
                ? "bg-emerald-900/20 border-emerald-700/30 text-emerald-400"
                : "bg-red-900/20 border-red-700/30 text-red-400"
            )}>
              Margin: {margin}%
              {parseFloat(margin) < 0 && (
                <span className="ml-2 flex items-center gap-1 inline-flex">
                  <AlertTriangle className="w-3 h-3" /> Negative
                </span>
              )}
            </div>
          )}

          <Separator className="bg-gray-700" />

          {/* Reset Actions */}
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Reset Actions</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncFromPO}
                disabled={isLocked || syncing || !hasPO}
                className="border-gray-600 text-gray-300 text-xs gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                {syncing ? "Syncing..." : "Reset to PO Cost"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUseMatrixPricing}
                disabled={isLocked || syncing || matrixLoading}
                className="border-blue-700 text-blue-300 text-xs gap-1"
              >
                <Calculator className="w-3 h-3" />
                Use Matrix Pricing
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button
            onClick={handleSavePricing}
            disabled={saving || isLocked || matrixLoading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
            Save Pricing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}