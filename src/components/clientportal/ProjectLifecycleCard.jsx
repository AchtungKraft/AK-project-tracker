import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FolderKanban, 
  ChevronDown, 
  ChevronRight,
  Eye,
  Send,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import LifecycleBucketSection, { LifecycleSummaryBadges } from "./LifecycleBucketSection";
import RecentlyApprovedStrip from "./RecentlyApprovedStrip";

export default function ProjectLifecycleCard({
  project,
  buckets,
  getProjectClientSlug,
  onSendBulkEmail,
  sendingEmailForProject,
  onUpdateDueDate,
  initialCollapsed = false
}) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  
  // Count requests per bucket
  const counts = {
    draft: buckets.draft?.length || 0,
    awaiting_client: buckets.awaiting_client?.length || 0,
    client_replied: buckets.client_replied?.length || 0,
    recently_approved: buckets.recently_approved?.length || 0,
    approved: buckets.approved?.length || 0
  };
  
  const totalRequests = counts.draft + counts.awaiting_client + counts.client_replied + counts.approved;
  
  // Determine if project has items needing attention (for visual priority)
  const hasAttentionItems = counts.client_replied > 0 || 
    buckets.awaiting_client?.some(r => r.due_date && new Date(r.due_date) < new Date());
  
  return (
    <Card className={`backdrop-blur-xl border-2 shadow-lg ${
      hasAttentionItems 
        ? 'bg-gradient-to-r from-red-950/30 to-gray-900/50 border-red-500/40' 
        : 'bg-black/40 border-gray-700'
    }`}>
      {/* Project Header */}
      <CardHeader 
        className={`border-b p-4 cursor-pointer select-none ${
          hasAttentionItems ? 'border-red-500/30' : 'border-gray-700'
        }`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Collapse Toggle */}
            <button className="p-1 hover:bg-gray-800 rounded transition-colors shrink-0">
              {isCollapsed ? (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
            
            {/* Project Icon */}
            <div className={`p-2 rounded-lg shrink-0 ${
              hasAttentionItems ? 'bg-red-500/20' : 'bg-gray-800'
            }`}>
              <FolderKanban className={`w-5 h-5 ${
                hasAttentionItems ? 'text-red-400' : 'text-gray-400'
              }`} />
            </div>
            
            {/* Project Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Link 
                  to={createPageUrl("ProjectDetail") + "?id=" + project?.id}
                  className="hover:underline"
                  onClick={e => e.stopPropagation()}
                >
                  <h3 className={`font-bold text-lg truncate ${
                    hasAttentionItems ? 'text-red-400' : 'text-white'
                  }`}>
                    {project?.name || 'Unknown Project'}
                  </h3>
                </Link>
                {project?.client_name && (
                  <span className="text-gray-400 text-sm">• {project.client_name}</span>
                )}
              </div>
              
              {/* Client Last Viewed */}
              {project?.client_last_viewed_at && (
                <div className="flex items-center gap-1 text-xs text-cyan-500 mt-0.5">
                  <Eye className="w-3 h-3" />
                  Last viewed: {format(new Date(project.client_last_viewed_at), 'MMM d, h:mm a')}
                </div>
              )}
            </div>
          </div>
          
          {/* Right Side - Summary and Actions */}
          <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
            {/* Lifecycle Summary Badges */}
            <LifecycleSummaryBadges counts={counts} />
            
            {/* Total Count */}
            <Badge variant="outline" className="border-gray-600 text-gray-400">
              {totalRequests} total
            </Badge>
            
            {/* Quick Actions */}
            <div className="hidden md:flex items-center gap-1">
              {/* Send Email Button - only if there are awaiting_client items */}
              {counts.awaiting_client > 0 && onSendBulkEmail && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const requestIds = buckets.awaiting_client.map(r => r.id);
                    onSendBulkEmail(project?.id, requestIds);
                  }}
                  disabled={sendingEmailForProject === project?.id}
                  className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                >
                  {sendingEmailForProject === project?.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              )}
              
              {/* Portal Link */}
              <Link
                to={createPageUrl("ProjectDetail") + `?id=${project?.id}&tab=clientportal&from=hub`}
              >
                <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white">
                  Portal
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </CardHeader>
      
      {/* Lifecycle Buckets - Collapsible */}
      {!isCollapsed && (
        <CardContent className="p-4 space-y-4">
          {/* Draft Section */}
          <LifecycleBucketSection
            bucket="draft"
            requests={buckets.draft || []}
            getProjectClientSlug={getProjectClientSlug}
            onUpdateDueDate={onUpdateDueDate}
          />
          
          {/* Client Replied Section - Priority position */}
          <LifecycleBucketSection
            bucket="client_replied"
            requests={buckets.client_replied || []}
            getProjectClientSlug={getProjectClientSlug}
            onUpdateDueDate={onUpdateDueDate}
          />
          
          {/* Awaiting Client Section */}
          <LifecycleBucketSection
            bucket="awaiting_client"
            requests={buckets.awaiting_client || []}
            getProjectClientSlug={getProjectClientSlug}
            onUpdateDueDate={onUpdateDueDate}
          />
          
          {/* Recently Approved Strip — dedicated elevated section */}
          <RecentlyApprovedStrip
            requests={buckets.recently_approved || []}
            getProjectClientSlug={getProjectClientSlug}
          />
          
          {/* Approved Archive */}
          <LifecycleBucketSection
            bucket="approved"
            requests={buckets.approved || []}
            getProjectClientSlug={getProjectClientSlug}
            onUpdateDueDate={onUpdateDueDate}
          />
          
          {/* Empty State */}
          {totalRequests === 0 && (
            <div className="text-center py-8 text-gray-500">
              No feedback requests for this project
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}