import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronRight, 
  FolderKanban, 
  Mail, 
  MessageSquareText,
  Send,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Eye
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { AttentionBadge, getAttentionPriority } from "./NeedsAttentionSection";
import { CopyRequestLinkButton } from "./ClientLinksCopyButtons";
import { getRequestTypeInfo } from "./utils";

// Get last activity date for a request (latest comment or decision)
const getLastActivityDate = (requestId, comments, decisions) => {
  const requestComments = comments.filter(c => c.request_id === requestId);
  const requestDecisions = decisions.filter(d => d.request_id === requestId);
  
  const dates = [
    ...requestComments.map(c => new Date(c.posted_at || c.created_date)),
    ...requestDecisions.map(d => new Date(d.decided_at || d.created_date))
  ].filter(d => !isNaN(d.getTime()));
  
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates));
};

export default function ClientPortalListView({ 
  groupedData, 
  emptyMessage, 
  tabName, 
  showEmailButton = false,
  onSendBulkEmail,
  sendingEmailForProject,
  comments = [],
  decisions = [],
  projects = [],
  getProjectClientSlug = () => null
}) {
  if (groupedData.length === 0) {
    return (
      <div className="bg-black/40 backdrop-blur-xl border border-gray-700 rounded-lg p-8 text-center">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-800 mx-auto mb-3">
          {tabName === 'awaiting' && <Clock className="w-6 h-6 text-gray-500" />}
          {tabName === 'changes' && <AlertTriangle className="w-6 h-6 text-gray-500" />}
          {tabName === 'approved' && <CheckCircle2 className="w-6 h-6 text-gray-500" />}
        </div>
        <p className="text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  // Sort type order for consistency
  const typeOrder = ['design_review', 'feedback_needed', 'question', 'client_need', 'todo_list', 'update', 'budget_review', 'deliverable_review', 'general'];
  
  // Sort requests within each project: attention items first, then by type
  const sortedGroupedData = groupedData.map(({ project, requests }) => ({
    project,
    requests: [...requests].sort((a, b) => {
      // First by attention priority (items with attention float to top)
      const aPriority = a.attentionType ? getAttentionPriority(a.attentionType) : 99;
      const bPriority = b.attentionType ? getAttentionPriority(b.attentionType) : 99;
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      // Then by type
      const typeA = typeOrder.indexOf(a.request_type || 'general');
      const typeB = typeOrder.indexOf(b.request_type || 'general');
      return typeA - typeB;
    })
  }));

  // Count total requests
  const totalRequests = sortedGroupedData.reduce((sum, g) => sum + g.requests.length, 0);

  return (
    <div className="space-y-4">
      {sortedGroupedData.map(({ project, requests }, groupIndex) => (
        <div key={`${project?.id || 'unknown'}-${groupIndex}`} className="bg-black/40 backdrop-blur-xl border border-gray-700 rounded-lg overflow-hidden">
          {/* Project Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800/70 border-b border-gray-700">
            <div className="flex items-center gap-2 flex-wrap">
              <FolderKanban className="w-4 h-4 text-red-500" />
              <span className="text-white font-semibold text-sm">{project?.name || 'Unknown Project'}</span>
              {project?.client_name && (
                <span className="text-gray-500 text-xs">• {project.client_name}</span>
              )}
              {project?.client_last_viewed_at && (
                <span className="text-cyan-500 text-xs flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  Portal: {format(new Date(project.client_last_viewed_at), 'MMM d, h:mma')}
                </span>
              )}
            </div>
            <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
              {requests.length}
            </Badge>
          </div>
          
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-1.5 bg-gray-800/30 border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div className="col-span-5 md:col-span-5">Request</div>
            <div className="col-span-2 md:col-span-2">Status</div>
            <div className="col-span-2 md:col-span-2">Type</div>
            <div className="col-span-3 hidden md:block">Activity</div>
          </div>
          
          {/* Rows */}
          <div className="divide-y divide-gray-800/50">
            {requests.map(request => {
              const lastActivity = getLastActivityDate(request.id, comments, decisions);
              return (
                <Link
                  key={request.id}
                  to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&tab=${tabName}`}
                  className={`grid grid-cols-12 gap-2 px-4 py-2.5 hover:bg-gray-800/50 transition-colors items-center group ${
                    request.attentionType ? 'border-l-4' : ''
                  }`}
                  style={request.attentionType ? {
                    borderLeftColor: request.attentionType === 'changes_requested' ? '#ef4444' :
                      request.attentionType === 'client_replied' ? '#eab308' :
                      request.attentionType === 'new_activity' ? '#3b82f6' :
                      request.attentionType === 'client_approved' ? '#22c55e' : 'transparent'
                  } : {}}
                >
                  {/* Title + Comment indicator */}
                  <div className="col-span-5 md:col-span-5 flex items-center gap-2 min-w-0">
                    <span className="text-white font-medium truncate text-sm">{request.title}</span>
                    {request.totalCommentCount > 0 && (
                      <Badge variant="outline" className="border-gray-600 text-gray-400 shrink-0 flex items-center gap-1 text-xs px-1.5">
                        <MessageSquareText className="w-3 h-3" />
                        {request.totalCommentCount}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Attention Status */}
                  <div className="col-span-2 md:col-span-2">
                    {request.attentionType ? (
                      <AttentionBadge type={request.attentionType} size="sm" />
                    ) : (
                      <span className="text-gray-500 text-xs">—</span>
                    )}
                  </div>
                  
                  {/* Type */}
                  <div className="col-span-2 md:col-span-2">
                    <Badge className={`${getRequestTypeInfo(request.request_type).color} text-xs`}>
                      {getRequestTypeInfo(request.request_type).label}
                    </Badge>
                  </div>
                  
                  {/* Activity Context */}
                  <div className="col-span-3 hidden md:flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5 text-xs">
                      {request.lastClientComment && (
                        <span className="text-yellow-400">
                          Client {formatDistanceToNow(new Date(request.lastClientComment.created_date), { addSuffix: true })}
                        </span>
                      )}
                      {request.last_viewed_by_internal_at && (
                        <span className="text-gray-500">
                          AK {formatDistanceToNow(new Date(request.last_viewed_by_internal_at), { addSuffix: true })}
                        </span>
                      )}
                      {!request.lastClientComment && !request.last_viewed_by_internal_at && lastActivity && (
                        <span className="text-gray-400">
                          {format(lastActivity, 'MMM d')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <CopyRequestLinkButton 
                        slug={getProjectClientSlug(request.project_id)} 
                        requestId={request.id} 
                      />
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      
      {/* Footer with total count */}
      <div className="text-xs text-gray-500 text-right">
        {totalRequests} {totalRequests === 1 ? 'request' : 'requests'} total
      </div>
    </div>
  );
}