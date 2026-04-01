import React, { useState } from "react";
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
import { Loader2, DollarSign, RotateCcw, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/**
 * CommitmentPricingEditor - Modal for editing cost/retail on a commitment
 * Supports manual override + reset to PO / matrix
 */
export default function CommitmentPricingEditor({ commitment, open, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [unitCost, setUnitCost] = useState(String(commitment?.unit_cost_snapshot ?? commitment?.unit_cost ?? 0));
  const [unitRetail, setUnitRetail] = useState(String(commitment?.unit_retail_snapshot ?? commitment?.unit_retail ?? 0));
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isLocked = ['invoiced', 'paid'].includes(commitment?.billing_status);
  const hasPO = (commitment?.order_line_item_ids || []).length > 0 || (commitment?.qty_ordered ?? 0) > 0;
  const costVal = parseFloat(unitCost) || 0;
  const retailVal = parseFloat(unitRetail) || 0;
  const reqTotal = commitment?.required_total ?? 0;
  const margin = retailVal > 0 ? ((retailVal - costVal) / retailVal * 100).toFixed(1) : null;

  const handleSavePricing = async () => {
    setSaving(true);
    const updates = {
      unit_cost_snapshot: costVal,
      planned_cost_total: costVal * reqTotal,
      unit_retail_snapshot: retailVal,
      planned_retail_total: retailVal * reqTotal,
    };

    // Set override flags
    const origCost = commitment?.unit_cost_snapshot ?? 0;
    const origRetail = commitment?.unit_retail_snapshot ?? 0;
    if (Math.abs(costVal - origCost) > 0.001) {
      updates.cost_override = true;
    }
    if (Math.abs(retailVal - origRetail) > 0.001) {
      updates.retail_override = true;
    }

    // Compute margin
    if (retailVal > 0) {
      updates.margin_pct = Math.round(((retailVal - costVal) / retailVal) * 10000) / 100;
    }

    // Pricing integrity
    if (costVal > 0 && retailVal > 0 && retailVal >= costVal) {
      updates.pricing_integrity_status = updates.retail_override ? 'overridden_retail' : 'ok';
    } else if (costVal > 0 && retailVal > 0 && retailVal < costVal) {
      updates.pricing_integrity_status = 'margin_negative';
    } else if (costVal > 0 && retailVal <= 0) {
      updates.pricing_integrity_status = 'missing_retail';
    } else if (costVal <= 0) {
      updates.pricing_integrity_status = 'missing_cost';
    }

    try {
      await base44.entities.PartCommitment.update(commitment.id, updates);
      toast.success("Manual override active — pricing updated");
      await forceAppRefresh(queryClient, { commitmentIds: [commitment.id] });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error("Failed to update pricing: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncFromPO = async () => {
    setSyncing(true);
    try {
      await base44.functions.invoke("executeSupplyAction", {
        action_type: "SYNC_PO_COST",
        commitment_ids: [commitment.id],
      });
      // Clear override flags
      await base44.entities.PartCommitment.update(commitment.id, {
        cost_override: false,
      });
      toast.success("Costs updated from PO");
      await forceAppRefresh(queryClient, { commitmentIds: [commitment.id] });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error("Sync failed: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleResetRetail = async () => {
    setSyncing(true);
    try {
      // Sync from PO handles retail recalc from matrix
      await base44.functions.invoke("syncPOCostToCommitment", {
        commitment_id: commitment.id,
        skip_retail_update: false,
      });
      await base44.entities.PartCommitment.update(commitment.id, {
        retail_override: false,
      });
      toast.success("Retail reset from matrix");
      await forceAppRefresh(queryClient, { commitmentIds: [commitment.id] });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error("Reset failed: " + err.message);
    } finally {
      setSyncing(false);
    }
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
            {commitment.part?.part_name || "Commitment"} × {reqTotal}
          </DialogDescription>
        </DialogHeader>

        {isLocked && (
          <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-700/30 rounded text-red-300 text-xs">
            <Lock className="w-4 h-4 shrink-0" />
            Pricing locked after billing ({commitment.billing_status})
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Override indicators */}
          <div className="flex gap-2 flex-wrap">
            {commitment.cost_override && (
              <span className="text-[9px] font-mono uppercase px-2 py-0.5 bg-amber-900/30 text-amber-400 border border-amber-700/50 rounded">
                COST OVERRIDE
              </span>
            )}
            {commitment.retail_override && (
              <span className="text-[9px] font-mono uppercase px-2 py-0.5 bg-amber-900/30 text-amber-400 border border-amber-700/50 rounded">
                RETAIL OVERRIDE
              </span>
            )}
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

          {/* Unit Retail */}
          <div>
            <Label className="text-gray-300 text-xs">Unit Retail</Label>
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
                onClick={handleResetRetail}
                disabled={isLocked || syncing}
                className="border-gray-600 text-gray-300 text-xs gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                {syncing ? "Resetting..." : "Reset Retail from Matrix"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button
            onClick={handleSavePricing}
            disabled={saving || isLocked}
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