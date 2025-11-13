import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin, Search, Package, QrCode } from "lucide-react";
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

  const activeLocations = locations.filter(l => l.active);

  // Group locations by area
  const locationsByArea = activeLocations.reduce((acc, location) => {
    const area = location.location_area || 'Unassigned';
    if (!acc[area]) {
      acc[area] = [];
    }
    acc[area].push(location);
    return acc;
  }, {});

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

        {/* Locations by Area */}
        {Object.entries(locationsByArea).map(([area, areaLocations]) => (
          <Card key={area} className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardHeader className="border-b border-red-900/30 p-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-400" />
                <CardTitle className="text-white text-base">{area}</CardTitle>
                <Badge variant="outline" className="border-gray-700 text-gray-400">
                  {areaLocations.length} locations
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-4">
                {areaLocations.map(location => {
                  const locationParts = filterParts(getPartsForLocation(location.id));
                  const onHandParts = locationParts.filter(p => p.status === 'On-Hand');
                  
                  return (
                    <div key={location.id} className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-white font-medium">
                              {location.bin_description || location.storage_type || 'Location'}
                            </h4>
                            {location.qr_code_value && (
                              <Badge variant="outline" className="border-blue-500 text-blue-400 text-xs">
                                <QrCode className="w-3 h-3 mr-1" />
                                QR
                              </Badge>
                            )}
                          </div>
                          {location.storage_type && location.bin_description && (
                            <p className="text-xs text-gray-400">{location.storage_type}</p>
                          )}
                          {location.notes && (
                            <p className="text-xs text-gray-500 mt-1">{location.notes}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <Badge 
                            variant="outline"
                            className="border-green-500 text-green-400"
                          >
                            {onHandParts.length} parts
                          </Badge>
                        </div>
                      </div>

                      {/* Parts in this location */}
                      {locationParts.length === 0 ? (
                        <div className="text-center py-4 text-gray-600 text-sm">
                          {searchTerm ? 'No matching parts in this location' : 'No parts assigned to this location'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {locationParts.map(part => {
                            const category = categories.find(c => c.id === part.part_category_id);
                            const categoryPath = getCategoryPath(part.part_category_id, categories);
                            
                            return (
                              <div
                                key={part.id}
                                onClick={() => setSelectedPart(part)}
                                className="p-3 bg-gray-800/50 rounded border border-gray-700 hover:border-red-900/50 transition-colors cursor-pointer"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <h5 className="text-white text-sm font-medium flex-1 truncate">
                                    {part.part_name}
                                  </h5>
                                  <Badge 
                                    style={{ backgroundColor: statusColors[part.status] }}
                                    className="text-white text-xs shrink-0"
                                  >
                                    {part.status === 'On-Hand' ? 'In Stock' : part.status}
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
                                {part.global_all_builds && (
                                  <Badge 
                                    variant="outline" 
                                    className="border-green-500 text-green-400 text-xs mt-2"
                                  >
                                    Global
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}

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