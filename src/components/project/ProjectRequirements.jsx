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
import { invalidateSupplyQueries } from "@/components/supply/supplyInvalidation";

/**
 * CANONICAL SUPPLY FLOW - ProjectRequirements
 * 
 * Now reads from PartCommitment (canonical source).
 * PartProjectRequirement is deprecated and fully removed.
 */

const STATUS_CONFIG = {
  'planned': { color: '#EF4444', icon: AlertTriangle, label: 'Planned' },
  'ordered': { color: '#8B5CF6', icon: ShoppingCart, label: 'Ordered' },
  'partially_received': { color: '#F59E0B', icon: Truck, label: 'Partially Received' },
  'received': { color: '#10B981', icon: Package, label: 'Received' },
  'allocated': { color: '#3B82F6', icon: Package, label: 'Allocated' },
  'installed': { color: '#059669', icon: CheckCircle2, label: 'Installed' },
  'cancelled': { color: '#6B7280', icon: AlertTriangle, label: 'Cancelled' },
};

export default function ProjectRequirements({ projectId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [allocatingRequirement, setAllocatingRequirement] = useState(null);

  // CANONICAL: Read from PartCommitment only
  const { data: commitments = [], isLoading } = useQuery({
    queryKey: ['partCommitments', projectId],
    queryFn: () => base44.entities.PartCommitment.filter({ project_id: projectId }),
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

  // CANONICAL: Updates go through executeSupplyAction
  const cancelMutation = useMutation({
    mutationFn: async (commitment) => {
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'CANCEL_COMMITMENT',
        commitment_ids: [commitment.id],
        payload: { reason: 'Removed from project requirements' },
        dry_run: false
      });
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      return response.data;
    },
    onSuccess: () => {
      invalidateSupplyQueries(queryClient, { project_ids: [projectId], invalidateAll: true });
      toast.success('Commitment cancelled');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to cancel commitment');
    }
  });

  const getPartInfo = (partId) => {
    return parts.find(p => p.id === partId) || {};
  };

  const getCategoryName = (categoryId) => {
    const cat = categories.find(c => c.id === categoryId);
    return cat?.name || '';
  };

  // Filter to active (non-cancelled) commitments
  const activeCommitments = commitments.filter(c => c.commitment_status !== 'cancelled');

  const filteredCommitments = activeCommitments.filter(c => {
    const part = getPartInfo(c.part_id);
    const matchesSearch = part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.commitment_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // CANONICAL: Calculate totals from PartCommitment fields
  const totals = {
    needed: activeCommitments.reduce((sum, c) => sum + (c.required_total || c.qty_committed || 0), 0),
    allocated: activeCommitments.reduce((sum, c) => sum + (c.reserved_from_stock || c.qty_allocated || 0), 0),
    installed: activeCommitments.reduce((sum, c) => sum + (c.qty_installed || 0), 0),
    toOrder: activeCommitments.reduce((sum, c) => {
      const required = c.required_total || c.qty_committed || 0;
      const reserved = c.reserved_from_stock || c.qty_allocated || 0;
      const covered = c.covered_from_po || c.qty_ordered || 0;
      return sum + Math.max(0, required - reserved - covered);
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
          <CardContent className="p-8 text-center text-gray-500">Loading commitments...</CardContent>
        </Card>
      ) : filteredCommitments.length === 0 ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-500 mb-3">No part commitments yet</p>
            <Button onClick={() => setShowAddModal(true)} className="bg-red-600 hover:bg-red-700 gap-2">
              <Plus className="w-4 h-4" /> Add First Part
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
                  <TableHead className="text-gray-400 text-xs text-center">Required</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Reserved</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">On Order</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Installed</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Gap</TableHead>
                  <TableHead className="text-gray-400 text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCommitments.map(commitment => {
                  const part = getPartInfo(commitment.part_id);
                  const statusConfig = STATUS_CONFIG[commitment.commitment_status] || STATUS_CONFIG['planned'];
                  const StatusIcon = statusConfig.icon;
                  
                  // CANONICAL field names
                  const required = commitment.required_total || commitment.qty_committed || 0;
                  const reserved = commitment.reserved_from_stock || commitment.qty_allocated || 0;
                  const onOrder = commitment.covered_from_po || commitment.qty_ordered || 0;
                  const installed = commitment.qty_installed || 0;
                  const gap = Math.max(0, required - reserved - onOrder);

                  return (
                    <TableRow key={commitment.id} className="border-b border-red-900/10 hover:bg-red-950/20">
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
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-white font-medium">{required}</TableCell>
                      <TableCell className="text-center text-cyan-400">{reserved}</TableCell>
                      <TableCell className="text-center text-purple-400">{onOrder}</TableCell>
                      <TableCell className="text-center text-green-400">{installed}</TableCell>
                      <TableCell className="text-center">
                        {gap > 0 ? (
                          <span className="text-red-400 font-medium">{gap}</span>
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
                            <DropdownMenuItem onClick={() => setAllocatingRequirement(commitment)}>
                              Allocate from Inventory
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                const allocatedUninstalled = reserved - installed;
                                const message = allocatedUninstalled > 0 
                                  ? `Cancel this commitment? ${allocatedUninstalled} reserved unit(s) will be released back to inventory.`
                                  : 'Cancel this commitment?';
                                if (confirm(message)) {
                                  cancelMutation.mutate(commitment);
                                }
                              }}
                              className="text-red-400"
                            >
                              Cancel
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