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
  Clock,
  Hourglass
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatDistanceToNow } from "date-fns";
import { getReviewOwnership, getOwnershipSortPriority } from "./reviewOwnership";

/**
 * Attention Badge Types (derived from Review Ownership):
 * - changes_requested: 🔴 Client requested changes
 * - client_replied: 🟡 Client commented
 * - overdue: 🔴 Past due date
 * - new_activity: 🔵 New activity since AK viewed
 * - client_approved: 🟢 Approved but not archived
 */
export const getAttentionType = (request, comments, decisions, attachments) => {
  const ownership = getReviewOwnership(request, comments, decisions, attachments);
  
  // Map ownership reasons to attention types
  if (ownership.ownership === 'ak_needs_review') {
    if (ownership.reason === 'overdue') return 'overdue';
    if (ownership.reason === 'changes_requested') return 'changes_requested';
    if (ownership.reason === 'client_replied') return 'client_replied';
    if (ownership.reason === 'design_review_pending') return 'changes_requested';
    if (ownership.reason === 'never_viewed' || ownership.reason === 'new_activity') return 'new_activity';
  }
  
  // Check for approved but not archived (still needs internal closure)
  if (ownership.ownership === 'done' && ownership.reason === 'approved') {
    return 'client_approved';
  }
  
  // Check for approved via decisions but status not yet updated
  const isApproved = decisions.some(d => 
    d.request_id === request.id && 
    d.decision === 'approved' && 
    d.target_type === 'request'
  );
  if (isApproved && request.status !== 'archived' && request.status !== 'approved') {
    return 'client_approved';
  }
  
  return null;
};

