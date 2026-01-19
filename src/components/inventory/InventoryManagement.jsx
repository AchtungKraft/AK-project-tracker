import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Plus, Package, MapPin, AlertTriangle, MoreVertical, ShoppingCart, Eye, Wrench, HelpCircle } from "lucide-react";
import AddInventoryModal from "./AddInventoryModal";
import OrderPartModal from "../parts/OrderPartModal";
import AddToBuildModal from "../parts/AddToBuildModal";

export default function InventoryManagement({ onPartClick }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addInventoryPartId, setAddInventoryPartId] = useState(null);
  const [orderPart, setOrderPart] = useState(null);
  const [buildPart, setBuildPart] = useState(null);

  const { data: inventoryItems = [], isLoading } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list('-created_date')
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list()
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list()
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ['partProjectRequirements'],
    queryFn: () => base44.entities.PartProjectRequirement.list()
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list()
  });

  // Calculate demand and pipeline per part
  const partMetrics = useMemo(() => {
    const metrics = {};
    
    // Calculate demand from requirements (qty_needed - qty_installed)
    requirements.forEach(req => {
      if (!metrics[req.part_id]) {
        metrics[req.part_id] = { needed: 0, onOrder: 0 };
      }
      const stillNeeded = Math.max(0, (req.qty_needed || 0) - (req.qty_installed || 0));
      metrics[req.part_id].needed += stillNeeded;
    });
    
    // Calculate on-order from line items (qty_ordered - qty_received)
    lineItems.forEach(li => {
      const pending = Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0));
      if (pending > 0) {
        if (!metrics[li.part_id]) {
          metrics[li.part_id] = { needed: 0, onOrder: 0 };
        }
        metrics[li.part_id].onOrder += pending;
      }
    });
    
    return metrics;
  }, [requirements, lineItems]);

  const getPartName = (partId) => {
    const part = parts.find(p => p.id === partId);
    return part?.part_name || 'Unknown Part';
  };

  const getLocationName = (locationId) => {
    if (!locationId) return 'No Location';
    const location = locations.find(l => l.id === locationId);
    if (!location) return 'Unknown';
    if (location.parent_id) {
      const parent = locations.find(l => l.id === location.parent_id);
      return parent ? `${parent.location_area} > ${location.location_area}` : location.location_area;
    }
    return location.location_area;
  };

  const getAllDescendantCategoryIds = (categoryId) => {
    const descendants = new Set([categoryId]);
    const queue = [categoryId];
    while (queue.length > 0) {
      const current = queue.shift();
      categories.forEach(cat => {
        if (cat.parent_id === current && !descendants.has(cat.id)) {
          descendants.add(cat.id);
          queue.push(cat.id);
        }
      });
    }
    return Array.from(descendants);
  };

  const filteredItems = inventoryItems.filter(item => {
    const part = parts.find(p => p.id === item.part_id);
    const matchesSearch = part?.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         part?.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLocation = locationFilter === 'all' || item.location_id === locationFilter;
    
    let matchesCategory = categoryFilter === 'all';
    if (!matchesCategory && part?.part_category_id) {
      const relevantCategoryIds = getAllDescendantCategoryIds(categoryFilter);
      matchesCategory = relevantCategoryIds.includes(part.part_category_id);
    }
    
    return matchesSearch && matchesLocation && matchesCategory;
  });

  // Aggregate inventory by part for summary calculations
  const aggregatedByPart = useMemo(() => {
    const agg = {};
    filteredItems.forEach(item => {
      if (!agg[item.part_id]) {
        agg[item.part_id] = { onHand: 0, reserved: 0 };
      }
      agg[item.part_id].onHand += item.quantity_on_hand || 0;
      agg[item.part_id].reserved += item.quantity_reserved || 0;
    });
    return agg;
  }, [filteredItems]);

  // Calculate global totals
  const globalTotals = useMemo(() => {
    let onHand = 0, reserved = 0, available = 0, needed = 0, onOrder = 0;
    
    filteredItems.forEach(item => {
      onHand += item.quantity_on_hand || 0;
      reserved += item.quantity_reserved || 0;
    });
    available = onHand - reserved;
    
    // Get unique part IDs from filtered items
    const partIds = new Set(filteredItems.map(i => i.part_id));
    partIds.forEach(partId => {
      const metrics = partMetrics[partId] || { needed: 0, onOrder: 0 };
      needed += metrics.needed;
      onOrder += metrics.onOrder;
    });
    
    const total = available + onOrder - needed;
    
    return { onHand, reserved, available, needed, onOrder, total };
  }, [filteredItems, partMetrics]);

  const parentLocations = locations.filter(l => !l.parent_id && l.active);
  const parentCategories = categories.filter(c => !c.parent_id && c.active);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-gray-400" />
                <CardTitle className="text-white text-base">Inventory Position</CardTitle>
              </div>
              <Button
                onClick={() => setShowAddModal(true)}
                size="sm"
                className="bg-red-600 hover:bg-red-700 gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Inventory
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search parts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                />
              </div>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {parentLocations.map(parent => {
                    const children = locations.filter(l => l.parent_id === parent.id && l.active);
                    return (
                      <React.Fragment key={parent.id}>
                        <SelectItem value={parent.id}>
                          <span style={{ color: parent.color }}>{parent.location_area}</span>
                        </SelectItem>
                        {children.map(child => (
                          <SelectItem key={child.id} value={child.id}>
                            <span className="ml-4" style={{ color: child.color }}>→ {child.location_area}</span>
                          </SelectItem>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {parentCategories.map(parent => {
                    const children = categories.filter(c => c.parent_id === parent.id && c.active);
                    return (
                      <React.Fragment key={parent.id}>
                        <SelectItem value={parent.id}>
                          <span style={{ color: parent.color }}>{parent.name}</span>
                        </SelectItem>
                        {children.map(child => (
                          <SelectItem key={child.id} value={child.id}>
                            <span className="ml-4" style={{ color: child.color }}>→ {child.name}</span>
                          </SelectItem>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Summary Cards - Enhanced */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
              <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-800">
                <p className="text-xs text-gray-400">On Hand</p>
                <p className="text-lg font-bold text-white">{globalTotals.onHand}</p>
              </div>
              <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-800">
                <p className="text-xs text-gray-400">Reserved</p>
                <p className="text-lg font-bold text-yellow-400">{globalTotals.reserved}</p>
              </div>
              <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-800">
                <p className="text-xs text-gray-400">Available</p>
                <p className="text-lg font-bold text-blue-400">{globalTotals.available}</p>
              </div>
              <div className="p-2 bg-gray-900/50 rounded-lg border border-red-900/30">
                <p className="text-xs text-gray-400">Needed</p>
                <p className="text-lg font-bold text-red-400">{globalTotals.needed}</p>
              </div>
              <div className="p-2 bg-gray-900/50 rounded-lg border border-yellow-900/30">
                <p className="text-xs text-gray-400">On Order</p>
                <p className="text-lg font-bold text-orange-400">{globalTotals.onOrder}</p>
              </div>
              <div className={`p-2 rounded-lg border ${globalTotals.total >= 0 ? 'bg-green-900/20 border-green-900/30' : 'bg-red-900/20 border-red-900/30'}`}>
                <p className="text-xs text-gray-400">Net Position</p>
                <p className={`text-lg font-bold ${globalTotals.total > 0 ? 'text-green-400' : globalTotals.total < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                  {globalTotals.total > 0 ? '+' : ''}{globalTotals.total}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-8 text-center text-gray-500">Loading inventory...</CardContent>
          </Card>
        ) : filteredItems.length === 0 ? (
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-8 text-center">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-500">No inventory items found</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-xs">Part</TableHead>
                    <TableHead className="text-gray-400 text-xs">Location</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">On Hand</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">Reserved</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">Available</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-end">
                          Needed <HelpCircle className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Total demand from all projects</p>
                          <p className="text-xs text-gray-400">(qty_needed - qty_installed)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-end">
                          On Order <HelpCircle className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Incoming supply from orders</p>
                          <p className="text-xs text-gray-400">(qty_ordered - qty_received)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-end">
                          Total <HelpCircle className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Net position after all known activity</p>
                          <p className="text-xs text-gray-400">(available + on_order - needed)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">Unit Cost</TableHead>
                    <TableHead className="text-gray-400 text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map(item => {
                    const part = parts.find(p => p.id === item.part_id);
                    const available = (item.quantity_on_hand || 0) - (item.quantity_reserved || 0);
                    const metrics = partMetrics[item.part_id] || { needed: 0, onOrder: 0 };
                    const total = available + metrics.onOrder - metrics.needed;
                    
                    return (
                      <TableRow 
                        key={item.id}
                        className="border-b border-red-900/10 hover:bg-red-950/20 cursor-pointer"
                        onClick={() => part && onPartClick?.(part)}
                      >
                        <TableCell>
                          <div>
                            <p className="text-white text-sm font-medium">{getPartName(item.part_id)}</p>
                            {part?.vendor_part_number && (
                              <p className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3 h-3 text-gray-500" />
                            <span className="text-gray-300 text-sm">{getLocationName(item.location_id)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-white font-medium">{item.quantity_on_hand || 0}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-yellow-400">{item.quantity_reserved || 0}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={available > 0 ? 'text-blue-400 font-medium' : 'text-red-400 font-medium'}>
                            {available}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={metrics.needed > 0 ? 'text-red-400' : 'text-gray-500'}>
                            {metrics.needed}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={metrics.onOrder > 0 ? 'text-orange-400' : 'text-gray-500'}>
                            {metrics.onOrder}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-medium ${total > 0 ? 'text-green-400' : total < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                            {total > 0 ? '+' : ''}{total}
                          </span>
                          {total < 0 && <AlertTriangle className="w-3 h-3 inline ml-1 text-red-400" />}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-gray-300">
                            {item.purchase_cost ? `$${item.purchase_cost.toFixed(2)}` : '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-gray-400 hover:text-white"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); part && onPartClick?.(part); }}>
                                <Eye className="w-4 h-4 mr-2" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setAddInventoryPartId(item.part_id); }} className="text-green-400">
                                <Plus className="w-4 h-4 mr-2" /> Add Inventory
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); part && setOrderPart(part); }} className="text-blue-400">
                                <ShoppingCart className="w-4 h-4 mr-2" /> Order Part
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); part && setBuildPart(part); }} className="text-orange-400">
                                <Wrench className="w-4 h-4 mr-2" /> Add to Build
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {showAddModal && <AddInventoryModal onClose={() => setShowAddModal(false)} />}
        {addInventoryPartId && <AddInventoryModal onClose={() => setAddInventoryPartId(null)} preselectedPartId={addInventoryPartId} />}
        {orderPart && <OrderPartModal part={orderPart} onClose={() => setOrderPart(null)} onPartClick={(partId) => { const part = parts.find(p => p.id === partId); if (part) onPartClick?.(part); }} />}
        {buildPart && <AddToBuildModal part={buildPart} onClose={() => setBuildPart(null)} />}
      </div>
    </TooltipProvider>
  );
}