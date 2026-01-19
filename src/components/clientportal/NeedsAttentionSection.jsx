import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  AlertCircle, 
  MessageSquareText, 
  Bell, 
  CheckCircle2, 
  ChevronRight,
  FolderKanban,
  Clock
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatDistanceToNow } from "date-fns";

/**
 * Attention Badge Types:
 * - changes_requested: 🔴 Client requested changes
 * - client_replied: 🟡 Client commented
 * - new_activity: 🔵 New activity since AK viewed
 * - client_approved: 🟢 Approved but not archived
 */
export const getAttentionType = (request, comments, decisions, attachments) => {
  const lastInternalView = request.last_viewed_by_internal_at 
    ? new Date(request.last_viewed_by_internal_at) 
    : null;
  const postedAt = request.posted_at ? new Date(request.posted_at) : null;

  // Check for changes requested decision (highest priority)
  const hasChangesRequested = decisions.some(d => {
    if (d.request_id !== request.id) return false;
    if (d.decision !== 'changes_requested') return false;
    // Only count if after last internal view or if never viewed
    if (lastInternalView && d.created_date) {
      return new Date(d.created_date) > lastInternalView;
    }
    return true;
  });
  if (hasChangesRequested) return 'changes_requested';

  // Check for client comments after last internal view
  const hasNewClientComments = comments.some(c => {
    if (c.request_id !== request.id) return false;
    if (c.author_type !== 'client_contact') return false;
    const commentDate = c.posted_at ? new Date(c.posted_at) : new Date(c.created_date);
    if (lastInternalView) {
      return commentDate > lastInternalView;
    }
    // If never viewed internally, any client comment counts
    return postedAt ? commentDate > postedAt : true;
  });
  if (hasNewClientComments) return 'client_replied';

  // Check for approved but not archived
  const isApproved = request.status === 'approved' || decisions.some(d => 
    d.request_id === request.id && 
    d.decision === 'approved' && 
    d.target_type === 'request'
  );
  if (isApproved && request.status !== 'archived') return 'client_approved';

  // Check for new attachments since last internal view
  const hasNewAttachments = attachments.some(a => {
    if (a.request_id !== request.id) return false;
    if (!lastInternalView) return false;
    return new Date(a.created_date) > lastInternalView;
  });
  if (hasNewAttachments) return 'new_activity';

  // Check for any activity since last internal view
  if (lastInternalView) {
    const requestUpdated = request.updated_date && new Date(request.updated_date) > lastInternalView;
    if (requestUpdated) return 'new_activity';
  }

  return null;
};

export const AttentionBadge = ({ type, size = 'sm' }) => {
  if (!type) return null;

  const configs = {
    changes_requested: {
      icon: AlertCircle,
      label: 'Changes Requested',
      className: 'bg-red-500/20 text-red-400 border-red-500/50'
    },
    client_replied: {
      icon: MessageSquareText,
      label: 'Client Replied',
      className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
    },
    new_activity: {
      icon: Bell,
      label: 'New Activity',
      className: 'bg-blue-500/20 text-blue-400 border-blue-500/50'
    },
    client_approved: {
      icon: CheckCircle2,
      label: 'Client Approved',
      className: 'bg-green-500/20 text-green-400 border-green-500/50'
    }
  };

  const config = configs[type];
  if (!config) return null;

  const Icon = config.icon;
  const isSmall = size === 'sm';

  return (
    <Badge className={`${config.className} flex items-center gap-1 ${isSmall ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1'}`}>
      <Icon className={isSmall ? 'w-3 h-3' : 'w-4 h-4'} />
      {!isSmall && config.label}
    </Badge>
  );
};

export const getAttentionPriority = (type) => {
  const priorities = {
    changes_requested: 1,
    client_replied: 2,
    new_activity: 3,
    client_approved: 4
  };
  return priorities[type] || 99;
};

