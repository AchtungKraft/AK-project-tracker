import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, X, Edit2, Check, Image as ImageIcon, FileText, Wrench } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function ProjectOverview({ project, projectId }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
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

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => base44.entities.Task.filter({ project_id: projectId })
  });

  const { data: journalEntries = [] } = useQuery({
    queryKey: ['journalEntries', projectId],
    queryFn: () => base44.entities.JournalEntry.filter({ project_id: projectId })
  });

  const projectStatuses = statuses.filter((s) => s.scope === 'Project' && s.active);
  const currentStatus = statuses.find((s) => s.id === project?.status_id);
  const projectType = projectTypes.find((t) => t.id === project?.project_type_id);

  const recentTasks = tasks.
  sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).
  slice(0, 5);

  const recentEntries = journalEntries.
  sort((a, b) => new Date(b.entry_date || b.created_date) - new Date(a.entry_date || a.created_date)).
  slice(0, 3);

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

  const handleViewAllTasks = () => {
    const newUrl = `${window.location.pathname}?id=${projectId}&tab=tasks`;
    window.history.pushState({}, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleViewAllJournal = () => {
    const newUrl = `${window.location.pathname}?id=${projectId}&tab=journal`;
    window.history.pushState({}, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="space-y-6">
      {/* Project Images Gallery */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="bg-slate-700 p-6 flex flex-col space-y-1.5 border-b border-red-900/30">
          <div className="flex justify-between items-center">
            <CardTitle className="text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Project Images
            </CardTitle>
            <div>
              <input
                type="file"
                id="image-upload"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden" />

              <label htmlFor="image-upload">
                <Button
                  type="button"
                  variant="outline" className="bg-red-600 px-4 py-2 text-sm font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm hover:bg-accent hover:text-accent-foreground h-9 cursor-pointer border-gray-700"

                  disabled={uploadingImages}
                  onClick={() => document.getElementById('image-upload').click()}>

                  {uploadingImages ?
                  <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </> :

                  <>
                      <Upload className="mr-2 h-4 w-4" />
                      Add Images
                    </>
                  }
                </Button>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {project?.images && project.images.length > 0 ?
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {project.images.map((url, idx) =>
            <div key={idx} className="relative group">
                  <img
                src={url}
                alt={`Project ${idx + 1}`}
                className="w-full h-40 object-cover rounded-lg border border-gray-700" />

                  <button
                onClick={() => handleRemoveImage(url)}
                className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">

                    <X className="w-4 h-4" />
                  </button>
                </div>
            )}
            </div> :

          <div className="text-center py-8 text-gray-500">
              No images yet. Upload some to showcase this build.
            </div>
          }
        </CardContent>
      </Card>

      {/* Project Details */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="bg-slate-700 p-6 flex flex-col space-y-1.5 border-b border-red-900/30">
          <div className="flex justify-between items-center">
            <CardTitle className="text-white">Project Details</CardTitle>
            <Button
              variant="outline"
              onClick={() => editing ? handleSaveChanges() : setEditing(true)}
              disabled={updateMutation.isPending} className="bg-red-600 px-4 py-2 text-sm font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm hover:bg-accent hover:text-accent-foreground h-9 border-gray-700">


              {updateMutation.isPending ?
              <Loader2 className="w-4 h-4 animate-spin" /> :
              editing ?
              <>
                  <Check className="mr-2 w-4 h-4" />
                  Save
                </> :

              <>
                  <Edit2 className="mr-2 w-4 h-4" />
                  Edit
                </>
              }
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {editing ?
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Project Name</Label>
                <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white" />

              </div>
              <div>
                <Label className="text-gray-400">VIN / Chassis</Label>
                <Input
                value={formData.vin}
                onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white" />

              </div>
              <div>
                <Label className="text-gray-400">Client Name</Label>
                <Input
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white" />

              </div>
              <div>
                <Label className="text-gray-400">Client Email</Label>
                <Input
                value={formData.client_email}
                onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white" />

              </div>
              <div>
                <Label className="text-gray-400">Client Phone</Label>
                <Input
                value={formData.client_phone}
                onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white" />

              </div>
              <div>
                <Label className="text-gray-400">Start Date</Label>
                <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white" />

              </div>
              <div>
                <Label className="bg-red-600 text-slate-50 px-4 py-2 text-sm font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm hover:bg-accent hover:text-accent-foreground h-9 cursor-pointer border-gray-700">Target Completion</Label>
                <Input
                type="date"
                value={formData.target_completion}
                onChange={(e) => setFormData({ ...formData, target_completion: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white" />

              </div>
            </div> :

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-400 mb-1">Client</p>
                <p className="text-white">{project?.client_name || '-'}</p>
                {project?.client_email &&
              <p className="text-sm text-gray-500">{project.client_email}</p>
              }
                {project?.client_phone &&
              <p className="text-sm text-gray-500">{project.client_phone}</p>
              }
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">VIN / Chassis</p>
                <p className="text-white font-mono">{project?.vin || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Project Type</p>
                <p className="text-white">{projectType?.name || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Status</p>
                {currentStatus &&
              <Badge
                style={{ backgroundColor: currentStatus.color }}
                className="text-white">

                    {currentStatus.label}
                  </Badge>
              }
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Start Date</p>
                <p className="text-white">
                  {project?.start_date ? format(new Date(project.start_date), 'PPP') : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Target Completion</p>
                <p className="text-white">
                  {project?.target_completion ? format(new Date(project.target_completion), 'PPP') : '-'}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm text-gray-400 mb-2">Progress</p>
                <Progress value={project?.progress_percent || 0} className="h-3" />
                <p className="text-sm text-gray-400 mt-1">{project?.progress_percent || 0}% Complete</p>
              </div>
            </div>
          }
        </CardContent>
      </Card>

      {/* Recent Activity Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Tasks */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="bg-slate-700 p-6 flex flex-col space-y-1.5 border-b border-red-900/30">
            <div className="flex justify-between items-center">
              <CardTitle className="text-white flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                Recent Tasks
              </CardTitle>
              <Button
                variant="ghost"
                size="sm" className="bg-red-700 text-red-50 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent h-8 hover:text-red-300"

                onClick={handleViewAllTasks}>

                View All →
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {recentTasks.length === 0 ?
            <p className="text-center text-gray-500 py-4">No tasks yet</p> :

            <div className="space-y-2">
                {recentTasks.map((task) =>
              <div key={task.id} className="p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors cursor-pointer">
                    <p className="text-white text-sm">{task.name}</p>
                    {task.due_date &&
                <p className="text-xs text-gray-500 mt-1">
                        Due: {format(new Date(task.due_date), 'MMM d')}
                      </p>
                }
                  </div>
              )}
              </div>
            }
          </CardContent>
        </Card>

        {/* Recent Journal */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="bg-slate-700 p-6 flex flex-col space-y-1.5 border-b border-red-900/30">
            <div className="flex justify-between items-center">
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Recent Journal Entries
              </CardTitle>
              <Button
                variant="ghost"
                size="sm" className="bg-red-600 text-red-50 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent h-8 hover:text-red-300"

                onClick={handleViewAllJournal}>

                View All →
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {recentEntries.length === 0 ?
            <p className="text-center text-gray-500 py-4">No entries yet</p> :

            <div className="space-y-2">
                {recentEntries.map((entry) =>
              <div key={entry.id} className="p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors cursor-pointer">
                    <p className="text-white text-sm line-clamp-2">{entry.content}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(entry.entry_date || entry.created_date), 'MMM d, yyyy')}
                    </p>
                  </div>
              )}
              </div>
            }
          </CardContent>
        </Card>
      </div>

      {/* Attachments */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="bg-slate-700 p-6 flex flex-col space-y-1.5 border-b border-red-900/30">
          <div className="flex justify-between items-center">
            <CardTitle className="text-white">Attachments</CardTitle>
            <div>
              <input
                type="file"
                id="attachment-upload"
                onChange={handleAttachmentUpload}
                className="hidden" />

              <label htmlFor="attachment-upload">
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer border-gray-700"
                  disabled={uploadingAttachment}
                  onClick={() => document.getElementById('attachment-upload').click()}>

                  {uploadingAttachment ?
                  <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </> :

                  <>
                      <Upload className="mr-2 h-4 w-4" />
                      Add File
                    </>
                  }
                </Button>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {project?.attachments && project.attachments.length > 0 ?
          <div className="space-y-2">
              {project.attachments.map((att, idx) =>
            <div
              key={idx}
              className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors">

                  <div className="flex-1">
                    <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white hover:text-red-400 transition-colors">

                      {att.name}
                    </a>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(att.uploaded_date), 'PPP')}
                    </p>
                  </div>
                  <Button
                size="icon"
                variant="ghost"
                onClick={() => handleRemoveAttachment(att)}
                className="text-red-400 hover:text-red-300">

                    <X className="w-4 h-4" />
                  </Button>
                </div>
            )}
            </div> :

          <div className="text-center py-8 text-gray-500">
              No attachments yet.
            </div>
          }
        </CardContent>
      </Card>
    </div>);

}