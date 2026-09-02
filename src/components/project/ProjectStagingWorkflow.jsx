import React, { useState, useMemo, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowRightLeft, X, Search, ScanLine, MapPin, Package, Box,
  ArrowLeft, ArrowDown, Loader2, AlertTriangle, CheckCircle2, Undo2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { getContainerTypeConfig } from "@/components/inventory/containerTypeConfig";
import { getLocationTypeConfig, buildLocationPathString } from "@/components/inventory/locationTypeConfig";
import { checkProjectConflict } from "@/lib/projectStorageResolver";
import { resolveStorageScan } from "@/lib/resolveStorageScan";
import QRScanner from "@/components/inventory/QRScanner";

/**
 * ProjectStagingWorkflow — full-screen staging or return-to-stock flow.
 *
 * mode: 'stage' — move FROM general INTO project storage
 *       'return' — move FROM project storage back to general
 *
 * Props:
 *   mode, projectId, projectName
 *   projectItems      — items in project storage (for return mode)
 *   locations, containers, inventoryItems, parts, projects
 *   onClose()
 */
export default function ProjectStagingWorkflow({
  mode, projectId, projectName,
  projectItems, locations, containers, inventoryItems, parts, projects,
  onClose,
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isStage = mode === 'stage';
  const transferType = isStage ? 'project_stage' : 'return_to_stock';

  const [step, setStep] = useState('select'); // select | destination | review | result
  const [selected, setSelected] = useState(new Map()); // Map<invItemId, { qty }>
  const [destination, setDestination] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [moveResult, setMoveResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [destView, setDestView] = useState('choose');
  const [scanError, setScanError] = useState(null);
  const [conflictWarning, setConflictWarning] = useState(null);
  const [pendingDest, setPendingDest] = useState(null);
  const batchRef = useRef(null);

  // Source items based on mode
  const sourceItems = useMemo(() => {
    if (!isStage) {
      // Return mode: items in project storage
      return (projectItems || [])
        .filter(i => (i.inventoryItem.quantity_on_hand || 0) > 0)
        .sort((a, b) => (a.part?.part_name || '').localeCompare(b.part?.part_name || ''));
    }
    // Stage mode: items NOT in project storage for this project
    const projLocIds = new Set(locations.filter(l => l.project_id === projectId && l.active !== false).map(l => l.id));
    const projCtrIds = new Set(containers.filter(c => c.project_id === projectId && c.active !== false).map(c => c.id));
    return inventoryItems
      .filter(i => (i.quantity_on_hand || 0) > 0)
      .filter(i => {
        // Not already in project storage
        if (i.container_id && projCtrIds.has(i.container_id)) return false;
        if (i.location_id && projLocIds.has(i.location_id)) return false;
        return true;
      })
      .map(i => ({
        inventoryItem: i,
        part: parts.find(p => p.id === i.part_id) || null,
        container: i.container_id ? containers.find(c => c.id === i.container_id) : null,
        location: locations.find(l => l.id === i.location_id) || null,
      }))
      .sort((a, b) => (a.part?.part_name || '').localeCompare(b.part?.part_name || ''));
  }, [isStage, projectItems, inventoryItems, locations, containers, parts, projectId]);

  // Search filter
  const filteredItems = useMemo(() => {
    if (!searchTerm) return sourceItems;
    const t = searchTerm.toLowerCase();
    return sourceItems.filter(i =>
      i.part?.part_name?.toLowerCase().includes(t) ||
      i.part?.vendor_part_number?.toLowerCase().includes(t) ||
      i.container?.name?.toLowerCase().includes(t) ||
      i.location?.location_area?.toLowerCase().includes(t)
    );
  }, [sourceItems, searchTerm]);

  const handleToggle = useCallback((id) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        const item = sourceItems.find(s => s.inventoryItem.id === id);
        if (item) next.set(id, { qty: item.inventoryItem.quantity_on_hand || 0 });
      }
      return next;
    });
  }, [sourceItems]);

  const handleSetQty = useCallback((id, qty) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(id); else next.set(id, { qty });
      return next;
    });
  }, []);

  const moveLines = useMemo(() => {
    const lines = [];
    for (const [id, { qty }] of selected) {
      const item = sourceItems.find(s => s.inventoryItem.id === id);
      if (item && qty > 0) lines.push({ inventoryItem: item.inventoryItem, part: item.part, qty });
    }
    return lines;
  }, [selected, sourceItems]);

  const selectedCount = moveLines.length;
  const selectedPieces = moveLines.reduce((s, l) => s + l.qty, 0);

  // Destination selection with project conflict checking
  const handleSelectDestination = useCallback((type, entity) => {
    if (isStage) {
      // Check destination belongs to this project
      const conflict = checkProjectConflict(entity, projectId, projects);
      if (conflict) {
        setConflictWarning(conflict);
        setPendingDest({ type, entity });
        return;
      }
    }
    setDestination({
      type, id: entity.id, entity,
      location_id: type === 'LOCATION' ? entity.id : entity.location_id,
    });
    setConflictWarning(null);
    setPendingDest(null);
    setStep('review');
  }, [isStage, projectId, projects]);

  const handleScanDest = useCallback((decoded) => {
    const result = resolveStorageScan(decoded, { locations, containers, inventoryItems });
    if (!result.valid) { setScanError(result.error || 'Invalid QR'); return; }
    setScanError(null);
    handleSelectDestination(result.entity_type, result.entity);
  }, [locations, containers, inventoryItems, handleSelectDestination]);

  // Confirm transfer
  const handleConfirm = useCallback(async () => {
    if (isExecuting || moveLines.length === 0 || !destination) return;
    if (!batchRef.current) batchRef.current = `${transferType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setIsExecuting(true);
    try {
      const payload = {
        transfer_type: transferType,
        batch_id: batchRef.current,
        source_location_id: moveLines[0]?.inventoryItem.location_id,
        destination_location_id: destination.location_id,
        destination_container_id: destination.type === 'CONTAINER' ? destination.id : null,
        project_id: projectId,
        lines: moveLines.map(l => ({
          inventory_item_id: l.inventoryItem.id,
          part_id: l.inventoryItem.part_id,
          qty: l.qty,
        })),
      };
      const res = await base44.functions.invoke('transferInventoryBatch', payload);
      const result = res.data || res;
      setMoveResult(result);
      setStep('result');
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['storageContainers'] });
      queryClient.invalidateQueries({ queryKey: ['projectTransfers', projectId] });
      if (result.success) {
        toast({ title: isStage ? 'Parts staged' : 'Parts returned', description: `${result.executed} items ${isStage ? 'staged for' : 'returned from'} ${projectName}` });
      }
    } catch (err) {
      toast({ title: 'Transfer failed', description: err.message, variant: 'destructive' });
      setMoveResult({ success: false, error: err.message });
      setStep('result');
    } finally { setIsExecuting(false); }
  }, [isExecuting, moveLines, destination, transferType, projectId, projectName, isStage, queryClient, toast]);

  // ── SELECT STEP ──
  if (step === 'select') {
    return (
      <div className="fixed inset-0 z-[80] bg-black flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 shrink-0">
          <Button size="icon" variant="ghost" onClick={onClose} className="h-9 w-9 text-gray-400"><X className="w-5 h-5" /></Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white truncate">
              {isStage ? `Stage for ${projectName}` : `Return from ${projectName}`}
            </h2>
            <p className="text-xs text-gray-500">Select items to {isStage ? 'stage' : 'return'}</p>
          </div>
        </div>
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search parts…" className="pl-9 bg-gray-900/50 border-gray-700 text-white h-9 text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              {searchTerm ? 'No matching items' : (isStage ? 'No general inventory available' : 'No items in project storage')}
            </div>
          ) : filteredItems.map(item => {
            const id = item.inventoryItem.id;
            const isSelected = selected.has(id);
            const selQty = selected.get(id)?.qty || 0;
            const maxQty = item.inventoryItem.quantity_on_hand || 0;
            return (
              <div key={id} className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer",
                isSelected ? "border-red-700/50 bg-red-950/15" : "border-gray-800 hover:bg-gray-800/30"
              )} onClick={() => handleToggle(id)}>
                <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                  isSelected ? "bg-red-600 border-red-600" : "border-gray-600")}>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{item.part?.part_name || 'Unknown'}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {item.container?.name || item.location?.location_area || 'Unknown'}
                    {item.part?.vendor_part_number && <span className="ml-2 font-mono">{item.part.vendor_part_number}</span>}
                  </div>
                </div>
                {isSelected ? (
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400"
                      onClick={() => handleSetQty(id, selQty - 1)}>−</Button>
                    <span className="text-white font-bold text-sm w-8 text-center">{selQty}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400"
                      disabled={selQty >= maxQty} onClick={() => handleSetQty(id, selQty + 1)}>+</Button>
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm shrink-0">{maxQty}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/80 backdrop-blur shrink-0"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
          <Button onClick={() => { batchRef.current = null; setStep('destination'); }}
            disabled={selectedCount === 0}
            className={cn("w-full h-14 text-lg gap-2 disabled:bg-gray-800 disabled:text-gray-500",
              isStage ? "bg-green-600 hover:bg-green-700" : "bg-amber-600 hover:bg-amber-700")}>
            <ArrowRightLeft className="w-5 h-5" />
            {selectedCount > 0
              ? `${isStage ? 'Stage' : 'Return'} ${selectedCount} item${selectedCount !== 1 ? 's' : ''} · ${selectedPieces} pcs`
              : `Select items to ${isStage ? 'stage' : 'return'}`}
          </Button>
        </div>
      </div>
    );
  }

  // ── DESTINATION STEP ──
  if (step === 'destination') {
    // Conflict modal overlay
    if (conflictWarning && pendingDest) {
      return (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col items-center justify-center p-6 text-center">
          <AlertTriangle className="w-16 h-16 text-amber-400 mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Project Conflict</h3>
          <p className="text-sm text-gray-400 max-w-xs mb-6">{conflictWarning}</p>
          <div className="flex gap-3">
            <Button onClick={() => { setConflictWarning(null); setPendingDest(null); }}
              variant="outline" className="border-gray-600 text-gray-300">Choose Another</Button>
            <Button onClick={onClose} variant="ghost" className="text-gray-500">Cancel</Button>
          </div>
        </div>
      );
    }

    if (destView === 'scanning') {
      if (scanError) {
        return (
          <div className="fixed inset-0 z-[80] bg-black flex flex-col items-center justify-center p-6 text-center">
            <AlertTriangle className="w-16 h-16 text-red-400 mb-4" />
            <p className="text-white text-lg font-bold mb-2">Invalid Scan</p>
            <p className="text-gray-400 text-sm mb-6">{scanError}</p>
            <div className="flex gap-3">
              <Button onClick={() => setScanError(null)} className="bg-red-600 hover:bg-red-700 gap-2">
                <ScanLine className="w-4 h-4" /> Scan Another
              </Button>
              <Button onClick={() => { setScanError(null); setDestView('browse'); }} variant="outline" className="border-gray-600 text-gray-300">Browse</Button>
            </div>
          </div>
        );
      }
      return (
        <div className="fixed inset-0 z-[80] bg-black">
          <QRScanner onScan={handleScanDest} onClose={() => setDestView('choose')} className="h-full" />
        </div>
      );
    }

    if (destView === 'browse') {
      const [destSearch, setDestSearch] = useState('');
      const term = destSearch.toLowerCase();
      const filtLocs = locations.filter(l => l.active !== false && (l.location_area?.toLowerCase().includes(term) || l.short_code?.toLowerCase().includes(term))).slice(0, 20);
      const filtCtrs = containers.filter(c => c.active !== false && c.status !== 'archived' && (c.name?.toLowerCase().includes(term) || c.short_code?.toLowerCase().includes(term))).slice(0, 15);
      return (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 shrink-0">
            <Button size="icon" variant="ghost" onClick={() => setDestView('choose')} className="h-9 w-9 text-gray-400"><ArrowLeft className="w-5 h-5" /></Button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input value={destSearch} onChange={(e) => setDestSearch(e.target.value)}
                placeholder="Search destination…" className="pl-10 bg-gray-900/50 border-gray-700 text-white h-9 text-sm" autoFocus />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {filtCtrs.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 mb-2">Containers</div>
                {filtCtrs.map(c => {
                  const ctc = getContainerTypeConfig(c.container_type);
                  const proj = c.project_id ? projects.find(p => p.id === c.project_id) : null;
                  return (
                    <button key={c.id} onClick={() => handleSelectDestination('CONTAINER', c)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 text-left">
                      <ctc.icon className="w-4 h-4 shrink-0" style={{ color: c.color || ctc.color }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white">{c.name}</span>
                        {proj && <span className="text-xs text-blue-400 ml-2">{proj.name}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {filtLocs.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 mb-2">Locations</div>
                {filtLocs.map(l => (
                  <button key={l.id} onClick={() => handleSelectDestination('LOCATION', l)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 text-left">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white truncate block">{l.location_area}</span>
                      <span className="text-xs text-gray-500 truncate block">{buildLocationPathString(l.id, locations)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[80] bg-black flex flex-col items-center justify-center px-6 text-center gap-4">
        <MapPin className="w-16 h-16 text-gray-600 mb-2" />
        <h3 className="text-xl font-bold text-white">Choose {isStage ? 'Project' : 'General'} Destination</h3>
        <p className="text-sm text-gray-400 max-w-xs">
          {isStage ? 'Select a project container or location' : 'Select where to return parts'}
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
          <Button onClick={() => setDestView('scanning')} className={cn("h-14 text-lg gap-2", isStage ? "bg-green-600 hover:bg-green-700" : "bg-amber-600 hover:bg-amber-700")}>
            <ScanLine className="w-6 h-6" /> Scan Destination
          </Button>
          <Button onClick={() => setDestView('browse')} variant="outline" className="h-12 text-base gap-2 border-gray-600 text-gray-300">
            <Search className="w-5 h-5" /> Browse
          </Button>
        </div>
        <div className="flex gap-3 mt-4">
          <Button onClick={() => setStep('select')} variant="ghost" className="text-gray-500">Back</Button>
          <Button onClick={onClose} variant="ghost" className="text-gray-500">Cancel</Button>
        </div>
      </div>
    );
  }

  // ── REVIEW STEP ──
  if (step === 'review' && destination) {
    const destName = destination.type === 'CONTAINER' ? destination.entity.name : destination.entity.location_area;
    const destProj = destination.entity.project_id ? projects?.find(p => p.id === destination.entity.project_id) : null;
    return (
      <div className="fixed inset-0 z-[80] bg-black flex flex-col">
        <div className="px-4 py-3 border-b border-gray-800 shrink-0">
          <h2 className="text-lg font-bold text-white">Review {isStage ? 'Staging' : 'Return'}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className={cn("rounded-lg border p-3", isStage ? "border-green-800/50 bg-green-950/10" : "border-amber-800/50 bg-amber-950/10")}>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-1">Destination</div>
            <div className="flex items-center gap-2">
              {destination.type === 'CONTAINER' ? <Box className="w-5 h-5 text-purple-400" /> : <MapPin className="w-5 h-5 text-gray-400" />}
              <span className="text-white font-bold text-sm">{destName}</span>
            </div>
            {destProj && <p className="text-xs text-blue-400 mt-1"><Package className="w-3 h-3 inline mr-1" />{destProj.name}</p>}
          </div>
          <div className="border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-900/50 border-b border-gray-700 flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Items</span>
              <span className="text-xs text-gray-400">{moveLines.length} lines · {selectedPieces} pcs</span>
            </div>
            <div className="divide-y divide-gray-800">
              {moveLines.map((l, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <Package className="w-4 h-4 text-gray-600 shrink-0" />
                  <span className="text-sm text-white flex-1 truncate">{l.part?.part_name || 'Unknown'}</span>
                  <span className="text-white font-bold text-sm">{l.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/80 backdrop-blur shrink-0 space-y-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
          <Button onClick={handleConfirm} disabled={isExecuting}
            className={cn("w-full h-14 text-lg gap-2", isStage ? "bg-green-600 hover:bg-green-700" : "bg-amber-600 hover:bg-amber-700")}>
            {isExecuting ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing…</> : `Confirm ${isStage ? 'Stage' : 'Return'} · ${selectedPieces} pcs`}
          </Button>
          <Button onClick={() => setStep('destination')} variant="outline" disabled={isExecuting} className="w-full h-10 border-gray-700 text-gray-300">Change Destination</Button>
        </div>
      </div>
    );
  }

  // ── RESULT STEP ──
  if (step === 'result') {
    const success = moveResult?.success;
    return (
      <div className="fixed inset-0 z-[80] bg-black flex flex-col items-center justify-center px-6 text-center">
        {success ? (
          <CheckCircle2 className="w-20 h-20 text-green-400 mb-4" />
        ) : (
          <AlertTriangle className="w-20 h-20 text-red-400 mb-4" />
        )}
        <h3 className="text-2xl font-bold text-white mb-2">
          {success ? (isStage ? 'Parts Staged' : 'Parts Returned') : 'Transfer Failed'}
        </h3>
        <p className="text-gray-400 text-sm mb-6">
          {success
            ? `${moveResult.executed} items ${isStage ? 'staged to' : 'returned from'} ${projectName}`
            : (moveResult?.error || 'Some items failed to transfer')}
        </p>
        <Button onClick={onClose} className="bg-red-600 hover:bg-red-700 h-12 px-8 text-base">Done</Button>
      </div>
    );
  }

  return null;
}