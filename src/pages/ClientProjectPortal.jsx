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

const getRequestTypeInfo = (type) => {
  const map = {
    question: { label: 'Question', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50 border' },
    update: { label: 'Update', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50 border' },
    image_review: { label: 'Design Review', color: 'bg-purple-500/20 text-purple-400 border-purple-500/50 border' },
    approval: { label: 'Need from Client', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50 border' },
  };
  return map[type] || { label: type.replace('_', ' '), color: 'bg-gray-500/20 text-gray-400 border-gray-500/50 border' };
};

const getRequestState = (request, allDecisions, allAttachments) => {
  const decisions = allDecisions.filter(d => d.request_id === request.id);
  const attachments = allAttachments.filter(a => a.request_id === request.id);

  // For image_review requests
  if (request.request_type === 'image_review') {
    const images = attachments.filter(a => a.attachment_type === 'image');
    const imageDecisions = decisions.filter(d => d.target_type === 'attachment_image');

    if (imageDecisions.some(d => d.decision === 'changes_requested')) {
      return { label: 'Changes Requested', color: 'bg-orange-500/20 text-orange-400 border-orange-500/50 border', icon: AlertCircle };
    }

    if (images.length > 0 && images.every(img =>
      imageDecisions.some(d => d.target_attachment_id === img.id && d.decision === 'approved')
    )) {
      return { label: 'Approved', color: 'bg-green-500/20 text-green-400 border-green-500/50 border', icon: CheckCircle2 };
    }

    if (request.status === 'posted' && images.some(img =>
      !imageDecisions.some(d => d.target_attachment_id === img.id)
    )) {
      if (request.due_date && new Date(request.due_date) < new Date()) {
        return { label: 'Overdue', color: 'bg-red-500/20 text-red-400 border-red-500/50 border', icon: Clock };
      }
      return { label: 'Needs Your Review', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50 border', icon: Clock };
    }
    return { label: 'Needs Your Review', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50 border', icon: Clock };
  }

  // For non-image_review requests
  const latestDecision = decisions
    .filter(d => d.target_type === 'request')
    .sort((a, b) => new Date(b.decided_at || b.created_date) - new Date(a.decided_at || a.created_date))[0];

  if (latestDecision?.decision === 'approved') {
    return { label: 'Approved', color: 'bg-green-500/20 text-green-400 border-green-500/50 border', icon: CheckCircle2 };
  }

  if (latestDecision?.decision === 'changes_requested') {
    return { label: 'Changes Requested', color: 'bg-orange-500/20 text-orange-400 border-orange-500/50 border', icon: AlertCircle };
  }

  if (request.status === 'posted' && !latestDecision) {
    if (request.due_date && new Date(request.due_date) < new Date()) {
      return { label: 'Overdue', color: 'bg-red-500/20 text-red-400 border-red-500/50 border', icon: Clock };
    }
    return { label: 'Needs Your Review', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50 border', icon: Clock };
  }

  return { label: 'Needs Your Review', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50 border', icon: Clock };
};

export default function ClientProjectPortal() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const [clientAccess, setClientAccess] = useState(null);
  const [filter, setFilter] = useState('needs_review');

  useEffect(() => {
    if (!token) return;

    base44.entities.ProjectClientAccess.filter({
      share_token: token,
      access_status: 'active',
    }).then(access => {
      if (access.length > 0) {
        setClientAccess(access[0]);
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

  const { data: requests = [] } = useQuery({
    queryKey: ['clientFeedbackRequests', clientAccess?.project_id],
    queryFn: () => base44.entities.ClientFeedbackRequest.filter({
      project_id: clientAccess.project_id,
      status: 'posted',
    }),
    enabled: !!clientAccess?.project_id,
    refetchOnMount: 'always',
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ['clientFeedbackDecisions', clientAccess?.project_id],
    queryFn: () => base44.entities.ClientFeedbackDecision.filter({ project_id: clientAccess.project_id }),
    enabled: requests.length > 0 && !!clientAccess?.project_id,
    refetchOnMount: 'always',
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['clientFeedbackAttachments', clientAccess?.project_id],
    queryFn: () => base44.entities.ClientFeedbackAttachment.filter({ project_id: clientAccess.project_id }),
    enabled: requests.length > 0 && !!clientAccess?.project_id,
    refetchOnMount: 'always',
  });

  const requestsWithState = useMemo(() => {
    return requests.map(request => {
      const state = getRequestState(request, decisions, attachments);
      return { ...request, state };
    });
  }, [requests, decisions, attachments]);

  const filteredRequests = useMemo(() => {
    let filtered = requestsWithState;

    if (filter === 'needs_review') {
      filtered = filtered.filter(req => req.state.label === 'Needs Your Review' || req.state.label === 'Overdue');
    } else if (filter !== 'all') {
      filtered = filtered.filter(req => req.state.label.toLowerCase().replace(' ', '_') === filter);
    }
    return filtered.sort((a, b) => {
      const typePriority = {
        approval: 1,
        image_review: 2,
        question: 3,
        update: 4
      };
      
      const pA = typePriority[a.request_type] || 99;
      const pB = typePriority[b.request_type] || 99;
      
      if (pA !== pB) return pA - pB;
      
      return new Date(b.updated_date) - new Date(a.updated_date);
    });
  }, [requestsWithState, filter]);

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
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("ClientProjects") + `?token=${token}`)}
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
          {[
            { key: 'needs_review', label: 'Needs Review' },
            { key: 'approved', label: 'Approved' },
            { key: 'changes_requested', label: 'Changes Requested' },
            { key: 'all', label: 'All' }
          ].map(f => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? 'default' : 'outline'}
              onClick={() => setFilter(f.key)}
              className={cn(
                filter === f.key ? 'bg-red-600 hover:bg-red-700' : 'border-gray-700 text-white',
                'whitespace-nowrap'
              )}
            >
              {f.label}
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
                  onClick={() => navigate(createPageUrl("ClientFeedbackRequestDetail") + `?id=${request.id}&token=${token}`)}
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
                      <Badge className={cn("text-xs border", getRequestTypeInfo(request.request_type).color)}>
                        {getRequestTypeInfo(request.request_type).label}
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