import React, { useState, useMemo, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { buildLocationPathString } from "../locationTypeConfig";
import MoveItemSelector from "./MoveItemSelector";
import MoveDestinationPicker from "./MoveDestinationPicker";
import MoveReviewConfirm from "./MoveReviewConfirm";
import MoveSuccessPanel from "./MoveSuccessPanel";

/**
 * InventoryMoveWorkflow — full-screen multi-step orchestrator.
 *
 * Steps: SELECT → DESTINATION → REVIEW → RESULT
 *
 * Props:
 *   source              — { type: 'LOCATION'|'CONTAINER', id, entity }
 *   locations, containers, inventoryItems, parts, projects
 *   onClose()           — dismiss workflow
 *   onNavigateLocation(id)
 *   onNavigateContainer(ctr)
 */
export default function InventoryMoveWorkflow({
  source,
  locations, containers, inventoryItems, parts, projects,
  onClose, onNavigateLocation, onNavigateContainer,
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState('select'); // select | destination | review | result
  const [selected, setSelected] = useState(new Map()); // Map<invItemId, { qty }>
  const [destination, setDestination] = useState(null); // { type, id, entity, location_id }
  const [isExecuting, setIsExecuting] = useState(false);
  const [moveResult, setMoveResult] = useState(null);
  const idempotencyKeyRef = useRef(null);

  // Source inventory — directly at this location/container
  const sourceItems = useMemo(() => {
    let items;
    if (source.type === 'CONTAINER') {
      items = inventoryItems.filter(i =>
        i.container_id === source.id && (i.quantity_on_hand || 0) > 0
      );
    } else {
      // Location: only DIRECT loose inventory (no container)
      items = inventoryItems.filter(i =>
        i.location_id === source.id && !i.container_id && (i.quantity_on_hand || 0) > 0
      );
    }

    return items
      .filter(i => {
        const avail = (i.quantity_on_hand || 0) - (i.quantity_reserved || 0);
        return avail > 0;
      })
      .map(i => ({
        inventoryItem: i,
        part: parts.find(p => p.id === i.part_id) || null,
      }))
      .sort((a, b) => (a.part?.part_name || '').localeCompare(b.part?.part_name || ''));
  }, [source, inventoryItems, parts]);

  // Toggle selection
  const handleToggle = useCallback((id) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        const item = sourceItems.find(s => s.inventoryItem.id === id);
        if (item) {
          const avail = (item.inventoryItem.quantity_on_hand || 0) - (item.inventoryItem.quantity_reserved || 0);
          next.set(id, { qty: avail }); // default: move all available
        }
      }
      return next;
    });
  }, [sourceItems]);

  // Set quantity
  const handleSetQty = useCallback((id, qty) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (qty <= 0) {
        next.delete(id);
      } else {
        next.set(id, { qty });
      }
      return next;
    });
  }, []);

  // Move lines for review
  const moveLines = useMemo(() => {
    const lines = [];
    for (const [id, { qty }] of selected) {
      const item = sourceItems.find(s => s.inventoryItem.id === id);
      if (item && qty > 0) {
        lines.push({ inventoryItem: item.inventoryItem, part: item.part, qty });
      }
    }
    return lines;
  }, [selected, sourceItems]);

  const selectedCount = moveLines.length;
  const selectedPieces = moveLines.reduce((s, l) => s + l.qty, 0);

  // Source display info
  const sourceName = source.type === 'CONTAINER' ? source.entity.name : source.entity.location_area;

  // Confirm
  const handleConfirm = useCallback(async () => {
    if (isExecuting || moveLines.length === 0 || !destination) return;

    // Generate idempotency key once per confirm
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = `batch_move_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    setIsExecuting(true);
    try {
      const payload = {
        transfer_type: 'inventory_move',
        batch_id: idempotencyKeyRef.current,
        source_location_id: source.type === 'LOCATION' ? source.id : source.entity.location_id,
        source_container_id: source.type === 'CONTAINER' ? source.id : null,
        destination_location_id: destination.location_id,
        destination_container_id: destination.type === 'CONTAINER' ? destination.id : null,
        project_id: destination.entity.project_id || null,
        lines: moveLines.map(l => ({
          inventory_item_id: l.inventoryItem.id,
          part_id: l.inventoryItem.part_id,
          qty: l.qty,
        })),
      };

      const raw = await base44.functions.invoke('transferInventoryBatch', payload);
      const res = raw?.data || raw;
      setMoveResult(res);
      setStep('result');

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['storageContainers'] });

      if (res.success) {
        toast({ title: 'Move complete', description: `${res.executed} lines moved successfully` });
      } else if (res.executed > 0) {
        toast({ title: 'Partial move', description: `${res.executed} succeeded, ${res.failed} failed`, variant: 'destructive' });
      } else {
        toast({ title: 'Move failed', description: res.error || 'All lines failed validation', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Move failed', description: err.message, variant: 'destructive' });
      setMoveResult({ success: false, executed: 0, failed: moveLines.length, errors: [{ index: 0, error: err.message }] });
      setStep('result');
    } finally {
      setIsExecuting(false);
    }
  }, [isExecuting, moveLines, destination, source, queryClient, toast]);

  // Handle "Move More" — reset to select with refreshed data
  const handleMoveMore = useCallback(() => {
    setSelected(new Map());
    setDestination(null);
    setMoveResult(null);
    idempotencyKeyRef.current = null;
    setStep('select');
    // Re-fetch inventory
    queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
  }, [queryClient]);

  const handleViewDestination = useCallback(() => {
    if (!destination) return;
    if (destination.type === 'LOCATION') {
      onNavigateLocation?.(destination.id);
    } else {
      const ctr = containers.find(c => c.id === destination.id);
      if (ctr) onNavigateContainer?.(ctr);
    }
    onClose();
  }, [destination, containers, onNavigateLocation, onNavigateContainer, onClose]);

  // Source entity for review
  const sourceForReview = useMemo(() => ({
    type: source.type,
    id: source.id,
    entity: source.entity,
    location_id: source.type === 'LOCATION' ? source.id : source.entity.location_id,
  }), [source]);

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      {/* Step: SELECT */}
      {step === 'select' && (
        <>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 shrink-0">
            <Button size="icon" variant="ghost" onClick={onClose} className="h-9 w-9 text-gray-400">
              <X className="w-5 h-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-white truncate">
                Move from {sourceName}
              </h2>
              <p className="text-xs text-gray-500 truncate">
                {source.type === 'CONTAINER' ? 'Container' : 'Location'} · Select items to move
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <MoveItemSelector
              items={sourceItems}
              selected={selected}
              onToggle={handleToggle}
              onSetQty={handleSetQty}
            />
          </div>
          {/* Sticky action bar */}
          <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/80 backdrop-blur shrink-0"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
            <Button
              onClick={() => { idempotencyKeyRef.current = null; setStep('destination'); }}
              disabled={selectedCount === 0}
              className="w-full h-14 text-lg gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-500"
            >
              <ArrowRightLeft className="w-5 h-5" />
              {selectedCount > 0
                ? `Move ${selectedCount} item${selectedCount !== 1 ? 's' : ''} · ${selectedPieces} pieces`
                : 'Select items to move'}
            </Button>
          </div>
        </>
      )}

      {/* Step: DESTINATION */}
      {step === 'destination' && (
        <MoveDestinationPicker
          source={sourceForReview}
          locations={locations}
          containers={containers}
          inventoryItems={inventoryItems}
          projects={projects}
          onSelectDestination={(dest) => { setDestination(dest); setStep('review'); }}
          onBack={() => setStep('select')}
          onCancel={onClose}
        />
      )}

      {/* Step: REVIEW */}
      {step === 'review' && destination && (
        <MoveReviewConfirm
          source={sourceForReview}
          destination={destination}
          moveLines={moveLines}
          locations={locations}
          projects={projects}
          isExecuting={isExecuting}
          onConfirm={handleConfirm}
          onChangeDestination={() => { setDestination(null); setStep('destination'); }}
          onBack={() => setStep('select')}
          onCancel={onClose}
        />
      )}

      {/* Step: RESULT */}
      {step === 'result' && moveResult && (
        <MoveSuccessPanel
          result={moveResult}
          source={sourceForReview}
          destination={destination}
          moveLines={moveLines}
          locations={locations}
          projects={projects}
          onDone={onClose}
          onViewDestination={handleViewDestination}
          onMoveMore={handleMoveMore}
        />
      )}
    </div>
  );
}