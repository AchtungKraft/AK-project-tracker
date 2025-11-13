import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import HierarchicalList from "./HierarchicalList";

export default function PartCategoriesConfig() {
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState({ name: '', color: '#3B82F6' });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PartCategory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partCategories'] });
      toast.success('Category created');
      setNewCategory({ name: '', color: '#3B82F6' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PartCategory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partCategories'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PartCategory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partCategories'] });
      toast.success('Category deleted');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newCategory.name.trim()) {
      createMutation.mutate(newCategory);
    }
  };

  const handleReorder = async (reorderedItems, isParentLevel) => {
    const updates = reorderedItems.map((item, index) => ({
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

  return (
    <div className="space-y-6">
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30">
          <CardTitle className="text-white">Add Part Category</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Category name..."
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="w-24">
              <input
                type="color"
                value={newCategory.color}
                onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
            <Button
              type="submit"
              disabled={!newCategory.name.trim() || createMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30">
          <CardTitle className="text-white">Part Categories</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <HierarchicalList
            items={categories}
            onUpdate={(id, data) => updateMutation.mutate({ id, data })}
            onDelete={(id) => {
              if (confirm('Delete this category?')) {
                deleteMutation.mutate(id);
              }
            }}
            onToggleActive={(item) => {
              updateMutation.mutate({ id: item.id, data: { ...item, active: !item.active } });
            }}
            onReorder={handleReorder}
          />
        </CardContent>
      </Card>
    </div>
  );
}