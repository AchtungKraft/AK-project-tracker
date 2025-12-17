import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, CheckCircle2, AlertCircle, Clock, Search, Archive, FileText } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getRequestTypeInfo, getRequestState } from "@/components/clientportal/utils";

export default function ClientProjectPortal() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const [clientAccess, setClientAccess] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('needs_review');
  const [sortBy, setSortBy] = useState('last_activity');

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

  const { data: comments = [] } = useQuery({
    queryKey: ['clientFeedbackComments', clientAccess?.project_id],
    queryFn: () => base44.entities.ClientFeedbackComment.list(), // Simplified list since we can't filter by project_id easily on comments without complex joins, but we filter in memory
    enabled: requests.length > 0 && !!clientAccess?.project_id,
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ['clientFeedbackDecisions'],
    queryFn: () => base44.entities.ClientFeedbackDecision.list(),
    enabled: requests.length > 0 && !!clientAccess?.project_id,
    refetchOnMount: 'always',
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['clientFeedbackAttachments'],
    queryFn: () => base44.entities.ClientFeedbackAttachment.list(),
    enabled: requests.length > 0 && !!clientAccess?.project_id,
    refetchOnMount: 'always',
  });

  const requestsWithState = useMemo(() => {
    return requests.map(request => {
      const state = getRequestState(request, decisions, attachments);
      const requestComments = comments.filter(c => c.request_id === request.id);
      
      // Calculate last activity
      const lastActivity = [...requestComments, request]
        .map(item => new Date(item.updated_date || item.created_date))
        .sort((a, b) => b - a)[0] || new Date(request.created_date);

      return { ...request, state, commentCount: requestComments.length, lastActivity };
    });
  }, [requests, comments, decisions, attachments]);

  const stats = useMemo(() => {
    const counts = {
      needsReview: 0,
      overdue: 0,
      changesRequested: 0,
      approved: 0,
      drafts: 0,
      archived: 0,
    };
    
    requestsWithState.forEach(req => {
      if (req.state.label === 'Draft') counts.drafts++;
      else if (req.state.label === 'Archived') counts.archived++;
      else if (req.state.label === 'Needs Your Review') counts.needsReview++;
      else if (req.state.label === 'Needs Review') counts.needsReview++; // Handle both variations if utils return diff
      else if (req.state.label === 'Overdue') counts.overdue++;
      else if (req.state.label === 'Changes Requested') counts.changesRequested++;
      else if (req.state.label === 'Approved') counts.approved++;
    });
    
    return counts;
  }, [requestsWithState]);

  const filteredRequests = useMemo(() => {
    let filtered = requestsWithState;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r => 
        r.title.toLowerCase().includes(term) || 
        (r.body && r.body.toLowerCase().includes(term))
      );
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(r => r.request_type === typeFilter);
    }

    if (stateFilter !== 'all') {
      // Normalize state label for filtering
      filtered = filtered.filter(r => {
        const label = r.state.label.toLowerCase();
        if (stateFilter === 'needs_review') return label === 'needs your review' || label === 'needs review' || label === 'overdue';
        return label.replace(/ /g, '_') === stateFilter;
      });
    }

    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'last_activity') {
        return b.lastActivity - a.lastActivity;
      } else if (sortBy === 'due_date') {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      } else if (sortBy === 'posted_date') {
        if (!a.posted_at) return 1;
        if (!b.posted_at) return -1;
        return new Date(b.posted_at) - new Date(a.posted_at);
      }
      return 0;
    });

    return filtered;
  }, [requestsWithState, searchTerm, typeFilter, stateFilter, sortBy]);

  const StatTile = ({ label, count, filterValue, icon: Icon }) => (
    <Card 
      className={cn(
        "cursor-pointer transition-colors border border-gray-700",
        stateFilter === filterValue ? "ring-2 ring-red-500 bg-gray-900/80" : "bg-black/40 backdrop-blur-xl hover:bg-gray-800/50"
      )}
      onClick={() => setStateFilter(stateFilter === filterValue ? 'all' : filterValue)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">{label}</p>
            <p className="text-2xl font-bold text-white">{count}</p>
          </div>
          <Icon className="w-8 h-8 text-gray-500" />
        </div>
      </CardContent>
    </Card>
  );

  if (!token || !clientAccess || !project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
      <div className="max-w-6xl mx-auto space-y-6">
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
              <p className="text-sm text-gray-400">Portal Dashboard</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Needs Review" count={stats.needsReview} filterValue="needs_review" icon={Clock} />
          <StatTile label="Overdue" count={stats.overdue} filterValue="overdue" icon={AlertCircle} />
          <StatTile label="Changes Requested" count={stats.changesRequested} filterValue="changes_requested" icon={AlertCircle} />
          <StatTile label="Approved" count={stats.approved} filterValue="approved" icon={CheckCircle2} />
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search requests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-black/40 backdrop-blur-xl border-gray-700 text-white"
              />
            </div>
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48 bg-black/40 backdrop-blur-xl border-gray-700 text-white">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="question">Question</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="image_review">Design Review</SelectItem>
              <SelectItem value="approval">Need from Client</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48 bg-black/40 backdrop-blur-xl border-gray-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_activity">Last Activity</SelectItem>
              <SelectItem value="due_date">Due Date</SelectItem>
              <SelectItem value="posted_date">Posted Date</SelectItem>
            </SelectContent>
          </Select>
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="font-semibold text-white">{request.title}</h3>
                          <Badge className={cn("text-xs border", getRequestTypeInfo(request.request_type).color)}>
                            {getRequestTypeInfo(request.request_type).label}
                          </Badge>
                          <Badge className={cn("text-xs", request.state.color)}>
                            <StateIcon className="w-3 h-3 mr-1" />
                            {request.state.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-400 flex-wrap">
                          {request.due_date && (
                            <span>Due: {format(new Date(request.due_date), 'MMM d')}</span>
                          )}
                          <span>Updated: {format(request.lastActivity, 'MMM d, h:mm a')}</span>
                          {request.commentCount > 0 && (
                            <span>{request.commentCount} {request.commentCount === 1 ? 'comment' : 'comments'}</span>
                          )}
                        </div>
                      </div>
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