import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, X, Edit2, Check, Calendar, FileText, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ImageModal from "../ui/ImageModal";
import ProjectKanban from "./ProjectKanban";

export default function ProjectOverview({ project, projectId }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [formData, setFormData] = useState({
    name: project?.name || "",
    client_name: project?.client_name || "",
    client_email: project?.client_email || "",
    client_phone: project?.client_phone || "",
    vin: project?.vin || "",
    start_date: project?.start_date || "",
    target_completion: project?.target_completion || "",
    project_type_id: project?.project_type_id || "",
    status_id: project?.status_id || ""
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list()
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list()
  });

  const { data: journalEntries = [] } = useQuery({
    queryKey: ['journalEntries', projectId],
    queryFn: () => base44.entities.JournalEntry.filter({ project_id: projectId })
  });

  const projectStatuses = statuses.filter((s) => s.scope === 'Project' && s.active);
  const currentStatus = statuses.find((s) => s.id === project?.status_id);
  const projectType = projectTypes.find((t) => t.id === project?.project_type_id);

  const recentEntries = journalEntries
    .sort((a, b) => new Date(b.entry_date || b.created_date) - new Date(a.entry_date || a.created_date))
    .slice(0, 3);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Project.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditing(false);
      toast.success('Project updated successfully');
    }
  });

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadingImages(true);
    try {
      const uploadPromises = files.map((file) =>
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const imageUrls = results.map((r) => r.file_url);

      await updateMutation.mutateAsync({
        images: [...(project.images || []), ...imageUrls]
      });
    } catch (error) {
      toast.error('Failed to upload images');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleRemoveImage = (urlToRemove) => {
    updateMutation.mutate({
      images: (project.images || []).filter((url) => url !== urlToRemove)
    });
  };

  const handleAttachmentUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingAttachment(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const newAttachment = {
        name: file.name,
        url: file_url,
        uploaded_date: new Date().toISOString()
      };

      await updateMutation.mutateAsync({
        attachments: [...(project.attachments || []), newAttachment]
      });
    } catch (error) {
      toast.error('Failed to upload attachment');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = (attachment) => {
    updateMutation.mutate({
      attachments: (project.attachments || []).filter((a) => a.url !== attachment.url)
    });
  };

  const handleSaveChanges = () => {
    updateMutation.mutate(formData);
  };

  const handleViewAllJournal = () => {
    const newUrl = `${window.location.pathname}?id=${projectId}&tab=journal`;
    window.history.pushState({}, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <>
      <div className="space-y-4">
        {/* Project Info Header - Compact */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 p-4">
            <div className="flex justify-between items-center">
              <CardTitle className="text-white text-base">Project Information</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => editing ? handleSaveChanges() : setEditing(true)}
                disabled={updateMutation.isPending}
                className="bg-red-600 hover:bg-red-700 border-gray-700 gap-2"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : editing ? (
                  <>
                    <Check className="w-4 h-4" />
                    Save
                  </>
                ) : (
                  <>
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {editing ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-gray-400 text-xs">Project Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Client Name</Label>
                  <Input
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">VIN / Chassis</Label>
                  <Input
                    value={formData.vin}
                    onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Client</p>
                  <p className="text-white text-sm">{project?.client_name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">VIN / Chassis</p>
                  <p className="text-white font-mono text-sm">{project?.vin || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Type</p>
                  <p className="text-white text-sm">{projectType?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Status</p>
                  {currentStatus && (
                    <Badge style={{ backgroundColor: currentStatus.color }} className="text-white text-xs">
                      {currentStatus.label}
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Start Date</p>
                  <p className="text-white text-sm">
                    {project?.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Target Completion</p>
                  <p className="text-white text-sm">
                    {project?.target_completion ? format(new Date(project.target_completion), 'MMM d, yyyy') : '-'}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs text-gray-400 mb-1">Progress</p>
                  <div className="flex items-center gap-2">
                    <Progress value={project?.progress_percent || 0} className="h-2 flex-1 bg-gray-800" />
                    <span className="text-xs text-gray-400">{project?.progress_percent || 0}%</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Kanban Board */}
        <ProjectKanban projectId={projectId} />

        {/* Bottom Section: Journal & Attachments Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Journal Entries */}
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardHeader className="border-b border-red-900/30 p-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Recent Journal Entries
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleViewAllJournal}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  View All →
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {recentEntries.length === 0 ? (
                <p className="text-center text-gray-500 py-4 text-sm">No journal entries yet</p>
              ) : (
                <div className="space-y-2">
                  {recentEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors cursor-pointer"
                      onClick={handleViewAllJournal}
                    >
                      <p className="text-white text-sm line-clamp-2">{entry.content}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(entry.entry_date || entry.created_date), 'MMM d, yyyy')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardHeader className="border-b border-red-900/30 p-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  Attachments
                </CardTitle>
                <div>
                  <input
                    type="file"
                    id="attachment-upload"
                    onChange={handleAttachmentUpload}
                    className="hidden"
                  />
                  <label htmlFor="attachment-upload">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="cursor-pointer border-gray-700 gap-2"
                      disabled={uploadingAttachment}
                      onClick={() => document.getElementById('attachment-upload').click()}
                    >
                      {uploadingAttachment ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Add File
                        </>
                      )}
                    </Button>
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {project?.attachments && project.attachments.length > 0 ? (
                <div className="space-y-2">
                  {project.attachments.slice(0, 5).map((att, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white hover:text-red-400 transition-colors text-sm truncate block"
                        >
                          {att.name}
                        </a>
                        <p className="text-xs text-gray-500">
                          {format(new Date(att.uploaded_date), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemoveAttachment(att)}
                        className="text-red-400 hover:text-red-300 h-7 w-7 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {project.attachments.length > 5 && (
                    <p className="text-xs text-gray-500 text-center pt-2">
                      +{project.attachments.length - 5} more files
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No attachments yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </>
  );
}