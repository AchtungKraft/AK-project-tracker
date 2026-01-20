import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ShoppingCart, Search, CheckCircle, ChevronDown, ChevronUp, 
  ExternalLink, Plus, Package, Building2, FolderKanban, MoreVertical, Trash2, ArrowRight, Truck
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import OrderPartModal from "./OrderPartModal";
import CreateBatchOrderModal from "./CreateBatchOrderModal";
import MoveRequirementModal from "./MoveRequirementModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

/**
 * NeedToBuy - Shows parts that need to be ordered
 * Supports grouping by Project or General AK, with multi-select for batch ordering
 * Has tabs for Client Parts vs Low AK Stock items
 */
export default function NeedToBuy({ onPartClick }) {
  const [activeTab, setActiveTab] = useState('client'); // 'client' or 'lowstock'
  const [searchTerm, setSearchTerm] = useState('');
  const [groupMode, setGroupMode] = useState('project'); // 'project' or 'vendor'
  const [subGroupMode, setSubGroupMode] = useState('vendor'); // sub-group: 'vendor' or 'project'
  const [expandedGroups, setExpandedGroups] = useState(new Set(['all']));
  const [expandedSubGroups, setExpandedSubGroups] = useState(new Set(['all']));
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [orderModalPart, setOrderModalPart] = useState(null);
  const [showBatchOrderModal, setShowBatchOrderModal] = useState(false);
  const [moveItem, setMoveItem] = useState(null);
  const [addToClientPart, setAddToClientPart] = useState(null);
  const queryClient = useQueryClient();

  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ['partProjectRequirements'],
    queryFn: () => base44.entities.PartProjectRequirement.list()
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list()
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list()
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list()
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list()
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list()
  });

  // Calculate on-order quantity per part (from open PO line items)
  const partOnOrder = useMemo(() => {
    const map = {};
    lineItems.forEach(li => {
      const pending = Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0));
      if (pending > 0) {
        if (!map[li.part_id]) map[li.part_id] = { qty: 0, vendors: new Set() };
        map[li.part_id].qty += pending;
        const order = orders.find(o => o.id === li.order_id);
        if (order?.vendor_id) {
          const vendor = vendors.find(v => v.id === order.vendor_id);
          if (vendor) map[li.part_id].vendors.add(vendor.vendor_name);
        }
      }
    });
    return map;
  }, [lineItems, orders, vendors]);

  // Remove requirement mutation
  const removeRequirementMutation = useMutation({
    mutationFn: async (item) => {
      const req = item.requirement;
      const allocatedNotInstalled = (req.qty_allocated || 0) - (req.qty_installed || 0);
      
      // Release reserved inventory if any
      if (allocatedNotInstalled > 0) {
        const partInventory = inventoryItems.filter(i => i.part_id === req.part_id);
        let remaining = allocatedNotInstalled;
        
        for (const invItem of partInventory) {
          if (remaining <= 0) break;
          const toRelease = Math.min(invItem.quantity_reserved || 0, remaining);
          if (toRelease > 0) {
            await base44.entities.InventoryItem.update(invItem.id, {
              quantity_reserved: Math.max(0, (invItem.quantity_reserved || 0) - toRelease)
            });
            remaining -= toRelease;
          }
        }
      }
      
      // Delete the requirement
      await base44.entities.PartProjectRequirement.delete(req.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      toast.success('Requirement removed from project');
    },
    onError: (error) => {
      toast.error('Failed to remove: ' + error.message);
    },
  });

  const handleRemoveRequirement = (item) => {
    const req = item.requirement;
    const hasInstalled = (req.qty_installed || 0) > 0;
    
    if (hasInstalled) {
      toast.error('Cannot remove: parts have already been installed');
      return;
    }
    
    const allocatedNotInstalled = (req.qty_allocated || 0) - (req.qty_installed || 0);
    const message = allocatedNotInstalled > 0
      ? `Remove this requirement? ${allocatedNotInstalled} allocated unit(s) will be released back to inventory.`
      : 'Remove this part requirement from the project?';
    
    if (confirm(message)) {
      removeRequirementMutation.mutate(item);
    }
  };

  // Calculate parts that need ordering from requirements (Client Parts tab)
  // toOrder = qty_needed - qty_installed - qty_allocated - qty_ordered
  // (installed parts are done, allocated reduces demand, ordered is in pipeline)
  const partsToOrder = useMemo(() => {
    return requirements
      .map(req => {
        const toOrder = (req.qty_needed || 0) - (req.qty_installed || 0) - (req.qty_allocated || 0) - (req.qty_ordered || 0);
        if (toOrder <= 0) return null;
        
        const part = parts.find(p => p.id === req.part_id);
        if (!part) return null;
        
        const project = projects.find(p => p.id === req.project_id);
        const vendor = vendors.find(v => v.id === part.default_vendor_id);
        
        const onOrderInfo = partOnOrder[part.id];
        
        return {
          id: req.id,
          requirement: req,
          part,
          project,
          vendor,
          qty_to_order: toOrder,
          estimated_cost: toOrder * (part.default_cost || 0),
          onOrderQty: onOrderInfo?.qty || 0,
          onOrderVendors: onOrderInfo ? Array.from(onOrderInfo.vendors) : []
        };
      })
      .filter(Boolean);
  }, [requirements, parts, projects, vendors, partOnOrder]);

  // Calculate low stock parts (Low AK Stock tab)
  // Parts where reorder_point > 0 and current inventory (net available) is below reorder_point
  const lowStockParts = useMemo(() => {
    return parts
      .filter(part => {
        if (!part.reorder_point || part.reorder_point <= 0) return false;
        
        // Calculate net available inventory for this part
        const partInventory = inventoryItems.filter(i => i.part_id === part.id);
        const totalOnHand = partInventory.reduce((sum, i) => sum + (i.quantity_on_hand || 0), 0);
        const totalReserved = partInventory.reduce((sum, i) => sum + (i.quantity_reserved || 0), 0);
        const netAvailable = totalOnHand - totalReserved;
        
        return netAvailable < part.reorder_point;
      })
      .map(part => {
        const partInventory = inventoryItems.filter(i => i.part_id === part.id);
        const totalOnHand = partInventory.reduce((sum, i) => sum + (i.quantity_on_hand || 0), 0);
        const totalReserved = partInventory.reduce((sum, i) => sum + (i.quantity_reserved || 0), 0);
        const netAvailable = totalOnHand - totalReserved;
        const vendor = vendors.find(v => v.id === part.default_vendor_id);
        const qtyToOrder = Math.max(1, part.reorder_point - netAvailable);
        
        const onOrderInfo = partOnOrder[part.id];
        
        return {
          id: `lowstock-${part.id}`,
          part,
          vendor,
          netAvailable,
          reorderPoint: part.reorder_point,
          qty_to_order: qtyToOrder,
          estimated_cost: qtyToOrder * (part.default_cost || 0),
          isLowStock: true,
          onOrderQty: onOrderInfo?.qty || 0,
          onOrderVendors: onOrderInfo ? Array.from(onOrderInfo.vendors) : []
        };
      });
  }, [parts, inventoryItems, vendors, partOnOrder]);

  // Filter by search based on active tab
  // Client Parts includes both project-linked AND general (null project_id) requirements
  const filteredItems = useMemo(() => {
    const sourceItems = activeTab === 'client' ? partsToOrder : lowStockParts;
    if (!searchTerm) return sourceItems;
    const term = searchTerm.toLowerCase();
    return sourceItems.filter(item => 
      item.part.part_name?.toLowerCase().includes(term) ||
      item.part.vendor_part_number?.toLowerCase().includes(term) ||
      item.project?.name?.toLowerCase().includes(term) ||
      item.vendor?.vendor_name?.toLowerCase().includes(term)
    );
  }, [activeTab, partsToOrder, lowStockParts, searchTerm]);

  // Group items by project or vendor, with sub-grouping
  const groupedItems = useMemo(() => {
    const groups = {};
    
    if (groupMode === 'project') {
      // Group by project, with "General / AK Stock" for items without project
      filteredItems.forEach(item => {
        const key = item.project?.id || 'general';
        const label = item.project?.name || 'General / AK Stock';
        if (!groups[key]) {
          groups[key] = { 
            id: key, 
            label, 
            isGeneral: !item.project,
            items: [],
            subGroups: {}
          };
        }
        groups[key].items.push(item);
        
        // Sub-group by vendor
        const subKey = item.vendor?.id || 'unassigned';
        const subLabel = item.vendor?.vendor_name || 'No Vendor Assigned';
        if (!groups[key].subGroups[subKey]) {
          groups[key].subGroups[subKey] = {
            id: subKey,
            label: subLabel,
            isUnassigned: !item.vendor,
            items: []
          };
        }
        groups[key].subGroups[subKey].items.push(item);
      });
    } else {
      // Group by vendor
      filteredItems.forEach(item => {
        const key = item.vendor?.id || 'unassigned';
        const label = item.vendor?.vendor_name || 'No Vendor Assigned';
        if (!groups[key]) {
          groups[key] = { 
            id: key, 
            label, 
            isUnassigned: !item.vendor,
            items: [],
            subGroups: {}
          };
        }
        groups[key].items.push(item);
        
        // Sub-group by project
        const subKey = item.project?.id || 'general';
        const subLabel = item.project?.name || 'General / AK Stock';
        if (!groups[key].subGroups[subKey]) {
          groups[key].subGroups[subKey] = {
            id: subKey,
            label: subLabel,
            isGeneral: !item.project,
            items: []
          };
        }
        groups[key].subGroups[subKey].items.push(item);
      });
    }
    
    // Convert subGroups to arrays and sort
    Object.values(groups).forEach(group => {
      group.subGroupsArray = Object.values(group.subGroups).sort((a, b) => {
        if (a.isGeneral || a.isUnassigned) return 1;
        if (b.isGeneral || b.isUnassigned) return -1;
        return a.label.localeCompare(b.label);
      });
    });
    
    // Sort: General/Unassigned last, then alphabetically
    return Object.values(groups).sort((a, b) => {
      if (a.isGeneral || a.isUnassigned) return 1;
      if (b.isGeneral || b.isUnassigned) return -1;
      return a.label.localeCompare(b.label);
    });
  }, [filteredItems, groupMode]);

  const totalEstimatedCost = filteredItems.reduce((sum, item) => sum + item.estimated_cost, 0);
  const selectedCount = selectedItems.size;

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleSubGroup = (subGroupId) => {
    setExpandedSubGroups(prev => {
      const next = new Set(prev);
      if (next.has(subGroupId)) next.delete(subGroupId);
      else next.add(subGroupId);
      return next;
    });
  };

  const toggleItemSelection = (itemId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleGroupSelection = (groupItems) => {
    const groupIds = groupItems.map(i => i.id);
    const allSelected = groupIds.every(id => selectedItems.has(id));
    
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (allSelected) {
        groupIds.forEach(id => next.delete(id));
      } else {
        groupIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map(i => i.id)));
    }
  };

  const getSelectedItemsData = () => {
    return filteredItems.filter(item => selectedItems.has(item.id));
  };

  const getCategoryPath = (categoryId) => {
    if (!categoryId) return null;
    const category = categories.find(c => c.id === categoryId);
    if (!category) return null;
    if (category.parent_id) {
      const parent = categories.find(c => c.id === category.parent_id);
      return parent ? `${parent.name} > ${category.name}` : category.name;
    }
    return category.name;
  };

  return (
    <div className="space-y-4">
      {/* Summary Card with Tabs */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <ShoppingCart className="w-5 h-5 text-red-400" />
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="bg-gray-900/50 border border-gray-700">
                  <TabsTrigger value="client" className="data-[state=active]:bg-red-900/30 gap-1.5">
                    <FolderKanban className="w-3.5 h-3.5" />
                    Client Parts
                    <Badge variant="outline" className="ml-1 border-gray-600 text-gray-400 text-xs px-1.5">
                      {partsToOrder.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="lowstock" className="data-[state=active]:bg-red-900/30 gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    Low AK Stock
                    <Badge variant="outline" className="ml-1 border-yellow-600 text-yellow-400 text-xs px-1.5">
                      {lowStockParts.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-gray-400">Est. Total</p>
                <p className="text-lg font-bold text-white">${totalEstimatedCost.toFixed(2)}</p>
              </div>
              {selectedCount > 0 && activeTab === 'client' && (
                <Button
                  onClick={() => setShowBatchOrderModal(true)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Order ({selectedCount})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filters & Group Toggle */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search parts, projects, vendors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-900/50 border-gray-700 text-white"
              />
            </div>
            
            {activeTab === 'client' && (
              <div className="flex items-center gap-3">
                <Tabs value={groupMode} onValueChange={setGroupMode}>
                  <TabsList className="bg-gray-900/50 border border-gray-700">
                    <TabsTrigger value="project" className="data-[state=active]:bg-red-900/30 gap-1.5">
                      <FolderKanban className="w-3.5 h-3.5" />
                      By Project
                    </TabsTrigger>
                    <TabsTrigger value="vendor" className="data-[state=active]:bg-red-900/30 gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      By Vendor
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                  className="border-gray-700 text-gray-300"
                >
                  {selectedItems.size === filteredItems.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grouped Parts List */}
      {isLoading ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 text-center text-gray-500">Loading...</CardContent>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-gray-400">
              {activeTab === 'client' 
                ? 'All caught up! No client parts need to be ordered.'
                : 'All stock levels are good! No parts below reorder point.'}
            </p>
          </CardContent>
        </Card>
      ) : activeTab === 'lowstock' ? (
        // Low Stock View - Simple list grouped by vendor
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-0 divide-y divide-red-900/20">
            {filteredItems.map(item => {
              const categoryPath = getCategoryPath(item.part.part_category_id);
              return (
                <div 
                  key={item.id}
                  className="p-3 flex items-center gap-3 hover:bg-red-950/20 transition-colors"
                >
                  {item.part.featured_photo && (
                    <div 
                      className="w-12 h-12 bg-gray-800 rounded flex-shrink-0 overflow-hidden cursor-pointer"
                      onClick={() => onPartClick(item.part)}
                    >
                      <img 
                        src={item.part.featured_photo} 
                        alt="" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => onPartClick(item.part)}
                  >
                    <p className="text-white text-sm font-medium truncate hover:text-red-400 transition-colors">
                      {item.part.part_name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {item.part.vendor_part_number && (
                        <span className="font-mono">{item.part.vendor_part_number}</span>
                      )}
                      {item.vendor && <span>· {item.vendor.vendor_name}</span>}
                      {categoryPath && <span>· {categoryPath}</span>}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 flex-shrink-0">
                  {/* On Order indicator */}
                  {item.onOrderQty > 0 && (
                    <Badge variant="outline" className="border-purple-600 text-purple-400 gap-1">
                      <Truck className="w-3 h-3" />
                      {item.onOrderQty} on order
                      {item.onOrderVendors.length > 0 && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({item.onOrderVendors.slice(0, 2).join(', ')})
                        </span>
                      )}
                    </Badge>
                  )}

                  <div className="text-center">
                    <p className="text-xs text-gray-500">Current</p>
                    <p className={`font-medium ${item.netAvailable < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {item.netAvailable}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Min</p>
                    <p className="text-gray-300 font-medium">{item.reorderPoint}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Order</p>
                    <p className="text-white font-bold">×{item.qty_to_order}</p>
                  </div>
                    
                    {item.estimated_cost > 0 && (
                      <div className="text-right w-20">
                        <p className="text-xs text-yellow-400">${item.estimated_cost.toFixed(2)}</p>
                      </div>
                    )}
                    
                    {item.part.order_url && (
                      <a 
                        href={item.part.order_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOrderModalPart(item.part);
                      }}
                      className="border-gray-700 text-gray-300 hover:text-white h-7"
                    >
                      Order
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddToClientPart(item);
                      }}
                      className="border-yellow-700 text-yellow-400 hover:text-yellow-300 h-7"
                      title="Add to Client Parts list for batch ordering"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groupedItems.map(group => {
            const isExpanded = expandedGroups.has(group.id) || expandedGroups.has('all');
            const groupSelectedCount = group.items.filter(i => selectedItems.has(i.id)).length;
            const allGroupSelected = groupSelectedCount === group.items.length;
            const groupTotal = group.items.reduce((sum, i) => sum + i.estimated_cost, 0);
            
            return (
              <Card key={group.id} className="bg-black/40 backdrop-blur-xl border border-red-900/30">
                <CardHeader 
                  className="p-3 cursor-pointer hover:bg-red-950/20 transition-colors"
                  onClick={() => toggleGroup(group.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={allGroupSelected && group.items.length > 0}
                        onCheckedChange={() => toggleGroupSelection(group.items)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      <div>
                        <p className={`font-medium ${group.isGeneral || group.isUnassigned ? 'text-yellow-400' : 'text-white'}`}>
                          {group.isGeneral && <Building2 className="w-4 h-4 inline mr-1.5" />}
                          {group.label}
                        </p>
                        <p className="text-xs text-gray-500">
                          {group.items.length} item{group.items.length !== 1 ? 's' : ''} · ${groupTotal.toFixed(2)}
                          {groupSelectedCount > 0 && ` · ${groupSelectedCount} selected`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-gray-600 text-gray-400">
                      {group.items.length}
                    </Badge>
                  </div>
                </CardHeader>
                
                {isExpanded && (
                  <CardContent className="p-0 border-t border-red-900/20">
                    {group.subGroupsArray.map(subGroup => {
                      const subGroupKey = `${group.id}-${subGroup.id}`;
                      const isSubExpanded = expandedSubGroups.has(subGroupKey) || expandedSubGroups.has('all');
                      const subGroupSelectedCount = subGroup.items.filter(i => selectedItems.has(i.id)).length;
                      const subGroupTotal = subGroup.items.reduce((sum, i) => sum + i.estimated_cost, 0);
                      
                      return (
                        <div key={subGroupKey} className="border-b border-red-900/10 last:border-b-0">
                          {/* Sub-group header */}
                          <div 
                            className="px-4 py-2 bg-gray-800/30 flex items-center justify-between cursor-pointer hover:bg-gray-800/50 transition-colors"
                            onClick={() => toggleSubGroup(subGroupKey)}
                          >
                            <div className="flex items-center gap-2">
                              {isSubExpanded ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
                              {groupMode === 'project' ? (
                                <Building2 className="w-3.5 h-3.5 text-gray-500" />
                              ) : (
                                <FolderKanban className="w-3.5 h-3.5 text-gray-500" />
                              )}
                              <span className={`text-sm ${subGroup.isGeneral || subGroup.isUnassigned ? 'text-yellow-400' : 'text-gray-300'}`}>
                                {subGroup.label}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({subGroup.items.length}) · ${subGroupTotal.toFixed(2)}
                                {subGroupSelectedCount > 0 && ` · ${subGroupSelectedCount} selected`}
                              </span>
                            </div>
                          </div>
                          
                          {/* Sub-group items */}
                          {isSubExpanded && (
                            <div className="divide-y divide-red-900/10">
                              {subGroup.items.map(item => {
                                const isSelected = selectedItems.has(item.id);
                                const categoryPath = getCategoryPath(item.part.part_category_id);
                                
                                return (
                                  <div 
                                    key={item.id}
                                    className={`p-3 pl-8 flex items-center gap-3 hover:bg-red-950/20 transition-colors ${isSelected ? 'bg-red-950/30' : ''}`}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleItemSelection(item.id)}
                                    />
                                    
                                    {item.part.featured_photo && (
                                      <div 
                                        className="w-12 h-12 bg-gray-800 rounded flex-shrink-0 overflow-hidden cursor-pointer"
                                        onClick={() => onPartClick(item.part)}
                                      >
                                        <img 
                                          src={item.part.featured_photo} 
                                          alt="" 
                                          className="w-full h-full object-contain"
                                        />
                                      </div>
                                    )}
                                    
                                    <div 
                                      className="flex-1 min-w-0 cursor-pointer"
                                      onClick={() => onPartClick(item.part)}
                                    >
                                      <p className="text-white text-sm font-medium truncate hover:text-red-400 transition-colors">
                                        {item.part.part_name}
                                      </p>
                                      <div className="flex items-center gap-2 text-xs text-gray-500">
                                        {item.part.vendor_part_number && (
                                          <span className="font-mono">{item.part.vendor_part_number}</span>
                                        )}
                                        {categoryPath && <span>· {categoryPath}</span>}
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4 flex-shrink-0">
                                      <Badge 
                                        className={
                                          item.requirement.priority === 'Critical' ? 'bg-red-600' :
                                          item.requirement.priority === 'High' ? 'bg-orange-600' :
                                          item.requirement.priority === 'Low' ? 'bg-gray-600' : 'bg-blue-600'
                                        }
                                      >
                                        {item.requirement.priority || 'Normal'}
                                      </Badge>
                                      
                                      {/* On Order indicator */}
                                      {item.onOrderQty > 0 && (
                                        <Badge variant="outline" className="border-purple-600 text-purple-400 gap-1">
                                          <Truck className="w-3 h-3" />
                                          {item.onOrderQty} on order
                                          {item.onOrderVendors.length > 0 && (
                                            <span className="text-xs text-gray-400 ml-1">
                                              ({item.onOrderVendors.slice(0, 2).join(', ')})
                                            </span>
                                          )}
                                        </Badge>
                                      )}
                                      
                                      <div className="text-right w-20">
                                        <p className="text-white font-medium">×{item.qty_to_order}</p>
                                        {item.estimated_cost > 0 && (
                                          <p className="text-xs text-yellow-400">${item.estimated_cost.toFixed(2)}</p>
                                        )}
                                      </div>
                                      
                                      {item.part.order_url && (
                                        <a 
                                          href={item.part.order_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-blue-400 hover:text-blue-300"
                                        >
                                          <ExternalLink className="w-4 h-4" />
                                        </a>
                                      )}
                                      
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOrderModalPart(item.part);
                                        }}
                                        className="border-gray-700 text-gray-300 hover:text-white h-7"
                                      >
                                        Order
                                      </Button>
                                      
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-gray-400 hover:text-white"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <MoreVertical className="w-4 h-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                                          <DropdownMenuItem
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setMoveItem(item);
                                            }}
                                          >
                                            <ArrowRight className="w-4 h-4 mr-2" />
                                            Move to Project
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator className="bg-gray-700" />
                                          <DropdownMenuItem
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRemoveRequirement(item);
                                            }}
                                            className="text-red-400"
                                          >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Remove from Project
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {orderModalPart && (
        <OrderPartModal 
          part={orderModalPart}
          onClose={() => setOrderModalPart(null)}
          onPartClick={(partId) => {
            const part = parts.find(p => p.id === partId);
            if (part) onPartClick(part);
          }}
        />
      )}

      {showBatchOrderModal && (
        <CreateBatchOrderModal
          selectedItems={getSelectedItemsData()}
          onClose={() => setShowBatchOrderModal(false)}
          onSuccess={() => setSelectedItems(new Set())}
        />
      )}

      {moveItem && (
        <MoveRequirementModal
          requirement={moveItem.requirement}
          part={moveItem.part}
          currentProject={moveItem.project}
          onClose={() => setMoveItem(null)}
        />
      )}

      {addToClientPart && (
        <AddLowStockToClientModal
          item={addToClientPart}
          onClose={() => setAddToClientPart(null)}
        />
      )}
    </div>
  );
}

// Modal to add low stock item to Client Parts list
function AddLowStockToClientModal({ item, onClose }) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(item.qty_to_order || 1);
  const [priority, setPriority] = useState('Normal');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.PartProjectRequirement.create({
        part_id: item.part.id,
        project_id: null, // General / AK Stock
        qty_needed: quantity,
        qty_allocated: 0,
        qty_ordered: 0,
        qty_installed: 0,
        status: 'Needed',
        priority,
        notes: notes || `Stock replenishment for ${item.part.part_name}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      toast.success(`Added to Client Parts - General / AK Stock`);
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to add: ' + error.message);
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <ArrowRight className="w-5 h-5 text-yellow-400" />
            Add to Client Parts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Part Info */}
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex items-center gap-3">
              {item.part.featured_photo ? (
                <img 
                  src={item.part.featured_photo} 
                  alt="" 
                  className="w-12 h-12 rounded object-contain bg-gray-800"
                />
              ) : (
                <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center">
                  <Package className="w-6 h-6 text-gray-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{item.part.part_name}</p>
                {item.part.vendor_part_number && (
                  <p className="text-xs text-gray-400 font-mono">{item.part.vendor_part_number}</p>
                )}
                <p className="text-xs text-gray-500">
                  Current: {item.netAvailable} · Min: {item.reorderPoint}
                </p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="p-3 bg-yellow-900/20 border border-yellow-900/30 rounded-lg">
            <p className="text-sm text-yellow-400">
              This will add to <strong>General / AK Stock</strong> in Client Parts
            </p>
            <p className="text-xs text-gray-400 mt-1">
              You can then batch order with other parts from the same vendor
            </p>
          </div>

          {/* Quantity */}
          <div>
            <Label className="text-gray-300">Quantity to Order</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>

          {/* Priority */}
          <div>
            <Label className="text-gray-300">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Normal">Normal</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-gray-300">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for ordering..."
              className="bg-gray-800 border-gray-700 text-white"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-700">
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ArrowRight className="w-4 h-4 mr-2" />
            )}
            Add to Client Parts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}