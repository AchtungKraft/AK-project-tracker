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
import { getRequestTypeInfo, getRequestState } from "@/utils/feedbackRequestUtils";

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