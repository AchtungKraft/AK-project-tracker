import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Search, ChevronRight, Package, LayoutGrid, List, X, ArrowLeft, ScanLine
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig, buildLocationPathString } from "./locationTypeConfig";
import { getContainerTypeConfig } from "./containerTypeConfig";
import { renderQRSVGString } from "./QRCodeSVG";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import StorageHome from "./StorageHome";
import StorageNavigatePanel from "./StorageNavigatePanel";
import StorageObjectPreview from "./StorageObjectPreview";
import StorageWorkspaceHeader from "./StorageWorkspaceHeader";
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
import ContainerCard from "./ContainerCard";
import CreateContainerModal from "./CreateContainerModal";
import MoveContainerModal from "./MoveContainerModal";
import AddToContainerModal from "./AddToContainerModal";
import EmptyContainerModal from "./EmptyContainerModal";
import ScannerModal from "./ScannerModal";
import InventoryMoveWorkflow from "./move/InventoryMoveWorkflow";
import PutAwayWorkflow from "./putaway/PutAwayWorkflow";

const STORAGE_KEY = 'achtung_inventory_locations_state';

export default function InventoryLocations({ onPartClick, urlLocationId }) {
  const isMobile = useIsMobile();

  // --- Persisted state ---
  const [selectedLocationId, setSelectedLocationIdRaw] = useState(() => {
    if (urlLocationId) return urlLocationId;
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s).selectedLocationId ?? null; } catch (e) {}
    return null;
  });
  const [expandedLocations, setExpandedLocations] = useState(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s).expandedLocations || {}; } catch (e) {}
    return {};
  });
  const [showEmptyLocations, setShowEmptyLocations] = useState(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s).showEmptyLocations || false; } catch (e) {}
    return false;
  });
  const [viewMode, setViewMode] = useState(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s).viewMode || 'list'; } catch (e) {}
    return 'list';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const { favorites, recents, toggleFavorite, isFavorite, addRecent } = useLocationFavorites();
  const searchInputRef = React.useRef(null);
  const [flashId, setFlashId] = useState(null); // briefly highlight a part/container after search

  // Selection state
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [previewPart, setPreviewPart] = useState(null); // desktop right-panel part preview

  // Keyboard: Escape clears search, Cmd+K focuses search
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (searchTerm) setSearchTerm('');
        else if (previewPart || selectedContainer) { setPreviewPart(null); setSelectedContainer(null); }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [searchTerm, previewPart, selectedContainer]);

  // Modals
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [moveWorkflowSource, setMoveWorkflowSource] = useState(null); // { type, id, entity }
  const [putAwayOpen, setPutAwayOpen] = useState(false);

  // URL sync
  const setSelectedLocationId = useCallback((id) => {
    setSelectedLocationIdRaw(id);
    const url = new URL(window.location);
    if (id && id !== 'unassigned') url.searchParams.set('location', id);
    else if (id === 'unassigned') url.searchParams.set('location', 'unassigned');
    else url.searchParams.delete('location');
    url.searchParams.set('tab', 'locations');
    window.history.replaceState({}, '', url);
  }, []);

  useEffect(() => { if (urlLocationId !== undefined && urlLocationId !== selectedLocationId) setSelectedLocationIdRaw(urlLocationId); }, [urlLocationId]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedLocationId, expandedLocations, showEmptyLocations, viewMode })); } catch (e) {} }, [selectedLocationId, expandedLocations, showEmptyLocations, viewMode]);

  // --- Data ---
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: () => base44.entities.Location.list(), staleTime: 60000, gcTime: 300000, refetchOnWindowFocus: false });
  const { data: inventoryItems = [] } = useQuery({ queryKey: ['inventoryItems'], queryFn: () => base44.entities.InventoryItem.list(), staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false });
  const { data: parts = [] } = useQuery({ queryKey: ['parts'], queryFn: () => base44.entities.Part.list(), staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false });
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: () => base44.entities.Vendor.list(), staleTime: 60000, gcTime: 300000, refetchOnWindowFocus: false });
  const { data: commitments = [] } = useQuery({ queryKey: ['partCommitments'], queryFn: () => base44.entities.PartCommitment.filter({ commitment_status: { $nin: ['cancelled', 'closed'] } }, '-created_date', 200), staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list(), staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false });
  const { data: containers = [] } = useQuery({ queryKey: ['storageContainers'], queryFn: () => base44.entities.StorageContainer.filter({ active: true }), staleTime: 30000, gcTime: 120000, refetchOnWindowFocus: false });
  const { data: orders = [] } = useQuery({ queryKey: ['orders'], queryFn: () => base44.entities.Order.list(), staleTime: 60000, gcTime: 300000, refetchOnWindowFocus: false });
  const { data: lineItems = [] } = useQuery({ queryKey: ['partPurchaseLineItems'], queryFn: () => base44.entities.PartPurchaseLineItem.list(), staleTime: 60000, gcTime: 300000, refetchOnWindowFocus: false });

  // --- Derived ---
  const getDescendants = useCallback((locationId) => {
    const d = [locationId]; locations.filter(l => l.parent_id === locationId).forEach(c => d.push(...getDescendants(c.id))); return d;
  }, [locations]);

  const locationPartCounts = useMemo(() => {
    const counts = {};
    const getDesc = (locId) => { const d = [locId]; locations.filter(l => l.parent_id === locId).forEach(c => d.push(...getDesc(c.id))); return d; };
    locations.forEach(loc => { const ids = getDesc(loc.id); const s = new Set(); inventoryItems.forEach(item => { if (ids.includes(item.location_id) && (item.quantity_on_hand || 0) > 0) s.add(item.part_id); }); counts[loc.id] = s.size; });
    const u = new Set(); inventoryItems.forEach(item => { if (!item.location_id && (item.quantity_on_hand || 0) > 0) u.add(item.part_id); }); counts['unassigned'] = u.size;
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
      let s = 0; const pn = p.vendor_part_number?.toLowerCase() || '', nm = p.part_name?.toLowerCase() || '';
      if (pn === term) s = 100; else if (pn.startsWith(term)) s = 90; else if (pn.includes(term)) s = 80;
      else if (nm === term) s = 70; else if (nm.startsWith(term)) s = 60; else if (nm.includes(term)) s = 50;
      if (s > 0) pr.push({ item: p, score: s });
    });
    containers.forEach(c => {
      let s = 0; const cd = c.short_code?.toLowerCase() || '', nm = c.name?.toLowerCase() || '', qr = c.qr_code_value?.toLowerCase() || '';
      if (cd === term) s = 100; else if (cd.startsWith(term)) s = 90; else if (cd.includes(term)) s = 80;
      else if (nm === term) s = 70; else if (nm.startsWith(term)) s = 60; else if (nm.includes(term)) s = 50;
      else if (qr.includes(term)) s = 30;
      else { const loc = c.location_id ? locations.find(l => l.id === c.location_id) : null; if (loc?.location_area?.toLowerCase().includes(term)) s = 20; }
      if (s > 0) cr.push({ item: c, score: s });
    });
    locations.forEach(loc => {
      if (!loc.active && loc.active !== undefined) return;
      let s = 0; const nm = loc.location_area?.toLowerCase() || '', cd = loc.short_code?.toLowerCase() || '', qr = loc.qr_code_value?.toLowerCase() || '';
      if (cd === term || qr === term) s = 100; else if (nm === term) s = 95; else if (cd.startsWith(term) || qr.startsWith(term)) s = 80;
      else if (nm.startsWith(term)) s = 75; else if (cd.includes(term) || nm.includes(term)) s = 60; else if (qr.includes(term)) s = 50;
      if (s > 0) lr.push({ item: loc, score: s });
    });
    return {
      parts: pr.sort((a, b) => b.score - a.score).slice(0, 10).map(s => s.item),
      containers: cr.sort((a, b) => b.score - a.score).slice(0, 10).map(s => s.item),
      locations: lr.sort((a, b) => b.score - a.score).slice(0, 15).map(s => s.item),
      total: pr.length + cr.length + lr.length,
    };
  }, [searchTerm, hasSearch, parts, containers, locations, inventoryItems]);

  const filteredParts = useMemo(() => {
    if (!searchTerm || !selectedLocationId) return partsAtLocation;
    const term = searchTerm.toLowerCase();
    return partsAtLocation.filter(p => p.part_name?.toLowerCase().includes(term) || p.vendor_part_number?.toLowerCase().includes(term));
  }, [partsAtLocation, searchTerm, selectedLocationId]);

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
    setPreviewPart(null);
    if (!isMobile) { /* don't clear search on desktop — it stays in overlay */ }
    else setSearchTerm('');
    addRecent(id);
    if (id && id !== 'unassigned') {
      const newExp = { ...expandedLocations }; let cur = id;
      while (cur) { newExp[cur] = true; const loc = locations.find(l => l.id === cur); cur = loc?.parent_id; }
      setExpandedLocations(newExp);
    }
  };

  const handleSelectContainer = (c) => {
    setSelectedContainer(c);
    setPreviewPart(null);
    // On desktop, also navigate center to container's location
    if (!isMobile && c.location_id && c.location_id !== selectedLocationId) {
      setSelectedLocationId(c.location_id);
      addRecent(c.location_id);
    }
  };

  const handlePartClick = (part) => {
    if (isMobile) {
      onPartClick?.(part);
    } else {
      // Desktop: show in right preview panel
      setPreviewPart(part);
      setSelectedContainer(null);
    }
  };

  const handlePartFullDetails = (part) => {
    onPartClick?.(part);
  };

  // Desktop search result handlers — update workspace panels, don't navigate away
  const triggerFlash = (id) => { setFlashId(id); setTimeout(() => setFlashId(null), 1200); };

  const handleSearchSelectPart = (part) => {
    const item = inventoryItems.find(i => i.part_id === part.id && (i.quantity_on_hand || 0) > 0);
    if (item?.location_id) {
      setSelectedLocationId(item.location_id);
      addRecent(item.location_id);
      // Expand tree to this location
      const newExp = { ...expandedLocations }; let cur = item.location_id;
      while (cur) { newExp[cur] = true; const loc = locations.find(l => l.id === cur); cur = loc?.parent_id; }
      setExpandedLocations(newExp);
    }
    if (isMobile) { onPartClick?.(part); }
    else { setPreviewPart(part); setSelectedContainer(null); triggerFlash(part.id); }
    setSearchTerm('');
  };

  const handleSearchSelectContainer = (c) => {
    if (c.location_id) {
      setSelectedLocationId(c.location_id);
      addRecent(c.location_id);
      const newExp = { ...expandedLocations }; let cur = c.location_id;
      while (cur) { newExp[cur] = true; const loc = locations.find(l => l.id === cur); cur = loc?.parent_id; }
      setExpandedLocations(newExp);
    }
    if (isMobile) { setSelectedContainer(c); }
    else { setSelectedContainer(c); setPreviewPart(null); triggerFlash(c.id); }
    setSearchTerm('');
  };

  const handleSearchSelectLocation = (loc) => {
    handleLocationSelect(loc.id);
    setSearchTerm('');
  };

  const goHome = () => { setSelectedLocationId(null); setSelectedContainer(null); setPreviewPart(null); setSearchTerm(''); };

  // Scanner navigation handlers
  const handleScanOpenLocation = (locId) => {
    handleLocationSelect(locId);
    setScannerOpen(false);
  };
  const handleScanOpenContainer = (ctr) => {
    handleSelectContainer(ctr);
    setScannerOpen(false);
  };

  // Move workflow handlers
  const handleStartMoveFromLocation = (locId) => {
    const loc = locations.find(l => l.id === locId);
    if (loc) setMoveWorkflowSource({ type: 'LOCATION', id: locId, entity: loc });
  };
  const handleStartMoveFromContainer = (ctr) => {
    setMoveWorkflowSource({ type: 'CONTAINER', id: ctr.id, entity: ctr });
  };
  const handleMoveWorkflowClose = () => {
    setMoveWorkflowSource(null);
  };
  const handleMoveNavLocation = (locId) => {
    handleLocationSelect(locId);
    setMoveWorkflowSource(null);
  };
  const handleMoveNavContainer = (ctr) => {
    handleSelectContainer(ctr);
    setMoveWorkflowSource(null);
  };
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

  const partActions = { onAddInventory: setInventoryModalPart, onOrderPart: setOrderModalPart, onAddToBuild: setBuildModalPart, onAddToNeedToBuy: setNeedToBuyModalPart, onViewDetails: handlePartClick };

  const printLocationQR = (loc) => {
    let qrValue = loc.qr_code_value;
    if (!qrValue) { qrValue = `AK_LOCATION:${loc.id}`; base44.entities.Location.update(loc.id, { qr_code_value: qrValue }).catch(() => {}); }
    const tc = getLocationTypeConfig(loc.location_type);
    const breadcrumb = buildLocationPathString(loc.id, locations);
    const qrSvg = renderQRSVGString(qrValue, 200);
    const html = `<!DOCTYPE html><html><head><title>Label</title><style>@page{size:4in 3in;margin:0.15in}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:10px}.label{display:flex;gap:16px;align-items:flex-start;height:100%}.qr{flex-shrink:0;padding-top:4px}.info{flex:1;display:flex;flex-direction:column;gap:4px}.name{font-size:22px;font-weight:900;line-height:1.15}.code{font-size:28px;font-weight:900;font-family:'Courier New',monospace;margin:4px 0}.type{font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;font-weight:600}.path{font-size:10px;color:#888;margin-top:4px;word-break:break-word}.qr-id{font-size:7px;color:#bbb;font-family:monospace;margin-top:auto;word-break:break-all}</style></head><body><div class="label"><div class="qr">${qrSvg}</div><div class="info"><div class="name">${loc.location_area}</div>${loc.short_code ? `<div class="code">${loc.short_code}</div>` : ''}<div class="type">${tc.label}</div><div class="path">${breadcrumb}</div><div class="qr-id">${qrValue}</div></div></div></body></html>`;
    const w = window.open('', '_blank', 'width=500,height=400');
    if (w) { w.document.write(html); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close(); }; }
  };

  // --- Shared search results renderer ---
  const showSearchOverlay = hasSearch && searchResults && searchResults.total > 0;

  const renderSearchResults = () => (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      {searchResults.parts.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 mb-2">Parts</div>
          <div className="space-y-1">
            {searchResults.parts.map(p => {
              const items = inventoryItems.filter(i => i.part_id === p.id && (i.quantity_on_hand || 0) > 0);
              const fi = items[0]; const loc = fi?.location_id ? locations.find(l => l.id === fi.location_id) : null;
              const ctr = fi?.container_id ? containers.find(c => c.id === fi.container_id) : null;
              const qty = items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
              return (
                <button key={p.id} onClick={() => handleSearchSelectPart(p)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 text-left transition-colors">
                  {p.featured_photo || p.photos?.[0] ? <img src={p.featured_photo || p.photos[0]} alt="" className="w-9 h-9 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                  : <div className="w-9 h-9 rounded bg-gray-800 flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-gray-600" /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">{p.vendor_part_number && <span className="text-xs font-mono font-bold text-gray-300">{p.vendor_part_number}</span>}<span className="text-sm text-white truncate">{p.part_name}</span></div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">{ctr && <span className="text-indigo-400">📦 {ctr.name} · </span>}{loc ? buildLocationPathString(loc.id, locations) || loc.location_area : 'Unassigned'}</div>
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
                <button key={c.id} onClick={() => handleSearchSelectContainer(c)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 text-left transition-colors">
                  {c.photo ? <img src={c.photo} alt="" className="w-9 h-9 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                  : <div className="w-9 h-9 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: (c.color || ctc.color) + '15' }}><ctc.icon className="w-4 h-4" style={{ color: c.color || ctc.color }} /></div>}
                  <div className="flex-1 min-w-0"><span className="text-sm text-white truncate">{c.name}</span>{c.short_code && <span className="text-xs font-mono text-gray-400 ml-2">{c.short_code}</span>}<div className="text-xs text-gray-500 truncate mt-0.5">{loc?.location_area || 'No location'}</div></div>
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
                <button key={loc.id} onClick={() => handleSearchSelectLocation(loc)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 text-left transition-colors">
                  <div className="w-9 h-9 rounded bg-gray-800 flex items-center justify-center shrink-0"><LI className="w-4 h-4" style={{ color: loc.color || ltc.color }} /></div>
                  <div className="flex-1 min-w-0"><div className="text-sm text-white truncate">{loc.location_area}</div><div className="text-xs text-gray-500 truncate mt-0.5">{buildLocationPathString(loc.id, locations)}</div></div>
                  <div className="text-right shrink-0"><div className="text-sm text-white font-semibold">{locationPartCounts[loc.id] || 0}</div><div className="text-[10px] text-gray-500">parts</div></div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // --- Shared location content renderer (center pane on desktop, main on mobile) ---
  const renderLocationContent = () => (
    <div className="flex-1 p-3 overflow-y-auto">
      {filteredParts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          <Package className="w-12 h-12 text-gray-600 mb-3" />
          <h3 className="text-sm font-medium text-gray-400 mb-1">Nothing here</h3>
          <p className="text-xs text-gray-600">This location is empty.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Section label — only when viewing a specific location (not "All") */}
          {selectedLocationId && selectedLocationId !== 'unassigned' && (
            <div className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold px-1">Loose Parts</div>
          )}
          {groupedParts.map(group => (
            <div key={group.locationId} className="space-y-2">
              {(!selectedLocationId || selectedLocationId === 'unassigned') && (
                <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-gray-900/95 backdrop-blur-sm rounded border-l-4" style={{ borderLeftColor: group.color }}>
                  {(() => { const loc = locations.find(l => l.id === group.locationId); const tc = getLocationTypeConfig(loc?.location_type); const GI = tc.icon; return <GI className="w-4 h-4" style={{ color: group.color }} />; })()}
                  <h3 className="text-sm font-bold text-white">{group.locationName}</h3>
                  <span className="text-xs text-gray-400">({group.subLocations.reduce((s, sub) => s + sub.parts.length, 0)})</span>
                </div>
              )}
              {group.subLocations.map(subLoc => (
                <div key={subLoc.locationId || '_direct'} className={cn(!selectedLocationId && "ml-3", "space-y-1.5")}>
                  {subLoc.locationName && (
                    <div className="flex items-center gap-2 px-2 py-1 bg-gray-800/50 rounded border-l-2" style={{ borderLeftColor: subLoc.color }}>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-xs font-medium text-gray-300">{subLoc.locationName}</span>
                      <span className="text-[10px] text-gray-500">({subLoc.parts.length})</span>
                    </div>
                  )}
                  {viewMode === 'list' ? (
                    <div className={cn("space-y-1.5", subLoc.locationName && "ml-3")}>
                      {subLoc.parts.map(part => {
                        const itemForPart = inventoryItems.find(i => i.part_id === part.id && i.location_id === (subLoc.locationId || null) && (i.quantity_on_hand || 0) > 0);
                        const ctr = itemForPart?.container_id ? containers.find(c => c.id === itemForPart.container_id) : null;
                        return <StoragePartRow key={`${part.id}-${subLoc.locationId}`} part={part} locationQty={part._locationQty} locationReserved={part._locationReserved} locationId={subLoc.locationId || (group.locationId === 'unassigned' ? 'unassigned' : null)} selectedLocationId={selectedLocationId} getInventoryStats={getInventoryStats} getInventoryItemId={getInventoryItemId} vendors={vendors} onPartClick={handlePartClick} onOpenGallery={openGallery} partActions={partActions} containerName={ctr?.name} isSelected={previewPart?.id === part.id} isFlashing={flashId === part.id} />;
                      })}
                    </div>
                  ) : (
                    <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-2", subLoc.locationName && "ml-3")}>
                      {subLoc.parts.map(part => <StoragePartCard key={`${part.id}-${subLoc.locationId}`} part={part} locationQty={part._locationQty} locationReserved={part._locationReserved} locationId={subLoc.locationId || (group.locationId === 'unassigned' ? 'unassigned' : null)} selectedLocationId={selectedLocationId} getInventoryStats={getInventoryStats} getInventoryItemId={getInventoryItemId} vendors={vendors} onPartClick={handlePartClick} onOpenGallery={openGallery} partActions={partActions} isSelected={previewPart?.id === part.id} isFlashing={flashId === part.id} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Shared modals
  const renderModals = () => (
    <>
      {inventoryModalPart && <AddInventoryModal onClose={() => setInventoryModalPart(null)} preselectedPartId={inventoryModalPart.id} />}
      {orderModalPart && <OrderPartModal part={orderModalPart} onClose={() => setOrderModalPart(null)} />}
      {buildModalPart && <AddToBuildModal part={buildModalPart} onClose={() => setBuildModalPart(null)} />}
      {needToBuyModalPart && <AddToNeedToBuyModal part={needToBuyModalPart} onClose={() => setNeedToBuyModalPart(null)} />}
      {createContainerForLocation && <CreateContainerModal onClose={() => setCreateContainerForLocation(null)} preselectedLocationId={createContainerForLocation} locations={locations} projects={projects} />}
      {moveContainerTarget && <MoveContainerModal container={moveContainerTarget} onClose={() => { setMoveContainerTarget(null); setMoveContainerReturnHome(false); }} locations={locations} inventoryItems={inventoryItems} returnHome={moveContainerReturnHome} />}
      {addToContainerTarget && <AddToContainerModal container={addToContainerTarget} onClose={() => setAddToContainerTarget(null)} inventoryItems={inventoryItems} parts={parts} />}
      {emptyContainerTarget && <EmptyContainerModal container={emptyContainerTarget} onClose={() => setEmptyContainerTarget(null)} locations={locations} containers={containers} inventoryItems={inventoryItems} parts={parts} />}
      <ImageGallery isOpen={galleryState.open} images={galleryState.images} currentIndex={galleryState.currentIndex} onClose={closeGallery} onNavigate={navigateGallery} />
      {scannerOpen && <ScannerModal locations={locations} containers={containers} inventoryItems={inventoryItems} projects={projects} onOpenLocation={handleScanOpenLocation} onOpenContainer={handleScanOpenContainer} onClose={() => setScannerOpen(false)} />}
      {moveWorkflowSource && (
        <InventoryMoveWorkflow
          source={moveWorkflowSource}
          locations={locations} containers={containers} inventoryItems={inventoryItems} parts={parts} projects={projects}
          onClose={handleMoveWorkflowClose}
          onNavigateLocation={handleMoveNavLocation}
          onNavigateContainer={handleMoveNavContainer}
        />
      )}
      {putAwayOpen && (
        <PutAwayWorkflow
          locations={locations} containers={containers} inventoryItems={inventoryItems} parts={parts} projects={projects}
          orders={orders} lineItems={lineItems} commitments={commitments}
          onClose={() => setPutAwayOpen(false)}
          onNavigateLocation={(id) => { handleLocationSelect(id); setPutAwayOpen(false); }}
          onNavigateContainer={(ctr) => { handleSelectContainer(ctr); setPutAwayOpen(false); }}
        />
      )}
    </>
  );

  const containerHandlers = {
    onSelectContainer: handleSelectContainer,
    onMoveContainer: (c) => { setMoveContainerReturnHome(false); setMoveContainerTarget(c); },
    onCreateContainer: (locId) => setCreateContainerForLocation(locId),
  };

  // ===========================
  // MOBILE — Object-first flow
  // ===========================
  if (isMobile) {
    const mobileIsHome = !selectedLocationId && !selectedContainer && !showSearchOverlay;
    const mobileIsLocation = selectedLocationId && !selectedContainer;
    const mobileIsContainer = !!selectedContainer;

    return (
      <>
        <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30">
          {/* Search bar */}
          <div className="p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
            <div className="flex items-center gap-2">
              {!mobileIsHome && !showSearchOverlay && (
                <Button size="icon" variant="ghost" onClick={mobileIsContainer ? () => setSelectedContainer(null) : goHome} className="h-9 w-9 text-gray-400 shrink-0">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              )}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input placeholder="Find a part, container, or shelf…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn("pl-11 pr-10 bg-gray-900/50 border-gray-700 text-white", mobileIsHome ? "h-12 text-base" : "h-10 text-sm")} />
                {searchTerm && <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => setScannerOpen(true)}
                className="h-10 w-10 text-gray-400 hover:text-red-400 shrink-0" title="Scan QR">
                <ScanLine className="w-5 h-5" />
              </Button>
              {mobileIsLocation && (
                <div className="flex items-center gap-0.5 bg-black/40 border border-gray-700 rounded-lg p-0.5 shrink-0">
                  <Button size="sm" variant={viewMode === 'list' ? 'default' : 'ghost'} onClick={() => setViewMode('list')} className={cn("h-7 px-1.5", viewMode === 'list' ? 'bg-red-600 text-white' : 'text-gray-400')}><List className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant={viewMode === 'cards' ? 'default' : 'ghost'} onClick={() => setViewMode('cards')} className={cn("h-7 px-1.5", viewMode === 'cards' ? 'bg-red-600 text-white' : 'text-gray-400')}><LayoutGrid className="w-3.5 h-3.5" /></Button>
                </div>
              )}
            </div>
          </div>

          {showSearchOverlay && renderSearchResults()}

          {mobileIsHome && !showSearchOverlay && (
            <StorageHome favorites={favorites} recents={recents} locations={locations} containers={containers}
              inventoryItems={inventoryItems} locationPartCounts={locationPartCounts} showEmptyLocations={showEmptyLocations}
              onSelectLocation={handleLocationSelect} onSelectContainer={handleSelectContainer}
              onToggleEmpty={handleToggleEmpty} expandedLocations={expandedLocations}
              onToggleExpand={(id) => setExpandedLocations(prev => ({ ...prev, [id]: !prev[id] }))}
              onToggleFavorite={toggleFavorite} isFavorite={isFavorite}
              onOpenPutAway={() => setPutAwayOpen(true)} />
          )}

          {mobileIsContainer && !showSearchOverlay && (
            <ContainerDetailPanel container={selectedContainer} locations={locations} inventoryItems={inventoryItems}
              parts={parts} projects={projects} vendors={vendors}
              onClose={() => setSelectedContainer(null)}
              onMove={(c) => { setMoveContainerReturnHome(false); setMoveContainerTarget(c); }}
              onReturnHome={(c) => { setMoveContainerReturnHome(true); setMoveContainerTarget(c); }}
              onAddParts={(c) => setAddToContainerTarget(c)}
              onEmptyContainer={(c) => setEmptyContainerTarget(c)}
              onMoveFromContainer={handleStartMoveFromContainer}
              onPartClick={onPartClick} onOpenGallery={openGallery} partActions={partActions}
              getInventoryStats={getInventoryStats} getInventoryItemId={getInventoryItemId} />
          )}

          {mobileIsLocation && !showSearchOverlay && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedLocationId !== 'unassigned' && (
                <div className="border-b border-red-900/20 bg-gray-900/20 overflow-y-auto" style={{ maxHeight: '45%' }}>
                  <LocationDetailPanel locationId={selectedLocationId} locations={locations} inventoryItems={inventoryItems}
                    parts={parts} projects={projects} commitments={commitments} containers={containers}
                    onNavigateLocation={handleLocationSelect} isFavorite={isFavorite(selectedLocationId)}
                    onToggleFavorite={toggleFavorite} onSelectContainer={handleSelectContainer}
                    onMoveContainer={containerHandlers.onMoveContainer} onCreateContainer={containerHandlers.onCreateContainer}
                    onMoveFromLocation={handleStartMoveFromLocation}
                    onPrintQR={printLocationQR} />
                </div>
              )}
              {renderLocationContent()}
            </div>
          )}
        </div>
        {renderModals()}
      </>
    );
  }

  // ==============================
  // DESKTOP — Persistent workspace
  // ==============================
  return (
    <>
      <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30 h-[calc(100vh-8rem)] overflow-hidden">
        {/* Global search bar */}
        <div className="px-3 py-2 bg-black/40 backdrop-blur-xl border-b border-red-900/30 relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input ref={searchInputRef} placeholder="Find a part, container, or shelf…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10 bg-gray-900/50 border-gray-700 text-white h-9 text-sm" />
              {searchTerm ? (
                <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
              ) : (
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-gray-600 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 font-mono pointer-events-none">⌘K</kbd>
              )}
            </div>
            {/* Scan + View toggle */}
            <Button size="sm" variant="outline" onClick={() => setScannerOpen(true)}
              className="h-9 gap-1.5 border-gray-700 text-gray-300 hover:text-red-400 hover:border-red-700 shrink-0">
              <ScanLine className="w-4 h-4" /> Scan
            </Button>
            <div className="flex items-center gap-0.5 bg-black/40 border border-gray-700 rounded-lg p-0.5 shrink-0">
              <Button size="sm" variant={viewMode === 'list' ? 'default' : 'ghost'} onClick={() => setViewMode('list')} className={cn("h-7 px-1.5", viewMode === 'list' ? 'bg-red-600 text-white' : 'text-gray-400')}><List className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant={viewMode === 'cards' ? 'default' : 'ghost'} onClick={() => setViewMode('cards')} className={cn("h-7 px-1.5", viewMode === 'cards' ? 'bg-red-600 text-white' : 'text-gray-400')}><LayoutGrid className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          {/* Desktop search command-palette overlay */}
          {showSearchOverlay && (
            <>
              <div className="fixed inset-0 z-40" onClick={clearSearch} />
              <div className="absolute left-3 right-3 top-full z-50 bg-gray-900 border border-gray-700 rounded-b-lg shadow-2xl max-h-[55vh] overflow-y-auto mt-0.5">
                {renderSearchResults()}
              </div>
            </>
          )}
        </div>

        {/* Three-panel workspace */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT — Navigate (~18%) */}
          <div className="w-[200px] xl:w-[220px] shrink-0 border-r border-gray-800 bg-black/20">
            <StorageNavigatePanel
              favorites={favorites} recents={recents} locations={locations}
              locationPartCounts={locationPartCounts} showEmptyLocations={showEmptyLocations}
              selectedLocationId={selectedLocationId} expandedLocations={expandedLocations}
              onSelectLocation={handleLocationSelect}
              onToggleExpand={(id) => setExpandedLocations(prev => ({ ...prev, [id]: !prev[id] }))}
              onToggleFavorite={toggleFavorite} isFavorite={isFavorite}
              onToggleEmpty={handleToggleEmpty}
              inventoryItems={inventoryItems}
              onOpenPutAway={() => setPutAwayOpen(true)}
            />
          </div>

          {/* CENTER + INSPECTOR share a workspace header */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Workspace header — persistent location anchor */}
            <StorageWorkspaceHeader
              locationId={selectedLocationId}
              locations={locations}
              selectedObjectLabel={
                selectedContainer ? selectedContainer.name
                : previewPart ? previewPart.part_name
                : null
              }
            />

            <div className="flex-1 flex overflow-hidden">
              {/* CENTER — Current Place */}
              <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                {selectedLocationId && selectedLocationId !== 'unassigned' ? (
                  <>
                    <div className="border-b border-red-900/20 bg-gray-900/20 overflow-y-auto shrink-0" style={{ maxHeight: '40%' }}>
                      <LocationDetailPanel locationId={selectedLocationId} locations={locations} inventoryItems={inventoryItems}
                        parts={parts} projects={projects} commitments={commitments} containers={containers}
                        onNavigateLocation={handleLocationSelect} isFavorite={isFavorite(selectedLocationId)}
                        onToggleFavorite={toggleFavorite} onSelectContainer={handleSelectContainer}
                        onMoveContainer={containerHandlers.onMoveContainer} onCreateContainer={containerHandlers.onCreateContainer}
                        onMoveFromLocation={handleStartMoveFromLocation}
                        onPrintQR={printLocationQR} selectedContainerId={selectedContainer?.id} flashId={flashId} />
                    </div>
                    {renderLocationContent()}
                    {filteredParts.length > 0 && (
                      <div className="border-t border-red-900/20 bg-gray-900/30 p-1.5 px-3 shrink-0">
                        <div className="text-[10px] text-gray-500">{filteredParts.length} parts</div>
                      </div>
                    )}
                  </>
                ) : selectedLocationId === 'unassigned' ? (
                  <>
                    {renderLocationContent()}
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                    <Package className="w-12 h-12 text-gray-700 mb-3" />
                    <h3 className="text-sm font-medium text-gray-400">Select a location</h3>
                    <p className="text-xs text-gray-600 mt-1">Choose from favorites, recent, or browse the tree.</p>
                  </div>
                )}
              </div>

              {/* RIGHT — Inspector */}
              <div className="w-[260px] xl:w-[300px] shrink-0 bg-black/20 border-l border-gray-800">
                <StorageObjectPreview
                  selectedPart={previewPart}
                  selectedContainer={selectedContainer}
                  locations={locations} inventoryItems={inventoryItems} parts={parts} projects={projects} vendors={vendors} containers={containers}
                  onMoveContainer={(c) => { setMoveContainerReturnHome(false); setMoveContainerTarget(c); }}
                  onReturnHomeContainer={(c) => { setMoveContainerReturnHome(true); setMoveContainerTarget(c); }}
                  onAddPartsToContainer={(c) => setAddToContainerTarget(c)}
                  onEmptyContainer={(c) => setEmptyContainerTarget(c)}
                  onMoveFromContainer={handleStartMoveFromContainer}
                  onPartClick={handlePartFullDetails}
                  onClose={() => { setPreviewPart(null); setSelectedContainer(null); }}
                  getInventoryStats={getInventoryStats}
                  currentLocationId={selectedLocationId}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      {renderModals()}
    </>
  );
}