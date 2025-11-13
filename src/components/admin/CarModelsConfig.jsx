import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Edit2, Trash2, Check, X as XIcon, ChevronRight, ChevronDown, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function CarModelsConfig() {
  const queryClient = useQueryClient();
  const [newModel, setNewModel] = useState({ 
    name: "", 
    car_make_id: "",
    description: "",
    color: "#3B82F6", 
    sort_order: 0 
  });
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const { data: makes = [] } = useQuery({
    queryKey: ['carMakes'],
    queryFn: () => base44.entities.CarMake.list()
  });

  const { data: models = [] } = useQuery({
    queryKey: ['carModels'],
    queryFn: async () => {
      const list = await base44.entities.CarModel.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.CarModel.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carModels'] });
      setNewModel({ name: "", car_make_id: "", description: "", color: "#3B82F6", sort_order: 0 });
      toast.success('Car model created');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CarModel.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carModels'] });
      setEditing(null);
      toast.success('Car model updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CarModel.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carModels'] });
      toast.success('Car model deleted');
    }
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newModel.name.trim() || !newModel.car_make_id) return;
    createMutation.mutate({ ...newModel, active: true });
  };

  const handleToggleActive = (model) => {
    updateMutation.mutate({ id: model.id, data: { ...model, active: !model.active } });
  };

  const handleDragEnd = async (result, makeId) => {
    if (!result.destination) return;

    const itemsToReorder = models.filter(m => m.car_make_id === makeId);
    const reordered = Array.from(itemsToReorder);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    const allModels = [...models];
    updates.forEach(update => {
      const idx = allModels.findIndex(m => m.id === update.id);
      if (idx !== -1) {
        allModels[idx] = { ...allModels[idx], sort_order: update.data.sort_order };
      }
    });
    queryClient.setQueryData(['carModels'], allModels);

    try {
      await Promise.all(updates.map(u => base44.entities.CarModel.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['carModels'] });
      toast.error('Failed to update order');
    }
  };

  const activeMakes = makes.filter(m => m.active);
  const modelsByMake = {};
  models.forEach(model => {
    if (!modelsByMake[model.car_make_id]) {
      modelsByMake[model.car_make_id] = [];
    }
    modelsByMake[model.car_make_id].push(model);
  });

  const getMakeName = (makeId) => {
    return makes.find(m => m.id === makeId)?.name || 'Unknown Make';
  };

  const getMakeColor = (makeId) => {
    return makes.find(m => m.id === makeId)?.color || '#3B82F6';
  };

  const renderModel = (model, index, makeId) => {
    const isEditing = editing === model.id;

    return (
      <Draggable key={model.id} draggableId={model.id} index={index}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.draggableProps}>
            <div className={`p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors ${
              snapshot.isDragging ? 'shadow-lg border border-red-900/50' : ''
            }`}>
              <div className="flex items-start gap-3">
                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing mt-1">
                  <GripVertical className="w-5 h-5 text-gray-500" />
                </div>

                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        value={model.name}
                        onChange={(e) => {
                          const updated = models.map(m => 
                            m.id === model.id ? { ...m, name: e.target.value } : m
                          );
                          queryClient.setQueryData(['carModels'], updated);
                        }}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Textarea
                        value={model.description || ''}
                        onChange={(e) => {
                          const updated = models.map(m => 
                            m.id === model.id ? { ...m, description: e.target.value } : m
                          );
                          queryClient.setQueryData(['carModels'], updated);
                        }}
                        placeholder="Description..."
                        className="bg-gray-800 border-gray-700 text-white"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={model.color || '#3B82F6'}
                          onChange={(e) => {
                            const updated = models.map(m => 
                              m.id === model.id ? { ...m, color: e.target.value } : m
                            );
                            queryClient.setQueryData(['carModels'], updated);
                          }}
                          className="w-16 h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
                        />
                        <Select
                          value={model.car_make_id}
                          onValueChange={(value) => {
                            const updated = models.map(m => 
                              m.id === model.id ? { ...m, car_make_id: value } : m
                            );
                            queryClient.setQueryData(['carModels'], updated);
                          }}
                        >
                          <SelectTrigger className="bg-gray-800 border-gray-700 text-white flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {activeMakes.map(make => (
                              <SelectItem key={make.id} value={make.id}>{make.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded border border-gray-600" style={{ backgroundColor: model.color }} />
                        <span className="font-medium text-white" style={{ color: model.color }}>
                          {model.name}
                        </span>
                        {!model.active && (
                          <Badge variant="outline" className="text-xs bg-gray-800 text-gray-500">Inactive</Badge>
                        )}
                      </div>
                      {model.description && (
                        <p className="text-sm text-gray-400 mt-1">{model.description}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => updateMutation.mutate({ id: model.id, data: model })}
                              className="h-8 w-8 text-green-400">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['carModels'] }); }}
                              className="h-8 w-8 text-gray-400">
                        <XIcon className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => handleToggleActive(model)}
                              className="h-8 w-8 text-gray-400">
                        <span className="text-xs">{model.active ? '✓' : '○'}</span>
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => setEditing(model.id)}
                              className="h-8 w-8 text-blue-400">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => {
                                if (confirm('Delete this car model? This may affect associated years.')) 
                                  deleteMutation.mutate(model.id);
                              }}
                              className="h-8 w-8 text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base">Car Models</CardTitle>
        <p className="text-sm text-gray-400 mt-1">Manage car models grouped by make</p>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs">Car Make *</Label>
              <Select
                value={newModel.car_make_id}
                onValueChange={(value) => setNewModel({ ...newModel, car_make_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select make..." />
                </SelectTrigger>
                <SelectContent>
                  {activeMakes.map(make => (
                    <SelectItem key={make.id} value={make.id}>
                      <span style={{ color: make.color }}>{make.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Model Name *</Label>
              <Input
                value={newModel.name}
                onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                placeholder="e.g., 911, Cayenne"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <input
                type="color"
                value={newModel.color}
                onChange={(e) => setNewModel({ ...newModel, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Sort Order</Label>
              <Input
                type="number"
                value={newModel.sort_order}
                onChange={(e) => setNewModel({ ...newModel, sort_order: parseInt(e.target.value) || 0 })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs">Description</Label>
              <Textarea
                value={newModel.description}
                onChange={(e) => setNewModel({ ...newModel, description: e.target.value })}
                placeholder="Model description..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
          </div>
          <Button type="submit" disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 gap-2">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Add Model</>}
          </Button>
        </form>

        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Existing Models (Grouped by Make)</Label>
          {makes.filter(m => m.active).length === 0 ? (
            <div className="text-center py-8 text-gray-500">No car makes configured. Add makes first.</div>
          ) : (
            <div className="space-y-4">
              {makes.filter(m => m.active).map(make => {
                const makeModels = modelsByMake[make.id] || [];
                const isCollapsed = collapsed[make.id];
                
                return (
                  <div key={make.id} className="border border-gray-800 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setCollapsed(prev => ({ ...prev, [make.id]: !prev[make.id] }))}
                      className="w-full px-4 py-3 bg-gray-900/70 flex items-center justify-between hover:bg-gray-900"
                    >
                      <div className="flex items-center gap-3">
                        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: make.color }} />
                        <span className="font-medium text-white" style={{ color: make.color }}>
                          {make.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {makeModels.length} {makeModels.length === 1 ? 'model' : 'models'}
                        </Badge>
                      </div>
                    </button>
                    
                    {!isCollapsed && (
                      <div className="p-3">
                        {makeModels.length === 0 ? (
                          <div className="text-center py-4 text-gray-500 text-sm">No models for this make yet</div>
                        ) : (
                          <DragDropContext onDragEnd={(result) => handleDragEnd(result, make.id)}>
                            <Droppable droppableId={`models-${make.id}`}>
                              {(provided) => (
                                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                  {makeModels.map((model, index) => renderModel(model, index, make.id))}
                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          </DragDropContext>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}