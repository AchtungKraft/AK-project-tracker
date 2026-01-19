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
  Eye, Wrench, HelpCircle, ChevronRight, ChevronDown, Truck, FileText
} from "lucide-react";
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
  const [expandedParts, setExpandedParts] = useState(new Set());
  const [showDemandDetail, setShowDemandDetail] = useState(null);

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

  // Aggregate inventory data by Part (global position)
  const partAggregates = useMemo(() => {
    const aggregates = {};

    // First, aggregate inventory items by part
    inventoryItems.forEach(item => {
      if (!aggregates[item.part_id]) {
        aggregates[item.part_id] = {
          partId: item.part_id,
          onHand: 0,
          reserved: 0,
          needed: 0,
          onOrder: 0,
          locations: [],
          requirementsByProject: [],
          orderLineItems: []
        };
      }
      aggregates[item.part_id].onHand += item.quantity_on_hand || 0;
      aggregates[item.part_id].reserved += item.quantity_reserved || 0;
      aggregates[item.part_id].locations.push({
        locationId: item.location_id,
        locationName: getLocationName(item.location_id),
        onHand: item.quantity_on_hand || 0,
        reserved: item.quantity_reserved || 0,
        available: (item.quantity_on_hand || 0) - (item.quantity_reserved || 0),
        purchaseCost: item.purchase_cost
      });
    });

    // Calculate demand from requirements: qty_needed - qty_installed - qty_allocated
    // Allocated inventory already represents committed supply and must reduce demand
    requirements.forEach(req => {
      const stillNeeded = Math.max(0, (req.qty_needed || 0) - (req.qty_installed || 0) - (req.qty_allocated || 0));
      if (stillNeeded > 0) {
        if (!aggregates[req.part_id]) {
          aggregates[req.part_id] = {
            partId: req.part_id,
            onHand: 0,
            reserved: 0,
            needed: 0,
            onOrder: 0,
            locations: [],
            requirementsByProject: [],
            orderLineItems: []
          };
        }
        aggregates[req.part_id].needed += stillNeeded;
      }
      // Always track project requirements for drill-down, even if fully covered
      if ((req.qty_needed || 0) > (req.qty_installed || 0)) {
        const project = projects.find(p => p.id === req.project_id);
        if (!aggregates[req.part_id]) {
          aggregates[req.part_id] = {
            partId: req.part_id,
            onHand: 0,
            reserved: 0,
            needed: 0,
            onOrder: 0,
            locations: [],
            requirementsByProject: [],
            orderLineItems: []
          };
        }
        aggregates[req.part_id].requirementsByProject.push({
          projectId: req.project_id,
          projectName: project?.name || 'Unknown Project',
          qtyNeeded: req.qty_needed || 0,
          qtyAllocated: req.qty_allocated || 0,
          qtyInstalled: req.qty_installed || 0,
          stillNeeded
        });
      }
    });

    // Calculate on-order from line items (qty_ordered - qty_received)
    lineItems.forEach(li => {
      const pending = Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0));
      if (pending > 0) {
        if (!aggregates[li.part_id]) {
          aggregates[li.part_id] = {
            partId: li.part_id,
            onHand: 0,
            reserved: 0,
            needed: 0,
            onOrder: 0,
            locations: [],
            requirementsByProject: [],
            orderLineItems: []
          };
        }
        aggregates[li.part_id].onOrder += pending;
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
  }, [inventoryItems, requirements, lineItems, projects, orders, locations]);

  // Filter and enrich part data
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

        // Filter by location (filter the locations array, but still show the part if any location matches)
        let filteredLocations = agg.locations;
        if (locationFilter !== 'all') {
          filteredLocations = agg.locations.filter(loc => loc.locationId === locationFilter);
        }

        if (!matchesSearch || !matchesCategory) return null;
        if (locationFilter !== 'all' && filteredLocations.length === 0) return null;

        // Calculate derived values
        const onHand = filteredLocations.reduce((sum, loc) => sum + loc.onHand, 0);
        const reserved = filteredLocations.reduce((sum, loc) => sum + loc.reserved, 0);
        const available = onHand - reserved;
        const netPosition = available + agg.onOrder - agg.needed;

        return {
          ...agg,
          part,
          onHand,
          reserved,
          available,
          netPosition,
          filteredLocations
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.part.part_name?.localeCompare(b.part.part_name || ''));
  }, [partAggregates, parts, searchTerm, categoryFilter, locationFilter]);

  // Calculate global totals from filtered parts
  const globalTotals = useMemo(() => {
    let onHand = 0, reserved = 0, needed = 0, onOrder = 0;

    filteredParts.forEach(item => {
      onHand += item.onHand;
      reserved += item.reserved;
      needed += item.needed;
      onOrder += item.onOrder;
    });

    const available = onHand - reserved;
    const netPosition = available + onOrder - needed;

    return { onHand, reserved, available, needed, onOrder, netPosition };
  }, [filteredParts]);

  const toggleExpanded = (partId) => {
    const newExpanded = new Set(expandedParts);
    if (newExpanded.has(partId)) {
      newExpanded.delete(partId);
    } else {
      newExpanded.add(partId);
    }
    setExpandedParts(newExpanded);
  };

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

            {/* Summary Cards - Global aggregation */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-800 cursor-help">
                    <p className="text-xs text-gray-400 flex items-center gap-1">On Hand <HelpCircle className="w-3 h-3" /></p>
                    <p className="text-lg font-bold text-white">{globalTotals.onHand}</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Total physical inventory across all locations</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-800 cursor-help">
                    <p className="text-xs text-gray-400 flex items-center gap-1">Reserved <HelpCircle className="w-3 h-3" /></p>
                    <p className="text-lg font-bold text-yellow-400">{globalTotals.reserved}</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Inventory allocated to projects (not yet installed)</TooltipContent>
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
                <TooltipContent>Total project demand (qty_needed − qty_installed)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2 bg-gray-900/50 rounded-lg border border-yellow-900/30 cursor-help">
                    <p className="text-xs text-gray-400 flex items-center gap-1">On Order <HelpCircle className="w-3 h-3" /></p>
                    <p className="text-lg font-bold text-orange-400">{globalTotals.onOrder}</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Open PO quantity (qty_ordered − qty_received)</TooltipContent>
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
                    <TableHead className="text-gray-400 text-xs">Part</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">On Hand</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-end w-full">
                          Reserved <HelpCircle className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent>Inventory allocated to projects (InventoryItem.quantity_reserved)</TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">Available</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-end w-full">
                          Needed <HelpCircle className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent>Project demand (qty_needed − qty_installed)</TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-end w-full">
                          On Order <HelpCircle className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent>Open PO lines (qty_ordered − qty_received)</TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-end w-full">
                          Net <HelpCircle className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent>Available + On Order − Needed</TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-gray-400 text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredParts.map(item => {
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

                        {/* Expanded Location Details */}
                        {isExpanded && hasLocations && (
                          <TableRow className="bg-gray-900/30">
                            <TableCell colSpan={9} className="p-0">
                              <div className="px-8 py-3 border-l-2 border-blue-500/50 ml-4">
                                <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" /> Locations
                                </p>
                                <div className="space-y-1">
                                  {item.filteredLocations.map((loc, idx) => (
                                    <div key={idx} className="flex items-center gap-4 text-sm">
                                      <span className="text-gray-300 min-w-[180px]">{loc.locationName}</span>
                                      <span className="text-white">On Hand: {loc.onHand}</span>
                                      <span className="text-yellow-400">Reserved: {loc.reserved}</span>
                                      <span className={loc.available > 0 ? 'text-blue-400' : 'text-gray-500'}>
                                        Available: {loc.available}
                                      </span>
                                      {loc.purchaseCost && (
                                        <span className="text-gray-400">@ ${loc.purchaseCost.toFixed(2)}</span>
                                      )}
                                    </div>
                                  ))}
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