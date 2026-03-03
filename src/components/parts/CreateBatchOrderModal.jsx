import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Loader2, Package, Trash2, ChevronDown, ChevronUp, ExternalLink, DollarSign, Truck, AlertCircle, Link as LinkIcon } from "lucide-react";
import { useSupplyAction } from "@/components/supply/useSupplyState";
import { cn } from "@/lib/utils";

/**
 * CreateBatchOrderModal - Create orders from selected commitments grouped by vendor
 * 
 * PHASE 10B: COMMITMENT-ONLY ORDERING
 * - All items MUST have commitment_id
 * - All items MUST have vendor_id (from read model)
 * - Groups strictly by vendor_id
 * - NO Part entity fetch for vendor/pricing
 * 
 * CANONICAL DISPATCHER: Routes through executeSupplyAction with action_type='CREATE_PO'
 * NO direct Order.create or PartPurchaseLineItem.create allowed
 * 
 * Required item shape:
 * {
 *   commitment_id,  // REQUIRED
 *   part_id,
 *   part_name,
 *   vendor_id,      // REQUIRED - from read model
 *   vendor_name,    // from read model
 *   project_id,
 *   project_name,
 *   qty_to_order,   // from to_order
 *   default_cost,   // from read model
 *   estimated_cost  // from read model
 * }
 */
