import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Search, Filter, Plus, Package, Trash2, LayoutGrid, List, 
  CheckCircle2, ShoppingCart, Truck, Wrench, AlertTriangle, MoreHorizontal 
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import AddRequirementModal from "./AddRequirementModal";
import AllocatePartModal from "./AllocatePartModal";
import InstallPartModal from "./InstallPartModal";
import OrderPartModal from "../parts/OrderPartModal";
import EditPartDrawer from "../parts/EditPartDrawer";
import ImageModal from "../ui/ImageModal";

const STATUS_CONFIG = {
  'Needed': { color: '#EF4444', icon: AlertTriangle, label: 'Needed' },
  'Partially Allocated': { color: '#F59E0B', icon: Package, label: 'Partial Alloc' },
  'Allocated': { color: '#3B82F6', icon: Package, label: 'Allocated' },
  'Ordered': { color: '#8B5CF6', icon: ShoppingCart, label: 'Ordered' },
  'Partially Received': { color: '#F59E0B', icon: Truck, label: 'Partial Recv' },
  'Ready': { color: '#10B981', icon: CheckCircle2, label: 'Ready' },
  'Partially Installed': { color: '#F59E0B', icon: Wrench, label: 'Partial Install' },
  'Installed': { color: '#059669', icon: CheckCircle2, label: 'Installed' },
};

const getCategoryPath = (categoryId, categories) => {
  if (!categoryId) return null;
  const category = categories.find(c => c.id === categoryId);
  if (!category) return null;
  
  if (category.parent_id) {
    const parent = categories.find(c => c.id === category.parent_id);
    if (parent) return `${parent.name} > ${category.name}`;
  }
  return category.name;
};

