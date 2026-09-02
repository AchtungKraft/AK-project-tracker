import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight, Home, Star, Clock, Search, MapPin } from "lucide-react";
import { toast } from "sonner";
import { getContainerTypeConfig } from "./containerTypeConfig";
import { cn } from "@/lib/utils";
import useLocationFavorites from "./useLocationFavorites";
import { getLocationTypeConfig } from "./locationTypeConfig";

export default function MoveContainerModal({ container, onClose, locations = [], inventoryItems = [], returnHome = false }) {
  const queryClient = useQueryClient();
  const { favorites, recents } = useLocationFavorites();
  const homeLocation = container.home_location_id ? locations.find(l => l.id === container.home_location_id) : null;
  const isAwayFromHome = homeLocation && container.location_id !== container.home_location_id;

  const [destinationId, setDestinationId] = useState(returnHome && isAwayFromHome ? container.home_location_id : '');
  const [searchTerm, setSearchTerm] = useState('');

  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;
  const currentLoc = locations.find(l => l.id === container.location_id);
  const containedItems = inventoryItems.filter(i => i.container_id === container.id && (i.quantity_on_hand || 0) > 0);

  const activeLocations = useMemo(() =>
    locations.filter(l => l.active !== false && l.id !== container.location_id),
    [locations, container.location_id]
  );

  // Quick-pick locations: favorites + recents (deduped, excluding current)
  const quickPicks = useMemo(() => {
    const seen = new Set();
    const picks = [];
    // Favorites
    favorites.forEach(fId => {
      const loc = activeLocations.find(l => l.id === fId);
      if (loc && !seen.has(loc.id)) { seen.add(loc.id); picks.push({ loc, type: 'favorite' }); }
    });
    // Recents
    recents.forEach(rId => {
      const loc = activeLocations.find(l => l.id === rId);
      if (loc && !seen.has(loc.id)) { seen.add(loc.id); picks.push({ loc, type: 'recent' }); }
    });
    return picks.slice(0, 6);
  }, [favorites, recents, activeLocations]);

  // Search filtering
  const filteredLocations = useMemo(() => {
    if (!searchTerm) return activeLocations.sort((a, b) => (a.location_area || '').localeCompare(b.location_area || ''));
    const term = searchTerm.toLowerCase();
    return activeLocations
      .filter(l =>
        l.location_area?.toLowerCase().includes(term) ||
        l.short_code?.toLowerCase().includes(term)
      )
      .sort((a, b) => (a.location_area || '').localeCompare(b.location_area || ''));
  }, [activeLocations, searchTerm]);

  // V2: Use canonical transferInventoryBatch for audited container moves
  const moveMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('transferInventoryBatch', {
        transfer_type: 'container_move',
        container_id: container.id,
        destination_location_id: destinationId,
        idempotency_key: `ctr_move_${container.id}_${destinationId}_${Math.floor(Date.now() / 60000)}`,
        notes: `Moved ${container.short_code || container.name}`,
      });
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageContainers'] });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'inventoryItems' });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryTransfers'] });
      const destLoc = locations.find(l => l.id === destinationId);
      const isReturnHome = destinationId === container.home_location_id;
      toast.success(
        isReturnHome
          ? `Returned "${container.name}" home to ${destLoc?.location_area || 'home'} (${containedItems.length} items)`
          : `Moved "${container.name}" to ${destLoc?.location_area || 'new location'} (${containedItems.length} items)`
      );
      onClose();
    },
    onError: (e) => toast.error('Move failed: ' + e.message),
  });

  const LocationButton = ({ loc, icon: Icon, iconColor, suffix }) => {
    const ltc = getLocationTypeConfig(loc.location_type);
    const LIcon = ltc.icon;
    const selected = destinationId === loc.id;
    return (
      <button
        onClick={() => setDestinationId(loc.id)}
        className={cn(
          "w-full flex items-center gap-2.5 p-3 rounded-lg border text-left transition-colors",
          selected ? "border-indigo-600 bg-indigo-950/30" : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
        )}
      >
        {Icon ? <Icon className="w-4 h-4 shrink-0" style={{ color: iconColor }} /> : <LIcon className="w-4 h-4 shrink-0" style={{ color: loc.color || ltc.color }} />}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white truncate">{loc.location_area}</div>
          {loc.short_code && <div className="text-[10px] text-gray-500 font-mono">{loc.short_code}</div>}
        </div>
        {suffix && <span className="text-[10px] text-gray-500 shrink-0">{suffix}</span>}
      </button>
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{returnHome ? 'Return Container Home' : 'Move Container'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
          {/* Container info */}
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
                {container.short_code && <span className="font-mono mr-1">{container.short_code} ·</span>}
                {containedItems.length} item{containedItems.length !== 1 ? 's' : ''} inside
                {currentLoc && <span> · at {currentLoc.location_area}</span>}
              </div>
            </div>
          </div>

          {/* Home shortcut */}
          {isAwayFromHome && homeLocation && (
            <LocationButton loc={homeLocation} icon={Home} iconColor="#F59E0B" suffix="Home" />
          )}

          {/* Quick picks: favorites + recents */}
          {!returnHome && quickPicks.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Star className="w-3 h-3" /> Quick picks
              </div>
              <div className="space-y-1">
                {quickPicks.map(({ loc, type }) => (
                  <LocationButton key={loc.id} loc={loc} suffix={type === 'favorite' ? '⭐' : '🕘'} />
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          {!returnHome && (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search locations…"
                  className="pl-10 bg-gray-800 border-gray-700 text-white text-sm"
                />
              </div>
              {searchTerm && (
                <div className="space-y-1 mt-2 max-h-[200px] overflow-y-auto">
                  {filteredLocations.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-3">No matching locations</p>
                  ) : filteredLocations.slice(0, 15).map(loc => (
                    <LocationButton key={loc.id} loc={loc} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Selected destination summary */}
          {destinationId && (
            <div className="flex items-center gap-2 p-2 bg-indigo-950/20 rounded-lg border border-indigo-800/30">
              <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="text-sm text-indigo-300">
                Moving to: <strong>{locations.find(l => l.id === destinationId)?.location_area}</strong>
              </span>
            </div>
          )}

          {containedItems.length > 0 && (
            <p className="text-xs text-gray-500">
              All {containedItems.length} parts inside will be moved automatically.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-gray-800 shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => moveMutation.mutate()} disabled={!destinationId || moveMutation.isPending}>
            {moveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            {destinationId === container.home_location_id ? 'Return Home' : 'Move Container'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}