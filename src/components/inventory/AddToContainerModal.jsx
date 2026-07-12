import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Package, Search } from "lucide-react";
import { toast } from "sonner";
import { getContainerTypeConfig } from "./containerTypeConfig";

export default function AddToContainerModal({ container, onClose, inventoryItems = [], parts = [] }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Loose items at same location (not in any container)
  const looseItems = useMemo(() => {
    return inventoryItems.filter(i =>
      i.location_id === container.location_id &&
      !i.container_id &&
      (i.quantity_on_hand || 0) > 0
    );
  }, [inventoryItems, container.location_id]);

  const filteredItems = useMemo(() => {
    if (!searchTerm) return looseItems;
    const term = searchTerm.toLowerCase();
    return looseItems.filter(item => {
      const part = parts.find(p => p.id === item.part_id);
      return part?.part_name?.toLowerCase().includes(term) || part?.vendor_part_number?.toLowerCase().includes(term);
    });
  }, [looseItems, searchTerm, parts]);

  const toggleItem = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      for (const itemId of selectedIds) {
        await base44.entities.InventoryItem.update(itemId, { container_id: container.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'inventoryItems' });
      toast.success(`Added ${selectedIds.size} part${selectedIds.size !== 1 ? 's' : ''} to ${container.name}`);
      onClose();
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>Add Parts to {container.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500">Select loose parts at this location to place into the container.</p>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search parts…" className="pl-10 bg-gray-800 border-gray-700 text-white text-sm" />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              {looseItems.length === 0 ? 'No loose parts at this location' : 'No matching parts'}
            </div>
          ) : filteredItems.map(item => {
            const part = parts.find(p => p.id === item.part_id);
            if (!part) return null;
            const isSelected = selectedIds.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${isSelected ? 'bg-indigo-950/40 border border-indigo-700/50' : 'bg-gray-800/30 border border-transparent hover:bg-gray-800/60'}`}
              >
                <Checkbox checked={isSelected} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{part.part_name}</div>
                  {part.vendor_part_number && <div className="text-[10px] text-gray-500 font-mono">{part.vendor_part_number}</div>}
                </div>
                <div className="text-xs text-gray-400 shrink-0">{item.quantity_on_hand} qty</div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-gray-800">
          <span className="text-xs text-gray-500">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={selectedIds.size === 0 || addMutation.isPending} size="sm">
              {addMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              Add to Container
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}