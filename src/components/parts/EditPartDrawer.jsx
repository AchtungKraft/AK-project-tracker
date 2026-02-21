import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Upload, Trash2, Star, Loader2, Save, Camera, X as XIcon, Package, ShoppingCart, Box, Wrench, Archive, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import CreateInlineModal from "../common/CreateInlineModal";
import PartJournalSection from "./PartJournalSection";
import PartStatusSummary from "./PartStatusSummary";
import AddInventoryModal from "../inventory/AddInventoryModal";
import { InventoryLocationsList } from "../inventory/InventoryLocationEditor";

import AddToBuildModal from "./AddToBuildModal";
import PartTypeSelector, { PartTypeBadge } from "./PartTypeSelector";
import ArchivePartModal from "./ArchivePartModal";
import { getPartTypeBehavior, getPartTypeFieldVisibility, canOrderPart, canReceiveInventory } from "./partTypeBehavior";
import { invalidateSupplyQueries } from "@/components/supply/supplyInvalidation";

/**
 * EditPartDrawer - Part Detail Modal
 * 
 * CANONICAL: All inventory stats from getPartSupplyUsage read model
 * NO local InventoryItem math or aggregation
 * Uses unified invalidation helper for all supply operations
 */

export default function EditPartDrawer({ partId, onClose }) {
  const queryClient = useQueryClient();
  const [editedPart, setEditedPart] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showBuildModal, setShowBuildModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [deletabilityCheck, setDeletabilityCheck] = useState(null);

  const { data: part, isLoading } = useQuery({
    queryKey: ['part', partId],
    queryFn: async () => {
      const parts = await base44.entities.Part.list();
      return parts.find(p => p.id === partId);
    },
    enabled: !!partId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const list = await base44.entities.Location.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const list = await base44.entities.Vendor.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: makes = [] } = useQuery({
    queryKey: ['carMakes'],
    queryFn: async () => {
      const list = await base44.entities.CarMake.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: models = [] } = useQuery({
    queryKey: ['carModels'],
    queryFn: async () => {
      const list = await base44.entities.CarModel.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: years = [] } = useQuery({
    queryKey: ['carYears'],
    queryFn: async () => {
      const list = await base44.entities.CarYear.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  useEffect(() => {
    if (part) {
      setEditedPart({
        ...part,
        photos: part.photos || [],
        featured_photo: part.featured_photo || '',
        order_url: part.order_url || '',
        part_type: part.part_type || 'PURCHASED_VENDOR',
      });
    }
  }, [part]);

  // Check deletability when part loads
  useEffect(() => {
    if (partId) {
      base44.functions.invoke('checkPartDeletability', { part_id: partId })
        .then(res => setDeletabilityCheck(res.data))
        .catch(() => setDeletabilityCheck(null));
    }
  }, [partId]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.update(partId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      queryClient.invalidateQueries({ queryKey: ['part', partId] });
      toast.success('Part updated');
      setEditing(false);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Part.update(partId, {
        is_archived: false,
        archived_at: null,
        archived_by: null,
        archive_reason: null,
        archived_context: null,
      });
      const user = await base44.auth.me();
      await base44.entities.InventoryAuditLog.create({
        part_id: partId,
        action_type: 'unarchive',
        old_value: 'archived',
        new_value: 'active',
        performed_by: user?.id,
        performed_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      queryClient.invalidateQueries({ queryKey: ['part', partId] });
      toast.success('Part restored');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Part.delete(partId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      toast.success('Part deleted');
      onClose();
    },
  });

  const handleDelete = async () => {
    if (!deletabilityCheck?.canDelete) {
      toast.error(deletabilityCheck?.message || 'Cannot delete this part');
      return;
    }
    if (confirm('Are you sure you want to permanently delete this part?')) {
      deleteMutation.mutate();
    }
  };

  // Get field visibility based on part type
  const fieldVisibility = getPartTypeFieldVisibility(editedPart?.part_type || 'PURCHASED_VENDOR');
  const canOrder = part ? canOrderPart(part) : true;
  const canReceive = part ? canReceiveInventory(part) : true;

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map(file => {
        console.log('Uploading file:', file.name, file.type, file.size);
        return base44.integrations.Core.UploadFile({ file });
      });
      const results = await Promise.all(uploadPromises);
      console.log('Upload results:', results);
      const newPhotoUrls = results.map(r => r.file_url);
      
      const updatedPhotos = [...(editedPart.photos || []), ...newPhotoUrls];
      const newFeatured = editedPart.featured_photo || (updatedPhotos.length > 0 ? updatedPhotos[0] : '');
      setEditedPart({ ...editedPart, photos: updatedPhotos, featured_photo: newFeatured });
      
      // Auto-save photos immediately
      await base44.entities.Part.update(partId, { 
        photos: updatedPhotos, 
        featured_photo: newFeatured 
      });
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      queryClient.invalidateQueries({ queryKey: ['part', partId] });
      
      toast.success(`${files.length} photo(s) uploaded`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = useCallback((url) => {
    setEditedPart(prev => {
      const updatedPhotos = prev.photos.filter(p => p !== url);
      const newFeatured = prev.featured_photo === url ? '' : prev.featured_photo;
      return { ...prev, photos: updatedPhotos, featured_photo: newFeatured };
    });
  }, []);

  const handleSetFeatured = useCallback((url) => {
    setEditedPart(prev => ({ ...prev, featured_photo: url }));
  }, []);

  const handlePhotoDragEnd = useCallback((result) => {
    if (!result.destination) return;
    
    setEditedPart(prev => {
      const photos = Array.from(prev.photos);
      const [removed] = photos.splice(result.source.index, 1);
      photos.splice(result.destination.index, 0, removed);
      return { ...prev, photos };
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!editedPart?.part_name?.trim()) {
      toast.error('Part name is required');
      return;
    }
    updateMutation.mutate(editedPart);
  }, [editedPart, updateMutation]);

  const handleInlineCreate = async (entityType, data) => {
    let mutation;
    let queryKey;
    
    switch(entityType) {
      case 'PartCategory':
        mutation = base44.entities.PartCategory.create;
        queryKey = 'partCategories';
        break;
      case 'Vendor':
        mutation = base44.entities.Vendor.create;
        queryKey = 'vendors';
        break;
      case 'Location':
        mutation = base44.entities.Location.create;
        queryKey = 'locations';
        break;
      case 'CarMake':
        mutation = base44.entities.CarMake.create;
        queryKey = 'carMakes';
        break;
      case 'CarModel':
        mutation = base44.entities.CarModel.create;
        queryKey = 'carModels';
        break;
      case 'CarYear':
        mutation = base44.entities.CarYear.create;
        queryKey = 'carYears';
        break;
      default:
        return;
    }
    
    try {
      const newItem = await mutation(data);
      await queryClient.invalidateQueries({ queryKey: [queryKey] });
      
      if (entityType === 'PartCategory') setEditedPart({ ...editedPart, part_category_id: newItem.id });
      else if (entityType === 'Vendor') setEditedPart({ ...editedPart, vendor_id: newItem.id });
      else if (entityType === 'Location') setEditedPart({ ...editedPart, location_id: newItem.id });
      else if (entityType === 'CarMake') setEditedPart({ ...editedPart, car_make_id: newItem.id });
      else if (entityType === 'CarModel') setEditedPart({ ...editedPart, car_model_id: newItem.id });
      else if (entityType === 'CarYear') setEditedPart({ ...editedPart, car_year_id: newItem.id });
      
      toast.success(`${entityType} created`);
      setShowCreateModal(null);
    } catch (error) {
      toast.error(`Failed to create ${entityType}`);
    }
  };

  const availableModels = useMemo(() => 
    models.filter(m => m.car_make_id === editedPart?.car_make_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [models, editedPart?.car_make_id]
  );
  
  const availableYears = useMemo(() => 
    years.filter(y => y.car_model_id === editedPart?.car_model_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [years, editedPart?.car_model_id]
  );

  // CANONICAL: Fetch supply usage from read model - NO local inventory math
  const { data: supplyUsage } = useQuery({
    queryKey: ['partSupplyUsage', partId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getPartSupplyUsage', { part_id: partId });
      return res.data;
    },
    enabled: !!partId,
  });

  // CANONICAL inventory stats from read model only
  const inventoryStats = useMemo(() => {
    if (!supplyUsage?.inventory) {
      // Read model not loaded yet - return zeros, don't compute locally
      console.warn('[EditPartDrawer] Read model not loaded for part', partId);
      return { 
        onHand: 0, 
        reserved: 0, 
        available: 0,
        onOrder: 0,
        toOrder: 0
      };
    }
    
    const stats = {
      onHand: supplyUsage.inventory.physical_stock ?? 0,
      reserved: supplyUsage.inventory.allocated_total ?? 0,
      available: supplyUsage.inventory.available ?? 0,
      onOrder: supplyUsage.demand?.total_on_order ?? 0,
      toOrder: supplyUsage.demand?.total_to_order ?? 0
    };
    
    // CANONICAL VERIFICATION LOG
    console.log('[EditPartDrawer CANONICAL]', {
      part_id: partId,
      physical_stock: stats.onHand,
      reserved_total: stats.reserved,
      available: stats.available,
      to_order: stats.toOrder,
      on_order: stats.onOrder
    });
    
    return stats;
  }, [supplyUsage, partId]);

  if (isLoading || !editedPart) {
    return (
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="border-b border-gray-700 pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-white text-xl">{part?.part_name}</SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-gray-400 hover:text-white"
              >
                <XIcon className="w-5 h-5" />
              </Button>
            </div>
            {part?.vendor_part_number && (
              <p className="text-sm text-gray-400 font-mono">Part #: {part.vendor_part_number}</p>
            )}
          </SheetHeader>

          <div className="py-6 space-y-6">
            {/* Part Type and Archive Status */}
            <div className="flex items-center gap-2 flex-wrap">
              {part?.part_type && <PartTypeBadge partType={part.part_type} />}
              {part?.is_archived && (
                <Badge className="bg-amber-600 text-white">
                  <Archive className="w-3 h-3 mr-1" />
                  Archived
                </Badge>
              )}
            </div>

            {/* Archive Warning */}
            {part?.is_archived && (
              <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-amber-200 font-medium">This part is archived</p>
                  <p className="text-amber-300/70 text-xs mt-1">
                    Cannot be ordered or receive new inventory.
                  </p>
                  <Button
                    onClick={() => unarchiveMutation.mutate()}
                    disabled={unarchiveMutation.isPending}
                    size="sm"
                    variant="outline"
                    className="mt-2 border-amber-600 text-amber-400 hover:bg-amber-900/30"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    {unarchiveMutation.isPending ? 'Restoring...' : 'Restore Part'}
                  </Button>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => setShowInventoryModal(true)}
                variant="outline"
                className="flex-1 border-green-700 text-green-400 hover:bg-green-900/30"
                disabled={part?.is_archived || !canReceive}
              >
                <Package className="w-4 h-4 mr-2" />
                Add Inventory
              </Button>
              <Button
                onClick={() => setShowBuildModal(true)}
                variant="outline"
                className="flex-1 border-orange-700 text-orange-400 hover:bg-orange-900/30"
                disabled={part?.is_archived}
              >
                <Wrench className="w-4 h-4 mr-2" />
                Add to Build
              </Button>
            </div>

            {/* Complete Status Summary */}
            <PartStatusSummary partId={partId} />

            {/* Inventory Locations Detail - Editable */}
            {inventoryStats.onHand > 0 && (
              <InventoryLocationsList partId={partId} />
            )}

            <Separator className="bg-gray-700" />

            {/* Part Details Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Part Details</h3>
                {!editing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(true)}
                    className="border-gray-700 text-white"
                  >
                    Edit Details
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(false);
                        setEditedPart({
                          ...part,
                          photos: part.photos || [],
                          featured_photo: part.featured_photo || '',
                          order_url: part.order_url || ''
                        });
                      }}
                      className="border-gray-700 text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label className="text-gray-400 text-xs">Part Name *</Label>
                      <Input
                        value={editedPart.part_name}
                        onChange={(e) => setEditedPart({ ...editedPart, part_name: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-gray-400 text-xs">Vendor Part #</Label>
                      <Input
                        value={editedPart.vendor_part_number || ''}
                        onChange={(e) => setEditedPart({ ...editedPart, vendor_part_number: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-gray-400 text-xs">Order URL</Label>
                      <Input
                        type="url"
                        value={editedPart.order_url || ''}
                        onChange={(e) => setEditedPart({ ...editedPart, order_url: e.target.value })}
                        placeholder="https://..."
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-gray-400 text-xs flex items-center justify-between">
                        Car Make
                        <button type="button" onClick={() => setShowCreateModal('CarMake')} className="text-xs text-blue-400 hover:text-blue-300">
                          + New
                        </button>
                      </Label>
                      <Select
                        value={editedPart.car_make_id || 'none'}
                        onValueChange={(value) => setEditedPart({ ...editedPart, car_make_id: value === 'none' ? '' : value, car_model_id: '', car_year_id: '' })}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                          <SelectValue placeholder="Select make..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {makes.filter(m => m.active).map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-gray-400 text-xs flex items-center justify-between">
                        Car Model
                        <button type="button" onClick={() => setShowCreateModal('CarModel')} className="text-xs text-blue-400 hover:text-blue-300" disabled={!editedPart.car_make_id}>
                          + New
                        </button>
                      </Label>
                      <Select
                        value={editedPart.car_model_id || 'none'}
                        onValueChange={(value) => setEditedPart({ ...editedPart, car_model_id: value === 'none' ? '' : value, car_year_id: '' })}
                        disabled={!editedPart.car_make_id}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                          <SelectValue placeholder="Select model..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {availableModels.filter(m => m.active).map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-gray-400 text-xs flex items-center justify-between">
                        Year/Series
                        <button type="button" onClick={() => setShowCreateModal('CarYear')} className="text-xs text-blue-400 hover:text-blue-300" disabled={!editedPart.car_model_id}>
                          + New
                        </button>
                      </Label>
                      <Select
                        value={editedPart.car_year_id || 'none'}
                        onValueChange={(value) => setEditedPart({ ...editedPart, car_year_id: value === 'none' ? '' : value })}
                        disabled={!editedPart.car_model_id}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                          <SelectValue placeholder="Select year..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {availableYears.filter(y => y.active).map(y => (
                            <SelectItem key={y.id} value={y.id}>{y.year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-gray-400 text-xs flex items-center justify-between">
                        Category
                        <button type="button" onClick={() => setShowCreateModal('PartCategory')} className="text-xs text-blue-400 hover:text-blue-300">
                          + New
                        </button>
                      </Label>
                      <Select
                        value={editedPart.part_category_id || 'none'}
                        onValueChange={(value) => setEditedPart({ ...editedPart, part_category_id: value === 'none' ? '' : value })}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {categories.filter(c => c.active && !c.parent_id).map(parent => {
                            const children = categories.filter(c => c.parent_id === parent.id && c.active);
                            return [
                              <SelectItem key={parent.id} value={parent.id}>
                                <span style={{ color: parent.color }}>{parent.name}</span>
                              </SelectItem>,
                              ...children.map(child => (
                                <SelectItem key={child.id} value={child.id}>
                                  <span className="ml-4" style={{ color: child.color }}>
                                    → {child.name}
                                  </span>
                                </SelectItem>
                              ))
                            ];
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-gray-400 text-xs flex items-center justify-between">
                        Default Vendor
                        <button type="button" onClick={() => setShowCreateModal('Vendor')} className="text-xs text-blue-400 hover:text-blue-300">
                          + New
                        </button>
                      </Label>
                      <Select
                        value={editedPart.default_vendor_id || 'none'}
                        onValueChange={(value) => setEditedPart({ ...editedPart, default_vendor_id: value === 'none' ? '' : value })}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {vendors.filter(v => v.active && !v.parent_id).map(parent => {
                            const children = vendors.filter(v => v.parent_id === parent.id && v.active);
                            return [
                              <SelectItem key={parent.id} value={parent.id}>
                                <span style={{ color: parent.color }}>{parent.vendor_name}</span>
                              </SelectItem>,
                              ...children.map(child => (
                                <SelectItem key={child.id} value={child.id}>
                                  <span className="ml-4" style={{ color: child.color }}>
                                    → {child.vendor_name}
                                  </span>
                                </SelectItem>
                              ))
                            ];
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* FIX D: Pricing fields restored - Cost is admin-editable, Retail is matrix-driven or override */}
                  <div className="grid grid-cols-2 gap-4 p-3 bg-gray-800/30 rounded-lg border border-gray-700">
                    <div>
                      <Label className="text-gray-400 text-xs">Cost (What we pay)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editedPart.cost || ''}
                        onChange={(e) => setEditedPart({ ...editedPart, cost: parseFloat(e.target.value) || 0 })}
                        className="bg-gray-800 border-gray-700 text-white"
                        placeholder="0.00"
                      />
                      {(!editedPart.cost || editedPart.cost <= 0) && (
                        <p className="text-xs text-amber-400 mt-1">⚠️ Missing cost - will flag for review</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">Retail Override (optional)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editedPart.retail_override || ''}
                        onChange={(e) => setEditedPart({ ...editedPart, retail_override: parseFloat(e.target.value) || null })}
                        className="bg-gray-800 border-gray-700 text-white"
                        placeholder="Auto from matrix"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Matrix: ${(editedPart.retail_matrix_price || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-400 text-xs">Reorder Point</Label>
                      <Input
                        type="number"
                        value={editedPart.reorder_point || 0}
                        onChange={(e) => setEditedPart({ ...editedPart, reorder_point: parseInt(e.target.value) || 0 })}
                        className="bg-gray-800 border-gray-700 text-white"
                        placeholder="Min inventory alert"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-gray-400 text-xs">Reorder Quantity</Label>
                      <Input
                        type="number"
                        value={editedPart.reorder_quantity || 1}
                        onChange={(e) => setEditedPart({ ...editedPart, reorder_quantity: parseInt(e.target.value) || 1 })}
                        className="bg-gray-800 border-gray-700 text-white"
                        placeholder="Qty to order"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-gray-400 text-xs">Notes</Label>
                    <Textarea
                      value={editedPart.notes || ''}
                      onChange={(e) => setEditedPart({ ...editedPart, notes: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                      rows={3}
                    />
                  </div>

                  {/* Part Type Selector */}
                  <PartTypeSelector
                    value={editedPart.part_type}
                    onChange={(type) => {
                      const defaults = getPartTypeBehavior(type);
                      setEditedPart({ ...editedPart, part_type: type, ...defaults });
                    }}
                    showDescription={true}
                    showBehaviorFlags={true}
                  />

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="active"
                      checked={editedPart.is_active !== false}
                      onChange={(e) => setEditedPart({ ...editedPart, is_active: e.target.checked })}
                      className="rounded border-gray-700"
                    />
                    <Label htmlFor="active" className="text-gray-400 text-xs cursor-pointer">
                      Active in catalog
                    </Label>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Vendor Part #</p>
                      <p className="text-white font-mono">{part?.vendor_part_number || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Status</p>
                      <p className="text-white">{part?.status || '-'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Vehicle</p>
                      <p className="text-white">
                        {[
                          makes.find(m => m.id === part?.car_make_id)?.name,
                          models.find(m => m.id === part?.car_model_id)?.name,
                          years.find(y => y.id === part?.car_year_id)?.year
                        ].filter(Boolean).join(' ') || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Category</p>
                      <p className="text-white">
                        {(() => {
                          const category = categories.find(c => c.id === part?.part_category_id);
                          if (!category) return '-';
                          if (category.parent_id) {
                            const parent = categories.find(c => c.id === category.parent_id);
                            return parent ? `${parent.name} > ${category.name}` : category.name;
                          }
                          return category.name;
                        })()}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Default Vendor</p>
                      <p className="text-white">{vendors.find(v => v.id === part?.default_vendor_id)?.vendor_name || '-'}</p>
                    </div>
                  </div>
                  {/* Pricing is managed through Admin Config - not editable here */}
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Cost (Admin)</p>
                      <p className="text-white">${part?.cost || part?.default_cost || '0.00'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Retail (Matrix)</p>
                      <p className="text-white">${part?.retail_matrix_price || part?.retail_override || part?.default_retail || '0.00'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Reorder Point</p>
                      <p className="text-white font-semibold">{part?.reorder_point || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Reorder Qty</p>
                      <p className="text-white font-semibold">{part?.reorder_quantity || 1}</p>
                    </div>
                  </div>
                  {part?.order_url && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Order URL</p>
                      <a href={part.order_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 break-all text-xs">
                        {part.order_url}
                      </a>
                    </div>
                  )}
                  {part?.notes && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Notes</p>
                      <p className="text-white whitespace-pre-wrap">{part.notes}</p>
                    </div>
                  )}
                  {part?.is_active === false && (
                    <div className="flex items-center gap-2 p-2 bg-red-900/20 rounded border border-red-800/30">
                      <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                      <p className="text-xs text-red-400">Inactive - not visible in catalog</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator className="bg-gray-700" />

            {/* Photos Section */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Photos</h3>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <label className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-red-600 hover:bg-red-700 h-10 px-4 py-2 cursor-pointer text-white">
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload Photos
                      </>
                    )}
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                  
                  <label className="md:hidden inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-gray-700 bg-transparent hover:bg-gray-800 h-10 px-4 py-2 cursor-pointer text-white">
                    <Camera className="w-4 h-4" />
                    Take Photo
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>

                {editedPart.photos && editedPart.photos.length > 0 ? (
                  <DragDropContext onDragEnd={handlePhotoDragEnd}>
                    <Droppable droppableId="photos" direction="horizontal">
                      {(provided) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="flex gap-3 overflow-x-auto pb-2"
                        >
                          {editedPart.photos.map((url, index) => (
                            <Draggable key={url} draggableId={url} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`relative flex-shrink-0 w-32 h-32 rounded-lg overflow-hidden border-2 ${
                                    editedPart.featured_photo === url ? 'border-yellow-500' : 'border-gray-700'
                                  } ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                                >
                                  <img src={url} alt="" className="w-full h-full object-cover" />
                                  
                                  <div className="absolute top-1 right-1 flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleSetFeatured(url)}
                                      className={`p-1 rounded ${
                                        editedPart.featured_photo === url ? 'bg-yellow-500' : 'bg-black/50 hover:bg-yellow-500'
                                      }`}
                                      title="Set as featured"
                                    >
                                      <Star className="w-3 h-3 text-white" fill={editedPart.featured_photo === url ? 'white' : 'none'} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePhoto(url)}
                                      className="p-1 bg-black/50 hover:bg-red-600 rounded"
                                      title="Remove photo"
                                    >
                                      <Trash2 className="w-3 h-3 text-white" />
                                    </button>
                                  </div>
                                  
                                  {editedPart.featured_photo === url && (
                                    <div className="absolute bottom-0 left-0 right-0 bg-yellow-500 text-black text-xs text-center py-0.5 font-medium">
                                      Featured
                                    </div>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-gray-700 rounded-lg text-gray-500 text-sm">
                    No photos yet. Upload or take photos to add them.
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-gray-700" />

            {/* Journal Section */}
            <PartJournalSection partId={partId} />
          </div>

          {/* Bottom Actions */}
          <div className="sticky bottom-0 left-0 right-0 p-4 bg-gray-900 border-t border-gray-700 space-y-2">
            {!part?.is_archived && (
              <div className="flex gap-2">
                {deletabilityCheck?.canDelete ? (
                  <Button
                    onClick={handleDelete}
                    variant="outline"
                    className="flex-1 border-red-700 text-red-400 hover:bg-red-900/30"
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                  </Button>
                ) : (
                  <Button
                    onClick={() => setShowArchiveModal(true)}
                    variant="outline"
                    className="flex-1 border-amber-700 text-amber-400 hover:bg-amber-900/30"
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    Archive
                  </Button>
                )}
              </div>
            )}
            <Button
              onClick={onClose}
              variant="outline"
              className="w-full border-gray-700 min-h-[44px]"
            >
              Close
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {showCreateModal && (
        <CreateInlineModal
          entityType={showCreateModal}
          onClose={() => setShowCreateModal(null)}
          onCreate={handleInlineCreate}
          parentData={{
            car_make_id: editedPart.car_make_id,
            car_model_id: editedPart.car_model_id
          }}
        />
      )}

      {showInventoryModal && (
        <AddInventoryModal
          onClose={() => {
            setShowInventoryModal(false);
            // Modal handles its own invalidation via supplyInvalidation helper
          }}
          preselectedPartId={partId}
        />
      )}

      {showBuildModal && part && (
        <AddToBuildModal
          part={part}
          onClose={() => {
            setShowBuildModal(false);
            // Modal handles its own invalidation via supplyInvalidation helper
          }}
        />
      )}

      {showArchiveModal && part && (
        <ArchivePartModal
          isOpen={showArchiveModal}
          onClose={() => setShowArchiveModal(false)}
          part={part}
          onSuccess={() => {
            setShowArchiveModal(false);
            // CANONICAL: Use unified invalidation
            invalidateSupplyQueries(queryClient, {
              part_ids: [partId],
              invalidateAll: true,
            });
          }}
        />
      )}
    </>
  );
}