import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Edit2, 
  Copy, 
  Archive, 
  Trash2, 
  ExternalLink,
  Loader2,
  Calendar,
  User,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function ProjectViewDrawer({ projectId, onClose, onEdit }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const results = await base44.entities.Project.filter({ id: projectId });
      return results[0];
    },
    enabled: !!projectId,
  });

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

  const duplicateMutation = useMutation({
    mutationFn: async (projectData) => {
      const { id, created_date, updated_date, created_by, ...dataWithoutMeta } = projectData;
      return base44.entities.Project.create({
        ...dataWithoutMeta,
        name: `${projectData.name} (Copy)`,
        progress_percent: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project duplicated successfully');
      onClose();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (projectId) => {
      const archivedStatus = statuses.find(s => 
        s.scope === 'Project' && s.label.toLowerCase() === 'archived'
      );
      if (!archivedStatus) {
        throw new Error('Archived status not found');
      }
      return base44.entities.Project.update(projectId, { status_id: archivedStatus.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project archived');
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (projectId) => base44.entities.Project.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
      onClose();
    },
  });

  const handleDuplicate = () => {
    if (confirm('Duplicate this project?')) {
      duplicateMutation.mutate(project);
    }
  };

  const handleArchive = () => {
    if (confirm('Archive this project?')) {
      archiveMutation.mutate(projectId);
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      deleteMutation.mutate(projectId);
    }
  };

  const handleViewDetails = () => {
    navigate(createPageUrl(`ProjectDetail?id=${projectId}`));
  };

  if (isLoading) {
    return (
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="bg-gray-900 text-white w-full sm:max-w-lg">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!project) return null;

  const projectType = projectTypes.find(t => t.id === project.project_type_id);
  const status = statuses.find(s => s.id === project.status_id);
  const assignedMembers = teamMembers.filter(m => 
    project.assigned_team?.includes(m.id)
  );

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="border-b border-gray-700 pb-4">
          <SheetTitle className="text-white text-xl">{project.name}</SheetTitle>
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Status and Progress */}
          <div className="space-y-3">
            {status && (
              <div>
                <p className="text-sm text-gray-400 mb-2">Status</p>
                <Badge 
                  style={{ backgroundColor: status.color }}
                  className="text-white"
                >
                  {status.label}
                </Badge>
              </div>
            )}

            <div>
              <p className="text-sm text-gray-400 mb-2">Progress</p>
              <div className="flex items-center gap-3">
                <Progress value={project.progress_percent || 0} className="flex-1 h-3" />
                <span className="text-sm text-gray-300 font-medium">
                  {project.progress_percent || 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Client Info */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Client</p>
            <div>
              <p className="text-white">{project.client_name || '-'}</p>
              {project.client_email && (
                <p className="text-sm text-gray-400">{project.client_email}</p>
              )}
              {project.client_phone && (
                <p className="text-sm text-gray-400">{project.client_phone}</p>
              )}
            </div>
          </div>

          {/* Project Details */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Details</p>
            
            {project.vin && (
              <div>
                <p className="text-xs text-gray-500">VIN / Chassis</p>
                <p className="text-white font-mono text-sm">{project.vin}</p>
              </div>
            )}

            {projectType && (
              <div>
                <p className="text-xs text-gray-500">Project Type</p>
                <p className="text-white">{projectType.name}</p>
              </div>
            )}

            {project.start_date && (
              <div>
                <p className="text-xs text-gray-500">Start Date</p>
                <p className="text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(project.start_date), 'MMM d, yyyy')}
                </p>
              </div>
            )}

            {project.target_completion && (
              <div>
                <p className="text-xs text-gray-500">Target Completion</p>
                <p className="text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(project.target_completion), 'MMM d, yyyy')}
                </p>
              </div>
            )}
          </div>

          {/* Team */}
          {assignedMembers.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Team</p>
              <div className="flex flex-wrap gap-2">
                {assignedMembers.map(member => (
                  <Badge key={member.id} variant="outline" className="border-gray-600 text-gray-300">
                    <User className="w-3 h-3 mr-1" />
                    {member.full_name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Images Preview */}
          {project.images && project.images.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Images</p>
              <div className="grid grid-cols-3 gap-2">
                {project.images.slice(0, 6).map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt={`Project ${idx + 1}`}
                    className="w-full h-20 object-cover rounded-lg border border-gray-700"
                  />
                ))}
              </div>
              {project.images.length > 6 && (
                <p className="text-xs text-gray-500">+{project.images.length - 6} more</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-gray-700 pt-4 space-y-3">
          <Button 
            onClick={handleViewDetails}
            className="w-full bg-red-600 hover:bg-red-700 gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            View Full Details
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button 
              onClick={() => onEdit(project)}
              variant="outline"
              className="border-gray-600 text-white gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </Button>
            <Button 
              onClick={handleDuplicate}
              variant="outline"
              className="border-gray-600 text-white gap-2"
              disabled={duplicateMutation.isPending}
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button 
              onClick={handleArchive}
              variant="outline"
              className="border-gray-600 text-white gap-2"
              disabled={archiveMutation.isPending}
            >
              <Archive className="w-4 h-4" />
              Archive
            </Button>
            <Button 
              onClick={handleDelete}
              variant="destructive"
              className="gap-2"
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}