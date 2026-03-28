import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Users, FolderKanban, Eye, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import ImageModal from "../components/ui/ImageModal";

export default function ClientProjects() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const slug = urlParams.get('slug');
  
  const [selectedImage, setSelectedImage] = useState(null);

  // Single fetch — no duplicate calls
  const { data: clientData, isLoading: loadingProjects } = useQuery({
    queryKey: ['clientProjects', token, slug],
    queryFn: async () => {
      const response = await base44.functions.invoke('publicClientProjects', { token, slug });
      return response.data;
    },
    enabled: !!(token || slug),
    staleTime: 30000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
  });

  const clientContact = clientData?.contact;
  const accesses = clientData?.accesses || [];
  const projects = clientData?.projects || [];
  const statusList = clientData?.statuses || [];
  const projectTypes = clientData?.projectTypes || [];

  if ((!token && !slug) || loadingProjects || !clientData?.success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <img 
            src="https://achtungkraft.com/cdn/shop/files/AchtungLogoSticker_39633eb9-a276-4e81-8376-b8fef51b08d6.png"
            alt="Ächtung Kraft"
            className="h-8 mb-2"
          />
          <h1 className="text-2xl font-bold text-white">Your Projects</h1>
          {clientContact && (
            <p className="text-sm text-gray-400">Welcome, {clientContact.name}</p>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="text-center text-gray-500 py-10">
            <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No active projects found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => {
              const displayImage = project.featured_image_url || (project.images && project.images[0]);
              const status = statusList.find(s => s.id === project.status_id);
              const projectType = projectTypes.find(t => t.id === project.project_type_id);
              const isOverdue = project.target_completion &&
                new Date(project.target_completion) < new Date() &&
                status?.label?.toLowerCase() !== 'completed';
              
              // Find the specific access record for this project to get the token/slug if needed for the link
              // Actually, we pass the SAME token or slug to the portal? 
              // No, the portal expects a specific project context.
              // If we arrived via a User Slug, we might not have a project-specific token in the URL.
              // We need to pass the share_token from the ProjectClientAccess record to the portal.
              const access = accesses.find(a => a.project_id === project.id);
              const portalLink = createPageUrl("ClientProjectPortal") + `?projectId=${project.id}&` + (slug ? `slug=${slug}&client_contact_id=${clientContact?.id || ''}` : `token=${access?.share_token}`);
              return (
                <Card key={project.id} className="bg-black/40 backdrop-blur-xl border border-red-900/30 hover:border-red-700/50 transition-all duration-300 overflow-hidden group flex flex-col">
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
                  <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
                    {/* Project Name & Type */}
                    <div className="flex-1">
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

                    {/* Client Info (Redundant if list is for one client, but good for completeness) */}
                    {/* {project.client_name && (
                      <div className="text-sm">
                        <p className="text-gray-500 text-xs">Client</p>
                        <p className="text-white font-medium">{project.client_name}</p>
                      </div>
                    )} */}

                    {/* Due Date & Action */}
                    <div className="flex items-center justify-between text-xs border-t border-gray-800 pt-2 mt-auto">
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
                        onClick={() => navigate(portalLink)}
                        className="bg-lime-600 text-white px-3 text-xs font-medium rounded-md inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border shadow-sm hover:text-white h-8 border-lime-700 hover:bg-lime-700 gap-2"
                      >
                        <Eye className="w-3 h-3" />
                        VIEW
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </div>
  );
}