import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { 
  Wrench, 
  Clock, 
  MessageSquareText, 
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RequestCard } from "./LifecycleBucketSection";
import BucketProjectGroup from "./BucketProjectGroup";
import { isRequestOverdue, sortOverdueFirst, countOverdue, RECENTLY_APPROVED_WINDOW_HOURS } from "./lifecycleHelpers";
import { LIFECYCLE_BUCKETS } from "./LifecycleBucketSection";
import RecentlyApprovedStrip from "./RecentlyApprovedStrip";

/**
 * Aggregate all requests from all project groups into a flat bucket map,
 * enriching each request with its project name.
 */
function aggregateBuckets(filteredProjectData, projects) {
  const projectMap = new Map((projects || []).map(p => [p.id, p]));
  const buckets = {
    draft: [],
    awaiting_client: [],
    client_replied: [],
    recently_approved: [],
    approved: [],
  };

  for (const group of filteredProjectData) {
    const pName = group.project?.name || 'Unknown Project';
    const pId = group.project?.id || 'unknown';
    
    for (const [bucketKey, requests] of Object.entries(buckets)) {
      const groupRequests = group[bucketKey] || [];
      for (const r of groupRequests) {
        buckets[bucketKey].push({ ...r, _projectName: pName, _projectId: pId });
      }
    }
  }
  return buckets;
}

/**
 * Group requests by project, preserving sort order.
 */
function groupByProject(requests) {
  const map = new Map();
  for (const r of requests) {
    const pid = r._projectId || r.project_id || 'unknown';
    if (!map.has(pid)) {
      map.set(pid, { 
        projectId: pid, 
        projectName: r._projectName || 'Unknown Project', 
        requests: [] 
      });
    }
    map.get(pid).requests.push(r);
  }
  // Sort groups: most requests first, then alphabetical
  return Array.from(map.values()).sort((a, b) => {
    // Groups with overdue requests first
    const aOverdue = a.requests.some(r => r.isOverdue);
    const bOverdue = b.requests.some(r => r.isOverdue);
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return b.requests.length - a.requests.length;
  });
}

/**
 * A single workflow column with project grouping.
 * Auto-collapses groups with >1 request; shows "+X more" for >2.
 */
