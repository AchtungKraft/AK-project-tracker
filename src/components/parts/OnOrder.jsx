import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Truck, Search, Package, ChevronDown, ChevronUp, CheckCircle, 
  FileText, Building2, FolderKanban, ExternalLink, Calendar, Pencil, Undo2
} from "lucide-react";
import { toast } from "sonner";
import EditOrderModal from "./EditOrderModal";

/**
 * OnOrder - Shows parts that have been ordered but not yet received
 * Grouped by Project/General AK, then by Order/PO within each group
 */
export default function OnOrder({ onPartClick }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [groupMode, setGroupMode] = useState('project'); // 'project' or 'po'
  const [expandedGroups, setExpandedGroups] = useState(new Set(['all']));
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [editingOrder, setEditingOrder] = useState(null);

  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ['partProjectRequirements'],
    queryFn: () => base44.entities.PartProjectRequirement.list()
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list()
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-order_date')
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list()
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const getPartName = (partId) => parts.find(p => p.id === partId)?.part_name || 'Unknown Part';
  const getPart = (partId) => parts.find(p => p.id === partId);
  const getVendorName = (vendorId) => vendors.find(v => v.id === vendorId)?.vendor_name || 'Unknown Vendor';
  const getProjectName = (projectId) => projects.find(p => p.id === projectId)?.name || 'General / AK Stock';
  const getOrder = (orderId) => orders.find(o => o.id === orderId);

  // Build pending line items with enriched data
  const pendingLineItems = useMemo(() => {
    return lineItems
      .filter(li => (li.qty_ordered || 0) > (li.qty_received || 0))
      .map(li => {
        const part = getPart(li.part_id);
        const order = getOrder(li.order_id);
        const vendor = order ? vendors.find(v => v.id === order.vendor_id) : null;
        const requirement = li.requirement_id ? requirements.find(r => r.id === li.requirement_id) : null;
        const project = requirement?.project_id ? projects.find(p => p.id === requirement.project_id) : null;
        
        const qtyPending = (li.qty_ordered || 0) - (li.qty_received || 0);
        
        return {
          lineItem: li,
          part,
          order,
          vendor,
          requirement,
          project,
          qtyPending,
          qtyOrdered: li.qty_ordered || 0,
          qtyReceived: li.qty_received || 0,
          unitPrice: li.unit_price || part?.default_cost || 0,
          value: qtyPending * (li.unit_price || part?.default_cost || 0),
          status: li.qty_received > 0 ? 'Partially Received' : 'Ordered',
        };
      })
      .filter(item => item.part);
  }, [lineItems, parts, orders, vendors, requirements, projects]);

  // Filter by search
  const filteredItems = useMemo(() => {
    if (!searchTerm) return pendingLineItems;
    const term = searchTerm.toLowerCase();
    return pendingLineItems.filter(item =>
      item.part?.part_name?.toLowerCase().includes(term) ||
      item.part?.vendor_part_number?.toLowerCase().includes(term) ||
      item.order?.po_number?.toLowerCase().includes(term) ||
      item.vendor?.vendor_name?.toLowerCase().includes(term) ||
      item.project?.name?.toLowerCase().includes(term)
    );
  }, [pendingLineItems, searchTerm]);

  // Group items
  const groupedData = useMemo(() => {
    if (groupMode === 'project') {
      // Group by Project, then by Order within each project
      const projectGroups = {};
      
      filteredItems.forEach(item => {
        const projectKey = item.project?.id || 'general';
        const projectLabel = item.project?.name || 'General / AK Stock';
        
        if (!projectGroups[projectKey]) {
          projectGroups[projectKey] = {
            id: projectKey,
            label: projectLabel,
            isGeneral: !item.project,
            orders: {},
            totalValue: 0,
            totalItems: 0,
          };
        }
        
        const orderKey = item.order?.id || 'no-order';
        if (!projectGroups[projectKey].orders[orderKey]) {
          projectGroups[projectKey].orders[orderKey] = {
            order: item.order,
            vendor: item.vendor,
            items: [],
            totalValue: 0,
          };
        }
        
        projectGroups[projectKey].orders[orderKey].items.push(item);
        projectGroups[projectKey].orders[orderKey].totalValue += item.value;
        projectGroups[projectKey].totalValue += item.value;
        projectGroups[projectKey].totalItems += 1;
      });
      
      // Convert to array and sort
      return Object.values(projectGroups)
        .map(g => ({
          ...g,
          orders: Object.values(g.orders).sort((a, b) => 
            (b.order?.order_date || '').localeCompare(a.order?.order_date || '')
          ),
        }))
        .sort((a, b) => {
          if (a.isGeneral) return 1;
          if (b.isGeneral) return -1;
          return a.label.localeCompare(b.label);
        });
    } else {
      // Group by PO/Order only
      const orderGroups = {};
      
      filteredItems.forEach(item => {
        const orderKey = item.order?.id || 'no-order';
        
        if (!orderGroups[orderKey]) {
          orderGroups[orderKey] = {
            id: orderKey,
            order: item.order,
            vendor: item.vendor,
            items: [],
            totalValue: 0,
          };
        }
        
        orderGroups[orderKey].items.push(item);
        orderGroups[orderKey].totalValue += item.value;
      });
      
      return Object.values(orderGroups).sort((a, b) => 
        (b.order?.order_date || '').localeCompare(a.order?.order_date || '')
      );
    }
  }, [filteredItems, groupMode]);

  const totalValue = filteredItems.reduce((sum, item) => sum + item.value, 0);

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleOrder = (orderId) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // Move back to Need To Buy mutation
  const moveToNeedToBuyMutation = useMutation({
    mutationFn: async ({ lineItem, part, qtyToMove }) => {
      // If linked to a requirement, update it
      if (lineItem.requirement_id) {
        const req = requirements.find(r => r.id === lineItem.requirement_id);
        if (req) {
          const newOrdered = Math.max(0, (req.qty_ordered || 0) - qtyToMove);
          await base44.entities.PartProjectRequirement.update(req.id, {
            qty_ordered: newOrdered,
            status: newOrdered > 0 ? 'Ordered' : 'Needed',
          });
        }
      } else {
        // Create a new general requirement for the moved quantity
        await base44.entities.PartProjectRequirement.create({
          part_id: lineItem.part_id,
          project_id: null,
          qty_needed: qtyToMove,
          qty_allocated: 0,
          qty_ordered: 0,
          qty_installed: 0,
          status: 'Needed',
          priority: 'Normal',
          notes: `Moved back from order`,
        });
      }

      // Update or delete the line item
      const newOrdered = (lineItem.qty_ordered || 0) - qtyToMove;
      if (newOrdered <= (lineItem.qty_received || 0)) {
        // Delete line item if nothing left to receive
        await base44.entities.PartPurchaseLineItem.delete(lineItem.id);
      } else {
        await base44.entities.PartPurchaseLineItem.update(lineItem.id, {
          qty_ordered: newOrdered,
          line_total: newOrdered * (lineItem.unit_price || 0),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partPurchaseLineItems'] });
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      toast.success('Moved back to Need To Buy');
    },
    onError: (error) => {
      toast.error('Failed to move: ' + error.message);
    },
  });

  // Receive line item mutation
  const receiveLineItemMutation = useMutation({
    mutationFn: async ({ lineItem, part, qtyToReceive, unitPrice }) => {
      // Create inventory item
      await base44.entities.InventoryItem.create({
        part_id: lineItem.part_id,
        location_id: null,
        quantity_on_hand: qtyToReceive,
        quantity_reserved: 0,
        purchase_cost: unitPrice,
        purchase_order_id: lineItem.order_id,
        received_date: new Date().toISOString().split('T')[0],
        notes: `Received from PO`,
      });

      // Update line item
      const newReceived = (lineItem.qty_received || 0) + qtyToReceive;
      const newStatus = newReceived >= lineItem.qty_ordered ? 'Received' : 'Partial';
      
      await base44.entities.PartPurchaseLineItem.update(lineItem.id, {
        qty_received: newReceived,
        status: newStatus,
      });

      // If line item was linked to a requirement, update it
      if (lineItem.requirement_id) {
        const req = requirements.find(r => r.id === lineItem.requirement_id);
        if (req) {
          const newOrdered = Math.max(0, (req.qty_ordered || 0) - qtyToReceive);
          const newAllocated = (req.qty_allocated || 0) + qtyToReceive;
          await base44.entities.PartProjectRequirement.update(req.id, {
            qty_ordered: newOrdered,
            qty_allocated: newAllocated,
            status: newAllocated >= req.qty_needed ? 'Allocated' : 'Partially Allocated',
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partPurchaseLineItems'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Parts received and added to inventory');
    },
    onError: (error) => {
      toast.error('Failed to receive: ' + error.message);
    },
  });

  const renderLineItem = (item) => {
    const part = item.part;
    
    return (
      <div 
        key={item.lineItem.id}
        className="p-3 flex items-center gap-3 hover:bg-yellow-950/20 transition-colors border-b border-yellow-900/10 last:border-b-0"
      >
        {part?.featured_photo && (
          <div 
            className="w-10 h-10 bg-gray-800 rounded flex-shrink-0 overflow-hidden cursor-pointer"
            onClick={() => onPartClick(part)}
          >
            <img src={part.featured_photo} alt="" className="w-full h-full object-contain" />
          </div>
        )}
        
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onPartClick(part)}>
          <p className="text-white text-sm font-medium truncate hover:text-yellow-400 transition-colors">
            {part?.part_name}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {part?.vendor_part_number && <span className="font-mono">{part.vendor_part_number}</span>}
            {item.project && groupMode === 'po' && <span>· {item.project.name}</span>}
          </div>
        </div>
        
        <div className="flex items-center gap-3 flex-shrink-0">
          <Badge 
            variant="outline" 
            className={item.status === 'Partially Received' ? 'border-orange-500 text-orange-400' : 'border-yellow-500 text-yellow-400'}
          >
            {item.status}
          </Badge>
          
          <div className="text-right text-sm w-24">
            <p className="text-white">
              <span className="text-green-400">{item.qtyReceived}</span>
              <span className="text-gray-500"> / </span>
              <span>{item.qtyOrdered}</span>
            </p>
            <p className="text-xs text-gray-500">${item.value.toFixed(2)}</p>
          </div>
          
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              moveToNeedToBuyMutation.mutate({
                lineItem: item.lineItem,
                part: item.part,
                qtyToMove: item.qtyPending,
              });
            }}
            disabled={moveToNeedToBuyMutation.isPending}
            className="border-yellow-600 text-yellow-400 hover:bg-yellow-950 h-7"
            title="Move back to Need To Buy"
          >
            <Undo2 className="w-3 h-3" />
          </Button>
          
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              receiveLineItemMutation.mutate({
                lineItem: item.lineItem,
                part: item.part,
                qtyToReceive: item.qtyPending,
                unitPrice: item.unitPrice,
              });
            }}
            disabled={receiveLineItemMutation.isPending}
            className="bg-green-600 hover:bg-green-700 h-7"
          >
            <CheckCircle className="w-3 h-3 mr-1" />
            Receive {item.qtyPending}
          </Button>
        </div>
      </div>
    );
  };

  const renderOrderGroup = (orderData, showProjectInfo = false) => {
    const order = orderData.order;
    const isExpanded = expandedOrders.has(order?.id) || !order;
    
    return (
      <div key={order?.id || 'no-order'} className="border border-yellow-900/20 rounded-lg overflow-hidden mb-2 last:mb-0">
        {order && (
          <div 
            className="p-2 bg-gray-800/30 flex items-center justify-between cursor-pointer"
            onClick={() => toggleOrder(order.id)}
          >
            <div className="flex items-center gap-2">
              {isExpanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
              <FileText className="w-4 h-4 text-blue-400" />
              <div>
                <p className="text-sm font-medium text-white">
                  {order.po_number || `Order ${order.id.slice(0, 8)}`}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{orderData.vendor?.vendor_name}</span>
                  {order.order_date && (
                    <>
                      <span>·</span>
                      <Calendar className="w-3 h-3" />
                      <span>{order.order_date}</span>
                    </>
                  )}
                  {order.eta_date && <span>· ETA: {order.eta_date}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {order.notes && order.notes.startsWith('http') && (
                <a 
                  href={order.notes}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-400 hover:text-blue-300"
                  title="Open reference link"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingOrder(order);
                }}
                className="h-7 w-7 text-gray-400 hover:text-yellow-400"
                title="Edit order details"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Badge variant="outline" className="border-gray-600 text-gray-400">
                {orderData.items.length} item{orderData.items.length !== 1 ? 's' : ''}
              </Badge>
              <span className="text-sm text-yellow-400 font-medium">
                ${orderData.totalValue.toFixed(2)}
              </span>
            </div>
          </div>
        )}
        
        {(isExpanded || !order) && (
          <div className="divide-y divide-yellow-900/10">
            {orderData.items.map(item => renderLineItem(item))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="bg-black/40 backdrop-blur-xl border border-yellow-900/30">
        <CardHeader className="border-b border-yellow-900/30 p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-yellow-400" />
              <CardTitle className="text-white text-base">On Order</CardTitle>
              <Badge variant="outline" className="border-yellow-500 text-yellow-400">
                {filteredItems.length} items
              </Badge>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Total Pending Value</p>
              <p className="text-lg font-bold text-white">${totalValue.toFixed(2)}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filters & Group Toggle */}
      <Card className="bg-black/40 backdrop-blur-xl border border-yellow-900/30">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search parts, orders, vendors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-900/50 border-gray-700 text-white"
              />
            </div>
            
            <Tabs value={groupMode} onValueChange={setGroupMode}>
              <TabsList className="bg-gray-900/50 border border-gray-700">
                <TabsTrigger value="project" className="data-[state=active]:bg-yellow-900/30 gap-1.5">
                  <FolderKanban className="w-3.5 h-3.5" />
                  By Project
                </TabsTrigger>
                <TabsTrigger value="po" className="data-[state=active]:bg-yellow-900/30 gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  By PO
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Grouped Orders */}
      {isLoading ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-yellow-900/30">
          <CardContent className="p-8 text-center text-gray-500">Loading...</CardContent>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-yellow-900/30">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No parts currently on order.</p>
          </CardContent>
        </Card>
      ) : groupMode === 'project' ? (
        <div className="space-y-3">
          {groupedData.map(group => {
            const isExpanded = expandedGroups.has(group.id) || expandedGroups.has('all');
            
            return (
              <Card key={group.id} className="bg-black/40 backdrop-blur-xl border border-yellow-900/30">
                <CardHeader 
                  className="p-3 cursor-pointer hover:bg-yellow-950/20 transition-colors"
                  onClick={() => toggleGroup(group.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      <div>
                        <p className={`font-medium ${group.isGeneral ? 'text-yellow-400' : 'text-white'}`}>
                          {group.isGeneral && <Building2 className="w-4 h-4 inline mr-1.5" />}
                          {group.label}
                        </p>
                        <p className="text-xs text-gray-500">
                          {group.orders.length} order{group.orders.length !== 1 ? 's' : ''} · {group.totalItems} item{group.totalItems !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm text-yellow-400 font-medium">
                      ${group.totalValue.toFixed(2)}
                    </span>
                  </div>
                </CardHeader>
                
                {isExpanded && (
                  <CardContent className="p-3 pt-0 border-t border-yellow-900/20">
                    {group.orders.map(orderData => renderOrderGroup(orderData))}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {groupedData.map(orderData => (
            <Card key={orderData.id} className="bg-black/40 backdrop-blur-xl border border-yellow-900/30 overflow-hidden">
              {renderOrderGroup(orderData, true)}
            </Card>
          ))}
        </div>
      )}

      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
        />
      )}
    </div>
  );
}