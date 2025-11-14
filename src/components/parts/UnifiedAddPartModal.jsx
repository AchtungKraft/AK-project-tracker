import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

export default function UnifiedAddPartModal({ onClose, projectId = null }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    part_name: "",
    vendor_part_number: "",
    car_make_id: "",
    car_model_id: "",
    car_year_id: "",
    part_category_id: "",
    location_id: "",
    cost: "",
    retail: "",
    quantity_on_hand: 0,
    vendor_id: "",
    status: "On-Hand",
    notes: "",
    photos: [],
    featured_photo: "",
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

  const createPartMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.create(data),
    onSuccess: async (newPart) => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      
      // If projectId is provided, also create a build assignment
      if (projectId) {
        try {
          await base44.entities.PartBuildAssignment.create({
            part_id: newPart.id,
            project_id: projectId,
            needed_status: newPart.status,
            qty_needed: 1,
            qty_reserved: 0,
            notes: ""
          });
          queryClient.invalidateQueries({ queryKey: ['partBuildAssignments'] });
        } catch (error) {
          console.error('Failed to create build assignment:', error);
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

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const partData = {
      ...formData,
      cost: formData.cost ? parseFloat(formData.cost) : undefined,
      retail: formData.retail ? parseFloat(formData.retail) : undefined,
      quantity_on_hand: parseInt(formData.quantity_on_hand) || 0,
    };

    // Remove empty IDs
    if (!partData.car_make_id) delete partData.car_make_id;
    if (!partData.car_model_id) delete partData.car_model_id;
    if (!partData.car_year_id) delete partData.car_year_id;
    if (!partData.part_category_id) delete partData.part_category_id;
    if (!partData.location_id) delete partData.location_id;
    if (!partData.vendor_id) delete partData.vendor_id;

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

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30">
          <DialogHeader>
            <DialogTitle className="text-white">Add New Part</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
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
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400">Car Make</Label>
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
                <Label className="text-gray-400">Car Model</Label>
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
                <Label className="text-gray-400">Year/Series</Label>
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

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400">Category</Label>
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
                <Label className="text-gray-400">Vendor</Label>
                <Select
                  value={formData.vendor_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, vendor_id: value === 'none' ? '' : value })}
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

              <div className="space-y-2">
                <Label className="text-gray-400">Location</Label>
                <Select
                  value={formData.location_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, location_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {parentLocations.map(parent => {
                      const children = activeLocations.filter(l => l.parent_id === parent.id);
                      return (
                        <React.Fragment key={parent.id}>
                          <SelectItem value={parent.id}>
                            <span style={{ color: parent.color }}>{parent.location_area}</span>
                          </SelectItem>
                          {children.map(child => (
                            <SelectItem key={child.id} value={child.id}>
                              <span className="ml-4" style={{ color: child.color }}>→ {child.location_area}</span>
                            </SelectItem>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
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
              
              <div className="space-y-2">
                <Label className="text-gray-400">Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="0.00"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-gray-400">Retail</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.retail}
                  onChange={(e) => setFormData({ ...formData, retail: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="0.00"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-gray-400">Qty on Hand</Label>
                <Input
                  type="number"
                  value={formData.quantity_on_hand}
                  onChange={(e) => setFormData({ ...formData, quantity_on_hand: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
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
                  checked={formData.global_all_builds}
                  onCheckedChange={(checked) => setFormData({ ...formData, global_all_builds: checked })}
                />
                <Label className="text-gray-400 text-sm">Global/All Builds</Label>
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
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                className="w-full border-gray-700"
              >
                Close
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}