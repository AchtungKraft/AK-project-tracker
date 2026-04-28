import React, { useState, useMemo } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Package, Plus, AlertTriangle, Loader2 } from "lucide-react";
import { CommitmentActions } from "../financial/financialMutationGuard";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * DeltaOrderModal - Create additional orders for existing commitments
 * 
 * Visible ONLY when:
 * - commitment_status in ['ordered', 'partially_received', 'received']
 * - commitment_status != 'cancelled'
 * 
 * Routes exclusively through CommitmentActions.createDeltaOrder()
 * Creates new PartPurchaseLineItem with is_delta_order = true
 */
export default function DeltaOrderModal({ commitment, part, onClose }) {
  const queryClient = useQueryClient();
  
  const [deltaQty, setDeltaQty] = useState(1);
  const [unitCost, setUnitCost] = useState(commitment?.actual_unit_cost || commitment?.unit_cost || 0);
  const [vendorId, setVendorId] = useState(commitment?.vendor_id || "");
  const [notes, setNotes] = useState("");

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const createDeltaOrderMutation = useMutation({
    mutationFn: async () => {
      return await CommitmentActions.createDeltaOrder({
        commitment_id: commitment.id,
        vendor_id: vendorId,
        qty: deltaQty,
        unit_cost: unitCost,
        notes: notes || `Delta order for additional ${deltaQty} units`,
      });
    },
    onSuccess: async (result) => {
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        partIds: part?.id ? [part.id] : [],
        projectIds: commitment?.project_id ? [commitment.project_id] : [],
        commitmentIds: [commitment.id],
        orderIds: result?.order_id ? [result.order_id] : [],
      });
      toast.success(`Delta order created for ${deltaQty} unit(s)`, {
        description: `New PO line item added with is_delta_order = true`,
      });
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to create delta order: ' + error.message);
    },
  });

  // HARD GUARD (after ALL hooks)
  if (!commitment || commitment.required_total === undefined) {
    return null;
  }

  const existingOrdered = commitment.covered_from_po ?? commitment.qty_ordered ?? 0;
  const existingReceived = commitment.qty_received ?? 0;
  const pendingDelivery = existingOrdered;
  const totalCommitted = commitment.required_total ?? commitment.qty_committed ?? 0;
  const reserved = commitment.reserved_from_stock ?? 0;
  const remainingNeeded = Math.max(0, totalCommitted - reserved - existingOrdered);
  const canSubmit = deltaQty > 0 && unitCost > 0 && vendorId;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createDeltaOrderMutation.mutate();
  };

  const selectedVendor = vendors.find(v => v.id === vendorId);
  const estimatedTotal = deltaQty * unitCost;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-400" />
            Additional Order (Delta)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Part Info */}
          <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
            {part?.featured_photo ? (
              <img src={part.featured_photo} alt="" className="w-12 h-12 rounded object-contain bg-gray-700" />
            ) : (
              <div className="w-12 h-12 rounded bg-gray-700 flex items-center justify-center">
                <Package className="w-6 h-6 text-gray-500" />
              </div>
            )}
            <div>
              <p className="text-white font-medium">{part?.part_name}</p>
              {part?.vendor_part_number && (
                <p className="text-xs text-gray-400 font-mono">{part.vendor_part_number}</p>
              )}
            </div>
          </div>

          {/* Existing Order Status */}
          <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
            <p className="text-sm text-blue-300 font-medium mb-2">Current Order Status</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-gray-800/50 rounded">
                <p className="text-xs text-gray-400">Committed</p>
                <p className="text-sm font-bold text-white">{totalCommitted}</p>
              </div>
              <div className="p-2 bg-gray-800/50 rounded">
                <p className="text-xs text-gray-400">Ordered</p>
                <p className="text-sm font-bold text-purple-400">{existingOrdered}</p>
              </div>
              <div className="p-2 bg-gray-800/50 rounded">
                <p className="text-xs text-gray-400">Remaining</p>
                <p className="text-sm font-bold text-orange-400">{remainingNeeded}</p>
              </div>
            </div>
            {pendingDelivery > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                {pendingDelivery} unit(s) pending delivery from existing orders
              </p>
            )}
          </div>

          {/* Delta Order Form */}
          <div className="space-y-3">
            <div>
              <Label className="text-gray-300">Delta Quantity</Label>
              <Input
                type="number"
                min={1}
                value={deltaQty}
                onChange={(e) => setDeltaQty(parseInt(e.target.value) || 1)}
                className="bg-gray-800 border-gray-600 text-white mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Additional units to order beyond existing PO
              </p>
            </div>

            <div>
              <Label className="text-gray-300">Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-300">Unit Cost</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={unitCost}
                onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                className="bg-gray-800 border-gray-600 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-300">Notes (Optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for additional order..."
                className="bg-gray-800 border-gray-600 text-white mt-1 h-20"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="p-3 bg-green-900/20 border border-green-700/50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Estimated Total</span>
              <span className="text-lg font-bold text-green-400">
                ${estimatedTotal.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Will create new PO line item with is_delta_order = true
            </p>
          </div>

          {/* Warning if ordering more than remaining */}
          {deltaQty > remainingNeeded && remainingNeeded > 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-yellow-300">Ordering more than remaining needed</p>
                <p className="text-xs text-yellow-400/70">
                  You're ordering {deltaQty} but only {remainingNeeded} more needed to fulfill commitment.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || createDeltaOrderMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {createDeltaOrderMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Delta Order
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}