export default function CreateBatchOrderModal({ selectedItems, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  
  // UI-only state for tracking which items have been added to vendor cart
  const [cartMarkedItems, setCartMarkedItems] = useState(new Set());
  
  const toggleCartMarked = (commitmentId) => {
    setCartMarkedItems(prev => {
      const next = new Set(prev);
      if (next.has(commitmentId)) next.delete(commitmentId);
      else next.add(commitmentId);
      return next;
    });
  };
  
  // PHASE 10B: Validate all items have commitment_id and vendor_id
  const invalidItems = selectedItems.filter(item => !item.commitment_id || !item.vendor_id);
  if (invalidItems.length > 0) {
    console.error('[PHASE 10B VIOLATION] Items missing commitment_id or vendor_id:', invalidItems);
  }
  
  // Only fetch vendors for display names (not for deriving vendor from parts)
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: poSequences = [] } = useQuery({
    queryKey: ['poSequences'],
    queryFn: () => base44.entities.POSequence.list(),
  });

  // Generate PO number in format: PREFIX_MMDDYYYY_SEQ
  const generatePONumber = (prefix = 'AK') => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = now.getFullYear();
    
    // Find current year sequence
    const currentYear = yyyy;
    const yearSeq = poSequences.find(s => s.year === currentYear);
    const nextSeq = (yearSeq?.last_sequence || 0) + 1;
    
    return `${prefix}_${mm}${dd}${yyyy}_${String(nextSeq).padStart(3, '0')}`;
  };

  // PHASE 10B: State for vendor-grouped items - vendor comes from read model, not Part entity
  const [vendorGroups, setVendorGroups] = useState(() => {
    const groups = {};
    
    selectedItems.forEach(item => {
      // PHASE 10B: vendor_id comes from read model directly
      const vendorId = item.vendor_id || 'unassigned';
      
      // PHASE 10B: HARD ERROR if no commitment_id
      if (!item.commitment_id) {
        console.error('[PHASE 10B VIOLATION] Item missing commitment_id:', item);
      }
      
      if (!groups[vendorId]) {
        groups[vendorId] = {
          vendorId,
          vendorName: item.vendor_name || null,
          expanded: true,
          orderData: {
            po_prefix: 'AK',
            po_number: '',
            order_number: '',
            order_url: '',
            order_date: new Date().toISOString().split('T')[0],
            eta_date: '',
            notes: '',
            // Phase 6: Freight + Tariff at PO header level
            freight_cost: 0,
            tariff_cost: 0,
          },
          items: [],
        };
      }
      // PHASE 10B: Cost comes from read model (default_cost or estimated_cost)
      const itemCost = item.default_cost ?? item.estimated_cost ?? 0;
      groups[vendorId].items.push({
        ...item,
        commitment_id: item.commitment_id, // Ensure commitment_id is preserved
        qty_to_order: item.qty_to_order || 1,
        unit_cost: itemCost,
        original_cost: itemCost,
        cost_overridden: false,
        vendorOverride: null,
      });
    });
    
    return groups;
  });

  // PHASE 10B: Prefer vendor name from group (came from read model) over lookup
  const getVendorName = (vendorId, groupVendorName) => {
    if (vendorId === 'unassigned') return 'No Vendor Assigned';
    return groupVendorName || vendors.find(v => v.id === vendorId)?.vendor_name || 'Unknown Vendor';
  };

  // PHASE 10B: Project name comes from item directly (from read model)
  const getProjectName = (item) => {
    if (item.project_name) return item.project_name;
    if (!item.project_id) return 'General / AK Stock';
    return 'Project';
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
        items: prev[vendorId].items.map((item, idx) => {
          if (idx !== itemIndex) return item;
          const updated = { ...item, [field]: value };
          // Track if cost was manually overridden
          if (field === 'unit_cost') {
            updated.cost_overridden = value !== item.original_cost;
          }
          return updated;
        }),
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

  // Calculate totals including freight/tariff
  const totals = useMemo(() => {
    let totalItems = 0;
    let totalPartsValue = 0;
    let totalFreight = 0;
    let totalTariff = 0;
    let overriddenCount = 0;
    let zerosCostCount = 0;
    
    Object.values(vendorGroups).forEach(group => {
      totalFreight += group.orderData.freight_cost || 0;
      totalTariff += group.orderData.tariff_cost || 0;
      
      group.items.forEach(item => {
        totalItems += item.qty_to_order;
        totalPartsValue += (item.qty_to_order || 0) * (item.unit_cost || 0);
        if (item.cost_overridden) overriddenCount++;
        if (!item.unit_cost || item.unit_cost <= 0) zerosCostCount++;
      });
    });
    
    return { 
      totalItems, 
      totalPartsValue,
      totalFreight,
      totalTariff,
      totalLandedCost: totalPartsValue + totalFreight + totalTariff,
      overriddenCount,
      zerosCostCount,
    };
  }, [vendorGroups]);

  // Use canonical supply action dispatcher
  const supplyAction = useSupplyAction({
    onSuccess: (data) => {
      const orderCount = data.created_orders?.length || 0;
      toast.success(`Created ${orderCount} order(s) successfully`);
      onSuccess?.();
      onClose();
    }
  });

  const handleCreateOrders = () => {
    // PHASE 10B: HARD ERROR - no unassigned vendors allowed
    if (Object.keys(vendorGroups).includes('unassigned')) {
      toast.error('PO_VENDOR_REQUIRED: All items must have a vendor assigned');
      return;
    }

    // PHASE 10B: Collect all commitment IDs - REQUIRED for all items
    const commitmentIds = [];
    const vendorOverrides = {};
    let missingCommitmentCount = 0;
    
    for (const [vendorId, group] of Object.entries(vendorGroups)) {
      for (const item of group.items) {
        if (!item.commitment_id) {
          missingCommitmentCount++;
          console.error('[PHASE 10B VIOLATION] Item missing commitment_id:', item);
        } else {
          commitmentIds.push(item.commitment_id);
          if (item.vendorOverride) {
            vendorOverrides[item.commitment_id] = item.vendorOverride;
          }
        }
      }
    }

    // PHASE 10B: HARD ERROR - all items must have commitment_id
    if (missingCommitmentCount > 0) {
      toast.error(`PO_COMMITMENT_REQUIRED: ${missingCommitmentCount} items missing commitment_id`);
      return;
    }

    if (commitmentIds.length === 0) {
      toast.error('No commitments selected for ordering');
      return;
    }

    // Build per-vendor order data including freight/tariff
    // Phase 6.2A: Each vendor PO has its own freight_cost and tariff_cost
    const vendorOrderData = {};
    for (const [vendorId, group] of Object.entries(vendorGroups)) {
      vendorOrderData[vendorId] = {
        po_prefix: group.orderData.po_prefix || 'AK',
        order_number: group.orderData.order_number || '',
        order_url: group.orderData.order_url || '',
        order_date: group.orderData.order_date || new Date().toISOString().split('T')[0],
        eta_date: group.orderData.eta_date || null,
        notes: group.orderData.notes || '',
        freight_cost: group.orderData.freight_cost || 0,
        tariff_cost: group.orderData.tariff_cost || 0,
      };
    }

    // Route through canonical dispatcher - NO direct entity writes
    supplyAction.mutate({
      action_type: 'CREATE_PO',
      commitment_ids: commitmentIds,
      payload: {
        po_prefix: Object.values(vendorGroups)[0]?.orderData?.po_prefix || 'AK',
        allow_multi_vendor: true,
        vendor_overrides: vendorOverrides,
        vendor_order_data: vendorOrderData, // Phase 6.2A: Per-vendor freight/tariff
      },
      dry_run: false
    });
  };

  const activeVendors = vendors.filter(v => v.active);
  const hasUnassignedVendor = Object.keys(vendorGroups).includes('unassigned');
  const groupCount = Object.keys(vendorGroups).length;
  
  // Phase 6.2: Single-vendor enforcement
  // Each PO group must have only one vendor - this is already enforced by grouping
  // But warn if user tries to mix vendors in a single group
  const vendorIds = Object.keys(vendorGroups).filter(v => v !== 'unassigned');
  const hasMultipleVendors = vendorIds.length > 1;

  if (groupCount === 0) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border border-red-900/30 text-white">
          <DialogHeader>
            <DialogTitle>Create Orders</DialogTitle>
            <DialogDescription>
              Create purchase orders from selected commitments.
            </DialogDescription>
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
              {totals.totalItems} items
            </div>
          </DialogTitle>
          <DialogDescription>
            Create purchase orders from selected commitments grouped by vendor.
          </DialogDescription>
        </DialogHeader>

        {/* Live Cost Summary */}
        <div className="flex-shrink-0 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Parts</span>
              <p className="text-white font-medium">${totals.totalPartsValue.toFixed(2)}</p>
            </div>
            <div>
              <span className="text-orange-400">Freight</span>
              <p className="text-orange-300 font-medium">${totals.totalFreight.toFixed(2)}</p>
            </div>
            <div>
              <span className="text-red-400">Tariff</span>
              <p className="text-red-300 font-medium">${totals.totalTariff.toFixed(2)}</p>
            </div>
            <div>
              <span className="text-purple-400">Landed Cost</span>
              <p className="text-purple-300 font-bold">${totals.totalLandedCost.toFixed(2)}</p>
            </div>
          </div>
          {(totals.overriddenCount > 0 || totals.zerosCostCount > 0) && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              {totals.overriddenCount > 0 && (
                <span className="text-yellow-400">⚠ {totals.overriddenCount} cost override{totals.overriddenCount > 1 ? 's' : ''}</span>
              )}
              {totals.zerosCostCount > 0 && (
                <span className="text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {totals.zerosCostCount} item{totals.zerosCostCount > 1 ? 's' : ''} with $0 cost
                </span>
              )}
            </div>
          )}
        </div>

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
                      {getVendorName(vendorId, group.vendorName)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {group.items.length} item{group.items.length > 1 ? 's' : ''} · 
                      ${group.items.reduce((sum, i) => sum + (i.qty_to_order * (i.unit_cost || 0)), 0).toFixed(2)}
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
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <Label className="text-gray-400 text-xs">PO Prefix</Label>
                    <Input
                      value={group.orderData.po_prefix}
                      onChange={(e) => updateVendorGroup(vendorId, 'po_prefix', e.target.value.toUpperCase())}
                      placeholder="AK"
                      className="bg-gray-800 border-gray-700 h-8 text-sm"
                      maxLength={10}
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs">PO Number (auto)</Label>
                    <Input
                      value={group.orderData.po_number}
                      onChange={(e) => updateVendorGroup(vendorId, 'po_number', e.target.value)}
                      placeholder={generatePONumber(group.orderData.po_prefix || 'AK')}
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-400 text-xs">Order / Confirmation #</Label>
                    <Input
                      value={group.orderData.order_number}
                      onChange={(e) => updateVendorGroup(vendorId, 'order_number', e.target.value)}
                      placeholder="Vendor's order number"
                      className="bg-gray-800 border-gray-700 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs">Order URL</Label>
                    <Input
                      value={group.orderData.order_url}
                      onChange={(e) => updateVendorGroup(vendorId, 'order_url', e.target.value)}
                      placeholder="https://..."
                      className="bg-gray-800 border-gray-700 h-8 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-gray-400 text-xs">Notes</Label>
                  <Textarea
                    value={group.orderData.notes}
                    onChange={(e) => updateVendorGroup(vendorId, 'notes', e.target.value)}
                    placeholder="Order notes..."
                    className="bg-gray-800 border-gray-700 h-12 text-sm"
                  />
                </div>

                {/* Phase 6.2A: Freight + Tariff per vendor PO (not shared across split POs) */}
                <div className="p-3 bg-orange-900/10 border border-orange-700/30 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-xs text-orange-300">
                    <Truck className="w-3 h-3" />
                    <span>Freight & Tariff for this vendor's PO only</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-orange-400 text-xs flex items-center gap-1">
                        Freight Cost
                      </Label>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-gray-500 text-xs">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={group.orderData.freight_cost || ''}
                          onChange={(e) => updateVendorGroup(vendorId, 'freight_cost', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="bg-gray-800 border-gray-700 h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-red-400 text-xs flex items-center gap-1">
                        Tariff/Duty
                      </Label>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-gray-500 text-xs">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={group.orderData.tariff_cost || ''}
                          onChange={(e) => updateVendorGroup(vendorId, 'tariff_cost', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="bg-gray-800 border-gray-700 h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                  <Separator className="bg-gray-700" />

                  {/* Line Items */}
                  <div className="space-y-2">
                    {group.items.map((item, idx) => (
                      <div 
                        key={idx} 
                        className={cn(
                          "flex items-center gap-2 p-2 bg-gray-800/30 rounded transition-colors",
                          cartMarkedItems.has(item.commitment_id) && "bg-green-900/20 border border-green-700/30"
                        )}
                      >
                        {/* Cart tracking checkbox - UI only */}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Checkbox
                                  checked={cartMarkedItems.has(item.commitment_id)}
                                  onCheckedChange={() => toggleCartMarked(item.commitment_id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className={cn(
                                    "border-gray-600",
                                    cartMarkedItems.has(item.commitment_id) && "border-green-500 data-[state=checked]:bg-green-600"
                                  )}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {cartMarkedItems.has(item.commitment_id) ? "Added to cart" : "Mark as added to cart"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            {/* PHASE 10B: part_name comes from read model directly */}
                            <p className={cn(
                              "text-sm truncate",
                              cartMarkedItems.has(item.commitment_id) ? "text-green-300" : "text-white"
                            )}>{item.part_name || item.part?.part_name}</p>
                            {item.order_url && item.order_url.startsWith('http') && (
                              <a
                                href={item.order_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 ml-1 flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                                title="Open Vendor Page"
                              >
                                <LinkIcon className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {/* PHASE 10B: project info comes from read model directly */}
                            {getProjectName(item)}
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
                        
                        <div className="flex items-center gap-1 w-28">
                          <span className="text-gray-500 text-xs">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unit_cost}
                            onChange={(e) => updateLineItem(vendorId, idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                            className={cn(
                              "h-7 bg-gray-800 text-sm",
                              item.cost_overridden ? "border-yellow-600 bg-yellow-900/20" : "border-gray-700",
                              (!item.unit_cost || item.unit_cost <= 0) && "border-red-600 bg-red-900/20"
                            )}
                            title={item.cost_overridden ? `Original: $${item.original_cost?.toFixed(2)}` : "Unit Cost"}
                            placeholder="Unit Cost"
                          />
                          {item.cost_overridden && (
                            <span className="text-yellow-500 text-xs" title="Cost manually overridden">*</span>
                          )}
                        </div>
                        
                        <span className="text-xs text-gray-400 w-16 text-right">
                          ${((item.qty_to_order || 0) * (item.unit_cost || 0)).toFixed(2)}
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
        <div className="flex-shrink-0 flex flex-col gap-2 pt-4 border-t border-gray-700">
          {/* Phase 6.2: Single-vendor enforcement notice */}
          {hasMultipleVendors && (
            <div className="flex items-center gap-2 p-2 bg-blue-900/20 border border-blue-700/50 rounded text-sm">
              <AlertCircle className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-blue-300">
                {vendorIds.length} vendors selected → {vendorIds.length} separate POs will be created (one per vendor)
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-between">
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
                onClick={handleCreateOrders}
                className="bg-red-600 hover:bg-red-700"
                disabled={supplyAction.isPending || hasUnassignedVendor}
              >
                {supplyAction.isPending ? (
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
        </div>
      </DialogContent>
    </Dialog>
  );
}