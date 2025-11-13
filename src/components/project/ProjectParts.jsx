import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Plus, Search, Filter, ShoppingCart, Truck, CheckCircle, X, Eye } from "lucide-react";
import { toast } from "sonner";
import PartDetailModal from "../parts/PartDetailModal";
import AssignPartModal from "../parts/AssignPartModal";

const getCategoryPath = (categoryId, categories) => {
  if (!categoryId) return null;
  const category = categories.find(c => c.id === categoryId);
  if (!category) return null;
  
  if (category.parent_id) {
    const parent = categories.find(c => c.id === category.parent_id);
    if (parent) {
      return `${parent.name} > ${category.name}`;
    }
  }
  return category.name;
};

export default function ProjectParts({ projectId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedPart, setSelectedPart] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const { data: partAssignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['partBuildAssignments', projectId],
    queryFn: () => base44.entities.PartBuildAssignment.filter({ project_id: projectId }),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list('-created_date'),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const updatePartMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Part.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      toast.success('Part status updated');
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: (assignmentId) => base44.entities.PartBuildAssignment.delete(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments'] });
      toast.success('Part removed from build');
    },
  });

  const parentCategories = categories.filter(c => !c.parent_id && c.active);

  // Get assigned parts for this project
  const assignedPartIds = partAssignments.map(a => a.part_id);
  const assignedParts = parts.filter(p => assignedPartIds.includes(p.id));

  // Get global parts
  const globalParts = parts.filter(p => p.global_all_builds);

  // Combine and filter
  const allAvailableParts = [...new Set([...assignedParts, ...globalParts])];

  const filteredParts = allAvailableParts.filter(part => {
    const matchesSearch = 
      part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || part.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || part.part_category_id === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Group by status
  const partsByStatus = {
    'On-Hand': filteredParts.filter(p => p.status === 'On-Hand'),
    'Need to Buy': filteredParts.filter(p => p.status === 'Need to Buy'),
    'On-Order': filteredParts.filter(p => p.status === 'On-Order'),
  };

  const handleMarkAsOrdered = (part) => {
    updatePartMutation.mutate({
      id: part.id,
      data: { ...part, status: 'On-Order' }
    });
  };

  const handleMarkAsReceived = (part) => {
    const newQty = (part.quantity_on_hand || 0) + 1;
    updatePartMutation.mutate({
      id: part.id,
      data: { 
        ...part, 
        status: 'On-Hand',
        quantity_on_hand: newQty
      }
    });
  };

  const handleRemovePart = (part) => {
    const assignment = partAssignments.find(a => a.part_id === part.id);
    if (assignment && !part.global_all_builds) {
      if (confirm(`Remove "${part.part_name}" from this build?`)) {
        removeAssignmentMutation.mutate(assignment.id);
      }
    } else if (part.global_all_builds) {
      toast.info('Global parts cannot be removed from individual builds');
    }
  };

  const statusColors = {
    'On-Hand': '#10B981',
    'Need to Buy': '#EF4444',
    'On-Order': '#F59E0B'
  };

  const totalEstimatedCost = filteredParts.reduce((sum, part) => sum + (part.cost || 0), 0);
  const totalEstimatedRetail = filteredParts.reduce((sum, part) => sum + (part.retail || 0), 0);

  return (
    <>
      <div className="space-y-4">
        {/* Summary Card */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-gray-400" />
                <CardTitle className="text-white text-base">Build Parts</CardTitle>
                <Badge variant="outline" className="border-gray-700 text-gray-400">
                  {filteredParts.length} parts
                </Badge>
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-xs text-gray-400">Est. Cost</p>
                  <p className="text-lg font-bold text-white">${totalEstimatedCost.toFixed(2)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">Est. Retail</p>
                  <p className="text-lg font-bold text-white">${totalEstimatedRetail.toFixed(2)}</p>
                </div>
              </div>
              <Button
                onClick={() => setShowAssignModal(true)}
                size="sm"
                className="bg-red-600 hover:bg-red-700 gap-2"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Assign Part</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Status Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-black/40 backdrop-blur-xl border border-green-900/30">
            <CardHeader className="border-b border-green-900/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-green-400">On-Hand</span>
                </div>
                <Badge className="bg-green-600 text-white">
                  {partsByStatus['On-Hand'].length}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardHeader className="border-b border-red-900/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-medium text-red-400">Need to Buy</span>
                </div>
                <Badge className="bg-red-600 text-white">
                  {partsByStatus['Need to Buy'].length}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          <Card className="bg-black/40 backdrop-blur-xl border border-yellow-900/30">
            <CardHeader className="border-b border-yellow-900/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-400">On Order</span>
                </div>
                <Badge className="bg-yellow-600 text-white">
                  {partsByStatus['On-Order'].length}
                </Badge>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 p-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <CardTitle className="text-white text-base">Filters</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search parts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="On-Hand">On-Hand</SelectItem>
                    <SelectItem value="Need to Buy">Need to Buy</SelectItem>
                    <SelectItem value="On-Order">On-Order</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
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
                              <span className="ml-4" style={{ color: child.color }}>
                                → {child.name}
                              </span>
                            </SelectItem>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignmentsLoading ? (
            <div className="col-span-full text-center py-8 text-gray-500">Loading parts...</div>
          ) : filteredParts.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No parts assigned to this build yet.</p>
              <p className="text-sm text-gray-600 mt-2">Click "Assign Part" to add parts.</p>
            </div>
          ) : (
            filteredParts.map(part => {
              const vendor = vendors.find(v => v.id === part.vendor_id);
              const location = locations.find(l => l.id === part.location_id);
              const categoryPath = getCategoryPath(part.part_category_id, categories);
              const category = categories.find(c => c.id === part.part_category_id);
              const isGlobal = part.global_all_builds;
              
              return (
                <Card 
                  key={part.id}
                  className="bg-black/40 backdrop-blur-xl border border-red-900/30 hover:border-red-900/50 transition-colors"
                >
                  <CardHeader className="border-b border-red-900/30 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-white text-base truncate">
                          {part.part_name}
                        </CardTitle>
                        {part.vendor_part_number && (
                          <p className="text-xs text-gray-400 font-mono mt-1">
                            {part.vendor_part_number}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <Badge 
                          style={{ backgroundColor: statusColors[part.status] }}
                          className="text-white text-xs shrink-0"
                        >
                          {part.status}
                        </Badge>
                        {isGlobal && (
                          <Badge variant="outline" className="border-green-500 text-green-400 text-xs">
                            Global
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    {part.photos && part.photos.length > 0 && (
                      <div className="w-full h-32 bg-gray-800 rounded mb-3 flex items-center justify-center overflow-hidden">
                        <img
                          src={part.photos[0]}
                          alt={part.part_name}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="space-y-2 mb-3">
                      {part.car_year && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Year/Model:</span>
                          <span className="text-white">
                            {part.car_year} {part.car_model}
                          </span>
                        </div>
                      )}
                      {categoryPath && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Category:</span>
                          <span style={{ color: category?.color || '#fff' }}>
                            {categoryPath}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Qty On Hand:</span>
                        <span className="text-white font-semibold">
                          {part.quantity_on_hand || 0}
                        </span>
                      </div>
                      {part.cost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Cost:</span>
                          <span className="text-white">${part.cost}</span>
                        </div>
                      )}
                      {vendor && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Vendor:</span>
                          <span className="text-white">{vendor.vendor_name}</span>
                        </div>
                      )}
                      {location && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Location:</span>
                          <span className="text-white text-right">
                            {location.bin_description || location.location_area}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => setSelectedPart(part)}
                          size="sm"
                          variant="outline"
                          className="flex-1 border-gray-700"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        {!isGlobal && (
                          <Button
                            onClick={() => handleRemovePart(part)}
                            size="sm"
                            variant="outline"
                            className="border-gray-700 hover:border-red-500 hover:text-red-400"
                            disabled={removeAssignmentMutation.isPending}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      {part.status === 'Need to Buy' && (
                        <Button
                          onClick={() => handleMarkAsOrdered(part)}
                          size="sm"
                          className="w-full bg-yellow-600 hover:bg-yellow-700"
                          disabled={updatePartMutation.isPending}
                        >
                          <ShoppingCart className="w-4 h-4 mr-2" />
                          Mark as Ordered
                        </Button>
                      )}

                      {part.status === 'On-Order' && (
                        <Button
                          onClick={() => handleMarkAsReceived(part)}
                          size="sm"
                          className="w-full bg-green-600 hover:bg-green-700"
                          disabled={updatePartMutation.isPending}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Mark as Received
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {selectedPart && (
        <PartDetailModal
          part={selectedPart}
          onClose={() => setSelectedPart(null)}
        />
      )}

      {showAssignModal && (
        <AssignPartModal
          projectId={projectId}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </>
  );
}