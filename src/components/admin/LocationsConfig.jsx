import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import HierarchicalList from "./HierarchicalList";

export default function LocationsConfig() {
  const queryClient = useQueryClient();
  const [newLocation, setNewLocation] = useState({
    location_area: "",
    parent_id: "",
    storage_type: "",
    bin_description: "",
    qr_code_value: "",
    notes: "",
    color: "#8B5CF6",
    sort_order: 0,
  });

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const locationsList = await base44.entities.Location.list();
      return locationsList.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Location.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setNewLocation({ 
        location_area: "", 
        parent_id: "",
        storage_type: "", 
        bin_description: "", 
        qr_code_value: "",
        notes: "",
        color: "#8B5CF6",
        sort_order: 0 
      });
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
    createMutation.mutate({
      ...newLocation,
      active: true,
    });
  };

  const handleUpdate = (id, data) => {
    updateMutation.mutate({ id, data });
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this location? This may affect existing parts.')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (id, location) => {
    updateMutation.mutate({
      id,
      data: { ...location, active: !location.active },
    });
  };

  const handleReorder = async (reorderedItems) => {
    const updates = reorderedItems.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    queryClient.setQueryData(['locations'], reorderedItems.map((item, index) => ({
      ...item,
      sort_order: index
    })));

    try {
      await Promise.all(updates.map(u => base44.entities.Location.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.error('Failed to update order');
    }
  };

  const parentLocations = locations.filter(l => !l.parent_id);

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30">
        <CardTitle className="text-white">Storage Locations</CardTitle>
        <p className="text-sm text-gray-400 mt-1">
          Manage location hierarchy (e.g., Building → Floor → Area → Shelf → Bin)
        </p>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Add New Location Form */}
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400">Location/Area Name *</Label>
              <Input
                value={newLocation.location_area}
                onChange={(e) => setNewLocation({ ...newLocation, location_area: e.target.value })}
                placeholder="e.g., Warehouse A, Shop Floor"
                className="bg-gray-800 border-gray-700 text-white"
                required
              />
            </div>
            <div>
              <Label className="text-gray-400">Parent Location</Label>
              <Select
                value={newLocation.parent_id}
                onValueChange={(value) => setNewLocation({ ...newLocation, parent_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None (Top Level)</SelectItem>
                  {parentLocations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400">Storage Type</Label>
              <Input
                value={newLocation.storage_type}
                onChange={(e) => setNewLocation({ ...newLocation, storage_type: e.target.value })}
                placeholder="e.g., Shelf, Bin, Pallet"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400">Bin/Shelf Description</Label>
              <Input
                value={newLocation.bin_description}
                onChange={(e) => setNewLocation({ ...newLocation, bin_description: e.target.value })}
                placeholder="e.g., A-3-5, Shelf 12"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400">QR Code Value</Label>
              <Input
                value={newLocation.qr_code_value}
                onChange={(e) => setNewLocation({ ...newLocation, qr_code_value: e.target.value })}
                placeholder="Scannable QR code value"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400">Color</Label>
              <input
                type="color"
                value={newLocation.color}
                onChange={(e) => setNewLocation({ ...newLocation, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
            <div>
              <Label className="text-gray-400">Sort Order</Label>
              <Input
                type="number"
                value={newLocation.sort_order}
                onChange={(e) => setNewLocation({ ...newLocation, sort_order: parseInt(e.target.value) || 0 })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-gray-400">Notes</Label>
              <Textarea
                value={newLocation.notes}
                onChange={(e) => setNewLocation({ ...newLocation, notes: e.target.value })}
                placeholder="Additional location notes..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
          </div>
          <Button 
            type="submit" 
            className="bg-red-600 hover:bg-red-700"
            disabled={createMutation.isPending || !newLocation.location_area.trim()}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Location
              </>
            )}
          </Button>
        </form>

        {/* Locations Hierarchical List */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : locations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No locations yet. Add one above.
          </div>
        ) : (
          <HierarchicalList
            items={locations}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onReorder={handleReorder}
            nameKey="location_area"
            colorKey="color"
            showColor={true}
            additionalFields={[
              { key: 'storage_type', label: 'Storage Type', type: 'text' },
              { key: 'bin_description', label: 'Bin/Shelf', type: 'text' },
              { key: 'qr_code_value', label: 'QR Code', type: 'text' },
              { key: 'notes', label: 'Notes', type: 'textarea' }
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}