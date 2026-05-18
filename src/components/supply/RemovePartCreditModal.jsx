import React, { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertTriangle, Package, Trash2, RotateCcw, Loader2,
  Wrench, Minus, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { cn } from "@/lib/utils";
import RemovalSuccessView from "./RemovalSuccessView";
import RemovalImpactPreview from "./RemovalImpactPreview";

/**
 * RemovePartCreditModal — Hardened Part Removal with Line-Level Credit
 *
 * PHASES 1-9:
 * - Line-level credit accuracy (backend handles mixed pricing)
 * - qty_removed lock — removed quantities cannot be reused
 * - Inventory safety: min(qty_remove, allocated - installed)
 * - Financial impact preview before confirmation
 * - Audit-grade traceability
 * - Pre/post drift validation
 */
export default function RemovePartCreditModal({
  commitment,
  part,
  project,
  onClose,
  onSuccess,
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [disposition, setDisposition] = useState("no_inventory");
  const [successResult, setSuccessResult] = useState(null);

  const requiredTotal = commitment?.required_total ?? 0;
  const existingRemoved = commitment?.qty_removed ?? 0;
  const maxRemovable = requiredTotal - existingRemoved;
  const [qtyToRemove, setQtyToRemove] = useState(maxRemovable);

  const invoicedAmount = commitment?.invoiced_amount ?? 0;
  const isInvoiced = invoicedAmount > 0;
  const installedQty = commitment?.qty_installed ?? 0;
  const reservedFromStock = commitment?.reserved_from_stock ?? 0;
  const coveredFromPO = commitment?.covered_from_po ?? 0;
  const unitCost = commitment?.unit_cost_snapshot ?? commitment?.unit_cost ?? 0;
  const unitRetail = commitment?.unit_retail_snapshot ?? commitment?.unit_retail ?? 0;

  const isFullRemoval = (existingRemoved + qtyToRemove) >= requiredTotal;

  const creditPreview = useMemo(() => {
    if (!isInvoiced || qtyToRemove <= 0) return 0;
    if (requiredTotal <= 0) return 0;
    const unitInvoiced = invoicedAmount / requiredTotal;
    return Math.min(
      Math.round(unitInvoiced * qtyToRemove * 100) / 100,
      invoicedAmount
    );
  }, [isInvoiced, invoicedAmount, requiredTotal, qtyToRemove]);

  const safeReturnQty = useMemo(() => {
    return Math.max(0, Math.min(qtyToRemove, reservedFromStock - installedQty));
  }, [qtyToRemove, reservedFromStock, installedQty]);

  const costReduction = useMemo(() => Math.round(unitCost * qtyToRemove * 100) / 100, [unitCost, qtyToRemove]);
  const retailReduction = useMemo(() => Math.round(unitRetail * qtyToRemove * 100) / 100, [unitRetail, qtyToRemove]);

  const removeMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke("removeProjectPartWithCredit", {
        project_id: commitment.project_id,
        commitment_id: commitment.id,
        disposition,
        reason: reason || (isInvoiced ? "Part removed with credit" : "Part removed from project"),
        quantity_to_remove: qtyToRemove,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.error || "Failed to remove part");
      }
      return response.data;
    },
    onSuccess: async (data) => {
      setSuccessResult(data);
      await forceAppRefresh(queryClient, {
        partIds: commitment.part_id ? [commitment.part_id] : [],
        projectIds: commitment.project_id ? [commitment.project_id] : [],
        commitmentIds: [commitment.id],
      });
      onSuccess?.();
    },
    onError: (error) => {
      if (error.message?.includes('drift')) {
        toast.error("Cannot remove: financial drift detected. Run reconciliation first.");
      } else {
        toast.error(`Failed to remove: ${error.message}`);
      }
    },
  });

  // HARD GUARD (after ALL hooks): Reject non-canonical commitment objects
  if (!commitment || commitment.required_total === undefined) {
    return null;
  }

  const hasInstallWarning = installedQty > 0;
  const isValidQty = qtyToRemove > 0 && qtyToRemove <= maxRemovable;

  // ── Success Summary View ──
  if (successResult) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
          <RemovalSuccessView result={successResult} onClose={onClose} />
        </DialogContent>
      </Dialog>
    );
  }

  // ── Main Form View ──
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Trash2 className="w-5 h-5 text-red-400" />
            Remove Part
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Part Info */}
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-white font-medium">
                {part?.part_name || "Unknown Part"}
              </span>
            </div>
            <div className="text-sm text-gray-400">
              Project: {project?.name || "Unknown"}
            </div>
          </div>

          {/* Quantity Selector — clean stepper */}
          <div className="space-y-2">
            <Label className="text-gray-300 text-sm">Quantity to Remove</Label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 border-gray-600"
                onClick={() => setQtyToRemove(Math.max(1, qtyToRemove - 1))}
                disabled={qtyToRemove <= 1}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                min={1}
                max={maxRemovable}
                value={qtyToRemove}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 0;
                  setQtyToRemove(Math.max(0, Math.min(v, maxRemovable)));
                }}
                className="bg-gray-800 border-gray-600 text-white w-20 font-mono text-center text-lg"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 border-gray-600"
                onClick={() => setQtyToRemove(Math.min(maxRemovable, qtyToRemove + 1))}
                disabled={qtyToRemove >= maxRemovable}
              >
                <Plus className="w-4 h-4" />
              </Button>
              <button
                onClick={() => setQtyToRemove(maxRemovable)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
              >
                Remove all ({maxRemovable})
              </button>
            </div>
            {!isValidQty && qtyToRemove !== 0 && (
              <p className="text-xs text-red-400">Must be between 1 and {maxRemovable}</p>
            )}
            <p className="text-xs text-gray-500">
              {requiredTotal} total · {installedQty} installed · {existingRemoved} previously removed · {maxRemovable} removable
            </p>
          </div>

          {/* PHASE 7: Financial Impact Preview */}
          <RemovalImpactPreview
            qtyToRemove={qtyToRemove}
            costReduction={costReduction}
            retailReduction={retailReduction}
            creditPreview={creditPreview}
            isInvoiced={isInvoiced}
            invoicedAmount={invoicedAmount}
            requiredTotal={requiredTotal}
            isFullRemoval={isFullRemoval}
          />

          {/* Install Warning — compact */}
          {hasInstallWarning && (
            <div className="p-2.5 bg-amber-900/20 border border-amber-700/40 rounded-lg flex items-start gap-2">
              <Wrench className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-gray-300">
                {installedQty} unit{installedQty > 1 ? 's' : ''} already installed — won't be returned to stock automatically.
                {disposition === 'return_to_inventory' && safeReturnQty < qtyToRemove && (
                  <span className="text-amber-400"> Only {safeReturnQty} can be returned.</span>
                )}
              </p>
            </div>
          )}

          {/* Inventory Handling — simple radios */}
          <div className="space-y-2">
            <Label className="text-gray-300 text-sm">Inventory Handling</Label>
            <RadioGroup value={disposition} onValueChange={setDisposition} className="space-y-1.5">
              <label className="flex items-center gap-2.5 p-2 rounded-md hover:bg-gray-800/40 cursor-pointer transition-colors">
                <RadioGroupItem value="return_to_inventory" id="return" />
                <div>
                  <span className="text-sm text-white">Return to inventory</span>
                  <p className="text-[11px] text-gray-500">
                    {safeReturnQty > 0 ? `${safeReturnQty} unit${safeReturnQty > 1 ? 's' : ''} back to stock` : "No units available to return"}
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-2.5 p-2 rounded-md hover:bg-gray-800/40 cursor-pointer transition-colors">
                <RadioGroupItem value="no_inventory" id="no_inv" />
                <div>
                  <span className="text-sm text-white">No inventory change</span>
                  <p className="text-[11px] text-gray-500">Stock levels stay the same</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label className="text-gray-300">Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this part being removed?"
              className="bg-gray-800 border-gray-600 text-white"
              rows={2}
            />
          </div>

          {/* Outcome summary — human readable */}
          <div className="p-2.5 bg-gray-800/40 rounded-lg">
            <p className="text-sm text-gray-300">
              {isFullRemoval
                ? "This item will be fully removed from the project."
                : `Project quantity will be reduced by ${qtyToRemove}.`
              }
              {creditPreview > 0 && (
                <span className="text-amber-400"> A credit of ~{formatCurrencyUSD(creditPreview)} will be applied.</span>
              )}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending || !isValidQty}
            className="bg-red-600 hover:bg-red-700"
          >
            {removeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Removing...
              </>
            ) : (
              `Remove ${qtyToRemove} Unit${qtyToRemove > 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}