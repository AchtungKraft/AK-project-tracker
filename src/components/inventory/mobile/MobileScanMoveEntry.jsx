import React, { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ScanLine, ArrowLeft, Search, X, Package, MapPin, ChevronRight, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import QRScanner from "../QRScanner";
import { resolveStorageScan } from "@/lib/resolveStorageScan";
import { getLocationTypeConfig, buildLocationPathString } from "../locationTypeConfig";
import { getContainerTypeConfig } from "../containerTypeConfig";

/**
 * MobileScanMoveEntry — Scan-first source picker for mobile move workflow.
 *
 * Flow: SCAN SOURCE → resolves Location/Container → calls onSourceResolved
 *       OR: CHOOSE MANUALLY → search/browse → calls onSourceResolved
 *
 * Props:
 *   locations, containers, inventoryItems, projects
 *   onSourceResolved({ type: 'LOCATION'|'CONTAINER', id, entity })
 *   onClose()
 */
export default function MobileScanMoveEntry({
  locations, containers, inventoryItems, projects,
  onSourceResolved, onClose,
}) {
  const [view, setView] = useState('home'); // home | scanning | scanError | browse
  const [scanError, setScanError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Check if a source has inventory
  const hasInventory = useCallback((type, id) => {
    if (type === 'CONTAINER') {
      return inventoryItems.some(i => i.container_id === id && (i.quantity_on_hand || 0) > 0);
    }
    return inventoryItems.some(i => i.location_id === id && !i.container_id && (i.quantity_on_hand || 0) > 0);
  }, [inventoryItems]);

  const handleScan = useCallback((decodedText) => {
    const result = resolveStorageScan(decodedText, { locations, containers, inventoryItems });
    if (!result.valid) {
      setScanError(result.error || 'Invalid QR code');
      setView('scanError');
      return;
    }
    if (!hasInventory(result.entity_type, result.entity_id)) {
      setScanError('No movable inventory at this location');
      setView('scanError');
      return;
    }
    onSourceResolved({
      type: result.entity_type,
      id: result.entity_id,
      entity: result.entity,
    });
  }, [locations, containers, inventoryItems, hasInventory, onSourceResolved]);

  const handleBrowseSelect = useCallback((type, entity) => {
    onSourceResolved({ type, id: entity.id, entity });
  }, [onSourceResolved]);

  // Browse: locations and containers with inventory
  const browseResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const hasTerm = term.length >= 2;

    const locs = locations
      .filter(l => l.active !== false)
      .filter(l => hasInventory('LOCATION', l.id))
      .filter(l => !hasTerm ||
        l.location_area?.toLowerCase().includes(term) ||
        l.short_code?.toLowerCase().includes(term)
      )
      .slice(0, 20);

    const ctrs = containers
      .filter(c => c.active !== false && c.status !== 'archived')
      .filter(c => hasInventory('CONTAINER', c.id))
      .filter(c => !hasTerm ||
        c.name?.toLowerCase().includes(term) ||
        c.short_code?.toLowerCase().includes(term)
      )
      .slice(0, 20);

    return { locations: locs, containers: ctrs };
  }, [searchTerm, locations, containers, hasInventory]);

  // ── SCANNING ──
  if (view === 'scanning') {
    return (
      <QRScanner
        onScan={handleScan}
        onClose={() => setView('home')}
        className="h-full"
      />
    );
  }

  // ── SCAN ERROR ──
  if (view === 'scanError') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-red-950/50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>
        <p className="text-white text-lg font-bold mb-2">Can't Move From Here</p>
        <p className="text-gray-400 text-sm mb-6 max-w-xs">{scanError}</p>
        <div className="flex gap-3">
          <Button onClick={() => { setScanError(null); setView('scanning'); }}
            className="gap-2 bg-red-600 hover:bg-red-700">
            <ScanLine className="w-4 h-4" /> Scan Another
          </Button>
          <Button onClick={() => { setScanError(null); setView('browse'); }}
            variant="outline" className="border-gray-600 text-gray-300">
            Browse
          </Button>
        </div>
      </div>
    );
  }

  // ── BROWSE ──
  if (view === 'browse') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 shrink-0">
          <Button size="icon" variant="ghost" onClick={() => setView('home')}
            className="h-9 w-9 text-gray-400">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search locations or containers…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-8 bg-gray-900/50 border-gray-700 text-white h-10 text-sm"
              autoFocus
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {browseResults.containers.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 mb-2">Containers</div>
              <div className="space-y-1">
                {browseResults.containers.map(c => {
                  const ctc = getContainerTypeConfig(c.container_type);
                  const CIcon = ctc.icon;
                  const loc = locations.find(l => l.id === c.location_id);
                  const cnt = inventoryItems.filter(i => i.container_id === c.id && (i.quantity_on_hand || 0) > 0).length;
                  return (
                    <button key={c.id} onClick={() => handleBrowseSelect('CONTAINER', c)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-800/50 active:bg-gray-800 text-left transition-colors">
                      <div className="w-10 h-10 rounded flex items-center justify-center shrink-0"
                        style={{ backgroundColor: (c.color || ctc.color) + '15' }}>
                        <CIcon className="w-5 h-5" style={{ color: c.color || ctc.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white font-medium">{c.name}</span>
                        {c.short_code && <span className="text-xs font-mono text-gray-400 ml-2">{c.short_code}</span>}
                        <div className="text-xs text-gray-500 truncate">{loc?.location_area || 'No location'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm text-white font-semibold">{cnt}</div>
                        <div className="text-[10px] text-gray-500">items</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {browseResults.locations.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 mb-2">Locations</div>
              <div className="space-y-1">
                {browseResults.locations.map(loc => {
                  const ltc = getLocationTypeConfig(loc.location_type);
                  const LIcon = ltc.icon;
                  const cnt = inventoryItems.filter(i => i.location_id === loc.id && !i.container_id && (i.quantity_on_hand || 0) > 0).length;
                  return (
                    <button key={loc.id} onClick={() => handleBrowseSelect('LOCATION', loc)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-800/50 active:bg-gray-800 text-left transition-colors">
                      <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center shrink-0">
                        <LIcon className="w-5 h-5" style={{ color: loc.color || ltc.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">{loc.location_area}</div>
                        <div className="text-xs text-gray-500 truncate">{buildLocationPathString(loc.id, locations)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm text-white font-semibold">{cnt}</div>
                        <div className="text-[10px] text-gray-500">loose</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {browseResults.locations.length === 0 && browseResults.containers.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              {searchTerm.length >= 2 ? `No results for "${searchTerm}"` : 'No locations or containers with inventory'}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── HOME (default) ──
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 shrink-0">
        <Button size="icon" variant="ghost" onClick={onClose} className="h-9 w-9 text-gray-400">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-lg font-bold text-white">Move Inventory</h2>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-20 h-20 rounded-full bg-red-950/30 border border-red-800/30 flex items-center justify-center mb-2">
          <ScanLine className="w-10 h-10 text-red-400" />
        </div>
        <h3 className="text-xl font-bold text-white">Where are you picking from?</h3>
        <p className="text-sm text-gray-400 max-w-xs">
          Scan the QR code on the shelf, rack, or container you're taking parts from.
        </p>

        <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
          <Button onClick={() => setView('scanning')}
            className="h-16 text-lg gap-3 bg-red-600 hover:bg-red-700">
            <ScanLine className="w-7 h-7" /> Scan Source
          </Button>
          <Button onClick={() => setView('browse')}
            variant="outline"
            className="h-12 text-base gap-2 border-gray-600 text-gray-300">
            <Search className="w-5 h-5" /> Choose Manually
          </Button>
        </div>
      </div>
    </div>
  );
}