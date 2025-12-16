import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FolderKanban, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ClientProjects() {
  const navigate = useNavigate();
  const [clientContactId, setClientContactId] = useState(null);

  useEffect(() => {
    const contactId = localStorage.getItem('client_contact_id');
    const sessionToken = localStorage.getItem('client_portal_session');

    if (!contactId || !sessionToken) {
      navigate(createPageUrl("ClientLogin"));
      return;
    }

    // Verify session is still valid
    base44.entities.ClientPortalSession.filter({
      client_contact_id: contactId,
      session_token_hash: sessionToken,
    }).then(sessions => {
      if (sessions.length === 0 || new Date(sessions[0].expires_at) < new Date()) {
        localStorage.removeItem('client_portal_session');
        localStorage.removeItem('client_contact_id');
        navigate(createPageUrl("ClientLogin"));
        return;
      }

      // Update last seen
      base44.entities.ClientPortalSession.update(sessions[0].id, {
        last_seen_at: new Date().toISOString(),
      });

      setClientContactId(contactId);
    }).catch(() => {
      navigate(createPageUrl("ClientLogin"));
    });
  }, [navigate]);

  const { data: projectAccess = [], isLoading } = useQuery({
    queryKey: ['clientProjectAccess', clientContactId],
    queryFn: () => base44.entities.ProjectClientAccess.filter({
      client_contact_id: clientContactId,
      access_status: 'active',
    }),
    enabled: !!clientContactId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
    enabled: projectAccess.length > 0,
  });

  const { data: clientContact } = useQuery({
    queryKey: ['clientContact', clientContactId],
    queryFn: () => base44.entities.ClientContact.filter({ id: clientContactId }),
    select: (data) => data[0],
    enabled: !!clientContactId,
  });

  const accessibleProjects = projectAccess.map(access => {
    const project = projects.find(p => p.id === access.project_id);
    return project ? { ...project, access } : null;
  }).filter(Boolean);

  const handleLogout = () => {
    localStorage.removeItem('client_portal_session');
    localStorage.removeItem('client_contact_id');
    navigate(createPageUrl("ClientLogin"));
  };

  if (isLoading || !clientContactId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="border-gray-700 text-white"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        {accessibleProjects.length === 0 ? (
          <Card className="bg-black/60 backdrop-blur-xl border border-gray-700">
            <CardContent className="p-8 text-center">
              <p className="text-gray-400">No projects available</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {accessibleProjects.map(project => (
              <Card
                key={project.id}
                className="bg-black/60 backdrop-blur-xl border border-gray-700 hover:bg-gray-800/50 cursor-pointer transition-colors"
                onClick={() => navigate(createPageUrl("ClientProjectPortal") + `?id=${project.id}`)}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}