function WorkflowColumn({ 
  bucketKey, 
  requests, 
  getProjectClientSlug, 
  onUpdateDueDate 
}) {
  const config = LIFECYCLE_BUCKETS[bucketKey];
  const groups = useMemo(() => groupByProject(requests), [requests]);
  const overdueCount = useMemo(() => countOverdue(requests, bucketKey), [requests, bucketKey]);

  if (!config || requests.length === 0) return null;

  const Icon = config.icon;

  return (
    <div className={`rounded-lg border ${config.borderColor} overflow-hidden`}>
      {/* Column Header */}
      <div className={`px-3 py-2 ${config.bgColor} border-b ${config.borderColor} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${config.textColor}`} />
          <span className={`font-medium text-sm ${config.textColor}`}>{config.label}</span>
          <span className={`font-medium text-sm ${config.textColor}`}>
            {config.sublabel && (
              <span className="text-xs text-gray-500 font-normal ml-1 hidden lg:inline">{config.sublabel}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {overdueCount > 0 && (
            <span className="text-[10px] text-red-400 flex items-center gap-0.5">
              <AlertCircle className="w-3 h-3" />
              {overdueCount}
            </span>
          )}
          <Badge className={config.badgeClass}>
            {requests.length}
          </Badge>
        </div>
      </div>

      {/* Project Groups */}
      <div className="p-2 space-y-2 bg-black/20">
        {groups.map(group => (
          <BucketProjectGroup
            key={group.projectId}
            projectName={group.projectName}
            projectId={group.projectId}
            requests={group.requests}
            bucket={bucketKey}
            autoCollapse={group.requests.length > 1}
            maxVisible={2}
          >
            {group.requests.map(request => (
              <RequestCard
                key={request.id}
                request={request}
                bucket={bucketKey}
                getProjectClientSlug={getProjectClientSlug}
                onUpdateDueDate={onUpdateDueDate}
              />
            ))}
          </BucketProjectGroup>
        ))}
      </div>
    </div>
  );
}

/**
 * Flat column rendering for outer buckets (draft, approved) — no project grouping needed.
 */
function FlatColumn({ 
  bucketKey, 
  requests, 
  getProjectClientSlug, 
  onUpdateDueDate,
  projects 
}) {
  const config = LIFECYCLE_BUCKETS[bucketKey];
  const [expanded, setExpanded] = useState(bucketKey !== 'approved');
  const overdueCount = useMemo(() => countOverdue(requests, bucketKey), [requests, bucketKey]);
  const sorted = useMemo(() => sortOverdueFirst(requests, bucketKey), [requests, bucketKey]);

  if (!config || requests.length === 0) return null;

  const Icon = config.icon;
  
  return (
    <div className={`rounded-lg border ${config.borderColor} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className={`w-full px-3 py-2 ${config.bgColor} border-b ${config.borderColor} flex items-center justify-between`}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
          <Icon className={`w-4 h-4 ${config.textColor}`} />
          <span className={`font-medium text-sm ${config.textColor}`}>{config.label}</span>
          <span className="text-xs text-gray-500">
            {requests.length}{overdueCount > 0 && (
              <span className="text-red-400 ml-1">· {overdueCount} overdue</span>
            )}
          </span>
        </div>
        <Badge className={config.badgeClass}>{requests.length}</Badge>
      </button>
      
      {expanded && (
        <div className="p-2 space-y-2 bg-black/20 max-h-[60vh] overflow-y-auto">
          {sorted.map(request => (
            <RequestCard
              key={request.id}
              request={request}
              bucket={bucketKey}
              getProjectClientSlug={getProjectClientSlug}
              onUpdateDueDate={onUpdateDueDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}


/**
 * ColumnBoardView — renders workflow columns side-by-side,
 * grouping requests by project within each column.
 */
export default function ColumnBoardView({
  filteredProjectData,
  projects,
  getProjectClientSlug,
  onUpdateDueDate,
  lifecycleQuickFilter,
}) {
  const buckets = useMemo(
    () => aggregateBuckets(filteredProjectData, projects),
    [filteredProjectData, projects]
  );

  const hasAny = Object.values(buckets).some(arr => arr.length > 0);
  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {/* Global Recently Approved Strip */}
      {lifecycleQuickFilter === 'all' && buckets.recently_approved.length > 0 && (
        <RecentlyApprovedStrip
          requests={buckets.recently_approved}
          getProjectClientSlug={getProjectClientSlug}
        />
      )}

      {/* Drafts — flat, collapsible */}
      <FlatColumn
        bucketKey="draft"
        requests={buckets.draft}
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        projects={projects}
      />

      {/* Middle workflow columns — project-grouped */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WorkflowColumn
          bucketKey="client_replied"
          requests={buckets.client_replied}
          getProjectClientSlug={getProjectClientSlug}
          onUpdateDueDate={onUpdateDueDate}
        />
        <WorkflowColumn
          bucketKey="awaiting_client"
          requests={buckets.awaiting_client}
          getProjectClientSlug={getProjectClientSlug}
          onUpdateDueDate={onUpdateDueDate}
        />
      </div>

      {/* Recently Approved (if not shown in strip above) */}
      {lifecycleQuickFilter !== 'all' && buckets.recently_approved.length > 0 && (
        <WorkflowColumn
          bucketKey="recently_approved"
          requests={buckets.recently_approved}
          getProjectClientSlug={getProjectClientSlug}
          onUpdateDueDate={onUpdateDueDate}
        />
      )}

      {/* Approved Archive — flat, collapsed by default */}
      <FlatColumn
        bucketKey="approved"
        requests={buckets.approved}
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        projects={projects}
      />
    </div>
  );
}