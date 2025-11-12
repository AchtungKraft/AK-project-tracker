import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit2, Check, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function StatusListConfig() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newStatus, setNewStatus] = useState({ 
    scope: 'Project', 
    label: '', 
    color: '#EF4444', 
    active: true,
    sort_order: 0
  });
  const [editing, setEditing] = useState(null);

  const { data: statuses = [], isLoading } = useQuery({
    queryKey: ['statuses'],
    queryFn: async () => {
      const statusList = await base44.entities.StatusList.list();
      return statusList.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project');
  const taskStatuses = statuses.filter(s => s.scope === 'Task');

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.StatusList.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statuses'] });
      toast.success('Status created');
      setNewStatus({ scope: 'Project', label: '', color: '#EF4444', active: true, sort_order: 0 });
      setShowAdd(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.StatusList.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statuses'] });
      toast.success('Status updated');
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.StatusList.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statuses'] });
      toast.success('Status deleted');
    },
  });

  const handleToggleActive = (status) => {
    updateMutation.mutate({ 
      id: status.id, 
      data: { ...status, active: !status.active } 
    });
  };

  const handleDragEnd = async (result, scope) => {
    if (!result.destination) return;

    const currentStatuses = queryClient.getQueryData(['statuses']) || [];
    const items = currentStatuses.filter(s => s.scope === scope);
    const reordered = Array.from(items);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    // Update sort_order for all items
    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    // Optimistically update UI
    const allStatuses = [...currentStatuses];
    updates.forEach(update => {
      const idx = allStatuses.findIndex(s => s.id === update.id);
      if (idx !== -1) {
        allStatuses[idx] = { ...allStatuses[idx], sort_order: update.data.sort_order };
      }
    });
    queryClient.setQueryData(['statuses'], allStatuses);

    // Send updates to server
    try {
      await Promise.all(updates.map(u => base44.entities.StatusList.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['statuses'] });
      toast.error('Failed to update order');
    }
  };

  const renderStatusList = (statusList, scope) => (
    <DragDropContext onDragEnd={(result) => handleDragEnd(result, scope)}>
      <Droppable droppableId={`status-list-${scope}`}>
        {(provided) => (
          <div 
            {...provided.droppableProps} 
            ref={provided.innerRef}
            className="space-y-2"
          >
            {statusList.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No {scope.toLowerCase()} statuses yet
              </div>
            ) : (
              statusList.map((status, index) => (
                <Draggable key={status.id} draggableId={status.id} index={index}>
                  {(provided, snapshot) => (
                    <div 
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/30 transition-colors ${
                        snapshot.isDragging ? 'shadow-lg border-red-900/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                          <GripVertical className="w-5 h-5 text-gray-500" />
                        </div>
                      {editing === status.id ? (
                        <>
                  <Input
                    value={status.label}
                    onChange={(e) => {
                      const currentStatuses = queryClient.getQueryData(['statuses']) || [];
                      const updated = currentStatuses.map(s => 
                        s.id === status.id ? { ...s, label: e.target.value } : s
                      );
                      queryClient.setQueryData(['statuses'], updated);
                    }}
                    className="bg-gray-800 border-gray-700 text-white max-w-xs"
                  />
                  <input
                    type="color"
                    value={status.color}
                    onChange={(e) => {
                      const currentStatuses = queryClient.getQueryData(['statuses']) || [];
                      const updated = currentStatuses.map(s => 
                        s.id === status.id ? { ...s, color: e.target.value } : s
                      );
                      queryClient.setQueryData(['statuses'], updated);
                    }}
                    className="w-12 h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
                  />
                        </>
                      ) : (
                        <>
                          <div 
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: status.color }}
                          />
                          <span className={`text-white font-medium ${!status.active && 'opacity-50'}`}>
                            {status.label}
                          </span>
                        </>
                      )}
                      </div>
                      <div className="flex items-center gap-4">
                        {editing === status.id ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => updateMutation.mutate({ id: status.id, data: status })}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditing(null);
                                queryClient.invalidateQueries({ queryKey: ['statuses'] });
                              }}
                              className="border-gray-700"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-400">Active</span>
                              <Switch
                                checked={status.active}
                                onCheckedChange={() => handleToggleActive(status)}
                              />
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditing(status.id)}
                              className="text-gray-400 hover:text-white"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm('Delete this status?')) {
                                  deleteMutation.mutate(status.id);
                                }
                              }}
                              className="text-gray-400 hover:text-red-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </Draggable>
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );

  return (
    <div className="space-y-6">
      {showAdd && (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30">
            <CardTitle className="text-white">Add New Status</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select
                  value={newStatus.scope}
                  onValueChange={(value) => setNewStatus({ ...newStatus, scope: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Project">Project</SelectItem>
                    <SelectItem value="Task">Task</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    placeholder="Status label..."
                    value={newStatus.label}
                    onChange={(e) => setNewStatus({ ...newStatus, label: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <input
                    type="color"
                    value={newStatus.color}
                    onChange={(e) => setNewStatus({ ...newStatus, color: e.target.value })}
                    className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newStatus.sort_order}
                    onChange={(e) => setNewStatus({ ...newStatus, sort_order: parseInt(e.target.value) || 0 })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAdd(false);
                    setNewStatus({ scope: 'Project', label: '', color: '#EF4444', active: true, sort_order: 0 });
                  }}
                  className="border-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate(newStatus)}
                  disabled={!newStatus.label.trim() || createMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Create Status
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!showAdd && (
        <div className="flex justify-end">
          <Button 
            onClick={() => setShowAdd(true)}
            className="bg-red-600 hover:bg-red-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Status
          </Button>
        </div>
      )}

      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30">
          <CardTitle className="text-white">Project Statuses</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            renderStatusList(projectStatuses, 'Project')
          )}
        </CardContent>
      </Card>

      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30">
          <CardTitle className="text-white">Task Statuses</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            renderStatusList(taskStatuses, 'Task')
          )}
        </CardContent>
      </Card>
    </div>
  );
}