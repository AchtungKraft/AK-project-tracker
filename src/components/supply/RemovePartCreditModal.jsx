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
  AlertTriangle, Package, DollarSign, Trash2, RotateCcw, Loader2,
  CheckCircle2, Wrench, Info,
} from "lucide-react";
import { toast } from "sonner";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { cn } from "@/lib/utils";

/**
 * RemovePartCreditModal — Quantity-aware Part Removal / Credit
 *
 * PHASES 1-11:
 * - Quantity selector with live credit preview
 * - Proportional credit: (invoiced / required) × qty_removed
 * - Install warning when qty_installed > 0
 * - Disposition selection (return to inventory / no change)
 * - Success summary after action
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

  const requiredTotal = commitment.required_total ?? 0;
  const [qtyToRemove, setQtyToRemove] = useState(requiredTotal);

  const invoicedAmount = commitment.invoiced_amount ?? 0;
  const isInvoiced = invoicedAmount > 0;
  const installedQty = commitment.qty_installed ?? 0;
  const reservedFromStock = commitment.reserved_from_stock ?? 0;
  const isFullRemoval = qtyToRemove >= requiredTotal;

  // PHASE 1: Live proportional credit preview
  const creditPreview = useMemo(() => {
    if (!isInvoiced || qtyToRemove <= 0) return 0;
    const unitInvoiced = invoicedAmount / requiredTotal;
    return Math.min(
      Math.round(unitInvoiced * qtyToRemove * 100) / 100,
      invoicedAmount
    );
  }, [isInvoiced, invoicedAmount, requiredTotal, qtyToRemove]);

  // PHASE 3: Inventory return safety calculation
  const safeReturnQty = useMemo(() => {
    const maxFromReservation = Math.min(qtyToRemove, reservedFromStock);
    return Math.max(0, maxFromReservation - installedQty);
  }, [qtyToRemove, reservedFromStock, installedQty]);

  const hasInstallWarning = installedQty > 0;
  const isValidQty = qtyToRemove > 0 && qtyToRemove <= requiredTotal;

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

  // ── PHASE 8: Success Summary View ──
  if (successResult) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              Part Removed Successfully
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Quantity removed</span>
                <span className="text-white font-mono font-bold">{successResult.qty_removed}</span>
              </div>
              {successResult.qty_remaining > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Remaining on commitment</span>
                  <span className="text-white font-mono">{successResult.qty_remaining}</span>
                </div>
              )}
              {successResult.credit_created && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Credit created</span>
                  <span className="text-amber-400 font-mono font-bold">
                    {formatCurrencyUSD(successResult.credit_amount)}
                  </span>
                </div>
              )}
              {!successResult.credit_created && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Credit</span>
                  <span className="text-gray-500">None (not invoiced)</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Inventory</span>
                <span className={successResult.inventory_returned ? "text-blue-400" : "text-gray-500"}>
                  {successResult.inventory_returned
                    ? `${successResult.inventory_return_qty} returned to stock`
                    : "No change"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Type</span>
                <Badge variant="outline" className={cn(
                  "text-[10px]",
                  successResult.is_full_removal
                    ? "border-red-600 text-red-400"
                    : "border-purple-600 text-purple-400"
                )}>
                  {successResult.is_full_removal ? "Full Removal" : "Partial Removal"}
                </Badge>
              </div>
            </div>

            {/* Drift Warning */}
            {(successResult.post_resolver?.drift_detected || successResult.post_drift?.projects_with_drift > 0) && (
              <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-red-400 font-medium">Financial drift detected</p>
                  <p className="text-gray-400">Check Financial Exceptions dashboard.</p>
                </div>
              </div>
            )}

            {/* Financials Post-State */}
            <div className="text-[10px] font-mono text-gray-500 px-1">
              Post: remaining={formatCurrencyUSD(successResult.post_resolver?.remaining_total ?? 0)}
              {' '}credits={formatCurrencyUSD(successResult.post_resolver?.credit_total ?? 0)}
              {' '}invoiced={formatCurrencyUSD(successResult.post_resolver?.invoiced_total ?? 0)}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={onClose} className="bg-gray-700 hover:bg-gray-600">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Main Form View ──
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Trash2 className="w-5 h-5 text-red-400" />
            {isInvoiced ? "Remove / Credit Part" : "Remove Part"}
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

          {/* Current State Grid */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-[10px] text-gray-400">Required</p>
              <p className="text-lg font-bold text-white">{requiredTotal}</p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-[10px] text-gray-400">Reserved</p>
              <p className="text-lg font-bold text-cyan-400">{reservedFromStock}</p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-[10px] text-gray-400">Installed</p>
              <p className={cn("text-lg font-bold", installedQty > 0 ? "text-emerald-400" : "text-gray-500")}>
                {installedQty}
              </p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-[10px] text-gray-400">Invoiced</p>
              <p className={cn("text-lg font-bold font-mono", isInvoiced ? "text-amber-400" : "text-gray-500")}>
                {formatCurrencyUSD(invoicedAmount)}
              </p>
            </div>
          </div>

          {/* PHASE 7: Quantity Selector */}
          <div className="space-y-2">
            <Label className="text-gray-300">Quantity to Remove</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={requiredTotal}
                value={qtyToRemove}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 0;
                  setQtyToRemove(Math.max(0, Math.min(v, requiredTotal)));
                }}
                className="bg-gray-800 border-gray-600 text-white w-24 font-mono text-center"
              />
              <span className="text-sm text-gray-400">of {requiredTotal}</span>
              {!isFullRemoval && qtyToRemove > 0 && (
                <Badge variant="outline" className="border-purple-600 text-purple-400 text-[10px]">
                  Partial
                </Badge>
              )}
              {isFullRemoval && (
                <Badge variant="outline" className="border-red-600 text-red-400 text-[10px]">
                  Full Removal
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQtyToRemove(requiredTotal)}
                className="text-xs text-gray-400 hover:text-white h-7"
              >
                All
              </Button>
            </div>
            {!isValidQty && qtyToRemove !== 0 && (
              <p className="text-xs text-red-400">Quantity must be between 1 and {requiredTotal}</p>
            )}
          </div>

          {/* PHASE 7: Dynamic Credit Preview */}
          {isInvoiced && (
            <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg space-y-2">
              <div className="flex items-start gap-2">
                <DollarSign className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-amber-400 font-medium">This part has been invoiced</p>
                  <p className="text-gray-400">
                    A proportional credit will be created. Invoice history is preserved.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 bg-amber-900/40 rounded">
                <span className="text-sm text-amber-300">Credit amount:</span>
                <span className="text-lg font-bold text-amber-400 font-mono">
                  {formatCurrencyUSD(creditPreview)}
                </span>
              </div>
              {!isFullRemoval && (
                <p className="text-[10px] text-gray-500 px-2">
                  = ({formatCurrencyUSD(invoicedAmount)} ÷ {requiredTotal}) × {qtyToRemove}
                </p>
              )}
            </div>
          )}

          {/* PHASE 3: Install Warning */}
          {hasInstallWarning && (
            <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
              <div className="flex items-start gap-2">
                <Wrench className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-red-400 font-medium">
                    {installedQty} unit{installedQty > 1 ? 's' : ''} already installed
                  </p>
                  <p className="text-gray-400">
                    Installed items will NOT be returned to inventory automatically.
                    {disposition === 'return_to_inventory' && safeReturnQty < qtyToRemove && (
                      <span className="text-amber-400 block mt-1">
                        Only {safeReturnQty} of {qtyToRemove} can be safely returned (excludes installed).
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Disposition Selection */}
          <div className="space-y-2">
            <Label className="text-gray-300">Inventory Disposition</Label>
            <RadioGroup value={disposition} onValueChange={setDisposition} className="space-y-2">
              <label className="flex items-center gap-3 p-2 rounded-lg border border-gray-700 hover:bg-gray-800/50 cursor-pointer">
                <RadioGroupItem value="return_to_inventory" id="return" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-white font-medium">Return to Inventory</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">
                    {safeReturnQty > 0
                      ? `Will return ${safeReturnQty} to physical stock`
                      : "No units available to return (all installed or none reserved)"}
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-2 rounded-lg border border-gray-700 hover:bg-gray-800/50 cursor-pointer">
                <RadioGroupItem value="no_inventory" id="no_inv" />
                <div>
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-white font-medium">No Inventory Change</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">Do not modify stock levels</p>
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

          {/* Status Transition Preview */}
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-gray-400">Status:</span>
            <Badge variant="outline" className="border-purple-600 text-purple-400">
              {commitment.commitment_status || "active"}
            </Badge>
            <span className="text-gray-500">→</span>
            {isFullRemoval ? (
              <Badge variant="outline" className="border-red-600 text-red-400">cancelled</Badge>
            ) : (
              <Badge variant="outline" className="border-purple-600 text-purple-400">
                qty: {requiredTotal} → {requiredTotal - qtyToRemove}
              </Badge>
            )}
            {creditPreview > 0 && (
              <>
                <span className="text-gray-500">+</span>
                <Badge variant="outline" className="border-amber-600 text-amber-400">
                  credit {formatCurrencyUSD(creditPreview)}
                </Badge>
              </>
            )}
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
                Processing...
              </>
            ) : isInvoiced ? (
              `Remove ${qtyToRemove} & Credit ${formatCurrencyUSD(creditPreview)}`
            ) : (
              `Remove ${qtyToRemove} Unit${qtyToRemove > 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}