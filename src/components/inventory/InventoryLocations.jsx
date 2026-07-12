import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Search, MapPin, ChevronRight, ChevronDown, Package, LayoutGrid, List, X, ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig, buildLocationPathString } from "./locationTypeConfig";
import { getContainerTypeConfig } from "./containerTypeConfig";
import { renderQRSVGString } from "./QRCodeSVG";
import StorageHome from "./StorageHome";
import LocationDetailPanel from "./LocationDetailPanel";
import ImageGallery from "../parts/ImageGallery";
import AddInventoryModal from "./AddInventoryModal";
import OrderPartModal from "../parts/OrderPartModal";
import AddToBuildModal from "../parts/AddToBuildModal";
import AddToNeedToBuyModal from "../parts/AddToNeedToBuyModal";
import useLocationFavorites from "./useLocationFavorites";
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

  const [selectedContainer, setSelectedContainer] = useState(null);
  const [createContainerForLocation, setCreateContainerForLocation] = useState(null);
  const [moveContainerTarget, setMoveContainerTarget] = useState(null);
  const [moveContainerReturnHome, setMoveContainerReturnHome] = useState(false);
  const [addToContainerTarget, setAddToContainerTarget] = useState(null);
  const [emptyContainerTarget, setEmptyContainerTarget] = useState(null);

  const [inventoryModalPart, setInventoryModalPart] = useState(null);
  const [orderModalPart, setOrderModalPart] = useState(null);
  const [buildModalPart, setBuildModalPart] = useState(null);
  const [needToBuyModalPart, setNeedToBuyModalPart] = useState(null);
  const [galleryState, setGalleryState] = useState({ open: false, images: [], currentIndex: 0 });

  const setSelectedLocationId = useCallback((id) => {
    setSelectedLocationIdRaw(id);
    const url = new URL(window.location);
    if (id && id !== 'unassigned') url.searchParams.set('location', id);
    else if (id === 'unassigned') url.searchParams.set('location', 'unassigned');
    else url.searchParams.delete('location');
    url.searchParams.set('tab', 'locations');
    window.history.replaceState({}, '', url);
  }, []);

  useEffect(() => {
    if (urlLocationId !== undefined && urlLocationId !== selectedLocationId) setSelectedLocationIdRaw(urlLocationId);
  }, [urlLocationId]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedLocationId, expandedLocations, showEmptyLocations, viewMode })); } catch (e) {}
  }, [selectedLocationId, expandedLocations, showEmptyLocations, viewMode]);

  // --- Data ---
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: () => base44.entities.Location.list(), staleTime: 60000, gcTime: 300000, refetchOnWindowFocus: false });
  const { data: inventoryItems = [] } = useQuery({ queryKey: ['inventoryItems'], queryFn: () => base44.entities.InventoryItem.list(), staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false });
  const { data: parts = [] } = useQuery({ queryKey: ['parts'], queryFn: () => base44.entities.Part.list(), staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false });
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: () => base44.entities.Vendor.list(), staleTime: 60000, gcTime: 300000, refetchOnWindowFocus: false });
  const { data: commitments = [] } = useQuery({ queryKey: ['partCommitments'], queryFn: () => base44.entities.PartCommitment.filter({ commitment_status: { $nin: ['cancelled', 'closed'] } }, '-created_date', 200), staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list(), staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false });
  const { data: containers = [] } = useQuery({ queryKey: ['storageContainers'], queryFn: () => base44.entities.StorageContainer.filter({ active: true }), staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false });

  // --- Derived ---
  const getDescendants = useCallback((locationId) => {
    const d = [locationId];
    locations.filter(l => l.parent_id === locationId).forEach(c => d.push(...getDescendants(c.id)));
    return d;
  }, [locations]);

  const locationPartCounts = useMemo(() => {
    const counts = {};
    const getDesc = (locId) => { const d = [locId]; locations.filter(l => l.parent_id === locId).forEach(c => d.push(...getDesc(c.id))); return d; };
    locations.forEach(loc => {
      const locIds = getDesc(loc.id);
      const s = new Set();
      inventoryItems.forEach(item => { if (locIds.includes(item.location_id) && (item.quantity_on_hand || 0) > 0) s.add(item.part_id); });
      counts[loc.id] = s.size;
    });
    const u = new Set();
    inventoryItems.forEach(item => { if (!item.location_id && (item.quantity_on_hand || 0) > 0) u.add(item.part_id); });
    counts['unassigned'] = u.size;
    return counts;
  }, [locations, inventoryItems]);

  const partsAtLocation = useMemo(() => {
    const items = inventoryItems.filter(i => (i.quantity_on_hand || 0) > 0);
    if (!selectedLocationId) return parts.filter(p => items.some(i => i.part_id === p.id));
    if (selectedLocationId === 'unassigned') { const ids = new Set(items.filter(i => !i.location_id).map(i => i.part_id)); return parts.filter(p => ids.has(p.id)); }
    const locIds = getDescendants(selectedLocationId);
    const ids = new Set(items.filter(i => locIds.includes(i.location_id)).map(i => i.part_id));
    return parts.filter(p => ids.has(p.id));
  }, [selectedLocationId, inventoryItems, parts, locations, getDescendants]);

  // --- Search ---
  const hasSearch = searchTerm.trim().length >= 2;
  const searchResults = useMemo(() => {
    if (!hasSearch) return null;
    const term = searchTerm.trim().toLowerCase();
    const pr = [], cr = [], lr = [];
    parts.forEach(p => {
      if (!inventoryItems.some(i => i.part_id === p.id && (i.quantity_on_hand || 0) > 0)) return;
      let s = 0;
      const pn = p.vendor_part_number?.toLowerCase() || '', nm = p.part_name?.toLowerCase() || '';
      if (pn === term) s = 100; else if (pn.startsWith(term)) s = 90; else if (pn.includes(term)) s = 80;
      else if (nm === term) s = 70; else if (nm.startsWith(term)) s = 60; else if (nm.includes(term)) s = 50;
      if (s > 0) pr.push({ part: p, score: s });
    });
    containers.forEach(c => {
      let s = 0;
      const cd = c.short_code?.toLowerCase() || '', nm = c.name?.toLowerCase() || '', qr = c.qr_code_value?.toLowerCase() || '';
      if (cd === term) s = 100; else if (cd.startsWith(term)) s = 90; else if (cd.includes(term)) s = 80;
      else if (nm === term) s = 70; else if (nm.startsWith(term)) s = 60; else if (nm.includes(term)) s = 50;
      else if (qr.includes(term)) s = 30;
      else { const loc = c.location_id ? locations.find(l => l.id === c.location_id) : null; if (loc?.location_area?.toLowerCase().includes(term)) s = 20; else if (c.notes?.toLowerCase().includes(term)) s = 10; }
      if (s > 0) cr.push({ container: c, score: s });
    });
    locations.forEach(loc => {
      if (!loc.active && loc.active !== undefined) return;
      let s = 0;
      const nm = loc.location_area?.toLowerCase() || '', cd = loc.short_code?.toLowerCase() || '', qr = loc.qr_code_value?.toLowerCase() || '';
      if (cd === term || qr === term) s = 100; else if (nm === term) s = 95; else if (cd.startsWith(term) || qr.startsWith(term)) s = 80;
      else if (nm.startsWith(term)) s = 75; else if (cd.includes(term) || nm.includes(term)) s = 60; else if (qr.includes(term)) s = 50;
      if (s > 0) lr.push({ loc, score: s });
    });
    return {
      parts: pr.sort((a, b) => b.score - a.score).slice(0, 10).map(s => s.part),
      containers: cr.sort((a, b) => b.score - a.score).slice(0, 10).map(s => s.container),
      locations: lr.sort((a, b) => b.score - a.score).slice(0, 15).map(s => s.loc),
      total: pr.length + cr.length + lr.length,
    };
  }, [searchTerm, hasSearch, parts, containers, locations, inventoryItems]);

  // Parts filtered for content pane
  const filteredParts = useMemo(() => {
    if (!searchTerm || !selectedLocationId) return partsAtLocation;
    const term = searchTerm.toLowerCase();
    return partsAtLocation.filter(p => p.part_name?.toLowerCase().includes(term) || p.vendor_part_number?.toLowerCase().includes(term));
  }, [partsAtLocation, searchTerm, selectedLocationId]);

  // Grouped parts
  const groupedParts = useMemo(() => {
    if (selectedLocationId === 'unassigned') return [{ locationId: 'unassigned', locationName: 'Unassigned', color: '#EAB308', subLocations: [{ locationId: 'unassigned', locationName: null, parts: filteredParts }] }];
    const partLocMap = {};
    inventoryItems.forEach(item => { if ((item.quantity_on_hand || 0) > 0) { if (!partLocMap[item.part_id]) partLocMap[item.part_id] = []; partLocMap[item.part_id].push({ locationId: item.location_id, onHand: item.quantity_on_hand || 0, reserved: item.quantity_reserved || 0 }); } });
    const relevantLocIds = selectedLocationId ? new Set(getDescendants(selectedLocationId)) : new Set([...locations.map(l => l.id), null]);
    const groups = {};
    filteredParts.forEach(part => {
      (partLocMap[part.id] || []).forEach(pl => {
        if (!relevantLocIds.has(pl.locationId)) return;
        const loc = locations.find(l => l.id === pl.locationId);
        let parentLoc, subLoc = null;
        if (!loc) parentLoc = { id: 'unassigned', location_area: 'Unassigned', color: '#EAB308' };
        else if (loc.parent_id) { parentLoc = locations.find(l => l.id === loc.parent_id) || loc; subLoc = loc; }
        else parentLoc = loc;
        const pk = parentLoc.id;
        if (!groups[pk]) groups[pk] = { locationId: pk, locationName: parentLoc.location_area, color: parentLoc.color || '#6B7280', sortOrder: parentLoc.sort_order || 0, subLocations: {} };
        const sk = subLoc ? subLoc.id : '_direct';
        if (!groups[pk].subLocations[sk]) groups[pk].subLocations[sk] = { locationId: subLoc?.id || null, locationName: subLoc?.location_area || null, color: subLoc?.color || parentLoc.color || '#6B7280', sortOrder: subLoc?.sort_order || 0, parts: [] };
        if (!groups[pk].subLocations[sk].parts.find(p => p.id === part.id)) groups[pk].subLocations[sk].parts.push({ ...part, _locationQty: pl.onHand, _locationReserved: pl.reserved });
      });
    });
    return Object.values(groups).sort((a, b) => a.locationId === 'unassigned' ? 1 : b.locationId === 'unassigned' ? -1 : (a.sortOrder || 0) - (b.sortOrder || 0))
      .map(g => ({ ...g, subLocations: Object.values(g.subLocations).sort((a, b) => !a.locationName ? -1 : !b.locationName ? 1 : (a.sortOrder || 0) - (b.sortOrder || 0)) }));
  }, [filteredParts, inventoryItems, locations, selectedLocationId, getDescendants]);

  // --- Handlers ---
  const handleLocationSelect = (id) => {
    setSelectedLocationId(id);
    setSelectedContainer(null);
    setSearchTerm('');
    addRecent(id);
    if (id && id !== 'unassigned') {
      const newExp = { ...expandedLocations };
      let cur = id;
      while (cur) { newExp[cur] = true; const loc = locations.find(l => l.id === cur); cur = loc?.parent_id; }
      setExpandedLocations(newExp);
    }
  };

  const goHome = () => { setSelectedLocationId(null); setSelectedContainer(null); setSearchTerm(''); };
  const clearSearch = () => setSearchTerm('');

  const handleToggleEmpty = (checked) => {
    setShowEmptyLocations(checked);
    if (!checked && selectedLocationId && selectedLocationId !== 'unassigned' && (locationPartCounts[selectedLocationId] || 0) === 0) setSelectedLocationId(null);
  };

  const openGallery = (images, index = 0) => setGalleryState({ open: true, images, currentIndex: index });
  const closeGallery = () => setGalleryState(prev => ({ ...prev, open: false }));
  const navigateGallery = (d) => setGalleryState(prev => ({ ...prev, currentIndex: typeof d === 'number' ? d : d === 'next' ? Math.min(prev.currentIndex + 1, prev.images.length - 1) : Math.max(prev.currentIndex - 1, 0) }));

  const getInventoryItemId = (partId, locationId) => inventoryItems.find(i => i.part_id === partId && (locationId === 'unassigned' ? !i.location_id : i.location_id === locationId))?.id;
  const getInventoryStats = (partId, locationId = null) => {
    const items = locationId ? inventoryItems.filter(i => i.part_id === partId && i.location_id === locationId) : inventoryItems.filter(i => i.part_id === partId);
    const onHand = items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
    const reserved = items.reduce((s, i) => s + (i.quantity_reserved || 0), 0);
    return { onHand, available: onHand - reserved, reserved };
  };

  const partActions = { onAddInventory: setInventoryModalPart, onOrderPart: setOrderModalPart, onAddToBuild: setBuildModalPart, onAddToNeedToBuy: setNeedToBuyModalPart, onViewDetails: onPartClick };

  // Determine current view
  const showSearchResults = hasSearch && searchResults && searchResults.total > 0;
  const isHome = !selectedLocationId && !selectedContainer && !showSearchResults;
  const isLocationView = selectedLocationId && !selectedContainer;
  const isContainerView = !!selectedContainer;

  const getLocationName = () => {
    if (!selectedLocationId || selectedLocationId === 'unassigned') return selectedLocationId === 'unassigned' ? 'Unassigned' : '';
    const loc = locations.find(l => l.id === selectedLocationId);
    return loc?.location_area || '';
  };

  return (
    <>
      <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30 md:h-[calc(100vh-8rem)] md:overflow-hidden">
        {/* Top bar — search + back navigation */}
        <div className="p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
          <div className="flex items-center gap-2">
            {/* Back button — when not on Home */}
            {!isHome && !showSearchResults && (
              <Button size="icon" variant="ghost" onClick={isContainerView ? () => setSelectedContainer(null) : goHome}
                className="h-9 w-9 text-gray-400 hover:text-white shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input placeholder="Find a part, container, or shelf…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className={cn("pl-11 pr-10 bg-gray-900/50 border-gray-700 text-white", isHome ? "h-12 text-base" : "h-10 text-sm")} />
              {searchTerm && (
                <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* View toggle — only on location view */}
            {isLocationView && (
              <div className="flex items-center gap-0.5 bg-black/40 border border-gray-700 rounded-lg p-0.5 shrink-0">
                <Button size="sm" variant={viewMode === 'list' ? 'default' : 'ghost'} onClick={() => setViewMode('list')} className={cn("h-7 px-1.5", viewMode === 'list' ? 'bg-red-600 text-white' : 'text-gray-400')}>
                  <List className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant={viewMode === 'cards' ? 'default' : 'ghost'} onClick={() => setViewMode('cards')} className={cn("h-7 px-1.5", viewMode === 'cards' ? 'bg-red-600 text-white' : 'text-gray-400')}>
                  <LayoutGrid className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ============ SEARCH RESULTS ============ */}
        {showSearchResults && (
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {searchResults.parts.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 mb-2">Parts</div>
                <div className="space-y-1">
                  {searchResults.parts.map(p => {
                    const items = inventoryItems.filter(i => i.part_id === p.id && (i.quantity_on_hand || 0) > 0);
                    const fi = items[0];
                    const loc = fi?.location_id ? locations.find(l => l.id === fi.location_id) : null;
                    const ctr = fi?.container_id ? containers.find(c => c.id === fi.container_id) : null;
                    const qty = items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
                    return (
                      <button key={p.id} onClick={() => { onPartClick?.(p); clearSearch(); }}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-800/50 text-left transition-colors">
                        {p.featured_photo || p.photos?.[0] ? (
                          <img src={p.featured_photo || p.photos[0]} alt="" className="w-10 h-10 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center shrink-0"><Package className="w-5 h-5 text-gray-600" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {p.vendor_part_number && <span className="text-xs font-mono font-bold text-gray-300">{p.vendor_part_number}</span>}
                            <span className="text-sm text-white truncate">{p.part_name}</span>
                          </div>
                          <div className="text-xs text-gray-500 truncate mt-0.5">
                            {ctr && <span className="text-indigo-400">📦 {ctr.name} · </span>}
                            {loc ? buildLocationPathString(loc.id, locations) || loc.location_area : 'Unassigned'}
                            {items.length > 1 && <span className="text-gray-600"> (+{items.length - 1} more)</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0"><div className="text-sm text-white font-semibold">{qty}</div><div className="text-[10px] text-gray-500">qty</div></div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {searchResults.containers.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 mb-2">Containers</div>
                <div className="space-y-1">
                  {searchResults.containers.map(c => {
                    const loc = locations.find(l => l.id === c.location_id);
                    const ctc = getContainerTypeConfig(c.container_type);
                    const cnt = inventoryItems.filter(i => i.container_id === c.id && (i.quantity_on_hand || 0) > 0).length;
                    return (
                      <button key={c.id} onClick={() => { setSelectedContainer(c); clearSearch(); }}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-800/50 text-left transition-colors">
                        {c.photo ? (
                          <img src={c.photo} alt="" className="w-10 h-10 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                        ) : (
                          <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: (c.color || ctc.color) + '15' }}>
                            <ctc.icon className="w-5 h-5" style={{ color: c.color || ctc.color }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2"><span className="text-sm text-white truncate">{c.name}</span>{c.short_code && <span className="text-xs font-mono font-bold text-gray-400">{c.short_code}</span>}</div>
                          <div className="text-xs text-gray-500 truncate mt-0.5">{loc?.location_area || 'No location'}</div>
                        </div>
                        <div className="text-right shrink-0"><div className="text-sm text-white font-semibold">{cnt}</div><div className="text-[10px] text-gray-500">parts</div></div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {searchResults.locations.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 mb-2">Locations</div>
                <div className="space-y-1">
                  {searchResults.locations.map(loc => {
                    const ltc = getLocationTypeConfig(loc.location_type); const LI = ltc.icon;
                    return (
                      <button key={loc.id} onClick={() => { handleLocationSelect(loc.id); }}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-800/50 text-left transition-colors">
                        <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center shrink-0"><LI className="w-5 h-5" style={{ color: loc.color || ltc.color }} /></div>
                        <div className="flex-1 min-w-0"><div className="text-sm text-white truncate">{loc.location_area}</div><div className="text-xs text-gray-500 truncate mt-0.5">{buildLocationPathString(loc.id, locations)}</div></div>
                        <div className="text-right shrink-0"><div className="text-sm text-white font-semibold">{locationPartCounts[loc.id] || 0}</div><div className="text-[10px] text-gray-500">parts</div></div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ HOME ============ */}
        {isHome && !showSearchResults && (
          <StorageHome
            favorites={favorites} recents={recents} locations={locations} containers={containers}
            inventoryItems={inventoryItems} locationPartCounts={locationPartCounts} showEmptyLocations={showEmptyLocations}
            onSelectLocation={handleLocationSelect} onSelectContainer={(c) => setSelectedContainer(c)}
            onToggleEmpty={handleToggleEmpty} expandedLocations={expandedLocations}
            onToggleExpand={(id) => setExpandedLocations(prev => ({ ...prev, [id]: !prev[id] }))}
            onToggleFavorite={toggleFavorite} isFavorite={isFavorite}
          />
        )}

        {/* ============ CONTAINER VIEW ============ */}
        {isContainerView && !showSearchResults && (
          <ContainerDetailPanel
            container={selectedContainer} locations={locations} inventoryItems={inventoryItems}
            parts={parts} projects={projects} vendors={vendors}
            onClose={() => setSelectedContainer(null)}
            onMove={(c) => { setMoveContainerReturnHome(false); setMoveContainerTarget(c); }}
            onReturnHome={(c) => { setMoveContainerReturnHome(true); setMoveContainerTarget(c); }}
            onAddParts={(c) => setAddToContainerTarget(c)}
            onEmptyContainer={(c) => setEmptyContainerTarget(c)}
            onPartClick={onPartClick} onOpenGallery={openGallery} partActions={partActions}
            getInventoryStats={getInventoryStats} getInventoryItemId={getInventoryItemId}
          />
        )}

        {/* ============ LOCATION VIEW ============ */}
        {isLocationView && !showSearchResults && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Location header */}
            {selectedLocationId !== 'unassigned' && (
              <div className="border-b border-red-900/20 bg-gray-900/20 overflow-y-auto" style={{ maxHeight: '45%' }}>
                <LocationDetailPanel
                  locationId={selectedLocationId} locations={locations} inventoryItems={inventoryItems}
                  parts={parts} projects={projects} commitments={commitments} containers={containers}
                  onNavigateLocation={handleLocationSelect} isFavorite={isFavorite(selectedLocationId)}
                  onToggleFavorite={toggleFavorite} onSelectContainer={(c) => setSelectedContainer(c)}
                  onMoveContainer={(c) => { setMoveContainerReturnHome(false); setMoveContainerTarget(c); }}
                  onCreateContainer={(locId) => setCreateContainerForLocation(locId)}
                  onPrintQR={(loc) => {
                    let qrValue = loc.qr_code_value;
                    if (!qrValue) { qrValue = `AK_LOCATION:${loc.id}`; base44.entities.Location.update(loc.id, { qr_code_value: qrValue }).catch(() => {}); }
                    const tc = getLocationTypeConfig(loc.location_type);
                    const breadcrumb = buildLocationPathString(loc.id, locations);
                    const qrSvg = renderQRSVGString(qrValue, 200);
                    const html = `<!DOCTYPE html><html><head><title>Label</title><style>@page{size:4in 3in;margin:0.15in}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:10px}.label{display:flex;gap:16px;align-items:flex-start;height:100%}.qr{flex-shrink:0;padding-top:4px}.info{flex:1;display:flex;flex-direction:column;gap:4px}.name{font-size:22px;font-weight:900;line-height:1.15}.code{font-size:28px;font-weight:900;font-family:'Courier New',monospace;margin:4px 0}.type{font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;font-weight:600}.path{font-size:10px;color:#888;margin-top:4px;word-break:break-word}.qr-id{font-size:7px;color:#bbb;font-family:monospace;margin-top:auto;word-break:break-all}</style></head><body><div class="label"><div class="qr">${qrSvg}</div><div class="info"><div class="name">${loc.location_area}</div>${loc.short_code ? `<div class="code">${loc.short_code}</div>` : ''}<div class="type">${tc.label}</div><div class="path">${breadcrumb}</div><div class="qr-id">${qrValue}</div></div></div></body></html>`;
                    const w = window.open('', '_blank', 'width=500,height=400');
                    if (w) { w.document.write(html); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close(); }; }
                  }}
                />
              </div>
            )}

            {/* Parts content */}
            <div className="flex-1 p-4 overflow-y-auto">
              {filteredParts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <Package className="w-14 h-14 text-gray-600 mb-3" />
                  <h3 className="text-base font-medium text-gray-400 mb-1">Nothing here</h3>
                  <p className="text-sm text-gray-600">This location is empty.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedParts.map(group => (
                    <div key={group.locationId} className="space-y-3">
                      {/* Only show group header when viewing "All" or unassigned */}
                      {(!selectedLocationId || selectedLocationId === 'unassigned') && (
                        <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-gray-900/95 backdrop-blur-sm rounded-lg border-l-4" style={{ borderLeftColor: group.color }}>
                          {(() => { const loc = locations.find(l => l.id === group.locationId); const tc = getLocationTypeConfig(loc?.location_type); const GI = tc.icon; return <GI className="w-5 h-5" style={{ color: group.color }} />; })()}
                          <h3 className="text-base font-bold text-white">{group.locationName}</h3>
                          <span className="text-xs text-gray-400">({group.subLocations.reduce((s, sub) => s + sub.parts.length, 0)})</span>
                        </div>
                      )}
                      {group.subLocations.map(subLoc => (
                        <div key={subLoc.locationId || '_direct'} className={cn(!selectedLocationId && "ml-4", "space-y-2")}>
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
                                return <StoragePartRow key={`${part.id}-${subLoc.locationId}`} part={part} locationQty={part._locationQty} locationReserved={part._locationReserved} locationId={subLoc.locationId || (group.locationId === 'unassigned' ? 'unassigned' : null)} selectedLocationId={selectedLocationId} getInventoryStats={getInventoryStats} getInventoryItemId={getInventoryItemId} vendors={vendors} onPartClick={onPartClick} onOpenGallery={openGallery} partActions={partActions} containerName={ctr?.name} />;
                              })}
                            </div>
                          ) : (
                            <div className={cn("grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3", subLoc.locationName && "ml-4")}>
                              {subLoc.parts.map(part => <StoragePartCard key={`${part.id}-${subLoc.locationId}`} part={part} locationQty={part._locationQty} locationReserved={part._locationReserved} locationId={subLoc.locationId || (group.locationId === 'unassigned' ? 'unassigned' : null)} selectedLocationId={selectedLocationId} getInventoryStats={getInventoryStats} getInventoryItemId={getInventoryItemId} vendors={vendors} onPartClick={onPartClick} onOpenGallery={openGallery} partActions={partActions} />)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {filteredParts.length > 0 && (
              <div className="border-t border-red-900/20 bg-gray-900/30 p-2 px-4">
                <div className="text-xs text-gray-500">{filteredParts.length} parts</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {inventoryModalPart && <AddInventoryModal onClose={() => setInventoryModalPart(null)} preselectedPartId={inventoryModalPart.id} />}
      {orderModalPart && <OrderPartModal part={orderModalPart} onClose={() => setOrderModalPart(null)} />}
      {buildModalPart && <AddToBuildModal part={buildModalPart} onClose={() => setBuildModalPart(null)} />}
      {needToBuyModalPart && <AddToNeedToBuyModal part={needToBuyModalPart} onClose={() => setNeedToBuyModalPart(null)} />}
      {createContainerForLocation && <CreateContainerModal onClose={() => setCreateContainerForLocation(null)} preselectedLocationId={createContainerForLocation} locations={locations} projects={projects} />}
      {moveContainerTarget && <MoveContainerModal container={moveContainerTarget} onClose={() => { setMoveContainerTarget(null); setMoveContainerReturnHome(false); }} locations={locations} inventoryItems={inventoryItems} returnHome={moveContainerReturnHome} />}
      {addToContainerTarget && <AddToContainerModal container={addToContainerTarget} onClose={() => setAddToContainerTarget(null)} inventoryItems={inventoryItems} parts={parts} />}
      {emptyContainerTarget && <EmptyContainerModal container={emptyContainerTarget} onClose={() => setEmptyContainerTarget(null)} locations={locations} containers={containers} inventoryItems={inventoryItems} parts={parts} />}
      <ImageGallery isOpen={galleryState.open} images={galleryState.images} currentIndex={galleryState.currentIndex} onClose={closeGallery} onNavigate={navigateGallery} />
    </>
  );
}