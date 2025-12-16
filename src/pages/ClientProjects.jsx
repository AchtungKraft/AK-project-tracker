import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FolderKanban } from "lucide-react";

export default function ClientProjects() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const [clientAccess, setClientAccess] = useState(null);

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

  if (!token || !clientAccess || !project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

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

        <Card
          className="bg-black/60 backdrop-blur-xl border border-gray-700 hover:bg-gray-800/50 cursor-pointer transition-colors"
          onClick={() => navigate(createPageUrl("ClientProjectPortal") + `?token=${token}`)}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {project.featured_image_url ? (
                <img
                  src={project.featured_image_url}
                  alt={project.name}
                  className="w-20 h-20 rounded-lg object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                  <FolderKanban className="w-8 h-8 text-white" />
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">{project.name}</h3>
                {project.client_name && (
                  <p className="text-sm text-gray-400">{project.client_name}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}