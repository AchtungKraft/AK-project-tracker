import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import HierarchicalList from "./HierarchicalList";

export default function CarMakesConfig() {
  const queryClient = useQueryClient();
  const [newMake, setNewMake] = useState({ 
    name: "", 
    description: "",
    color: "#3B82F6", 
    sort_order: 0 
  });

  const { data: makes = [] } = useQuery({
    queryKey: ['carMakes'],
    queryFn: async () => {
      const list = await base44.entities.CarMake.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.CarMake.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carMakes'] });
      setNewMake({ name: "", description: "", color: "#3B82F6", sort_order: 0 });
      toast.success('Car make created');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CarMake.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carMakes'] });
      toast.success('Car make updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CarMake.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carMakes'] });
      toast.success('Car make deleted');
    }
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newMake.name.trim()) return;
    createMutation.mutate({ ...newMake, active: true });
  };

  const handleUpdate = (id, data) => {
    updateMutation.mutate({ id, data });
  };

  const handleDelete = (id) => {
    if (confirm('Delete this car make? This may affect associated models and years.')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (make) => {
    handleUpdate(make.id, { ...make, active: !make.active });
  };

  const handleReorder = async (parentId, sourceIndex, destIndex) => {
    const reordered = Array.from(makes);
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);

    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    const allMakes = [...makes];
    updates.forEach(update => {
      const idx = allMakes.findIndex(m => m.id === update.id);
      if (idx !== -1) {
        allMakes[idx] = { ...allMakes[idx], sort_order: update.data.sort_order };
      }
    });
    queryClient.setQueryData(['carMakes'], allMakes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

    try {
      await Promise.all(updates.map(u => base44.entities.CarMake.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['carMakes'] });
      toast.error('Failed to update order');
    }
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base">Car Makes</CardTitle>
        <p className="text-sm text-gray-400 mt-1">Manage car manufacturers (e.g., Porsche, BMW)</p>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs">Make Name *</Label>
              <Input
                value={newMake.name}
                onChange={(e) => setNewMake({ ...newMake, name: e.target.value })}
                placeholder="e.g., Porsche"
                className="bg-gray-900/50 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={newMake.color}
                  onChange={(e) => setNewMake({ ...newMake, color: e.target.value })}
                  className="bg-gray-900/50 border-gray-700 h-10 w-20 cursor-pointer"
                />
                <Input
                  type="text"
                  value={newMake.color}
                  onChange={(e) => setNewMake({ ...newMake, color: e.target.value })}
                  placeholder="#3B82F6"
                  className="bg-gray-900/50 border-gray-700 text-white flex-1"
                />
              </div>
            </div>
            <div className="md:col-span-3">
              <Label className="text-gray-400 text-xs">Description</Label>
              <Textarea
                value={newMake.description}
                onChange={(e) => setNewMake({ ...newMake, description: e.target.value })}
                placeholder="Make description..."
                className="bg-gray-900/50 border-gray-700 text-white"
                rows={2}
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
                Add Car Make
              </>
            )}
          </Button>
        </form>

        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Existing Car Makes</Label>
          <HierarchicalList
            items={makes}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onReorder={handleReorder}
            entityName="Car Make"
            showColor={true}
          />
        </div>
      </CardContent>
    </Card>
  );
}