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
  CheckCircle2, Wrench, ArrowDown, ArrowRight,
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-[10px] text-gray-400">Required</p>
              <p className="text-lg font-bold text-white">{requiredTotal}</p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-[10px] text-gray-400">Installed</p>
              <p className={cn("text-lg font-bold", installedQty > 0 ? "text-emerald-400" : "text-gray-500")}>
                {installedQty}
              </p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-[10px] text-gray-400">Already Removed</p>
              <p className={cn("text-lg font-bold", existingRemoved > 0 ? "text-red-400" : "text-gray-500")}>
                {existingRemoved}
              </p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-[10px] text-gray-400">Removable</p>
              <p className="text-lg font-bold text-amber-400">{maxRemovable}</p>
            </div>
          </div>

          {/* Quantity Selector */}
          <div className="space-y-2">
            <Label className="text-gray-300">Quantity to Remove</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={maxRemovable}
                value={qtyToRemove}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 0;
                  setQtyToRemove(Math.max(0, Math.min(v, maxRemovable)));
                }}
                className="bg-gray-800 border-gray-600 text-white w-24 font-mono text-center"
              />
              <span className="text-sm text-gray-400">of {maxRemovable} removable</span>
              {isFullRemoval && (
                <Badge variant="outline" className="border-red-600 text-red-400 text-[10px]">
                  Full Removal
                </Badge>
              )}
              {!isFullRemoval && qtyToRemove > 0 && (
                <Badge variant="outline" className="border-purple-600 text-purple-400 text-[10px]">
                  Partial
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQtyToRemove(maxRemovable)}
                className="text-xs text-gray-400 hover:text-white h-7"
              >
                All
              </Button>
            </div>
            {!isValidQty && qtyToRemove !== 0 && (
              <p className="text-xs text-red-400">Quantity must be between 1 and {maxRemovable}</p>
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

          {/* Install Warning */}
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
                      ? `Will return ${safeReturnQty} unit${safeReturnQty > 1 ? 's' : ''} to physical stock`
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
            <ArrowRight className="w-3 h-3 text-gray-500" />
            {isFullRemoval ? (
              <Badge variant="outline" className="border-red-600 text-red-400">cancelled</Badge>
            ) : (
              <Badge variant="outline" className="border-purple-600 text-purple-400">
                removed: {existingRemoved} → {existingRemoved + qtyToRemove}
              </Badge>
            )}
            {creditPreview > 0 && (
              <>
                <span className="text-gray-500">+</span>
                <Badge variant="outline" className="border-amber-600 text-amber-400">
                  credit ~{formatCurrencyUSD(creditPreview)}
                </Badge>
              </>
            )}
          </div>

          {/* Approximate credit note */}
          {isInvoiced && (
            <p className="text-[10px] text-gray-500 italic">
              Credit preview is approximate. Final amount calculated from actual invoice line items.
            </p>
          )}
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
              `Remove ${qtyToRemove} & Credit ~${formatCurrencyUSD(creditPreview)}`
            ) : (
              `Remove ${qtyToRemove} Unit${qtyToRemove > 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}