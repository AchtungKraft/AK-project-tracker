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
  Search, Plus, Package, Trash2, 
  CheckCircle2, ShoppingCart, Truck, Wrench, AlertTriangle, MoreHorizontal, Download, ExternalLink
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import AddRequirementModal from "./AddRequirementModal";
import AllocatePartModal from "./AllocatePartModal";
import InstallPartModal from "./InstallPartModal";
import OrderPartModal from "../parts/OrderPartModal";
import EditPartDrawer from "../parts/EditPartDrawer";
import ImageModal from "../ui/ImageModal";
import MoveRequirementModal from "../parts/MoveRequirementModal";

/**
 * Derives status badge from quantities (canonical logic)
 */
const deriveStatus = (req, onOrder) => {
  const { qty_needed = 0, qty_allocated = 0, qty_installed = 0 } = req;
  const toOrder = Math.max(0, qty_needed - qty_allocated - (req.qty_ordered || 0));
  
  if (qty_installed >= qty_needed && qty_needed > 0) {
    return { key: 'Installed', color: '#059669', icon: CheckCircle2, label: 'Installed' };
  }
  if (qty_installed > 0 && qty_installed < qty_needed) {
    return { key: 'Partially Installed', color: '#F59E0B', icon: Wrench, label: 'Partial Install' };
  }
  if (onOrder > 0 && qty_allocated > qty_installed) {
    return { key: 'Allocated + On Order', color: '#8B5CF6', icon: Truck, label: 'Alloc + Order' };
  }
  if (onOrder > 0) {
    return { key: 'On Order', color: '#8B5CF6', icon: Truck, label: 'On Order' };
  }
  if (qty_allocated >= qty_needed && qty_needed > 0) {
    return { key: 'Allocated', color: '#3B82F6', icon: Package, label: 'Allocated' };
  }
  if (qty_allocated > 0) {
    return { key: 'Partially Allocated', color: '#F59E0B', icon: Package, label: 'Partial Alloc' };
  }
  if (toOrder > 0) {
    return { key: 'Need To Order', color: '#EF4444', icon: ShoppingCart, label: 'Need To Order' };
  }
  return { key: 'Needed', color: '#EF4444', icon: AlertTriangle, label: 'Needed' };
};

