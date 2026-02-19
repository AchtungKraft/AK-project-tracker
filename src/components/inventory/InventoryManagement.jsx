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
import { 
  Search, Plus, Package, MapPin, AlertTriangle, MoreVertical, ShoppingCart, 
  Eye, Wrench, HelpCircle, ChevronRight, ChevronDown, Truck, FileText,
  ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react";
import AddInventoryModal from "./AddInventoryModal";
import OrderPartModal from "../parts/OrderPartModal";
import AddToBuildModal from "../parts/AddToBuildModal";

/**
 * InventoryManagement - CANONICAL: Uses getPartsInventoryView read model
 * NO direct InventoryItem.quantity_on_hand/quantity_reserved reads
 * All inventory data from Part.physical_stock + commitment aggregations
 */
export default function InventoryManagement({ onPartClick }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addInventoryPartId, setAddInventoryPartId] = useState(null);
  const [orderPart, setOrderPart] = useState(null);
  const [buildPart, setBuildPart] = useState(null);
  const [expandedParts, setExpandedParts] = useState(new Set());
  const [showDemandDetail, setShowDemandDetail] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'part_name', direction: 'asc' });

  // CANONICAL: Use read model for inventory view
  const { data: partsInventoryView = [], isLoading } = useQuery({
    queryKey: ['partsInventoryView'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getPartsInventoryView', {});
      return res.data?.parts || [];
    },
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

  const { data: commitments = [] } = useQuery({
    queryKey: ['partCommitments'],
    queryFn: () => base44.entities.PartCommitment.list()
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list()
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list()
  });

  // Get location name with hierarchy
  const getLocationName = (locationId) => {
    if (!locationId) return 'Unassigned';
    const location = locations.find(l => l.id === locationId);
    if (!location) return 'Unknown';
    if (location.parent_id) {
      const parent = locations.find(l => l.id === location.parent_id);
      return parent ? `${parent.location_area} > ${location.location_area}` : location.location_area;
    }
    return location.location_area;
  };

  // Get all descendant category IDs
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

  // CANONICAL: Build inventory view from read model
  const inventoryViewMap = useMemo(() => {
    const map = new Map();
    partsInventoryView.forEach(p => map.set(p.part_id, p));
    return map;
  }, [partsInventoryView]);

  // Aggregate inventory data by Part (global position) - CANONICAL source
  const partAggregates = useMemo(() => {
    const aggregates = {};

    // Use canonical read model for inventory stats
    partsInventoryView.forEach(pv => {
      aggregates[pv.part_id] = {
        partId: pv.part_id,
        onHand: pv.physical_stock ?? 0,
        reserved: pv.reserved_total ?? 0,
        needed: pv.required_total ?? 0,
        onOrder: pv.on_order ?? 0,
        toOrder: pv.to_order ?? 0,
        locations: [], // Populated below from commitments for drill-down
        requirementsByProject: [],
        orderLineItems: []
      };
    });

    // Build project demand drill-down from commitments (CANONICAL)
    commitments.forEach(c => {
      if (c.commitment_status === 'cancelled' || c.commitment_status === 'closed') return;
      
      const required = c.required_total ?? 0;
      const installed = c.qty_installed ?? 0;
      const reserved = c.reserved_from_stock ?? 0;
      const onOrder = c.covered_from_po ?? 0;
      const stillNeeded = Math.max(0, required - reserved - onOrder);
      
      if (required > installed) {
        const project = projects.find(p => p.id === c.project_id);
        if (!aggregates[c.part_id]) {
          const part = parts.find(p => p.id === c.part_id);
          aggregates[c.part_id] = {
            partId: c.part_id,
            onHand: part?.physical_stock ?? 0,
            reserved: 0,
            needed: 0,
            onOrder: 0,
            toOrder: 0,
            locations: [],
            requirementsByProject: [],
            orderLineItems: []
          };
        }
        aggregates[c.part_id].requirementsByProject.push({
          projectId: c.project_id,
          projectName: project?.name || 'Unknown Project',
          qtyNeeded: required,
          qtyAllocated: reserved,
          qtyInstalled: installed,
          stillNeeded
        });
      }
    });

    // Build on-order drill-down from line items
    lineItems.forEach(li => {
      const pending = Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0));
      if (pending > 0 && aggregates[li.part_id]) {
        const order = orders.find(o => o.id === li.order_id);
        aggregates[li.part_id].orderLineItems.push({
          orderId: li.order_id,
          poNumber: order?.po_number || 'Unknown PO',
          qtyOrdered: li.qty_ordered || 0,
          qtyReceived: li.qty_received || 0,
          pending,
          etaDate: order?.eta_date
        });
      }
    });

    return aggregates;
  }, [partsInventoryView, commitments, lineItems, projects, orders, parts]);

  // Filter and enrich part data - CANONICAL: from read model
  const filteredParts = useMemo(() => {
    return Object.values(partAggregates)
      .map(agg => {
        const part = parts.find(p => p.id === agg.partId);
        if (!part) return null;

        // Filter by search
        const matchesSearch = !searchTerm || 
          part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());

        // Filter by category
        let matchesCategory = categoryFilter === 'all';
        if (!matchesCategory && part.part_category_id) {
          const relevantCategoryIds = getAllDescendantCategoryIds(categoryFilter);
          matchesCategory = relevantCategoryIds.includes(part.part_category_id);
        }

        if (!matchesSearch || !matchesCategory) return null;

        // CANONICAL: Use values from read model aggregate
        const onHand = agg.onHand;
        const reserved = agg.reserved;
        const available = Math.max(0, onHand - reserved);
        const netPosition = available + agg.onOrder - agg.needed;

        return {
          ...agg,
          part,
          onHand,
          reserved,
          available,
          netPosition,
          filteredLocations: agg.locations
        };
      })
      .filter(Boolean);
  }, [partAggregates, parts, searchTerm, categoryFilter]);

  // Sort filtered parts
  const sortedParts = useMemo(() => {
    const sorted = [...filteredParts];
    sorted.sort((a, b) => {
      let aVal, bVal;
      switch (sortConfig.key) {
        case 'part_name':
          aVal = a.part.part_name?.toLowerCase() || '';
          bVal = b.part.part_name?.toLowerCase() || '';
          break;
        case 'onHand':
          aVal = a.onHand;
          bVal = b.onHand;
          break;
        case 'reserved':
          aVal = a.reserved;
          bVal = b.reserved;
          break;
        case 'available':
          aVal = a.available;
          bVal = b.available;
          break;
        case 'needed':
          aVal = a.needed;
          bVal = b.needed;
          break;
        case 'onOrder':
          aVal = a.onOrder;
          bVal = b.onOrder;
          break;
        case 'netPosition':
          aVal = a.netPosition;
          bVal = b.netPosition;
          break;
        default:
          return 0;
      }
      
      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [filteredParts, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortableHeader = ({ columnKey, children, className = "" }) => {
    const isActive = sortConfig.key === columnKey;
    return (
      <TableHead 
        className={`text-gray-400 text-xs cursor-pointer hover:text-white transition-colors select-none ${className}`}
        onClick={() => handleSort(columnKey)}
      >
        <div className={`flex items-center gap-1 ${className.includes('text-right') ? 'justify-end' : ''}`}>
          {children}
          {isActive ? (
            sortConfig.direction === 'asc' ? 
              <ArrowUp className="w-3 h-3 text-red-400" /> : 
              <ArrowDown className="w-3 h-3 text-red-400" />
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-30" />
          )}
        </div>
      </TableHead>
    );
  };

  // Calculate global totals from filtered parts
  const globalTotals = useMemo(() => {
    let onHand = 0, reserved = 0, needed = 0, onOrder = 0;

    sortedParts.forEach(item => {
      onHand += item.onHand;
      reserved += item.reserved;
      needed += item.needed;
      onOrder += item.onOrder;
    });

    const available = onHand - reserved;
    const netPosition = available + onOrder - needed;

    return { onHand, reserved, available, needed, onOrder, netPosition };
  }, [sortedParts]);

  const toggleExpanded = (partId) => {
    const newExpanded = new Set(expandedParts);
    if (newExpanded.has(partId)) {
      newExpanded.delete(partId);
    } else {
      newExpanded.add(partId);
    }
    setExpandedParts(newExpanded);
  };

  const parentCategories = categories.filter(c => !c.parent_id && c.active);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-gray-400" />
                <CardTitle className="text-white text-base">Global Inventory Position</CardTitle>
                <Badge variant="outline" className="border-gray-600 text-gray-400">
                  {filteredParts.length} parts
                </Badge>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search parts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                />
              </div>
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

            {/* Summary Cards - Global aggregation */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-800 cursor-help">
                    <p className="text-xs text-gray-400 flex items-center gap-1">On Hand <HelpCircle className="w-3 h-3" /></p>
                    <p className="text-lg font-bold text-white">{globalTotals.onHand}</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Total physical inventory (sum of Part.physical_stock)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-800 cursor-help">
                    <p className="text-xs text-gray-400 flex items-center gap-1">Reserved <HelpCircle className="w-3 h-3" /></p>
                    <p className="text-lg font-bold text-yellow-400">{globalTotals.reserved}</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Inventory allocated to projects (sum of reserved_from_stock)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-800 cursor-help">
                    <p className="text-xs text-gray-400 flex items-center gap-1">Available <HelpCircle className="w-3 h-3" /></p>
                    <p className="text-lg font-bold text-blue-400">{globalTotals.available}</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>On Hand − Reserved = Available for new allocations</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2 bg-gray-900/50 rounded-lg border border-red-900/30 cursor-help">
                    <p className="text-xs text-gray-400 flex items-center gap-1">Needed <HelpCircle className="w-3 h-3" /></p>
                    <p className="text-lg font-bold text-red-400">{globalTotals.needed}</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Total project demand (sum of required_total from commitments)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2 bg-gray-900/50 rounded-lg border border-yellow-900/30 cursor-help">
                    <p className="text-xs text-gray-400 flex items-center gap-1">On Order <HelpCircle className="w-3 h-3" /></p>
                    <p className="text-lg font-bold text-orange-400">{globalTotals.onOrder}</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>On order quantity (sum of covered_from_po from commitments)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`p-2 rounded-lg border cursor-help ${globalTotals.netPosition >= 0 ? 'bg-green-900/20 border-green-900/30' : 'bg-red-900/20 border-red-900/30'}`}>
                    <p className="text-xs text-gray-400 flex items-center gap-1">Net Position <HelpCircle className="w-3 h-3" /></p>
                    <p className={`text-lg font-bold ${globalTotals.netPosition > 0 ? 'text-green-400' : globalTotals.netPosition < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {globalTotals.netPosition > 0 ? '+' : ''}{globalTotals.netPosition}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Available + On Order − Needed</TooltipContent>
              </Tooltip>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-8 text-center text-gray-500">Loading inventory...</CardContent>
          </Card>
        ) : filteredParts.length === 0 ? (
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
                    <TableHead className="text-gray-400 text-xs w-8"></TableHead>
                    <SortableHeader columnKey="part_name">Part</SortableHeader>
                    <SortableHeader columnKey="onHand" className="text-right">On Hand</SortableHeader>
                    <SortableHeader columnKey="reserved" className="text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                          Reserved <HelpCircle className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent>Inventory allocated to projects (sum of reserved_from_stock)</TooltipContent>
                      </Tooltip>
                    </SortableHeader>
                    <SortableHeader columnKey="available" className="text-right">Available</SortableHeader>
                    <SortableHeader columnKey="needed" className="text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                          Needed <HelpCircle className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent>Project demand (sum of required_total from commitments)</TooltipContent>
                      </Tooltip>
                    </SortableHeader>
                    <SortableHeader columnKey="onOrder" className="text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                          On Order <HelpCircle className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent>On order (sum of covered_from_po from commitments)</TooltipContent>
                      </Tooltip>
                    </SortableHeader>
                    <SortableHeader columnKey="netPosition" className="text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                          Net <HelpCircle className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent>Available + On Order − Needed</TooltipContent>
                      </Tooltip>
                    </SortableHeader>
                    <TableHead className="text-gray-400 text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedParts.map(item => {
                    const isExpanded = expandedParts.has(item.partId);
                    const hasLocations = item.filteredLocations.length > 0;
                    const hasDemand = item.requirementsByProject.length > 0;
                    const hasOrders = item.orderLineItems.length > 0;

                    return (
                      <React.Fragment key={item.partId}>
                        <TableRow className="border-b border-red-900/10 hover:bg-red-950/20">
                          <TableCell className="w-8 p-2">
                            {(hasLocations || hasDemand || hasOrders) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => toggleExpanded(item.partId)}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-400" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <div 
                              className="cursor-pointer"
                              onClick={() => item.part && onPartClick?.(item.part)}
                            >
                              <p className="text-white text-sm font-medium hover:text-red-400 transition-colors">
                                {item.part.part_name}
                              </p>
                              {item.part.vendor_part_number && (
                                <p className="text-xs text-gray-500 font-mono">{item.part.vendor_part_number}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-white font-medium">{item.onHand}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-yellow-400">{item.reserved}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={item.available > 0 ? 'text-blue-400 font-medium' : item.available < 0 ? 'text-red-400 font-medium' : 'text-gray-500'}>
                              {item.available}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span 
                              className={`${item.needed > 0 ? 'text-red-400 cursor-pointer hover:underline' : 'text-gray-500'}`}
                              onClick={() => item.needed > 0 && setShowDemandDetail(item)}
                            >
                              {item.needed}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={item.onOrder > 0 ? 'text-orange-400' : 'text-gray-500'}>
                              {item.onOrder}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium ${item.netPosition > 0 ? 'text-green-400' : item.netPosition < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                              {item.netPosition > 0 ? '+' : ''}{item.netPosition}
                            </span>
                            {item.netPosition < 0 && <AlertTriangle className="w-3 h-3 inline ml-1 text-red-400" />}
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
                                <DropdownMenuItem onClick={() => item.part && onPartClick?.(item.part)}>
                                  <Eye className="w-4 h-4 mr-2" /> View Part Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setAddInventoryPartId(item.partId)} className="text-green-400">
                                  <Plus className="w-4 h-4 mr-2" /> Add Inventory
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => item.part && setOrderPart(item.part)} className="text-blue-400">
                                  <ShoppingCart className="w-4 h-4 mr-2" /> Order Part
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => item.part && setBuildPart(item.part)} className="text-orange-400">
                                  <Wrench className="w-4 h-4 mr-2" /> Add to Build
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Inventory Details - CANONICAL: Shows Part.physical_stock */}
                        {isExpanded && item.onHand > 0 && (
                          <TableRow className="bg-gray-900/30">
                            <TableCell colSpan={9} className="p-0">
                              <div className="px-8 py-3 border-l-2 border-blue-500/50 ml-4">
                                <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" /> Inventory Summary (from Part.physical_stock)
                                </p>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-4 text-sm">
                                    <span className="text-white">Physical Stock: {item.onHand}</span>
                                    <span className="text-yellow-400">Reserved: {item.reserved}</span>
                                    <span className={item.available > 0 ? 'text-blue-400' : 'text-gray-500'}>
                                      Available: {item.available}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}

                        {/* Expanded Demand Details */}
                        {isExpanded && hasDemand && (
                          <TableRow className="bg-gray-900/30">
                            <TableCell colSpan={9} className="p-0">
                              <div className="px-8 py-3 border-l-2 border-red-500/50 ml-4">
                                <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                                  <FileText className="w-3 h-3" /> Project Demand
                                </p>
                                <div className="space-y-1">
                                  {item.requirementsByProject.map((req, idx) => (
                                    <div key={idx} className="flex items-center gap-4 text-sm">
                                      <span className="text-gray-300 min-w-[180px]">{req.projectName}</span>
                                      <span className="text-white">Needed: {req.qtyNeeded}</span>
                                      <span className="text-blue-400">Allocated: {req.qtyAllocated}</span>
                                      <span className="text-green-400">Installed: {req.qtyInstalled}</span>
                                      <span className="text-red-400">Still Need: {req.stillNeeded}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}

                        {/* Expanded On Order Details */}
                        {isExpanded && hasOrders && (
                          <TableRow className="bg-gray-900/30">
                            <TableCell colSpan={9} className="p-0">
                              <div className="px-8 py-3 border-l-2 border-orange-500/50 ml-4">
                                <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                                  <Truck className="w-3 h-3" /> On Order
                                </p>
                                <div className="space-y-1">
                                  {item.orderLineItems.map((li, idx) => (
                                    <div key={idx} className="flex items-center gap-4 text-sm">
                                      <span className="text-gray-300 min-w-[180px]">PO: {li.poNumber}</span>
                                      <span className="text-white">Ordered: {li.qtyOrdered}</span>
                                      <span className="text-green-400">Received: {li.qtyReceived}</span>
                                      <span className="text-orange-400">Pending: {li.pending}</span>
                                      {li.etaDate && (
                                        <span className="text-gray-400">ETA: {li.etaDate}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
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