import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { forceAppRefresh, extractRefreshContext } from "@/components/supply/forceAppRefresh";

/**
 * AddToNeedToBuyModal — CANONICAL: Creates a STOCK_MANUAL PartCommitment
 * on the AK_STOCK system project via executeSupplyAction.
 *
 * This routes through the canonical supply mutation path so the demand
 * appears in all supply queues (GlobalNeedToOrder, StockReorder, etc.).
 */
export default function AddToNeedToBuyModal({ part, onClose }) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("buyer_override");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (quantity < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: Resolve AK_STOCK system project (get or create)
      const projects = await base44.entities.Project.filter({
        is_system_project: true,
        system_project_type: "AK_STOCK",
      });
      let stockProject = projects[0];
      if (!stockProject) {
        stockProject = await base44.entities.Project.create({
          name: "AK STOCK",
          is_system_project: true,
          system_project_type: "AK_STOCK",
          financial_model_version: "forward",
        });
      }

      // Step 2: Create commitment via canonical executeSupplyAction
      const response = await base44.functions.invoke("executeSupplyAction", {
        action_type: "ADJUST_REQUIRED",
        commitment_ids: [],
        payload: {
          project_id: stockProject.id,
          part_id: part.id,
          required_total_set: quantity,
          source_type: "STOCK",
          demand_source: "STOCK_MANUAL",
          stock_reason: reason,
          notes: notes || `Manual stock order: ${reason}`,
        },
      });

      const result = response.data;
      if (result?.error) throw new Error(result.error);

      toast.success(
        `Added ${quantity} × ${part.part_name} to AK Stock order queue`
      );

      // Step 3: Deterministic cache refresh
      const context = extractRefreshContext(result, {
        part_id: part.id,
        project_id: stockProject.id,
      });
      await forceAppRefresh(queryClient, context);
      queryClient.invalidateQueries({ queryKey: ["stockCommitments"] });
      queryClient.invalidateQueries({ queryKey: ["akStockProject"] });

      onClose();
    } catch (err) {
      console.error("[AddToNeedToBuyModal] Submit failed:", err);
      toast.error("Failed: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const estimatedCost = quantity * (part.cost || part.default_cost || 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <ShoppingCart className="w-5 h-5 text-yellow-400" />
            Add to AK Stock List
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Part Info */}
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex items-center gap-3">
              {part.featured_photo ? (
                <img
                  src={part.featured_photo}
                  alt=""
                  className="w-12 h-12 rounded object-contain bg-gray-800"
                />
              ) : (
                <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center">
                  <Package className="w-6 h-6 text-gray-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">
                  {part.part_name}
                </p>
                {part.vendor_part_number && (
                  <p className="text-xs text-gray-400 font-mono">
                    {part.vendor_part_number}
                  </p>
                )}
                {(part.cost || part.default_cost) > 0 && (
                  <p className="text-xs text-yellow-400">
                    ${(part.cost || part.default_cost).toFixed(2)} each
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Destination Info */}
          <div className="p-3 bg-yellow-900/20 border border-yellow-900/30 rounded-lg">
            <p className="text-sm text-yellow-400">
              Creates demand on <strong>AK STOCK</strong> project
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Will appear in Order Queue and Supply Dashboard for procurement
            </p>
          </div>

          {/* Quantity */}
          <div>
            <Label className="text-gray-300">Quantity *</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>

          {/* Reason */}
          <div>
            <Label className="text-gray-300">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buyer_override">Buyer Override</SelectItem>
                <SelectItem value="seasonal">Seasonal Stock</SelectItem>
                <SelectItem value="safety_stock">Safety Stock</SelectItem>
                <SelectItem value="bulk_vendor_order">Bulk Vendor Order</SelectItem>
                <SelectItem value="forecasted_usage">Forecasted Usage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-gray-300">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for ordering, usage notes..."
              className="bg-gray-800 border-gray-700 text-white"
              rows={2}
            />
          </div>

          {/* Estimated Cost */}
          {estimatedCost > 0 && (
            <div className="flex justify-between items-center p-2 bg-gray-800/50 rounded border border-gray-700">
              <span className="text-sm text-gray-400">Estimated Cost</span>
              <span className="text-lg font-bold text-yellow-400">
                ${estimatedCost.toFixed(2)}
              </span>
            </div>
          )}
        </form>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-gray-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || quantity < 1}
            className="bg-red-600 hover:bg-red-700"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ShoppingCart className="w-4 h-4 mr-2" />
            )}
            Add to AK Stock List
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}