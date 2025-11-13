import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import HierarchicalList from "./HierarchicalList";

export default function VendorsConfig() {
  const queryClient = useQueryClient();
  const [newVendor, setNewVendor] = useState({
    vendor_name: "",
    color: "#3B82F6",
    parent_id: ""
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Vendor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setNewVendor({ vendor_name: "", color: "#3B82F6", parent_id: "" });
      toast.success('Vendor created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vendor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Vendor updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Vendor.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Vendor deleted');
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newVendor.vendor_name.trim()) return;
    createMutation.mutate(newVendor);
  };

  const handleUpdate = (id, data) => {
    updateMutation.mutate({ id, data });
  };

  const handleDelete = (id) => {
    if (confirm('Delete this vendor?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (vendor) => {
    handleUpdate(vendor.id, { ...vendor, active: !vendor.active });
  };

  const handleReorder = async (parentId, sourceIndex, destIndex) => {
    const itemsToReorder = parentId 
      ? vendors.filter(v => v.parent_id === parentId)
      : vendors.filter(v => !v.parent_id);

    const reordered = Array.from(itemsToReorder);
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);

    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    const allVendors = [...vendors];
    updates.forEach(update => {
      const idx = allVendors.findIndex(v => v.id === update.id);
      if (idx !== -1) {
        allVendors[idx] = { ...allVendors[idx], sort_order: update.data.sort_order };
      }
    });
    queryClient.setQueryData(['vendors'], allVendors.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

    try {
      await Promise.all(updates.map(u => base44.entities.Vendor.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.error('Failed to update order');
    }
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base">Vendors & Suppliers</CardTitle>
        <p className="text-sm text-gray-400 mt-1">
          Manage vendor hierarchy (e.g., Supplier Groups → Individual Vendors)
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs">Vendor Name</Label>
              <Input
                value={newVendor.vendor_name}
                onChange={(e) => setNewVendor({ ...newVendor, vendor_name: e.target.value })}
                placeholder="Enter vendor name"
                className="bg-gray-900/50 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={newVendor.color}
                  onChange={(e) => setNewVendor({ ...newVendor, color: e.target.value })}
                  className="bg-gray-900/50 border-gray-700 h-10 w-20 cursor-pointer"
                />
                <Input
                  type="text"
                  value={newVendor.color}
                  onChange={(e) => setNewVendor({ ...newVendor, color: e.target.value })}
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
                Add Vendor
              </>
            )}
          </Button>
        </form>

        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Existing Vendors</Label>
          <HierarchicalList
            items={vendors}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onReorder={handleReorder}
            entityName="Vendor"
            nameKey="vendor_name"
            showColor={true}
          />
        </div>
      </CardContent>
    </Card>
  );
}