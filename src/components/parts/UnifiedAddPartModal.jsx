import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload, X, Wand2 } from "lucide-react";
import { toast } from "sonner";
import CreateInlineModal from "../common/CreateInlineModal";
import PartTypeSelector from "./PartTypeSelector";
import { PART_TYPES, getPartTypeBehavior, getPartTypeFieldVisibility, applyPartTypeDefaults } from "./partTypeBehavior";

export default function UnifiedAddPartModal({ onClose, projectId = null }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(null);
  
  const [formData, setFormData] = useState({
    part_name: "",
    vendor_part_number: "",
    order_url: "",
    car_make_id: "",
    car_model_id: "",
    car_year_id: "",
    part_category_id: "",
    default_vendor_id: "",
    default_cost: "",
    default_retail: "",
    reorder_point: 0,
    reorder_quantity: 1,
    is_active: true,
    notes: "",
    photos: [],
    featured_photo: "",
    part_type: PART_TYPES.PURCHASED_VENDOR,
    production_cost: "",
    handling_fee: "",
    resale_value: "",
  });

  // Get field visibility based on part type
  const fieldVisibility = getPartTypeFieldVisibility(formData.part_type);

  // Handle part type change - apply defaults
  const handlePartTypeChange = (newType) => {
    const defaults = getPartTypeBehavior(newType);
    setFormData({
      ...formData,
      part_type: newType,
      ...defaults,
    });
  };

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
      return list.sort((a, b) => (a.vendor_name || '').localeCompare(b.vendor_name || ''));
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

  const createPartMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.create(data),
    onSuccess: async (newPart) => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      
      // If projectId is provided, create a PartProjectRequirement (NOT PartBuildAssignment)
      if (projectId) {
        try {
          await base44.entities.PartProjectRequirement.create({
            part_id: newPart.id,
            project_id: projectId,
            qty_needed: 1,
            qty_allocated: 0,
            qty_ordered: 0,
            qty_installed: 0,
            status: 'Needed',
            priority: 'Normal',
            notes: ""
          });
          queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
        } catch (error) {
          console.error('Failed to create project requirement:', error);
        }
      }
      
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
      const uploadPromises = files.map((file) =>
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
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
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (urlToRemove) => {
    const updatedPhotos = formData.photos.filter((url) => url !== urlToRemove);
    setFormData({
      ...formData,
      photos: updatedPhotos,
      featured_photo: formData.featured_photo === urlToRemove ? (updatedPhotos[0] || '') : formData.featured_photo
    });
  };

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
        // Handle images if found
        const validImages = (data.image_urls || []).filter(url => url && url.startsWith('http'));
        
        setFormData(prev => ({
          ...prev,
          part_name: data.part_name || prev.part_name,
          vendor_part_number: data.part_number || prev.vendor_part_number,
          notes: data.notes || prev.notes,
          default_cost: data.price ? String(data.price) : prev.default_cost,
          photos: validImages.length > 0 ? [...prev.photos, ...validImages] : prev.photos,
          featured_photo: prev.featured_photo || (validImages.length > 0 ? validImages[0] : prev.featured_photo)
        }));
        
        const messages = [];
        if (data.part_name) messages.push('name');
        if (data.price) messages.push(`price ($${data.price})`);
        if (validImages.length > 0) messages.push(`${validImages.length} image(s)`);
        
        if (messages.length > 0) {
          toast.success(`Found: ${messages.join(', ')}`);
        } else {
          toast.warning('URL scraped but limited data found');
        }
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

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Apply part type behavior defaults
    const behaviorDefaults = getPartTypeBehavior(formData.part_type);
    
    const partData = {
      ...formData,
      ...behaviorDefaults,
      default_cost: formData.default_cost ? parseFloat(formData.default_cost) : undefined,
      default_retail: formData.default_retail ? parseFloat(formData.default_retail) : undefined,
      production_cost: formData.production_cost ? parseFloat(formData.production_cost) : undefined,
      handling_fee: formData.handling_fee ? parseFloat(formData.handling_fee) : undefined,
      resale_value: formData.resale_value ? parseFloat(formData.resale_value) : undefined,
      reorder_point: parseInt(formData.reorder_point) || 0,
      reorder_quantity: parseInt(formData.reorder_quantity) || 1,
    };

    // Remove empty IDs
    if (!partData.car_make_id) delete partData.car_make_id;
    if (!partData.car_model_id) delete partData.car_model_id;
    if (!partData.car_year_id) delete partData.car_year_id;
    if (!partData.part_category_id) delete partData.part_category_id;
    if (!partData.default_vendor_id) delete partData.default_vendor_id;

    createPartMutation.mutate(partData);
  };

  const activeCategories = categories.filter(c => c.active);
  const parentCategories = activeCategories.filter(c => !c.parent_id);
  
  const activeVendors = vendors.filter(v => v.active);
  const parentVendors = activeVendors.filter(v => !v.parent_id);
  
  const activeLocations = locations.filter(l => l.active);
  const parentLocations = activeLocations.filter(l => !l.parent_id);
  
  const activeMakes = makes.filter(m => m.active);
  const availableModels = models.filter(m => m.car_make_id === formData.car_make_id && m.active);
  const availableYears = years.filter(y => y.car_model_id === formData.car_model_id && y.active);

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
      
      if (entityType === 'PartCategory') setFormData({ ...formData, part_category_id: newItem.id });
      else if (entityType === 'Vendor') setFormData({ ...formData, default_vendor_id: newItem.id });
      else if (entityType === 'CarMake') setFormData({ ...formData, car_make_id: newItem.id });
      else if (entityType === 'CarModel') setFormData({ ...formData, car_model_id: newItem.id });
      else if (entityType === 'CarYear') setFormData({ ...formData, car_year_id: newItem.id });
      
      toast.success(`${entityType} created`);
      setShowCreateModal(null);
    } catch (error) {
      toast.error(`Failed to create ${entityType}`);
    }
  };

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30">
          <DialogHeader>
            <DialogTitle className="text-white">Add New Part</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Part Type Selector - First */}
            <PartTypeSelector
              value={formData.part_type}
              onChange={handlePartTypeChange}
              showDescription={true}
              showBehaviorFlags={true}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label className="text-gray-400">Part Name *</Label>
                <Input
                  required
                  value={formData.part_name}
                  onChange={(e) => setFormData({ ...formData, part_name: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="e.g., Piston Ring Set"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-400">Vendor Part #</Label>
                <Input
                  value={formData.vendor_part_number}
                  onChange={(e) => setFormData({ ...formData, vendor_part_number: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="e.g., 99610511302"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-400">Order URL</Label>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    value={formData.order_url}
                    onChange={(e) => setFormData({ ...formData, order_url: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white flex-1"
                    placeholder="https://..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleScrapeUrl}
                    disabled={scraping || !formData.order_url}
                    className="border-gray-700 hover:bg-purple-600 hover:border-purple-600"
                    title="Auto-populate from URL"
                  >
                    {scraping ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400 flex items-center justify-between">
                  Car Make
                  <button type="button" onClick={() => setShowCreateModal('CarMake')} className="text-xs text-blue-400 hover:text-blue-300">+ New</button>
                </Label>
                <Select
                  value={formData.car_make_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, car_make_id: value === 'none' ? '' : value, car_model_id: '', car_year_id: '' })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {activeMakes.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400 flex items-center justify-between">
                  Car Model
                  <button type="button" onClick={() => setShowCreateModal('CarModel')} className="text-xs text-blue-400 hover:text-blue-300" disabled={!formData.car_make_id}>+ New</button>
                </Label>
                <Select
                  value={formData.car_model_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, car_model_id: value === 'none' ? '' : value, car_year_id: '' })}
                  disabled={!formData.car_make_id}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {availableModels.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400 flex items-center justify-between">
                  Year/Series
                  <button type="button" onClick={() => setShowCreateModal('CarYear')} className="text-xs text-blue-400 hover:text-blue-300" disabled={!formData.car_model_id}>+ New</button>
                </Label>
                <Select
                  value={formData.car_year_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, car_year_id: value === 'none' ? '' : value })}
                  disabled={!formData.car_model_id}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {availableYears.map(y => (
                      <SelectItem key={y.id} value={y.id}>{y.year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400 flex items-center justify-between">
                  Category
                  <button type="button" onClick={() => setShowCreateModal('PartCategory')} className="text-xs text-blue-400 hover:text-blue-300">+ New</button>
                </Label>
                <Select
                  value={formData.part_category_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, part_category_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {parentCategories.map(parent => {
                      const children = activeCategories.filter(c => c.parent_id === parent.id);
                      return (
                        <React.Fragment key={parent.id}>
                          <SelectItem value={parent.id}>
                            <span style={{ color: parent.color }}>{parent.name}</span>
                          </SelectItem>
                          {children.map(child => (
                            <SelectItem key={child.id} value={child.id}>
                              <span className="ml-4" style={{ color: child.color }}>→ {child.name}</span>
                            </SelectItem>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400 flex items-center justify-between">
                  Default Vendor
                  <button type="button" onClick={() => setShowCreateModal('Vendor')} className="text-xs text-blue-400 hover:text-blue-300">+ New</button>
                </Label>
                <Select
                  value={formData.default_vendor_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, default_vendor_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {parentVendors.map(parent => {
                      const children = activeVendors.filter(v => v.parent_id === parent.id);
                      return (
                        <React.Fragment key={parent.id}>
                          <SelectItem value={parent.id}>
                            <span style={{ color: parent.color }}>{parent.vendor_name}</span>
                          </SelectItem>
                          {children.map(child => (
                            <SelectItem key={child.id} value={child.id}>
                              <span className="ml-4" style={{ color: child.color }}>→ {child.vendor_name}</span>
                            </SelectItem>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dynamic Pricing Fields based on Part Type */}
            <div className="grid grid-cols-2 gap-4">
              {fieldVisibility.showDefaultCost && (
                <div className="space-y-2">
                  <Label className="text-gray-400">Default Cost</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.default_cost}
                    onChange={(e) => setFormData({ ...formData, default_cost: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="0.00"
                  />
                </div>
              )}
              
              {fieldVisibility.showDefaultRetail && (
                <div className="space-y-2">
                  <Label className="text-gray-400">Default Retail</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.default_retail}
                    onChange={(e) => setFormData({ ...formData, default_retail: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="0.00"
                  />
                </div>
              )}

              {fieldVisibility.showProductionCost && (
                <div className="space-y-2">
                  <Label className="text-gray-400">Production Cost</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.production_cost}
                    onChange={(e) => setFormData({ ...formData, production_cost: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="Internal production cost"
                  />
                </div>
              )}

              {fieldVisibility.showHandlingFee && (
                <div className="space-y-2">
                  <Label className="text-gray-400">Handling Fee</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.handling_fee}
                    onChange={(e) => setFormData({ ...formData, handling_fee: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="Service/handling fee"
                  />
                </div>
              )}

              {fieldVisibility.showResaleValue && (
                <div className="space-y-2">
                  <Label className="text-gray-400">Resale Value</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.resale_value}
                    onChange={(e) => setFormData({ ...formData, resale_value: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="Estimated resale value"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400">Reorder Point</Label>
                <Input
                  type="number"
                  value={formData.reorder_point}
                  onChange={(e) => setFormData({ ...formData, reorder_point: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="Min stock alert"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-gray-400">Reorder Quantity</Label>
                <Input
                  type="number"
                  value={formData.reorder_quantity}
                  onChange={(e) => setFormData({ ...formData, reorder_quantity: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="Qty to order"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-400">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
                placeholder="Additional notes..."
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active !== false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label className="text-gray-400 text-sm">Active in Catalog</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-400">Photos</Label>
              <div className="flex flex-wrap gap-2">
                {formData.photos.map((url, idx) => (
                  <div key={idx} className="relative w-24 h-24 bg-gray-800 rounded border border-gray-700">
                    <img src={url} alt="" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(url)}
                      className="absolute -top-2 -right-2 bg-red-600 rounded-full p-1"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                <label className="w-24 h-24 bg-gray-800 rounded border border-gray-700 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-gray-700">
                  {uploading ? (
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-gray-400" />
                      <span className="text-xs text-gray-400 mt-1">Upload</span>
                    </>
                  )}
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
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t border-gray-700">
              <div className="flex justify-end gap-2">
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
                  disabled={createPartMutation.isPending || !formData.part_name.trim()}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {createPartMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Part'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {showCreateModal && (
        <CreateInlineModal
          entityType={showCreateModal}
          onClose={() => setShowCreateModal(null)}
          onCreate={handleInlineCreate}
          parentData={{
            car_make_id: formData.car_make_id,
            car_model_id: formData.car_model_id
          }}
        />
      )}
    </>
  );
}