import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanLine, Search, MapPin, Package, X, ArrowLeft, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig, buildLocationPathString } from "../locationTypeConfig";
import { getContainerTypeConfig } from "../containerTypeConfig";
import QRScanner from "../QRScanner";
import { resolveStorageScan } from "@/lib/resolveStorageScan";

/**
 * MoveDestinationPicker — Scan or browse to choose a destination.
 *
 * Props:
 *   source           — { type: 'LOCATION'|'CONTAINER', id, entity }
 *   locations, containers, inventoryItems
 *   onSelectDestination({ type, id, entity, location_id })
 *   onBack, onCancel
 */
export default function MoveDestinationPicker({
  source, locations, containers, inventoryItems, projects,
  onSelectDestination, onBack, onCancel,
}) {
  const [view, setView] = useState('choose'); // choose | scanning | browse
  const [scanError, setScanError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const validateDestination = useCallback((entityType, entityId) => {
    // Reject same source
    if (source.type === entityType && source.id === entityId) {
      return 'This is the current source — choose a different destination';
    }
    // For location source: reject same location if no container change
    if (source.type === 'LOCATION' && entityType === 'LOCATION' && source.id === entityId) {
      return 'Already at this location';
    }
    // For container source: reject same container
    if (source.type === 'CONTAINER' && entityType === 'CONTAINER' && source.id === entityId) {
      return 'Already in this container';
    }
    return null;
  }, [source]);

  const handleScan = useCallback((decodedText) => {
    const result = resolveStorageScan(decodedText, { locations, containers, inventoryItems });

    if (!result.valid) {
      setScanError(result.error || 'Invalid QR code');
      return;
    }

    const err = validateDestination(result.entity_type, result.entity_id);
    if (err) {
      setScanError(err);
      return;
    }

    setScanError(null);
    const loc = result.entity_type === 'CONTAINER'
      ? (result.entity.location_id || null)
      : result.entity_id;

    onSelectDestination({
      type: result.entity_type,
      id: result.entity_id,
      entity: result.entity,
      location_id: result.entity_type === 'LOCATION' ? result.entity_id : result.entity.location_id,
    });
  }, [locations, containers, inventoryItems, validateDestination, onSelectDestination]);

  const handleBrowseSelect = useCallback((type, entity) => {
    const err = validateDestination(type, entity.id);
    if (err) return; // silently skip invalid

    onSelectDestination({
      type,
      id: entity.id,
      entity,
      location_id: type === 'LOCATION' ? entity.id : entity.location_id,
    });
  }, [validateDestination, onSelectDestination]);

  // Browse search results
  const browseResults = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return { locations: [], containers: [] };
    const term = searchTerm.toLowerCase();

    const locs = locations
      .filter(l => l.active !== false)
      .filter(l => {
        const err = validateDestination('LOCATION', l.id);
        return !err;
      })
      .filter(l =>
        l.location_area?.toLowerCase().includes(term) ||
        l.short_code?.toLowerCase().includes(term)
      )
      .slice(0, 15);

    const ctrs = containers
      .filter(c => c.active !== false && c.status !== 'archived')
      .filter(c => {
        const err = validateDestination('CONTAINER', c.id);
        return !err;
      })
      .filter(c =>
        c.name?.toLowerCase().includes(term) ||
        c.short_code?.toLowerCase().includes(term)
      )
      .slice(0, 10);

    return { locations: locs, containers: ctrs };
  }, [searchTerm, locations, containers, validateDestination]);

  // All valid locations for browse (no search)
  const allLocations = useMemo(() =>
    locations
      .filter(l => l.active !== false)
      .filter(l => !validateDestination('LOCATION', l.id))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [locations, validateDestination]
  );

  const allContainers = useMemo(() =>
    containers
      .filter(c => c.active !== false && c.status !== 'archived')
      .filter(c => !validateDestination('CONTAINER', c.id)),
    [containers, validateDestination]
  );

  // ── SCANNING VIEW ──
  if (view === 'scanning') {
    if (scanError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-black p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-red-950/50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-10 h-10 text-red-400" />
          </div>
          <p className="text-white text-lg font-bold mb-2">Invalid Destination</p>
          <p className="text-gray-400 text-sm mb-6 max-w-xs">{scanError}</p>
          <div className="flex gap-3">
            <Button onClick={() => { setScanError(null); }} variant="default" className="gap-2 bg-red-600 hover:bg-red-700">
              <ScanLine className="w-4 h-4" /> Scan Another
            </Button>
            <Button onClick={() => { setScanError(null); setView('browse'); }} variant="outline" className="border-gray-600 text-gray-300">
              Browse
            </Button>
            <Button onClick={onCancel} variant="ghost" className="text-gray-400">Cancel</Button>
          </div>
        </div>
      );
    }

    return (
      <QRScanner
        onScan={handleScan}
        onClose={() => setView('choose')}
        className="h-full"
      />
    );
  }

  // ── BROWSE VIEW ──
  if (view === 'browse') {
    const hasSearch = searchTerm.length >= 2;
    const displayLocs = hasSearch ? browseResults.locations : allLocations.slice(0, 30);
    const displayCtrs = hasSearch ? browseResults.containers : allContainers.slice(0, 20);

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 shrink-0">
          <Button size="icon" variant="ghost" onClick={() => setView('choose')} className="h-9 w-9 text-gray-400">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search locations or containers…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-8 bg-gray-900/50 border-gray-700 text-white h-9 text-sm"
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
          {displayCtrs.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 mb-2">Containers</div>
              <div className="space-y-1">
                {displayCtrs.map(c => {
                  const ctc = getContainerTypeConfig(c.container_type);
                  const CIcon = ctc.icon;
                  const loc = locations.find(l => l.id === c.location_id);
                  return (
                    <button key={c.id} onClick={() => handleBrowseSelect('CONTAINER', c)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 text-left transition-colors">
                      <div className="w-9 h-9 rounded flex items-center justify-center shrink-0"
                        style={{ backgroundColor: (c.color || ctc.color) + '15' }}>
                        <CIcon className="w-4 h-4" style={{ color: c.color || ctc.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white">{c.name}</span>
                        {c.short_code && <span className="text-xs font-mono text-gray-400 ml-2">{c.short_code}</span>}
                        <div className="text-xs text-gray-500 truncate">{loc?.location_area || 'No location'}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {displayLocs.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 mb-2">Locations</div>
              <div className="space-y-1">
                {displayLocs.map(loc => {
                  const ltc = getLocationTypeConfig(loc.location_type);
                  const LIcon = ltc.icon;
                  return (
                    <button key={loc.id} onClick={() => handleBrowseSelect('LOCATION', loc)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 text-left transition-colors">
                      <div className="w-9 h-9 rounded bg-gray-800 flex items-center justify-center shrink-0">
                        <LIcon className="w-4 h-4" style={{ color: loc.color || ltc.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{loc.location_area}</div>
                        <div className="text-xs text-gray-500 truncate">{buildLocationPathString(loc.id, locations)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {displayLocs.length === 0 && displayCtrs.length === 0 && hasSearch && (
            <div className="text-center py-8 text-gray-500 text-sm">No results for "{searchTerm}"</div>
          )}
        </div>
      </div>
    );
  }

  // ── CHOOSE VIEW (default) ──
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-4">
      <MapPin className="w-16 h-16 text-gray-600 mb-2" />
      <h3 className="text-xl font-bold text-white">Choose Destination</h3>
      <p className="text-sm text-gray-400 max-w-xs">Scan a QR code on the destination shelf, rack, or container — or browse to find it.</p>
      <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
        <Button onClick={() => setView('scanning')} className="h-14 text-lg gap-2 bg-red-600 hover:bg-red-700">
          <ScanLine className="w-6 h-6" /> Scan Destination
        </Button>
        <Button onClick={() => setView('browse')} variant="outline" className="h-12 text-base gap-2 border-gray-600 text-gray-300">
          <Search className="w-5 h-5" /> Browse / Search
        </Button>
      </div>
      <div className="flex gap-3 mt-4">
        <Button onClick={onBack} variant="ghost" className="text-gray-500">Back</Button>
        <Button onClick={onCancel} variant="ghost" className="text-gray-500">Cancel</Button>
      </div>
    </div>
  );
}