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
import { toast } from "@/components/ui/use-toast";
import { extractRefreshContext } from "@/components/supply/forceAppRefresh";
import { refreshForGenericSupply } from "@/components/supply/tieredSupplyRefresh";
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

  const [actionId] = useState(() => crypto.randomUUID());
  const requiredTotal = commitment?.required_total ?? 0;
  const existingRemoved = commitment?.qty_removed ?? 0;
  const installedQty = commitment?.qty_installed ?? 0;
  const reservedFromStock = commitment?.reserved_from_stock ?? 0;
  const coveredFromPO = commitment?.covered_from_po ?? 0;
  const coveredExternal = commitment?.covered_from_external ?? 0;
  // Mirrors server rule: installed and PO/external-covered units cannot be removed here
  const maxRemovable = Math.max(0, requiredTotal - existingRemoved - installedQty - coveredFromPO - coveredExternal);
  const [qtyToRemove, setQtyToRemove] = useState(maxRemovable);

  const invoicedAmount = commitment?.invoiced_amount ?? 0;
  const isInvoiced = invoicedAmount > 0;
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

  // Reserved units released back to available stock (physical count unchanged)
  const safeReturnQty = useMemo(() => {
    const remainingAfter = requiredTotal - existingRemoved - qtyToRemove;
    return Math.max(0, reservedFromStock - Math.max(0, Math.min(reservedFromStock, remainingAfter)));
  }, [qtyToRemove, reservedFromStock, requiredTotal, existingRemoved]);

  const costReduction = useMemo(() => Math.round(unitCost * qtyToRemove * 100) / 100, [unitCost, qtyToRemove]);
  const retailReduction = useMemo(() => Math.round(unitRetail * qtyToRemove * 100) / 100, [unitRetail, qtyToRemove]);

  const removeMutation = useMutation({
    mutationFn: async () => {
      let response;
      try {
        response = await base44.functions.invoke("removeProjectPartWithCredit", {
          project_id: commitment.project_id,
          commitment_id: commitment.id,
          disposition,
          reason: reason || (isInvoiced ? "Part removed with credit" : "Part removed from project"),
          quantity_to_remove: qtyToRemove,
          action_id: actionId,
          expected_qty_removed: existingRemoved,
        });
      } catch (e) {
        throw new Error(e?.response?.data?.error || e?.message || "Failed to remove part");
      }
      if (!response.data?.success) {
        throw new Error(response.data?.error || "Failed to remove part");
      }
      return response.data;
    },
    onSuccess: async (data) => {
      setSuccessResult(data);
      toast({
        title: data.is_full_removal ? "Part removed from build" : `Removed ${data.qty_removed} unit${data.qty_removed > 1 ? "s" : ""}`,
        description: data.credit_created ? `Credit of ${formatCurrencyUSD(data.credit_amount)} created.` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["projectFinancialOverview", commitment.project_id] });
      // TIERED REFRESH: Part removal uses generic supply (T1+T4)
      const context = extractRefreshContext(data, {
        part_id: commitment.part_id,
        project_id: commitment.project_id,
        commitment_id: commitment.id,
      });
      await refreshForGenericSupply(queryClient, context, data);
      onSuccess?.();
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Part not removed", description: error.message });
    },
  });

  // HARD GUARD (after ALL hooks): Reject non-canonical commitment objects
  if (!commitment || commitment.required_total === undefined) {
    return null;
  }

  const hasInstallWarning = installedQty > 0 || coveredFromPO > 0 || coveredExternal > 0;
  const isValidQty = Number.isInteger(qtyToRemove) && qtyToRemove > 0 && qtyToRemove <= maxRemovable;
  const handleClose = () => { if (!removeMutation.isPending) onClose(); };

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
    <Dialog open onOpenChange={handleClose}>
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
              {requiredTotal} total · {installedQty} installed · {coveredFromPO + coveredExternal} on order · {existingRemoved} previously removed · {maxRemovable} removable
            </p>
            {maxRemovable === 0 && (
              <p className="text-xs text-amber-400">Nothing can be removed here. Reverse the install or reduce the purchase order first.</p>
            )}
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
                {installedQty > 0 && `${installedQty} installed. `}
                {coveredFromPO + coveredExternal > 0 && `${coveredFromPO + coveredExternal} on order. `}
                These units stay on the build and can't be removed here.
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
                    {safeReturnQty > 0 ? `${safeReturnQty} reserved unit${safeReturnQty > 1 ? 's' : ''} released to available stock` : "No reserved units to release"}
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
          <Button variant="outline" onClick={handleClose} disabled={removeMutation.isPending} className="border-gray-600">
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