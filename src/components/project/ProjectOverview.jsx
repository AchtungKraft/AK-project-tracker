import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ProjectOverview({ project, projectId }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(project);
  const [uploadingFile, setUploadingFile] = useState(false);

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active);
  const currentStatus = statuses.find(s => s.id === project.status_id);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Project.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project updated');
      setIsEditing(false);
    },
    onError: () => {
      toast.error('Failed to update project');
    }
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const newAttachment = {
        name: file.name,
        url: file_url,
        uploaded_date: new Date().toISOString(),
      };

      const updatedAttachments = [...(project.attachments || []), newAttachment];
      await updateMutation.mutateAsync({ attachments: updatedAttachments });
      toast.success('File uploaded');
    } catch (error) {
      toast.error('Failed to upload file');
    }
    setUploadingFile(false);
  };

  const removeAttachment = async (index) => {
    const updatedAttachments = project.attachments.filter((_, i) => i !== index);
    await updateMutation.mutateAsync({ attachments: updatedAttachments });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 flex flex-row justify-between items-center">
            <CardTitle className="text-white">Project Details</CardTitle>
            {!isEditing ? (
              <Button 
                size="sm"
                onClick={() => {
                  setIsEditing(true);
                  setFormData(project);
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Edit
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="p-6">
            {!isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-gray-400">Client Name</Label>
                  <p className="text-white mt-1">{project.client_name || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-400">VIN / Chassis #</Label>
                  <p className="text-white mt-1">{project.vin || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-400">Client Email</Label>
                  <p className="text-white mt-1">{project.client_email || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-400">Client Phone</Label>
                  <p className="text-white mt-1">{project.client_phone || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-400">Start Date</Label>
                  <p className="text-white mt-1">
                    {project.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-gray-400">Target Completion</Label>
                  <p className="text-white mt-1">
                    {project.target_completion ? format(new Date(project.target_completion), 'MMM d, yyyy') : '-'}
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate(formData);
              }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Project Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Client Name</Label>
                    <Input
                      value={formData.client_name || ''}
                      onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>VIN / Chassis #</Label>
                    <Input
                      value={formData.vin || ''}
                      onChange={(e) => setFormData({...formData, vin: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Client Email</Label>
                    <Input
                      type="email"
                      value={formData.client_email || ''}
                      onChange={(e) => setFormData({...formData, client_email: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Client Phone</Label>
                    <Input
                      value={formData.client_phone || ''}
                      onChange={(e) => setFormData({...formData, client_phone: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Project Type</Label>
                    <Select
                      value={formData.project_type_id || ''}
                      onValueChange={(value) => setFormData({...formData, project_type_id: value})}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {projectTypes.filter(t => t.active).map(type => (
                          <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={formData.status_id || ''}
                      onValueChange={(value) => setFormData({...formData, status_id: value})}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {projectStatuses.map(status => (
                          <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={formData.start_date || ''}
                      onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Completion</Label>
                    <Input
                      type="date"
                      value={formData.target_completion || ''}
                      onChange={(e) => setFormData({...formData, target_completion: e.target.value})}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    className="border-gray-700"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : 'Save Changes'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30">
            <CardTitle className="text-white flex items-center justify-between">
              <span>Attachments</span>
              <label>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploadingFile}
                />
                <Button 
                  type="button"
                  size="sm"
                  disabled={uploadingFile}
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => document.querySelector('input[type="file"]').click()}
                >
                  {uploadingFile ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" /> Upload</>
                  )}
                </Button>
              </label>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {!project.attachments || project.attachments.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No attachments yet</p>
            ) : (
              <div className="space-y-2">
                {project.attachments.map((attachment, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-800"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-red-400" />
                      <div>
                        <a 
                          href={attachment.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-white hover:text-red-400 transition-colors"
                        >
                          {attachment.name}
                        </a>
                        {attachment.uploaded_date && (
                          <p className="text-xs text-gray-500 mt-1">
                            {format(new Date(attachment.uploaded_date), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAttachment(index)}
                      className="text-gray-500 hover:text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30">
            <CardTitle className="text-white">Status</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {currentStatus ? (
              <Badge 
                style={{ backgroundColor: currentStatus.color }}
                className="text-white text-lg px-4 py-2"
              >
                {currentStatus.label}
              </Badge>
            ) : (
              <p className="text-gray-500">No status</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30">
            <CardTitle className="text-white">Progress</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-2">
              <Progress 
                value={project.progress_percent || 0}
                className="h-3 bg-gray-800"
              />
              <p className="text-2xl font-bold text-white">
                {project.progress_percent || 0}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}