import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, MapPin, ChevronRight, ChevronDown, Package, LayoutGrid, List,
  AlertTriangle, Star
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig, buildLocationPathString } from "./locationTypeConfig";
import { getContainerTypeConfig } from "./containerTypeConfig";
import { renderQRSVGString } from "./QRCodeSVG";
import LocationDetailPanel from "./LocationDetailPanel";
import InventoryLocationEditor from "./InventoryLocationEditor";
import PartActionsDropdown from "../parts/PartActionsDropdown";
import ImageGallery from "../parts/ImageGallery";
import AddInventoryModal from "./AddInventoryModal";
import OrderPartModal from "../parts/OrderPartModal";
import AddToBuildModal from "../parts/AddToBuildModal";
import AddToNeedToBuyModal from "../parts/AddToNeedToBuyModal";
import useLocationFavorites from "./useLocationFavorites";
import LocationFavoritesBar from "./LocationFavoritesBar";
import StoragePartRow from "./StoragePartRow";
import StoragePartCard from "./StoragePartCard";
import ContainerDetailPanel from "./ContainerDetailPanel";
import CreateContainerModal from "./CreateContainerModal";
import MoveContainerModal from "./MoveContainerModal";
import AddToContainerModal from "./AddToContainerModal";
import EmptyContainerModal from "./EmptyContainerModal";

const STORAGE_KEY = 'achtung_inventory_locations_state';

