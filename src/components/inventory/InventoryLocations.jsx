import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, MapPin, ChevronRight, ChevronDown, Package, LayoutGrid, List,
  FolderOpen, Folder, AlertTriangle, Wrench, Star, BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig, buildLocationPathString } from "./locationTypeConfig";
import { renderQRSVGString } from "./QRCodeSVG";
import LocationDetailPanel from "./LocationDetailPanel";
import PartModal from "../parts/PartModal";
import AddInventoryModal from "./AddInventoryModal";
import OrderPartModal from "../parts/OrderPartModal";
import AddToBuildModal from "../parts/AddToBuildModal";
import AddToNeedToBuyModal from "../parts/AddToNeedToBuyModal";
import ImageGallery from "../parts/ImageGallery";
import PartActionsDropdown from "../parts/PartActionsDropdown";
import InventoryLocationEditor from "./InventoryLocationEditor";
import BuildExportActions from "./BuildExportActions";
import useLocationFavorites from "./useLocationFavorites";
import LocationFavoritesBar from "./LocationFavoritesBar";
import StorageDashboard from "./StorageDashboard";

const STORAGE_KEY = 'achtung_inventory_locations_state';

export default function InventoryLocations({ onPartClick, urlLocationId }) {
  // URL-based deep link takes priority, then localStorage fallback
  const [selectedLocationId, setSelectedLocationIdRaw] = useState(() => {
    if (urlLocationId) return urlLocationId;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).selectedLocationId ?? null;
    } catch (e) {}
    return null;
  });
  const [expandedLocations, setExpandedLocations] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).expandedLocations || {};
    } catch (e) {}
    return {};
  });
  const [showEmptyLocations, setShowEmptyLocations] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).showEmptyLocations || false;
    } catch (e) {}
    return false;
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).viewMode || 'list';
    } catch (e) {}
    return 'list';
  });
  const [selectedBuildId, setSelectedBuildId] = useState(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const { favorites, recents, toggleFavorite, isFavorite, addRecent } = useLocationFavorites();

  // Wrap setSelectedLocationId to also update URL
  const setSelectedLocationId = useCallback((id) => {
    setSelectedLocationIdRaw(id);
    // Update URL search param without full navigation
    const url = new URL(window.location);
    if (id && id !== 'unassigned') {
      url.searchParams.set('location', id);
    } else if (id === 'unassigned') {
      url.searchParams.set('location', 'unassigned');
    } else {
      url.searchParams.delete('location');
    }
    // Ensure locations tab is set
    url.searchParams.set('tab', 'locations');
    window.history.replaceState({}, '', url);
  }, []);

  // Sync from URL when urlLocationId prop changes
  useEffect(() => {
    if (urlLocationId !== undefined && urlLocationId !== selectedLocationId) {
      setSelectedLocationIdRaw(urlLocationId);
    }
  }, [urlLocationId]);

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

  // Save preferences to localStorage (not selection — that's URL-driven)
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

  // Queries - PERF FIX: Add caching to prevent refetch storms
  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
    staleTime: 60000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
    staleTime: 30000,  // 30s - inventory changes more frequently
    gcTime: 120000,
    refetchOnWindowFocus: false,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
    staleTime: 60000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
  });

  // PERF FIX: Limit to recent line items - full history rarely needed for display
  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list('-created_date', 500),
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
  });

  // PHASE 14E: Removed partProjectRequirements and partBuildAssignments queries
  // InventoryItem is the SOLE source of truth for stock totals
  // Use commitments query instead for reserved stock display
  // PERF FIX: Limit to 200 most recent active commitments
  const { data: commitments = [] } = useQuery({
    queryKey: ['partCommitments'],
    queryFn: () => base44.entities.PartCommitment.filter({ 
      commitment_status: { $nin: ['cancelled', 'closed'] }
    }, '-created_date', 200),
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
  });

  // PHASE 14E: Get builds/projects that have reserved inventory (from commitments only)
  const buildsWithAllocatedParts = useMemo(() => {
    // Find projects with active commitments that have reserved_from_stock > 0
    const buildIds = new Set();
    commitments.forEach(c => {
      if ((c.reserved_from_stock || 0) > 0) {
        buildIds.add(c.project_id);
      }
    });

    return projects
      .filter(p => buildIds.has(p.id))
      .sort((a, b) => {
        // Sort by most recently updated
        const dateA = new Date(a.updated_date || a.created_date || 0);
        const dateB = new Date(b.updated_date || b.created_date || 0);
        return dateB - dateA;
      });
  }, [commitments, projects]);

  // PHASE 14E: Get parts allocated to selected build (from commitments only)
  const partsAllocatedToBuild = useMemo(() => {
    if (!selectedBuildId) return null;

    const allocatedPartIds = new Set();
    
    // From PartCommitment (canonical source)
    commitments.forEach(c => {
      if (c.project_id === selectedBuildId && (c.reserved_from_stock || 0) > 0) {
        allocatedPartIds.add(c.part_id);
      }
    });

    return allocatedPartIds;
  }, [selectedBuildId, commitments]);

  // PHASE 14E: Calculate inventory stats ONLY from InventoryItem.quantity_on_hand
  // InventoryItem is the SOLE source of truth for location-based stock
  const getInventoryStats = (partId, locationId = null) => {
    const items = locationId 
      ? inventoryItems.filter(i => i.part_id === partId && i.location_id === locationId)
      : inventoryItems.filter(i => i.part_id === partId);
    
    // CANONICAL: Sum from InventoryItem records only
    const onHand = items.reduce((sum, i) => sum + (i.quantity_on_hand || 0), 0);
    const reserved = items.reduce((sum, i) => sum + (i.quantity_reserved || 0), 0);
    
    const partLineItems = lineItems.filter(li => li.part_id === partId);
    const onOrder = partLineItems.reduce((sum, li) => 
      sum + Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0)), 0);
    
    // PHASE 14E: Use commitments for need calculation (not legacy requirements)
    const partCommitments = commitments.filter(c => c.part_id === partId);
    const need = partCommitments.reduce((sum, c) => {
      const required = c.required_total ?? 0;
      const installed = c.qty_installed ?? 0;
      const stillNeeded = Math.max(0, required - installed);
      return sum + stillNeeded;
    }, 0);
    
    return { onHand, available: onHand - reserved, reserved, need, onOrder };
  };

  // Calculate part counts for each location
  // IMPORTANT: Count ALL parts with physical inventory (quantity_on_hand > 0), 
  // regardless of reservation status. Reserved parts still physically exist at the location.
  // When build filter is active, only count parts allocated to that build.
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

    // Count unique parts with ANY physical inventory at each location (not just available)
    locations.forEach(loc => {
      const locationIds = getDescendants(loc.id);
      const partsAtLocation = new Set();
      
      inventoryItems.forEach(item => {
        if (locationIds.includes(item.location_id)) {
          // Count if there's any physical stock, regardless of reservation
          if ((item.quantity_on_hand || 0) > 0) {
            // If build filter active, only count parts allocated to that build
            if (partsAllocatedToBuild) {
              if (partsAllocatedToBuild.has(item.part_id)) {
                partsAtLocation.add(item.part_id);
              }
            } else {
              partsAtLocation.add(item.part_id);
            }
          }
        }
      });
      
      counts[loc.id] = partsAtLocation.size;
    });

    // Count unassigned - parts with physical inventory but no location
    const unassignedParts = new Set();
    inventoryItems.forEach(item => {
      if (!item.location_id) {
        if ((item.quantity_on_hand || 0) > 0) {
          if (partsAllocatedToBuild) {
            if (partsAllocatedToBuild.has(item.part_id)) {
              unassignedParts.add(item.part_id);
            }
          } else {
            unassignedParts.add(item.part_id);
          }
        }
      }
    });
    counts['unassigned'] = unassignedParts.size;

    return counts;
  }, [locations, inventoryItems, partsAllocatedToBuild]);

  // Helper to get all descendant location IDs
  const getDescendants = (locationId) => {
    const descendants = [locationId];
    locations
      .filter(loc => loc.parent_id === locationId)
      .forEach(child => {
        descendants.push(...getDescendants(child.id));
      });
    return descendants;
  };

  // Get parts for selected location - include ALL parts with physical inventory (quantity_on_hand > 0)
  // When build filter is active, only show parts allocated to that build.
  const partsAtSelectedLocation = useMemo(() => {
    // Filter to only inventory items with physical stock
    let itemsWithStock = inventoryItems.filter(i => (i.quantity_on_hand || 0) > 0);

    // If build filter active, further filter to only parts allocated to that build
    if (partsAllocatedToBuild) {
      itemsWithStock = itemsWithStock.filter(i => partsAllocatedToBuild.has(i.part_id));
    }

    if (selectedLocationId === null) {
      // "All Locations" - show all parts with any physical inventory
      const partIds = new Set(itemsWithStock.map(i => i.part_id));
      return parts.filter(p => partIds.has(p.id));
    }

    if (selectedLocationId === 'unassigned') {
      const partIds = new Set(
        itemsWithStock
          .filter(i => !i.location_id)
          .map(i => i.part_id)
      );
      return parts.filter(p => partIds.has(p.id));
    }

    const locationIds = getDescendants(selectedLocationId);
    const partIds = new Set(
      itemsWithStock
        .filter(i => locationIds.includes(i.location_id))
        .map(i => i.part_id)
    );
    return parts.filter(p => partIds.has(p.id));
  }, [selectedLocationId, inventoryItems, parts, locations, partsAllocatedToBuild]);

  // Location search — match and rank results by relevance
  const locationSearchResults = useMemo(() => {
    if (!searchTerm) return null;
    const trimmed = searchTerm.trim();
    if (!trimmed) return null;
    const term = trimmed.toLowerCase();
    const isShort = term.length < 2;

    const scored = [];
    locations.forEach(loc => {
      if (!loc.active && loc.active !== undefined) return;
      let score = 0;

      if (isShort) {
        if (loc.short_code?.toLowerCase() === term) score = 100;
        else if (loc.qr_code_value?.toLowerCase().startsWith(term)) score = 90;
        else return;
      } else {
        // Priority ranking: exact > starts_with > contains
        const name = loc.location_area?.toLowerCase() || '';
        const code = loc.short_code?.toLowerCase() || '';
        const qr = loc.qr_code_value?.toLowerCase() || '';

        if (code === term || qr === term) score = 100;
        else if (name === term) score = 95;
        else if (code.startsWith(term) || qr.startsWith(term)) score = 80;
        else if (name.startsWith(term)) score = 75;
        else if (code.includes(term) || name.includes(term)) score = 60;
        else if (qr.includes(term)) score = 50;
        else {
          const tc = getLocationTypeConfig(loc.location_type);
          const proj = loc.project_id ? projects.find(p => p.id === loc.project_id) : null;
          if (tc.label.toLowerCase().includes(term)) score = 30;
          else if (loc.bin_description?.toLowerCase().includes(term)) score = 25;
          else if (proj && (proj.name?.toLowerCase().includes(term) || proj.client_name?.toLowerCase().includes(term))) score = 20;
          else if (loc.description?.toLowerCase().includes(term) || loc.notes?.toLowerCase().includes(term)) score = 10;
        }
      }

      if (score > 0) scored.push({ loc, score });
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(s => s.loc);
  }, [searchTerm, locations, projects]);

  // Filter by search
  const filteredParts = useMemo(() => {
    if (!searchTerm) return partsAtSelectedLocation;
    
    const term = searchTerm.toLowerCase();
    return partsAtSelectedLocation.filter(part => 
      part.part_name?.toLowerCase().includes(term) ||
      part.vendor_part_number?.toLowerCase().includes(term)
    );
  }, [partsAtSelectedLocation, searchTerm]);

  // Group parts by location hierarchy for display
  const groupedParts = useMemo(() => {
    if (selectedLocationId === 'unassigned') {
      // Single group for unassigned
      return [{
        locationId: 'unassigned',
        locationName: 'Unassigned',
        color: '#EAB308',
        subLocations: [{
          locationId: 'unassigned',
          locationName: null,
          parts: filteredParts
        }]
      }];
    }

    // Build a map of part -> locations (with quantities)
    const partLocationMap = {};
    inventoryItems.forEach(item => {
      if ((item.quantity_on_hand || 0) > 0) {
        if (!partLocationMap[item.part_id]) {
          partLocationMap[item.part_id] = [];
        }
        partLocationMap[item.part_id].push({
          locationId: item.location_id,
          onHand: item.quantity_on_hand || 0,
          reserved: item.quantity_reserved || 0
        });
      }
    });

    // Get relevant location IDs based on selection
    let relevantLocationIds;
    if (selectedLocationId === null) {
      // All locations
      relevantLocationIds = new Set(locations.map(l => l.id));
      relevantLocationIds.add(null); // Include unassigned
    } else {
      relevantLocationIds = new Set(getDescendants(selectedLocationId));
    }

    // Group parts by their actual storage locations
    const locationGroups = {};
    
    filteredParts.forEach(part => {
      const partLocations = partLocationMap[part.id] || [];
      
      partLocations.forEach(pl => {
        if (!relevantLocationIds.has(pl.locationId)) return;
        
        const loc = locations.find(l => l.id === pl.locationId);
        let parentLoc = null;
        let subLoc = null;
        
        if (!loc) {
          // Unassigned
          parentLoc = { id: 'unassigned', location_area: 'Unassigned', color: '#EAB308' };
        } else if (loc.parent_id) {
          parentLoc = locations.find(l => l.id === loc.parent_id) || loc;
          subLoc = loc;
        } else {
          parentLoc = loc;
        }
        
        const parentKey = parentLoc.id;
        if (!locationGroups[parentKey]) {
          locationGroups[parentKey] = {
            locationId: parentLoc.id,
            locationName: parentLoc.location_area,
            color: parentLoc.color || '#6B7280',
            sortOrder: parentLoc.sort_order || 0,
            subLocations: {}
          };
        }
        
        const subKey = subLoc ? subLoc.id : '_direct';
        if (!locationGroups[parentKey].subLocations[subKey]) {
          locationGroups[parentKey].subLocations[subKey] = {
            locationId: subLoc?.id || null,
            locationName: subLoc?.location_area || null,
            color: subLoc?.color || parentLoc.color || '#6B7280',
            sortOrder: subLoc?.sort_order || 0,
            parts: []
          };
        }
        
        // Avoid duplicates
        if (!locationGroups[parentKey].subLocations[subKey].parts.find(p => p.id === part.id)) {
          locationGroups[parentKey].subLocations[subKey].parts.push({
            ...part,
            _locationQty: pl.onHand,
            _locationReserved: pl.reserved
          });
        }
      });
    });

    // Convert to sorted array
    return Object.values(locationGroups)
      .sort((a, b) => {
        if (a.locationId === 'unassigned') return 1;
        if (b.locationId === 'unassigned') return -1;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      })
      .map(group => ({
        ...group,
        subLocations: Object.values(group.subLocations)
          .sort((a, b) => {
            if (!a.locationName) return -1;
            if (!b.locationName) return 1;
            return (a.sortOrder || 0) - (b.sortOrder || 0);
          })
      }));
  }, [filteredParts, inventoryItems, locations, selectedLocationId]);

  // Total parts count for display (grouping handles pagination differently)
  const totalPartsCount = filteredParts.length;



  // Handle location selection
  const handleLocationSelect = (locationId) => {
    setSelectedLocationId(locationId);
    setShowDashboard(false);
    addRecent(locationId);
    
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

  // Handle dashboard zone click
  const handleDashboardZone = (zoneKey, types) => {
    if (zoneKey === 'unassigned') {
      setSelectedLocationId('unassigned');
      setShowDashboard(false);
      return;
    }
    if (zoneKey === 'empty') {
      setShowEmptyLocations(true);
      setSelectedLocationId(null);
      setShowDashboard(false);
      return;
    }
    // Select first location of matching type
    const matching = locations.find(l => types.includes(l.location_type) && l.active !== false);
    if (matching) {
      handleLocationSelect(matching.id);
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
          
          {(() => {
            const tc = getLocationTypeConfig(location.location_type);
            const TIcon = tc.icon;
            return <TIcon className="w-4 h-4 shrink-0" style={{ color: location.color || tc.color }} />;
          })()}

          <span 
            className={cn(
              "flex-1 text-sm font-medium truncate",
              isSelected && "font-semibold"
            )}
            style={{ color: isSelected ? (location.color || '#EF4444') : undefined }}
            title={[location.location_area, location.short_code && `[${location.short_code}]`].filter(Boolean).join(' ')}
          >
            {location.location_area}
            {location.short_code && (
              <span className="text-gray-500 text-[10px] font-mono ml-1">[{location.short_code}]</span>
            )}
          </span>

          {/* Favorite star — always visible on touch */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFavorite(location.id); }}
            className={cn(
              "shrink-0 p-0.5 transition-colors",
              isFavorite(location.id) ? "text-yellow-500" : "text-gray-700 hover:text-yellow-600 md:opacity-0 md:group-hover:opacity-100"
            )}
          >
            <Star className={cn("w-3 h-3", isFavorite(location.id) && "fill-yellow-500")} />
          </button>

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

  // Get inventory item ID for a part at a specific location
  const getInventoryItemId = (partId, locationId) => {
    const item = inventoryItems.find(i => 
      i.part_id === partId && 
      (locationId === 'unassigned' ? !i.location_id : i.location_id === locationId)
    );
    return item?.id;
  };

  // Part Row component - now accepts location-specific quantities
  const PartRow = ({ part, locationQty, locationReserved, locationId }) => {
    const images = part.photos || [];
    const featuredPhoto = part.featured_photo || images[0];
    // Use location-specific quantities if provided, otherwise fall back to global
    const hasLocationQty = locationQty !== undefined;
    const stats = hasLocationQty 
      ? { onHand: locationQty, reserved: locationReserved || 0, available: locationQty - (locationReserved || 0) }
      : (selectedLocationId && selectedLocationId !== 'unassigned'
          ? getInventoryStats(part.id, selectedLocationId)
          : getInventoryStats(part.id));
    const hasMultipleImages = images.length > 1;
    const vendor = vendors.find(v => v.id === part.default_vendor_id);
    const isLowStock = stats.available <= (part.reorder_point || 0) && stats.available > 0;
    const isFullyReserved = stats.onHand > 0 && stats.available === 0;
    const inventoryItemId = locationId ? getInventoryItemId(part.id, locationId) : null;

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
              {isFullyReserved && (
                <Badge variant="outline" className="border-orange-500 text-orange-400 text-xs shrink-0">
                  Reserved
                </Badge>
              )}
              {isLowStock && !isFullyReserved && (
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
            <div className="text-gray-500 mb-0.5">Qty</div>
            <div className="text-white font-semibold">
              {stats.onHand}
              {stats.reserved > 0 && (
                <span className="text-orange-400 font-normal ml-1">
                  ({stats.reserved} rsv)
                </span>
              )}
            </div>
          </div>
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">Available</div>
            <div className={cn(
              "font-semibold",
              stats.available > 0 ? "text-green-400" : stats.onHand > 0 ? "text-orange-400" : "text-red-400"
            )}>
              {stats.available}
            </div>
          </div>
        </div>

        {/* Move Location Button — always visible on mobile */}
        {inventoryItemId && (
          <div>
            <InventoryLocationEditor
              inventoryItemId={inventoryItemId}
              currentLocationId={locationId === 'unassigned' ? null : locationId}
              compact
            />
          </div>
        )}

        {/* Actions — always visible */}
        <div className="ml-2">
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

  // Part Card component - now accepts location-specific quantities
  const PartCard = ({ part, locationQty, locationReserved, locationId }) => {
    const images = part.photos || [];
    const featuredPhoto = part.featured_photo || images[0];
    const hasLocationQty = locationQty !== undefined;
    const stats = hasLocationQty 
      ? { onHand: locationQty, reserved: locationReserved || 0, available: locationQty - (locationReserved || 0) }
      : (selectedLocationId && selectedLocationId !== 'unassigned'
          ? getInventoryStats(part.id, selectedLocationId)
          : getInventoryStats(part.id));
    const hasMultipleImages = images.length > 1;
    const vendor = vendors.find(v => v.id === part.default_vendor_id);
    const isLowStock = stats.available <= (part.reorder_point || 0) && stats.available > 0;
    const isFullyReserved = stats.onHand > 0 && stats.available === 0;
    const inventoryItemId = locationId ? getInventoryItemId(part.id, locationId) : null;

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
            {isFullyReserved && (
              <Badge variant="outline" className="border-orange-500 text-orange-400 text-xs shrink-0">
                Rsv
              </Badge>
            )}
            {isLowStock && !isFullyReserved && (
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
            )}
          </div>

          {part.vendor_part_number && (
            <p className="text-xs text-gray-400 font-mono mb-2 truncate">
              {part.vendor_part_number}
            </p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-1 pt-2 border-t border-gray-800">
            <div className="text-center">
              <p className="text-xs text-gray-500">Qty</p>
              <p className="text-sm text-white font-semibold">
                {stats.onHand}
                {stats.reserved > 0 && <span className="text-orange-400 text-xs ml-1">({stats.reserved})</span>}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Available</p>
              <p className={`text-sm font-semibold ${stats.available > 0 ? 'text-green-400' : stats.onHand > 0 ? 'text-orange-400' : 'text-red-400'}`}>
                {stats.available}
              </p>
            </div>
          </div>

          {/* Move Location — always visible */}
          {inventoryItemId && (
            <div className="mt-2 pt-2 border-t border-gray-800">
              <InventoryLocationEditor
                inventoryItemId={inventoryItemId}
                currentLocationId={locationId === 'unassigned' ? null : locationId}
                compact
              />
            </div>
          )}

          {/* Vendor & Actions — always visible */}
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

  // Get selected build info for display
  const selectedBuild = selectedBuildId ? projects.find(p => p.id === selectedBuildId) : null;

  return (
    <>
      <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30 md:h-[calc(100vh-8rem)] md:overflow-hidden">
        {/* Header with Build Filter */}
        <div className="flex flex-col gap-3 p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Storage</h2>
              <p className="text-xs text-gray-400">
                {filteredParts.length} parts at {getSelectedLocationName()}
                {selectedBuild && (
                  <span className="text-orange-400 ml-1">• Filtered by build</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={showDashboard ? 'default' : 'ghost'}
                onClick={() => setShowDashboard(!showDashboard)}
                className={cn(
                  "h-7 px-2",
                  showDashboard ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                )}
                title="Storage Overview"
              >
                <BarChart3 className="w-4 h-4" />
              </Button>
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

          {/* Build Filter */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Wrench className="w-4 h-4 text-orange-400 shrink-0" />
              <Select 
                value={selectedBuildId || 'all'} 
                onValueChange={(v) => setSelectedBuildId(v === 'all' ? null : v)}
              >
                <SelectTrigger className={cn(
                  "bg-gray-900/50 border-gray-700 text-white h-9",
                  selectedBuildId && "border-orange-600/50 bg-orange-950/20"
                )}>
                  <SelectValue placeholder="Filter by Build" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="text-gray-300">All Builds</span>
                  </SelectItem>
                  {buildsWithAllocatedParts.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs text-gray-500 border-t border-gray-700 mt-1">
                        Builds with allocated parts
                      </div>
                      {buildsWithAllocatedParts.map(build => (
                        <SelectItem key={build.id} value={build.id}>
                          <div className="flex items-center gap-2">
                            <span className="text-white">{build.name}</span>
                            {build.client_name && (
                              <span className="text-gray-500 text-xs">({build.client_name})</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {buildsWithAllocatedParts.length === 0 && (
                    <div className="px-2 py-3 text-xs text-gray-500 text-center">
                      No builds with allocated inventory
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            {selectedBuild && (
              <>
                <BuildExportActions
                  buildId={selectedBuildId}
                  buildName={selectedBuild.name}
                  clientName={selectedBuild.client_name}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedBuildId(null)}
                  className="text-gray-400 hover:text-white h-9 px-3"
                >
                  Clear filter
                </Button>
              </>
            )}
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
                  placeholder="Find storage location..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-900/50 border-gray-700 text-white text-sm"
                />
              </div>
            </div>

            {/* Favorites & Recents */}
            {!searchTerm && (
              <LocationFavoritesBar
                favorites={favorites}
                recents={recents}
                locations={locations}
                selectedLocationId={selectedLocationId}
                onSelect={handleLocationSelect}
                onToggleFavorite={toggleFavorite}
              />
            )}

            {/* Location Search Results */}
            {locationSearchResults && locationSearchResults.length > 0 && (
              <div className="border-b border-red-900/20 p-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide px-2 mb-1">Locations matching "{searchTerm}"</div>
                <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                  {locationSearchResults.map(loc => {
                    const ltc = getLocationTypeConfig(loc.location_type);
                    const LIcon = ltc.icon;
                    return (
                      <button
                        key={loc.id}
                        onClick={() => { handleLocationSelect(loc.id); setSearchTerm(''); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800/50 text-left"
                      >
                        <LIcon className="w-3.5 h-3.5 shrink-0" style={{ color: loc.color || ltc.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white truncate">{loc.location_area}</div>
                          <div className="text-[10px] text-gray-500 truncate">
                            {buildLocationPathString(loc.id, locations)}
                          </div>
                        </div>
                        {loc.short_code && <span className="text-[10px] font-mono text-gray-500">[{loc.short_code}]</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
                  {partsAllocatedToBuild 
                    ? parts.filter(p => partsAllocatedToBuild.has(p.id) && inventoryItems.some(i => i.part_id === p.id && (i.quantity_on_hand || 0) > 0)).length
                    : parts.filter(p => inventoryItems.some(i => i.part_id === p.id)).length
                  }
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
            {/* Storage Dashboard — operational overview */}
            {showDashboard && !selectedLocationId && (
              <div className="border-b border-red-900/20 bg-gray-900/20 p-4">
                <StorageDashboard
                  locations={locations}
                  inventoryItems={inventoryItems}
                  onSelectZone={handleDashboardZone}
                />
              </div>
            )}

            {/* Location Detail Panel — shown when a specific location is selected */}
            {selectedLocationId && selectedLocationId !== 'unassigned' && selectedLocationId !== null && (
              <div className="border-b border-red-900/20 bg-gray-900/20 max-h-[45%] overflow-y-auto">
                <LocationDetailPanel
                  locationId={selectedLocationId}
                  locations={locations}
                  inventoryItems={inventoryItems}
                  parts={parts}
                  projects={projects}
                  commitments={commitments}
                  onNavigateLocation={handleLocationSelect}
                  isFavorite={isFavorite(selectedLocationId)}
                  onToggleFavorite={toggleFavorite}
                  onPrintQR={(loc) => {
                    let qrValue = loc.qr_code_value;
                    if (!qrValue) {
                      qrValue = `AK_LOCATION:${loc.id}`;
                      base44.entities.Location.update(loc.id, { qr_code_value: qrValue }).catch(() => {});
                    }
                    const tc = getLocationTypeConfig(loc.location_type);
                    const breadcrumb = buildLocationPathString(loc.id, locations);
                    const qrSvg = renderQRSVGString(qrValue, 140);
                    const html = `<!DOCTYPE html><html><head><title>Location Label</title><style>@page{size:4in 2in;margin:0.15in}body{font-family:Arial,sans-serif;margin:0;padding:8px}.label{display:flex;gap:12px;align-items:flex-start}.qr{flex-shrink:0}.info{flex:1}.name{font-size:18px;font-weight:bold;margin-bottom:4px}.type{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px}.code{font-size:24px;font-weight:bold;font-family:monospace;margin:6px 0}.path{font-size:10px;color:#999;margin-top:4px;word-break:break-word}.qr-text{font-size:8px;color:#aaa;font-family:monospace;margin-top:4px;word-break:break-all}</style></head><body><div class="label"><div class="qr">${qrSvg}</div><div class="info"><div class="name">${loc.location_area}</div><div class="type">${tc.label}</div>${loc.short_code?`<div class="code">${loc.short_code}</div>`:''}<div class="path">${breadcrumb}</div><div class="qr-text">${qrValue}</div></div></div></body></html>`;
                    const w = window.open('', '_blank', 'width=500,height=300');
                    if (w) { w.document.write(html); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close(); }; }
                  }}
                />
              </div>
            )}
            {/* Parts Display - Grouped by Location */}
            <div className="flex-1 p-4 overflow-y-auto">
              {filteredParts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <Package className="w-16 h-16 text-gray-600 mb-4" />
                  <h3 className="text-lg font-medium text-gray-400 mb-2">
                    {selectedLocationId ? 'No parts stored here' : 'No inventory found'}
                  </h3>
                  <p className="text-sm text-gray-600 max-w-sm">
                    {selectedBuild 
                      ? `No allocated parts for "${selectedBuild.name}" at this location`
                      : selectedLocationId 
                        ? 'This location is empty. Parts will appear here once inventory is received or moved.' 
                        : 'No inventory items found. Receive a purchase order or add inventory to get started.'}
                  </p>
                  {selectedBuild && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedBuildId(null)}
                      className="mt-4 border-gray-700 text-gray-300"
                    >
                      Clear build filter
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedParts.map(group => (
                    <div key={group.locationId} className="space-y-3">
                      {/* Main Location Header */}
                      <div 
                        className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-gray-900/95 backdrop-blur-sm rounded-lg border-l-4"
                        style={{ borderLeftColor: group.color }}
                      >
                        {(() => {
                          const loc = locations.find(l => l.id === group.locationId);
                          const tc = getLocationTypeConfig(loc?.location_type);
                          const GIcon = tc.icon;
                          return <GIcon className="w-5 h-5" style={{ color: group.color }} />;
                        })()}
                        <h3 className="text-base font-bold text-white">{group.locationName}</h3>
                        <span className="text-xs text-gray-400">
                          ({group.subLocations.reduce((sum, sub) => sum + sub.parts.length, 0)} parts)
                        </span>
                      </div>

                      {/* Sub-locations */}
                      {group.subLocations.map(subLoc => (
                        <div key={subLoc.locationId || '_direct'} className="ml-4 space-y-2">
                          {/* Sub-location Header (if has name) */}
                          {subLoc.locationName && (
                            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-800/50 rounded border-l-2"
                                 style={{ borderLeftColor: subLoc.color }}>
                              <ChevronRight className="w-4 h-4 text-gray-500" />
                              <span className="text-sm font-medium text-gray-300">{subLoc.locationName}</span>
                              <span className="text-xs text-gray-500">({subLoc.parts.length})</span>
                            </div>
                          )}

                          {/* Parts in this sub-location */}
                          {viewMode === 'list' ? (
                            <div className={cn("space-y-2", subLoc.locationName && "ml-4")}>
                              {subLoc.parts.map(part => (
                                <PartRow 
                                  key={`${part.id}-${subLoc.locationId}`} 
                                  part={part}
                                  locationQty={part._locationQty}
                                  locationReserved={part._locationReserved}
                                  locationId={subLoc.locationId || (group.locationId === 'unassigned' ? 'unassigned' : null)}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className={cn(
                              "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3",
                              subLoc.locationName && "ml-4"
                            )}>
                              {subLoc.parts.map(part => (
                                <PartCard 
                                  key={`${part.id}-${subLoc.locationId}`} 
                                  part={part}
                                  locationQty={part._locationQty}
                                  locationReserved={part._locationReserved}
                                  locationId={subLoc.locationId || (group.locationId === 'unassigned' ? 'unassigned' : null)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Parts count footer */}
            {totalPartsCount > 0 && (
              <div className="border-t border-red-900/20 bg-gray-900/30 p-3">
                <div className="text-xs text-gray-400">
                  {totalPartsCount} part{totalPartsCount !== 1 ? 's' : ''} across {groupedParts.length} location{groupedParts.length !== 1 ? 's' : ''}
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