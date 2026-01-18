import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ChevronLeft, ChevronRight, Image as ImageIcon, Package, MapPin } from "lucide-react";
import LocationTree from "../inventory/LocationTree";
import InventoryBreadcrumb from "../inventory/InventoryBreadcrumb";
import ImageGallery from "./ImageGallery";

const LOCATIONS_STATE_KEY = 'achtung_locations_explorer_state';

/**
 * InventoryLocations - Browse inventory by location
 * Uses InventoryItem for stock data
 * NO LONGER uses Part.location_id or Part.quantity_on_hand
 */
export default function InventoryLocations({ onPartClick }) {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [expandedLocations, setExpandedLocations] = useState(new Set());
  const [currentPath, setCurrentPath] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showLeftPane, setShowLeftPane] = useState(true);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Load state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCATIONS_STATE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.expandedLocations) {
          setExpandedLocations(new Set(state.expandedLocations));
        }
      }
    } catch (e) {}
  }, []);

  // Save state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCATIONS_STATE_KEY, JSON.stringify({
        expandedLocations: Array.from(expandedLocations),
      }));
    } catch (e) {}
  }, [expandedLocations]);

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  // Build location path when selection changes
  useEffect(() => {
    if (!selectedLocation) {
      setCurrentPath([]);
      return;
    }

    if (selectedLocation === 'unassigned') {
      setCurrentPath([{ id: 'unassigned', name: 'Unassigned Location', color: '#EAB308' }]);
      return;
    }

    const buildPath = (locId) => {
      const path = [];
      let current = locations.find(l => l.id === locId);
      
      while (current) {
        path.unshift({ id: current.id, name: current.location_area, color: current.color });
        current = locations.find(l => l.id === current.parent_id);
      }
      
      return path;
    };

    setCurrentPath(buildPath(selectedLocation));
  }, [selectedLocation, locations]);

  // Get all descendant location IDs
  const getDescendantLocationIds = (locationId) => {
    const descendants = new Set([locationId]);
    
    const addChildren = (parentId) => {
      locations
        .filter(loc => loc.parent_id === parentId)
        .forEach(child => {
          descendants.add(child.id);
          addChildren(child.id);
        });
    };
    
    addChildren(locationId);
    return Array.from(descendants);
  };

  // Filter inventory items based on selected location
  const filteredInventory = inventoryItems.filter(item => {
    const part = parts.find(p => p.id === item.part_id);
    if (!part) return false;

    // Search filter
    const matchesSearch = !searchTerm || 
      part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());

    // Location filter
    if (!selectedLocation) {
      return matchesSearch;
    }

    if (selectedLocation === 'unassigned') {
      return matchesSearch && !item.location_id;
    }

    const locationIds = getDescendantLocationIds(selectedLocation);
    const matchesLocation = item.location_id && locationIds.includes(item.location_id);

    return matchesSearch && matchesLocation;
  });

  const handleLocationSelect = (locationId) => {
    setSelectedLocation(locationId === selectedLocation ? null : locationId);
  };

  const handleBreadcrumbClick = (locationId) => {
    setSelectedLocation(locationId);
  };

  const handleClearSelection = () => {
    setSelectedLocation(null);
    setCurrentPath([]);
  };

  const handleViewLocationImages = () => {
    const location = locations.find(l => l.id === selectedLocation);
    if (location?.photos && location.photos.length > 0) {
      setGalleryImages(location.photos);
      setCurrentImageIndex(0);
      setGalleryOpen(true);
    }
  };

  const handleNavigateGallery = (direction) => {
    if (typeof direction === 'number') {
      setCurrentImageIndex(direction);
    } else if (direction === 'next') {
      setCurrentImageIndex((prev) => Math.min(prev + 1, galleryImages.length - 1));
    } else if (direction === 'prev') {
      setCurrentImageIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  const getLocationName = (locationId) => {
    if (!locationId) return 'No Location';
    const location = locations.find(l => l.id === locationId);
    if (!location) return 'Unknown';
    if (location.parent_id) {
      const parent = locations.find(l => l.id === location.parent_id);
      return parent ? `${parent.location_area} > ${location.location_area}` : location.location_area;
    }
    return location.location_area;
  };

  const selectedLocationData = selectedLocation === 'unassigned' ? null : locations.find(l => l.id === selectedLocation);
  const hasLocationImages = selectedLocationData?.photos && selectedLocationData.photos.length > 0;

  // Calculate totals
  const totalOnHand = filteredInventory.reduce((sum, i) => sum + (i.quantity_on_hand || 0), 0);
  const totalReserved = filteredInventory.reduce((sum, i) => sum + (i.quantity_reserved || 0), 0);

  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 h-auto md:h-[calc(100vh-12rem)]">
        {/* Left Pane - Location Tree */}
        <div 
          className={`transition-all duration-300 ${
            showLeftPane ? 'w-full md:w-[30%]' : 'w-0'
          } overflow-hidden`}
        >
          {showLeftPane && (
            <Card className="h-[400px] md:h-full bg-black/40 backdrop-blur-xl border border-red-900/30 flex flex-col">
              <CardContent className="p-4 flex-1 flex flex-col overflow-hidden">
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <Input
                      placeholder="Search locations..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-auto">
                  <LocationTree
                    locations={locations}
                    parts={parts}
                    inventoryItems={inventoryItems}
                    selectedLocation={selectedLocation}
                    expandedLocations={expandedLocations}
                    onLocationSelect={handleLocationSelect}
                    onToggleExpand={(locId) => {
                      const newExpanded = new Set(expandedLocations);
                      if (newExpanded.has(locId)) {
                        newExpanded.delete(locId);
                      } else {
                        newExpanded.add(locId);
                      }
                      setExpandedLocations(newExpanded);
                    }}
                    searchTerm={searchTerm}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Toggle Button */}
        <div className="flex items-start pt-0 md:pt-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowLeftPane(!showLeftPane)}
            className="bg-black/40 border border-red-900/30 hover:bg-red-950/30"
          >
            {showLeftPane ? (
              <ChevronLeft className="w-4 h-4 text-white" />
            ) : (
              <ChevronRight className="w-4 h-4 text-white" />
            )}
          </Button>
        </div>

        {/* Right Pane - Inventory Display */}
        <div className="flex-1 flex flex-col overflow-hidden w-full md:w-auto">
          {/* Breadcrumb and Location Images */}
          <div className="mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-4">
            <div className="flex-1">
              <InventoryBreadcrumb
                path={currentPath}
                onPathClick={handleBreadcrumbClick}
                onClearSelection={handleClearSelection}
              />
            </div>
            {hasLocationImages && (
              <Button
                onClick={handleViewLocationImages}
                variant="outline"
                className="border-red-900/30 hover:bg-red-950/30 gap-2"
              >
                <ImageIcon className="w-4 h-4" />
                View Location Photos ({selectedLocationData.photos.length})
              </Button>
            )}
          </div>

          {/* Summary */}
          {selectedLocation && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                <p className="text-xs text-gray-400">Items</p>
                <p className="text-xl font-bold text-white">{filteredInventory.length}</p>
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                <p className="text-xs text-gray-400">On Hand</p>
                <p className="text-xl font-bold text-green-400">{totalOnHand}</p>
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                <p className="text-xs text-gray-400">Reserved</p>
                <p className="text-xl font-bold text-yellow-400">{totalReserved}</p>
              </div>
            </div>
          )}

          {/* Inventory List */}
          <Card className="flex-1 bg-black/40 backdrop-blur-xl border border-red-900/30 overflow-hidden min-h-[400px]">
            <CardContent className="p-0 h-full overflow-auto">
              {filteredInventory.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  {selectedLocation 
                    ? (selectedLocation === 'unassigned' ? 'No unassigned inventory' : 'No inventory in this location')
                    : 'Select a location to view inventory'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                      <TableHead className="text-gray-400 text-xs">Part</TableHead>
                      <TableHead className="text-gray-400 text-xs">Location</TableHead>
                      <TableHead className="text-gray-400 text-xs text-right">On Hand</TableHead>
                      <TableHead className="text-gray-400 text-xs text-right">Reserved</TableHead>
                      <TableHead className="text-gray-400 text-xs text-right">Available</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.map(item => {
                      const part = parts.find(p => p.id === item.part_id);
                      const available = (item.quantity_on_hand || 0) - (item.quantity_reserved || 0);
                      
                      return (
                        <TableRow 
                          key={item.id}
                          className="border-b border-red-900/10 hover:bg-red-950/20 cursor-pointer"
                          onClick={() => part && onPartClick?.(part)}
                        >
                          <TableCell>
                            <div>
                              <p className="text-white text-sm font-medium">{part?.part_name || 'Unknown'}</p>
                              {part?.vendor_part_number && (
                                <p className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3 h-3 text-gray-500" />
                              <span className="text-gray-300 text-sm">{getLocationName(item.location_id)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-white font-medium">{item.quantity_on_hand || 0}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-yellow-400">{item.quantity_reserved || 0}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={available > 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                              {available}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ImageGallery
        isOpen={galleryOpen}
        images={galleryImages}
        currentIndex={currentImageIndex}
        onClose={() => setGalleryOpen(false)}
        onNavigate={handleNavigateGallery}
      />
    </>
  );
}