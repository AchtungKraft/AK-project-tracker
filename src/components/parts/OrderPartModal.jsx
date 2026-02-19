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
import { Loader2, Plus, ShoppingCart, ExternalLink, AlertTriangle } from "lucide-react";
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import MobilePrimaryActionStack from "@/components/mobile/MobilePrimaryActionStack";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { invalidateSupplyQueries } from "@/components/supply/supplyInvalidation";

/**
 * CANONICAL SUPPLY FLOW ENFORCED - PHASE 2A
 * 
 * OrderPartModal - Create or add to an order for a specific part
 * 
 * CANONICAL IMPLEMENTATION:
 * - For STOCK ORDERS (no project): Creates PO + Line Item via executeSupplyAction
 * - For PROJECT ORDERS: BLOCKED - must use ProjectSupplyManager with CREATE_PO
 * 
 * STOCK ORDER FLOW:
 * 1. Creates or selects an Order entity
 * 2. Uses executeSupplyAction with CREATE_PO action (commitment_scope = STOCK)
 * 3. Updates Part.on_order via canonical path
 * 
 * BLOCKED:
 * - If commitment/projectContext is provided, shows guard and blocks submission
 * - UI-provided unit_price is IGNORED - cost comes from Part.cost
 */
export default function OrderPartModal({ 
  part, 
  onClose, 
  onPartClick,
  // NEW: Guard props - if these are provided, block legacy usage
  commitment = null,
  projectContext = null,
  isProjectLinked = false
}) {
  // PROJECT GUARD: Block legacy modal for project-linked ordering
  const isBlockedByProjectGuard = !!(commitment || projectContext || isProjectLinked);
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
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

  // Helper to generate next PO number
  const generatePONumber = async () => {
    const currentYear = new Date().getFullYear();
    
    // Get or create the sequence record for this year
    const sequences = await base44.entities.POSequence.list();
    let yearSequence = sequences.find(s => s.year === currentYear);
    
    let nextSequence;
    if (yearSequence) {
      nextSequence = (yearSequence.last_sequence || 0) + 1;
      await base44.entities.POSequence.update(yearSequence.id, {
        last_sequence: nextSequence,
      });
    } else {
      nextSequence = 1;
      await base44.entities.POSequence.create({
        year: currentYear,
        last_sequence: nextSequence,
      });
    }
    
    // Format: PO-YYYY-NNNN (zero-padded to 4 digits)
    return `PO-${currentYear}-${String(nextSequence).padStart(4, '0')}`;
  };

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const qty = Number(formData.qty_ordered) || 1;
      const vendorId = isCreatingOrder ? formData.new_order_vendor_id : null;

      // CANONICAL: Use executeSupplyAction for stock ordering
      // This creates a "stock commitment" (project_id = null) and PO in one atomic operation
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'CREATE_STOCK_ORDER',
        commitment_ids: [], // Empty for new stock order
        payload: {
          part_id: part.id,
          qty: qty,
          vendor_id: vendorId || part.default_vendor_id,
          order_id: !isCreatingOrder ? formData.order_id : null, // Existing order if selected
          po_number: isCreatingOrder ? (formData.new_order_po_number || null) : null,
          eta_date: formData.new_order_eta_date || null,
          notes: formData.notes || null,
          source_surface: 'OrderPartModal',
        },
        dry_run: false
      });

      // If CREATE_STOCK_ORDER is not implemented, fall back to legacy creation
      // This is a transitional path - will be removed once backend supports CREATE_STOCK_ORDER
      if (response.data?.error === 'Unknown action_type: CREATE_STOCK_ORDER') {
        console.warn('[OrderPartModal] Falling back to legacy order creation - implement CREATE_STOCK_ORDER action');
        
        let orderId = formData.order_id;

        // Create new order if needed
        if (isCreatingOrder) {
          if (!formData.new_order_vendor_id) {
            throw new Error('Please select a vendor for the new order');
          }
          
          const poNumber = formData.new_order_po_number || await generatePONumber();
          
          const newOrder = await base44.entities.Order.create({
            vendor_id: formData.new_order_vendor_id,
            po_number: poNumber,
            order_date: new Date().toISOString().split('T')[0],
            eta_date: formData.new_order_eta_date || null,
            status: 'Ordered',
            notes: formData.notes || null,
          });
          orderId = newOrder.id;
        }

        if (!orderId) {
          throw new Error('Please select or create an order');
        }

        // COST ENFORCEMENT: Always use Part.cost
        const partCost = part.cost ?? part.default_cost ?? 0;
        
        const lineItem = await base44.entities.PartPurchaseLineItem.create({
          order_id: orderId,
          part_id: part.id,
          qty_ordered: qty,
          qty_received: 0,
          unit_cost: partCost,
          unit_price: partCost,
          extended_cost: partCost * qty,
          line_total: partCost * qty,
          cost_source_reference: 'part_cost',
          status: 'Ordered',
          notes: formData.notes || null,
          is_legacy: true,
          legacy_reason: 'Created via OrderPartModal (stock order)',
        });

        // Update Part.on_order for immediate visibility
        const currentOnOrder = part.on_order ?? 0;
        await base44.entities.Part.update(part.id, {
          on_order: currentOnOrder + qty
        });

        return { orderId, lineItem, part_id: part.id };
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return { 
        orderId: response.data.order_id, 
        lineItem: response.data.line_item,
        part_id: part.id 
      };
    },
    onSuccess: ({ orderId, part_id }) => {
      // CANONICAL: Use unified invalidation helper
      invalidateSupplyQueries(queryClient, {
        part_ids: [part_id],
        order_ids: orderId ? [orderId] : [],
        invalidateAll: true, // Ensure all supply views update
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

  const activeVendors = vendors.filter(v => v.active);

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
          {/* PROJECT GUARD BANNER */}
          {isBlockedByProjectGuard && (
            <div className="p-4 bg-red-900/30 border border-red-600 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-red-200 font-medium">Legacy Flow Disabled</p>
                  <p className="text-sm text-red-300/70 mt-1">
                    This ordering flow is disabled for project-linked parts. 
                    Use the "Create PO" button in the Project Supply Manager instead, 
                    which routes through the Unified Supply Execution Engine.
                  </p>
                </div>
              </div>
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
                    <Label className="text-gray-400 text-xs">Order Date</Label>
                    <Input
                      type="date"
                      value={formData.new_order_date || new Date().toISOString().split('T')[0]}
                      onChange={(e) => setFormData({ ...formData, new_order_date: e.target.value })}
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-400 text-xs">ETA Date</Label>
                    <Input
                      type="date"
                      value={formData.new_order_eta_date}
                      onChange={(e) => setFormData({ ...formData, new_order_eta_date: e.target.value })}
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs">Reference URL</Label>
                    <Input
                      type="url"
                      value={formData.new_order_notes || ''}
                      onChange={(e) => setFormData({ ...formData, new_order_notes: e.target.value })}
                      placeholder="https://..."
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

          {/* Actions - Desktop Only */}
          {!isMobile && (
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-red-600 hover:bg-red-700"
                disabled={createOrderMutation.isPending || (!formData.order_id && !isCreatingOrder) || isBlockedByProjectGuard}
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
          )}
        </form>
  );

  const mobileFooter = (
    <MobilePrimaryActionStack
      primaryAction={{
        label: isBlockedByProjectGuard ? 'Blocked' : (createOrderMutation.isPending ? 'Adding...' : 'Add to Order'),
        onClick: handleSubmit,
        icon: Plus,
        disabled: createOrderMutation.isPending || (!formData.order_id && !isCreatingOrder) || isBlockedByProjectGuard,
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
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}