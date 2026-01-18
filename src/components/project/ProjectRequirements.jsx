import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Search, Plus, Package, CheckCircle2, ShoppingCart, Truck, 
  Wrench, AlertTriangle, MoreHorizontal 
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

const STATUS_CONFIG = {
  'Needed': { color: '#EF4444', icon: AlertTriangle },
  'Partially Allocated': { color: '#F59E0B', icon: Package },
  'Allocated': { color: '#3B82F6', icon: Package },
  'Ordered': { color: '#8B5CF6', icon: ShoppingCart },
  'Partially Received': { color: '#F59E0B', icon: Truck },
  'Ready': { color: '#10B981', icon: CheckCircle2 },
  'Partially Installed': { color: '#F59E0B', icon: Wrench },
  'Installed': { color: '#059669', icon: CheckCircle2 },
};

export default function ProjectRequirements({ projectId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [allocatingRequirement, setAllocatingRequirement] = useState(null);

  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ['partProjectRequirements', projectId],
    queryFn: () => base44.entities.PartProjectRequirement.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list()
  });

  const { data: installedParts = [] } = useQuery({
    queryKey: ['installedParts', projectId],
    queryFn: () => base44.entities.InstalledPart.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PartProjectRequirement.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements', projectId] });
      toast.success('Requirement updated');
    }
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
    }
  });

  const getPartInfo = (partId) => {
    return parts.find(p => p.id === partId) || {};
  };

  const getCategoryName = (categoryId) => {
    const cat = categories.find(c => c.id === categoryId);
    return cat?.name || '';
  };

  const filteredRequirements = requirements.filter(req => {
    const part = getPartInfo(req.part_id);
    const matchesSearch = part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate totals
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

  return (
    <div className="space-y-4">
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-400" />
              <CardTitle className="text-white text-base">Project Parts Requirements</CardTitle>
            </div>
            <Button
              onClick={() => setShowAddModal(true)}
              size="sm"
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Requirement
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {/* Summary Cards */}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="relative">
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
                {Object.keys(STATUS_CONFIG).map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 text-center text-gray-500">Loading requirements...</CardContent>
        </Card>
      ) : filteredRequirements.length === 0 ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-500 mb-3">No part requirements yet</p>
            <Button onClick={() => setShowAddModal(true)} className="bg-red-600 hover:bg-red-700 gap-2">
              <Plus className="w-4 h-4" /> Add First Requirement
            </Button>
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
                  <TableHead className="text-gray-400 text-xs text-center">Ordered</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Installed</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">To Order</TableHead>
                  <TableHead className="text-gray-400 text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequirements.map(req => {
                  const part = getPartInfo(req.part_id);
                  const statusConfig = STATUS_CONFIG[req.status] || STATUS_CONFIG['Needed'];
                  const StatusIcon = statusConfig.icon;
                  const toOrder = Math.max(0, (req.qty_needed || 0) - (req.qty_allocated || 0) - (req.qty_ordered || 0));

                  return (
                    <TableRow key={req.id} className="border-b border-red-900/10 hover:bg-red-950/20">
                      <TableCell>
                        <div>
                          <p className="text-white text-sm font-medium">{part.part_name}</p>
                          {part.vendor_part_number && (
                            <p className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</p>
                          )}
                          {part.part_category_id && (
                            <p className="text-xs text-gray-500">{getCategoryName(part.part_category_id)}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: statusConfig.color }} className="text-white text-xs gap-1">
                          <StatusIcon className="w-3 h-3" />
                          {req.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-white font-medium">{req.qty_needed || 0}</TableCell>
                      <TableCell className="text-center text-blue-400">{req.qty_allocated || 0}</TableCell>
                      <TableCell className="text-center text-purple-400">{req.qty_ordered || 0}</TableCell>
                      <TableCell className="text-center text-green-400">{req.qty_installed || 0}</TableCell>
                      <TableCell className="text-center">
                        {toOrder > 0 ? (
                          <span className="text-red-400 font-medium">{toOrder}</span>
                        ) : (
                          <span className="text-gray-500">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setAllocatingRequirement(req)}>
                              Allocate from Inventory
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                const allocatedUninstalled = (req.qty_allocated || 0) - (req.qty_installed || 0);
                                const message = allocatedUninstalled > 0 
                                  ? `Remove this requirement? ${allocatedUninstalled} allocated unit(s) will be released back to inventory.`
                                  : 'Remove this requirement?';
                                if (confirm(message)) {
                                  deleteMutation.mutate(req);
                                }
                              }}
                              className="text-red-400"
                            >
                              Remove
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

      {showAddModal && (
        <AddRequirementModal projectId={projectId} onClose={() => setShowAddModal(false)} />
      )}

      {allocatingRequirement && (
        <AllocatePartModal 
          requirement={allocatingRequirement} 
          onClose={() => setAllocatingRequirement(null)} 
        />
      )}
    </div>
  );
}