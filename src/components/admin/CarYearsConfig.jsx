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

export default function CarYearsConfig() {
  const queryClient = useQueryClient();
  const [newYear, setNewYear] = useState({ 
    year: "", 
    car_model_id: "",
    description: "",
    color: "#3B82F6", 
    sort_order: 0 
  });
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [collapsedMakes, setCollapsedMakes] = useState({});

  const { data: makes = [] } = useQuery({
    queryKey: ['carMakes'],
    queryFn: () => base44.entities.CarMake.list()
  });

  const { data: models = [] } = useQuery({
    queryKey: ['carModels'],
    queryFn: () => base44.entities.CarModel.list()
  });

  const { data: years = [] } = useQuery({
    queryKey: ['carYears'],
    queryFn: async () => {
      const list = await base44.entities.CarYear.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.CarYear.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carYears'] });
      setNewYear({ year: "", car_model_id: "", description: "", color: "#3B82F6", sort_order: 0 });
      toast.success('Car year/series created');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CarYear.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carYears'] });
      setEditing(null);
      toast.success('Car year/series updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CarYear.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carYears'] });
      toast.success('Car year/series deleted');
    }
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newYear.year.trim() || !newYear.car_model_id) return;
    createMutation.mutate({ ...newYear, active: true });
  };

  const handleToggleActive = (year) => {
    updateMutation.mutate({ id: year.id, data: { ...year, active: !year.active } });
  };

  const handleDragEnd = async (result, modelId) => {
    if (!result.destination) return;

    const itemsToReorder = years.filter(y => y.car_model_id === modelId);
    const reordered = Array.from(itemsToReorder);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    const allYears = [...years];
    updates.forEach(update => {
      const idx = allYears.findIndex(y => y.id === update.id);
      if (idx !== -1) {
        allYears[idx] = { ...allYears[idx], sort_order: update.data.sort_order };
      }
    });
    queryClient.setQueryData(['carYears'], allYears);

    try {
      await Promise.all(updates.map(u => base44.entities.CarYear.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['carYears'] });
      toast.error('Failed to update order');
    }
  };

  const activeModels = models.filter(m => m.active);
  const yearsByModel = {};
  years.forEach(year => {
    if (!yearsByModel[year.car_model_id]) {
      yearsByModel[year.car_model_id] = [];
    }
    yearsByModel[year.car_model_id].push(year);
  });

  const modelsByMake = {};
  models.forEach(model => {
    if (!modelsByMake[model.car_make_id]) {
      modelsByMake[model.car_make_id] = [];
    }
    modelsByMake[model.car_make_id].push(model);
  });

  const getMakeName = (makeId) => makes.find(m => m.id === makeId)?.name || 'Unknown';
  const getMakeColor = (makeId) => makes.find(m => m.id === makeId)?.color || '#3B82F6';
  const getModelName = (modelId) => models.find(m => m.id === modelId)?.name || 'Unknown';
  const getModelColor = (modelId) => models.find(m => m.id === modelId)?.color || '#3B82F6';

  const renderYear = (year, index, modelId) => {
    const isEditing = editing === year.id;

    return (
      <Draggable key={year.id} draggableId={year.id} index={index}>
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
                        value={year.year}
                        onChange={(e) => {
                          const updated = years.map(y => 
                            y.id === year.id ? { ...y, year: e.target.value } : y
                          );
                          queryClient.setQueryData(['carYears'], updated);
                        }}
                        className="bg-gray-800 border-gray-700 text-white"
                        placeholder="e.g., 1989, 1984-1989, 964"
                      />
                      <Textarea
                        value={year.description || ''}
                        onChange={(e) => {
                          const updated = years.map(y => 
                            y.id === year.id ? { ...y, description: e.target.value } : y
                          );
                          queryClient.setQueryData(['carYears'], updated);
                        }}
                        placeholder="Description..."
                        className="bg-gray-800 border-gray-700 text-white"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={year.color || '#3B82F6'}
                          onChange={(e) => {
                            const updated = years.map(y => 
                              y.id === year.id ? { ...y, color: e.target.value } : y
                            );
                            queryClient.setQueryData(['carYears'], updated);
                          }}
                          className="w-16 h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
                        />
                        <Select
                          value={year.car_model_id}
                          onValueChange={(value) => {
                            const updated = years.map(y => 
                              y.id === year.id ? { ...y, car_model_id: value } : y
                            );
                            queryClient.setQueryData(['carYears'], updated);
                          }}
                        >
                          <SelectTrigger className="bg-gray-800 border-gray-700 text-white flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {activeModels.map(model => (
                              <SelectItem key={model.id} value={model.id}>
                                {getMakeName(model.car_make_id)} {model.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded border border-gray-600" style={{ backgroundColor: year.color }} />
                        <span className="font-medium text-white" style={{ color: year.color }}>
                          {year.year}
                        </span>
                        {!year.active && (
                          <Badge variant="outline" className="text-xs bg-gray-800 text-gray-500">Inactive</Badge>
                        )}
                      </div>
                      {year.description && (
                        <p className="text-sm text-gray-400 mt-1">{year.description}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => updateMutation.mutate({ id: year.id, data: year })}
                              className="h-8 w-8 text-green-400">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['carYears'] }); }}
                              className="h-8 w-8 text-gray-400">
                        <XIcon className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => handleToggleActive(year)}
                              className="h-8 w-8 text-gray-400">
                        <span className="text-xs">{year.active ? '✓' : '○'}</span>
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => setEditing(year.id)}
                              className="h-8 w-8 text-blue-400">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => {
                                if (confirm('Delete this car year/series?')) 
                                  deleteMutation.mutate(year.id);
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
        <CardTitle className="text-white text-base">Car Years / Series</CardTitle>
        <p className="text-sm text-gray-400 mt-1">Manage years and series codes grouped by model (e.g., 1989, 964, 1984-1989)</p>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs">Car Model *</Label>
              <Select
                value={newYear.car_model_id}
                onValueChange={(value) => setNewYear({ ...newYear, car_model_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select model..." />
                </SelectTrigger>
                <SelectContent>
                  {activeModels.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      <span style={{ color: model.color }}>
                        {getMakeName(model.car_make_id)} {model.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Year/Series *</Label>
              <Input
                value={newYear.year}
                onChange={(e) => setNewYear({ ...newYear, year: e.target.value })}
                placeholder="e.g., 1989, 1984-1989, 964"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <input
                type="color"
                value={newYear.color}
                onChange={(e) => setNewYear({ ...newYear, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Sort Order</Label>
              <Input
                type="number"
                value={newYear.sort_order}
                onChange={(e) => setNewYear({ ...newYear, sort_order: parseInt(e.target.value) || 0 })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs">Description</Label>
              <Textarea
                value={newYear.description}
                onChange={(e) => setNewYear({ ...newYear, description: e.target.value })}
                placeholder="Generation or series description..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
          </div>
          <Button type="submit" disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 gap-2">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Add Year/Series</>}
          </Button>
        </form>

        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Existing Years (Grouped by Make &gt; Model)</Label>
          {makes.filter(m => m.active).length === 0 ? (
            <div className="text-center py-8 text-gray-500">No car makes configured. Add makes first.</div>
          ) : (
            <div className="space-y-4">
              {makes.filter(m => m.active).map(make => {
                const makeModels = modelsByMake[make.id] || [];
                const isMakeCollapsed = collapsedMakes[make.id];
                
                if (makeModels.length === 0) return null;
                
                return (
                  <div key={make.id} className="border border-gray-800 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setCollapsedMakes(prev => ({ ...prev, [make.id]: !prev[make.id] }))}
                      className="w-full px-4 py-3 bg-gray-900/90 flex items-center justify-between hover:bg-gray-900"
                    >
                      <div className="flex items-center gap-3">
                        {isMakeCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: make.color }} />
                        <span className="font-bold text-white" style={{ color: make.color }}>
                          {make.name}
                        </span>
                      </div>
                    </button>
                    
                    {!isMakeCollapsed && (
                      <div className="p-3 space-y-3">
                        {makeModels.map(model => {
                          const modelYears = yearsByModel[model.id] || [];
                          const isModelCollapsed = collapsed[model.id];
                          
                          return (
                            <div key={model.id} className="border border-gray-700 rounded-lg overflow-hidden">
                              <button
                                onClick={() => setCollapsed(prev => ({ ...prev, [model.id]: !prev[model.id] }))}
                                className="w-full px-4 py-2 bg-gray-900/70 flex items-center justify-between hover:bg-gray-900"
                              >
                                <div className="flex items-center gap-3">
                                  {isModelCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  <div className="w-3 h-3 rounded" style={{ backgroundColor: model.color }} />
                                  <span className="font-medium text-white text-sm" style={{ color: model.color }}>
                                    {model.name}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {modelYears.length} {modelYears.length === 1 ? 'year' : 'years'}
                                  </Badge>
                                </div>
                              </button>
                              
                              {!isModelCollapsed && (
                                <div className="p-3">
                                  {modelYears.length === 0 ? (
                                    <div className="text-center py-4 text-gray-500 text-sm">No years for this model yet</div>
                                  ) : (
                                    <DragDropContext onDragEnd={(result) => handleDragEnd(result, model.id)}>
                                      <Droppable droppableId={`years-${model.id}`}>
                                        {(provided) => (
                                          <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                            {modelYears.map((year, index) => renderYear(year, index, model.id))}
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
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}