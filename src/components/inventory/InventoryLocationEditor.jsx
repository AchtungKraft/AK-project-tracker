import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MapPin, Check, X, Loader2, Edit2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * InventoryLocationEditor - Shared component for viewing and editing inventory locations
 * 
 * Props:
 * - inventoryItemId: The ID of the inventory item to edit
 * - currentLocationId: Current location ID (for display when not editing)
 * - onLocationChange: Optional callback when location changes
 * - readOnly: If true, only shows location without edit capability
 * - compact: If true, uses a more compact display
 */
export default function InventoryLocationEditor({ 
  inventoryItemId, 
  currentLocationId,
  onLocationChange,
  readOnly = false,
  compact = false 
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState(currentLocationId || '');

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const updateMutation = useMutation({
    mutationFn: async (newLocationId) => {
      await base44.entities.InventoryItem.update(inventoryItemId, {
        location_id: newLocationId || null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      toast.success('Location updated');
      setIsEditing(false);
      onLocationChange?.(selectedLocationId);
    },
    onError: (error) => {
      toast.error('Failed to update location: ' + error.message);
    }
  });

  // Get location display info
  const getLocationDisplay = (locationId) => {
    if (!locationId) return { name: 'Unassigned', color: '#EAB308', isUnassigned: true };
    
    const loc = locations.find(l => l.id === locationId);
    if (!loc) return { name: 'Unknown Location', color: '#6B7280', isDeprecated: true };
    
    let displayName = loc.location_area;
    if (loc.parent_id) {
      const parent = locations.find(l => l.id === loc.parent_id);
      if (parent) {
        displayName = `${parent.location_area} > ${loc.location_area}`;
      }
    }
    
    return { 
      name: displayName, 
      color: loc.color || '#8B5CF6',
      binDescription: loc.bin_description
    };
  };

  const currentLocation = getLocationDisplay(currentLocationId);
  const parentLocations = locations.filter(l => !l.parent_id && l.active);

  const handleSave = () => {
    updateMutation.mutate(selectedLocationId);
  };

  const handleCancel = () => {
    setSelectedLocationId(currentLocationId || '');
    setIsEditing(false);
  };

  // Read-only display
  if (readOnly) {
    return (
      <div className={cn("flex items-center gap-2", compact ? "text-xs" : "text-sm")}>
        <MapPin 
          className={cn(compact ? "w-3 h-3" : "w-4 h-4")} 
          style={{ color: currentLocation.color }} 
        />
        <span className="text-gray-300">{currentLocation.name}</span>
        {currentLocation.binDescription && (
          <span className="text-gray-500">({currentLocation.binDescription})</span>
        )}
        {currentLocation.isUnassigned && (
          <AlertTriangle className="w-3 h-3 text-yellow-500" />
        )}
        {currentLocation.isDeprecated && (
          <AlertTriangle className="w-3 h-3 text-red-500" />
        )}
      </div>
    );
  }

  // Editing mode
  if (isEditing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Select 
            value={selectedLocationId || 'unassigned'} 
            onValueChange={(v) => setSelectedLocationId(v === 'unassigned' ? '' : v)}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white flex-1">
              <SelectValue placeholder="Select location..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">
                <span className="text-yellow-400">— Unassigned —</span>
              </SelectItem>
              {parentLocations.map(parent => {
                const children = locations.filter(l => l.parent_id === parent.id && l.active);
                return (
                  <React.Fragment key={parent.id}>
                    <SelectItem value={parent.id}>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3" style={{ color: parent.color }} />
                        <span style={{ color: parent.color }}>{parent.location_area}</span>
                      </div>
                    </SelectItem>
                    {children.map(child => (
                      <SelectItem key={child.id} value={child.id}>
                        <div className="flex items-center gap-2 ml-4">
                          <span className="text-gray-500">→</span>
                          <MapPin className="w-3 h-3" style={{ color: child.color }} />
                          <span style={{ color: child.color }}>{child.location_area}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </React.Fragment>
                );
              })}
            </SelectContent>
          </Select>
          
          <Button
            size="icon"
            variant="ghost"
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="h-9 w-9 text-green-400 hover:text-green-300 hover:bg-green-900/30"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
          </Button>
          
          <Button
            size="icon"
            variant="ghost"
            onClick={handleCancel}
            disabled={updateMutation.isPending}
            className="h-9 w-9 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Display mode with edit button
  return (
    <div className={cn(
      "flex items-center justify-between p-2 bg-gray-800/30 rounded border border-gray-700 group hover:border-gray-600 transition-colors",
      compact && "p-1.5"
    )}>
      <div className={cn("flex items-center gap-2", compact ? "text-xs" : "text-sm")}>
        <MapPin 
          className={cn(compact ? "w-3 h-3" : "w-4 h-4")} 
          style={{ color: currentLocation.color }} 
        />
        <span className="text-gray-300">{currentLocation.name}</span>
        {currentLocation.binDescription && (
          <span className="text-gray-500 text-xs">({currentLocation.binDescription})</span>
        )}
        {currentLocation.isUnassigned && (
          <span className="text-yellow-400 text-xs">(needs location)</span>
        )}
        {currentLocation.isDeprecated && (
          <span className="text-red-400 text-xs">(invalid)</span>
        )}
      </div>
      
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setSelectedLocationId(currentLocationId || '');
          setIsEditing(true);
        }}
        className={cn(
          "opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white",
          compact ? "h-6 px-2" : "h-7 px-2"
        )}
      >
        <Edit2 className={cn(compact ? "w-3 h-3" : "w-3.5 h-3.5")} />
        <span className="ml-1 text-xs">Move</span>
      </Button>
    </div>
  );
}

/**
 * InventoryLocationsList - Shows all inventory items for a part with editable locations
 */
export function InventoryLocationsList({ partId, readOnly = false }) {
  const { data: inventoryItems = [], isLoading } = useQuery({
    queryKey: ['inventoryItems', 'forPart', partId],
    queryFn: async () => {
      const all = await base44.entities.InventoryItem.list();
      return all.filter(i => i.part_id === partId);
    },
    enabled: !!partId,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (inventoryItems.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        No inventory records for this part
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-400 flex items-center gap-2">
        <MapPin className="w-4 h-4" />
        Storage Locations
      </h4>
      <div className="space-y-2">
        {inventoryItems.map(item => {
          const onHand = item.quantity_on_hand || 0;
          const reserved = item.quantity_reserved || 0;
          
          return (
            <div key={item.id} className="space-y-1">
              <InventoryLocationEditor
                inventoryItemId={item.id}
                currentLocationId={item.location_id}
                readOnly={readOnly}
              />
              <div className="flex items-center gap-3 text-xs pl-6">
                <span className="text-white">{onHand} on hand</span>
                {reserved > 0 && (
                  <span className="text-orange-400">({reserved} reserved)</span>
                )}
                <span className={cn(
                  "font-medium",
                  onHand - reserved > 0 ? "text-green-400" : "text-gray-500"
                )}>
                  {onHand - reserved} available
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}