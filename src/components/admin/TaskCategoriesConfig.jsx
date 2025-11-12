import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import HierarchicalList from "./HierarchicalList";

export default function TaskCategoriesConfig() {
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState({ name: "", parent_id: "" });

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TaskCategory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
      setNewCategory({ name: "", parent_id: "" });
      toast.success('Task category created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TaskCategory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
      toast.success('Task category updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TaskCategory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
      toast.success('Task category deleted');
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newCategory.name.trim()) return;
    createMutation.mutate({
      name: newCategory.name,
      parent_id: newCategory.parent_id || null,
      active: true,
      sort_order: categories.length,
    });
  };

  const handleUpdate = (id, updates) => {
    updateMutation.mutate({ id, data: updates });
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this task category?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (id, item) => {
    updateMutation.mutate({ 
      id, 
      data: { active: !item.active } 
    });
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30">
        <CardTitle className="text-white">Task Categories</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Add New Category Form */}
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label className="text-gray-400">New Task Category</Label>
              <Input
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                placeholder="e.g., Fabrication, Electrical"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400">Parent Category (Optional)</Label>
              <Select
                value={newCategory.parent_id}
                onValueChange={(value) => setNewCategory({ ...newCategory, parent_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None (Top Level)</SelectItem>
                  {categories.filter(c => c.active).map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button 
            type="submit" 
            className="bg-red-600 hover:bg-red-700"
            disabled={createMutation.isPending || !newCategory.name.trim()}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Task Category
              </>
            )}
          </Button>
        </form>

        {/* Hierarchical List */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : (
          <HierarchicalList
            items={categories}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            nameField="name"
          />
        )}
      </CardContent>
    </Card>
  );
}