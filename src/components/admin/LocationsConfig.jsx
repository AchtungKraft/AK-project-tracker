import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Edit2, Trash2, Check, X, ChevronRight, ChevronDown, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

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
    sort_order: 0
  });
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const list = await base44.entities.Location.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Location.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setNewLocation({ location_area: "", parent_id: "", storage_type: "", bin_description: "", qr_code_value: "", notes: "", color: "#8B5CF6", sort_order: 0 });
      toast.success('Location created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Location.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setEditing(null);
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
    createMutation.mutate({ ...newLocation, active: true });
  };

  const handleToggleActive = (location) => {
    updateMutation.mutate({ id: location.id, data: { ...location, active: !location.active } });
  };

  const handleDragEnd = async (result, parentId = null) => {
    if (!result.destination) return;

    const itemsToReorder = parentId 
      ? locations.filter(l => l.parent_id === parentId)
      : locations.filter(l => !l.parent_id);

    const reordered = Array.from(itemsToReorder);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

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
    queryClient.setQueryData(['locations'], allLocations);

    try {
      await Promise.all(updates.map(u => base44.entities.Location.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.error('Failed to update order');
    }
  };

  const parentLocations = locations.filter(l => !l.parent_id);
  const childrenMap = {};
  locations.forEach(location => {
    if (location.parent_id) {
      if (!childrenMap[location.parent_id]) childrenMap[location.parent_id] = [];
      childrenMap[location.parent_id].push(location);
    }
  });

  const renderLocation = (location, index, parentId = null) => {
    const hasChildren = childrenMap[location.id]?.length > 0;
    const isCollapsed = collapsed[location.id];
    const isEditing = editing === location.id;

    return (
      <Draggable key={location.id} draggableId={location.id} index={index}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.draggableProps}>
            <div className={`p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors ${
              snapshot.isDragging ? 'shadow-lg border border-red-900/50' : ''
            }`}>
              <div className="flex items-start gap-3">
                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing mt-1">
                  <GripVertical className="w-5 h-5 text-gray-500" />
                </div>
                
                {hasChildren && (
                  <button onClick={() => setCollapsed(prev => ({ ...prev, [location.id]: !prev[location.id] }))} 
                          className="text-gray-400 hover:text-white mt-1">
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}
                {!hasChildren && <div className="w-4" />}

                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        value={location.location_area}
                        onChange={(e) => {
                          const updated = locations.map(l => 
                            l.id === location.id ? { ...l, location_area: e.target.value } : l
                          );
                          queryClient.setQueryData(['locations'], updated);
                        }}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Input
                        value={location.storage_type || ''}
                        onChange={(e) => {
                          const updated = locations.map(l => 
                            l.id === location.id ? { ...l, storage_type: e.target.value } : l
                          );
                          queryClient.setQueryData(['locations'], updated);
                        }}
                        placeholder="Storage type..."
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Input
                        value={location.bin_description || ''}
                        onChange={(e) => {
                          const updated = locations.map(l => 
                            l.id === location.id ? { ...l, bin_description: e.target.value } : l
                          );
                          queryClient.setQueryData(['locations'], updated);
                        }}
                        placeholder="Bin/shelf description..."
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Input
                        value={location.qr_code_value || ''}
                        onChange={(e) => {
                          const updated = locations.map(l => 
                            l.id === location.id ? { ...l, qr_code_value: e.target.value } : l
                          );
                          queryClient.setQueryData(['locations'], updated);
                        }}
                        placeholder="QR code value..."
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Textarea
                        value={location.notes || ''}
                        onChange={(e) => {
                          const updated = locations.map(l => 
                            l.id === location.id ? { ...l, notes: e.target.value } : l
                          );
                          queryClient.setQueryData(['locations'], updated);
                        }}
                        placeholder="Notes..."
                        className="bg-gray-800 border-gray-700 text-white"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={location.color || '#8B5CF6'}
                          onChange={(e) => {
                            const updated = locations.map(l => 
                              l.id === location.id ? { ...l, color: e.target.value } : l
                            );
                            queryClient.setQueryData(['locations'], updated);
                          }}
                          className="w-16 h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
                        />
                        <Select
                          value={location.parent_id || "none"}
                          onValueChange={(value) => {
                            const updated = locations.map(l => 
                              l.id === location.id ? { ...l, parent_id: value === "none" ? "" : value } : l
                            );
                            queryClient.setQueryData(['locations'], updated);
                          }}
                        >
                          <SelectTrigger className="bg-gray-800 border-gray-700 text-white flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Parent (Top Level)</SelectItem>
                            {parentLocations.filter(p => p.id !== location.id).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.location_area}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded border border-gray-600" style={{ backgroundColor: location.color }} />
                        <span className="font-medium text-white" style={{ color: location.color }}>
                          {location.location_area}
                        </span>
                        {!location.active && (
                          <Badge variant="outline" className="text-xs bg-gray-800 text-gray-500">Inactive</Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-400 mt-1 space-y-1">
                        {location.storage_type && <p>Type: {location.storage_type}</p>}
                        {location.bin_description && <p>Bin: {location.bin_description}</p>}
                        {location.qr_code_value && <p className="font-mono text-xs">QR: {location.qr_code_value}</p>}
                        {location.notes && <p className="italic text-gray-500">{location.notes}</p>}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => updateMutation.mutate({ id: location.id, data: location })}
                              className="h-8 w-8 text-green-400">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['locations'] }); }}
                              className="h-8 w-8 text-gray-400">
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => handleToggleActive(location)}
                              className="h-8 w-8 text-gray-400">
                        <span className="text-xs">{location.active ? '✓' : '○'}</span>
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => setEditing(location.id)}
                              className="h-8 w-8 text-blue-400">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => {
                                if (confirm('Delete this location?')) deleteMutation.mutate(location.id);
                              }}
                              className="h-8 w-8 text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {hasChildren && !isCollapsed && (
              <div className="ml-8 mt-2 space-y-2">
                <DragDropContext onDragEnd={(result) => handleDragEnd(result, location.id)}>
                  <Droppable droppableId={`children-${location.id}`}>
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                        {childrenMap[location.id].map((child, childIndex) => renderLocation(child, childIndex, location.id))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              </div>
            )}
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base">Storage Locations</CardTitle>
        <p className="text-sm text-gray-400 mt-1">Manage location hierarchy and details</p>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs">Location/Area Name *</Label>
              <Input
                value={newLocation.location_area}
                onChange={(e) => setNewLocation({ ...newLocation, location_area: e.target.value })}
                placeholder="e.g., Warehouse A, Shop Floor"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Parent Location</Label>
              <Select
                value={newLocation.parent_id || "none"}
                onValueChange={(value) => setNewLocation({ ...newLocation, parent_id: value === "none" ? "" : value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Top Level)</SelectItem>
                  {parentLocations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Storage Type</Label>
              <Input
                value={newLocation.storage_type}
                onChange={(e) => setNewLocation({ ...newLocation, storage_type: e.target.value })}
                placeholder="e.g., Shelf, Bin, Pallet"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Bin/Shelf Description</Label>
              <Input
                value={newLocation.bin_description}
                onChange={(e) => setNewLocation({ ...newLocation, bin_description: e.target.value })}
                placeholder="e.g., A-3-5, Shelf 12"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">QR Code Value</Label>
              <Input
                value={newLocation.qr_code_value}
                onChange={(e) => setNewLocation({ ...newLocation, qr_code_value: e.target.value })}
                placeholder="Scannable QR code value"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <input
                type="color"
                value={newLocation.color}
                onChange={(e) => setNewLocation({ ...newLocation, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Sort Order</Label>
              <Input
                type="number"
                value={newLocation.sort_order}
                onChange={(e) => setNewLocation({ ...newLocation, sort_order: parseInt(e.target.value) || 0 })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs">Notes</Label>
              <Textarea
                value={newLocation.notes}
                onChange={(e) => setNewLocation({ ...newLocation, notes: e.target.value })}
                placeholder="Additional location notes..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
          </div>
          <Button type="submit" disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 gap-2">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Add Location</>}
          </Button>
        </form>

        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Existing Locations</Label>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : locations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No locations yet</div>
          ) : (
            <DragDropContext onDragEnd={(result) => handleDragEnd(result, null)}>
              <Droppable droppableId="parents">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {parentLocations.map((location, index) => renderLocation(location, index, null))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </CardContent>
    </Card>
  );
}