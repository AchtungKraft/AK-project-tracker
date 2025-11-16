import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Edit2, Trash2, Check, X as XIcon, ChevronRight, ChevronDown, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function VendorsConfig() {
  const queryClient = useQueryClient();
  const [newVendor, setNewVendor] = useState({
    vendor_name: "",
    parent_id: "",
    website: "",
    contact_info: "",
    notes: "",
    color: "#3B82F6",
    sort_order: 0
  });
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const list = await base44.entities.Vendor.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Vendor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setNewVendor({ vendor_name: "", parent_id: "", website: "", contact_info: "", notes: "", color: "#3B82F6", sort_order: 0 });
      toast.success('Vendor created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vendor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setEditing(null);
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
    createMutation.mutate({ ...newVendor, active: true });
  };

  const handleToggleActive = (vendor) => {
    updateMutation.mutate({ id: vendor.id, data: { ...vendor, active: !vendor.active } });
  };

  const handleDragEnd = async (result, parentId = null) => {
    if (!result.destination) return;

    const itemsToReorder = parentId 
      ? vendors.filter(v => v.parent_id === parentId)
      : vendors.filter(v => !v.parent_id);

    const reordered = Array.from(itemsToReorder);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    const allVendors = vendors.map(v => {
      const update = updates.find(u => u.id === v.id);
      return update ? { ...v, ...update.data } : v;
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

  const parentVendors = vendors.filter(v => !v.parent_id);
  const childrenMap = {};
  vendors.forEach(vendor => {
    if (vendor.parent_id) {
      if (!childrenMap[vendor.parent_id]) childrenMap[vendor.parent_id] = [];
      childrenMap[vendor.parent_id].push(vendor);
    }
  });

  const renderVendor = (vendor, index, parentId = null) => {
    const hasChildren = childrenMap[vendor.id]?.length > 0;
    const isCollapsed = collapsed[vendor.id];
    const isEditing = editing === vendor.id;

    return (
      <Draggable key={vendor.id} draggableId={vendor.id} index={index}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.draggableProps}>
            <div className={`p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors ${
              snapshot.isDragging ? 'shadow-lg border border-red-900/50' : ''
            }`}>
              <div className="flex items-start gap-3">
                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing mt-1">
                  <GripVertical className="w-5 h-5 text-gray-500" />
                </div>
                
                {hasChildren && (
                  <button onClick={() => setCollapsed(prev => ({ ...prev, [vendor.id]: !prev[vendor.id] }))} 
                          className="text-gray-400 hover:text-white mt-1">
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}
                {!hasChildren && <div className="w-4" />}

                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        value={vendor.vendor_name}
                        onChange={(e) => {
                          const updated = vendors.map(v => 
                            v.id === vendor.id ? { ...v, vendor_name: e.target.value } : v
                          );
                          queryClient.setQueryData(['vendors'], updated);
                        }}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Input
                        value={vendor.website || ''}
                        onChange={(e) => {
                          const updated = vendors.map(v => 
                            v.id === vendor.id ? { ...v, website: e.target.value } : v
                          );
                          queryClient.setQueryData(['vendors'], updated);
                        }}
                        placeholder="Website..."
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Input
                        value={vendor.contact_info || ''}
                        onChange={(e) => {
                          const updated = vendors.map(v => 
                            v.id === vendor.id ? { ...v, contact_info: e.target.value } : v
                          );
                          queryClient.setQueryData(['vendors'], updated);
                        }}
                        placeholder="Contact info..."
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Textarea
                        value={vendor.notes || ''}
                        onChange={(e) => {
                          const updated = vendors.map(v => 
                            v.id === vendor.id ? { ...v, notes: e.target.value } : v
                          );
                          queryClient.setQueryData(['vendors'], updated);
                        }}
                        placeholder="Notes..."
                        className="bg-gray-800 border-gray-700 text-white"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={vendor.color || '#3B82F6'}
                          onChange={(e) => {
                            const updated = vendors.map(v => 
                              v.id === vendor.id ? { ...v, color: e.target.value } : v
                            );
                            queryClient.setQueryData(['vendors'], updated);
                          }}
                          className="w-16 h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
                        />
                        <Select
                          value={vendor.parent_id || "none"}
                          onValueChange={(value) => {
                            const updated = vendors.map(v => 
                              v.id === vendor.id ? { ...v, parent_id: value === "none" ? "" : value } : v
                            );
                            queryClient.setQueryData(['vendors'], updated);
                          }}
                        >
                          <SelectTrigger className="bg-gray-800 border-gray-700 text-white flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Parent (Top Level)</SelectItem>
                            {parentVendors.filter(p => p.id !== vendor.id).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.vendor_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded border border-gray-600" style={{ backgroundColor: vendor.color }} />
                        <span className="font-medium text-white" style={{ color: vendor.color }}>
                          {vendor.vendor_name}
                        </span>
                        {!vendor.active && (
                          <Badge variant="outline" className="text-xs bg-gray-800 text-gray-500">Inactive</Badge>
                        )}
                      </div>
                      {vendor.website && (
                        <p className="text-sm text-blue-400 mt-1 truncate">{vendor.website}</p>
                      )}
                      {vendor.contact_info && (
                        <p className="text-sm text-gray-400 mt-1">{vendor.contact_info}</p>
                      )}
                      {vendor.notes && (
                        <p className="text-sm text-gray-500 mt-1 italic">{vendor.notes}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => updateMutation.mutate({ id: vendor.id, data: vendor })}
                              className="h-8 w-8 text-green-400">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['vendors'] }); }}
                              className="h-8 w-8 text-gray-400">
                        <XIcon className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => handleToggleActive(vendor)}
                              className="h-8 w-8 text-gray-400">
                        <span className="text-xs">{vendor.active ? '✓' : '○'}</span>
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => setEditing(vendor.id)}
                              className="h-8 w-8 text-blue-400">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => {
                                if (confirm('Delete this vendor?')) deleteMutation.mutate(vendor.id);
                              }}
                              className="h-8 w-8 text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {hasChildren && !isCollapsed && (
              <div className="ml-8 mt-2 space-y-2">
                <DragDropContext onDragEnd={(result) => handleDragEnd(result, vendor.id)}>
                  <Droppable droppableId={`children-${vendor.id}`}>
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                        {childrenMap[vendor.id].map((child, childIndex) => renderVendor(child, childIndex, vendor.id))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              </div>
            )}
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base">Vendors & Suppliers</CardTitle>
        <p className="text-sm text-gray-400 mt-1">Manage vendor hierarchy and details</p>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs">Vendor Name *</Label>
              <Input
                value={newVendor.vendor_name}
                onChange={(e) => setNewVendor({ ...newVendor, vendor_name: e.target.value })}
                placeholder="e.g., OEM Parts Supplier"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Parent Vendor/Group</Label>
              <Select
                value={newVendor.parent_id || "none"}
                onValueChange={(value) => setNewVendor({ ...newVendor, parent_id: value === "none" ? "" : value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Top Level)</SelectItem>
                  {parentVendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Website</Label>
              <Input
                type="url"
                value={newVendor.website}
                onChange={(e) => setNewVendor({ ...newVendor, website: e.target.value })}
                placeholder="https://vendor.com"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Contact Info</Label>
              <Input
                value={newVendor.contact_info}
                onChange={(e) => setNewVendor({ ...newVendor, contact_info: e.target.value })}
                placeholder="Phone, email, etc."
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <input
                type="color"
                value={newVendor.color}
                onChange={(e) => setNewVendor({ ...newVendor, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Sort Order</Label>
              <Input
                type="number"
                value={newVendor.sort_order}
                onChange={(e) => setNewVendor({ ...newVendor, sort_order: parseInt(e.target.value) || 0 })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs">Notes</Label>
              <Textarea
                value={newVendor.notes}
                onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
                placeholder="Additional vendor notes..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
          </div>
          <Button type="submit" disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 gap-2">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Add Vendor</>}
          </Button>
        </form>

        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Existing Vendors</Label>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No vendors yet</div>
          ) : (
            <DragDropContext onDragEnd={(result) => handleDragEnd(result, null)}>
              <Droppable droppableId="parents">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {parentVendors.map((vendor, index) => renderVendor(vendor, index, null))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </CardContent>
    </Card>
  );
}