export default function ProjectParts({ projectId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [allocatingRequirement, setAllocatingRequirement] = useState(null);
  const [installingRequirement, setInstallingRequirement] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [orderPart, setOrderPart] = useState(null);
  const [moveRequirement, setMoveRequirement] = useState(null);

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

  const { data: installedParts = [] } = useQuery({
    queryKey: ['installedParts', projectId],
    queryFn: () => base44.entities.InstalledPart.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list(),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list(),
  });

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Project.list();
      return projects.find(p => p.id === projectId);
    },
    enabled: !!projectId,
  });

  // Calculate on-order quantity for each part (from open PO line items)
  const partOnOrder = useMemo(() => {
    const map = {};
    lineItems.forEach(li => {
      const pending = Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0));
      if (pending > 0) {
        if (!map[li.part_id]) map[li.part_id] = 0;
        map[li.part_id] += pending;
      }
    });
    return map;
  }, [lineItems]);

  const deleteMutation = useMutation({
    mutationFn: async (requirement) => {
      const allocatedQty = (requirement.qty_allocated || 0) - (requirement.qty_installed || 0);
      
      if (allocatedQty > 0) {
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
      
      await base44.entities.PartProjectRequirement.delete(requirement.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements', projectId] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      toast.success('Requirement removed');
    },
  });

  const getPartInfo = (partId) => parts.find(p => p.id === partId) || {};

  const getInventoryAvailable = (partId) => {
    const items = inventoryItems.filter(i => i.part_id === partId);
    return items.reduce((sum, i) => sum + ((i.quantity_on_hand || 0) - (i.quantity_reserved || 0)), 0);
  };

  // Calculate project totals using canonical definitions
  const totals = useMemo(() => {
    let needed = 0, allocated = 0, installed = 0, toOrder = 0, onOrder = 0;
    
    requirements.forEach(r => {
      needed += r.qty_needed || 0;
      allocated += r.qty_allocated || 0;
      installed += r.qty_installed || 0;
      toOrder += Math.max(0, (r.qty_needed || 0) - (r.qty_allocated || 0) - (r.qty_ordered || 0));
      onOrder += partOnOrder[r.part_id] || 0; // Sum open PO lines for this part
    });
    
    return { needed, allocated, installed, toOrder, onOrder };
  }, [requirements, partOnOrder]);

  const projectCost = installedParts.reduce((sum, ip) => sum + (ip.extended_cost || 0), 0);

  // Enrich requirements with computed fields
  const enrichedRequirements = useMemo(() => {
    return requirements.map(req => {
      const onOrder = partOnOrder[req.part_id] || 0;
      const toOrder = Math.max(0, (req.qty_needed || 0) - (req.qty_allocated || 0) - (req.qty_ordered || 0));
      const available = getInventoryAvailable(req.part_id);
      const status = deriveStatus(req, onOrder);
      
      return {
        ...req,
        _onOrder: onOrder,
        _toOrder: toOrder,
        _available: available,
        _status: status,
      };
    });
  }, [requirements, partOnOrder, inventoryItems]);

  const filteredRequirements = enrichedRequirements.filter(req => {
    const part = getPartInfo(req.part_id);
    const matchesSearch = part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || req._status.key === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleRemove = (requirement) => {
    if ((requirement.qty_installed || 0) > 0) {
      toast.error('Cannot remove: parts have been installed');
      return;
    }
    const allocatedUninstalled = (requirement.qty_allocated || 0) - (requirement.qty_installed || 0);
    const message = allocatedUninstalled > 0 
      ? `Remove this requirement? ${allocatedUninstalled} allocated unit(s) will be released back to inventory.`
      : 'Remove this part requirement?';
    
    if (confirm(message)) {
      deleteMutation.mutate(requirement);
    }
  };

  const statusOptions = [
    { key: 'Installed', label: 'Installed' },
    { key: 'Partially Installed', label: 'Partial Install' },
    { key: 'Allocated', label: 'Allocated' },
    { key: 'Partially Allocated', label: 'Partial Alloc' },
    { key: 'On Order', label: 'On Order' },
    { key: 'Allocated + On Order', label: 'Alloc + Order' },
    { key: 'Need To Order', label: 'Need To Order' },
    { key: 'Needed', label: 'Needed' },
  ];

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-400" />
              <CardTitle className="text-white text-base">Project Parts</CardTitle>
              <Badge variant="outline" className="border-gray-600 text-gray-400">
                {requirements.length} items
              </Badge>
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
          {/* Summary Stats - Canonical definitions */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
            <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-800">
              <p className="text-xs text-gray-400">Needed</p>
              <p className="text-lg font-bold text-white">{totals.needed}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-blue-900/30">
              <p className="text-xs text-gray-400">Allocated</p>
              <p className="text-lg font-bold text-blue-400">{totals.allocated}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-green-900/30">
              <p className="text-xs text-gray-400">Installed</p>
              <p className="text-lg font-bold text-green-400">{totals.installed}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-yellow-900/30">
              <p className="text-xs text-gray-400">On Order</p>
              <p className="text-lg font-bold text-orange-400">{totals.onOrder}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-red-900/30">
              <p className="text-xs text-gray-400">To Order</p>
              <p className="text-lg font-bold text-red-400">{totals.toOrder}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-yellow-900/30">
              <p className="text-xs text-gray-400">Parts Cost</p>
              <p className="text-lg font-bold text-yellow-400">${projectCost.toFixed(2)}</p>
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
                {statusOptions.map(opt => (
                  <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
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
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                  <TableHead className="text-gray-400 text-xs">Part</TableHead>
                  <TableHead className="text-gray-400 text-xs">Status</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Needed</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Allocated</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Installed</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">On Order</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Available</TableHead>
                  <TableHead className="text-gray-400 text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequirements.map(req => {
                  const part = getPartInfo(req.part_id);
                  const status = req._status;
                  const StatusIcon = status.icon;
                  const canAllocate = req._available > 0 && (req.qty_allocated || 0) < (req.qty_needed || 0);
                  const canInstall = (req.qty_allocated || 0) > (req.qty_installed || 0);
                  const hasInstalledParts = (req.qty_installed || 0) > 0;

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
                            <p className="text-white text-sm font-medium hover:text-red-400 transition-colors">{part.part_name}</p>
                            {part.vendor_part_number && (
                              <p className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: status.color }} className="text-white text-xs gap-1">
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-white font-medium">{req.qty_needed || 0}</TableCell>
                      <TableCell className="text-center text-blue-400">{req.qty_allocated || 0}</TableCell>
                      <TableCell className="text-center text-green-400">{req.qty_installed || 0}</TableCell>
                      <TableCell className="text-center">
                        <span className={req._onOrder > 0 ? 'text-orange-400' : 'text-gray-500'}>{req._onOrder}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={req._available > 0 ? 'text-green-400' : 'text-gray-500'}>{req._available}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {/* Quick Install button when installable */}
                          {canInstall && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 border-green-700 text-green-400 hover:bg-green-900/30"
                              onClick={() => setInstallingRequirement(req)}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Install
                            </Button>
                          )}
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
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
                              {req._toOrder > 0 && (
                                <DropdownMenuItem onClick={() => setOrderPart(part)}>
                                  <ShoppingCart className="w-4 h-4 mr-2" /> Order Part ({req._toOrder})
                                </DropdownMenuItem>
                              )}
                              {req._onOrder > 0 && (
                                <DropdownMenuItem onClick={() => {/* Could link to On Order view */}}>
                                  <Truck className="w-4 h-4 mr-2" /> View On Order ({req._onOrder})
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => setSelectedPart(part.id)}>
                                <ExternalLink className="w-4 h-4 mr-2" /> View Part Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-gray-700" />
                              {!hasInstalledParts && (
                                <DropdownMenuItem onClick={() => setMoveRequirement(req)}>
                                  Move to Project
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem 
                                onClick={() => handleRemove(req)}
                                className="text-red-400"
                                disabled={hasInstalledParts}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
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

      {moveRequirement && (
        <MoveRequirementModal
          requirement={moveRequirement}
          part={getPartInfo(moveRequirement.part_id)}
          currentProject={project}
          onClose={() => setMoveRequirement(null)}
        />
      )}
    </div>
  );
}