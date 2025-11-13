import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import HierarchicalList from "./HierarchicalList";

export default function PartCategoriesConfig() {
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState({ name: "", color: "#3B82F6", parent_id: "" });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PartCategory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partCategories'] });
      setNewCategory({ name: "", color: "#3B82F6", parent_id: "" });
      toast.success('Part category created');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PartCategory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partCategories'] });
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
    createMutation.mutate(newCategory);
  };

  const handleUpdate = (id, data) => {
    updateMutation.mutate({ id, data });
  };

  const handleDelete = (id) => {
    if (confirm('Delete this part category?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (category) => {
    handleUpdate(category.id, { ...category, active: !category.active });
  };

  const handleReorder = async (parentId, sourceIndex, destIndex) => {
    const itemsToReorder = parentId 
      ? categories.filter(c => c.parent_id === parentId)
      : categories.filter(c => !c.parent_id);

    const reordered = Array.from(itemsToReorder);
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);

    // Update sort_order
    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    // Optimistically update
    const allCategories = [...categories];
    updates.forEach(update => {
      const idx = allCategories.findIndex(c => c.id === update.id);
      if (idx !== -1) {
        allCategories[idx] = { ...allCategories[idx], sort_order: update.data.sort_order };
      }
    });
    queryClient.setQueryData(['partCategories'], allCategories.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

    // Send to server
    try {
      await Promise.all(updates.map(u => base44.entities.PartCategory.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['partCategories'] });
      toast.error('Failed to update order');
    }
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base">Part Categories</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs">Category Name</Label>
              <Input
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                placeholder="Enter category name"
                className="bg-gray-900/50 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={newCategory.color}
                  onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                  className="bg-gray-900/50 border-gray-700 h-10 w-20 cursor-pointer"
                />
                <Input
                  type="text"
                  value={newCategory.color}
                  onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                  placeholder="#3B82F6"
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
                Add Part Category
              </>
            )}
          </Button>
        </form>

        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Existing Categories</Label>
          <HierarchicalList
            items={categories}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onReorder={handleReorder}
            entityName="Part Category"
            showColor={true}
          />
        </div>
      </CardContent>
    </Card>
  );
}