export default function InventoryLocations({ onPartClick, urlLocationId }) {
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
  const { favorites, recents, toggleFavorite, isFavorite, addRecent } = useLocationFavorites();

  // Container state
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [createContainerForLocation, setCreateContainerForLocation] = useState(null);
  const [moveContainerTarget, setMoveContainerTarget] = useState(null);
  const [moveContainerReturnHome, setMoveContainerReturnHome] = useState(false);
  const [addToContainerTarget, setAddToContainerTarget] = useState(null);
  const [emptyContainerTarget, setEmptyContainerTarget] = useState(null);

  // Modals
  const [inventoryModalPart, setInventoryModalPart] = useState(null);
  const [orderModalPart, setOrderModalPart] = useState(null);
  const [buildModalPart, setBuildModalPart] = useState(null);
  const [needToBuyModalPart, setNeedToBuyModalPart] = useState(null);
  const [galleryState, setGalleryState] = useState({ open: false, images: [], currentIndex: 0 });

  // URL sync
  const setSelectedLocationId = useCallback((id) => {
    setSelectedLocationIdRaw(id);
    const url = new URL(window.location);
    if (id && id !== 'unassigned') {
      url.searchParams.set('location', id);
    } else if (id === 'unassigned') {
      url.searchParams.set('location', 'unassigned');
    } else {
      url.searchParams.delete('location');
    }
    url.searchParams.set('tab', 'locations');
    window.history.replaceState({}, '', url);
  }, []);

  useEffect(() => {
    if (urlLocationId !== undefined && urlLocationId !== selectedLocationId) {
      setSelectedLocationIdRaw(urlLocationId);
    }
  }, [urlLocationId]);

  // Persist preferences
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedLocationId, expandedLocations, showEmptyLocations, viewMode,
      }));
    } catch (e) {}
  }, [selectedLocationId, expandedLocations, showEmptyLocations, viewMode]);

  // --- Data Queries ---
  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
    staleTime: 60000, gcTime: 300000, refetchOnWindowFocus: false,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
    staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
    staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
    staleTime: 60000, gcTime: 300000, refetchOnWindowFocus: false,
  });

  const { data: commitments = [] } = useQuery({
    queryKey: ['partCommitments'],
    queryFn: () => base44.entities.PartCommitment.filter({ 
      commitment_status: { $nin: ['cancelled', 'closed'] }
    }, '-created_date', 200),
    staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false,
  });

  const { data: containers = [] } = useQuery({
    queryKey: ['storageContainers'],
    queryFn: () => base44.entities.StorageContainer.filter({ active: true }),
    staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false,
  });

  // --- Derived data ---
  const getDescendants = useCallback((locationId) => {
    const descendants = [locationId];
    locations
      .filter(loc => loc.parent_id === locationId)
      .forEach(child => { descendants.push(...getDescendants(child.id)); });
    return descendants;
  }, [locations]);

  const locationPartCounts = useMemo(() => {
    const counts = {};
    const getDesc = (locId) => {
      const d = [locId];
      locations.filter(l => l.parent_id === locId).forEach(c => d.push(...getDesc(c.id)));
      return d;
    };
    locations.forEach(loc => {
      const locIds = getDesc(loc.id);
      const partsHere = new Set();
      inventoryItems.forEach(item => {
        if (locIds.includes(item.location_id) && (item.quantity_on_hand || 0) > 0) {
          partsHere.add(item.part_id);
        }
      });
      counts[loc.id] = partsHere.size;
    });
    const unassigned = new Set();
    inventoryItems.forEach(item => {
      if (!item.location_id && (item.quantity_on_hand || 0) > 0) unassigned.add(item.part_id);
    });
    counts['unassigned'] = unassigned.size;
    return counts;
  }, [locations, inventoryItems]);

  const partsAtSelectedLocation = useMemo(() => {
    const itemsWithStock = inventoryItems.filter(i => (i.quantity_on_hand || 0) > 0);
    if (selectedLocationId === null) {
      const partIds = new Set(itemsWithStock.map(i => i.part_id));
      return parts.filter(p => partIds.has(p.id));
    }
    if (selectedLocationId === 'unassigned') {
      const partIds = new Set(itemsWithStock.filter(i => !i.location_id).map(i => i.part_id));
      return parts.filter(p => partIds.has(p.id));
    }
    const locIds = getDescendants(selectedLocationId);
    const partIds = new Set(itemsWithStock.filter(i => locIds.includes(i.location_id)).map(i => i.part_id));
    return parts.filter(p => partIds.has(p.id));
  }, [selectedLocationId, inventoryItems, parts, locations, getDescendants]);

  // Location search
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
    return scored.sort((a, b) => b.score - a.score).slice(0, 20).map(s => s.loc);
  }, [searchTerm, locations, projects]);

  // Container search (prioritized: number > name > location)
  const containerSearchResults = useMemo(() => {
    if (!searchTerm || searchTerm.trim().length < 2) return null;
    const term = searchTerm.trim().toLowerCase();
    const scored = [];
    containers.forEach(c => {
      let score = 0;
      const code = c.short_code?.toLowerCase() || '';
      const name = c.name?.toLowerCase() || '';
      const qr = c.qr_code_value?.toLowerCase() || '';
      // Container number matches rank highest
      if (code === term) score = 100;
      else if (code.startsWith(term)) score = 90;
      else if (code.includes(term)) score = 80;
      // Then name
      else if (name === term) score = 70;
      else if (name.startsWith(term)) score = 60;
      else if (name.includes(term)) score = 50;
      // Then QR
      else if (qr.includes(term)) score = 30;
      // Then type label
      else if (getContainerTypeConfig(c.container_type).label.toLowerCase().includes(term)) score = 25;
      // Then home/current location name or project
      else {
        const loc = c.location_id ? locations.find(l => l.id === c.location_id) : null;
        const homeLoc = c.home_location_id ? locations.find(l => l.id === c.home_location_id) : null;
        const proj = c.project_id ? projects.find(p => p.id === c.project_id) : null;
        if (loc?.location_area?.toLowerCase().includes(term)) score = 20;
        else if (homeLoc?.location_area?.toLowerCase().includes(term)) score = 15;
        else if (proj?.name?.toLowerCase().includes(term)) score = 12;
        else if (c.notes?.toLowerCase().includes(term)) score = 10;
      }
      if (score > 0) scored.push({ container: c, score });
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, 10).map(s => s.container);
  }, [searchTerm, containers, locations]);

  // Part search (global — shown in search results panel, prioritized by match quality)
  const partSearchResults = useMemo(() => {
    if (!searchTerm || searchTerm.trim().length < 2) return null;
    const term = searchTerm.trim().toLowerCase();
    const scored = [];
    parts.forEach(p => {
      if (!inventoryItems.some(i => i.part_id === p.id && (i.quantity_on_hand || 0) > 0)) return;
      let score = 0;
      const pn = p.vendor_part_number?.toLowerCase() || '';
      const name = p.part_name?.toLowerCase() || '';
      // Part number matches rank highest
      if (pn === term) score = 100;
      else if (pn.startsWith(term)) score = 90;
      else if (pn.includes(term)) score = 80;
      // Then name matches
      else if (name === term) score = 70;
      else if (name.startsWith(term)) score = 60;
      else if (name.includes(term)) score = 50;
      if (score > 0) scored.push({ part: p, score });
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, 10).map(s => s.part);
  }, [searchTerm, parts, inventoryItems]);

  // Part search within selected location
  const filteredParts = useMemo(() => {
    if (!searchTerm) return partsAtSelectedLocation;
    const term = searchTerm.toLowerCase();
    return partsAtSelectedLocation.filter(part =>
      part.part_name?.toLowerCase().includes(term) ||
      part.vendor_part_number?.toLowerCase().includes(term)
    );
  }, [partsAtSelectedLocation, searchTerm]);

  // Group parts by location for display
  const groupedParts = useMemo(() => {
    if (selectedLocationId === 'unassigned') {
      return [{ locationId: 'unassigned', locationName: 'Unassigned', color: '#EAB308',
        subLocations: [{ locationId: 'unassigned', locationName: null, parts: filteredParts }] }];
    }
    const partLocMap = {};
    inventoryItems.forEach(item => {
      if ((item.quantity_on_hand || 0) > 0) {
        if (!partLocMap[item.part_id]) partLocMap[item.part_id] = [];
        partLocMap[item.part_id].push({ locationId: item.location_id, onHand: item.quantity_on_hand || 0, reserved: item.quantity_reserved || 0 });
      }
    });
    let relevantLocIds;
    if (selectedLocationId === null) {
      relevantLocIds = new Set(locations.map(l => l.id));
      relevantLocIds.add(null);
    } else {
      relevantLocIds = new Set(getDescendants(selectedLocationId));
    }
    const groups = {};
    filteredParts.forEach(part => {
      (partLocMap[part.id] || []).forEach(pl => {
        if (!relevantLocIds.has(pl.locationId)) return;
        const loc = locations.find(l => l.id === pl.locationId);
        let parentLoc, subLoc = null;
        if (!loc) { parentLoc = { id: 'unassigned', location_area: 'Unassigned', color: '#EAB308' }; }
        else if (loc.parent_id) { parentLoc = locations.find(l => l.id === loc.parent_id) || loc; subLoc = loc; }
        else { parentLoc = loc; }
        const pk = parentLoc.id;
        if (!groups[pk]) groups[pk] = { locationId: pk, locationName: parentLoc.location_area, color: parentLoc.color || '#6B7280', sortOrder: parentLoc.sort_order || 0, subLocations: {} };
        const sk = subLoc ? subLoc.id : '_direct';
        if (!groups[pk].subLocations[sk]) groups[pk].subLocations[sk] = { locationId: subLoc?.id || null, locationName: subLoc?.location_area || null, color: subLoc?.color || parentLoc.color || '#6B7280', sortOrder: subLoc?.sort_order || 0, parts: [] };
        if (!groups[pk].subLocations[sk].parts.find(p => p.id === part.id)) {
          groups[pk].subLocations[sk].parts.push({ ...part, _locationQty: pl.onHand, _locationReserved: pl.reserved });
        }
      });
    });
    return Object.values(groups)
      .sort((a, b) => { if (a.locationId === 'unassigned') return 1; if (b.locationId === 'unassigned') return -1; return (a.sortOrder || 0) - (b.sortOrder || 0); })
      .map(g => ({ ...g, subLocations: Object.values(g.subLocations).sort((a, b) => { if (!a.locationName) return -1; if (!b.locationName) return 1; return (a.sortOrder || 0) - (b.sortOrder || 0); }) }));
  }, [filteredParts, inventoryItems, locations, selectedLocationId, getDescendants]);

  // --- Handlers ---
  const handleLocationSelect = (locationId) => {
    setSelectedLocationId(locationId);
    addRecent(locationId);
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

  const handleToggleEmpty = (checked) => {
    setShowEmptyLocations(checked);
    if (!checked && selectedLocationId && selectedLocationId !== 'unassigned') {
      if ((locationPartCounts[selectedLocationId] || 0) === 0) setSelectedLocationId(null);
    }
  };

  const openGallery = (images, index = 0) => setGalleryState({ open: true, images, currentIndex: index });
  const closeGallery = () => setGalleryState(prev => ({ ...prev, open: false }));
  const navigateGallery = (direction) => {
    setGalleryState(prev => {
      if (typeof direction === 'number') return { ...prev, currentIndex: direction };
      const newIndex = direction === 'next' ? Math.min(prev.currentIndex + 1, prev.images.length - 1) : Math.max(prev.currentIndex - 1, 0);
      return { ...prev, currentIndex: newIndex };
    });
  };

  const getSelectedLocationName = () => {
    if (selectedLocationId === null) return 'All Locations';
    if (selectedLocationId === 'unassigned') return 'Unassigned';
    const loc = locations.find(l => l.id === selectedLocationId);
    if (!loc) return 'Unknown';
    if (loc.parent_id) {
      const parent = locations.find(l => l.id === loc.parent_id);
      return parent ? `${parent.location_area} › ${loc.location_area}` : loc.location_area;
    }
    return loc.location_area;
  };

  const getInventoryItemId = (partId, locationId) => {
    const item = inventoryItems.find(i => i.part_id === partId && (locationId === 'unassigned' ? !i.location_id : i.location_id === locationId));
    return item?.id;
  };

  const getInventoryStats = (partId, locationId = null) => {
    const items = locationId ? inventoryItems.filter(i => i.part_id === partId && i.location_id === locationId) : inventoryItems.filter(i => i.part_id === partId);
    const onHand = items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
    const reserved = items.reduce((s, i) => s + (i.quantity_reserved || 0), 0);
    return { onHand, available: onHand - reserved, reserved };
  };

  // --- Tree rendering ---
  const renderLocationNode = (location, level = 0) => {
    const children = locations.filter(l => l.parent_id === location.id && l.active);
    const hasChildren = children.length > 0;
    const isExpanded = expandedLocations[location.id];
    const isSelected = selectedLocationId === location.id;
    const partCount = locationPartCounts[location.id] || 0;
    const isEmpty = partCount === 0;
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
          style={{ paddingLeft: `${(level * 16) + 12}px`, borderLeftColor: level > 0 ? (location.color || '#6B7280') + '40' : 'transparent' }}
          onClick={() => handleLocationSelect(location.id)}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); setExpandedLocations(prev => ({ ...prev, [location.id]: !prev[location.id] })); }} className="shrink-0 hover:text-red-400 transition-colors">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : <div className="w-4" />}
          {(() => { const tc = getLocationTypeConfig(location.location_type); const TIcon = tc.icon; return <TIcon className="w-4 h-4 shrink-0" style={{ color: location.color || tc.color }} />; })()}
          <span className={cn("flex-1 text-sm font-medium truncate", isSelected && "font-semibold")} style={{ color: isSelected ? (location.color || '#EF4444') : undefined }} title={[location.location_area, location.short_code && `[${location.short_code}]`].filter(Boolean).join(' ')}>
            {location.location_area}
            {location.short_code && <span className="text-gray-500 text-[10px] font-mono ml-1">[{location.short_code}]</span>}
          </span>
          <button onClick={(e) => { e.stopPropagation(); toggleFavorite(location.id); }} className={cn("shrink-0 p-0.5 transition-colors", isFavorite(location.id) ? "text-yellow-500" : "text-gray-700 hover:text-yellow-600 md:opacity-0 md:group-hover:opacity-100")}>
            <Star className={cn("w-3 h-3", isFavorite(location.id) && "fill-yellow-500")} />
          </button>
          {partCount > 0 && (
            <span className={cn("shrink-0 text-xs px-2 py-0.5 rounded-full", isSelected ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400")}>{partCount}</span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>
            {children.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).filter(child => showEmptyLocations || (locationPartCounts[child.id] || 0) > 0).map(child => renderLocationNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootLocations = locations.filter(l => !l.parent_id && l.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const unassignedCount = locationPartCounts['unassigned'] || 0;
  const totalPartsCount = filteredParts.length;

  // Shared part action props
  const partActions = { onAddInventory: setInventoryModalPart, onOrderPart: setOrderModalPart, onAddToBuild: setBuildModalPart, onAddToNeedToBuy: setNeedToBuyModalPart, onViewDetails: onPartClick };

  return (
    <>
      <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30 md:h-[calc(100vh-8rem)] md:overflow-hidden">
        {/* Minimal header */}
        <div className="flex items-center justify-between p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
          <div>
            <h2 className="text-lg font-bold text-white">Storage</h2>
            <p className="text-xs text-gray-400">
              {selectedContainer
                ? `Viewing container: ${selectedContainer.name}`
                : `${filteredParts.length} parts at ${getSelectedLocationName()}`}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-black/40 border border-gray-700 rounded-lg p-1">
            <Button size="sm" variant={viewMode === 'list' ? 'default' : 'ghost'} onClick={() => setViewMode('list')} className={cn("h-7 px-2", viewMode === 'list' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white')}>
              <List className="w-4 h-4" />
            </Button>
            <Button size="sm" variant={viewMode === 'cards' ? 'default' : 'ghost'} onClick={() => setViewMode('cards')} className={cn("h-7 px-2", viewMode === 'cards' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white')}>
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Split Layout: Tree | Content */}
        <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
          {/* Left Pane — Location Tree */}
          <div className="w-full md:w-[30%] lg:w-[25%] flex flex-col border-b md:border-b-0 md:border-r border-red-900/30 bg-black/20 max-h-[40vh] md:max-h-none">
            <div className="p-3 border-b border-red-900/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input placeholder="Search parts, containers, locations…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 bg-gray-900/50 border-gray-700 text-white text-sm" />
              </div>
            </div>

            {!searchTerm && (
              <LocationFavoritesBar favorites={favorites} recents={recents} locations={locations} selectedLocationId={selectedLocationId} onSelect={handleLocationSelect} onToggleFavorite={toggleFavorite} />
            )}

            {/* Search results: locations + containers + parts */}
            {(locationSearchResults?.length > 0 || containerSearchResults?.length > 0 || partSearchResults?.length > 0) && (
              <div className="border-b border-red-900/20 p-2 max-h-[300px] overflow-y-auto">
                {partSearchResults?.length > 0 && (
                  <>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide px-2 mb-1">Parts</div>
                    <div className="space-y-0.5 mb-2">
                      {partSearchResults.map(p => {
                        const items = inventoryItems.filter(i => i.part_id === p.id && (i.quantity_on_hand || 0) > 0);
                        const firstItem = items[0];
                        const loc = firstItem?.location_id ? locations.find(l => l.id === firstItem.location_id) : null;
                        const ctr = firstItem?.container_id ? containers.find(c => c.id === firstItem.container_id) : null;
                        const totalQty = items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
                        const breadcrumb = loc ? buildLocationPathString(loc.id, locations) : '';
                        return (
                          <button key={p.id} onClick={() => { onPartClick?.(p); setSearchTerm(''); }} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-800/50 text-left">
                            {p.featured_photo || p.photos?.[0] ? (
                              <img src={p.featured_photo || p.photos[0]} alt="" className="w-8 h-8 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                            ) : (
                              <Package className="w-4 h-4 text-gray-500 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {p.vendor_part_number && <span className="text-[10px] font-mono font-bold text-gray-300">{p.vendor_part_number}</span>}
                                <span className="text-xs text-white truncate">{p.part_name}</span>
                              </div>
                              <div className="text-[10px] text-gray-500 truncate">
                                {ctr && <span className="text-indigo-400">📦 {ctr.name} · </span>}
                                {breadcrumb || loc?.location_area || 'Unassigned'}
                                {items.length > 1 && ` (+${items.length - 1} more)`}
                              </div>
                            </div>
                            <span className="text-[10px] text-gray-500 shrink-0">{totalQty} qty</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {containerSearchResults?.length > 0 && (
                  <>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide px-2 mb-1">Containers</div>
                    <div className="space-y-0.5 mb-2">
                      {containerSearchResults.map(c => {
                        const loc = locations.find(l => l.id === c.location_id);
                        const homeLoc = c.home_location_id ? locations.find(l => l.id === c.home_location_id) : null;
                        const isAway = homeLoc && c.location_id !== c.home_location_id;
                        const ctc = getContainerTypeConfig(c.container_type);
                        const cItemCount = inventoryItems.filter(i => i.container_id === c.id && (i.quantity_on_hand || 0) > 0).length;
                        const cProject = c.project_id ? projects.find(p => p.id === c.project_id) : null;
                        return (
                          <button key={c.id} onClick={() => { setSelectedContainer(c); setSearchTerm(''); }} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-800/50 text-left">
                            {c.photo ? (
                              <img src={c.photo} alt={c.name} className="w-8 h-8 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                            ) : (
                              <div className="w-8 h-8 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: (c.color || ctc.color) + '15' }}>
                                <ctc.icon className="w-4 h-4" style={{ color: c.color || ctc.color }} />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-white truncate">{c.name}</span>
                                {c.short_code && <span className="text-[10px] font-mono font-bold text-gray-400">{c.short_code}</span>}
                                <span className="text-[9px] px-1 py-0 rounded border" style={{ borderColor: (c.color || ctc.color) + '50', color: c.color || ctc.color }}>{ctc.label}</span>
                              </div>
                              <div className="text-[10px] text-gray-500 truncate">
                                {loc?.location_area || 'No location'}
                                {isAway && <span className="text-amber-400 ml-1">· away</span>}
                                {cProject && <span className="text-blue-400 ml-1">· {cProject.name}</span>}
                              </div>
                            </div>
                            <span className="text-[10px] text-gray-500 shrink-0">{cItemCount} part{cItemCount !== 1 ? 's' : ''}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {locationSearchResults?.length > 0 && (
                  <>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide px-2 mb-1">Locations</div>
                    <div className="space-y-0.5 mb-2">
                      {locationSearchResults.map(loc => {
                        const ltc = getLocationTypeConfig(loc.location_type);
                        const LIcon = ltc.icon;
                        return (
                          <button key={loc.id} onClick={() => { handleLocationSelect(loc.id); setSearchTerm(''); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800/50 text-left">
                            <LIcon className="w-3.5 h-3.5 shrink-0" style={{ color: loc.color || ltc.color }} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-white truncate">{loc.location_area}</div>
                              <div className="text-[10px] text-gray-500 truncate">{buildLocationPathString(loc.id, locations)}</div>
                            </div>
                            {loc.short_code && <span className="text-[10px] font-mono text-gray-500">[{loc.short_code}]</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto py-2">
              <div className={cn("flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors", selectedLocationId === null ? "bg-red-950/40 text-red-400" : "hover:bg-gray-800/50 text-gray-300")} onClick={() => setSelectedLocationId(null)}>
                <div className="w-4" />
                <Package className="w-4 h-4 text-blue-400" />
                <span className={cn("flex-1 text-sm font-medium", selectedLocationId === null && "font-semibold text-blue-400")}>All Locations</span>
                <span className={cn("shrink-0 text-xs px-2 py-0.5 rounded-full", selectedLocationId === null ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400")}>
                  {parts.filter(p => inventoryItems.some(i => i.part_id === p.id && (i.quantity_on_hand || 0) > 0)).length}
                </span>
              </div>

              {(showEmptyLocations || unassignedCount > 0) && (
                <div className={cn("flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors", selectedLocationId === 'unassigned' ? "bg-red-950/40 text-yellow-400" : "hover:bg-gray-800/50 text-gray-300", unassignedCount === 0 && "opacity-50")} onClick={() => setSelectedLocationId('unassigned')}>
                  <div className="w-4" />
                  <MapPin className="w-4 h-4 text-yellow-500" />
                  <span className={cn("flex-1 text-sm font-medium", selectedLocationId === 'unassigned' && "font-semibold")}>Unassigned</span>
                  {unassignedCount > 0 && <span className={cn("shrink-0 text-xs px-2 py-0.5 rounded-full", selectedLocationId === 'unassigned' ? "bg-yellow-600 text-white" : "bg-yellow-900/50 text-yellow-300")}>{unassignedCount}</span>}
                </div>
              )}

              {rootLocations.map(location => renderLocationNode(location, 0))}
            </div>

            <div className="p-3 border-t border-red-900/20">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-white transition-colors">
                <input type="checkbox" checked={showEmptyLocations} onChange={(e) => handleToggleEmpty(e.target.checked)} className="rounded border-gray-700 bg-gray-900 text-red-600 focus:ring-red-600" />
                Show empty locations
              </label>
            </div>
          </div>

          {/* Right Pane — Location Detail + Parts */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Location Detail — collapsed panel */}
            {selectedLocationId && selectedLocationId !== 'unassigned' && (
              <div className="border-b border-red-900/20 bg-gray-900/20 overflow-y-auto" style={{ maxHeight: '40%' }}>
                <LocationDetailPanel
                  locationId={selectedLocationId}
                  locations={locations}
                  inventoryItems={inventoryItems}
                  parts={parts}
                  projects={projects}
                  commitments={commitments}
                  containers={containers}
                  onNavigateLocation={handleLocationSelect}
                  isFavorite={isFavorite(selectedLocationId)}
                  onToggleFavorite={toggleFavorite}
                  onSelectContainer={(c) => setSelectedContainer(c)}
                  onMoveContainer={(c) => { setMoveContainerReturnHome(false); setMoveContainerTarget(c); }}
                  onCreateContainer={(locId) => setCreateContainerForLocation(locId)}
                  onPrintQR={(loc) => {
                    let qrValue = loc.qr_code_value;
                    if (!qrValue) {
                      qrValue = `AK_LOCATION:${loc.id}`;
                      base44.entities.Location.update(loc.id, { qr_code_value: qrValue }).catch(() => {});
                    }
                    const tc = getLocationTypeConfig(loc.location_type);
                    const breadcrumb = buildLocationPathString(loc.id, locations);
                    const qrSvg = renderQRSVGString(qrValue, 200);
                    const html = `<!DOCTYPE html><html><head><title>Location Label</title><style>@page{size:4in 3in;margin:0.15in}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;padding:10px}.label{display:flex;gap:16px;align-items:flex-start;height:100%}.qr{flex-shrink:0;padding-top:4px}.info{flex:1;display:flex;flex-direction:column;gap:4px}.name{font-size:22px;font-weight:900;line-height:1.15}.code{font-size:28px;font-weight:900;font-family:'Courier New',monospace;margin:4px 0}.type{font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;font-weight:600}.path{font-size:10px;color:#888;margin-top:4px;word-break:break-word}.qr-id{font-size:7px;color:#bbb;font-family:monospace;margin-top:auto;word-break:break-all}</style></head><body><div class="label"><div class="qr">${qrSvg}</div><div class="info"><div class="name">${loc.location_area}</div>${loc.short_code ? `<div class="code">${loc.short_code}</div>` : ''}<div class="type">${tc.label}</div><div class="path">${breadcrumb}</div><div class="qr-id">${qrValue}</div></div></div></body></html>`;
                    const w = window.open('', '_blank', 'width=500,height=400');
                    if (w) { w.document.write(html); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close(); }; }
                  }}
                />
              </div>
            )}

            {/* Container Detail Panel — takes over right pane */}
            {selectedContainer ? (
              <ContainerDetailPanel
                container={selectedContainer}
                locations={locations}
                inventoryItems={inventoryItems}
                parts={parts}
                projects={projects}
                vendors={vendors}
                onClose={() => setSelectedContainer(null)}
                onMove={(c) => { setMoveContainerReturnHome(false); setMoveContainerTarget(c); }}
                onReturnHome={(c) => { setMoveContainerReturnHome(true); setMoveContainerTarget(c); }}
                onAddParts={(c) => setAddToContainerTarget(c)}
                onEmptyContainer={(c) => setEmptyContainerTarget(c)}
                onPartClick={onPartClick}
                onOpenGallery={openGallery}
                partActions={partActions}
                getInventoryStats={getInventoryStats}
                getInventoryItemId={getInventoryItemId}
              />
            ) : (
              <>
                {/* Parts list */}
                <div className="flex-1 p-4 overflow-y-auto">
                  {filteredParts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                      <Package className="w-16 h-16 text-gray-600 mb-4" />
                      <h3 className="text-lg font-medium text-gray-400 mb-2">
                        {selectedLocationId ? 'No parts stored here' : 'No inventory found'}
                      </h3>
                      <p className="text-sm text-gray-600 max-w-sm">
                        {selectedLocationId
                          ? 'This location is empty. Parts will appear here once inventory is received or moved.'
                          : 'No inventory items found. Receive a purchase order or add inventory to get started.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {groupedParts.map(group => (
                        <div key={group.locationId} className="space-y-3">
                          <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-gray-900/95 backdrop-blur-sm rounded-lg border-l-4" style={{ borderLeftColor: group.color }}>
                            {(() => { const loc = locations.find(l => l.id === group.locationId); const tc = getLocationTypeConfig(loc?.location_type); const GIcon = tc.icon; return <GIcon className="w-5 h-5" style={{ color: group.color }} />; })()}
                            <h3 className="text-base font-bold text-white">{group.locationName}</h3>
                            <span className="text-xs text-gray-400">({group.subLocations.reduce((sum, sub) => sum + sub.parts.length, 0)} parts)</span>
                          </div>
                          {group.subLocations.map(subLoc => (
                            <div key={subLoc.locationId || '_direct'} className="ml-4 space-y-2">
                              {subLoc.locationName && (
                                <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-800/50 rounded border-l-2" style={{ borderLeftColor: subLoc.color }}>
                                  <ChevronRight className="w-4 h-4 text-gray-500" />
                                  <span className="text-sm font-medium text-gray-300">{subLoc.locationName}</span>
                                  <span className="text-xs text-gray-500">({subLoc.parts.length})</span>
                                </div>
                              )}
                              {viewMode === 'list' ? (
                                <div className={cn("space-y-2", subLoc.locationName && "ml-4")}>
                                  {subLoc.parts.map(part => {
                                    const itemForPart = inventoryItems.find(i => i.part_id === part.id && i.location_id === (subLoc.locationId || null) && (i.quantity_on_hand || 0) > 0);
                                    const ctr = itemForPart?.container_id ? containers.find(c => c.id === itemForPart.container_id) : null;
                                    return (
                                      <StoragePartRow
                                        key={`${part.id}-${subLoc.locationId}`}
                                        part={part}
                                        locationQty={part._locationQty}
                                        locationReserved={part._locationReserved}
                                        locationId={subLoc.locationId || (group.locationId === 'unassigned' ? 'unassigned' : null)}
                                        selectedLocationId={selectedLocationId}
                                        getInventoryStats={getInventoryStats}
                                        getInventoryItemId={getInventoryItemId}
                                        vendors={vendors}
                                        onPartClick={onPartClick}
                                        onOpenGallery={openGallery}
                                        partActions={partActions}
                                        containerName={ctr?.name}
                                      />
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className={cn("grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3", subLoc.locationName && "ml-4")}>
                                  {subLoc.parts.map(part => (
                                    <StoragePartCard
                                      key={`${part.id}-${subLoc.locationId}`}
                                      part={part}
                                      locationQty={part._locationQty}
                                      locationReserved={part._locationReserved}
                                      locationId={subLoc.locationId || (group.locationId === 'unassigned' ? 'unassigned' : null)}
                                      selectedLocationId={selectedLocationId}
                                      getInventoryStats={getInventoryStats}
                                      getInventoryItemId={getInventoryItemId}
                                      vendors={vendors}
                                      onPartClick={onPartClick}
                                      onOpenGallery={openGallery}
                                      partActions={partActions}
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

                {totalPartsCount > 0 && (
                  <div className="border-t border-red-900/20 bg-gray-900/30 p-3">
                    <div className="text-xs text-gray-400">
                      {totalPartsCount} part{totalPartsCount !== 1 ? 's' : ''} across {groupedParts.length} location{groupedParts.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {inventoryModalPart && <AddInventoryModal onClose={() => setInventoryModalPart(null)} preselectedPartId={inventoryModalPart.id} />}
      {orderModalPart && <OrderPartModal part={orderModalPart} onClose={() => setOrderModalPart(null)} />}
      {buildModalPart && <AddToBuildModal part={buildModalPart} onClose={() => setBuildModalPart(null)} />}
      {needToBuyModalPart && <AddToNeedToBuyModal part={needToBuyModalPart} onClose={() => setNeedToBuyModalPart(null)} />}
      {createContainerForLocation && (
        <CreateContainerModal
          onClose={() => setCreateContainerForLocation(null)}
          preselectedLocationId={createContainerForLocation}
          locations={locations}
          projects={projects}
        />
      )}
      {moveContainerTarget && (
        <MoveContainerModal
          container={moveContainerTarget}
          onClose={() => { setMoveContainerTarget(null); setMoveContainerReturnHome(false); }}
          locations={locations}
          inventoryItems={inventoryItems}
          returnHome={moveContainerReturnHome}
        />
      )}
      {addToContainerTarget && (
        <AddToContainerModal
          container={addToContainerTarget}
          onClose={() => setAddToContainerTarget(null)}
          inventoryItems={inventoryItems}
          parts={parts}
        />
      )}
      {emptyContainerTarget && (
        <EmptyContainerModal
          container={emptyContainerTarget}
          onClose={() => setEmptyContainerTarget(null)}
          locations={locations}
          containers={containers}
          inventoryItems={inventoryItems}
          parts={parts}
        />
      )}
      <ImageGallery isOpen={galleryState.open} images={galleryState.images} currentIndex={galleryState.currentIndex} onClose={closeGallery} onNavigate={navigateGallery} />
    </>
  );
}