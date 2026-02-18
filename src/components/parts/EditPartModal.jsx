import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Upload, Trash2, Star, Loader2, Save, Camera } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import CreateInlineModal from "../common/CreateInlineModal";
import PartJournalSection from "./PartJournalSection";
import PartPricingFields from "./PartPricingFields";

export default function EditPartModal({ partId, onClose }) {
  const queryClient = useQueryClient();
  const [editedPart, setEditedPart] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(null);

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
        order_url: part.order_url || ''
      });
    }
  }, [part]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.update(partId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      queryClient.invalidateQueries({ queryKey: ['part', partId] });
      toast.success('Part updated');
      onClose();
    },
  });

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map(file => 
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const newPhotoUrls = results.map(r => r.file_url);
      
      const updatedPhotos = [...(editedPart.photos || []), ...newPhotoUrls];
      const newFeatured = editedPart.featured_photo || (updatedPhotos.length > 0 ? updatedPhotos[0] : '');
      setEditedPart({ ...editedPart, photos: updatedPhotos, featured_photo: newFeatured });
      toast.success(`${files.length} photo(s) uploaded`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (url) => {
    const updatedPhotos = editedPart.photos.filter(p => p !== url);
    const newFeatured = editedPart.featured_photo === url ? '' : editedPart.featured_photo;
    setEditedPart({ ...editedPart, photos: updatedPhotos, featured_photo: newFeatured });
  };

  const handleSetFeatured = (url) => {
    setEditedPart({ ...editedPart, featured_photo: url });
  };

  const handlePhotoDragEnd = (result) => {
    if (!result.destination) return;
    
    const photos = Array.from(editedPart.photos);
    const [removed] = photos.splice(result.source.index, 1);
    photos.splice(result.destination.index, 0, removed);
    
    setEditedPart({ ...editedPart, photos });
  };

  const handleSave = () => {
    if (!editedPart.part_name?.trim()) {
      toast.error('Part name is required');
      return;
    }
    updateMutation.mutate(editedPart);
  };

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
      
      // Auto-select the newly created item
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

  const availableModels = models.filter(m => m.car_make_id === editedPart?.car_make_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const availableYears = years.filter(y => y.car_model_id === editedPart?.car_model_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  if (isLoading || !editedPart) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-900 p-8 rounded-lg">
          <Loader2 className="w-8 h-8 animate-spin text-white mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-gray-900 border border-red-900/30 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col my-8">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-red-900/30">
            <h2 className="text-white text-lg font-semibold">Edit Part</h2>
            <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="details" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-3 bg-gray-900/50 border-b border-red-900/30">
              <TabsTrigger value="details">Part Details</TabsTrigger>
              <TabsTrigger value="photos">Photos</TabsTrigger>
              <TabsTrigger value="journal">Journal</TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Basic Info */}
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

              {/* Car Make/Model/Year */}
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

              {/* Category, Vendor, Location */}
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
                        return (
                          <React.Fragment key={parent.id}>
                            <SelectItem value={parent.id}>
                              <span style={{ color: parent.color }}>{parent.name}</span>
                            </SelectItem>
                            {children.map(child => (
                              <SelectItem key={child.id} value={child.id}>
                                <span className="ml-4" style={{ color: child.color }}>
                                  → {child.name}
                                </span>
                              </SelectItem>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-400 text-xs flex items-center justify-between">
                    Vendor
                    <button type="button" onClick={() => setShowCreateModal('Vendor')} className="text-xs text-blue-400 hover:text-blue-300">
                      + New
                    </button>
                  </Label>
                  <Select
                    value={editedPart.vendor_id || 'none'}
                    onValueChange={(value) => setEditedPart({ ...editedPart, vendor_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {vendors.filter(v => v.active && !v.parent_id).map(parent => {
                        const children = vendors.filter(v => v.parent_id === parent.id && v.active);
                        return (
                          <React.Fragment key={parent.id}>
                            <SelectItem value={parent.id}>
                              <span style={{ color: parent.color }}>{parent.vendor_name}</span>
                            </SelectItem>
                            {children.map(child => (
                              <SelectItem key={child.id} value={child.id}>
                                <span className="ml-4" style={{ color: child.color }}>
                                  → {child.vendor_name}
                                </span>
                              </SelectItem>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-400 text-xs flex items-center justify-between">
                    Location
                    <button type="button" onClick={() => setShowCreateModal('Location')} className="text-xs text-blue-400 hover:text-blue-300">
                      + New
                    </button>
                  </Label>
                  <Select
                    value={editedPart.location_id || 'none'}
                    onValueChange={(value) => setEditedPart({ ...editedPart, location_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {locations.filter(l => l.active && !l.parent_id).map(parent => {
                        const children = locations.filter(l => l.parent_id === parent.id && l.active);
                        return (
                          <React.Fragment key={parent.id}>
                            <SelectItem value={parent.id}>
                              <span style={{ color: parent.color }}>{parent.location_area}</span>
                            </SelectItem>
                            {children.map(child => (
                              <SelectItem key={child.id} value={child.id}>
                                <span className="ml-4" style={{ color: child.color }}>
                                  → {child.location_area}
                                </span>
                              </SelectItem>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Pricing Section */}
              <PartPricingFields
                defaultCost={editedPart.default_cost}
                defaultRetail={editedPart.default_retail}
                pricingMode={editedPart.pricing_mode || 'matrix'}
                appliedMarkupPct={editedPart.applied_markup_pct}
                onCostChange={(cost) => setEditedPart({ ...editedPart, default_cost: cost })}
                onRetailChange={(retail) => setEditedPart({ ...editedPart, default_retail: retail })}
                onModeChange={(mode) => setEditedPart({ ...editedPart, pricing_mode: mode })}
              />

              {/* Inventory */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-400 text-xs">Qty on Hand</Label>
                  <Input
                    type="number"
                    value={editedPart.quantity_on_hand || 0}
                    onChange={(e) => setEditedPart({ ...editedPart, quantity_on_hand: parseInt(e.target.value) || 0 })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>

                <div>
                  <Label className="text-gray-400 text-xs">Status</Label>
                  <Select
                    value={editedPart.status}
                    onValueChange={(value) => setEditedPart({ ...editedPart, status: value })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="On-Hand">On-Hand</SelectItem>
                      <SelectItem value="Need to Buy">Need to Buy</SelectItem>
                      <SelectItem value="On-Order">On-Order</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label className="text-gray-400 text-xs">Notes</Label>
                <Textarea
                  value={editedPart.notes || ''}
                  onChange={(e) => setEditedPart({ ...editedPart, notes: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  rows={3}
                />
              </div>

              {/* Global Flag */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="global"
                  checked={editedPart.global_all_builds || false}
                  onChange={(e) => setEditedPart({ ...editedPart, global_all_builds: e.target.checked })}
                  className="rounded border-gray-700"
                />
                <Label htmlFor="global" className="text-gray-400 text-xs cursor-pointer">
                  Make available for all builds (global)
                </Label>
              </div>
            </TabsContent>

            {/* Photos Tab */}
            <TabsContent value="photos" className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <Button type="button" disabled={uploading} className="bg-red-600 hover:bg-red-700 gap-2">
                    {uploading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>
                    ) : (
                      <><Upload className="w-4 h-4" />Upload Photos</>
                    )}
                  </Button>
                </label>
                
                <label className="cursor-pointer md:hidden">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <Button type="button" disabled={uploading} variant="outline" className="border-gray-700 gap-2">
                    <Camera className="w-4 h-4" />Take Photo
                  </Button>
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
            </TabsContent>

            {/* Journal Tab */}
            <TabsContent value="journal" className="flex-1 overflow-y-auto p-4">
              <PartJournalSection partId={partId} />
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="flex gap-3 p-4 border-t border-red-900/30">
            <Button variant="outline" onClick={onClose} className="flex-1 border-gray-700 text-white" disabled={updateMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending} className="flex-1 bg-red-600 hover:bg-red-700 gap-2">
              {updateMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
              ) : (
                <><Save className="w-4 h-4" />Save Changes</>
              )}
            </Button>
          </div>
        </div>
      </div>

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
    </>
  );
}