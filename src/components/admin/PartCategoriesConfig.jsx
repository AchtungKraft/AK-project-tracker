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

export default function PartCategoriesConfig() {
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState({ 
    name: "", 
    parent_id: "",
    description: "",
    color: "#3B82F6", 
    sort_order: 0 
  });
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['partCategories'],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PartCategory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partCategories'] });
      setNewCategory({ name: "", parent_id: "", description: "", color: "#3B82F6", sort_order: 0 });
      toast.success('Part category created');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PartCategory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partCategories'] });
      setEditing(null);
      toast.success('Part category updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PartCategory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partCategories'] });
      toast.success('Part category deleted');
    }
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newCategory.name.trim()) return;
    createMutation.mutate({ ...newCategory, active: true });
  };

  const handleToggleActive = (category) => {
    updateMutation.mutate({ 
      id: category.id, 
      data: { ...category, active: !category.active } 
    });
  };

  const handleDragEnd = async (result, parentId = null) => {
    if (!result.destination) return;

    const itemsToReorder = parentId 
      ? categories.filter(c => c.parent_id === parentId)
      : categories.filter(c => !c.parent_id);

    const reordered = Array.from(itemsToReorder);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    const allCategories = [...categories];
    updates.forEach(update => {
      const idx = allCategories.findIndex(c => c.id === update.id);
      if (idx !== -1) {
        allCategories[idx] = { ...allCategories[idx], sort_order: update.data.sort_order };
      }
    });
    queryClient.setQueryData(['partCategories'], allCategories);

    try {
      await Promise.all(updates.map(u => base44.entities.PartCategory.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['partCategories'] });
      toast.error('Failed to update order');
    }
  };

  const parentCategories = categories.filter(c => !c.parent_id);
  const childrenMap = {};
  categories.forEach(cat => {
    if (cat.parent_id) {
      if (!childrenMap[cat.parent_id]) childrenMap[cat.parent_id] = [];
      childrenMap[cat.parent_id].push(cat);
    }
  });

  const renderCategory = (category, index, parentId = null) => {
    const hasChildren = childrenMap[category.id]?.length > 0;
    const isCollapsed = collapsed[category.id];
    const isEditing = editing === category.id;

    return (
      <Draggable key={category.id} draggableId={category.id} index={index}>
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
                  <button onClick={() => setCollapsed(prev => ({ ...prev, [category.id]: !prev[category.id] }))} 
                          className="text-gray-400 hover:text-white mt-1">
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}
                {!hasChildren && <div className="w-4" />}

                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        value={category.name}
                        onChange={(e) => {
                          const updated = categories.map(c => 
                            c.id === category.id ? { ...c, name: e.target.value } : c
                          );
                          queryClient.setQueryData(['partCategories'], updated);
                        }}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Textarea
                        value={category.description || ''}
                        onChange={(e) => {
                          const updated = categories.map(c => 
                            c.id === category.id ? { ...c, description: e.target.value } : c
                          );
                          queryClient.setQueryData(['partCategories'], updated);
                        }}
                        placeholder="Description..."
                        className="bg-gray-800 border-gray-700 text-white"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={category.color || '#3B82F6'}
                          onChange={(e) => {
                            const updated = categories.map(c => 
                              c.id === category.id ? { ...c, color: e.target.value } : c
                            );
                            queryClient.setQueryData(['partCategories'], updated);
                          }}
                          className="w-16 h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
                        />
                        <Select
                          value={category.parent_id || "none"}
                          onValueChange={(value) => {
                            const updated = categories.map(c => 
                              c.id === category.id ? { ...c, parent_id: value === "none" ? "" : value } : c
                            );
                            queryClient.setQueryData(['partCategories'], updated);
                          }}
                        >
                          <SelectTrigger className="bg-gray-800 border-gray-700 text-white flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Parent (Top Level)</SelectItem>
                            {parentCategories.filter(p => p.id !== category.id).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded border border-gray-600" style={{ backgroundColor: category.color }} />
                        <span className="font-medium text-white" style={{ color: category.color }}>
                          {category.name}
                        </span>
                        {!category.active && (
                          <Badge variant="outline" className="text-xs bg-gray-800 text-gray-500">Inactive</Badge>
                        )}
                      </div>
                      {category.description && (
                        <p className="text-sm text-gray-400 mt-1">{category.description}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => updateMutation.mutate({ id: category.id, data: category })}
                              className="h-8 w-8 text-green-400">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['partCategories'] }); }}
                              className="h-8 w-8 text-gray-400">
                        <XIcon className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => handleToggleActive(category)}
                              className="h-8 w-8 text-gray-400">
                        <span className="text-xs">{category.active ? '✓' : '○'}</span>
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => setEditing(category.id)}
                              className="h-8 w-8 text-blue-400">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => {
                                if (confirm('Delete this category?')) deleteMutation.mutate(category.id);
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
                <DragDropContext onDragEnd={(result) => handleDragEnd(result, category.id)}>
                  <Droppable droppableId={`children-${category.id}`}>
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                        {childrenMap[category.id].map((child, childIndex) => renderCategory(child, childIndex, category.id))}
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
        <CardTitle className="text-white text-base">Part Categories</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs">Category Name *</Label>
              <Input
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                placeholder="e.g., Engine Parts"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Parent Category</Label>
              <Select
                value={newCategory.parent_id || "none"}
                onValueChange={(value) => setNewCategory({ ...newCategory, parent_id: value === "none" ? "" : value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Top Level)</SelectItem>
                  {parentCategories.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <input
                type="color"
                value={newCategory.color}
                onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Sort Order</Label>
              <Input
                type="number"
                value={newCategory.sort_order}
                onChange={(e) => setNewCategory({ ...newCategory, sort_order: parseInt(e.target.value) || 0 })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs">Description</Label>
              <Textarea
                value={newCategory.description}
                onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                placeholder="Category description..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
          </div>
          <Button type="submit" disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 gap-2">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Add Category</>}
          </Button>
        </form>

        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Existing Categories</Label>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No categories yet</div>
          ) : (
            <DragDropContext onDragEnd={(result) => handleDragEnd(result, null)}>
              <Droppable droppableId="parents">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {parentCategories.map((cat, index) => renderCategory(cat, index, null))}
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