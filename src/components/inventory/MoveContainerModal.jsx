import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { getContainerTypeConfig } from "./containerTypeConfig";

export default function MoveContainerModal({ container, onClose, locations = [], inventoryItems = [] }) {
  const queryClient = useQueryClient();
  const [destinationId, setDestinationId] = useState('');

  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;
  const currentLoc = locations.find(l => l.id === container.location_id);
  const containedItems = inventoryItems.filter(i => i.container_id === container.id && (i.quantity_on_hand || 0) > 0);

  const moveMutation = useMutation({
    mutationFn: async () => {
      // 1. Update container location
      await base44.entities.StorageContainer.update(container.id, { location_id: destinationId });
      // 2. Move all contained inventory items to the new location
      for (const item of containedItems) {
        await base44.entities.InventoryItem.update(item.id, { location_id: destinationId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageContainers'] });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'inventoryItems' });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      const destLoc = locations.find(l => l.id === destinationId);
      toast.success(`Moved "${container.name}" to ${destLoc?.location_area || 'new location'} (${containedItems.length} items)`);
      onClose();
    },
    onError: (e) => toast.error('Move failed: ' + e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
        <DialogHeader><DialogTitle>Move Container</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Container info */}
          <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: (container.color || tc.color) + '20' }}>
              <TypeIcon className="w-5 h-5" style={{ color: container.color || tc.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{container.name}</div>
              <div className="text-xs text-gray-400">
                {containedItems.length} item{containedItems.length !== 1 ? 's' : ''} inside
                {currentLoc && <span> · at {currentLoc.location_area}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="w-5 h-5 text-gray-500" />
          </div>

          {/* Destination */}
          <div>
            <Label className="text-gray-400">Move to</Label>
            <Select value={destinationId} onValueChange={setDestinationId}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue placeholder="Select destination…" /></SelectTrigger>
              <SelectContent>
                {locations.filter(l => l.active !== false && l.id !== container.location_id).sort((a, b) => (a.location_area || '').localeCompare(b.location_area || '')).map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {containedItems.length > 0 && (
            <p className="text-xs text-gray-500">
              All {containedItems.length} parts inside will be moved automatically.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => moveMutation.mutate()} disabled={!destinationId || moveMutation.isPending}>
              {moveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Move Container
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}