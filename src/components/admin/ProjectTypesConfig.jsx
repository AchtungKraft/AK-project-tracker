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

export default function ProjectTypesConfig() {
  const queryClient = useQueryClient();
  const [newType, setNewType] = useState({ name: "", parent_id: "" });

  const { data: projectTypes = [], isLoading } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ProjectType.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypes'] });
      setNewType({ name: "", parent_id: "" });
      toast.success('Project type created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProjectType.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypes'] });
      toast.success('Project type updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectType.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypes'] });
      toast.success('Project type deleted');
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newType.name.trim()) return;
    createMutation.mutate({
      name: newType.name,
      parent_id: newType.parent_id || null,
      active: true,
      sort_order: projectTypes.length,
    });
  };

  const handleUpdate = (id, updates) => {
    updateMutation.mutate({ id, data: updates });
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this project type?')) {
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
        <CardTitle className="text-white">Project Types</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Add New Type Form */}
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label className="text-gray-400">New Project Type</Label>
              <Input
                value={newType.name}
                onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                placeholder="e.g., Restoration, Custom Build"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400">Parent Type (Optional)</Label>
              <Select
                value={newType.parent_id}
                onValueChange={(value) => setNewType({ ...newType, parent_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None (Top Level)</SelectItem>
                  {projectTypes.filter(t => t.active).map(type => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button 
            type="submit" 
            className="bg-red-600 hover:bg-red-700"
            disabled={createMutation.isPending || !newType.name.trim()}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Project Type
              </>
            )}
          </Button>
        </form>

        {/* Hierarchical List */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : (
          <HierarchicalList
            items={projectTypes}
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