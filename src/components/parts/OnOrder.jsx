import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Search, Filter, Package, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * OnOrder - Shows parts that have been ordered but not yet received
 * Based on PartProjectRequirement.qty_ordered > 0 where status is 'Ordered' or 'Partially Received'
 * NO LONGER uses Part.status or Part.quantity_on_hand
 */
export default function OnOrder({ onPartClick }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ['partProjectRequirements'],
    queryFn: () => base44.entities.PartProjectRequirement.list()
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list()
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list()
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  // Filter requirements that have ordered but not fully received items
  const onOrderItems = requirements
    .filter(req => (req.qty_ordered || 0) > 0 && req.status !== 'Installed' && req.status !== 'Ready')
    .map(req => {
      const part = parts.find(p => p.id === req.part_id);
      if (!part) return null;
      
      const project = projects.find(p => p.id === req.project_id);
      const vendor = vendors.find(v => v.id === part.default_vendor_id);
      
      return {
        requirement: req,
        part,
        project,
        vendor,
        qty_ordered: req.qty_ordered || 0,
        estimated_value: (req.qty_ordered || 0) * (part.default_cost || 0)
      };
    })
    .filter(Boolean);

  const parentCategories = categories.filter(c => !c.parent_id && c.active);

  const filteredItems = onOrderItems.filter(item => {
    const matchesSearch = 
      item.part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || item.part.part_category_id === categoryFilter;
    const matchesProject = projectFilter === 'all' || item.requirement.project_id === projectFilter;
    
    return matchesSearch && matchesCategory && matchesProject;
  });

  const totalEstimatedValue = filteredItems.reduce((sum, item) => sum + item.estimated_value, 0);

  const getCategoryPath = (categoryId) => {
    if (!categoryId) return null;
    const category = categories.find(c => c.id === categoryId);
    if (!category) return null;
    if (category.parent_id) {
      const parent = categories.find(c => c.id === category.parent_id);
      return parent ? `${parent.name} > ${category.name}` : category.name;
    }
    return category.name;
  };

  // Mark as received - creates inventory and updates requirement
  const markReceivedMutation = useMutation({
    mutationFn: async ({ requirement, part, qtyReceived }) => {
      // Create inventory item
      await base44.entities.InventoryItem.create({
        part_id: requirement.part_id,
        quantity_on_hand: qtyReceived,
        quantity_reserved: 0,
        purchase_cost: part.default_cost || 0,
        received_date: new Date().toISOString().split('T')[0],
        notes: `Received for project requirement`
      });

      // Update requirement - reduce ordered, increase allocated
      const newOrdered = Math.max(0, (requirement.qty_ordered || 0) - qtyReceived);
      const newAllocated = (requirement.qty_allocated || 0) + qtyReceived;
      const newStatus = newAllocated >= requirement.qty_needed ? 'Allocated' : 
                       newAllocated > 0 ? 'Partially Allocated' : 'Needed';

      await base44.entities.PartProjectRequirement.update(requirement.id, {
        qty_ordered: newOrdered,
        qty_allocated: newAllocated,
        status: newStatus
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      toast.success('Parts received and added to inventory');
    },
    onError: (error) => {
      toast.error('Failed to mark as received: ' + error.message);
    }
  });

  const handleMarkReceived = (item) => {
    markReceivedMutation.mutate({
      requirement: item.requirement,
      part: item.part,
      qtyReceived: item.qty_ordered
    });
  };

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="bg-black/40 backdrop-blur-xl border border-yellow-900/30">
        <CardHeader className="border-b border-yellow-900/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-yellow-400" />
              <CardTitle className="text-white text-base">On Order</CardTitle>
              <Badge variant="outline" className="border-yellow-500 text-yellow-400">
                {filteredItems.length} items
              </Badge>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Awaiting Value</p>
              <p className="text-xl font-bold text-white">${totalEstimatedValue.toFixed(2)}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader 
          className="border-b border-red-900/30 p-4 cursor-pointer md:cursor-default"
          onClick={() => setFiltersExpanded(!filtersExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <CardTitle className="text-white text-base">Filters</CardTitle>
            </div>
            <button className="md:hidden text-gray-400">
              {filtersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </CardHeader>
        {filtersExpanded && (
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Parts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-gray-500">Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div className="col-span-full text-center py-8">
            <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No parts currently on order.</p>
          </div>
        ) : (
          filteredItems.map(item => {
            const categoryPath = getCategoryPath(item.part.part_category_id);
            const category = categories.find(c => c.id === item.part.part_category_id);
            
            return (
              <Card 
                key={item.requirement.id}
                className="bg-black/40 backdrop-blur-xl border border-yellow-900/30 hover:border-yellow-900/50 transition-colors cursor-pointer"
                onClick={() => onPartClick(item.part)}
              >
                <CardHeader className="border-b border-yellow-900/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-white text-base truncate">
                        {item.part.part_name}
                      </CardTitle>
                      {item.part.vendor_part_number && (
                        <p className="text-xs text-gray-400 font-mono mt-1">
                          {item.part.vendor_part_number}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="border-yellow-500 text-yellow-400 text-xs shrink-0">
                      {item.qty_ordered} ordered
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {item.part.featured_photo && (
                    <div className="w-full h-32 bg-gray-800 rounded mb-3 flex items-center justify-center overflow-hidden">
                      <img
                        src={item.part.featured_photo}
                        alt={item.part.part_name}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    {item.project && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Project:</span>
                        <span className="text-white">{item.project.name}</span>
                      </div>
                    )}
                    {categoryPath && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Category:</span>
                        <span style={{ color: category?.color || '#fff' }}>{categoryPath}</span>
                      </div>
                    )}
                    {item.estimated_value > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Value:</span>
                        <span className="text-white font-semibold">${item.estimated_value.toFixed(2)}</span>
                      </div>
                    )}
                    {item.vendor && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Vendor:</span>
                        <span className="text-white">{item.vendor.vendor_name}</span>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkReceived(item);
                    }}
                    size="sm"
                    className="w-full mt-3 bg-green-600 hover:bg-green-700"
                    disabled={markReceivedMutation.isPending}
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
  );
}