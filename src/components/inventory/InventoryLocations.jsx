import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, MapPin, ChevronRight, ChevronDown, Package, LayoutGrid, List,
  FolderOpen, Folder, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import EditPartDrawer from "../parts/EditPartDrawer";
import AddInventoryModal from "./AddInventoryModal";
import OrderPartModal from "../parts/OrderPartModal";
import AddToBuildModal from "../parts/AddToBuildModal";
import AddToNeedToBuyModal from "../parts/AddToNeedToBuyModal";
import ImageGallery from "../parts/ImageGallery";
import PartActionsDropdown from "../parts/PartActionsDropdown";

const STORAGE_KEY = 'achtung_inventory_locations_state';

export default function InventoryLocations({ onPartClick }) {
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [expandedLocations, setExpandedLocations] = useState({});
  const [showEmptyLocations, setShowEmptyLocations] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  
  // Modals
  const [inventoryModalPart, setInventoryModalPart] = useState(null);
  const [orderModalPart, setOrderModalPart] = useState(null);
  const [buildModalPart, setBuildModalPart] = useState(null);
  const [needToBuyModalPart, setNeedToBuyModalPart] = useState(null);
  
  // Image gallery
  const [galleryState, setGalleryState] = useState({
    open: false,
    images: [],
    currentIndex: 0,
  });

  // Load saved state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        setSelectedLocationId(state.selectedLocationId ?? null);
        setExpandedLocations(state.expandedLocations || {});
        setShowEmptyLocations(state.showEmptyLocations || false);
        setViewMode(state.viewMode || 'list');
      }
    } catch (e) {}
  }, []);

  // Save state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedLocationId,
        expandedLocations,
        showEmptyLocations,
        viewMode,
      }));
    } catch (e) {}
  }, [selectedLocationId, expandedLocations, showEmptyLocations, viewMode]);

  // Queries
  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list(),
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ['partProjectRequirements'],
    queryFn: () => base44.entities.PartProjectRequirement.list(),
  });

  // Calculate inventory stats for a part at a specific location (or all locations)
  const getInventoryStats = (partId, locationId = null) => {
    const items = locationId 
      ? inventoryItems.filter(i => i.part_id === partId && i.location_id === locationId)
      : inventoryItems.filter(i => i.part_id === partId);
    
    const onHand = items.reduce((sum, i) => sum + (i.quantity_on_hand || 0), 0);
    const reserved = items.reduce((sum, i) => sum + (i.quantity_reserved || 0), 0);
    
    const partLineItems = lineItems.filter(li => li.part_id === partId);
    const onOrder = partLineItems.reduce((sum, li) => 
      sum + Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0)), 0);
    
    const partReqs = requirements.filter(r => r.part_id === partId);
    const need = partReqs.reduce((sum, r) => {
      const stillNeeded = (r.qty_needed || 0) - (r.qty_installed || 0) - (r.qty_allocated || 0);
      return sum + Math.max(0, stillNeeded);
    }, 0);
    
    return { onHand, available: onHand - reserved, reserved, need, onOrder };
  };

  // Calculate part counts for each location
  const locationPartCounts = useMemo(() => {
    const counts = {};
    
    // Get all descendant location IDs for a location
    const getDescendants = (locationId) => {
      const descendants = [locationId];
      locations
        .filter(loc => loc.parent_id === locationId)
        .forEach(child => {
          descendants.push(...getDescendants(child.id));
        });
      return descendants;
    };

    // Count unique parts with available inventory > 0 at each location
    locations.forEach(loc => {
      const locationIds = getDescendants(loc.id);
      const partsAtLocation = new Set();
      
      inventoryItems.forEach(item => {
        if (locationIds.includes(item.location_id)) {
          const available = (item.quantity_on_hand || 0) - (item.quantity_reserved || 0);
          if (available > 0) {
            partsAtLocation.add(item.part_id);
          }
        }
      });
      
      counts[loc.id] = partsAtLocation.size;
    });

    // Count unassigned
    const unassignedParts = new Set();
    inventoryItems.forEach(item => {
      if (!item.location_id) {
        const available = (item.quantity_on_hand || 0) - (item.quantity_reserved || 0);
        if (available > 0) {
          unassignedParts.add(item.part_id);
        }
      }
    });
    counts['unassigned'] = unassignedParts.size;

    return counts;
  }, [locations, inventoryItems]);

  // Get parts for selected location
  const partsAtSelectedLocation = useMemo(() => {
    if (selectedLocationId === null) {
      // "All Locations" - show all parts with inventory
      const partIds = new Set(inventoryItems.map(i => i.part_id));
      return parts.filter(p => partIds.has(p.id));
    }

    const getDescendants = (locationId) => {
      const descendants = [locationId];
      locations
        .filter(loc => loc.parent_id === locationId)
        .forEach(child => {
          descendants.push(...getDescendants(child.id));
        });
      return descendants;
    };

    if (selectedLocationId === 'unassigned') {
      const partIds = new Set(
        inventoryItems
          .filter(i => !i.location_id)
          .map(i => i.part_id)
      );
      return parts.filter(p => partIds.has(p.id));
    }

    const locationIds = getDescendants(selectedLocationId);
    const partIds = new Set(
      inventoryItems
        .filter(i => locationIds.includes(i.location_id))
        .map(i => i.part_id)
    );
    return parts.filter(p => partIds.has(p.id));
  }, [selectedLocationId, inventoryItems, parts, locations]);

  // Filter by search
  const filteredParts = useMemo(() => {
    if (!searchTerm) return partsAtSelectedLocation;
    
    const term = searchTerm.toLowerCase();
    return partsAtSelectedLocation.filter(part => 
      part.part_name?.toLowerCase().includes(term) ||
      part.vendor_part_number?.toLowerCase().includes(term)
    );
  }, [partsAtSelectedLocation, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredParts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedParts = filteredParts.slice(startIndex, startIndex + itemsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedLocationId, searchTerm]);

  // Handle location selection
  const handleLocationSelect = (locationId) => {
    setSelectedLocationId(locationId);
    
    // Auto-expand ancestors
    if (locationId && locationId !== 'unassigned') {
      const newExpanded = { ...expandedLocations };
      let currentId = locationId;
      
      while (currentId) {
        newExpanded[currentId] = true;
        const loc = locations.find(l => l.id === currentId);
        currentId = loc?.parent_id;
      }
      
      setExpandedLocations(newExpanded);
    }
  };

  // Handle toggle showing empty
  const handleToggleEmpty = (checked) => {
    setShowEmptyLocations(checked);
    
    // If current selection becomes hidden, reset to All Locations
    if (!checked && selectedLocationId && selectedLocationId !== 'unassigned') {
      const count = locationPartCounts[selectedLocationId] || 0;
      if (count === 0) {
        setSelectedLocationId(null);
      }
    }
  };

  // Gallery handlers
  const openGallery = (images, index = 0) => {
    setGalleryState({ open: true, images, currentIndex: index });
  };

  const closeGallery = () => {
    setGalleryState(prev => ({ ...prev, open: false }));
  };

  const navigateGallery = (direction) => {
    setGalleryState(prev => {
      if (typeof direction === 'number') {
        return { ...prev, currentIndex: direction };
      }
      const newIndex = direction === 'next' 
        ? Math.min(prev.currentIndex + 1, prev.images.length - 1)
        : Math.max(prev.currentIndex - 1, 0);
      return { ...prev, currentIndex: newIndex };
    });
  };

  // Get selected location name for header
  const getSelectedLocationName = () => {
    if (selectedLocationId === null) return 'All Locations';
    if (selectedLocationId === 'unassigned') return 'Unassigned';
    const loc = locations.find(l => l.id === selectedLocationId);
    if (!loc) return 'Unknown';
    if (loc.parent_id) {
      const parent = locations.find(l => l.id === loc.parent_id);
      return parent ? `${parent.location_area} > ${loc.location_area}` : loc.location_area;
    }
    return loc.location_area;
  };

  // Render location tree node
  const renderLocationNode = (location, level = 0) => {
    const children = locations.filter(l => l.parent_id === location.id && l.active);
    const hasChildren = children.length > 0;
    const isExpanded = expandedLocations[location.id];
    const isSelected = selectedLocationId === location.id;
    const partCount = locationPartCounts[location.id] || 0;
    const isEmpty = partCount === 0;

    // Hide empty locations if toggle is off
    if (isEmpty && !showEmptyLocations) return null;

    return (
      <div key={location.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group",
            isSelected ? "bg-red-950/40 text-red-400" : "hover:bg-gray-800/50 text-gray-300",
            level > 0 && "border-l-2 border-gray-800",
            isEmpty && "opacity-50"
          )}
          style={{
            paddingLeft: `${(level * 16) + 12}px`,
            borderLeftColor: level > 0 ? (location.color || '#6B7280') + '40' : 'transparent'
          }}
          onClick={() => handleLocationSelect(location.id)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedLocations(prev => ({ ...prev, [location.id]: !prev[location.id] }));
              }}
              className="shrink-0 hover:text-red-400 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}
          
          <MapPin 
            className="w-4 h-4 shrink-0" 
            style={{ color: location.color || '#8B5CF6' }}
          />

          <span 
            className={cn(
              "flex-1 text-sm font-medium truncate",
              isSelected && "font-semibold"
            )}
            style={{ color: isSelected ? (location.color || '#EF4444') : undefined }}
          >
            {location.location_area}
          </span>

          {partCount > 0 && (
            <span 
              className={cn(
                "shrink-0 text-xs px-2 py-0.5 rounded-full",
                isSelected ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400"
              )}
            >
              {partCount}
            </span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {children
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
              .filter(child => showEmptyLocations || (locationPartCounts[child.id] || 0) > 0)
              .map(child => renderLocationNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Part Row component
  const PartRow = ({ part }) => {
    const images = part.photos || [];
    const featuredPhoto = part.featured_photo || images[0];
    const stats = selectedLocationId && selectedLocationId !== 'unassigned'
      ? getInventoryStats(part.id, selectedLocationId)
      : getInventoryStats(part.id);
    const hasMultipleImages = images.length > 1;
    const vendor = vendors.find(v => v.id === part.default_vendor_id);
    const isLowStock = stats.available <= (part.reorder_point || 0) && stats.available > 0;

    return (
      <div
        onClick={() => onPartClick?.(part)}
        className="flex flex-col md:flex-row md:items-center gap-3 p-3 bg-gray-900/30 rounded-lg border border-gray-800 hover:border-red-900/50 transition-all cursor-pointer group min-h-[88px]"
      >
        <div className="flex items-start gap-3 w-full md:w-auto md:flex-1">
          {/* Thumbnail */}
          <div 
            className="relative w-16 h-16 md:w-12 md:h-12 flex-shrink-0 bg-gray-800 rounded overflow-hidden cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (images.length > 0) openGallery(images, 0);
            }}
          >
            {featuredPhoto ? (
              <>
                <img
                  src={featuredPhoto}
                  alt={part.part_name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {hasMultipleImages && (
                  <div className="absolute bottom-0 right-0 bg-black/80 text-white text-xs px-1 rounded-tl">
                    {images.length}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-6 h-6 text-gray-600" />
              </div>
            )}
          </div>

          {/* Part Info */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-start gap-2">
              <h4 className="text-white text-sm font-medium line-clamp-2 flex-1 group-hover:text-red-400 transition-colors">
                {part.part_name}
              </h4>
              {isLowStock && (
                <Badge variant="outline" className="border-yellow-500 text-yellow-400 text-xs shrink-0">
                  Low Stock
                </Badge>
              )}
            </div>
            
            {part.vendor_part_number && (
              <div className="text-xs text-gray-400 font-mono truncate">
                {part.vendor_part_number}
              </div>
            )}

            {vendor && (
              <div className="text-xs text-gray-500 truncate">
                {vendor.vendor_name}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-around md:justify-end md:gap-4 text-xs shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-800">
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">Stock</div>
            <div className="text-white font-semibold">{stats.onHand}</div>
          </div>
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">Available</div>
            <div className={cn(
              "font-semibold",
              stats.available > 0 ? "text-green-400" : "text-red-400"
            )}>
              {stats.available}
            </div>
          </div>
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">Reserved</div>
            <div className={cn(
              "font-semibold",
              stats.reserved > 0 ? "text-yellow-400" : "text-gray-500"
            )}>
              {stats.reserved}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="hidden md:block ml-2">
          <PartActionsDropdown
            part={part}
            onAddInventory={setInventoryModalPart}
            onOrderPart={setOrderModalPart}
            onAddToBuild={setBuildModalPart}
            onAddToNeedToBuy={setNeedToBuyModalPart}
            onViewDetails={onPartClick}
          />
        </div>
      </div>
    );
  };

  // Part Card component
  const PartCard = ({ part }) => {
    const images = part.photos || [];
    const featuredPhoto = part.featured_photo || images[0];
    const stats = selectedLocationId && selectedLocationId !== 'unassigned'
      ? getInventoryStats(part.id, selectedLocationId)
      : getInventoryStats(part.id);
    const hasMultipleImages = images.length > 1;
    const vendor = vendors.find(v => v.id === part.default_vendor_id);
    const isLowStock = stats.available <= (part.reorder_point || 0) && stats.available > 0;

    return (
      <div
        onClick={() => onPartClick?.(part)}
        className="bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/50 transition-all cursor-pointer group"
      >
        {/* Image */}
        {featuredPhoto ? (
          <div 
            className="relative h-32 bg-gray-800 rounded-t-lg flex items-center justify-center overflow-hidden"
            onClick={(e) => {
              e.stopPropagation();
              openGallery(images, 0);
            }}
          >
            <img
              src={featuredPhoto}
              alt={part.part_name}
              className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform"
              loading="lazy"
            />
            {hasMultipleImages && (
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded-full">
                {images.length}
              </div>
            )}
          </div>
        ) : (
          <div className="h-32 bg-gray-800 rounded-t-lg flex items-center justify-center">
            <Package className="w-12 h-12 text-gray-600" />
          </div>
        )}

        <div className="p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="text-white text-sm font-semibold line-clamp-2 flex-1 group-hover:text-red-400 transition-colors">
              {part.part_name}
            </h4>
            {isLowStock && (
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
            )}
          </div>

          {part.vendor_part_number && (
            <p className="text-xs text-gray-400 font-mono mb-2 truncate">
              {part.vendor_part_number}
            </p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-1 pt-2 border-t border-gray-800">
            <div className="text-center">
              <p className="text-xs text-gray-500">Stock</p>
              <p className="text-sm text-white font-semibold">{stats.onHand}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Available</p>
              <p className={`text-sm font-semibold ${stats.available > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.available}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Reserved</p>
              <p className={`text-sm font-semibold ${stats.reserved > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                {stats.reserved}
              </p>
            </div>
          </div>

          {/* Vendor & Actions */}
          <div className="flex items-center justify-between text-xs mt-2">
            {vendor ? (
              <span className="text-gray-400 truncate max-w-[100px]">{vendor.vendor_name}</span>
            ) : (
              <div />
            )}
            <PartActionsDropdown
              part={part}
              onAddInventory={setInventoryModalPart}
              onOrderPart={setOrderModalPart}
              onAddToBuild={setBuildModalPart}
              onAddToNeedToBuy={setNeedToBuyModalPart}
              onViewDetails={onPartClick}
            />
          </div>
        </div>
      </div>
    );
  };

  const rootLocations = locations
    .filter(l => !l.parent_id && l.active)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const unassignedCount = locationPartCounts['unassigned'] || 0;

  return (
    <>
      <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30 md:h-[calc(100vh-8rem)] md:overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
          <div>
            <h2 className="text-lg font-bold text-white">Inventory by Location</h2>
            <p className="text-xs text-gray-400">
              {filteredParts.length} parts at {getSelectedLocationName()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-black/40 border border-gray-700 rounded-lg p-1">
              <Button
                size="sm"
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                onClick={() => setViewMode('list')}
                className={cn(
                  "h-7 px-2",
                  viewMode === 'list' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                )}
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                onClick={() => setViewMode('cards')}
                className={cn(
                  "h-7 px-2",
                  viewMode === 'cards' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                )}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Split Layout */}
        <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
          {/* Left Pane - Location Tree */}
          <div className="w-full md:w-[30%] lg:w-[25%] flex flex-col border-b md:border-b-0 md:border-r border-red-900/30 bg-black/20 max-h-[40vh] md:max-h-none">
            {/* Search */}
            <div className="p-3 border-b border-red-900/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-900/50 border-gray-700 text-white text-sm"
                />
              </div>
            </div>

            {/* Location Tree */}
            <div className="flex-1 overflow-y-auto py-2">
              {/* All Locations */}
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                  selectedLocationId === null ? "bg-red-950/40 text-red-400" : "hover:bg-gray-800/50 text-gray-300"
                )}
                onClick={() => setSelectedLocationId(null)}
              >
                <div className="w-4" />
                <Package className="w-4 h-4 text-blue-400" />
                <span className={cn(
                  "flex-1 text-sm font-medium",
                  selectedLocationId === null && "font-semibold text-blue-400"
                )}>
                  All Locations
                </span>
                <span className={cn(
                  "shrink-0 text-xs px-2 py-0.5 rounded-full",
                  selectedLocationId === null ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400"
                )}>
                  {parts.filter(p => inventoryItems.some(i => i.part_id === p.id)).length}
                </span>
              </div>

              {/* Unassigned */}
              {(showEmptyLocations || unassignedCount > 0) && (
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                    selectedLocationId === 'unassigned' ? "bg-red-950/40 text-yellow-400" : "hover:bg-gray-800/50 text-gray-300",
                    unassignedCount === 0 && "opacity-50"
                  )}
                  onClick={() => setSelectedLocationId('unassigned')}
                >
                  <div className="w-4" />
                  <MapPin className="w-4 h-4 text-yellow-500" />
                  <span className={cn(
                    "flex-1 text-sm font-medium",
                    selectedLocationId === 'unassigned' && "font-semibold"
                  )}>
                    Unassigned
                  </span>
                  {unassignedCount > 0 && (
                    <span className={cn(
                      "shrink-0 text-xs px-2 py-0.5 rounded-full",
                      selectedLocationId === 'unassigned' ? "bg-yellow-600 text-white" : "bg-yellow-900/50 text-yellow-300"
                    )}>
                      {unassignedCount}
                    </span>
                  )}
                </div>
              )}

              {/* Location Hierarchy */}
              {rootLocations.map(location => renderLocationNode(location, 0))}
            </div>

            {/* Controls */}
            <div className="p-3 border-t border-red-900/20">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showEmptyLocations}
                  onChange={(e) => handleToggleEmpty(e.target.checked)}
                  className="rounded border-gray-700 bg-gray-900 text-red-600 focus:ring-red-600"
                />
                Show empty locations
              </label>
            </div>
          </div>

          {/* Right Pane - Parts Display */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Parts Display */}
            <div className="flex-1 p-4 overflow-y-auto">
              {filteredParts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Package className="w-16 h-16 text-gray-600 mb-4" />
                  <h3 className="text-lg font-medium text-gray-400 mb-2">
                    No parts found
                  </h3>
                  <p className="text-sm text-gray-600">
                    {selectedLocationId 
                      ? 'No parts stored at this location' 
                      : 'No inventory items found'}
                  </p>
                </div>
              ) : viewMode === 'list' ? (
                <div className="space-y-2">
                  {paginatedParts.map(part => (
                    <PartRow key={part.id} part={part} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                  {paginatedParts.map(part => (
                    <PartCard key={part.id} part={part} />
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-red-900/20 bg-gray-900/30 p-3 flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredParts.length)} of {filteredParts.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-3 text-xs"
                  >
                    Previous
                  </Button>
                  <div className="text-xs text-gray-400">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 px-3 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {inventoryModalPart && (
        <AddInventoryModal 
          onClose={() => setInventoryModalPart(null)} 
          preselectedPartId={inventoryModalPart.id}
        />
      )}

      {orderModalPart && (
        <OrderPartModal 
          part={orderModalPart}
          onClose={() => setOrderModalPart(null)} 
        />
      )}

      {buildModalPart && (
        <AddToBuildModal 
          part={buildModalPart}
          onClose={() => setBuildModalPart(null)} 
        />
      )}

      {needToBuyModalPart && (
        <AddToNeedToBuyModal 
          part={needToBuyModalPart}
          onClose={() => setNeedToBuyModalPart(null)} 
        />
      )}

      <ImageGallery
        isOpen={galleryState.open}
        images={galleryState.images}
        currentIndex={galleryState.currentIndex}
        onClose={closeGallery}
        onNavigate={navigateGallery}
      />
    </>
  );
}