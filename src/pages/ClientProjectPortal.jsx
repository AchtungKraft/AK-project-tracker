import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const getRequestState = (request, decisions, attachments) => {
  if (request.request_type === 'image_review') {
    const images = attachments.filter(a => a.request_id === request.id && a.attachment_type === 'image');
    const imageDecisions = decisions.filter(d => d.request_id === request.id && d.target_type === 'attachment_image');
    
    if (imageDecisions.some(d => d.decision === 'changes_requested')) {
      return { label: 'Changes Requested', color: 'bg-orange-500', icon: AlertCircle };
    }
    
    if (images.length > 0 && images.every(img => 
      imageDecisions.some(d => d.target_attachment_id === img.id && d.decision === 'approved')
    )) {
      return { label: 'Approved', color: 'bg-green-500', icon: CheckCircle2 };
    }
    
    return { label: 'Needs Your Review', color: 'bg-blue-500', icon: Clock };
  }
  
  const latestDecision = decisions
    .filter(d => d.request_id === request.id && d.target_type === 'request')
    .sort((a, b) => new Date(b.decided_at || b.created_date) - new Date(a.decided_at || a.created_date))[0];
  
  if (latestDecision?.decision === 'approved') {
    return { label: 'Approved', color: 'bg-green-500', icon: CheckCircle2 };
  }
  
  if (latestDecision?.decision === 'changes_requested') {
    return { label: 'Changes Requested', color: 'bg-orange-500', icon: AlertCircle };
  }
  
  return { label: 'Needs Your Review', color: 'bg-blue-500', icon: Clock };
};

export default function ClientProjectPortal() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
  const [clientContactId, setClientContactId] = useState(null);
  const [filter, setFilter] = useState('needs_review');

  useEffect(() => {
    const contactId = localStorage.getItem('client_contact_id');
    const sessionToken = localStorage.getItem('client_portal_session');

    if (!contactId || !sessionToken) {
      navigate(createPageUrl("ClientLogin"));
      return;
    }

    // Verify access to this project
    base44.entities.ProjectClientAccess.filter({
      client_contact_id: contactId,
      project_id: projectId,
      access_status: 'active',
    }).then(access => {
      if (access.length === 0) {
        navigate(createPageUrl("ClientProjects"));
        return;
      }

      // Update last viewed
      base44.entities.ProjectClientAccess.update(access[0].id, {
        last_viewed_at: new Date().toISOString(),
      });

      setClientContactId(contactId);
    }).catch(() => {
      navigate(createPageUrl("ClientLogin"));
    });
  }, [navigate, projectId]);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Project.filter({ id: projectId }),
    select: (data) => data[0],
    enabled: !!projectId,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['clientFeedbackRequests', projectId],
    queryFn: () => base44.entities.ClientFeedbackRequest.filter({
      project_id: projectId,
      status: 'posted',
    }),
    enabled: !!clientContactId,
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ['clientFeedbackDecisions', projectId],
    queryFn: () => base44.entities.ClientFeedbackDecision.list(),
    enabled: requests.length > 0,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['clientFeedbackAttachments', projectId],
    queryFn: () => base44.entities.ClientFeedbackAttachment.list(),
    enabled: requests.length > 0,
  });

  const requestsWithState = useMemo(() => {
    return requests.map(request => {
      const state = getRequestState(request, decisions, attachments);
      return { ...request, state };
    });
  }, [requests, decisions, attachments]);

  const filteredRequests = useMemo(() => {
    if (filter === 'all') return requestsWithState;
    
    return requestsWithState.filter(req => {
      if (filter === 'needs_review') return req.state.label === 'Needs Your Review';
      if (filter === 'approved') return req.state.label === 'Approved';
      if (filter === 'changes_requested') return req.state.label === 'Changes Requested';
      return true;
    });
  }, [requestsWithState, filter]);

  if (!clientContactId || !project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("ClientProjects"))}
            className="border-gray-700 text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
            {project.client_name && (
              <p className="text-sm text-gray-400">{project.client_name}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {['needs_review', 'approved', 'changes_requested', 'all'].map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className={cn(
                filter === f ? 'bg-red-600 hover:bg-red-700' : 'border-gray-700 text-white',
                'whitespace-nowrap'
              )}
            >
              {f.replace('_', ' ')}
            </Button>
          ))}
        </div>

        {filteredRequests.length === 0 ? (
          <Card className="bg-black/60 backdrop-blur-xl border border-gray-700">
            <CardContent className="p-8 text-center">
              <p className="text-gray-400">No requests found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map(request => {
              const StateIcon = request.state.icon;
              return (
                <Card
                  key={request.id}
                  className="bg-black/60 backdrop-blur-xl border border-gray-700 hover:bg-gray-800/50 cursor-pointer transition-colors"
                  onClick={() => navigate(createPageUrl("ClientFeedbackRequestDetail") + `?id=${request.id}&projectId=${projectId}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-semibold text-white">{request.title}</h3>
                      <Badge className={cn("text-xs whitespace-nowrap", request.state.color)}>
                        <StateIcon className="w-3 h-3 mr-1" />
                        {request.state.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-400">
                      <Badge variant="outline" className="text-xs">
                        {request.request_type.replace('_', ' ')}
                      </Badge>
                      {request.due_date && (
                        <span>Due: {format(new Date(request.due_date), 'MMM d')}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}