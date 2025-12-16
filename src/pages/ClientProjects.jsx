import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Users, FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Eye, Calendar } from "lucide-react";
import { format } from "date-fns";
import ImageModal from "../components/ui/ImageModal";

export default function ClientProjects() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const [clientAccess, setClientAccess] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    base44.entities.ProjectClientAccess.filter({
      share_token: token,
      access_status: 'active',
    }).then(access => {
      if (access.length > 0) {
        setClientAccess(access[0]);
        // Update last viewed
        base44.entities.ProjectClientAccess.update(access[0].id, {
          last_viewed_at: new Date().toISOString(),
        });
      }
    });
  }, [token]);

  const { data: project } = useQuery({
    queryKey: ['project', clientAccess?.project_id],
    queryFn: () => base44.entities.Project.filter({ id: clientAccess.project_id }),
    select: (data) => data[0],
    enabled: !!clientAccess?.project_id,
  });

  const { data: clientContact } = useQuery({
    queryKey: ['clientContact', clientAccess?.client_contact_id],
    queryFn: () => base44.entities.ClientContact.filter({ id: clientAccess.client_contact_id }),
    select: (data) => data[0],
    enabled: !!clientAccess?.client_contact_id,
  });

  const { data: statusList = [] } = useQuery({
    queryKey: ['statusList'],
    queryFn: () => base44.entities.StatusList.list(),
    enabled: !!project
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
    enabled: !!project
  });

  if (!token || !clientAccess || !project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  const displayImage = project.featured_image_url || (project.images && project.images[0]);
  const status = statusList.find(s => s.id === project.status_id);
  const projectType = projectTypes.find(t => t.id === project.project_type_id);
  const isOverdue = project.target_completion &&
    new Date(project.target_completion) < new Date() &&
    status?.label?.toLowerCase() !== 'completed';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <img 
            src="https://achtungkraft.com/cdn/shop/files/AchtungLogoSticker_39633eb9-a276-4e81-8376-b8fef51b08d6.png"
            alt="Ächtung Kraft"
            className="h-8 mb-2"
          />
          <h1 className="text-2xl font-bold text-white">Your Project</h1>
          {clientContact && (
            <p className="text-sm text-gray-400">Welcome, {clientContact.name}</p>
          )}
        </div>

        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30 hover:border-red-700/50 transition-all duration-300 overflow-hidden group">
          {/* Image Section */}
          <div
            className="relative h-48 bg-gray-900/50 cursor-pointer overflow-hidden"
            onClick={() => displayImage && setSelectedImage(displayImage)}
          >
            {displayImage ? (
              <img
                src={displayImage}
                alt={project.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600">
                <div className="text-center">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No Image</p>
                </div>
              </div>
            )}
            
            {/* Status Badge Overlay */}
            {status && (
              <div className="absolute top-2 right-2">
                <Badge
                  style={{ backgroundColor: status.color }}
                  className="text-white shadow-lg text-xs"
                >
                  {status.label}
                </Badge>
              </div>
            )}
          </div>

          {/* Content Section */}
          <CardContent className="p-4 space-y-3">
            {/* Project Name & Type */}
            <div>
              <h3 className="text-lg font-bold text-white mb-0.5 line-clamp-1">
                {project.name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {projectType && <span>{projectType.name}</span>}
                {project.vin && (
                  <>
                    <span>•</span>
                    <span className="font-mono">{project.vin}</span>
                  </>
                )}
              </div>
            </div>

            {/* Client Info */}
            {project.client_name && (
              <div className="text-sm">
                <p className="text-gray-500 text-xs">Client</p>
                <p className="text-white font-medium">{project.client_name}</p>
              </div>
            )}

            {/* Progress */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-500">Progress</span>
                <span className="text-xs text-gray-400 font-medium">
                  {project.progress_percent || 0}%
                </span>
              </div>
              <Progress value={project.progress_percent || 0} className="h-1.5 bg-gray-800" />
            </div>

            {/* Due Date */}
            <div className="flex items-center justify-between text-xs border-t border-gray-800 pt-2 mt-2">
              {project.target_completion ? (
                <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-gray-400'}`}>
                  <Calendar className="w-3 h-3" />
                  <span>Due {format(new Date(project.target_completion), 'MMM d')}</span>
                </div>
              ) : (
                <div className="text-gray-600">No due date</div>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(createPageUrl("ClientProjectPortal") + `?token=${token}`)}
                className="bg-lime-600 text-white px-3 text-xs font-medium rounded-md inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border shadow-sm hover:text-white h-8 border-lime-700 hover:bg-lime-700 gap-2"
              >
                <Eye className="w-3 h-3" />
                Open Portal
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </div>
  );
}