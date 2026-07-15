import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Edit2, GripVertical, Check, X } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { invalidateProjectCaches } from "@/components/tasks/useTaskInteraction";

export default function ManageBucketsModal({ projectId, onClose }) {
  const queryClient = useQueryClient();
  const [newBucket, setNewBucket] = useState({
    name: "",
    color: "#3B82F6",
    description: "",
  });
  const [editingId, setEditingId] = useState(null);
  const [editingData, setEditingData] = useState({});

  // Use canonical key ['projectBuckets', pid] — matches ProjectDetail
  const { data: buckets = [] } = useQuery({
    queryKey: ['projectBuckets', projectId],
    queryFn: () => base44.entities.ProjectKanbanBucket.filter({ project_id: projectId }),
  });

  const sortedBuckets = [...buckets].sort((a, b) => (a.order || 0) - (b.order || 0));

  const invalidateBuckets = () => {
    // Invalidate all bucket-related caches to sync Project Workload + Global Workload
    invalidateProjectCaches(queryClient, projectId);
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ProjectKanbanBucket.create(data),
    onSuccess: () => {
      invalidateBuckets();
      setNewBucket({ name: "", color: "#3B82F6", description: "" });
      toast.success('Bucket created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProjectKanbanBucket.update(id, data),
    onSuccess: () => {
      invalidateBuckets();
      setEditingId(null);
      toast.success('Bucket updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectKanbanBucket.delete(id),
    onSuccess: () => {
      invalidateBuckets();
      toast.success('Bucket deleted');
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newBucket.name.trim()) {
      toast.error('Bucket name is required');
      return;
    }
    createMutation.mutate({
      ...newBucket,
      project_id: projectId,
      order: buckets.length,
    });
  };

  const handleUpdate = (id) => {
    updateMutation.mutate({ id, data: editingData });
  };

  const handleDelete = (id) => {
    if (confirm('Delete this bucket? Tasks will move to Unassigned.')) {
      deleteMutation.mutate(id);
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(sortedBuckets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    items.forEach((item, index) => {
      if (item.order !== index) {
        updateMutation.mutate({ id: item.id, data: { order: index } });
      }
    });
  };

  const startEdit = (bucket) => {
    setEditingId(bucket.id);
    setEditingData({
      name: bucket.name,
      color: bucket.color,
      description: bucket.description || "",
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Manage Kanban Buckets</DialogTitle>
          <DialogDescription>
            Create, edit, and reorder Kanban buckets for organizing tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Create New Bucket */}
          <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <h3 className="text-base font-semibold mb-3">Create New Bucket</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-400 text-xs">Bucket Name *</Label>
                  <Input
                    value={newBucket.name}
                    onChange={(e) => setNewBucket({ ...newBucket, name: e.target.value })}
                    placeholder="e.g., Week 1, High Priority"
                    className="bg-gray-900/50 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Description (optional)</Label>
                  <Input
                    value={newBucket.description}
                    onChange={(e) => setNewBucket({ ...newBucket, description: e.target.value })}
                    placeholder="Bucket description"
                    className="bg-gray-900/50 border-gray-700 text-white"
                  />
                </div>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={newBucket.color}
                    onChange={(e) => setNewBucket({ ...newBucket, color: e.target.value })}
                    className="bg-gray-900/50 border-gray-700 h-10 w-16 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={newBucket.color}
                    onChange={(e) => setNewBucket({ ...newBucket, color: e.target.value })}
                    placeholder="#3B82F6"
                    className="bg-gray-900/50 border-gray-700 text-white flex-1"
                  />
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
                    Add Bucket
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Existing Buckets */}
          <div>
            <h3 className="text-base font-semibold mb-3">Existing Buckets (Drag to reorder)</h3>
            {sortedBuckets.length === 0 ? (
              <p className="text-center py-8 text-gray-500 text-sm">
                No buckets yet. Create one to get started.
              </p>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="buckets">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-2"
                    >
                      {sortedBuckets.map((bucket, index) => (
                        <Draggable key={bucket.id} draggableId={bucket.id} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className="p-3 bg-gray-800/50 rounded-lg border border-gray-700"
                            >
                              {editingId === bucket.id ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label className="text-gray-400 text-xs">Name</Label>
                                      <Input
                                        value={editingData.name}
                                        onChange={(e) => setEditingData({ ...editingData, name: e.target.value })}
                                        className="bg-gray-900/50 border-gray-700 text-white"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-gray-400 text-xs">Description</Label>
                                      <Input
                                        value={editingData.description}
                                        onChange={(e) => setEditingData({ ...editingData, description: e.target.value })}
                                        className="bg-gray-900/50 border-gray-700 text-white"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="text-gray-400 text-xs">Color</Label>
                                    <Input
                                      type="color"
                                      value={editingData.color}
                                      onChange={(e) => setEditingData({ ...editingData, color: e.target.value })}
                                      className="bg-gray-900/50 border-gray-700 h-10 cursor-pointer"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => handleUpdate(bucket.id)}
                                      className="bg-green-600 hover:bg-green-700 gap-1"
                                    >
                                      <Check className="w-3 h-3" />
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingId(null)}
                                      className="border-gray-700"
                                    >
                                      <X className="w-3 h-3" />
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 flex-1">
                                    <div {...provided.dragHandleProps} className="cursor-grab">
                                      <GripVertical className="w-5 h-5 text-gray-500" />
                                    </div>
                                    <div
                                      className="w-4 h-4 rounded border border-gray-600"
                                      style={{ backgroundColor: bucket.color }}
                                    />
                                    <div className="flex-1">
                                      <p className="text-white font-medium">{bucket.name}</p>
                                      {bucket.description && (
                                        <p className="text-xs text-gray-500">{bucket.description}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => startEdit(bucket)}
                                      className="h-8 w-8 text-blue-400 hover:text-blue-300"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleDelete(bucket.id)}
                                      className="h-8 w-8 text-red-400 hover:text-red-300"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-700">
          <Button onClick={onClose} className="bg-red-600 hover:bg-red-700">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}