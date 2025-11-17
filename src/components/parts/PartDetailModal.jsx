import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Edit2, Trash2, X, Upload } from "lucide-react";
import { toast } from "sonner";

export default function PartDetailModal({ part, onClose }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({ ...part });

  // Update formData when part changes
  React.useEffect(() => {
    setFormData({ ...part });
    setEditing(false);
  }, [part]);

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.update(part.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      toast.success('Part updated');
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Part.delete(part.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      toast.success('Part deleted');
      onClose();
    },
  });

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map((file) =>
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const photoUrls = results.map((r) => r.file_url);

      setFormData({
        ...formData,
        photos: [...(formData.photos || []), ...photoUrls]
      });
    } catch (error) {
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (urlToRemove) => {
    setFormData({
      ...formData,
      photos: (formData.photos || []).filter((url) => url !== urlToRemove)
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const activeCategories = categories.filter(c => c.active);
  const activeVendors = vendors.filter(v => v.active);
  const activeLocations = locations.filter(l => l.active);

  const category = categories.find(c => c.id === part.part_category_id);
  const vendor = vendors.find(v => v.id === part.vendor_id);
  const location = locations.find(l => l.id === part.location_id);

  const statusColors = {
    'On-Hand': '#10B981',
    'Need to Buy': '#EF4444',
    'On-Order': '#F59E0B'
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-white">{part.part_name}</DialogTitle>
            <div className="flex gap-2">
              {!editing && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditing(true)}
                    className="text-gray-400 hover:text-white"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm('Delete this part?')) {
                        deleteMutation.mutate();
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
        </DialogHeader>

        {editing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400">Part Name</Label>
                <Input
                  value={formData.part_name}
                  onChange={(e) => setFormData({ ...formData, part_name: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-400">Vendor Part #</Label>
                <Input
                  value={formData.vendor_part_number || ''}
                  onChange={(e) => setFormData({ ...formData, vendor_part_number: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400">Car Year</Label>
                <Input
                  value={formData.car_year || ''}
                  onChange={(e) => setFormData({ ...formData, car_year: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-400">Car Model</Label>
                <Input
                  value={formData.car_model || ''}
                  onChange={(e) => setFormData({ ...formData, car_model: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400">Category</Label>
                <Select
                  value={formData.part_category_id || ''}
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
                  value={formData.vendor_id || ''}
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
                  value={formData.location_id || ''}
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

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400">Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.cost || 0}
                  onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-400">Retail</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.retail || 0}
                  onChange={(e) => setFormData({ ...formData, retail: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-400">Qty On Hand</Label>
                <Input
                  type="number"
                  value={formData.quantity_on_hand || 0}
                  onChange={(e) => setFormData({ ...formData, quantity_on_hand: parseInt(e.target.value) || 0 })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
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
                value={formData.notes || ''}
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
                {(formData.photos || []).map((url, idx) => (
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

            <div className="flex justify-between gap-3 pt-4 border-t border-gray-700">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="border-gray-700"
              >
                Close
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(false)}
                  className="border-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {part.photos && part.photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {part.photos.map((url, idx) => (
                  <div key={idx} className="w-full h-24 bg-gray-800 rounded border border-gray-700 flex items-center justify-center overflow-hidden">
                    <img src={url} alt="" className="max-w-full max-h-full object-contain" />
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">Status</p>
                <Badge 
                  style={{ backgroundColor: statusColors[part.status] }}
                  className="text-white"
                >
                  {part.status}
                </Badge>
              </div>
              {part.vendor_part_number && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Vendor Part #</p>
                  <p className="text-white font-mono">{part.vendor_part_number}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {part.car_year && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Year/Model</p>
                  <p className="text-white">{part.car_year} {part.car_model}</p>
                </div>
              )}
              {category && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Category</p>
                  <p className="text-white">{category.name}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">Cost</p>
                <p className="text-white">${part.cost || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Retail</p>
                <p className="text-white">${part.retail || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Qty On Hand</p>
                <p className="text-white font-semibold">{part.quantity_on_hand || 0}</p>
              </div>
            </div>

            {vendor && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Vendor</p>
                <p className="text-white">{vendor.vendor_name}</p>
              </div>
            )}

            {location && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Location</p>
                <p className="text-white">{location.bin_description || location.location_area}</p>
              </div>
            )}

            {part.notes && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Notes</p>
                <p className="text-white whitespace-pre-wrap">{part.notes}</p>
              </div>
            )}

            {part.global_all_builds && (
              <Badge variant="outline" className="border-green-500 text-green-400">
                Global/All Builds
              </Badge>
            )}

            <div className="pt-4 border-t border-gray-700">
              <Button
                onClick={onClose}
                variant="outline"
                className="w-full border-gray-700 min-h-[44px]"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}