export const AttentionBadge = ({ type, size = 'sm' }) => {
  if (!type) return null;

  const configs = {
    overdue: {
      icon: Clock,
      label: 'Overdue',
      className: 'bg-red-600/30 text-red-300 border-red-500/50'
    },
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

/**
 * Ownership Badge - shows who owns the next action
 */
export const OwnershipBadge = ({ ownership, reason, size = 'sm' }) => {
  const isSmall = size === 'sm';
  
  if (ownership === 'ak_needs_review') {
    return (
      <Badge className={`bg-red-500/20 text-red-400 border-red-500/50 flex items-center gap-1 ${isSmall ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1'}`}>
        <AlertCircle className={isSmall ? 'w-3 h-3' : 'w-4 h-4'} />
        {!isSmall && 'AK Needs Review'}
      </Badge>
    );
  }
  
  if (ownership === 'waiting_on_client') {
    return (
      <Badge className={`bg-gray-500/20 text-gray-400 border-gray-500/50 flex items-center gap-1 ${isSmall ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1'}`}>
        <Hourglass className={isSmall ? 'w-3 h-3' : 'w-4 h-4'} />
        {!isSmall && 'Waiting on Client'}
      </Badge>
    );
  }
  
  return null;
};

export const getAttentionPriority = (type) => {
  const priorities = {
    overdue: 0,
    changes_requested: 1,
    client_replied: 2,
    new_activity: 3,
    client_approved: 4
  };
  return priorities[type] ?? 99;
};

export default function NeedsAttentionSection({ 
  requests, 
  projects, 
  comments, 
  decisions, 
  attachments 
}) {
  // Simplified attention logic:
  // 1. Client replied (needs AK action)
  // 2. Overdue awaiting_client items
  // NEVER include drafts
  
  const needsAttention = requests
    .filter(r => r.status !== 'draft' && r.status !== 'archived')
    .map(request => {
      const project = projects.find(p => p.id === request.project_id);
      
      // Get last client comment date
      const clientComments = comments.filter(c => 
        c.request_id === request.id && c.author_type === 'client_contact'
      ).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      const lastClientComment = clientComments[0];
      const commentCount = clientComments.length;
      
      // Check if client has replied since last post
      let hasClientReplied = false;
      if (request.posted_at && lastClientComment) {
        const postedAt = new Date(request.posted_at);
        const commentDate = lastClientComment.posted_at 
          ? new Date(lastClientComment.posted_at) 
          : new Date(lastClientComment.created_date);
        hasClientReplied = commentDate > postedAt;
      }
      
      // Check if overdue and awaiting client
      const isOverdue = request.due_date && new Date(request.due_date) < new Date();
      const isAwaitingClient = request.posted_at && !hasClientReplied;
      
      // Only include if:
      // 1. Client replied (needs AK action)
      // 2. Overdue and awaiting client
      if (!hasClientReplied && !(isOverdue && isAwaitingClient)) {
        return null;
      }
      
      // Determine attention type
      let attentionType = null;
      if (hasClientReplied) {
        attentionType = 'client_replied';
      } else if (isOverdue) {
        attentionType = 'overdue';
      }

      return {
        ...request,
        attentionType,
        project,
        lastClientComment,
        commentCount,
        hasClientReplied,
        isOverdue
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Client replied items first (more urgent)
      if (a.hasClientReplied && !b.hasClientReplied) return -1;
      if (!a.hasClientReplied && b.hasClientReplied) return 1;
      
      // Then by due date for overdue items
      if (a.isOverdue && b.isOverdue) {
        return new Date(a.due_date) - new Date(b.due_date);
      }
      
      // Then by most recent activity
      return new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date);
    });

  if (needsAttention.length === 0) return null;

  // Split into two groups: Client Replied vs Overdue
  const clientReplied = needsAttention.filter(r => r.hasClientReplied);
  const overdueItems = needsAttention.filter(r => !r.hasClientReplied && r.isOverdue);

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
          {request.attentionType !== 'client_approved' && (() => {
            const postedAt = request.posted_at ? new Date(request.posted_at) : null;
            const isOverdue = request.attentionType === 'overdue';
            const lastCommentDate = request.lastClientComment ? 
              (request.lastClientComment.posted_at ? new Date(request.lastClientComment.posted_at) : new Date(request.lastClientComment.created_date)) : null;
            const isCommentAfterPosted = lastCommentDate && postedAt && lastCommentDate > postedAt;
            
            // Priority: Overdue without recent client activity > Client activity after posted_at > Waiting
            if (isOverdue && !isCommentAfterPosted) {
              return (
                <span className="text-red-400 truncate">
                  {postedAt ? (
                    <><span className="hidden md:inline">Sent </span>{formatDistanceToNow(postedAt, { addSuffix: true })}, awaiting response</>
                  ) : 'Overdue — awaiting response'}
                </span>
              );
            }
            
            if (isCommentAfterPosted) {
              return (
                <span className="text-yellow-400 truncate">
                  <span className="hidden md:inline">Client replied </span>{formatDistanceToNow(lastCommentDate, { addSuffix: true })}
                </span>
              );
            }
            
            if (request.ownership?.ownership === 'waiting_on_client' && postedAt) {
              return (
                <span className="text-gray-400 truncate">
                  <span className="hidden md:inline">Sent to client </span>{formatDistanceToNow(postedAt, { addSuffix: true })}
                </span>
              );
            }
            
            return null;
          })()}
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
      <CardHeader className="border-b border-red-500/30 px-3 py-2 md:p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 md:p-2 bg-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-red-400" />
            </div>
            <CardTitle className="text-sm md:text-lg text-red-400">
              🚨 Needs Attention
            </CardTitle>
          </div>
          <Badge className="bg-red-500/20 text-red-400 border-red-500/50 text-sm md:text-lg px-2 py-0.5 md:py-1">
            {needsAttention.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-2 md:p-4 space-y-2 md:space-y-4">
        {/* Client Replied Section - Most Urgent */}
        {clientReplied.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-blue-500/30" />
              <span className="text-[10px] md:text-xs font-semibold text-blue-400 uppercase tracking-wider whitespace-nowrap">
                Client Replied ({clientReplied.length})
              </span>
              <div className="h-px flex-1 bg-blue-500/30" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {clientReplied.slice(0, 6).map(request => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
            {clientReplied.length > 6 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                +{clientReplied.length - 6} more client replies
              </p>
            )}
          </div>
        )}

        {/* Overdue Items Section */}
        {overdueItems.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-red-500/30" />
              <span className="text-[10px] md:text-xs font-semibold text-red-400 uppercase tracking-wider whitespace-nowrap">
                Overdue ({overdueItems.length})
              </span>
              <div className="h-px flex-1 bg-red-500/30" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {overdueItems.slice(0, 3).map(request => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
            {overdueItems.length > 3 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                +{overdueItems.length - 3} more overdue items
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}