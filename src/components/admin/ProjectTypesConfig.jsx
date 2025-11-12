import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function ProjectTypesConfig() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState({ name: '', active: true });
  const [editing, setEditing] = useState(null);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list('sort_order'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ProjectType.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypes'] });
      toast.success('Project type created');
      setNewType({ name: '', active: true });
      setShowAdd(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProjectType.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypes'] });
      toast.success('Project type updated');
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectType.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypes'] });
      toast.success('Project type deleted');
    },
  });

  const handleToggleActive = (type) => {
    updateMutation.mutate({ 
      id: type.id, 
      data: { ...type, active: !type.active } 
    });
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30">
        <div className="flex justify-between items-center">
          <CardTitle className="text-white">Project Types</CardTitle>
          <Button 
            onClick={() => setShowAdd(!showAdd)}
            className="bg-red-600 hover:bg-red-700 gap-2"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            Add Type
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-6">
        {showAdd && (
          <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-red-900/20">
            <div className="flex gap-3">
              <Input
                placeholder="Type name..."
                value={newType.name}
                onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newType.name.trim()) {
                    createMutation.mutate(newType);
                  }
                }}
              />
              <Button
                onClick={() => createMutation.mutate(newType)}
                disabled={!newType.name.trim() || createMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAdd(false);
                  setNewType({ name: '', active: true });
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
        ) : types.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No project types yet. Click "Add Type" to create one.
          </div>
        ) : (
          <div className="space-y-2">
            {types.map(type => (
              <div 
                key={type.id}
                className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/30 transition-colors"
              >
                {editing === type.id ? (
                  <>
                    <Input
                      value={type.name}
                      onChange={(e) => {
                        const updated = types.map(t => 
                          t.id === type.id ? { ...t, name: e.target.value } : t
                        );
                        queryClient.setQueryData(['projectTypes'], updated);
                      }}
                      className="bg-gray-800 border-gray-700 text-white mr-3"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateMutation.mutate({ id: type.id, data: type })}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(null);
                          queryClient.invalidateQueries({ queryKey: ['projectTypes'] });
                        }}
                        className="border-gray-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className={`text-white font-medium ${!type.active && 'opacity-50'}`}>
                      {type.name}
                    </span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">Active</span>
                        <Switch
                          checked={type.active}
                          onCheckedChange={() => handleToggleActive(type)}
                        />
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(type.id)}
                        className="text-gray-400 hover:text-white"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm('Delete this project type?')) {
                            deleteMutation.mutate(type.id);
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