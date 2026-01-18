import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Plus, ShoppingCart, ExternalLink } from "lucide-react";

/**
 * OrderPartModal - Create or add to an order for a specific part
 * Creates PartPurchaseLineItem linked to an Order
 * Optionally links to PartProjectRequirements and updates qty_ordered
 */
export default function OrderPartModal({ part, onClose, onPartClick }) {
  const queryClient = useQueryClient();
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  
  const [formData, setFormData] = useState({
    order_id: '',
    qty_ordered: 1,
    unit_price: part?.default_cost || '',
    notes: '',
    // New order fields
    new_order_vendor_id: part?.default_vendor_id || '',
    new_order_po_number: '',
    new_order_eta_date: '',
  });

  // Track which requirements to link
  const [linkedRequirements, setLinkedRequirements] = useState([]);

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-created_date'),
  });

  // Get pending/open orders (Draft, Pending, or Ordered status)
  const openOrders = orders.filter(o => ['Draft', 'Pending', 'Ordered'].includes(o.status));

  // Get project requirements for this part that still need ordering
  const { data: requirements = [] } = useQuery({
    queryKey: ['partProjectRequirements', 'forPart', part?.id],
    queryFn: async () => {
      const all = await base44.entities.PartProjectRequirement.list();
      return all.filter(r => 
        r.part_id === part?.id && 
        (r.qty_needed - (r.qty_allocated || 0) - (r.qty_ordered || 0)) > 0
      );
    },
    enabled: !!part?.id,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const getProjectName = (projectId) => {
    return projects.find(p => p.id === projectId)?.name || 'Unknown Project';
  };

  const getVendorName = (vendorId) => {
    return vendors.find(v => v.id === vendorId)?.vendor_name || 'Unknown Vendor';
  };

  const toggleRequirementLink = (reqId) => {
    setLinkedRequirements(prev => 
      prev.includes(reqId) 
        ? prev.filter(id => id !== reqId)
        : [...prev, reqId]
    );
  };

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      let orderId = formData.order_id;

      // Create new order if needed
      if (isCreatingOrder) {
        if (!formData.new_order_vendor_id) {
          throw new Error('Please select a vendor for the new order');
        }
        const newOrder = await base44.entities.Order.create({
          vendor_id: formData.new_order_vendor_id,
          po_number: formData.new_order_po_number || `PO-${Date.now()}`,
          order_date: new Date().toISOString().split('T')[0],
          eta_date: formData.new_order_eta_date || null,
          status: 'Draft',
        });
        orderId = newOrder.id;
      }

      if (!orderId) {
        throw new Error('Please select or create an order');
      }

      // Create the line item
      const lineItem = await base44.entities.PartPurchaseLineItem.create({
        order_id: orderId,
        part_id: part.id,
        qty_ordered: Number(formData.qty_ordered) || 1,
        qty_received: 0,
        unit_price: formData.unit_price ? Number(formData.unit_price) : null,
        line_total: formData.unit_price ? Number(formData.unit_price) * (Number(formData.qty_ordered) || 1) : null,
        status: 'Pending',
        notes: formData.notes || null,
        // Link to first requirement if any selected (for tracking)
        requirement_id: linkedRequirements.length > 0 ? linkedRequirements[0] : null,
      });

      // Update linked requirements with qty_ordered
      if (linkedRequirements.length > 0) {
        let remainingQty = Number(formData.qty_ordered) || 1;
        
        for (const reqId of linkedRequirements) {
          if (remainingQty <= 0) break;
          
          const req = requirements.find(r => r.id === reqId);
          if (!req) continue;

          const stillNeeded = (req.qty_needed || 0) - (req.qty_allocated || 0) - (req.qty_ordered || 0);
          const qtyToAssign = Math.min(remainingQty, stillNeeded);
          
          if (qtyToAssign > 0) {
            await base44.entities.PartProjectRequirement.update(reqId, {
              qty_ordered: (req.qty_ordered || 0) + qtyToAssign,
              status: 'Ordered',
            });
            remainingQty -= qtyToAssign;
          }
        }
      }

      return { orderId, lineItem };
    },
    onSuccess: ({ orderId }) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['partPurchaseLineItems'] });
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
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

  const activeVendors = vendors.filter(v => v.active);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-red-400" />
            Order Part
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {/* Order Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="createNew"
                checked={isCreatingOrder}
                onCheckedChange={setIsCreatingOrder}
              />
              <Label htmlFor="createNew" className="text-gray-300 cursor-pointer">
                Create new order
              </Label>
            </div>

            {isCreatingOrder ? (
              <div className="space-y-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700">
                <div>
                  <Label className="text-gray-400 text-xs">Vendor *</Label>
                  <Select
                    value={formData.new_order_vendor_id}
                    onValueChange={(v) => setFormData({ ...formData, new_order_vendor_id: v })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700">
                      <SelectValue placeholder="Select vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeVendors.filter(v => !v.parent_id).map(parent => {
                        const children = activeVendors.filter(v => v.parent_id === parent.id);
                        return (
                          <React.Fragment key={parent.id}>
                            <SelectItem value={parent.id}>
                              <span style={{ color: parent.color }}>{parent.vendor_name}</span>
                            </SelectItem>
                            {children.map(child => (
                              <SelectItem key={child.id} value={child.id}>
                                <span className="ml-4" style={{ color: child.color }}>→ {child.vendor_name}</span>
                              </SelectItem>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-400 text-xs">PO Number</Label>
                    <Input
                      value={formData.new_order_po_number}
                      onChange={(e) => setFormData({ ...formData, new_order_po_number: e.target.value })}
                      placeholder="Auto-generated if empty"
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs">ETA Date</Label>
                    <Input
                      type="date"
                      value={formData.new_order_eta_date}
                      onChange={(e) => setFormData({ ...formData, new_order_eta_date: e.target.value })}
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <Label className="text-gray-400 text-xs">Add to Existing Order *</Label>
                <Select
                  value={formData.order_id}
                  onValueChange={(v) => setFormData({ ...formData, order_id: v })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700">
                    <SelectValue placeholder="Select order..." />
                  </SelectTrigger>
                  <SelectContent>
                    {openOrders.length === 0 ? (
                      <div className="p-2 text-sm text-gray-400 text-center">
                        No open orders. Create a new one.
                      </div>
                    ) : (
                      openOrders.map(order => (
                        <SelectItem key={order.id} value={order.id}>
                          {order.po_number || `Order ${order.id.slice(0, 8)}`} - {getVendorName(order.vendor_id)} ({order.status})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Quantity and Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-xs">Quantity *</Label>
              <Input
                type="number"
                min="1"
                value={formData.qty_ordered}
                onChange={(e) => setFormData({ ...formData, qty_ordered: e.target.value })}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Unit Price</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.unit_price}
                onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                placeholder={part?.default_cost ? `Default: $${part.default_cost}` : '0.00'}
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>

          {/* Link to Project Requirements */}
          {requirements.length > 0 && (
            <div className="space-y-2">
              <Label className="text-gray-400 text-xs">Link to Project Requirements (optional)</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto p-2 bg-gray-800/30 rounded border border-gray-700">
                {requirements.map(req => {
                  const stillNeeded = (req.qty_needed || 0) - (req.qty_allocated || 0) - (req.qty_ordered || 0);
                  return (
                    <div key={req.id} className="flex items-center gap-2">
                      <Checkbox
                        id={req.id}
                        checked={linkedRequirements.includes(req.id)}
                        onCheckedChange={() => toggleRequirementLink(req.id)}
                      />
                      <Label htmlFor={req.id} className="text-sm text-gray-300 cursor-pointer flex-1">
                        {getProjectName(req.project_id)} - needs {stillNeeded}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-red-600 hover:bg-red-700"
              disabled={createOrderMutation.isPending || (!formData.order_id && !isCreatingOrder)}
            >
              {createOrderMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Order
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}