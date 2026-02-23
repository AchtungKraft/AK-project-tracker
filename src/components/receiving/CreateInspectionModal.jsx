import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import { ClipboardCheck, Upload, X } from "lucide-react";

export default function CreateInspectionModal({ open, onOpenChange, materialInstance }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    material_instance_id: materialInstance?.id || "",
    inspected_by: "",
    inspection_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    condition_notes: "",
    repair_required: false,
    repair_description: "",
    inspection_photos: [],
    inspection_status: "open"
  });
  const [uploading, setUploading] = useState(false);

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Create inspection
      const inspection = await base44.entities.MaterialInspection.create(data);
      
      // Update material instance condition if inspection indicates repair needed
      if (data.repair_required && materialInstance) {
        await base44.entities.MaterialInstance.update(materialInstance.id, {
          condition_status: "repair_required"
        });
      }
      
      return inspection;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialInspections'] });
      queryClient.invalidateQueries({ queryKey: ['materialInstances'] });
      toast.success("Inspection recorded");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to create inspection: " + error.message);
    }
  });

  const handlePhotoUpload = async (e) => {
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
      inspection_photos: [...prev.inspection_photos, ...uploadedUrls]
    }));
    setUploading(false);
  };

  const removePhoto = (index) => {
    setFormData(prev => ({
      ...prev,
      inspection_photos: prev.inspection_photos.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = () => {
    if (!formData.inspected_by) {
      toast.error("Please select who performed the inspection");
      return;
    }
    createMutation.mutate({
      ...formData,
      material_instance_id: materialInstance?.id || formData.material_instance_id
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-red-500" />
            Record Inspection
          </DialogTitle>
          <DialogDescription>
            Record the inspection results for this material.
          </DialogDescription>
        </DialogHeader>

        {materialInstance && (
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <p className="text-sm text-gray-400">Inspecting:</p>
            <p className="text-white font-medium">{materialInstance.instance_name}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Inspected By */}
          <div>
            <Label className="text-gray-300">Inspected By *</Label>
            <Select
              value={formData.inspected_by}
              onValueChange={(v) => setFormData(prev => ({ ...prev, inspected_by: v }))}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select team member..." />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.filter(t => t.active).map(member => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Condition Notes */}
          <div>
            <Label className="text-gray-300">Condition Notes</Label>
            <Textarea
              value={formData.condition_notes}
              onChange={(e) => setFormData(prev => ({ ...prev, condition_notes: e.target.value }))}
              placeholder="Describe the condition of the material..."
              className="bg-gray-800 border-gray-700"
              rows={3}
            />
          </div>

          {/* Repair Required Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div>
              <Label className="text-gray-300">Repair Required?</Label>
              <p className="text-xs text-gray-500">Mark if this material needs repair before use</p>
            </div>
            <Switch
              checked={formData.repair_required}
              onCheckedChange={(v) => setFormData(prev => ({ ...prev, repair_required: v }))}
            />
          </div>

          {/* Repair Description (shown if repair required) */}
          {formData.repair_required && (
            <div>
              <Label className="text-gray-300">Repair Description</Label>
              <Textarea
                value={formData.repair_description}
                onChange={(e) => setFormData(prev => ({ ...prev, repair_description: e.target.value }))}
                placeholder="Describe what repairs are needed..."
                className="bg-gray-800 border-gray-700"
                rows={2}
              />
            </div>
          )}

          {/* Photo Upload */}
          <div>
            <Label className="text-gray-300">Inspection Photos</Label>
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
                  onChange={handlePhotoUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
            {formData.inspection_photos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.inspection_photos.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={url}
                      alt={`Inspection photo ${idx + 1}`}
                      className="w-16 h-16 object-cover rounded border border-gray-700"
                    />
                    <button
                      onClick={() => removePhoto(idx)}
                      className="absolute -top-1 -right-1 bg-red-600 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inspection Status */}
          <div>
            <Label className="text-gray-300">Status</Label>
            <Select
              value={formData.inspection_status}
              onValueChange={(v) => setFormData(prev => ({ ...prev, inspection_status: v }))}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !formData.inspected_by}
          >
            {createMutation.isPending ? "Saving..." : "Save Inspection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}