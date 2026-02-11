import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Wrench, Upload, X } from "lucide-react";

const ORIGIN_TYPES = [
  { value: "client_supplied", label: "Client Supplied" },
  { value: "vehicle_removed", label: "Removed from Vehicle" },
  { value: "fabricated", label: "Fabricated In-House" },
  { value: "refurbished", label: "Refurbished" },
  { value: "purchased_non_catalog", label: "Purchased (Non-Catalog)" }
];

const CONDITION_STATUSES = [
  { value: "unknown", label: "Unknown" },
  { value: "inspection_required", label: "Inspection Required" },
  { value: "repair_required", label: "Repair Required" },
  { value: "ready", label: "Ready for Use" },
  { value: "installed", label: "Installed" },
  { value: "scrapped", label: "Scrapped" }
];

export default function CreateMaterialInstanceModal({ open, onOpenChange, projectId = null }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    instance_name: "",
    part_id: "",
    project_id: projectId || "",
    origin_type: "client_supplied",
    origin_notes: "",
    current_location_id: "",
    condition_status: "unknown",
    media: []
  });
  const [uploading, setUploading] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.MaterialInstance.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialInstances'] });
      toast.success("Material instance created");
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to create: " + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      instance_name: "",
      part_id: "",
      project_id: projectId || "",
      origin_type: "client_supplied",
      origin_notes: "",
      current_location_id: "",
      condition_status: "unknown",
      media: []
    });
  };

  const handleMediaUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setUploading(true);
    const uploadedUrls = [];
    
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      uploadedUrls.push(file_url);
    }
    
    setFormData(prev => ({
      ...prev,
      media: [...prev.media, ...uploadedUrls]
    }));
    setUploading(false);
  };

  const removeMedia = (index) => {
    setFormData(prev => ({
      ...prev,
      media: prev.media.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = () => {
    if (!formData.instance_name) {
      toast.error("Please enter an instance name");
      return;
    }
    if (!formData.origin_type) {
      toast.error("Please select an origin type");
      return;
    }
    
    // Clean up empty optional fields
    const submitData = { ...formData };
    if (!submitData.part_id) delete submitData.part_id;
    if (!submitData.project_id) delete submitData.project_id;
    if (!submitData.current_location_id) delete submitData.current_location_id;
    
    createMutation.mutate(submitData);
  };

  const activeLocations = locations.filter(l => l.active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-red-500" />
            Track Physical Material
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {/* Instance Name */}
          <div>
            <Label className="text-gray-300">Instance Name *</Label>
            <Input
              value={formData.instance_name}
              onChange={(e) => setFormData(prev => ({ ...prev, instance_name: e.target.value }))}
              placeholder="e.g., Client's Original Steering Wheel"
              className="bg-gray-800 border-gray-700"
            />
          </div>

          {/* Origin Type */}
          <div>
            <Label className="text-gray-300">Origin Type *</Label>
            <Select
              value={formData.origin_type}
              onValueChange={(v) => setFormData(prev => ({ ...prev, origin_type: v }))}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORIGIN_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Condition Status */}
          <div>
            <Label className="text-gray-300">Condition Status</Label>
            <Select
              value={formData.condition_status}
              onValueChange={(v) => setFormData(prev => ({ ...prev, condition_status: v }))}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_STATUSES.map(status => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Link to Part (Optional) */}
          <div>
            <Label className="text-gray-300">Link to Catalog Part (Optional)</Label>
            <Select
              value={formData.part_id}
              onValueChange={(v) => setFormData(prev => ({ ...prev, part_id: v }))}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select part..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>No Part Link</SelectItem>
                {parts.filter(p => p.is_active !== false).map(part => (
                  <SelectItem key={part.id} value={part.id}>
                    {part.part_name} {part.vendor_part_number ? `(${part.vendor_part_number})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Link to Project (Optional) */}
          <div>
            <Label className="text-gray-300">Link to Project (Optional)</Label>
            <Select
              value={formData.project_id}
              onValueChange={(v) => setFormData(prev => ({ ...prev, project_id: v }))}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select project..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>No Project Link</SelectItem>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Current Location */}
          <div>
            <Label className="text-gray-300">Current Location</Label>
            <Select
              value={formData.current_location_id}
              onValueChange={(v) => setFormData(prev => ({ ...prev, current_location_id: v }))}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select location..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>No Location</SelectItem>
                {activeLocations.map(loc => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.location_area} {loc.bin_description ? `- ${loc.bin_description}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-yellow-500 mt-1">
              Location assignment is encouraged for tracking purposes
            </p>
          </div>

          {/* Origin Notes */}
          <div>
            <Label className="text-gray-300">Origin Notes</Label>
            <Textarea
              value={formData.origin_notes}
              onChange={(e) => setFormData(prev => ({ ...prev, origin_notes: e.target.value }))}
              placeholder="Notes about where this material came from..."
              className="bg-gray-800 border-gray-700"
            />
          </div>

          {/* Media Upload */}
          <div>
            <Label className="text-gray-300">Photos</Label>
            <div className="mt-2">
              <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-red-500/50 transition-colors">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-400">
                  {uploading ? "Uploading..." : "Click to upload photos"}
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleMediaUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
            {formData.media.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.media.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={url}
                      alt={`Photo ${idx + 1}`}
                      className="w-16 h-16 object-cover rounded border border-gray-700"
                    />
                    <button
                      onClick={() => removeMedia(idx)}
                      className="absolute -top-1 -right-1 bg-red-600 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !formData.instance_name || !formData.origin_type}
          >
            {createMutation.isPending ? "Creating..." : "Create Instance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}