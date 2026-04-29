import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AlertCircle, 
  MessageSquareText, 
  CheckCircle2, 
  ChevronRight,
  FolderKanban,
  Clock
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatDistanceToNow } from "date-fns";
import { groupAttentionByType, ATTENTION_BADGE_CONFIG } from "./attentionHelpers";
import InlineDueDatePicker from "./InlineDueDatePicker";

/**
 * Attention Badge Component
 */
const AttentionBadge = ({ type, size = 'sm' }) => {
  const config = ATTENTION_BADGE_CONFIG[type];
  if (!config) return null;

  const iconMap = {
    client_replied: MessageSquareText,
    overdue: Clock,
    approved_recent: CheckCircle2,
    archived_response: AlertCircle
  };
  const Icon = iconMap[type] || AlertCircle;
  const isSmall = size === 'sm';

  return (
    <Badge className={`${config.bgClass} ${config.textClass} ${config.borderClass} flex items-center gap-1 ${isSmall ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1'}`}>
      <Icon className={isSmall ? 'w-3 h-3' : 'w-4 h-4'} />
      {!isSmall && config.label}
    </Badge>
  );
};

/**
 * Individual Request Card — with overdue visual treatment + inline due date picker
 */
const RequestCard = ({ item, isDeemphasized = false, onUpdateDueDate }) => {
  const { request, project, type, isOverdue } = item;
  
  return (
    <div className={`relative rounded-lg border transition-all group min-h-[44px] ${
      isOverdue
        ? 'bg-red-950/20 border-red-500/40 border-l-[3px] border-l-red-500'
        : isDeemphasized 
          ? 'bg-black/20 border-gray-800 hover:border-green-500/30 hover:bg-gray-900/50 opacity-80' 
          : 'bg-black/40 border-gray-700 hover:border-red-500/50 hover:bg-gray-900/80'
    }`}>
      <Link
        to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&tab=attention`}
        className="block p-2 md:p-3 hover:bg-gray-800/30 rounded-lg transition-colors"
      >
        <div className="flex items-start justify-between gap-2 mb-1.5 md:mb-2">
          <div className="flex items-center gap-2">
            <AttentionBadge type={type} size="md" />
            {isOverdue && type !== 'overdue' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-semibold uppercase tracking-wide">
                Overdue
              </span>
            )}
          </div>
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
          <span className="truncate">{project?.name || 'Unknown Project'}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex flex-col gap-0.5">
            {type === 'approved_recent' && (
              <span className="text-green-400/70 italic hidden md:block">
                Approved — confirm closure
              </span>
            )}
            {type === 'client_replied' && (
              <span className="text-blue-400 truncate">
                {request.updated_date && (
                  <>Client activity {formatDistanceToNow(new Date(request.updated_date), { addSuffix: true })}</>
                )}
              </span>
            )}
            {type === 'overdue' && (
              <span className="text-red-400 truncate">
                {request.due_date && (
                  <>Due {formatDistanceToNow(new Date(request.due_date), { addSuffix: true })}</>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1" onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
            {onUpdateDueDate && (
              <InlineDueDatePicker
                dueDate={request.due_date}
                isOverdue={isOverdue}
                onDateChange={(date) => onUpdateDueDate(request.id, date)}
              />
            )}
            <ChevronRight className={`w-4 h-4 transition-colors shrink-0 ${
              isDeemphasized 
                ? 'text-gray-600 group-hover:text-green-400' 
                : 'text-gray-500 group-hover:text-red-400'
            }`} />
          </div>
        </div>
      </Link>
    </div>
  );
};

/**
 * Section Header
 */
const SectionHeader = ({ label, count, colorClass }) => (
  <div className="flex items-center gap-2 mb-2">
    <div className={`h-px flex-1 ${colorClass}`} />
    <span className={`text-[10px] md:text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${colorClass.replace('bg-', 'text-').replace('/30', '')}`}>
      {label} ({count})
    </span>
    <div className={`h-px flex-1 ${colorClass}`} />
  </div>
);

/**
 * NeedsAttentionSection - Actor-Driven Architecture
 * Uses requiresTeamAction from enrichRequest (not lifecycle buckets)
 */
const NeedsAttentionSection = ({ 
  projectGroups,
  lifecycleQuickFilter = 'all',
  onUpdateDueDate
}) => {
  // Build attention list from requiresTeamAction flag (actor-driven, not lifecycle-driven)
  const attentionItems = useMemo(() => {
    // Flatten all requests from all buckets
    const flatRequests = projectGroups.flatMap(pg => [
      ...pg.draft,
      ...pg.awaiting_client,
      ...pg.client_replied,
      ...pg.approved
    ]);

    // Filter by requiresTeamAction (canonical attention rule)
    const items = flatRequests
      .filter(r => r.requiresTeamAction)
      .map(r => {
        // Determine display type for sectioning
        let type = 'client_replied';
        if (r.isArchivedWithClientResponse) {
          type = 'archived_response';
        } else if (r.isOverdue && r.latestActivityActor !== 'client') {
          type = 'overdue';
        } else if (r.status === 'approved') {
          type = 'approved_recent';
        }

        return {
          request: r,
          project: projectGroups.find(pg => pg.project?.id === r.project_id)?.project,
          type,
          isOverdue: r.isOverdue
        };
      });

    // Sort by priority: client_replied > overdue > approved_recent
    const priorityOrder = { client_replied: 1, overdue: 2, approved_recent: 3 };
    return items.sort((a, b) => {
      const priorityDiff = priorityOrder[a.type] - priorityOrder[b.type];
      if (priorityDiff !== 0) return priorityDiff;
      // Secondary: most recent activity first
      return new Date(b.request.latestActivityAt || b.request.updated_date) - 
             new Date(a.request.latestActivityAt || a.request.updated_date);
    });
  }, [projectGroups]);

  // Group by type for sectioned display
  const groupedAttention = useMemo(() => {
    return groupAttentionByType(attentionItems);
  }, [attentionItems]);

  // Don't render if no attention items
  if (attentionItems.length === 0) return null;

  const { client_replied, overdue, archived_response, approved_recent } = groupedAttention;

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
            {attentionItems.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-2 md:p-4 space-y-2 md:space-y-4">
        {/* Client Replied Section - Most Urgent */}
        {client_replied.length > 0 && (
          <div>
            <SectionHeader 
              label="Client Replied" 
              count={client_replied.length} 
              colorClass="bg-blue-500/30" 
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {client_replied.map(item => (
                <RequestCard key={item.request.id} item={item} onUpdateDueDate={onUpdateDueDate} />
              ))}
            </div>
          </div>
        )}

        {/* Overdue Items Section */}
        {overdue.length > 0 && (
          <div>
            <SectionHeader 
              label="Overdue" 
              count={overdue.length} 
              colorClass="bg-red-500/30" 
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {overdue.map(item => (
                <RequestCard key={item.request.id} item={item} onUpdateDueDate={onUpdateDueDate} />
              ))}
            </div>
          </div>
        )}

        {/* Archived Responses Section */}
        {archived_response.length > 0 && (
          <div>
            <SectionHeader 
              label="Archived Responses" 
              count={archived_response.length} 
              colorClass="bg-purple-500/30" 
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {archived_response.map(item => (
                <RequestCard key={item.request.id} item={item} onUpdateDueDate={onUpdateDueDate} />
              ))}
            </div>
          </div>
        )}

        {/* Recently Approved Section */}
        {approved_recent.length > 0 && (
          <div>
            <SectionHeader 
              label="Recently Approved" 
              count={approved_recent.length} 
              colorClass="bg-green-500/30" 
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {approved_recent.map(item => (
                <RequestCard key={item.request.id} item={item} isDeemphasized onUpdateDueDate={onUpdateDueDate} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default React.memo(NeedsAttentionSection);