import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CalendarIcon, Upload, X as XIcon, Star } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import { getMobileInputClass, getMobileSelectClass } from "@/components/mobile/MobileFormStyles";

export default function EditProjectModal({ project, onClose }) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [projectData, setProjectData] = useState({
    name: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    vin: "",
    project_type_id: "",
    status_id: "",
    start_date: "",
    target_completion: "",
    assigned_team: [],
    images: [],
    featured_image_url: "",
    is_shareable: false,
    progress_percent: 0,
  });

  useEffect(() => {
    if (project) {
      setProjectData({
        name: project.name || "",
        client_name: project.client_name || "",
        client_email: project.client_email || "",
        client_phone: project.client_phone || "",
        vin: project.vin || "",
        project_type_id: project.project_type_id || "",
        status_id: project.status_id || "",
        start_date: project.start_date || "",
        target_completion: project.target_completion || "",
        assigned_team: project.assigned_team || [],
        images: project.images || [],
        featured_image_url: project.featured_image_url || "",
        is_shareable: project.is_shareable || false,
        progress_percent: project.progress_percent || 0,
      });
    }
  }, [project]);

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const activeTypes = projectTypes.filter(t => t.active);
  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active);
  const activeMembers = teamMembers.filter(tm => tm.active);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Project.update(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      toast.success('Project updated successfully');
      onClose();
    },
    onError: () => {
      toast.error('Failed to update project');
    },
  });

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map((file) =>
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const imageUrls = results.map((r) => r.file_url);

      setProjectData(prev => ({
        ...prev,
        images: [...prev.images, ...imageUrls]
      }));
      toast.success('Images uploaded');
    } catch (error) {
      toast.error('Failed to upload images');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = (urlToRemove) => {
    setProjectData(prev => {
      const newImages = prev.images.filter(url => url !== urlToRemove);
      return {
        ...prev,
        images: newImages,
        // Clear featured image if it's the one being removed
        featured_image_url: prev.featured_image_url === urlToRemove ? "" : prev.featured_image_url
      };
    });
  };

  const handleSetFeaturedImage = (url) => {
    setProjectData(prev => ({
      ...prev,
      featured_image_url: url
    }));
    toast.success('Featured image set');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(projectData);
  };

  const handleTeamToggle = (memberId) => {
    setProjectData(prev => ({
      ...prev,
      assigned_team: prev.assigned_team.includes(memberId)
        ? prev.assigned_team.filter(id => id !== memberId)
        : [...prev.assigned_team, memberId]
    }));
  };

  const formContent = (
    <form onSubmit={handleSubmit} className={isMobile ? "space-y-4" : "space-y-6"}>
      {!isMobile && (
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Edit Project</DialogTitle>
        </DialogHeader>
      )}
      {/* Basic Info */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isMobile ? 'gap-3' : 'gap-4'}`}>
        <div>
          <Label>Project Name *</Label>
          <Input
            value={projectData.name}
            onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
            placeholder="Project name"
            className={getMobileInputClass(isMobile, "bg-gray-800 border-gray-700 text-white")}
            required
          />
        </div>

        <div>
          <Label>VIN / Chassis Number</Label>
          <Input
            value={projectData.vin}
            onChange={(e) => setProjectData({ ...projectData, vin: e.target.value })}
            placeholder="VIN or chassis number"
            className={getMobileInputClass(isMobile, "bg-gray-800 border-gray-700 text-white")}
          />
        </div>

        <div>
          <Label>Client Name</Label>
          <Input
            value={projectData.client_name}
            onChange={(e) => setProjectData({ ...projectData, client_name: e.target.value })}
            placeholder="Client name"
            className={getMobileInputClass(isMobile, "bg-gray-800 border-gray-700 text-white")}
          />
        </div>

        <div>
          <Label>Client Email</Label>
          <Input
            type="email"
            value={projectData.client_email}
            onChange={(e) => setProjectData({ ...projectData, client_email: e.target.value })}
            placeholder="client@example.com"
            className={getMobileInputClass(isMobile, "bg-gray-800 border-gray-700 text-white")}
          />
        </div>

        <div>
          <Label>Client Phone</Label>
          <Input
            value={projectData.client_phone}
            onChange={(e) => setProjectData({ ...projectData, client_phone: e.target.value })}
            placeholder="Phone number"
            className={getMobileInputClass(isMobile, "bg-gray-800 border-gray-700 text-white")}
          />
        </div>

        <div>
          <Label>Project Type</Label>
          <Select
            value={projectData.project_type_id}
            onValueChange={(value) => setProjectData({ ...projectData, project_type_id: value })}
          >
            <SelectTrigger className={getMobileSelectClass(isMobile, "bg-gray-800 border-gray-700 text-white")}>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {activeTypes.map(type => (
                <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Status</Label>
          <Select
            value={projectData.status_id}
            onValueChange={(value) => setProjectData({ ...projectData, status_id: value })}
          >
            <SelectTrigger className={getMobileSelectClass(isMobile, "bg-gray-800 border-gray-700 text-white")}>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {projectStatuses.map(status => (
                <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

            <div>
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-700 text-white"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {projectData.start_date ? format(new Date(projectData.start_date), 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={projectData.start_date ? new Date(projectData.start_date) : undefined}
                    onSelect={(date) => setProjectData({ ...projectData, start_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>Target Completion</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-700 text-white"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {projectData.target_completion ? format(new Date(projectData.target_completion), 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={projectData.target_completion ? new Date(projectData.target_completion) : undefined}
                    onSelect={(date) => setProjectData({ ...projectData, target_completion: date ? format(date, 'yyyy-MM-dd') : '' })}
                  />
                </PopoverContent>
              </Popover>
            </div>

        <div>
          <Label>Progress %</Label>
          <Input
            type="number"
            min="0"
            max="100"
            value={projectData.progress_percent}
            onChange={(e) => setProjectData({ ...projectData, progress_percent: parseInt(e.target.value) || 0 })}
            placeholder="0-100"
            className={getMobileInputClass(isMobile, "bg-gray-800 border-gray-700 text-white")}
          />
        </div>
      </div>

          {/* Shareable Toggle */}
          <div className="flex items-center space-x-3 py-2">
            <Checkbox
              id="is_shareable"
              checked={projectData.is_shareable}
              onCheckedChange={(checked) => setProjectData({ ...projectData, is_shareable: checked })}
            />
            <label
              htmlFor="is_shareable"
              className="text-sm text-white cursor-pointer"
            >
              Allow public sharing (Client Portal Link)
            </label>
          </div>

          {/* Project Images */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <Label>Project Images</Label>
              <div>
                <input
                  type="file"
                  id="image-upload-edit"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <label htmlFor="image-upload-edit">
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer border-gray-700"
                    disabled={uploading}
                    onClick={() => document.getElementById('image-upload-edit').click()}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Add Images
                      </>
                    )}
                  </Button>
                </label>
              </div>
            </div>

            {projectData.images.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {projectData.images.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <div className={`w-full h-32 bg-gray-800 rounded-lg border ${projectData.featured_image_url === url ? 'border-yellow-500 border-2' : 'border-gray-700'} flex items-center justify-center overflow-hidden`}>
                      <img
                        src={url}
                        alt={`Project ${idx + 1}`}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    
                    <div className="absolute top-2 left-2 right-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleSetFeaturedImage(url)}
                        className={`${projectData.featured_image_url === url ? 'bg-yellow-500' : 'bg-gray-700'} text-white rounded-full p-1.5 z-10`}
                        title="Set as featured image"
                      >
                        <Star className="w-3 h-3" fill={projectData.featured_image_url === url ? "white" : "none"} />
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(url)}
                        className="bg-red-600 text-white rounded-full p-1.5 z-10"
                        title="Remove image"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>

                    {projectData.featured_image_url === url && (
                      <div className="absolute bottom-2 left-2 right-2 text-center">
                        <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded">Featured</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-800/50 rounded-lg border border-gray-700">
                <p className="text-gray-500">No images yet</p>
              </div>
            )}
          </div>

          {/* Team Assignment */}
          <div>
            <Label className="mb-3 block">Assigned Team Members</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto bg-gray-800/50 p-4 rounded-lg border border-gray-700">
              {activeMembers.map(member => (
                <div key={member.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`team-${member.id}`}
                    checked={projectData.assigned_team.includes(member.id)}
                    onCheckedChange={() => handleTeamToggle(member.id)}
                  />
                  <label
                    htmlFor={`team-${member.id}`}
                    className="text-sm text-white cursor-pointer flex-1"
                  >
                    {member.full_name}
                    {member.team_role && (
                      <span className="text-gray-400 ml-2">({member.team_role})</span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>

      {/* Action Buttons - Desktop only, mobile uses sticky footer */}
      {!isMobile && (
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            className="bg-red-600 hover:bg-red-700"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      )}
    </form>
  );

  // Mobile sticky footer
  const mobileFooter = (
    <Button 
      type="submit"
      form="edit-project-form"
      onClick={handleSubmit}
      className="w-full h-11 bg-red-600 hover:bg-red-700"
      disabled={updateMutation.isPending}
    >
      {updateMutation.isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Saving...
        </>
      ) : (
        'Save Changes'
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="p-0 max-w-full h-[100dvh] max-h-[100dvh] bg-gray-900 border-red-900/30 text-white">
          <MobileModalWrapper
            title="Edit Project"
            onClose={onClose}
            footer={mobileFooter}
          >
            {formContent}
          </MobileModalWrapper>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30 text-white">
        {formContent}
      </DialogContent>
    </Dialog>
  );
}