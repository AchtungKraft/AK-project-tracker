import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import HierarchicalList from "./HierarchicalList";

export default function VendorsConfig() {
  const queryClient = useQueryClient();
  const [newVendor, setNewVendor] = useState({
    vendor_name: "",
    parent_id: "",
    website: "",
    contact_info: "",
    notes: "",
    color: "#3B82F6",
    sort_order: 0,
  });

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const vendorsList = await base44.entities.Vendor.list();
      return vendorsList.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Vendor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setNewVendor({ 
        vendor_name: "", 
        parent_id: "",
        website: "", 
        contact_info: "", 
        notes: "",
        color: "#3B82F6",
        sort_order: 0 
      });
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
    createMutation.mutate({
      ...newVendor,
      active: true,
    });
  };

  const handleUpdate = (id, data) => {
    updateMutation.mutate({ id, data });
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this vendor? This may affect existing parts.')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (id, vendor) => {
    updateMutation.mutate({
      id,
      data: { ...vendor, active: !vendor.active },
    });
  };

  const handleReorder = async (reorderedItems) => {
    const updates = reorderedItems.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    queryClient.setQueryData(['vendors'], reorderedItems.map((item, index) => ({
      ...item,
      sort_order: index
    })));

    try {
      await Promise.all(updates.map(u => base44.entities.Vendor.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.error('Failed to update order');
    }
  };

  const parentVendors = vendors.filter(v => !v.parent_id);

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30">
        <CardTitle className="text-white">Vendors & Suppliers</CardTitle>
        <p className="text-sm text-gray-400 mt-1">
          Manage vendor hierarchy (e.g., Supplier Groups → Individual Vendors)
        </p>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Add New Vendor Form */}
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400">Vendor Name *</Label>
              <Input
                value={newVendor.vendor_name}
                onChange={(e) => setNewVendor({ ...newVendor, vendor_name: e.target.value })}
                placeholder="e.g., OEM Parts Supplier"
                className="bg-gray-800 border-gray-700 text-white"
                required
              />
            </div>
            <div>
              <Label className="text-gray-400">Parent Vendor/Group</Label>
              <Select
                value={newVendor.parent_id}
                onValueChange={(value) => setNewVendor({ ...newVendor, parent_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None (Top Level)</SelectItem>
                  {parentVendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400">Website</Label>
              <Input
                type="url"
                value={newVendor.website}
                onChange={(e) => setNewVendor({ ...newVendor, website: e.target.value })}
                placeholder="https://vendor.com"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400">Contact Info</Label>
              <Input
                value={newVendor.contact_info}
                onChange={(e) => setNewVendor({ ...newVendor, contact_info: e.target.value })}
                placeholder="Phone, email, etc."
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400">Color</Label>
              <input
                type="color"
                value={newVendor.color}
                onChange={(e) => setNewVendor({ ...newVendor, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
            <div>
              <Label className="text-gray-400">Sort Order</Label>
              <Input
                type="number"
                value={newVendor.sort_order}
                onChange={(e) => setNewVendor({ ...newVendor, sort_order: parseInt(e.target.value) || 0 })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-gray-400">Notes</Label>
              <Textarea
                value={newVendor.notes}
                onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
                placeholder="Additional vendor notes..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
          </div>
          <Button 
            type="submit" 
            className="bg-red-600 hover:bg-red-700"
            disabled={createMutation.isPending || !newVendor.vendor_name.trim()}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Vendor
              </>
            )}
          </Button>
        </form>

        {/* Vendors Hierarchical List */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : vendors.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No vendors yet. Add one above.
          </div>
        ) : (
          <HierarchicalList
            items={vendors}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onReorder={handleReorder}
            nameKey="vendor_name"
            colorKey="color"
            showColor={true}
            additionalFields={[
              { key: 'website', label: 'Website', type: 'url' },
              { key: 'contact_info', label: 'Contact', type: 'text' },
              { key: 'notes', label: 'Notes', type: 'textarea' }
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}