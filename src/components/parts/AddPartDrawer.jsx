import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, Upload, Camera, Trash2, Star, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function AddPartDrawer({ onClose }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [formData, setFormData] = useState({
    part_name: "",
    vendor_part_number: "",
    car_make_id: "",
    car_model_id: "",
    car_year_id: "",
    part_category_id: "",
    location_id: "",
    cost: 0,
    retail: 0,
    quantity_on_hand: 0,
    vendor_id: "",
    status: "On-Hand",
    notes: "",
    photos: [],
    featured_photo: "",
    order_url: "",
    global_all_builds: false
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
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

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const list = await base44.entities.Location.list();
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

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      toast.success('Part created successfully');
      onClose();
    },
    onError: () => {
      toast.error('Failed to create part');
    }
  });

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map((file) => {
        console.log('Uploading file:', file.name, file.type, file.size);
        return base44.integrations.Core.UploadFile({ file });
      });
      const results = await Promise.all(uploadPromises);
      console.log('Upload results:', results);
      const photoUrls = results.map((r) => r.file_url);

      const updatedPhotos = [...(formData.photos || []), ...photoUrls];
      const newFeatured = formData.featured_photo || (updatedPhotos.length > 0 ? updatedPhotos[0] : '');
      
      setFormData({
        ...formData,
        photos: updatedPhotos,
        featured_photo: newFeatured
      });
      toast.success(`${files.length} photo(s) uploaded`);
    } catch (error) {
      console.error('Photo upload error:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = useCallback((urlToRemove) => {
    setFormData(prev => {
      const updatedPhotos = prev.photos.filter((url) => url !== urlToRemove);
      const newFeatured = prev.featured_photo === urlToRemove ? '' : prev.featured_photo;
      return { ...prev, photos: updatedPhotos, featured_photo: newFeatured };
    });
  }, []);

  const handleSetFeatured = useCallback((url) => {
    setFormData(prev => ({ ...prev, featured_photo: url }));
  }, []);

  const handlePhotoDragEnd = useCallback((result) => {
    if (!result.destination) return;
    
    setFormData(prev => {
      const photos = Array.from(prev.photos);
      const [removed] = photos.splice(result.source.index, 1);
      photos.splice(result.destination.index, 0, removed);
      return { ...prev, photos };
    });
  }, []);

  const handleScrapeUrl = async () => {
    if (!formData.order_url) {
      toast.error('Please enter a URL first');
      return;
    }
    
    setScraping(true);
    try {
      const response = await base44.functions.invoke('scrapePartUrl', { url: formData.order_url });
      const data = response.data?.data;
      
      if (data) {
        setFormData(prev => ({
          ...prev,
          part_name: data.part_name || prev.part_name,
          vendor_part_number: data.part_number || prev.vendor_part_number,
          notes: data.notes || prev.notes,
          cost: data.price || prev.cost,
        }));
        
        // Handle images if found
        if (data.image_urls && data.image_urls.length > 0) {
          const validImages = data.image_urls.filter(url => url && url.startsWith('http'));
          if (validImages.length > 0) {
            setFormData(prev => ({
              ...prev,
              photos: [...prev.photos, ...validImages],
              featured_photo: prev.featured_photo || validImages[0]
            }));
            toast.success(`Found ${validImages.length} image(s)`);
          }
        }
        
        toast.success('Product info populated from URL');
      } else {
        toast.error('Could not extract product info from URL');
      }
    } catch (error) {
      console.error('Scrape error:', error);
      toast.error('Failed to scrape URL');
    } finally {
      setScraping(false);
    }
  };

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    createMutation.mutate(formData);
  }, [formData, createMutation]);

  const activeCategories = useMemo(() => 
    categories.filter(c => c.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [categories]
  );
  
  const activeVendors = useMemo(() => 
    vendors.filter(v => v.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [vendors]
  );
  
  const activeLocations = useMemo(() => 
    locations.filter(l => l.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [locations]
  );
  
  const availableModels = useMemo(() => 
    models.filter(m => m.car_make_id === formData.car_make_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [models, formData.car_make_id]
  );
  
  const availableYears = useMemo(() => 
    years.filter(y => y.car_model_id === formData.car_model_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [years, formData.car_model_id]
  );

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="border-b border-gray-700 pb-4">
          <SheetTitle className="text-white text-xl">Add New Part</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="py-6 space-y-6">
          {/* Basic Info */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Basic Information</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-gray-400">Part Name *</Label>
                  <Input
                    required
                    value={formData.part_name}
                    onChange={(e) => setFormData({ ...formData, part_name: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-400">Vendor Part #</Label>
                  <Input
                    value={formData.vendor_part_number}
                    onChange={(e) => setFormData({ ...formData, vendor_part_number: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-400">Order URL</Label>
                  <Input
                    type="url"
                    value={formData.order_url}
                    onChange={(e) => setFormData({ ...formData, order_url: e.target.value })}
                    placeholder="https://..."
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator className="bg-gray-700" />

          {/* Vehicle Info */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Vehicle Information</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-400">Car Make</Label>
                <Select
                  value={formData.car_make_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, car_make_id: value === 'none' ? '' : value, car_model_id: '', car_year_id: '' })}
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
                <Label className="text-gray-400">Car Model</Label>
                <Select
                  value={formData.car_model_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, car_model_id: value === 'none' ? '' : value, car_year_id: '' })}
                  disabled={!formData.car_make_id}
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
                <Label className="text-gray-400">Year/Series</Label>
                <Select
                  value={formData.car_year_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, car_year_id: value === 'none' ? '' : value })}
                  disabled={!formData.car_model_id}
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
          </div>

          <Separator className="bg-gray-700" />

          {/* Organization */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Organization</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-400">Category</Label>
                <Select
                  value={formData.part_category_id}
                  onValueChange={(value) => setFormData({ ...formData, part_category_id: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400">Vendor</Label>
                <Select
                  value={formData.vendor_id}
                  onValueChange={(value) => setFormData({ ...formData, vendor_id: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400">Location</Label>
                <Select
                  value={formData.location_id}
                  onValueChange={(value) => setFormData({ ...formData, location_id: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeLocations.map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.bin_description || l.location_area}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator className="bg-gray-700" />

          {/* Pricing & Inventory */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Pricing & Inventory</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label className="text-gray-400">Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Retail</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.retail}
                  onChange={(e) => setFormData({ ...formData, retail: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Qty On Hand</Label>
                <Input
                  type="number"
                  value={formData.quantity_on_hand}
                  onChange={(e) => setFormData({ ...formData, quantity_on_hand: parseInt(e.target.value) || 0 })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
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
          </div>

          <Separator className="bg-gray-700" />

          {/* Notes */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Notes</h3>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="bg-gray-800 border-gray-700 text-white"
              rows={3}
            />
          </div>

          <Separator className="bg-gray-700" />

          {/* Photos */}
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

              {formData.photos.length > 0 ? (
                <DragDropContext onDragEnd={handlePhotoDragEnd}>
                  <Droppable droppableId="photos" direction="horizontal">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="flex gap-3 overflow-x-auto pb-2"
                      >
                        {formData.photos.map((url, index) => (
                          <Draggable key={url} draggableId={url} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`relative flex-shrink-0 w-32 h-32 rounded-lg overflow-hidden border-2 ${
                                  formData.featured_photo === url ? 'border-yellow-500' : 'border-gray-700'
                                } ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                              >
                                <img src={url} alt="" className="w-full h-full object-cover" />
                                
                                <div className="absolute top-1 right-1 flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleSetFeatured(url)}
                                    className={`p-1 rounded ${
                                      formData.featured_photo === url ? 'bg-yellow-500' : 'bg-black/50 hover:bg-yellow-500'
                                    }`}
                                    title="Set as featured"
                                  >
                                    <Star className="w-3 h-3 text-white" fill={formData.featured_photo === url ? 'white' : 'none'} />
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
                                
                                {formData.featured_photo === url && (
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

          {/* Global Flag */}
          <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.global_all_builds}
                onCheckedChange={(checked) => setFormData({ ...formData, global_all_builds: checked })}
              />
              <Label className="text-gray-400">Global/All Builds</Label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-gray-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !formData.part_name.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Part'
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}