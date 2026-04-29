import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { 
  Wrench, 
  Clock, 
  MessageSquareText, 
  CheckCircle2,
  ChevronRight,
  EyeOff,
  AlertCircle
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { CopyRequestLinkButton } from "./ClientLinksCopyButtons";
import { getRequestTypeInfo } from "./utils";
import { isRequestOverdue, sortOverdueFirst, countOverdue } from "./lifecycleHelpers";
import InlineDueDatePicker, { BulkDueDatePicker } from "./InlineDueDatePicker";

// Lifecycle bucket configurations
export const LIFECYCLE_BUCKETS = {
  draft: {
    key: 'draft',
    label: 'Draft',
    sublabel: 'Internal Only',
    icon: Wrench,
    color: 'slate',
    borderColor: 'border-slate-500/50',
    bgColor: 'bg-slate-500/10',
    textColor: 'text-slate-400',
    badgeClass: 'bg-slate-500/20 text-slate-400 border-slate-500/50'
  },
  awaiting_client: {
    key: 'awaiting_client',
    label: 'Awaiting Client',
    sublabel: 'Waiting for Response',
    icon: Clock,
    color: 'amber',
    borderColor: 'border-amber-500/50',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-400',
    badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/50'
  },
  client_replied: {
    key: 'client_replied',
    label: 'Client Replied',
    sublabel: 'AK Action Needed',
    icon: MessageSquareText,
    color: 'blue',
    borderColor: 'border-blue-500/50',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-400',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/50'
  },
  approved: {
    key: 'approved',
    label: 'Approved',
    sublabel: 'Closed',
    icon: CheckCircle2,
    color: 'green',
    borderColor: 'border-green-500/50',
    bgColor: 'bg-green-500/10',
    textColor: 'text-green-400',
    badgeClass: 'bg-green-500/20 text-green-400 border-green-500/50'
  }
};

// Use centralized type info from utils

// Request card component with overdue visual + inline due date + quick actions
const RequestCard = ({ request, bucket, getProjectClientSlug, onUpdateDueDate }) => {
  const isDraft = bucket === 'draft';
  const overdue = isRequestOverdue(request, bucket);
  
  return (
    <div className={`relative rounded-lg border transition-all group ${
      overdue
        ? 'bg-red-950/20 border-red-500/40 border-l-[3px] border-l-red-500'
        : isDraft 
          ? 'bg-slate-900/30 border-slate-700/50' 
          : 'bg-gray-900/30 border-gray-700/50'
    }`}>
      <Link
        to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&bucket=${bucket}`}
        className="block p-3 hover:bg-gray-800/30 rounded-lg transition-colors"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h4 className="text-white font-medium text-sm line-clamp-2 group-hover:text-red-400 transition-colors">
              {request.title}
            </h4>
            {overdue && (
              <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-semibold uppercase tracking-wide">
                Overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {request.totalCommentCount > 0 && (
              <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs px-1.5">
                <MessageSquareText className="w-3 h-3 mr-1" />
                {request.totalCommentCount}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Type badge */}
        <div className="flex items-center gap-2 mb-2">
          <Badge className={`${getRequestTypeInfo(request.request_type).color} text-xs`}>
            {getRequestTypeInfo(request.request_type).label}
          </Badge>
          {isDraft && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <EyeOff className="w-3 h-3" />
              Not visible to client
            </span>
          )}
        </div>
        
        {/* Context info */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex flex-col gap-0.5 text-gray-400">
            {bucket === 'awaiting_client' && request.posted_at && (
              <span className="text-amber-400/70">
                Sent {formatDistanceToNow(new Date(request.posted_at), { addSuffix: true })}
              </span>
            )}
            {bucket === 'client_replied' && request.lastClientComment && (
              <span className="text-blue-400">
                Replied {formatDistanceToNow(new Date(request.lastClientComment.created_date), { addSuffix: true })}
              </span>
            )}
            {isDraft && (
              <span className="text-slate-500">
                Created {formatDistanceToNow(new Date(request.created_date), { addSuffix: true })}
              </span>
            )}
          </div>
          
          {/* Quick Action Row */}
          <div className="flex items-center gap-1" onClick={e => e.preventDefault()}>
            {!isDraft && onUpdateDueDate && (
              <InlineDueDatePicker
                dueDate={request.due_date}
                isOverdue={overdue}
                onDateChange={(date) => onUpdateDueDate(request.id, date)}
              />
            )}
            {!isDraft && (
              <CopyRequestLinkButton 
                slug={getProjectClientSlug(request.project_id)} 
                requestId={request.id} 
              />
            )}
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-red-400 transition-colors" />
          </div>
        </div>
      </Link>
    </div>
  );
};

// Lifecycle bucket section within a project
export default function LifecycleBucketSection({ 
  bucket, 
  requests, 
  getProjectClientSlug,
  onUpdateDueDate,
  defaultCollapsed = false 
}) {
  const config = LIFECYCLE_BUCKETS[bucket];
  const Icon = config.icon;
  
  // Overdue-first sorting inside each bucket
  const sortedRequests = useMemo(() => {
    return sortOverdueFirst(requests, bucket);
  }, [requests, bucket]);
  
  const overdueCount = useMemo(() => countOverdue(requests, bucket), [requests, bucket]);
  
  if (requests.length === 0) return null;

  const handleBulkDateChange = async (date) => {
    if (!onUpdateDueDate) return;
    await Promise.all(requests.map(r => onUpdateDueDate(r.id, date)));
  };
  
  return (
    <div className={`rounded-lg border ${config.borderColor} overflow-hidden`}>
      {/* Bucket Header */}
      <div className={`px-3 py-2 ${config.bgColor} border-b ${config.borderColor} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${config.textColor}`} />
          <span className={`font-medium text-sm ${config.textColor}`}>{config.label}</span>
          <span className="text-xs text-gray-500">
            {requests.length}{overdueCount > 0 && (
              <span className="text-red-400 ml-1">
                · {overdueCount} overdue
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk Due Date Picker */}
          {onUpdateDueDate && bucket !== 'approved' && (
            <BulkDueDatePicker
              requestCount={requests.length}
              onBulkDateChange={handleBulkDateChange}
            />
          )}
          <Badge className={config.badgeClass}>
            {requests.length}
          </Badge>
        </div>
      </div>
      
      {/* Request Cards */}
      <div className="p-2 space-y-2 bg-black/20">
        {sortedRequests.map(request => (
          <RequestCard 
            key={request.id} 
            request={request} 
            bucket={bucket}
            getProjectClientSlug={getProjectClientSlug}
            onUpdateDueDate={onUpdateDueDate}
          />
        ))}
      </div>
    </div>
  );
}

// Compact count badge for project header summary
export function LifecycleSummaryBadges({ counts }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {counts.draft > 0 && (
        <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/50 text-xs">
          <Wrench className="w-3 h-3 mr-1" />
          {counts.draft}
        </Badge>
      )}
      {counts.awaiting_client > 0 && (
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/50 text-xs">
          <Clock className="w-3 h-3 mr-1" />
          {counts.awaiting_client}
        </Badge>
      )}
      {counts.client_replied > 0 && (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50 text-xs">
          <MessageSquareText className="w-3 h-3 mr-1" />
          {counts.client_replied}
        </Badge>
      )}
      {counts.approved > 0 && (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/50 text-xs">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          {counts.approved}
        </Badge>
      )}
    </div>
  );
}