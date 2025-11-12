import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function TaskCategoriesConfig() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', active: true });
  const [editing, setEditing] = useState(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list('sort_order'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TaskCategory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
      toast.success('Task category created');
      setNewCategory({ name: '', active: true });
      setShowAdd(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TaskCategory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
      toast.success('Task category updated');
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TaskCategory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
      toast.success('Task category deleted');
    },
  });

  const handleToggleActive = (category) => {
    updateMutation.mutate({ 
      id: category.id, 
      data: { ...category, active: !category.active } 
    });
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30">
        <div className="flex justify-between items-center">
          <CardTitle className="text-white">Task Categories</CardTitle>
          <Button 
            onClick={() => setShowAdd(!showAdd)}
            className="bg-red-600 hover:bg-red-700 gap-2"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            Add Category
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-6">
        {showAdd && (
          <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-red-900/20">
            <div className="flex gap-3">
              <Input
                placeholder="Category name..."
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCategory.name.trim()) {
                    createMutation.mutate(newCategory);
                  }
                }}
              />
              <Button
                onClick={() => createMutation.mutate(newCategory)}
                disabled={!newCategory.name.trim() || createMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAdd(false);
                  setNewCategory({ name: '', active: true });
                }}
                className="border-gray-700"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No task categories yet. Click "Add Category" to create one.
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map(category => (
              <div 
                key={category.id}
                className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/30 transition-colors"
              >
                {editing === category.id ? (
                  <>
                    <Input
                      value={category.name}
                      onChange={(e) => {
                        const updated = categories.map(c => 
                          c.id === category.id ? { ...c, name: e.target.value } : c
                        );
                        queryClient.setQueryData(['taskCategories'], updated);
                      }}
                      className="bg-gray-800 border-gray-700 text-white mr-3"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateMutation.mutate({ id: category.id, data: category })}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(null);
                          queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
                        }}
                        className="border-gray-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className={`text-white font-medium ${!category.active && 'opacity-50'}`}>
                      {category.name}
                    </span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">Active</span>
                        <Switch
                          checked={category.active}
                          onCheckedChange={() => handleToggleActive(category)}
                        />
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(category.id)}
                        className="text-gray-400 hover:text-white"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm('Delete this category?')) {
                            deleteMutation.mutate(category.id);
                          }
                        }}
                        className="text-gray-400 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}