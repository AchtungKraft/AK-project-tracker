import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import HierarchicalList from "./HierarchicalList";

export default function LocationsConfig() {
  const queryClient = useQueryClient();
  const [newLocation, setNewLocation] = useState({
    location_area: "",
    color: "#8B5CF6",
    parent_id: ""
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Location.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setNewLocation({ location_area: "", color: "#8B5CF6", parent_id: "" });
      toast.success('Location created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Location.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Location updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Location.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Location deleted');
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newLocation.location_area.trim()) return;
    createMutation.mutate(newLocation);
  };

  const handleUpdate = (id, data) => {
    updateMutation.mutate({ id, data });
  };

  const handleDelete = (id) => {
    if (confirm('Delete this location?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (location) => {
    handleUpdate(location.id, { ...location, active: !location.active });
  };

  const handleReorder = async (parentId, sourceIndex, destIndex) => {
    const itemsToReorder = parentId 
      ? locations.filter(l => l.parent_id === parentId)
      : locations.filter(l => !l.parent_id);

    const reordered = Array.from(itemsToReorder);
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);

    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    const allLocations = [...locations];
    updates.forEach(update => {
      const idx = allLocations.findIndex(l => l.id === update.id);
      if (idx !== -1) {
        allLocations[idx] = { ...allLocations[idx], sort_order: update.data.sort_order };
      }
    });
    queryClient.setQueryData(['locations'], allLocations.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

    try {
      await Promise.all(updates.map(u => base44.entities.Location.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.error('Failed to update order');
    }
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base">Storage Locations</CardTitle>
        <p className="text-sm text-gray-400 mt-1">
          Manage location hierarchy (e.g., Building → Floor → Area → Shelf → Bin)
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs">Location/Area Name</Label>
              <Input
                value={newLocation.location_area}
                onChange={(e) => setNewLocation({ ...newLocation, location_area: e.target.value })}
                placeholder="Enter location name"
                className="bg-gray-900/50 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={newLocation.color}
                  onChange={(e) => setNewLocation({ ...newLocation, color: e.target.value })}
                  className="bg-gray-900/50 border-gray-700 h-10 w-20 cursor-pointer"
                />
                <Input
                  type="text"
                  value={newLocation.color}
                  onChange={(e) => setNewLocation({ ...newLocation, color: e.target.value })}
                  placeholder="#8B5CF6"
                  className="bg-gray-900/50 border-gray-700 text-white flex-1"
                />
              </div>
            </div>
          </div>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-red-600 hover:bg-red-700 gap-2"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Location
              </>
            )}
          </Button>
        </form>

        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Existing Locations</Label>
          <HierarchicalList
            items={locations}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onReorder={handleReorder}
            entityName="Location"
            nameKey="location_area"
            showColor={true}
          />
        </div>
      </CardContent>
    </Card>
  );
}