import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Edit2, Trash2, Check, X as XIcon, ChevronRight, ChevronDown, GripVertical, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  buildCategoryLookups,
  buildFlatCategoryOptions,
  validateParentAssignment,
  getCategoryPathLabel,
} from "@/lib/categoryTreeHelpers";

export default function PartCategoriesConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newCategory, setNewCategory] = useState({
    name: "", parent_id: "", description: "", color: "#3B82F6", sort_order: 0,
  });
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["partCategories"],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { byId, childrenByParentId } = useMemo(() => buildCategoryLookups(categories), [categories]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PartCategory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partCategories"] });
      setNewCategory({ name: "", parent_id: "", description: "", color: "#3B82F6", sort_order: 0 });
      toast({ title: "Part category created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PartCategory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partCategories"] });
      setEditing(null);
      toast({ title: "Part category updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PartCategory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partCategories"] });
      toast({ title: "Part category deleted" });
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newCategory.name.trim()) return;

    // Validate parent assignment (cycle prevention not needed for create, but self-reference check)
    if (newCategory.parent_id && !byId[newCategory.parent_id]) {
      toast({ title: "Invalid parent category", variant: "destructive" });
      return;
    }

    createMutation.mutate({ ...newCategory, active: true });
  };

  const handleToggleActive = (category) => {
    updateMutation.mutate({ id: category.id, data: { active: !category.active } });
  };

  const handleSaveEdit = (category) => {
    // Validate parent assignment with cycle prevention
    const error = validateParentAssignment(
      category.id,
      category.parent_id || null,
      byId,
      childrenByParentId
    );
    if (error) {
      toast({ title: "Invalid parent", description: error, variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: category.id, data: category });
  };

  const handleDragEnd = async (result, parentId = null) => {
    if (!result.destination) return;

    const siblings = parentId
      ? (childrenByParentId[parentId] || [])
      : (childrenByParentId["__root__"] || []);

    const reordered = Array.from(siblings);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    const updates = reordered.map((item, index) => ({
      id: item.id,
      sort_order: index,
    }));

    // Optimistic update
    const updated = categories.map(c => {
      const u = updates.find(x => x.id === c.id);
      return u ? { ...c, sort_order: u.sort_order } : c;
    });
    queryClient.setQueryData(
      ["partCategories"],
      updated.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    );

    try {
      await Promise.all(updates.map(u => base44.entities.PartCategory.update(u.id, { sort_order: u.sort_order })));
      toast({ title: "Order updated" });
    } catch {
      queryClient.invalidateQueries({ queryKey: ["partCategories"] });
      toast({ title: "Failed to update order", variant: "destructive" });
    }
  };

  // Recursive render function — works at any depth
  const renderCategory = (category, index) => {
    const children = childrenByParentId[category.id] || [];
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed[category.id];
    const isEditing = editing === category.id;

    // Build parent selector options — exclude self and descendants
    const parentOptions = buildFlatCategoryOptions(categories, category.id);

    return (
      <Draggable key={category.id} draggableId={category.id} index={index}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.draggableProps}>
            <div className={`p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors ${
              snapshot.isDragging ? "shadow-lg border border-red-900/50" : ""
            }`}>
              <div className="flex items-start gap-3">
                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing mt-1">
                  <GripVertical className="w-5 h-5 text-gray-500" />
                </div>

                {hasChildren && (
                  <button
                    onClick={() => setCollapsed(prev => ({ ...prev, [category.id]: !prev[category.id] }))}
                    className="text-gray-400 hover:text-white mt-1"
                  >
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}
                {!hasChildren && <div className="w-4" />}

                <div className="flex-1">
                  {isEditing ? (
                    <CategoryEditForm
                      category={category}
                      categories={categories}
                      parentOptions={parentOptions}
                      onChange={(updated) => {
                        queryClient.setQueryData(
                          ["partCategories"],
                          categories.map(c => (c.id === category.id ? { ...c, ...updated } : c))
                        );
                      }}
                    />
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
                        onClick={() => handleSaveEdit(category)}
                        className="h-8 w-8 text-green-400">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost"
                        onClick={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ["partCategories"] }); }}
                        className="h-8 w-8 text-gray-400">
                        <XIcon className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => handleToggleActive(category)} className="h-8 w-8 text-gray-400">
                        <span className="text-xs">{category.active ? "✓" : "○"}</span>
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditing(category.id)} className="h-8 w-8 text-blue-400">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost"
                        onClick={() => {
                          if (hasChildren) {
                            toast({ title: "Cannot delete", description: "Move or delete child categories first.", variant: "destructive" });
                            return;
                          }
                          if (confirm("Delete this category?")) deleteMutation.mutate(category.id);
                        }}
                        className="h-8 w-8 text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Recursively render children */}
            {hasChildren && !isCollapsed && (
              <div className="ml-8 mt-2 space-y-2">
                <DragDropContext onDragEnd={(result) => handleDragEnd(result, category.id)}>
                  <Droppable droppableId={`children-${category.id}`}>
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                        {children.map((child, childIndex) => renderCategory(child, childIndex))}
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

  // Create form: parent selector shows ALL categories with full path
  const createParentOptions = useMemo(() => buildFlatCategoryOptions(categories), [categories]);

  const rootCategories = childrenByParentId["__root__"] || [];

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base">Part Categories</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        {/* Create Form */}
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs">Category Name *</Label>
              <Input
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                placeholder="e.g., Wiring Harness"
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
                  {createParentOptions.map(opt => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
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

        {/* Existing Categories */}
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
                    {rootCategories.map((cat, index) => renderCategory(cat, index))}
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

/** Inline edit form for a single category */
function CategoryEditForm({ category, categories, parentOptions, onChange }) {
  return (
    <div className="space-y-3">
      <Input
        value={category.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="bg-gray-800 border-gray-700 text-white"
      />
      <Textarea
        value={category.description || ""}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Description..."
        className="bg-gray-800 border-gray-700 text-white"
        rows={2}
      />
      <div className="flex gap-2">
        <input
          type="color"
          value={category.color || "#3B82F6"}
          onChange={(e) => onChange({ color: e.target.value })}
          className="w-16 h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
        />
        <Select
          value={category.parent_id || "none"}
          onValueChange={(value) => onChange({ parent_id: value === "none" ? "" : value })}
        >
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Parent (Top Level)</SelectItem>
            {parentOptions.map(opt => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}