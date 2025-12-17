import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Share2, Search, FolderKanban } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getRequestTypeInfo, getRequestState } from "@/components/clientportal/utils";

// Helper for hex colors
const getStateColor = (label) => {
  const normalized = label.toLowerCase();
  if (normalized.includes('approved')) return '#22c55e'; // green-500
  if (normalized.includes('changes')) return '#f97316'; // orange-500
  if (normalized.includes('draft')) return '#6b7280'; // gray-500
  if (normalized.includes('archived')) return '#6b7280'; // gray-500
  if (normalized.includes('needs')) return '#3b82f6'; // blue-500
  return '#6b7280';
};

const getTypeColor = (type) => {
  switch (type) {
    case 'question': return '#3b82f6'; // blue-500
    case 'update': return '#6366f1'; // indigo-500
    case 'image_review': return '#a855f7'; // purple-500
    case 'approval': return '#f59e0b'; // amber-500
    default: return '#6b7280';
  }
};

const STATE_ORDER = ['Needs Review', 'Needs Your Review', 'Changes Requested', 'Approved', 'Draft', 'Archived'];

export default function ClientPortalDashboard({ projectId, onCreateRequest, onManageAccess, onSelectRequest }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('last_activity');

  const { data: requests = [] } = useQuery({
    queryKey: ['clientFeedbackRequests', projectId],
    queryFn: () => base44.entities.ClientFeedbackRequest.filter({ project_id: projectId }),
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['clientFeedbackComments', projectId],
    queryFn: () => base44.entities.ClientFeedbackComment.list(),
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ['clientFeedbackDecisions', projectId],
    queryFn: () => base44.entities.ClientFeedbackDecision.list(),
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['clientFeedbackAttachments', projectId],
    queryFn: () => base44.entities.ClientFeedbackAttachment.list(),
  });

  const requestsWithState = useMemo(() => {
    return requests.map(request => {
      const state = getRequestState(request, decisions, attachments);
      const requestComments = comments.filter(c => c.request_id === request.id);
      const lastActivity = [...requestComments, request]
        .map(item => new Date(item.updated_date || item.created_date))
        .sort((a, b) => b - a)[0] || new Date(request.created_date);
      
      return { ...request, state, commentCount: requestComments.length, lastActivity };
    });
  }, [requests, comments, decisions, attachments]);

  // Filter and Sort Logic
  const filteredRequests = useMemo(() => {
    let filtered = requestsWithState;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r => 
        r.title.toLowerCase().includes(term) || 
        (r.body && r.body.toLowerCase().includes(term))
      );
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
  }, [requestsWithState, searchTerm, sortBy]);

  // Grouping Logic
  const groupedRequests = useMemo(() => {
    const groups = {};

    filteredRequests.forEach(request => {
      const stateLabel = request.state.label;
      const stateColor = getStateColor(stateLabel);

      if (!groups[stateLabel]) {
        groups[stateLabel] = {
          label: stateLabel,
          color: stateColor,
          requests: [],
          subGroups: {}
        };
      }
      groups[stateLabel].requests.push(request);

      // Sub-group by type
      const typeKey = request.request_type;
      const typeInfo = getRequestTypeInfo(typeKey);
      
      if (!groups[stateLabel].subGroups[typeKey]) {
        groups[stateLabel].subGroups[typeKey] = {
          label: typeInfo.label,
          color: getTypeColor(typeKey),
          requests: []
        };
      }
      groups[stateLabel].subGroups[typeKey].requests.push(request);
    });

    // Sort primary groups
    const sortedGroups = Object.entries(groups).sort((a, b) => {
      const idxA = STATE_ORDER.indexOf(a[0]);
      const idxB = STATE_ORDER.indexOf(b[0]);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });

    return sortedGroups;
  }, [filteredRequests]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-white">Client Portal</h2>
        <div className="flex gap-2">
          <Button onClick={onManageAccess} variant="outline" className="border-gray-700 text-white">
            <Share2 className="w-4 h-4 mr-2" />
            Manage Access
          </Button>
          <Button onClick={onCreateRequest} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-2" />
            New Feedback Request
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search requests..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-gray-900/50 border-gray-700 text-white"
            />
          </div>
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-48 bg-gray-900/50 border-gray-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last_activity">Last Activity</SelectItem>
            <SelectItem value="due_date">Due Date</SelectItem>
            <SelectItem value="posted_date">Posted Date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-6">
        {groupedRequests.length === 0 ? (
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-8 text-center">
              <p className="text-gray-400">No requests found</p>
            </CardContent>
          </Card>
        ) : (
          groupedRequests.map(([groupKey, group]) => (
            <Card 
              key={groupKey}
              className="bg-black/40 backdrop-blur-xl border-2 shadow-lg"
              style={{ 
                borderColor: `${group.color}80`,
                boxShadow: `0 10px 15px -3px ${group.color}20`
              }}
            >
              <CardHeader 
                className="border-b p-4"
                style={{ borderBottomColor: `${group.color}50` }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <FolderKanban className="w-5 h-5" style={{ color: group.color }} />
                    <CardTitle className="text-lg" style={{ color: group.color }}>{group.label}</CardTitle>
                  </div>
                  <Badge 
                    variant="outline" 
                    style={{ borderColor: group.color, color: group.color, backgroundColor: `${group.color}15` }}
                  >
                    {group.requests.length} {group.requests.length === 1 ? 'request' : 'requests'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(group.subGroups).map(([typeKey, subGroup]) => (
                    <div key={typeKey} className="col-span-1">
                      <div 
                        className="bg-black/40 rounded-lg border-2 overflow-hidden"
                        style={{ borderColor: subGroup.color }}
                      >
                        <div 
                          className="p-3 border-b-2"
                          style={{ 
                            borderBottomColor: subGroup.color,
                            backgroundColor: `${subGroup.color}15`
                          }}
                        >
                          <h3 
                            className="font-semibold text-sm"
                            style={{ color: subGroup.color }}
                          >
                            {subGroup.label}
                          </h3>
                          <span className="text-xs text-gray-400">
                            {subGroup.requests.length} {subGroup.requests.length === 1 ? 'request' : 'requests'}
                          </span>
                        </div>
                        <div className="p-3 space-y-2">
                          {subGroup.requests.map(request => {
                            const StateIcon = request.state.icon;
                            return (
                              <div
                                key={request.id}
                                className="bg-gray-900/50 border border-gray-700 hover:bg-gray-800/80 cursor-pointer transition-all rounded-md p-3"
                                onClick={() => onSelectRequest(request)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="font-medium text-white text-sm line-clamp-2">{request.title}</h4>
                                  {request.commentCount > 0 && (
                                     <Badge variant="secondary" className="text-[10px] px-1 h-5 bg-gray-800 text-gray-300">
                                       {request.commentCount}
                                     </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                                   <span className={cn("flex items-center", request.state.color.split(' ')[1])}>
                                     <StateIcon className="w-3 h-3 mr-1" />
                                     {request.state.label}
                                   </span>
                                   <span>•</span>
                                   <span>{format(request.lastActivity, 'MMM d')}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}