export default function ProjectParts({ projectId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('card');
  const [showAddModal, setShowAddModal] = useState(false);
  const [allocatingRequirement, setAllocatingRequirement] = useState(null);
  const [installingRequirement, setInstallingRequirement] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [orderPart, setOrderPart] = useState(null);

  // Fetch requirements using new entity
  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ['partProjectRequirements', projectId],
    queryFn: () => base44.entities.PartProjectRequirement.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: installedParts = [] } = useQuery({
    queryKey: ['installedParts', projectId],
    queryFn: () => base44.entities.InstalledPart.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (requirement) => {
      // Release any reserved inventory before deleting
      const allocatedQty = (requirement.qty_allocated || 0) - (requirement.qty_installed || 0);
      
      if (allocatedQty > 0) {
        // Find inventory items for this part and release reserved quantities
        const partInventory = inventoryItems.filter(i => i.part_id === requirement.part_id);
        let remainingToRelease = allocatedQty;
        
        for (const item of partInventory) {
          if (remainingToRelease <= 0) break;
          
          const reservedHere = Math.min(item.quantity_reserved || 0, remainingToRelease);
          if (reservedHere > 0) {
            await base44.entities.InventoryItem.update(item.id, {
              quantity_reserved: Math.max(0, (item.quantity_reserved || 0) - reservedHere)
            });
            remainingToRelease -= reservedHere;
          }
        }
      }
      
      // Now delete the requirement
      await base44.entities.PartProjectRequirement.delete(requirement.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements', projectId] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      toast.success('Requirement removed and reserved inventory released');
    },
  });

  const getPartInfo = (partId) => parts.find(p => p.id === partId) || {};

  // Calculate inventory availability for a part
  const getInventoryAvailable = (partId) => {
    const items = inventoryItems.filter(i => i.part_id === partId);
    return items.reduce((sum, i) => sum + ((i.quantity_on_hand || 0) - (i.quantity_reserved || 0)), 0);
  };

  // Calculate project totals
  const totals = {
    needed: requirements.reduce((sum, r) => sum + (r.qty_needed || 0), 0),
    allocated: requirements.reduce((sum, r) => sum + (r.qty_allocated || 0), 0),
    installed: requirements.reduce((sum, r) => sum + (r.qty_installed || 0), 0),
    toOrder: requirements.reduce((sum, r) => {
      const needed = r.qty_needed || 0;
      const allocated = r.qty_allocated || 0;
      const ordered = r.qty_ordered || 0;
      return sum + Math.max(0, needed - allocated - ordered);
    }, 0)
  };

  // Calculate project cost from installed parts
  const projectCost = installedParts.reduce((sum, ip) => sum + (ip.extended_cost || 0), 0);

  const filteredRequirements = requirements.filter(req => {
    const part = getPartInfo(req.part_id);
    const matchesSearch = part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Group requirements by status category for better organization
  const groupedRequirements = useMemo(() => {
    const groups = {
      needed: [],      // Status: Needed, Partially Allocated
      allocated: [],   // Status: Allocated, Ordered, Partially Received, Ready
      installed: [],   // Status: Partially Installed, Installed
      toOrder: [],     // Derived: qty_needed - qty_allocated - qty_ordered > 0
    };

    filteredRequirements.forEach(req => {
      const toOrder = Math.max(0, (req.qty_needed || 0) - (req.qty_allocated || 0) - (req.qty_ordered || 0));
      
      // Add to "to order" if it needs ordering
      if (toOrder > 0) {
        groups.toOrder.push({ ...req, _toOrderQty: toOrder });
      }

      // Categorize by status
      if (req.status === 'Installed' || req.status === 'Partially Installed') {
        groups.installed.push(req);
      } else if (['Allocated', 'Ordered', 'Partially Received', 'Ready'].includes(req.status)) {
        groups.allocated.push(req);
      } else {
        groups.needed.push(req);
      }
    });

    return groups;
  }, [filteredRequirements]);

  const handleRemove = (requirement) => {
    const allocatedUninstalled = (requirement.qty_allocated || 0) - (requirement.qty_installed || 0);
    const message = allocatedUninstalled > 0 
      ? `Remove this requirement? ${allocatedUninstalled} allocated unit(s) will be released back to inventory.`
      : 'Remove this part requirement?';
    
    if (confirm(message)) {
      deleteMutation.mutate(requirement);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-400" />
              <CardTitle className="text-white text-base">Project Parts</CardTitle>
            </div>
            <Button
              onClick={() => setShowAddModal(true)}
              size="sm"
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Part
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-800">
              <p className="text-xs text-gray-400">Total Needed</p>
              <p className="text-xl font-bold text-white">{totals.needed}</p>
            </div>
            <div className="p-3 bg-gray-900/50 rounded-lg border border-blue-900/30">
              <p className="text-xs text-gray-400">Allocated</p>
              <p className="text-xl font-bold text-blue-400">{totals.allocated}</p>
            </div>
            <div className="p-3 bg-gray-900/50 rounded-lg border border-red-900/30">
              <p className="text-xs text-gray-400">To Order</p>
              <p className="text-xl font-bold text-red-400">{totals.toOrder}</p>
            </div>
            <div className="p-3 bg-gray-900/50 rounded-lg border border-green-900/30">
              <p className="text-xs text-gray-400">Installed</p>
              <p className="text-xl font-bold text-green-400">{totals.installed}</p>
            </div>
            <div className="p-3 bg-gray-900/50 rounded-lg border border-yellow-900/30">
              <p className="text-xs text-gray-400">Parts Cost</p>
              <p className="text-xl font-bold text-yellow-400">${projectCost.toFixed(2)}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search parts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-900/50 border-gray-700 text-white"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Parts List */}
      {isLoading ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 text-center text-gray-500">Loading parts...</CardContent>
        </Card>
      ) : filteredRequirements.length === 0 ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-500 mb-3">
              {requirements.length === 0 ? 'No parts required yet' : 'No parts match your filters'}
            </p>
            {requirements.length === 0 && (
              <Button onClick={() => setShowAddModal(true)} className="bg-red-600 hover:bg-red-700 gap-2">
                <Plus className="w-4 h-4" /> Add First Part
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                  <TableHead className="text-gray-400 text-xs">Part</TableHead>
                  <TableHead className="text-gray-400 text-xs">Status</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Needed</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Allocated</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Installed</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Available</TableHead>
                  <TableHead className="text-gray-400 text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequirements.map(req => {
                  const part = getPartInfo(req.part_id);
                  const statusConfig = STATUS_CONFIG[req.status] || STATUS_CONFIG['Needed'];
                  const StatusIcon = statusConfig.icon;
                  const available = getInventoryAvailable(req.part_id);
                  const toOrder = Math.max(0, (req.qty_needed || 0) - (req.qty_allocated || 0) - (req.qty_ordered || 0));
                  const canAllocate = available > 0 && (req.qty_allocated || 0) < (req.qty_needed || 0);
                  const canInstall = (req.qty_allocated || 0) > (req.qty_installed || 0);

                  return (
                    <TableRow key={req.id} className="border-b border-red-900/10 hover:bg-red-950/20">
                      <TableCell>
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedPart(part.id)}>
                          {part.featured_photo && (
                            <div 
                              className="w-10 h-10 bg-gray-800 rounded flex items-center justify-center overflow-hidden"
                              onClick={(e) => { e.stopPropagation(); setSelectedImage(part.featured_photo); }}
                            >
                              <img src={part.featured_photo} alt="" className="w-full h-full object-contain" />
                            </div>
                          )}
                          <div>
                            <p className="text-white text-sm font-medium">{part.part_name}</p>
                            {part.vendor_part_number && (
                              <p className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: statusConfig.color }} className="text-white text-xs gap-1">
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-white font-medium">{req.qty_needed || 0}</TableCell>
                      <TableCell className="text-center text-blue-400">{req.qty_allocated || 0}</TableCell>
                      <TableCell className="text-center text-green-400">{req.qty_installed || 0}</TableCell>
                      <TableCell className="text-center">
                        <span className={available > 0 ? 'text-green-400' : 'text-gray-500'}>{available}</span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canAllocate && (
                              <DropdownMenuItem onClick={() => setAllocatingRequirement(req)}>
                                <Package className="w-4 h-4 mr-2" /> Allocate from Inventory
                              </DropdownMenuItem>
                            )}
                            {canInstall && (
                              <DropdownMenuItem onClick={() => setInstallingRequirement(req)}>
                                <Wrench className="w-4 h-4 mr-2" /> Mark as Installed
                              </DropdownMenuItem>
                            )}
                            {toOrder > 0 && (
                              <DropdownMenuItem onClick={() => setOrderPart(part)}>
                                <ShoppingCart className="w-4 h-4 mr-2" /> Order Part
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setSelectedPart(part.id)}>
                              View Part Details
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleRemove(req)}
                              className="text-red-400"
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Remove
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

      {/* Modals */}
      {showAddModal && (
        <AddRequirementModal projectId={projectId} onClose={() => setShowAddModal(false)} />
      )}

      {allocatingRequirement && (
        <AllocatePartModal 
          requirement={allocatingRequirement} 
          onClose={() => setAllocatingRequirement(null)} 
        />
      )}

      {installingRequirement && (
        <InstallPartModal
          requirement={installingRequirement}
          onClose={() => setInstallingRequirement(null)}
        />
      )}

      {selectedPart && (
        <EditPartDrawer partId={selectedPart} onClose={() => setSelectedPart(null)} />
      )}

      {selectedImage && (
        <ImageModal isOpen={!!selectedImage} imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
      )}

      {orderPart && (
        <OrderPartModal 
          part={orderPart}
          onClose={() => setOrderPart(null)}
          onPartClick={(partId) => setSelectedPart(partId)}
        />
      )}
    </div>
  );
}