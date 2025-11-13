import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Package, Filter, LayoutGrid, List } from "lucide-react";
import AddPartModal from "./AddPartModal";
import EditPartModal from "./EditPartModal";
import ImageModal from "../ui/ImageModal";

const FILTER_STORAGE_KEY = 'achtung_parts_master_filters';

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

export default function PartsMasterList() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [viewMode, setViewMode] = useState('card');
  const [groupBy, setGroupBy] = useState('category');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [makeFilter, setMakeFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        const filters = JSON.parse(saved);
        setSearchTerm(filters.searchTerm || '');
        setStatusFilter(filters.statusFilter || 'all');
        setCategoryFilter(filters.categoryFilter || 'all');
        setMakeFilter(filters.makeFilter || 'all');
        setModelFilter(filters.modelFilter || 'all');
        setYearFilter(filters.yearFilter || 'all');
        setViewMode(filters.viewMode || 'card');
        setGroupBy(filters.groupBy || 'category');
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        searchTerm,
        statusFilter,
        categoryFilter,
        makeFilter,
        modelFilter,
        yearFilter,
        viewMode,
        groupBy,
      }));
    } catch (e) {}
  }, [searchTerm, statusFilter, categoryFilter, makeFilter, modelFilter, yearFilter, viewMode, groupBy]);

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list('-created_date'),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const list = await base44.entities.Vendor.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const list = await base44.entities.Location.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: makes = [] } = useQuery({
    queryKey: ['carMakes'],
    queryFn: async () => {
      const list = await base44.entities.CarMake.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: models = [] } = useQuery({
    queryKey: ['carModels'],
    queryFn: async () => {
      const list = await base44.entities.CarModel.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: years = [] } = useQuery({
    queryKey: ['carYears'],
    queryFn: async () => {
      const list = await base44.entities.CarYear.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: allAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments'],
    queryFn: () => base44.entities.PartBuildAssignment.list(),
  });

  const getPartReserved = (partId) => {
    return allAssignments
      .filter(a => a.part_id === partId)
      .reduce((sum, a) => sum + (a.qty_needed || 0), 0);
  };

  const getPartAvailable = (partId, part) => {
    if (!part) return 0;
    const reserved = getPartReserved(partId);
    return (part.quantity_on_hand || 0) - reserved;
  };

  const parentCategories = categories.filter(c => !c.parent_id && c.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const filteredParts = parts.filter(part => {
    const matchesSearch = 
      part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || part.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || part.part_category_id === categoryFilter;
    const matchesMake = makeFilter === 'all' || part.car_make_id === makeFilter;
    const matchesModel = modelFilter === 'all' || part.car_model_id === modelFilter;
    const matchesYear = yearFilter === 'all' || part.car_year_id === yearFilter;
    
    return matchesSearch && matchesStatus && matchesCategory && matchesMake && matchesModel && matchesYear;
  });

  const availableModels = models.filter(m => makeFilter === 'all' || m.car_make_id === makeFilter).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const availableYears = years.filter(y => modelFilter === 'all' || y.car_model_id === modelFilter).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const groupedParts = {};
  filteredParts.forEach(part => {
    let groupKey = 'Ungrouped';
    let groupColor = '#6B7280';
    
    if (groupBy === 'category') {
      groupKey = getCategoryPath(part.part_category_id, categories) || 'No Category';
      const category = categories.find(c => c.id === part.part_category_id);
      groupColor = category?.color || '#6B7280';
    } else if (groupBy === 'status') {
      groupKey = part.status || 'No Status';
      groupColor = part.status === 'On-Hand' ? '#10B981' :
                   part.status === 'Need to Buy' ? '#EF4444' : '#F59E0B';
    } else if (groupBy === 'make') {
      const make = makes.find(m => m.id === part.car_make_id);
      groupKey = make?.name || 'No Make';
      groupColor = make?.color || '#6B7280';
    } else if (groupBy === 'vendor') {
      const vendor = vendors.find(v => v.id === part.vendor_id);
      groupKey = vendor?.vendor_name || 'No Vendor';
      groupColor = vendor?.color || '#6B7280';
    }
    
    if (!groupedParts[groupKey]) {
      groupedParts[groupKey] = { parts: [], color: groupColor };
    }
    groupedParts[groupKey].parts.push(part);
  });

  const statusColors = {
    'On-Hand': '#10B981',
    'Need to Buy': '#EF4444',
    'On-Order': '#F59E0B'
  };

  return (
    <>
      <div className="space-y-4">
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <CardTitle className="text-white text-base">Filters & View</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-gray-900/50 rounded-lg p-1 border border-gray-700">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setViewMode('card')}
                    className={`h-7 px-2 ${viewMode === 'card' ? 'bg-red-600 text-white' : 'text-gray-400'}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setViewMode('list')}
                    className={`h-7 px-2 ${viewMode === 'list' ? 'bg-red-600 text-white' : 'text-gray-400'}`}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  onClick={() => setShowAddModal(true)}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Part</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="lg:col-span-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search by name or part #..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Group By</label>
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="make">Make</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
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
                <label className="text-xs text-gray-400 mb-1 block">Make</label>
                <Select value={makeFilter} onValueChange={(v) => { setMakeFilter(v); setModelFilter('all'); setYearFilter('all'); }}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="All Makes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Makes</SelectItem>
                    {makes.filter(m => m.active).map(make => (
                      <SelectItem key={make.id} value={make.id}>{make.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Model</label>
                <Select value={modelFilter} onValueChange={(v) => { setModelFilter(v); setYearFilter('all'); }} disabled={makeFilter === 'all'}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="All Models" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Models</SelectItem>
                    {availableModels.filter(m => m.active).map(model => (
                      <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Year/Series</label>
                <Select value={yearFilter} onValueChange={setYearFilter} disabled={modelFilter === 'all'}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="All Years" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {availableYears.filter(y => y.active).map(year => (
                      <SelectItem key={year.id} value={year.id}>{year.year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-8">
              <div className="text-center text-gray-500">Loading parts...</div>
            </CardContent>
          </Card>
        ) : filteredParts.length === 0 ? (
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-8">
              <div className="text-center text-gray-500">
                No parts found matching your filters.
              </div>
            </CardContent>
          </Card>
        ) : viewMode === 'card' ? (
          <div className="space-y-4">
            {Object.entries(groupedParts).map(([groupLabel, groupData]) => {
              const { parts: groupParts, color: groupColor } = groupData;
              
              return (
                <Card key={groupLabel} className="bg-black/40 backdrop-blur-xl border border-red-900/30">
                  <CardHeader 
                    className="border-b border-red-900/30 p-4 border-l-4"
                    style={{ borderLeftColor: groupColor }}
                  >
                    <CardTitle className="text-base" style={{ color: groupColor }}>
                      {groupLabel} ({groupParts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {groupParts.map(part => {
                        const vendor = vendors.find(v => v.id === part.vendor_id);
                        const location = locations.find(l => l.id === part.location_id);
                        const categoryPath = getCategoryPath(part.part_category_id, categories);
                        const category = categories.find(c => c.id === part.part_category_id);
                        const make = makes.find(m => m.id === part.car_make_id);
                        const model = models.find(m => m.id === part.car_model_id);
                        const year = years.find(y => y.id === part.car_year_id);
                        const featuredPhoto = part.featured_photo || (part.photos && part.photos[0]);
                        
                        return (
                          <Card 
                            key={part.id}
                            className="bg-gray-900/50 border border-gray-800 hover:border-red-900/50 transition-colors"
                          >
                            <CardHeader className="border-b border-gray-800 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedPart(part.id)}>
                                  <CardTitle className="text-white text-sm truncate">
                                    {part.part_name}
                                  </CardTitle>
                                  {part.vendor_part_number && (
                                    <p className="text-xs text-gray-400 font-mono mt-1">
                                      {part.vendor_part_number}
                                    </p>
                                  )}
                                </div>
                                <Badge 
                                  style={{ backgroundColor: statusColors[part.status] }}
                                  className="text-white text-xs shrink-0"
                                >
                                  {part.status}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="p-3">
                              {featuredPhoto && (
                                <div 
                                  className="w-full h-32 bg-gray-800 rounded mb-3 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedImage(featuredPhoto);
                                  }}
                                >
                                  <img
                                    src={featuredPhoto}
                                    alt={part.part_name}
                                    className="max-w-full max-h-full object-contain"
                                  />
                                </div>
                              )}
                              <div className="space-y-1.5 text-xs">
                                {(make || model || year) && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Vehicle:</span>
                                    <span className="text-white text-right">
                                      {[make?.name, model?.name, year?.year].filter(Boolean).join(' ')}
                                    </span>
                                  </div>
                                )}
                                {groupBy !== 'category' && categoryPath && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Category:</span>
                                    <span style={{ color: category?.color || '#fff' }}>
                                      {categoryPath}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Global Stock:</span>
                                  <span className="text-white font-semibold">
                                    {part.quantity_on_hand || 0}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Reserved:</span>
                                  <span className="text-yellow-400 font-semibold">
                                    {getPartReserved(part.id)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Available:</span>
                                  <span className={`font-semibold ${getPartAvailable(part.id, part) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {getPartAvailable(part.id, part)}
                                  </span>
                                </div>
                                {groupBy !== 'vendor' && vendor && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Vendor:</span>
                                    <span className="text-white">{vendor.vendor_name}</span>
                                  </div>
                                )}
                                {location && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Location:</span>
                                    <span className="text-white text-right truncate max-w-[60%]">
                                      {location.bin_description || location.location_area}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedParts).map(([groupLabel, groupData]) => {
              const { parts: groupParts, color: groupColor } = groupData;
              
              return (
                <Card key={groupLabel} className="bg-black/40 backdrop-blur-xl border border-red-900/30">
                  <CardHeader 
                    className="border-b border-red-900/30 p-3 border-l-4"
                    style={{ borderLeftColor: groupColor }}
                  >
                    <CardTitle className="text-sm" style={{ color: groupColor }}>
                      {groupLabel} ({groupParts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                          <TableHead className="text-gray-400 text-xs py-2">Photo</TableHead>
                          <TableHead className="text-gray-400 text-xs py-2">Part Name</TableHead>
                          <TableHead className="text-gray-400 text-xs py-2 hidden lg:table-cell">Part #</TableHead>
                          <TableHead className="text-gray-400 text-xs py-2 hidden xl:table-cell">Vehicle</TableHead>
                          {groupBy !== 'category' && (
                            <TableHead className="text-gray-400 text-xs py-2 hidden 2xl:table-cell">Category</TableHead>
                          )}
                          {groupBy !== 'status' && (
                            <TableHead className="text-gray-400 text-xs py-2">Status</TableHead>
                          )}
                          <TableHead className="text-gray-400 text-xs py-2">Inventory</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupParts.map(part => {
                          const vendor = vendors.find(v => v.id === part.vendor_id);
                          const categoryPath = getCategoryPath(part.part_category_id, categories);
                          const category = categories.find(c => c.id === part.part_category_id);
                          const make = makes.find(m => m.id === part.car_make_id);
                          const model = models.find(m => m.id === part.car_model_id);
                          const year = years.find(y => y.id === part.car_year_id);
                          const featuredPhoto = part.featured_photo || (part.photos && part.photos[0]);
                          
                          return (
                            <TableRow 
                              key={part.id}
                              className="border-b border-red-900/10 hover:bg-red-950/20 transition-colors cursor-pointer"
                              onClick={() => setSelectedPart(part.id)}
                            >
                              <TableCell className="py-2">
                                {featuredPhoto && (
                                  <div 
                                    className="w-12 h-12 bg-gray-800 rounded flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-80"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedImage(featuredPhoto);
                                    }}
                                  >
                                    <img
                                      src={featuredPhoto}
                                      alt={part.part_name}
                                      className="w-full h-full object-contain"
                                    />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="font-medium text-white text-sm py-2">
                                {part.part_name}
                              </TableCell>
                              <TableCell className="text-gray-400 text-xs font-mono py-2 hidden lg:table-cell">
                                {part.vendor_part_number || '-'}
                              </TableCell>
                              <TableCell className="text-white text-xs py-2 hidden xl:table-cell">
                                {[make?.name, model?.name, year?.year].filter(Boolean).join(' ') || '-'}
                              </TableCell>
                              {groupBy !== 'category' && (
                                <TableCell className="text-sm py-2 hidden 2xl:table-cell">
                                  <span style={{ color: category?.color || '#D1D5DB' }}>
                                    {categoryPath || '-'}
                                  </span>
                                </TableCell>
                              )}
                              {groupBy !== 'status' && (
                                <TableCell className="py-2">
                                  <Badge 
                                    style={{ backgroundColor: statusColors[part.status] }}
                                    className="text-white text-xs"
                                  >
                                    {part.status}
                                  </Badge>
                                </TableCell>
                              )}
                              <TableCell className="py-2">
                                <div className="text-xs space-y-0.5">
                                  <div className="text-gray-400">Stock: <span className="text-white font-semibold">{part.quantity_on_hand || 0}</span></div>
                                  <div className="text-gray-400">Avail: <span className={`font-semibold ${getPartAvailable(part.id, part) > 0 ? 'text-green-400' : 'text-red-400'}`}>{getPartAvailable(part.id, part)}</span></div>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddPartModal onClose={() => setShowAddModal(false)} />
      )}

      {selectedPart && (
        <EditPartModal
          partId={selectedPart}
          onClose={() => setSelectedPart(null)}
        />
      )}

      {selectedImage && (
        <ImageModal
          isOpen={!!selectedImage}
          imageUrl={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </>
  );
}