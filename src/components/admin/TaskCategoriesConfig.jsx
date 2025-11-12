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

export default function TaskCategoriesConfig() {
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState({ name: "", color: "#10B981", parent_id: "" });

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TaskCategory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
      setNewCategory({ name: "", color: "#10B981", parent_id: "" });
      toast.success('Task category created');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TaskCategory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
      toast.success('Task category updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TaskCategory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
      toast.success('Task category deleted');
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
    if (confirm('Delete this task category?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (category) => {
    handleUpdate(category.id, { active: !category.active });
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base">Task Categories</CardTitle>
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
                  placeholder="#10B981"
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
                Add Task Category
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
            entityName="Task Category"
            showColor={true}
          />
        </div>
      </CardContent>
    </Card>
  );
}