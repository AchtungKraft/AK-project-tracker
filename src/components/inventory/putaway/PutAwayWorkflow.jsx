import React, { useState, useMemo, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { X, PackageOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { findReceivingLocation } from "@/lib/receivingLocationResolver";
import PutAwayQueueList from "./PutAwayQueueList";
import MoveDestinationPicker from "@/components/inventory/move/MoveDestinationPicker";
import MoveReviewConfirm from "@/components/inventory/move/MoveReviewConfirm";
import MoveSuccessPanel from "@/components/inventory/move/MoveSuccessPanel";

/**
 * PutAwayWorkflow — full-screen orchestrator for putting away received inventory.
 *
 * Steps: QUEUE → DESTINATION → REVIEW → RESULT
 *
 * Reuses Phase 3 MoveDestinationPicker, MoveReviewConfirm, MoveSuccessPanel.
 * Uses transferInventoryBatch with transfer_type='put_away'.
 */
export default function PutAwayWorkflow({
  locations, containers, inventoryItems, parts, projects,
  orders, lineItems, commitments,
  onClose, onNavigateLocation, onNavigateContainer,
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState('queue');
  const [selected, setSelected] = useState(new Map()); // from queue
  const [destination, setDestination] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [moveResult, setMoveResult] = useState(null);
  const idempotencyKeyRef = useRef(null);

  const receivingLoc = useMemo(() => findReceivingLocation(locations), [locations]);

  // Source object for review/destination pickers
  const sourceForReview = useMemo(() => ({
    type: 'LOCATION',
    id: receivingLoc?.id,
    entity: receivingLoc || { location_area: 'Receiving', location_type: 'receiving' },
    location_id: receivingLoc?.id,
  }), [receivingLoc]);

  // Move lines for review
  const moveLines = useMemo(() => {
    const lines = [];
    for (const [id, { qty, invItem, part }] of selected) {
      if (invItem && qty > 0) {
        lines.push({ inventoryItem: invItem, part, qty });
      }
    }
    return lines;
  }, [selected]);

  const handleStartPutAway = useCallback((selectedMap) => {
    setSelected(selectedMap);
    idempotencyKeyRef.current = null;
    setStep('destination');
  }, []);

  const handleConfirm = useCallback(async () => {
    if (isExecuting || moveLines.length === 0 || !destination || !receivingLoc) return;

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = `put_away_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    setIsExecuting(true);
    try {
      const payload = {
        transfer_type: 'put_away',
        batch_id: idempotencyKeyRef.current,
        source_location_id: receivingLoc.id,
        destination_location_id: destination.location_id,
        destination_container_id: destination.type === 'CONTAINER' ? destination.id : null,
        lines: moveLines.map(l => ({
          inventory_item_id: l.inventoryItem.id,
          part_id: l.inventoryItem.part_id,
          qty: l.qty,
        })),
      };

      const res = await base44.functions.invoke('transferInventoryBatch', payload);
      const data = res.data || res;
      setMoveResult(data);
      setStep('result');

      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['storageContainers'] });

      if (data.success) {
        toast({ title: 'Put Away complete', description: `${data.executed} lines stored successfully` });
      } else if (data.executed > 0) {
        toast({ title: 'Partial Put Away', description: `${data.executed} succeeded, ${data.failed} failed`, variant: 'destructive' });
      } else {
        toast({ title: 'Put Away failed', description: data.error || 'All lines failed', variant: 'destructive' });
      }
    } catch (err) {
      const errResult = { success: false, executed: 0, failed: moveLines.length, errors: [{ index: 0, error: err.message }] };
      setMoveResult(errResult);
      setStep('result');
      toast({ title: 'Put Away failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsExecuting(false);
    }
  }, [isExecuting, moveLines, destination, receivingLoc, queryClient, toast]);

  const handlePutAwayMore = useCallback(() => {
    setSelected(new Map());
    setDestination(null);
    setMoveResult(null);
    idempotencyKeyRef.current = null;
    setStep('queue');
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

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      {/* STEP: QUEUE */}
      {step === 'queue' && (
        <>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 shrink-0">
            <Button size="icon" variant="ghost" onClick={onClose} className="h-9 w-9 text-gray-400">
              <X className="w-5 h-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <PackageOpen className="w-5 h-5 text-green-400" /> Put Away
              </h2>
              <p className="text-xs text-gray-500">Select received inventory to store</p>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <PutAwayQueueList
              locations={locations}
              inventoryItems={inventoryItems}
              parts={parts}
              orders={orders}
              lineItems={lineItems}
              projects={projects}
              commitments={commitments}
              onStartPutAway={handleStartPutAway}
            />
          </div>
        </>
      )}

      {/* STEP: DESTINATION */}
      {step === 'destination' && (
        <MoveDestinationPicker
          source={sourceForReview}
          locations={locations}
          containers={containers}
          inventoryItems={inventoryItems}
          projects={projects}
          onSelectDestination={(dest) => { setDestination(dest); setStep('review'); }}
          onBack={() => setStep('queue')}
          onCancel={onClose}
        />
      )}

      {/* STEP: REVIEW */}
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
          onBack={() => setStep('queue')}
          onCancel={onClose}
        />
      )}

      {/* STEP: RESULT */}
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
          onMoveMore={handlePutAwayMore}
        />
      )}
    </div>
  );
}