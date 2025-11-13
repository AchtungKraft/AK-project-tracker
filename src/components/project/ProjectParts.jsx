import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Filter, Plus, Package, Trash2 } from "lucide-react";
import AddPartToProjectModal from "./AddPartToProjectModal";

const FILTER_STORAGE_KEY = 'achtung_project_parts_filters';

// Helper to get full category path
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

// Helper to get full location path
const getLocationPath = (locationId, locations) => {
  if (!locationId) return null;
  const location = locations.find(l => l.id === locationId);
  if (!location) return null;
  
  if (location.parent_id) {
    const parent = locations.find(l => l.id === location.parent_id);
    if (parent) {
      return `${parent.location_area} > ${location.location_area}`;
    }
  }
  return location.location_area;
};

export default function ProjectParts({ projectId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('category');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        const filters = JSON.parse(saved);
        setSearchTerm(filters.searchTerm || '');
        setCategoryFilter(filters.categoryFilter || 'all');
        setLocationFilter(filters.locationFilter || 'all');
        setStatusFilter(filters.statusFilter || 'all');
        setGroupBy(filters.groupBy || 'category');
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        searchTerm,
        categoryFilter,
        locationFilter,
        statusFilter,
        groupBy,
      }));
    } catch (e) {}
  }, [searchTerm, categoryFilter, locationFilter, statusFilter, groupBy]);

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['partBuildAssignments', projectId],
    queryFn: () => base44.entities.PartBuildAssignment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: allParts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (id) => base44.entities.PartBuildAssignment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments', projectId] });
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments'] });
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PartBuildAssignment.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments', projectId] });
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments'] });
    },
  });

  const parentCategories = categories.filter(c => !c.parent_id && c.active);

  // Combine assignments with part details
  const partsWithAssignments = assignments.map(assignment => {
    const part = allParts.find(p => p.id === assignment.part_id);
    return { assignment, part };
  }).filter(item => item.part);

  // Filter parts
  const filteredParts = partsWithAssignments.filter(({ part, assignment }) => {
    const matchesSearch = part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || part.part_category_id === categoryFilter;
    const matchesLocation = locationFilter === 'all' || part.location_id === locationFilter;
    const matchesStatus = statusFilter === 'all' || assignment.needed_status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesLocation && matchesStatus;
  });

  // Group parts
  const groupedParts = {};
  filteredParts.forEach(({ part, assignment }) => {
    let groupKey = 'Ungrouped';
    let groupColor = '#6B7280';
    
    if (groupBy === 'category') {
      groupKey = getCategoryPath(part.part_category_id, categories) || 'No Category';
      const category = categories.find(c => c.id === part.part_category_id);
      groupColor = category?.color || '#6B7280';
    } else if (groupBy === 'location') {
      groupKey = getLocationPath(part.location_id, locations) || 'No Location';
      const location = locations.find(l => l.id === part.location_id);
      groupColor = location?.color || '#6B7280';
    } else if (groupBy === 'status') {
      groupKey = assignment.needed_status || 'No Status';
      groupColor = assignment.needed_status === 'On-Hand' ? '#10B981' :
                   assignment.needed_status === 'Need to Buy' ? '#EF4444' : '#F59E0B';
    }
    
    if (!groupedParts[groupKey]) {
      groupedParts[groupKey] = { parts: [], color: groupColor };
    }
    groupedParts[groupKey].parts.push({ part, assignment });
  });

  const getVendorName = (vendorId) => {
    return vendors.find(v => v.id === vendorId)?.vendor_name || '-';
  };

  const getStatusBadgeClass = (status) => {
    if (status === 'On-Hand') return 'bg-green-500 text-white';
    if (status === 'Need to Buy') return 'bg-red-500 text-white';
    if (status === 'On-Order') return 'bg-yellow-500 text-white';
    return 'bg-gray-500 text-white';
  };

  const handleRemovePart = (assignmentId) => {
    if (confirm('Remove this part from the project?')) {
      deleteAssignmentMutation.mutate(assignmentId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <CardTitle className="text-white text-base">Filters & Grouping</CardTitle>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-4">
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
              <label className="text-xs text-gray-400 mb-1 block">Category</label>
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
              <label className="text-xs text-gray-400 mb-1 block">Location</label>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.filter(l => l.active).map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      <span style={{ color: l.color }}>{l.location_area}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Status</label>
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
              <label className="text-xs text-gray-400 mb-1 block">Group By</label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="category">Category</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parts Table */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 p-4">
          <CardTitle className="text-white text-base">
            <Package className="w-4 h-4 inline mr-2" />
            Assigned Parts ({filteredParts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignmentsLoading ? (
            <div className="p-4 text-center text-gray-500 text-sm">Loading parts...</div>
          ) : filteredParts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              {assignments.length === 0 ? (
                <>
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                  <p className="mb-2">No parts assigned to this project yet.</p>
                  <Button
                    onClick={() => setShowAddModal(true)}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 gap-2 mt-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add First Part
                  </Button>
                </>
              ) : (
                <p>No parts found matching your filters.</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-red-900/10">
              {Object.entries(groupedParts).map(([groupLabel, groupData]) => {
                const { parts: groupParts, color: groupColor } = groupData;
                
                return (
                  <div key={groupLabel}>
                    <div 
                      className="px-4 py-2 bg-gray-900/50 border-l-4 border-b-2"
                      style={{ 
                        borderLeftColor: groupColor,
                        borderBottomColor: groupColor
                      }}
                    >
                      <span 
                        className="text-sm font-medium"
                        style={{ color: groupColor }}
                      >
                        {groupLabel} ({groupParts.length})
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                          <TableHead className="text-gray-400 text-xs py-2">Part Name</TableHead>
                          <TableHead className="text-gray-400 text-xs py-2 hidden lg:table-cell">Part #</TableHead>
                          {groupBy !== 'category' && (
                            <TableHead className="text-gray-400 text-xs py-2 hidden xl:table-cell">Category</TableHead>
                          )}
                          {groupBy !== 'location' && (
                            <TableHead className="text-gray-400 text-xs py-2 hidden xl:table-cell">Location</TableHead>
                          )}
                          {groupBy !== 'status' && (
                            <TableHead className="text-gray-400 text-xs py-2">Status</TableHead>
                          )}
                          <TableHead className="text-gray-400 text-xs py-2 hidden md:table-cell">Qty Needed</TableHead>
                          <TableHead className="text-gray-400 text-xs py-2">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupParts.map(({ part, assignment }) => {
                          const categoryColor = categories.find(c => c.id === part.part_category_id)?.color;
                          const locationColor = locations.find(l => l.id === part.location_id)?.color;
                          
                          return (
                            <TableRow 
                              key={assignment.id}
                              className="border-b border-red-900/10 hover:bg-red-950/20 transition-colors"
                            >
                              <TableCell className="font-medium text-white text-sm py-2">
                                {part.part_name}
                              </TableCell>
                              <TableCell className="text-gray-400 text-sm font-mono py-2 hidden lg:table-cell">
                                {part.vendor_part_number || '-'}
                              </TableCell>
                              {groupBy !== 'category' && (
                                <TableCell className="text-sm py-2 hidden xl:table-cell">
                                  <span style={{ color: categoryColor || '#D1D5DB' }}>
                                    {getCategoryPath(part.part_category_id, categories) || '-'}
                                  </span>
                                </TableCell>
                              )}
                              {groupBy !== 'location' && (
                                <TableCell className="text-sm py-2 hidden xl:table-cell">
                                  <span style={{ color: locationColor || '#D1D5DB' }}>
                                    {getLocationPath(part.location_id, locations) || '-'}
                                  </span>
                                </TableCell>
                              )}
                              {groupBy !== 'status' && (
                                <TableCell className="py-2">
                                  <Badge className={`text-xs ${getStatusBadgeClass(assignment.needed_status)}`}>
                                    {assignment.needed_status}
                                  </Badge>
                                </TableCell>
                              )}
                              <TableCell className="text-gray-300 text-sm py-2 hidden md:table-cell">
                                {assignment.qty_needed || 1}
                              </TableCell>
                              <TableCell className="py-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRemovePart(assignment.id)}
                                  className="text-red-400 hover:text-red-300 h-7 w-7 p-0"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {showAddModal && (
        <AddPartToProjectModal
          projectId={projectId}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}