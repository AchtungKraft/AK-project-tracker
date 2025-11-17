import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import LocationTree from "./LocationTree";
import InventoryBreadcrumb from "./InventoryBreadcrumb";
import PartsListView from "../parts/PartsListView";

const EXPLORER_STATE_KEY = 'achtung_inventory_explorer_state';

export default function InventoryExplorerLayout({ onPartClick }) {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [expandedLocations, setExpandedLocations] = useState(new Set());
  const [viewMode, setViewMode] = useState('list');
  const [currentPath, setCurrentPath] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showLeftPane, setShowLeftPane] = useState(true);

  // Load state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EXPLORER_STATE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.expandedLocations) {
          setExpandedLocations(new Set(state.expandedLocations));
        }
        if (state.viewMode) setViewMode(state.viewMode);
      }
    } catch (e) {}
  }, []);

  // Save state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(EXPLORER_STATE_KEY, JSON.stringify({
        expandedLocations: Array.from(expandedLocations),
        viewMode,
      }));
    } catch (e) {}
  }, [expandedLocations, viewMode]);

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const { data: allParts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  // Build location path when selection changes
  useEffect(() => {
    if (!selectedLocation) {
      setCurrentPath([]);
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

  // Filter parts based on selected location and search
  const filteredParts = allParts.filter(part => {
    // Search filter
    const matchesSearch = !searchTerm || 
      part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());

    // Location filter
    if (!selectedLocation) {
      return matchesSearch;
    }

    const locationIds = getDescendantLocationIds(selectedLocation);
    const matchesLocation = part.location_id && locationIds.includes(part.location_id);

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

  return (
    <div className="flex gap-4 h-[calc(100vh-12rem)]">
      {/* Left Pane - Location Tree */}
      <div 
        className={`transition-all duration-300 ${
          showLeftPane ? 'w-[30%]' : 'w-0'
        } overflow-hidden`}
      >
        {showLeftPane && (
          <Card className="h-full bg-black/40 backdrop-blur-xl border border-red-900/30 flex flex-col">
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
                  parts={allParts}
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
      <div className="flex items-start pt-4">
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

      {/* Right Pane - Parts Display */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Breadcrumb */}
        <div className="mb-4">
          <InventoryBreadcrumb
            path={currentPath}
            onPathClick={handleBreadcrumbClick}
            onClearSelection={handleClearSelection}
          />
        </div>

        {/* Parts List */}
        <Card className="flex-1 bg-black/40 backdrop-blur-xl border border-red-900/30 overflow-hidden">
          <CardContent className="p-4 h-full overflow-auto">
            {filteredParts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {selectedLocation ? 'No parts found in this location' : 'Select a location to view parts'}
              </div>
            ) : (
              <div>
                <div className="mb-4 text-sm text-gray-400">
                  {filteredParts.length} part{filteredParts.length !== 1 ? 's' : ''} found
                </div>
                <PartsListView
                  parts={filteredParts}
                  categories={categories}
                  selectedCategoryId={null}
                  onPartClick={onPartClick}
                  showGrouping={false}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}