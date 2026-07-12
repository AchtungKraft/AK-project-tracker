import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function RemoveFromContainerModal({ inventoryItem, container, part, onClose, locations = [], containers = [] }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState('leave'); // leave | moveContainer | moveLocation
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [destinationContainerId, setDestinationContainerId] = useState('');

  const otherContainers = containers.filter(c => c.id !== container.id && c.location_id === container.location_id);

  const removeMutation = useMutation({
    mutationFn: async () => {
      const update = { container_id: null };
      if (action === 'moveLocation' && destinationLocationId) {
        update.location_id = destinationLocationId;
      }
      if (action === 'moveContainer' && destinationContainerId) {
        update.container_id = destinationContainerId;
      }
      await base44.entities.InventoryItem.update(inventoryItem.id, update);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'inventoryItems' });
      toast.success(`Removed "${part?.part_name}" from ${container.name}`);
      onClose();
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
        <DialogHeader><DialogTitle>Remove from Container</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-300">Remove <strong>{part?.part_name}</strong> from <strong>{container.name}</strong></p>

          <div className="space-y-2">
            <button onClick={() => setAction('leave')} className={`w-full text-left p-3 rounded-lg border transition-colors ${action === 'leave' ? 'border-indigo-600 bg-indigo-950/30' : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'}`}>
              <div className="text-sm text-white">Leave at current location</div>
              <div className="text-xs text-gray-500">Part stays loose at the same shelf/area</div>
            </button>
            {otherContainers.length > 0 && (
              <button onClick={() => setAction('moveContainer')} className={`w-full text-left p-3 rounded-lg border transition-colors ${action === 'moveContainer' ? 'border-indigo-600 bg-indigo-950/30' : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'}`}>
                <div className="text-sm text-white">Move to another container</div>
                <div className="text-xs text-gray-500">Place into a different container here</div>
              </button>
            )}
            <button onClick={() => setAction('moveLocation')} className={`w-full text-left p-3 rounded-lg border transition-colors ${action === 'moveLocation' ? 'border-indigo-600 bg-indigo-950/30' : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'}`}>
              <div className="text-sm text-white">Move to a different location</div>
              <div className="text-xs text-gray-500">Remove and relocate the part</div>
            </button>
          </div>

          {action === 'moveContainer' && otherContainers.length > 0 && (
            <div>
              <Label className="text-gray-400">Destination container</Label>
              <Select value={destinationContainerId} onValueChange={setDestinationContainerId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{otherContainers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {action === 'moveLocation' && (
            <div>
              <Label className="text-gray-400">Destination location</Label>
              <Select value={destinationLocationId} onValueChange={setDestinationLocationId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {locations.filter(l => l.active !== false).sort((a, b) => (a.location_area || '').localeCompare(b.location_area || '')).map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending || (action === 'moveLocation' && !destinationLocationId) || (action === 'moveContainer' && !destinationContainerId)}
            >
              {removeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Remove
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}