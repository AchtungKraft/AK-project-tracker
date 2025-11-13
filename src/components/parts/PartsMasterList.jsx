import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Package, Filter } from "lucide-react";
import AddPartModal from "./AddPartModal";
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

export default function PartsMasterList() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');

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

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const parentCategories = categories.filter(c => !c.parent_id && c.active);

  const filteredParts = parts.filter(part => {
    const matchesSearch = 
      part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || part.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || part.part_category_id === categoryFilter;
    const matchesYear = yearFilter === 'all' || part.car_year === yearFilter;
    
    return matchesSearch && matchesStatus && matchesCategory && matchesYear;
  });

  const uniqueYears = [...new Set(parts.map(p => p.car_year).filter(Boolean))].sort();

  const statusColors = {
    'On-Hand': '#10B981',
    'Need to Buy': '#EF4444',
    'On-Order': '#F59E0B'
  };

  return (
    <>
      <div className="space-y-4">
        {/* Filters */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <CardTitle className="text-white text-base">Filters</CardTitle>
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
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-4">
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
                <label className="text-xs text-gray-400 mb-1 block">Year</label>
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="All Years" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {uniqueYears.map(year => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
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
            <div className="col-span-full text-center py-8 text-gray-500">
              No parts found matching your filters.
            </div>
          ) : (
            filteredParts.map(part => {
              const vendor = vendors.find(v => v.id === part.vendor_id);
              const location = locations.find(l => l.id === part.location_id);
              const categoryPath = getCategoryPath(part.part_category_id, categories);
              const category = categories.find(c => c.id === part.part_category_id);
              
              return (
                <Card 
                  key={part.id}
                  className="bg-black/40 backdrop-blur-xl border border-red-900/30 hover:border-red-900/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedPart(part)}
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
                        style={{ backgroundColor: statusColors[part.status] }}
                        className="text-white text-xs shrink-0"
                      >
                        {part.status}
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
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Qty On Hand:</span>
                        <span className="text-white font-semibold">
                          {part.quantity_on_hand || 0}
                        </span>
                      </div>
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
                      {part.global_all_builds && (
                        <Badge variant="outline" className="border-green-500 text-green-400 text-xs">
                          Global/All Builds
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {showAddModal && (
        <AddPartModal onClose={() => setShowAddModal(false)} />
      )}

      {selectedPart && (
        <PartDetailModal
          part={selectedPart}
          onClose={() => setSelectedPart(null)}
        />
      )}
    </>
  );
}