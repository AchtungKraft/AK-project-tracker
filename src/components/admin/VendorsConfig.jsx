import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
// Tabs removed — VendorsConfig is PART-only; Service Vendors have their own admin tab
import { Plus, Loader2, Edit2, Trash2, Check, X as XIcon, GripVertical, Package, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { cn } from "@/lib/utils";
import VendorFormFields from "./VendorFormFields";

export default function VendorsConfig() {
  const queryClient = useQueryClient();
  // SERVICE vendors are managed exclusively in the "Service Vendors" tab
  const activeTab = "PART";
  const [newVendor, setNewVendor] = useState({
    vendor_name: "",
    vendor_type: "PART",
    vendor_group_id: "",
    website: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    cell_phone: "",
    address: "",
    notes: "",
    color: "#3B82F6",
    sort_order: 0
  });
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState(null);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['referenceData', 'vendors'],
    queryFn: async () => {
      const list = await base44.entities.Vendor.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: vendorGroups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['referenceData', 'vendorGroups'],
    queryFn: () => base44.entities.VendorGroup.list(),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });



  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Vendor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referenceData', 'vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendorsGrouped'] });
      setNewVendor(prev => ({ ...prev, vendor_name: "", vendor_group_id: "", website: "", contact_name: "", contact_email: "", contact_phone: "", cell_phone: "", address: "", notes: "", color: "#3B82F6", sort_order: 0, vendor_type: "PART" }));
      toast.success('Vendor created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vendor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referenceData', 'vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendorsGrouped'] });
      setEditing(null);
      setEditData(null);
      toast.success('Vendor updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Vendor.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referenceData', 'vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendorsGrouped'] });
      toast.success('Vendor deleted');
    },
  });

  const validateVendor = (data) => {
    if (!data.vendor_name?.trim()) { toast.error('Vendor name is required'); return false; }
    if (!data.vendor_type) { toast.error('Vendor type is required'); return false; }
    if (!data.vendor_group_id) { toast.error('Vendor group is required'); return false; }
    const group = vendorGroups.find(g => g.id === data.vendor_group_id);
    if (group && group.vendor_type !== data.vendor_type) { toast.error('Vendor group type does not match vendor type'); return false; }
    return true;
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!validateVendor(newVendor)) return;
    createMutation.mutate({ ...newVendor, active: true });
  };

  const handleSaveEdit = () => {
    if (!editData || !editing) return;
    if (!validateVendor(editData)) return;
    updateMutation.mutate({ id: editing, data: editData });
  };

  const handleToggleActive = (vendor) => {
    updateMutation.mutate({ id: vendor.id, data: { ...vendor, active: !vendor.active } });
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const itemsToReorder = typeVendors;
    const reordered = Array.from(itemsToReorder);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { sort_order: index }
    }));

    const allVendors = vendors.map(v => {
      const update = updates.find(u => u.id === v.id);
      return update ? { ...v, ...update.data } : v;
    });
    queryClient.setQueryData(['referenceData', 'vendors'], allVendors.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

    try {
      await Promise.all(updates.map(u => base44.entities.Vendor.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['referenceData', 'vendors'] });
      toast.error('Failed to update order');
    }
  };

  // Filter vendors by current active tab type — strict type match only
  // SERVICE vendors are managed in the dedicated "Service Vendors" tab
  const typeVendors = vendors.filter(v => v.vendor_type === activeTab);

  const renderVendor = (vendor, index) => {
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

                <div className="flex-1">
                  {isEditing && editData ? (
                    <div className="space-y-3">
                      <VendorFormFields
                        data={editData}
                        onChange={setEditData}
                        groups={vendorGroups}
                        showType={true}
                        isLoading={groupsLoading}
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-4 h-4 rounded border border-gray-600" style={{ backgroundColor: vendor.color }} />
                        <span className="font-medium text-white" style={{ color: vendor.color }}>
                          {vendor.vendor_name}
                        </span>
                        {vendor.vendor_group_id && (() => {
                          const grp = vendorGroups.find(g => g.id === vendor.vendor_group_id);
                          return grp ? (
                            <Badge variant="outline" className="text-[9px] bg-gray-800/50 text-gray-400 border-gray-600">{grp.name}</Badge>
                          ) : null;
                        })()}
                        {!vendor.vendor_type && (
                          <Badge variant="outline" className="text-[9px] bg-red-900/30 text-red-400 border-red-700">No Type</Badge>
                        )}
                        {!vendor.vendor_group_id && (
                          <Badge variant="outline" className="text-[9px] bg-amber-900/30 text-amber-400 border-amber-700">No Group</Badge>
                        )}
                        {!vendor.active && (
                          <Badge variant="outline" className="text-xs bg-gray-800 text-gray-500">Inactive</Badge>
                        )}
                      </div>
                      {vendor.website && (
                        <p className="text-sm text-blue-400 mt-1 truncate">{vendor.website}</p>
                      )}
                      {vendor.contact_name && (
                        <p className="text-sm text-gray-400 mt-1">{vendor.contact_name}{vendor.contact_email ? ` · ${vendor.contact_email}` : ''}</p>
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
                              onClick={handleSaveEdit}
                              disabled={updateMutation.isPending}
                              className="h-8 w-8 text-green-400">
                        {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => { setEditing(null); setEditData(null); }}
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
                              onClick={() => {
                                setEditing(vendor.id);
                                setEditData({
                                  vendor_name: vendor.vendor_name || "",
                                  vendor_type: vendor.vendor_type || activeTab,
                                  vendor_group_id: vendor.vendor_group_id || "",
                                  website: vendor.website || "",
                                  contact_name: vendor.contact_name || "",
                                  contact_email: vendor.contact_email || "",
                                  contact_phone: vendor.contact_phone || "",
                                  cell_phone: vendor.cell_phone || "",
                                  address: vendor.address || "",
                                  notes: vendor.notes || "",
                                  color: vendor.color || "#3B82F6",
                                  sort_order: vendor.sort_order ?? 0,
                                  active: vendor.active,
                                });
                              }}
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

          </div>
        )}
      </Draggable>
    );
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base">Part Vendors & Suppliers</CardTitle>
        <p className="text-sm text-gray-400 mt-1">Manage part vendors. Service vendors are in the dedicated "Service Vendors" tab.</p>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        {/* Type Tabs */}
        {/* SERVICE vendors are managed in the dedicated "Service Vendors" tab */}
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs border-blue-600/50 text-blue-400 gap-1.5 px-3 py-1.5">
            <Package className="w-3.5 h-3.5" />
            Part Vendors
          </Badge>
          <span className="text-xs text-gray-500">Service vendors → use the "Service Vendors" tab</span>
        </div>

        {/* Create Form */}
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <VendorFormFields
            data={newVendor}
            onChange={setNewVendor}
            groups={vendorGroups}
            showType={false}
            isLoading={groupsLoading}
          />
          <Button type="submit" disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 gap-2">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Add Part Vendor</>}
          </Button>
        </form>

        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Part Vendors</Label>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : typeVendors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No part vendors yet</div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="vendors-list">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {typeVendors.map((vendor, index) => renderVendor(vendor, index))}
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