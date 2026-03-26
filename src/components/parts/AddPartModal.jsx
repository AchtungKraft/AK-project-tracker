import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import PartPricingFields from "./PartPricingFields";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

const buildPartPayload = (formData) => ({
  part_name: formData.part_name,
  vendor_part_number: formData.vendor_part_number || null,
  part_category_id: formData.part_category_id || null,
  default_vendor_id: formData.vendor_id || null,
  notes: formData.notes || null,
  pricing_mode: formData.pricing_mode,
  cost: Number(formData.default_cost) || 0,
  photos: formData.photos || [],
  featured_photo: formData.photos?.[0] || null,
  ...(formData.pricing_mode === 'manual' ? { retail_override: Number(formData.default_retail) || 0 } : {}),
});

export default function AddPartModal({ onClose }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    part_name: "",
    vendor_part_number: "",
    car_year: "",
    car_model: "",
    part_category_id: "",
    location_id: "",
    default_cost: 0,
    default_retail: 0,
    pricing_mode: "matrix",
    quantity_on_hand: 0,
    vendor_id: "",
    status: "On-Hand",
    notes: "",
    photos: [],
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

  const createMutation = useMutation({
    mutationFn: (data) => {
      const payload = buildPartPayload(data);
      console.log("CREATE PART PAYLOAD", payload);
      return base44.entities.Part.create(payload);
    },
    onSuccess: async (newPart) => {
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        partIds: newPart?.id ? [newPart.id] : [],
      });
      toast.success('Part created successfully');
      onClose();
    },
    onError: (error) => {
      console.error("CREATE PART ERROR", error);
      toast.error(error?.message || 'Failed to create part');
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
      console.error('Photo upload error:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (urlToRemove) => {
    setFormData({
      ...formData,
      photos: formData.photos.filter((url) => url !== urlToRemove)
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const activeCategories = categories.filter(c => c.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const activeVendors = vendors.filter(v => v.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const activeLocations = locations.filter(l => l.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30">
        <DialogHeader>
          <DialogTitle className="text-white">Add New Part</DialogTitle>
          <DialogDescription>
            Add a new part to the parts catalog.
          </DialogDescription>
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
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400">Vendor Part #</Label>
              <Input
                value={formData.vendor_part_number}
                onChange={(e) => setFormData({ ...formData, vendor_part_number: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-400">Car Year</Label>
              <Input
                value={formData.car_year}
                onChange={(e) => setFormData({ ...formData, car_year: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400">Car Model</Label>
              <Input
                value={formData.car_model}
                onChange={(e) => setFormData({ ...formData, car_model: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
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
            <div className="space-y-2">
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
            <div className="space-y-2">
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

          {/* Pricing Section */}
          <PartPricingFields
            defaultCost={formData.default_cost}
            defaultRetail={formData.default_retail}
            pricingMode={formData.pricing_mode}
            appliedMarkupPct={null}
            onCostChange={(cost) => setFormData({ ...formData, default_cost: cost })}
            onRetailChange={(retail) => setFormData({ ...formData, default_retail: retail })}
            onModeChange={(mode) => setFormData({ ...formData, pricing_mode: mode })}
          />

          <div className="space-y-2">
            <Label className="text-gray-400">Qty On Hand</Label>
            <Input
              type="number"
              value={formData.quantity_on_hand}
              onChange={(e) => setFormData({ ...formData, quantity_on_hand: parseInt(e.target.value) || 0 })}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>

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
            <Label className="text-gray-400">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="bg-gray-800 border-gray-700 text-white"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.global_all_builds}
                onCheckedChange={(checked) => setFormData({ ...formData, global_all_builds: checked })}
              />
              <Label className="text-gray-400">Global/All Builds</Label>
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
      </DialogContent>
    </Dialog>
  );
}