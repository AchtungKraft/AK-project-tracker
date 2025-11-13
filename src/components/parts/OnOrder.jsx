import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Search, Filter, CheckCircle, Package } from "lucide-react";
import { toast } from "sonner";
import PartDetailModal from "./PartDetailModal";

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

export default function OnOrder() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [selectedPart, setSelectedPart] = useState(null);

  const { data: parts = [], isLoading } = useQuery({
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

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: partAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments'],
    queryFn: () => base44.entities.PartBuildAssignment.list(),
  });

  const updatePartMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Part.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      toast.success('Part received and marked as on-hand');
    },
  });

  const onOrderParts = parts.filter(p => p.status === 'On-Order');
  const parentCategories = categories.filter(c => !c.parent_id && c.active);

  const filteredParts = onOrderParts.filter(part => {
    const matchesSearch = 
      part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || part.part_category_id === categoryFilter;
    
    let matchesProject = true;
    if (projectFilter !== 'all') {
      if (projectFilter === 'global') {
        matchesProject = part.global_all_builds;
      } else {
        const hasAssignment = partAssignments.some(
          a => a.part_id === part.id && a.project_id === projectFilter
        );
        matchesProject = hasAssignment || part.global_all_builds;
      }
    }
    
    return matchesSearch && matchesCategory && matchesProject;
  });

  const handleMarkAsReceived = (part) => {
    // Update quantity and status
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

  const totalEstimatedCost = filteredParts.reduce((sum, part) => sum + (part.cost || 0), 0);

  return (
    <>
      <div className="space-y-4">
        {/* Summary Card */}
        <Card className="bg-black/40 backdrop-blur-xl border border-yellow-900/30">
          <CardHeader className="border-b border-yellow-900/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-yellow-400" />
                <CardTitle className="text-white text-base">On Order</CardTitle>
                <Badge variant="outline" className="border-yellow-500 text-yellow-400">
                  {filteredParts.length} parts
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Awaiting Value</p>
                <p className="text-xl font-bold text-white">${totalEstimatedCost.toFixed(2)}</p>
              </div>
            </div>
          </CardHeader>
        </Card>

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

              <div>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="All Builds" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Builds</SelectItem>
                    <SelectItem value="global">Global Only</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full text-center py-8 text-gray-500">Loading parts...</div>
          ) : filteredParts.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No parts currently on order.</p>
            </div>
          ) : (
            filteredParts.map(part => {
              const vendor = vendors.find(v => v.id === part.vendor_id);
              const categoryPath = getCategoryPath(part.part_category_id, categories);
              const category = categories.find(c => c.id === part.part_category_id);
              const assignedProjects = partAssignments
                .filter(a => a.part_id === part.id)
                .map(a => projects.find(p => p.id === a.project_id))
                .filter(Boolean);
              
              return (
                <Card 
                  key={part.id}
                  className="bg-black/40 backdrop-blur-xl border border-yellow-900/30 hover:border-yellow-900/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedPart(part)}
                >
                  <CardHeader className="border-b border-yellow-900/30 p-4">
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
                      <Badge 
                        variant="outline"
                        className="border-yellow-500 text-yellow-400 text-xs shrink-0"
                      >
                        On Order
                      </Badge>
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
                    <div className="space-y-2">
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
                      {part.cost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Cost:</span>
                          <span className="text-white font-semibold">${part.cost}</span>
                        </div>
                      )}
                      {vendor && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Vendor:</span>
                          <span className="text-white">{vendor.vendor_name}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Current Qty:</span>
                        <span className="text-white">{part.quantity_on_hand || 0}</span>
                      </div>
                      {part.global_all_builds && (
                        <Badge variant="outline" className="border-green-500 text-green-400 text-xs">
                          Global/All Builds
                        </Badge>
                      )}
                      {assignedProjects.length > 0 && (
                        <div className="pt-2 border-t border-gray-800">
                          <p className="text-xs text-gray-400 mb-1">For Builds:</p>
                          <div className="flex flex-wrap gap-1">
                            {assignedProjects.slice(0, 2).map(proj => (
                              <Badge key={proj.id} variant="outline" className="text-xs border-gray-700">
                                {proj.name}
                              </Badge>
                            ))}
                            {assignedProjects.length > 2 && (
                              <Badge variant="outline" className="text-xs border-gray-700">
                                +{assignedProjects.length - 2} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsReceived(part);
                      }}
                      size="sm"
                      className="w-full mt-3 bg-green-600 hover:bg-green-700"
                      disabled={updatePartMutation.isPending}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Mark as Received
                    </Button>
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
    </>
  );
}