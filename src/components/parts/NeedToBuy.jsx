import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Search, Filter, CheckCircle, Package, ChevronDown, ChevronUp } from "lucide-react";
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

export default function NeedToBuy({ onPartClick }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    const saved = localStorage.getItem('needToBuy_filtersExpanded');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const itemsPerPage = 25;

  // Save filter state
  useEffect(() => {
    localStorage.setItem('needToBuy_filtersExpanded', JSON.stringify(filtersExpanded));
  }, [filtersExpanded]);

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
      toast.success('Part status updated');
    },
  });

  const needToBuyParts = parts.filter(p => p.status === 'Need to Buy');
  const parentCategories = categories.filter(c => !c.parent_id && c.active);

  const filteredParts = needToBuyParts.filter(part => {
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

  const handleMarkAsOrdered = (part) => {
    updatePartMutation.mutate({
      id: part.id,
      data: { ...part, status: 'On-Order' }
    });
  };

  const totalEstimatedCost = filteredParts.reduce((sum, part) => sum + (part.cost || 0), 0);

  // Pagination
  const totalPages = Math.ceil(filteredParts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedParts = filteredParts.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, projectFilter]);

  return (
    <>
      <div className="space-y-4">
        {/* Summary Card */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-red-400" />
                <CardTitle className="text-white text-base">Need to Buy</CardTitle>
                <Badge variant="outline" className="border-red-500 text-red-400">
                  {filteredParts.length} parts
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Est. Total Cost</p>
                <p className="text-xl font-bold text-white">${totalEstimatedCost.toFixed(2)}</p>
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
          )}
        </Card>

        {/* Parts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full text-center py-8 text-gray-500">Loading parts...</div>
          ) : filteredParts.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-gray-400">All caught up! No parts need to be bought.</p>
            </div>
          ) : (
            paginatedParts.map(part => {
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
                  className="bg-black/40 backdrop-blur-xl border border-red-900/30 hover:border-red-900/50 transition-colors cursor-pointer"
                  onClick={() => onPartClick(part)}
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
                      <Badge 
                        variant="outline"
                        className="border-red-500 text-red-400 text-xs shrink-0"
                      >
                        Need to Buy
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
                        handleMarkAsOrdered(part);
                      }}
                      size="sm"
                      className="w-full mt-3 bg-yellow-600 hover:bg-yellow-700"
                      disabled={updatePartMutation.isPending}
                    >
                      <Package className="w-4 h-4 mr-2" />
                      Mark as Ordered
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Pagination Controls */}
        {filteredParts.length > 0 && totalPages > 1 && (
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="text-sm text-gray-400">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredParts.length)} of {filteredParts.length} parts
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="border-gray-700 hover:bg-red-950/30"
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-10 border-gray-700 ${
                            currentPage === pageNum ? 'bg-red-600 text-white' : 'hover:bg-red-950/30'
                          }`}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="border-gray-700 hover:bg-red-950/30"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}