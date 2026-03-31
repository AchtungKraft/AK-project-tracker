import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, ShoppingCart, AlertTriangle, ExternalLink } from "lucide-react";
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import MobilePrimaryActionStack from "@/components/mobile/MobilePrimaryActionStack";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * CANONICAL SUPPLY FLOW ENFORCED - PHASE 10B
 * 
 * OrderPartModal - Create PO from commitment (COMMITMENT-ONLY)
 * 
 * PHASE 10B ENFORCEMENT:
 * - REQUIRES commitment_id - part-only ordering is BLOCKED
 * - Vendor pre-populated from canonical read model
 * - Qty pre-populated from to_order
 * - Cost pre-populated from default_cost
 * - NO fetching vendor or pricing from Part entity
 * 
 * Required props:
 * {
 *   commitment_id,  // REQUIRED
 *   part_id,
 *   part_name,
 *   vendor_id,      // Pre-populated from read model
 *   vendor_name,    // Pre-populated from read model  
 *   qty_to_order,   // Pre-populated from to_order
 *   default_cost,   // Pre-populated from read model
 *   default_retail  // Pre-populated from read model
 * }
 */
export default function OrderPartModal({ 
  part, 
  onClose, 
  onPartClick,
  // Legacy props - no longer used
  commitment = null,
  projectContext = null,
  isProjectLinked = false
}) {
  // PHASE 10B: HARD GUARD - commitment_id is REQUIRED
  const hasCommitmentId = !!part?.commitment_id;
  const isBlockedByProjectGuard = !hasCommitmentId;
  
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [isCreatingOrder, setIsCreatingOrder] = useState(true); // Default to creating new order
  
  // PHASE 10B: Initialize from canonical read model data - NO Part entity fetch
  const [formData, setFormData] = useState({
    order_id: '',
    qty_ordered: part?.qty_to_order || 1,
    unit_price: part?.default_cost || part?.estimated_cost || '',
    notes: '',
    // Pre-populate vendor from read model
    new_order_vendor_id: part?.vendor_id || '',
    new_order_po_number: '',
    new_order_eta_date: '',
  });

  // PHASE 10B: No queries needed - all data comes from read model via props
  // Vendor name comes from part.vendor_name
  // Cost comes from part.default_cost
  // Qty comes from part.qty_to_order

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      // PHASE 10B: HARD GUARD - commitment_id is REQUIRED
      if (!part?.commitment_id) {
        throw new Error('PO_MODAL_COMMITMENT_REQUIRED: Cannot create PO without commitment_id');
      }
      
      const qty = Number(formData.qty_ordered) || 1;
      const vendorId = formData.new_order_vendor_id || part.vendor_id;
      
      // PHASE 10B: HARD GUARD - vendor_id is REQUIRED
      if (!vendorId) {
        throw new Error('PO_VENDOR_REQUIRED: Cannot create PO without vendor_id');
      }

      // CANONICAL: Use executeSupplyAction with CREATE_PO for commitment-based ordering
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'CREATE_PO',
        commitment_ids: [part.commitment_id],
        payload: {
          vendor_id: vendorId,
          po_prefix: 'AK',
          vendor_order_data: {
            [vendorId]: {
              order_number: '',
              order_url: '',
              order_date: new Date().toISOString().split('T')[0],
              eta_date: formData.new_order_eta_date || null,
              notes: formData.notes || null,
              freight_cost: 0,
              tariff_cost: 0,
            }
          },
          source_surface: 'OrderPartModal',
        },
        dry_run: false
      });

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return { 
        orderId: response.data.created_orders?.[0]?.order_id, 
        part_id: part.part_id,
        commitment_id: part.commitment_id
      };
    },
    onSuccess: async ({ orderId, part_id }) => {
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        partIds: [part_id],
        orderIds: orderId ? [orderId] : [],
      });
      
      toast.success('Part added to order');
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create order');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createOrderMutation.mutate();
  };



  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
          {/* PHASE 10B: COMMITMENT REQUIRED GUARD */}
          {isBlockedByProjectGuard && (
            <div className="p-4 bg-red-900/30 border border-red-600 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-red-200 font-medium">PO_MODAL_COMMITMENT_REQUIRED</p>
                  <p className="text-sm text-red-300/70 mt-1">
                    Phase 10B: All PO creation requires a commitment_id.
                    Part-only ordering has been removed. Use the Global Order Queue
                    or Project Supply Manager which provide commitment context.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Pre-populated vendor display */}
          {hasCommitmentId && part?.vendor_name && (
            <div className="p-3 bg-green-900/20 border border-green-700/50 rounded-lg">
              <p className="text-xs text-green-400 mb-1">Vendor (from commitment)</p>
              <p className="text-white font-medium">{part.vendor_name}</p>
            </div>
          )}

          {/* Part Info */}
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <button
              type="button"
              onClick={() => {
                if (onPartClick) {
                  onPartClick(part?.id);
                  onClose();
                }
              }}
              className="text-sm font-medium text-white hover:text-red-400 transition-colors flex items-center gap-1.5 group"
            >
              {part?.part_name}
              {onPartClick && <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
            </button>
            {part?.vendor_part_number && (
              <p className="text-xs text-gray-400 font-mono">{part.vendor_part_number}</p>
            )}
          </div>

          {/* PHASE 10B: Simplified order form - always creates new PO */}
          <div className="space-y-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-400 text-xs">ETA Date</Label>
                <Input
                  type="date"
                  value={formData.new_order_eta_date}
                  onChange={(e) => setFormData({ ...formData, new_order_eta_date: e.target.value })}
                  className="bg-gray-800 border-gray-700"
                  disabled={isBlockedByProjectGuard}
                />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Order Date</Label>
                <Input
                  type="date"
                  value={new Date().toISOString().split('T')[0]}
                  disabled
                  className="bg-gray-800 border-gray-700 opacity-60"
                />
              </div>
            </div>
          </div>

          {/* PHASE 10B: Quantity and Cost - pre-populated from read model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-xs">Quantity to Order</Label>
              <Input
                type="number"
                min="1"
                value={formData.qty_ordered}
                onChange={(e) => setFormData({ ...formData, qty_ordered: e.target.value })}
                className="bg-gray-800 border-gray-700"
                disabled={isBlockedByProjectGuard}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Unit Cost (from commitment)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.unit_price}
                disabled
                className="bg-gray-800 border-gray-700 opacity-60"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-gray-400 text-xs">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes for this line item..."
              className="bg-gray-800 border-gray-700 h-16"
            />
          </div>

          {/* Actions - Desktop Only */}
          {!isMobile && (
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-red-600 hover:bg-red-700"
                disabled={createOrderMutation.isPending || isBlockedByProjectGuard}
              >
                {createOrderMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating PO...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create PO
                  </>
                )}
              </Button>
            </div>
          )}
        </form>
  );

  const mobileFooter = (
    <MobilePrimaryActionStack
      primaryAction={{
        label: isBlockedByProjectGuard ? 'Commitment Required' : (createOrderMutation.isPending ? 'Creating...' : 'Create PO'),
        onClick: handleSubmit,
        icon: Plus,
        disabled: createOrderMutation.isPending || isBlockedByProjectGuard,
        loading: createOrderMutation.isPending,
      }}
      secondaryActions={[
        { label: 'Cancel', onClick: onClose, variant: 'outline' }
      ]}
    />
  );

  if (isMobile) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="p-0 max-w-full h-full max-h-full bg-gray-900 border-red-900/30 text-white">
          <MobileModalWrapper
            title="Order Part"
            description={part?.part_name}
            onClose={onClose}
            footer={mobileFooter}
          >
            {formContent}
          </MobileModalWrapper>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-red-400" />
            Order Part
          </DialogTitle>
          <DialogDescription>
            Create a purchase order for this part commitment.
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}