import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getContainerTypeConfig } from "./containerTypeConfig";

export default function EmptyContainerModal({ container, onClose, locations = [], containers = [], inventoryItems = [], parts = [] }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState('leave'); // leave | moveLocation | moveContainer
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [destinationContainerId, setDestinationContainerId] = useState('');

  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;

  const containedItems = useMemo(() =>
    inventoryItems.filter(i => i.container_id === container.id && (i.quantity_on_hand || 0) > 0),
    [inventoryItems, container.id]
  );

  const containedParts = useMemo(() => {
    const ids = new Set(containedItems.map(i => i.part_id));
    return parts.filter(p => ids.has(p.id));
  }, [containedItems, parts]);

  const otherContainers = containers.filter(c => c.id !== container.id && c.active !== false);

  const emptyMutation = useMutation({
    mutationFn: async () => {
      for (const item of containedItems) {
        const update = { container_id: null };
        if (action === 'moveLocation' && destinationLocationId) {
          update.location_id = destinationLocationId;
        }
        if (action === 'moveContainer' && destinationContainerId) {
          update.container_id = destinationContainerId;
        }
        await base44.entities.InventoryItem.update(item.id, update);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'inventoryItems' });
      toast.success(`Emptied ${container.name} — ${containedItems.length} part${containedItems.length !== 1 ? 's' : ''} moved`);
      onClose();
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const isDisabled = emptyMutation.isPending ||
    (action === 'moveLocation' && !destinationLocationId) ||
    (action === 'moveContainer' && !destinationContainerId);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
        <DialogHeader><DialogTitle>Empty Container</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Container summary */}
          <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
            {container.photo ? (
              <img src={container.photo} alt={container.name} className="w-10 h-10 rounded-lg object-cover border border-gray-700 shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: (container.color || tc.color) + '20' }}>
                <TypeIcon className="w-5 h-5" style={{ color: container.color || tc.color }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{container.name}</div>
              <div className="text-xs text-gray-400">
                {containedItems.length} part{containedItems.length !== 1 ? 's' : ''} ·{' '}
                {containedItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0)} units
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-300">Remove all parts from this container. The container stays.</p>

          {/* Where do parts go? */}
          <div className="space-y-2">
            <button onClick={() => setAction('leave')} className={`w-full text-left p-3 rounded-lg border transition-colors ${action === 'leave' ? 'border-indigo-600 bg-indigo-950/30' : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'}`}>
              <div className="text-sm text-white">Leave at current location</div>
              <div className="text-xs text-gray-500">Parts become loose at the same shelf</div>
            </button>
            <button onClick={() => setAction('moveLocation')} className={`w-full text-left p-3 rounded-lg border transition-colors ${action === 'moveLocation' ? 'border-indigo-600 bg-indigo-950/30' : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'}`}>
              <div className="text-sm text-white">Move parts to another location</div>
              <div className="text-xs text-gray-500">Relocate all parts somewhere else</div>
            </button>
            {otherContainers.length > 0 && (
              <button onClick={() => setAction('moveContainer')} className={`w-full text-left p-3 rounded-lg border transition-colors ${action === 'moveContainer' ? 'border-indigo-600 bg-indigo-950/30' : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'}`}>
                <div className="text-sm text-white">Move parts to another container</div>
                <div className="text-xs text-gray-500">Transfer contents to a different container</div>
              </button>
            )}
          </div>

          {action === 'moveLocation' && (
            <div>
              <Label className="text-gray-400">Destination</Label>
              <Select value={destinationLocationId} onValueChange={setDestinationLocationId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue placeholder="Select location…" /></SelectTrigger>
                <SelectContent>
                  {locations.filter(l => l.active !== false).sort((a, b) => (a.location_area || '').localeCompare(b.location_area || '')).map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {action === 'moveContainer' && (
            <div>
              <Label className="text-gray-400">Destination container</Label>
              <Select value={destinationContainerId} onValueChange={setDestinationContainerId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue placeholder="Select container…" /></SelectTrigger>
                <SelectContent>
                  {otherContainers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.short_code ? ` [${c.short_code}]` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" onClick={() => emptyMutation.mutate()} disabled={isDisabled}>
              {emptyMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Empty Container
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}