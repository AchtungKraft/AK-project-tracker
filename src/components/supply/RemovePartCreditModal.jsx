import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertTriangle, Package, DollarSign, Trash2, RotateCcw, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * RemovePartCreditModal — Remove Part / Credit Part workflow
 *
 * Branches UI based on whether commitment is invoiced:
 * - Not invoiced: simple removal with disposition choice
 * - Invoiced: shows credit amount, preserves invoice history
 *
 * Uses canonical removeProjectPartWithCredit backend function.
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

  const invoicedAmount = commitment.invoiced_amount ?? 0;
  const isInvoiced = invoicedAmount > 0;
  const requiredTotal = commitment.required_total ?? 0;

  // Calculate credit amount (proportional — full removal)
  const creditAmount = isInvoiced ? invoicedAmount : 0;

  const removeMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke("removeProjectPartWithCredit", {
        project_id: commitment.project_id,
        commitment_id: commitment.id,
        disposition,
        reason: reason || (isInvoiced ? "Part removed with credit" : "Part removed from project"),
        quantity_to_remove: requiredTotal,
      });

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Failed to remove part");
      }
      return response.data;
    },
    onSuccess: async (data) => {
      await forceAppRefresh(queryClient, {
        partIds: commitment.part_id ? [commitment.part_id] : [],
        projectIds: commitment.project_id ? [commitment.project_id] : [],
        commitmentIds: [commitment.id],
      });

      if (data.credit_created) {
        toast.success(
          `Part removed — ${formatCurrencyUSD(data.credit_amount)} credit created`
        );
      } else {
        toast.success("Part removed from project");
      }

      // Surface drift warning if detected
      if (data.post_resolver?.drift_detected || data.post_drift?.projects_with_drift > 0) {
        toast.warning("Financial drift detected after removal. Check Financial Exceptions.");
      }

      onSuccess?.();
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to remove: ${error.message}`);
    },
  });

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

          {/* Quantities */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Required</p>
              <p className="text-lg font-bold text-white">{requiredTotal}</p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Installed</p>
              <p className="text-lg font-bold text-green-400">
                {commitment.qty_installed || 0}
              </p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Invoiced</p>
              <p className="text-lg font-bold text-amber-400">
                {formatCurrencyUSD(invoicedAmount)}
              </p>
            </div>
          </div>

          {/* Invoiced Warning + Credit Info */}
          {isInvoiced && (
            <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg space-y-2">
              <div className="flex items-start gap-2">
                <DollarSign className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-amber-400 font-medium">
                    This part has been invoiced
                  </p>
                  <p className="text-gray-400">
                    Removing it will create a project credit and preserve all
                    invoice history. The invoiced amount will not be reduced.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 bg-amber-900/40 rounded">
                <span className="text-sm text-amber-300">Credit amount:</span>
                <span className="text-lg font-bold text-amber-400 font-mono">
                  {formatCurrencyUSD(creditAmount)}
                </span>
              </div>
            </div>
          )}

          {/* Disposition Selection */}
          <div className="space-y-2">
            <Label className="text-gray-300">Inventory Disposition</Label>
            <RadioGroup
              value={disposition}
              onValueChange={setDisposition}
              className="space-y-2"
            >
              <label className="flex items-center gap-3 p-2 rounded-lg border border-gray-700 hover:bg-gray-800/50 cursor-pointer">
                <RadioGroupItem value="return_to_inventory" id="return" />
                <div>
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-white font-medium">
                      Return to Inventory
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">
                    Add quantity back to physical stock
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-2 rounded-lg border border-gray-700 hover:bg-gray-800/50 cursor-pointer">
                <RadioGroupItem value="no_inventory" id="no_inv" />
                <div>
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-white font-medium">
                      No Inventory Change
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">
                    Do not modify stock levels
                  </p>
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

          {/* Status Transition */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">Status:</span>
            <Badge
              variant="outline"
              className="border-purple-600 text-purple-400"
            >
              {commitment.commitment_status || "active"}
            </Badge>
            <span className="text-gray-500">→</span>
            <Badge variant="outline" className="border-red-600 text-red-400">
              cancelled
            </Badge>
            {isInvoiced && (
              <>
                <span className="text-gray-500">+</span>
                <Badge
                  variant="outline"
                  className="border-amber-600 text-amber-400"
                >
                  credit {formatCurrencyUSD(creditAmount)}
                </Badge>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-600"
          >
            Cancel
          </Button>
          <Button
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {removeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : isInvoiced ? (
              "Confirm Removal & Create Credit"
            ) : (
              "Confirm Removal"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}