export default function NeedsAttentionSection({ 
  requests, 
  projects, 
  comments, 
  decisions, 
  attachments 
}) {
  // Get all requests that need attention
  const needsAttention = requests
    .filter(r => r.status !== 'draft' && r.status !== 'archived')
    .map(request => {
      const attentionType = getAttentionType(request, comments, decisions, attachments);
      if (!attentionType) return null;
      
      const project = projects.find(p => p.id === request.project_id);
      
      // Get last client comment date
      const clientComments = comments.filter(c => 
        c.request_id === request.id && c.author_type === 'client_contact'
      ).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      const lastClientComment = clientComments[0];
      
      // Get comment count
      const commentCount = clientComments.length;

      return {
        ...request,
        attentionType,
        project,
        lastClientComment,
        commentCount
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Sort by attention priority first
      const priorityDiff = getAttentionPriority(a.attentionType) - getAttentionPriority(b.attentionType);
      if (priorityDiff !== 0) return priorityDiff;
      // Then by most recent activity
      return new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date);
    });

  if (needsAttention.length === 0) return null;

  // Split into two groups: Action Required vs Pending Closure
  const actionRequired = needsAttention.filter(r => 
    r.attentionType === 'changes_requested' || r.attentionType === 'client_replied'
  );
  const pendingClosure = needsAttention.filter(r => 
    r.attentionType === 'client_approved' || r.attentionType === 'new_activity'
  );

  const RequestCard = ({ request, isDeemphasized = false }) => (
    <Link
      key={request.id}
      to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&tab=attention`}
      className={`block p-2 md:p-3 rounded-lg border transition-all group min-h-[44px] ${
        isDeemphasized 
          ? 'bg-black/20 border-gray-800 hover:border-green-500/30 hover:bg-gray-900/50 opacity-80' 
          : 'bg-black/40 border-gray-700 hover:border-red-500/50 hover:bg-gray-900/80'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5 md:mb-2">
        <AttentionBadge type={request.attentionType} size="md" />
        {request.commentCount > 0 && (
          <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
            <MessageSquareText className="w-3 h-3 mr-1" />
            {request.commentCount}
          </Badge>
        )}
      </div>
      
      <h4 className={`font-medium text-sm mb-1 line-clamp-1 md:line-clamp-2 transition-colors ${
        isDeemphasized 
          ? 'text-gray-300 group-hover:text-green-400' 
          : 'text-white group-hover:text-red-400'
      }`}>
        {request.title}
      </h4>
      
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1 md:mb-2">
        <FolderKanban className="w-3 h-3 shrink-0" />
        <span className="truncate">{request.project?.name || 'Unknown Project'}</span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex flex-col gap-0.5">
          {request.attentionType === 'client_approved' && (
            <span className="text-green-400/70 italic hidden md:block">
              Awaiting AK confirmation
            </span>
          )}
          {request.lastClientComment && request.attentionType !== 'client_approved' && (
            <span className="text-yellow-400 truncate">
              <span className="hidden md:inline">Client replied </span>{formatDistanceToNow(new Date(request.lastClientComment.created_date), { addSuffix: true })}
            </span>
          )}
          <span className="hidden md:block text-gray-500">
            {request.last_viewed_by_internal_at && (
              <>AK reviewed {formatDistanceToNow(new Date(request.last_viewed_by_internal_at), { addSuffix: true })}</>
            )}
          </span>
        </div>
        <ChevronRight className={`w-4 h-4 transition-colors shrink-0 ${
          isDeemphasized 
            ? 'text-gray-600 group-hover:text-green-400' 
            : 'text-gray-500 group-hover:text-red-400'
        }`} />
      </div>
    </Link>
  );

  return (
    <Card className="bg-gradient-to-r from-red-950/40 to-orange-950/40 backdrop-blur-xl border-2 border-red-500/50 shadow-lg shadow-red-900/20">
      <CardHeader className="border-b border-red-500/30 p-3 md:p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="p-1.5 md:p-2 bg-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-red-400" />
            </div>
            <div>
              <CardTitle className="text-base md:text-lg text-red-400">
                🚨 Needs Attention
              </CardTitle>
              <p className="text-xs text-gray-400 hidden md:block">
                Items clear once reviewed or archived
              </p>
            </div>
          </div>
          <Badge className="bg-red-500/20 text-red-400 border-red-500/50 text-base md:text-lg px-2 md:px-3 py-0.5 md:py-1">
            {needsAttention.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 md:p-4 space-y-3 md:space-y-4">
        {/* Action Required Section */}
        {actionRequired.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 md:mb-3">
              <div className="h-px flex-1 bg-red-500/30" />
              <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                Action Required ({actionRequired.length})
              </span>
              <div className="h-px flex-1 bg-red-500/30" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {actionRequired.slice(0, 6).map(request => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
            {actionRequired.length > 6 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                +{actionRequired.length - 6} more action items
              </p>
            )}
          </div>
        )}

        {/* Pending Closure Section */}
        {pendingClosure.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 md:mb-3">
              <div className="h-px flex-1 bg-green-500/20" />
              <span className="text-xs font-semibold text-green-400/70 uppercase tracking-wider">
                Pending Closure ({pendingClosure.length})
              </span>
              <div className="h-px flex-1 bg-green-500/20" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {pendingClosure.slice(0, 3).map(request => (
                <RequestCard key={request.id} request={request} isDeemphasized />
              ))}
            </div>
            {pendingClosure.length > 3 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                +{pendingClosure.length - 3} more pending closure
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}