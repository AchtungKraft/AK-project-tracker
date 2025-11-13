import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Search, Package, QrCode, ChevronDown, ChevronRight, X as XIcon } from "lucide-react";
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

export default function InventoryLocations() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [collapsedAreas, setCollapsedAreas] = useState({});
  const [collapsedLocations, setCollapsedLocations] = useState({});

  const { data: parts = [], isLoading: partsLoading } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list('-created_date'),
  });

  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: makes = [] } = useQuery({
    queryKey: ['carMakes'],
    queryFn: () => base44.entities.CarMake.list(),
  });

  const { data: models = [] } = useQuery({
    queryKey: ['carModels'],
    queryFn: () => base44.entities.CarModel.list(),
  });

  const { data: years = [] } = useQuery({
    queryKey: ['carYears'],
    queryFn: () => base44.entities.CarYear.list(),
  });

  const activeLocations = locations.filter(l => l.active);

  // Build hierarchy: parent locations and children
  const parentLocations = activeLocations
    .filter(l => !l.parent_id)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const getChildLocations = (parentId) => {
    return activeLocations
      .filter(l => l.parent_id === parentId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  };

  // Get parts for a location
  const getPartsForLocation = (locationId) => {
    return parts.filter(p => p.location_id === locationId);
  };

  // Get parts without location
  const unassignedParts = parts.filter(p => !p.location_id);

  // Filter based on search
  const filterParts = (partsList) => {
    if (!searchTerm) return partsList;
    return partsList.filter(p => 
      p.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const statusColors = {
    'On-Hand': '#10B981',
    'Need to Buy': '#EF4444',
    'On-Order': '#F59E0B'
  };

  const totalOnHandParts = parts.filter(p => p.status === 'On-Hand').length;
  const totalOnHandQty = parts.reduce((sum, p) => sum + (p.quantity_on_hand || 0), 0);

  const toggleArea = (locationId) => {
    setCollapsedLocations(prev => ({
      ...prev,
      [locationId]: !prev[locationId]
    }));
  };

  const handleLocationClick = (locationId) => {
    setSelectedLocationId(locationId);
  };

  const selectedLocationParts = selectedLocationId 
    ? parts.filter(p => p.location_id === selectedLocationId)
    : [];

  const getPartsCountForLocation = (locationId) => {
    return parts.filter(p => p.location_id === locationId).length;
  };

  const getPartsCountRecursive = (locationId) => {
    let count = getPartsCountForLocation(locationId);
    const children = getChildLocations(locationId);
    children.forEach(child => {
      count += getPartsCountRecursive(child.id);
    });
    return count;
  };

  return (
    <>
      <div className="space-y-4">
        {/* Summary Card */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-gray-400" />
                <CardTitle className="text-white text-base">Inventory by Location</CardTitle>
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-xs text-gray-400">Locations</p>
                  <p className="text-xl font-bold text-white">{activeLocations.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">On-Hand Parts</p>
                  <p className="text-xl font-bold text-white">{totalOnHandParts}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">Total Qty</p>
                  <p className="text-xl font-bold text-white">{totalOnHandQty}</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search parts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-900/50 border-gray-700 text-white"
              />
            </div>
          </CardContent>
        </Card>

        {/* Hierarchical Locations */}
        <div className="space-y-4">
          {parentLocations.map(parent => {
            const children = getChildLocations(parent.id);
            const directPartsCount = getPartsCountForLocation(parent.id);
            const totalCount = getPartsCountRecursive(parent.id);
            const isCollapsed = collapsedLocations[parent.id];

            return (
              <Card key={parent.id} className="bg-black/40 backdrop-blur-xl border border-red-900/30">
                <CardHeader 
                  className="border-b border-red-900/30 p-4 cursor-pointer hover:bg-gray-900/20 transition-colors"
                  style={{ 
                    borderColor: parent.color + '40',
                    backgroundColor: parent.color + '10'
                  }}
                  onClick={() => toggleArea(parent.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {(children.length > 0 || directPartsCount > 0) && (
                        isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                      <MapPin className="w-4 h-4" style={{ color: parent.color }} />
                      <CardTitle className="text-base" style={{ color: parent.color }}>
                        {parent.location_area}
                      </CardTitle>
                      {parent.qr_code_value && (
                        <Badge variant="outline" className="border-blue-500 text-blue-400 text-xs">
                          <QrCode className="w-3 h-3 mr-1" />
                          QR
                        </Badge>
                      )}
                    </div>
                    <Badge 
                      style={{ 
                        backgroundColor: parent.color + '30',
                        color: parent.color,
                        borderColor: parent.color
                      }}
                      className="border"
                    >
                      {totalCount} parts
                    </Badge>
                  </div>
                  {(parent.storage_type || parent.bin_description) && (
                    <p className="text-xs text-gray-400 mt-2">
                      {[parent.storage_type, parent.bin_description].filter(Boolean).join(' - ')}
                    </p>
                  )}
                </CardHeader>
                
                {!isCollapsed && (
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      {/* Direct parts in parent location */}
                      {directPartsCount > 0 && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLocationClick(parent.id);
                          }}
                          className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-colors ${
                            selectedLocationId === parent.id 
                              ? 'bg-red-900/30 border-red-600' 
                              : 'bg-gray-900/50 border-gray-800 hover:border-red-900/50'
                          }`}
                        >
                          <span className="text-sm text-white">
                            Direct (in {parent.location_area})
                          </span>
                          <Badge 
                            variant="outline"
                            className="text-xs border-gray-700"
                            style={{ color: parent.color }}
                          >
                            {directPartsCount}
                          </Badge>
                        </div>
                      )}

                      {/* Child locations */}
                      {children.map(child => {
                        const childPartsCount = getPartsCountForLocation(child.id);
                        
                        return (
                          <div
                            key={child.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLocationClick(child.id);
                            }}
                            className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-colors ${
                              selectedLocationId === child.id 
                                ? 'bg-red-900/30 border-red-600' 
                                : 'bg-gray-900/50 border-gray-800 hover:border-red-900/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <div 
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: child.color }}
                              />
                              <div>
                                <span className="text-sm text-white">
                                  {child.bin_description || child.location_area}
                                </span>
                                {child.storage_type && (
                                  <p className="text-xs text-gray-500">{child.storage_type}</p>
                                )}
                              </div>
                            </div>
                            <Badge 
                              variant="outline"
                              className="text-xs border-gray-700"
                              style={{ color: child.color }}
                            >
                              {childPartsCount}
                            </Badge>
                          </div>
                        );
                      })}

                      {children.length === 0 && directPartsCount === 0 && (
                        <div className="text-center py-4">
                          <p className="text-sm text-gray-500">No parts in this location</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Selected Location Parts List */}
        {selectedLocationId && (
          <Card className="bg-black/40 backdrop-blur-xl border border-red-600/50">
            <CardHeader className="border-b border-red-900/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-red-400" />
                  <CardTitle className="text-white text-base">
                    Parts in {locations.find(l => l.id === selectedLocationId)?.location_area || 'Location'}
                    {locations.find(l => l.id === selectedLocationId)?.bin_description && 
                      ` - ${locations.find(l => l.id === selectedLocationId)?.bin_description}`
                    }
                  </CardTitle>
                  <Badge variant="outline" className="border-red-600 text-red-400">
                    {selectedLocationParts.length} parts
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedLocationId(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <XIcon className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {selectedLocationParts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No parts in this location
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {selectedLocationParts.map(part => {
                    const vendor = vendors.find(v => v.id === part.vendor_id);
                    const category = categories.find(c => c.id === part.part_category_id);
                    const categoryPath = getCategoryPath(part.part_category_id, categories);
                    const make = makes.find(m => m.id === part.car_make_id);
                    const model = models.find(m => m.id === part.car_model_id);
                    const year = years.find(y => y.id === part.car_year_id);
                    
                    return (
                      <div
                        key={part.id}
                        onClick={() => setSelectedPart(part)}
                        className="p-3 bg-gray-900/50 rounded border border-gray-700 hover:border-red-900/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h5 className="text-white text-sm font-medium flex-1">
                            {part.part_name}
                          </h5>
                          <Badge 
                            style={{ backgroundColor: statusColors[part.status] }}
                            className="text-white text-xs shrink-0"
                          >
                            {part.status}
                          </Badge>
                        </div>
                        {part.vendor_part_number && (
                          <p className="text-xs text-gray-400 font-mono mb-2">
                            {part.vendor_part_number}
                          </p>
                        )}
                        {categoryPath && (
                          <p className="text-xs mb-2" style={{ color: category?.color || '#9CA3AF' }}>
                            {categoryPath}
                          </p>
                        )}
                        {(make || model || year) && (
                          <p className="text-xs text-blue-400 mb-2">
                            {[make?.name, model?.name, year?.year].filter(Boolean).join(' ')}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-500">Qty:</span>
                          <span className="text-white font-semibold">
                            {part.quantity_on_hand || 0}
                          </span>
                        </div>
                        {vendor && (
                          <p className="text-xs text-gray-500">Vendor: {vendor.vendor_name}</p>
                        )}
                        {part.global_all_builds && (
                          <Badge variant="outline" className="border-green-500 text-green-400 text-xs mt-2">
                            Global
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Unassigned Parts */}
        {unassignedParts.length > 0 && (
          <Card className="bg-black/40 backdrop-blur-xl border border-yellow-900/30">
            <CardHeader className="border-b border-yellow-900/30 p-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-yellow-400" />
                <CardTitle className="text-white text-base">Unassigned Location</CardTitle>
                <Badge variant="outline" className="border-yellow-500 text-yellow-400">
                  {filterParts(unassignedParts).length} parts
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filterParts(unassignedParts).map(part => {
                  const category = categories.find(c => c.id === part.part_category_id);
                  const categoryPath = getCategoryPath(part.part_category_id, categories);
                  
                  return (
                    <div
                      key={part.id}
                      onClick={() => setSelectedPart(part)}
                      className="p-3 bg-gray-900/50 rounded border border-gray-700 hover:border-yellow-900/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h5 className="text-white text-sm font-medium flex-1 truncate">
                          {part.part_name}
                        </h5>
                        <Badge 
                          style={{ backgroundColor: statusColors[part.status] }}
                          className="text-white text-xs shrink-0"
                        >
                          {part.status}
                        </Badge>
                      </div>
                      {part.vendor_part_number && (
                        <p className="text-xs text-gray-400 font-mono mb-2">
                          {part.vendor_part_number}
                        </p>
                      )}
                      {categoryPath && (
                        <p className="text-xs mb-2" style={{ color: category?.color || '#9CA3AF' }}>
                          {categoryPath}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Quantity:</span>
                        <span className="text-white font-semibold">
                          {part.quantity_on_hand || 0}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {partsLoading || locationsLoading ? (
          <div className="text-center py-8 text-gray-500">Loading inventory...</div>
        ) : activeLocations.length === 0 ? (
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-8 text-center">
              <MapPin className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No locations configured yet.</p>
              <p className="text-sm text-gray-600 mt-2">
                Add locations in Admin Config → Locations
              </p>
            </CardContent>
          </Card>
        ) : null}
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