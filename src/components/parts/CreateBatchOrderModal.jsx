import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Package, Trash2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

/**
 * CreateBatchOrderModal - Create orders from selected parts grouped by vendor
 * Handles both project-specific and general AK stock orders
 */
export default function CreateBatchOrderModal({ selectedItems, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  // State for vendor-grouped items with editable fields
  const [vendorGroups, setVendorGroups] = useState(() => {
    const groups = {};
    
    selectedItems.forEach(item => {
      const vendorId = item.part?.default_vendor_id || 'unassigned';
      if (!groups[vendorId]) {
        groups[vendorId] = {
          vendorId,
          expanded: true,
          orderData: {
            po_number: '',
            order_date: new Date().toISOString().split('T')[0],
            eta_date: '',
            notes: '',
          },
          items: [],
        };
      }
      groups[vendorId].items.push({
        ...item,
        qty_to_order: item.qty_to_order || 1,
        unit_price: item.part?.default_cost || 0,
        vendorOverride: null,
      });
    });
    
    return groups;
  });

  const getVendorName = (vendorId) => {
    if (vendorId === 'unassigned') return 'No Vendor Assigned';
    return vendors.find(v => v.id === vendorId)?.vendor_name || 'Unknown Vendor';
  };

  const getProjectName = (projectId) => {
    if (!projectId) return 'General / AK Stock';
    return projects.find(p => p.id === projectId)?.name || 'Unknown Project';
  };

  const updateVendorGroup = (vendorId, field, value) => {
    setVendorGroups(prev => ({
      ...prev,
      [vendorId]: {
        ...prev[vendorId],
        orderData: {
          ...prev[vendorId].orderData,
          [field]: value,
        },
      },
    }));
  };

  const updateLineItem = (vendorId, itemIndex, field, value) => {
    setVendorGroups(prev => ({
      ...prev,
      [vendorId]: {
        ...prev[vendorId],
        items: prev[vendorId].items.map((item, idx) =>
          idx === itemIndex ? { ...item, [field]: value } : item
        ),
      },
    }));
  };

  const removeLineItem = (vendorId, itemIndex) => {
    setVendorGroups(prev => {
      const newGroups = { ...prev };
      newGroups[vendorId] = {
        ...newGroups[vendorId],
        items: newGroups[vendorId].items.filter((_, idx) => idx !== itemIndex),
      };
      // Remove group if no items left
      if (newGroups[vendorId].items.length === 0) {
        delete newGroups[vendorId];
      }
      return newGroups;
    });
  };

  const toggleGroupExpanded = (vendorId) => {
    setVendorGroups(prev => ({
      ...prev,
      [vendorId]: {
        ...prev[vendorId],
        expanded: !prev[vendorId].expanded,
      },
    }));
  };

  const moveItemToVendor = (fromVendorId, itemIndex, toVendorId) => {
    setVendorGroups(prev => {
      const item = prev[fromVendorId].items[itemIndex];
      const newGroups = { ...prev };
      
      // Remove from current vendor
      newGroups[fromVendorId] = {
        ...newGroups[fromVendorId],
        items: newGroups[fromVendorId].items.filter((_, idx) => idx !== itemIndex),
      };
      
      // Add to new vendor
      if (!newGroups[toVendorId]) {
        newGroups[toVendorId] = {
          vendorId: toVendorId,
          expanded: true,
          orderData: {
            po_number: '',
            order_date: new Date().toISOString().split('T')[0],
            eta_date: '',
            notes: '',
          },
          items: [],
        };
      }
      newGroups[toVendorId].items.push({ ...item, vendorOverride: toVendorId });
      
      // Remove empty groups
      if (newGroups[fromVendorId].items.length === 0) {
        delete newGroups[fromVendorId];
      }
      
      return newGroups;
    });
  };

  // Calculate totals
  const totals = useMemo(() => {
    let totalItems = 0;
    let totalValue = 0;
    
    Object.values(vendorGroups).forEach(group => {
      group.items.forEach(item => {
        totalItems += item.qty_to_order;
        totalValue += (item.qty_to_order || 0) * (item.unit_price || 0);
      });
    });
    
    return { totalItems, totalValue };
  }, [vendorGroups]);

  const createOrdersMutation = useMutation({
    mutationFn: async () => {
      const results = [];
      
      for (const [vendorId, group] of Object.entries(vendorGroups)) {
        if (group.items.length === 0) continue;
        if (vendorId === 'unassigned') {
          throw new Error('Please assign a vendor to all items before creating orders');
        }
        
        // Create the order
        const order = await base44.entities.Order.create({
          vendor_id: vendorId,
          po_number: group.orderData.po_number || `PO-${Date.now()}-${vendorId.slice(0, 4)}`,
          order_date: group.orderData.order_date || new Date().toISOString().split('T')[0],
          eta_date: group.orderData.eta_date || null,
          status: 'Ordered',
          notes: group.orderData.notes || null,
        });
        
        // Create line items and update requirements
        for (const item of group.items) {
          // Create line item
          await base44.entities.PartPurchaseLineItem.create({
            order_id: order.id,
            part_id: item.part.id,
            requirement_id: item.requirement?.id || null,
            qty_ordered: item.qty_to_order,
            qty_received: 0,
            unit_price: item.unit_price || null,
            line_total: (item.qty_to_order || 0) * (item.unit_price || 0),
            status: 'Ordered',
            notes: null,
          });
          
          // Update requirement qty_ordered if linked
          if (item.requirement?.id) {
            const currentOrdered = item.requirement.qty_ordered || 0;
            await base44.entities.PartProjectRequirement.update(item.requirement.id, {
              qty_ordered: currentOrdered + item.qty_to_order,
              status: 'Ordered',
            });
          }
        }
        
        results.push({ order, itemCount: group.items.length });
      }
      
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['partPurchaseLineItems'] });
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      toast.success(`Created ${results.length} order(s) successfully`);
      onSuccess?.();
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create orders');
    },
  });

  const activeVendors = vendors.filter(v => v.active);
  const hasUnassignedVendor = Object.keys(vendorGroups).includes('unassigned');
  const groupCount = Object.keys(vendorGroups).length;

  if (groupCount === 0) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border border-red-900/30 text-white">
          <DialogHeader>
            <DialogTitle>Create Orders</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No items selected for ordering.</p>
          </div>
          <Button variant="outline" onClick={onClose} className="border-gray-700">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>Create Orders ({groupCount} vendor{groupCount > 1 ? 's' : ''})</span>
            <div className="text-sm font-normal text-gray-400">
              {totals.totalItems} items · ${totals.totalValue.toFixed(2)} total
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {Object.entries(vendorGroups).map(([vendorId, group]) => (
            <div key={vendorId} className="border border-gray-700 rounded-lg overflow-hidden">
              {/* Vendor Header */}
              <div 
                className="p-3 bg-gray-800/50 flex items-center justify-between cursor-pointer"
                onClick={() => toggleGroupExpanded(vendorId)}
              >
                <div className="flex items-center gap-3">
                  {group.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <div>
                    <p className={`font-medium ${vendorId === 'unassigned' ? 'text-yellow-400' : 'text-white'}`}>
                      {getVendorName(vendorId)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {group.items.length} item{group.items.length > 1 ? 's' : ''} · 
                      ${group.items.reduce((sum, i) => sum + (i.qty_to_order * i.unit_price), 0).toFixed(2)}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="border-gray-600">
                  {group.orderData.po_number || 'Auto PO#'}
                </Badge>
              </div>

              {group.expanded && (
                <div className="p-3 space-y-3">
                  {/* Order Details */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-gray-400 text-xs">PO Number</Label>
                      <Input
                        value={group.orderData.po_number}
                        onChange={(e) => updateVendorGroup(vendorId, 'po_number', e.target.value)}
                        placeholder="Auto-generated"
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">Order Date</Label>
                      <Input
                        type="date"
                        value={group.orderData.order_date}
                        onChange={(e) => updateVendorGroup(vendorId, 'order_date', e.target.value)}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">ETA Date</Label>
                      <Input
                        type="date"
                        value={group.orderData.eta_date}
                        onChange={(e) => updateVendorGroup(vendorId, 'eta_date', e.target.value)}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-gray-400 text-xs">Notes / Reference URL</Label>
                    <Textarea
                      value={group.orderData.notes}
                      onChange={(e) => updateVendorGroup(vendorId, 'notes', e.target.value)}
                      placeholder="Order notes, reference links..."
                      className="bg-gray-800 border-gray-700 h-16 text-sm"
                    />
                  </div>

                  <Separator className="bg-gray-700" />

                  {/* Line Items */}
                  <div className="space-y-2">
                    {group.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-gray-800/30 rounded">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{item.part?.part_name}</p>
                          <p className="text-xs text-gray-500">
                            {getProjectName(item.requirement?.project_id)}
                          </p>
                        </div>
                        
                        {vendorId === 'unassigned' && (
                          <Select
                            value=""
                            onValueChange={(v) => moveItemToVendor(vendorId, idx, v)}
                          >
                            <SelectTrigger className="w-32 h-7 bg-gray-800 border-gray-600 text-xs">
                              <SelectValue placeholder="Assign vendor" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeVendors.filter(v => !v.parent_id).map(v => (
                                <SelectItem key={v.id} value={v.id} className="text-xs">
                                  {v.vendor_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        
                        <Input
                          type="number"
                          min="1"
                          value={item.qty_to_order}
                          onChange={(e) => updateLineItem(vendorId, idx, 'qty_to_order', parseInt(e.target.value) || 1)}
                          className="w-16 h-7 bg-gray-800 border-gray-700 text-sm text-center"
                        />
                        
                        <div className="flex items-center gap-1 w-24">
                          <span className="text-gray-500 text-xs">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => updateLineItem(vendorId, idx, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="h-7 bg-gray-800 border-gray-700 text-sm"
                          />
                        </div>
                        
                        <span className="text-xs text-gray-400 w-16 text-right">
                          ${((item.qty_to_order || 0) * (item.unit_price || 0)).toFixed(2)}
                        </span>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLineItem(vendorId, idx)}
                          className="h-7 w-7 text-gray-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between pt-4 border-t border-gray-700">
          {hasUnassignedVendor && (
            <p className="text-xs text-yellow-400">
              ⚠ Assign vendors to all items before creating orders
            </p>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose} className="border-gray-700">
              Cancel
            </Button>
            <Button
              onClick={() => createOrdersMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
              disabled={createOrdersMutation.isPending || hasUnassignedVendor}
            >
              {createOrdersMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                `Create ${groupCount} Order${groupCount > 1 ? 's' : ''}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}