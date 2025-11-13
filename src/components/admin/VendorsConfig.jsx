import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit2, Check, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function VendorsConfig() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newVendor, setNewVendor] = useState({ 
    vendor_name: '', 
    website: '', 
    contact_info: '', 
    notes: '',
    active: true,
    sort_order: 0
  });
  const [editing, setEditing] = useState(null);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const vendorList = await base44.entities.Vendor.list();
      return vendorList.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Vendor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Vendor created');
      setNewVendor({ vendor_name: '', website: '', contact_info: '', notes: '', active: true, sort_order: 0 });
      setShowAdd(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vendor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Vendor updated');
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Vendor.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Vendor deleted');
    },
  });

  const handleToggleActive = (vendor) => {
    updateMutation.mutate({ 
      id: vendor.id, 
      data: { ...vendor, active: !vendor.active } 
    });
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(vendors);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);

    const updates = items.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    queryClient.setQueryData(['vendors'], items.map((item, index) => ({
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

  return (
    <div className="space-y-6">
      {showAdd && (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30">
            <CardTitle className="text-white">Add New Vendor</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vendor Name</Label>
                  <Input
                    placeholder="Vendor name..."
                    value={newVendor.vendor_name}
                    onChange={(e) => setNewVendor({ ...newVendor, vendor_name: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Website/Ordering Link</Label>
                  <Input
                    placeholder="https://..."
                    value={newVendor.website}
                    onChange={(e) => setNewVendor({ ...newVendor, website: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Contact Info</Label>
                <Input
                  placeholder="Phone, email, contact person..."
                  value={newVendor.contact_info}
                  onChange={(e) => setNewVendor({ ...newVendor, contact_info: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Additional notes..."
                  value={newVendor.notes}
                  onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAdd(false);
                    setNewVendor({ vendor_name: '', website: '', contact_info: '', notes: '', active: true, sort_order: 0 });
                  }}
                  className="border-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate(newVendor)}
                  disabled={!newVendor.vendor_name.trim() || createMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Create Vendor
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!showAdd && (
        <div className="flex justify-end">
          <Button 
            onClick={() => setShowAdd(true)}
            className="bg-red-600 hover:bg-red-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Vendor
          </Button>
        </div>
      )}

      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30">
          <CardTitle className="text-white">Vendors</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="vendors-list">
                {(provided) => (
                  <div 
                    {...provided.droppableProps} 
                    ref={provided.innerRef}
                    className="space-y-2"
                  >
                    {vendors.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        No vendors yet
                      </div>
                    ) : (
                      vendors.map((vendor, index) => (
                        <Draggable key={vendor.id} draggableId={vendor.id} index={index}>
                          {(provided, snapshot) => (
                            <div 
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`p-4 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/30 transition-colors ${
                                snapshot.isDragging ? 'shadow-lg border-red-900/50' : ''
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing pt-1">
                                  <GripVertical className="w-5 h-5 text-gray-500" />
                                </div>
                                <div className="flex-1">
                                  {editing === vendor.id ? (
                                    <div className="space-y-3">
                                      <Input
                                        value={vendor.vendor_name}
                                        onChange={(e) => {
                                          const currentVendors = queryClient.getQueryData(['vendors']) || [];
                                          const updated = currentVendors.map(v => 
                                            v.id === vendor.id ? { ...v, vendor_name: e.target.value } : v
                                          );
                                          queryClient.setQueryData(['vendors'], updated);
                                        }}
                                        className="bg-gray-800 border-gray-700 text-white"
                                      />
                                      <Input
                                        placeholder="Website..."
                                        value={vendor.website || ''}
                                        onChange={(e) => {
                                          const currentVendors = queryClient.getQueryData(['vendors']) || [];
                                          const updated = currentVendors.map(v => 
                                            v.id === vendor.id ? { ...v, website: e.target.value } : v
                                          );
                                          queryClient.setQueryData(['vendors'], updated);
                                        }}
                                        className="bg-gray-800 border-gray-700 text-white"
                                      />
                                      <Input
                                        placeholder="Contact info..."
                                        value={vendor.contact_info || ''}
                                        onChange={(e) => {
                                          const currentVendors = queryClient.getQueryData(['vendors']) || [];
                                          const updated = currentVendors.map(v => 
                                            v.id === vendor.id ? { ...v, contact_info: e.target.value } : v
                                          );
                                          queryClient.setQueryData(['vendors'], updated);
                                        }}
                                        className="bg-gray-800 border-gray-700 text-white"
                                      />
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="flex items-center gap-2 mb-1">
                                        <h3 className={`font-semibold text-white ${!vendor.active && 'opacity-50'}`}>
                                          {vendor.vendor_name}
                                        </h3>
                                      </div>
                                      {vendor.website && (
                                        <a 
                                          href={vendor.website} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-sm text-red-400 hover:text-red-300 block mb-1"
                                        >
                                          {vendor.website}
                                        </a>
                                      )}
                                      {vendor.contact_info && (
                                        <p className="text-sm text-gray-400">{vendor.contact_info}</p>
                                      )}
                                      {vendor.notes && (
                                        <p className="text-sm text-gray-500 mt-2">{vendor.notes}</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-4">
                                  {editing === vendor.id ? (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          const currentVendors = queryClient.getQueryData(['vendors']) || [];
                                          const vendorToUpdate = currentVendors.find(v => v.id === vendor.id);
                                          if (vendorToUpdate) {
                                            updateMutation.mutate({ id: vendor.id, data: vendorToUpdate });
                                          }
                                        }}
                                        className="bg-green-600 hover:bg-green-700"
                                      >
                                        <Check className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setEditing(null);
                                          queryClient.invalidateQueries({ queryKey: ['vendors'] });
                                        }}
                                        className="border-gray-700"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-400">Active</span>
                                        <Switch
                                          checked={vendor.active}
                                          onCheckedChange={() => handleToggleActive(vendor)}
                                        />
                                      </div>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => setEditing(vendor.id)}
                                        className="text-gray-400 hover:text-white"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                          if (confirm('Delete this vendor?')) {
                                            deleteMutation.mutate(vendor.id);
                                          }
                                        }}
                                        className="text-gray-400 hover:text-red-400"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </CardContent>
      </Card>
    </div>
  );
}