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
  CheckCircle2
} from "lucide-react";
import { format } from "date-fns";

const getTypeColor = (type) => {
  switch (type) {
    case 'question': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 'feedback_needed': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50';
    case 'design_review': return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
    case 'client_need': return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
    case 'todo_list': return 'bg-teal-500/20 text-teal-400 border-teal-500/50';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
  }
};

const getTypeLabel = (type) => {
  switch (type) {
    case 'question': return 'Question';
    case 'feedback_needed': return 'Feedback';
    case 'design_review': return 'Design';
    case 'client_need': return 'Client Need';
    case 'todo_list': return 'To-Do';
    default: return 'General';
  }
};

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
  decisions = []
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
  const typeOrder = ['design_review', 'feedback_needed', 'question', 'client_need', 'todo_list', 'general'];
  
  // Sort requests within each project by type
  const sortedGroupedData = groupedData.map(({ project, requests }) => ({
    project,
    requests: [...requests].sort((a, b) => {
      const typeA = typeOrder.indexOf(a.request_type || 'general');
      const typeB = typeOrder.indexOf(b.request_type || 'general');
      return typeA - typeB;
    })
  }));

  // Count total requests
  const totalRequests = sortedGroupedData.reduce((sum, g) => sum + g.requests.length, 0);

  return (
    <div className="space-y-4">
      {sortedGroupedData.map(({ project, requests }) => (
        <div key={project?.id || 'unknown'} className="bg-black/40 backdrop-blur-xl border border-gray-700 rounded-lg overflow-hidden">
          {/* Project Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800/70 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-red-500" />
              <span className="text-white font-semibold text-sm">{project?.name || 'Unknown Project'}</span>
              {project?.client_name && (
                <span className="text-gray-500 text-xs">• {project.client_name}</span>
              )}
            </div>
            <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
              {requests.length}
            </Badge>
          </div>
          
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-1.5 bg-gray-800/30 border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div className="col-span-6 md:col-span-7">Request</div>
            <div className="col-span-3 md:col-span-2">Type</div>
            <div className="col-span-3 hidden md:block">Due</div>
          </div>
          
          {/* Rows */}
          <div className="divide-y divide-gray-800/50">
            {requests.map(request => (
              <Link
                key={request.id}
                to={createPageUrl("ClientFeedbackDetail") + `?id=${request.project_id}&projectId=${request.project_id}&from=hub&tab=${tabName}`.replace(`id=${request.project_id}`, `id=${request.id}`)}
                className="grid grid-cols-12 gap-2 px-4 py-2.5 hover:bg-gray-800/50 transition-colors items-center group"
              >
                {/* Title + Comment indicator */}
                <div className="col-span-6 md:col-span-7 flex items-center gap-2 min-w-0">
                  <span className="text-white font-medium truncate text-sm">{request.title}</span>
                  {request.hasClientComments && (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/50 shrink-0 flex items-center gap-1 text-xs px-1.5">
                      <MessageSquareText className="w-3 h-3" />
                      {request.clientCommentCount}
                    </Badge>
                  )}
                </div>
                
                {/* Type */}
                <div className="col-span-3 md:col-span-2">
                  <Badge className={`${getTypeColor(request.request_type)} text-xs`}>
                    {getTypeLabel(request.request_type)}
                  </Badge>
                </div>
                
                {/* Due Date */}
                <div className="col-span-3 hidden md:flex items-center justify-between">
                  <span className="text-gray-400 text-sm">
                    {request.due_date ? format(new Date(request.due_date), 'MMM d') : '—'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                </div>
              </Link>
            ))}
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