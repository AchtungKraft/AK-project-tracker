import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Users, 
  FolderKanban,
  ChevronRight,
  Loader2,
  Mail,
  Send,
  Menu,
  MessageSquareText,
  LayoutGrid,
  List,
  Eye,
  User,
  X
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ClientPortalAdminTab from "@/components/clientportal/ClientPortalAdminTab";
import ClientPortalListView from "@/components/clientportal/ClientPortalListView";
import NeedsAttentionSection, { getAttentionType, AttentionBadge, getAttentionPriority, OwnershipBadge } from "@/components/clientportal/NeedsAttentionSection";
import { getReviewOwnership, getOwnershipSortPriority, sortByReviewOwnership } from "@/components/clientportal/reviewOwnership";
import { useSavedProjectViews } from "@/components/common/useSavedProjectViews";
import SavedViewsSelector from "@/components/common/SavedViewsSelector";
import { CopyRequestLinkButton } from "@/components/clientportal/ClientLinksCopyButtons";
import { useFilterState, CLIENT_PORTAL_DEFAULTS } from "@/components/common/useFilterState";

// Helper to determine request state
const getRequestState = (request, decisions, attachments) => {
  if (request.status === 'draft') return 'draft';
  if (request.status === 'archived') return 'archived';
  if (request.status === 'approved') return 'approved';
  if (request.status === 'changes_requested') return 'changes_requested';
  
  // Only consider decisions made AFTER the request was last posted
  const postedAt = request.posted_at ? new Date(request.posted_at) : null;
  const requestDecisions = decisions.filter(d => {
    if (d.request_id !== request.id) return false;
    // If we have a posted_at, only count decisions made after that time
    if (postedAt && d.decided_at) {
      return new Date(d.decided_at) > postedAt;
    }
    // Fallback: use created_date if decided_at not available
    if (postedAt && d.created_date) {
      return new Date(d.created_date) > postedAt;
    }
    return true;
  });
  
  const hasApproval = requestDecisions.some(d => d.decision === 'approved' && d.target_type === 'request');
  const hasChangesRequested = requestDecisions.some(d => d.decision === 'changes_requested');
  
  if (hasApproval) return 'approved';
  if (hasChangesRequested) return 'changes_requested';
  
  // For design reviews, check if all images are decided
  if (request.request_type === 'design_review') {
    const imageAttachments = attachments.filter(a => a.request_id === request.id && a.attachment_type === 'image');
    const imageDecisions = requestDecisions.filter(d => d.target_type === 'attachment_image');
    if (imageAttachments.length > 0 && imageDecisions.length >= imageAttachments.length) {
      const allApproved = imageAttachments.every(img => 
        imageDecisions.some(d => d.target_image_url === img.file_url && d.decision === 'approved')
      );
      if (allApproved) return 'approved';
      return 'changes_requested';
    }
  }
  
  return 'awaiting_review';
};

export default function ClientPortalHub() {
  const queryClient = useQueryClient();
  const [sendingEmailForProject, setSendingEmailForProject] = useState(null);

  // Unified filter state with URL/localStorage persistence
  const { filters, setFilter, applyView, clearFilters } = useFilterState('clientportal', CLIENT_PORTAL_DEFAULTS);
  const { selectedTypes, statusFilter, assignedTo, viewMode, tab: activeTab } = filters;

  // Handler for assigned to filter changes
  const handleAssignedToChange = useCallback((newAssigned) => {
    setFilter('assignedTo', newAssigned);
  }, [setFilter]);

  // Saved views hook
  const {
    savedViews,
    activeViewName,
    activeView,
    saveView,
    deleteView,
    renameView,
    selectView,
  } = useSavedProjectViews();

  // Handle saved view selection - apply filters immediately
  const handleSelectView = useCallback((name) => {
    const view = selectView(name);
    if (view) {
      applyView(view);
    }
  }, [selectView, applyView]);

  const handleViewModeChange = useCallback((mode) => {
    setFilter('viewMode', mode);
  }, [setFilter]);

  const handleTabChange = useCallback((tab) => {
    setFilter('tab', tab);
  }, [setFilter]);

  const handleSendBulkEmail = async (projectId, requestIds) => {
    setSendingEmailForProject(projectId);
    try {
      const response = await base44.functions.invoke('sendBulkReviewEmail', { projectId, requestIds });
      if (response.data?.success) {
        toast.success(`Email sent to ${response.data.emailsSent} client(s)`);
        queryClient.invalidateQueries({ queryKey: ["allFeedbackRequests"] });
      } else {
        toast.error(response.data?.error || 'Failed to send email');
      }
    } catch (error) {
      console.error('Error sending bulk email:', error);
      toast.error('Failed to send email');
    } finally {
      setSendingEmailForProject(null);
    }
  };

  // Fetch all data
  const { data: allRequests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ["allFeedbackRequests"],
    queryFn: () => base44.entities.ClientFeedbackRequest.list(),
    refetchOnMount: 'always',
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["allFeedbackDecisions"],
    queryFn: () => base44.entities.ClientFeedbackDecision.list(),
    refetchOnMount: 'always',
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["allFeedbackAttachments"],
    queryFn: () => base44.entities.ClientFeedbackAttachment.list(),
    refetchOnMount: 'always',
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["allFeedbackComments"],
    queryFn: () => base44.entities.ClientFeedbackComment.list(),
    refetchOnMount: 'always',
  });

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: projectClientAccesses = [] } = useQuery({
    queryKey: ["projectClientAccesses"],
    queryFn: () => base44.entities.ProjectClientAccess.list(),
  });

  const { data: clientContacts = [] } = useQuery({
    queryKey: ["clientContacts"],
    queryFn: () => base44.entities.ClientContact.list(),
  });

  // Helper to get primary client slug for a project
  const getProjectClientSlug = (projectId) => {
    const accesses = projectClientAccesses.filter(
      pa => pa.project_id === projectId && pa.access_status === 'active'
    );
    for (const access of accesses) {
      const contact = clientContacts.find(c => c.id === access.client_contact_id);
      if (contact?.url_slug) return contact.url_slug;
      if (access.url_slug) return access.url_slug;
    }
    return null;
  };

  const { data: projectTypes = [] } = useQuery({
    queryKey: ["projectTypes"],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ["statuses"],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["teamMembers"],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active);

  // Get active team members sorted by sort_order for the Assigned To filter
  const activeTeamMembers = useMemo(() => {
    return teamMembers
      .filter(tm => tm.active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [teamMembers]);

  // Categorize requests with attention indicators and review ownership
  const categorizedRequests = useMemo(() => {
    const awaiting = [];
    const changesRequested = [];
    const approved = [];

    allRequests.forEach(request => {
      if (request.status === 'draft' || request.status === 'archived') return;
      
      // Filter by project type, status, and assigned team from saved views
      const project = projects.find(p => p.id === request.project_id);
      if (selectedTypes.length > 0 && project && !selectedTypes.includes(project.project_type_id)) return;
      if (statusFilter !== 'all' && project && project.status_id !== statusFilter) return;
      // Filter by assigned team members (OR logic)
      if (assignedTo.length > 0 && project) {
        const projectTeam = project.assigned_team || [];
        if (!projectTeam.some(memberId => assignedTo.includes(memberId))) return;
      }
      
      const state = getRequestState(request, decisions, attachments);
      
      // Get review ownership (deterministic model)
      const ownership = getReviewOwnership(request, comments, decisions, attachments);
      
      // Count client comments made AFTER the last posted_at (new comments since last review send)
      const postedAt = request.posted_at ? new Date(request.posted_at) : null;
      const newClientComments = comments.filter(c => {
        if (c.request_id !== request.id || c.author_type !== 'client_contact') return false;
        if (!postedAt) return false; // If never posted, no comments are considered "new" yet
        const commentDate = c.posted_at ? new Date(c.posted_at) : new Date(c.created_date);
        return commentDate > postedAt;
      });
      const clientCommentCount = newClientComments.length;
      const hasClientComments = clientCommentCount > 0;
      
      // Get attention type for internal indicators
      const attentionType = getAttentionType(request, comments, decisions, attachments);
      
      // Get last client comment for activity context
      const allClientComments = comments.filter(c => 
        c.request_id === request.id && c.author_type === 'client_contact'
      ).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      const lastClientComment = allClientComments[0];
      const totalCommentCount = allClientComments.length;
      
      const enrichedRequest = { 
        ...request, 
        state, 
        ownership,
        hasClientComments, 
        clientCommentCount,
        attentionType,
        lastClientComment,
        totalCommentCount
      };
      
      if (state === 'approved') {
        approved.push(enrichedRequest);
      } else if (state === 'changes_requested') {
        changesRequested.push(enrichedRequest);
      } else if (state === 'awaiting_review') {
        awaiting.push(enrichedRequest);
      }
    });

    // Sort using the review ownership model
    const sortByOwnership = (a, b) => {
      // First by ownership priority (AK needs review > waiting on client)
      const ownershipPriorityA = getOwnershipSortPriority(a.ownership);
      const ownershipPriorityB = getOwnershipSortPriority(b.ownership);
      if (ownershipPriorityA !== ownershipPriorityB) return ownershipPriorityA - ownershipPriorityB;
      
      // Within same ownership, use attention priority
      const aPriority = a.attentionType ? getAttentionPriority(a.attentionType) : 99;
      const bPriority = b.attentionType ? getAttentionPriority(b.attentionType) : 99;
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      // For AK needs review: most recent activity first
      if (a.ownership.ownership === 'ak_needs_review') {
        return new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date);
      }
      
      // For waiting on client: oldest posted_at first
      if (a.ownership.ownership === 'waiting_on_client') {
        const postedA = a.posted_at ? new Date(a.posted_at) : new Date(a.created_date);
        const postedB = b.posted_at ? new Date(b.posted_at) : new Date(b.created_date);
        return postedA - postedB;
      }
      
      return new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date);
    };

    return { 
      awaiting: awaiting.sort(sortByOwnership), 
      changesRequested: changesRequested.sort(sortByOwnership), 
      approved: approved.sort(sortByOwnership) 
    };
  }, [allRequests, decisions, attachments, comments, projects, selectedTypes, statusFilter, assignedTo]);

  // Group requests by project
  const groupByProject = (requestList) => {
    const grouped = {};
    requestList.forEach(request => {
      const project = projects.find(p => p.id === request.project_id);
      const projectId = request.project_id || 'unknown';
      if (!grouped[projectId]) {
        grouped[projectId] = {
          project,
          requests: []
        };
      }
      grouped[projectId].requests.push(request);
    });
    return Object.values(grouped);
  };

  const isLoading = loadingRequests || loadingProjects;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  // Get color based on tab/state - matching ProjectClientPortal colors
  const getStateColors = (tabName) => {
    if (tabName === 'awaiting') return { 
      border: 'oklch(57.7% 0.245 27.325)', // Red - Needs Review
      bg: 'oklch(39.6% 0.141 25.723)',
      isNeedsReview: true
    };
    if (tabName === 'changes') return { 
      border: 'oklch(85.2% 0.199 91.936)', // Yellow - Changes Requested
      bg: 'oklch(85.2% 0.199 91.936)',
      isNeedsReview: false
    };
    if (tabName === 'approved') return { 
      border: 'oklch(64.8% 0.2 131.684)', // Green - Approved
      bg: 'oklch(64.8% 0.2 131.684)',
      isNeedsReview: false
    };
    return { border: '#EF4444', bg: '#EF4444', isNeedsReview: false };
  };

  // Get type color matching ProjectClientPortal
  const getTypeColor = (type) => {
    switch (type) {
      case 'question': return '#3b82f6'; // blue-500
      case 'feedback_needed': return '#6366f1'; // indigo-500
      case 'design_review': return '#a855f7'; // purple-500
      case 'client_need': return '#f59e0b'; // amber-500
      default: return '#6b7280';
    }
  };

  // Get request type info matching ProjectClientPortal
  const getRequestTypeInfo = (type) => {
    switch (type) {
      case 'question': return { label: 'Question' };
      case 'feedback_needed': return { label: 'Feedback Needed' };
      case 'design_review': return { label: 'Design Review' };
      case 'client_need': return { label: 'Client Need' };
      default: return { label: 'General' };
    }
  };

  // Group requests by type within a project
  const groupRequestsByType = (requests) => {
    const grouped = {};
    requests.forEach(request => {
      const type = request.request_type || 'general';
      const typeInfo = getRequestTypeInfo(type);
      if (!grouped[type]) {
        grouped[type] = { label: typeInfo.label, color: getTypeColor(type), requests: [] };
      }
      grouped[type].requests.push(request);
    });
    return grouped;
  };

  const renderRequestList = (groupedData, emptyMessage, stateColor, tabName, showEmailButton = false) => {
    const colors = getStateColors(tabName);
    
    if (groupedData.length === 0) {
      return (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 md:p-12 text-center">
            <div 
              className="flex items-center justify-center w-16 h-16 rounded-full border-2 mx-auto mb-4"
              style={{ backgroundColor: `${colors.bg}10`, borderColor: `${colors.border}30` }}
            >
              {tabName === 'awaiting' && <Clock className="w-8 h-8" style={{ color: `${colors.bg}80` }} />}
              {tabName === 'changes' && <AlertTriangle className="w-8 h-8" style={{ color: `${colors.bg}80` }} />}
              {tabName === 'approved' && <CheckCircle2 className="w-8 h-8" style={{ color: `${colors.bg}80` }} />}
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">{emptyMessage}</h3>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        {groupedData.map(({ project, requests }) => {
          const groupedByType = groupRequestsByType(requests);
          
          return (
            <Card 
              key={project?.id || 'unknown'} 
              className={`backdrop-blur-xl border-2 shadow-lg ${colors.isNeedsReview ? 'bg-[oklch(39.6%_0.141_25.723)]' : 'bg-black/40'}`}
              style={{ 
                borderColor: colors.border,
                boxShadow: `0 10px 15px -3px ${colors.bg}20`
              }}
            >
              <CardHeader 
                className="border-b p-4"
                style={{ borderBottomColor: `${colors.border}50` }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <FolderKanban className="w-5 h-5" style={{ color: colors.border }} />
                    <div>
                      {project?.id ? (
                        <Link 
                          to={createPageUrl("ProjectDetail") + "?id=" + project.id}
                          className="hover:opacity-80 transition-opacity"
                        >
                          <CardTitle className="text-lg hover:underline" style={{ color: colors.border }}>
                            {project?.name || 'Unknown Project'}
                          </CardTitle>
                        </Link>
                      ) : (
                        <CardTitle className="text-lg" style={{ color: colors.border }}>
                          {project?.name || 'Unknown Project'}
                        </CardTitle>
                      )}
                      <div className="flex items-center gap-3 text-sm">
                        {project?.client_name && (
                          <span className="text-gray-400">{project.client_name}</span>
                        )}
                        {project?.client_last_viewed_at && (
                          <span className="text-cyan-500 flex items-center gap-1 text-xs">
                            <Eye className="w-3 h-3" />
                            Last Viewed: {format(new Date(project.client_last_viewed_at), 'MMM d, h:mm a')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {showEmailButton && project?.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          handleSendBulkEmail(project.id, requests.map(r => r.id));
                        }}
                        disabled={sendingEmailForProject === project.id}
                        className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                      >
                        {sendingEmailForProject === project.id ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <Send className="w-4 h-4 mr-1" />
                        )}
                        Email All
                      </Button>
                    )}
                    {project?.id && (
                      <>
                        <Link
                          to={createPageUrl("ProjectDetail") + `?id=${project.id}&tab=journal&from=hub&fromTab=${tabName}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white">
                            Journal
                          </Button>
                        </Link>
                        <Link
                          to={createPageUrl("ProjectDetail") + `?id=${project.id}&tab=clientportal&from=hub&fromTab=${tabName}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white">
                            Portal
                          </Button>
                        </Link>
                      </>
                    )}
                    <Badge 
                      variant="outline" 
                      style={{ borderColor: colors.border, color: colors.border, backgroundColor: `${colors.bg}15` }}
                    >
                      {requests.length} {requests.length === 1 ? 'request' : 'requests'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(groupedByType).map(([typeKey, typeGroup]) => (
                    <div key={typeKey} className="col-span-1">
                      <div 
                        className="bg-black/40 rounded-lg border-2 overflow-hidden"
                        style={{ borderColor: typeGroup.color }}
                      >
                        <div 
                          className="p-3 border-b-2"
                          style={{ 
                            borderBottomColor: typeGroup.color,
                            backgroundColor: `${typeGroup.color}15`
                          }}
                        >
                          <h3 
                            className="font-semibold text-sm"
                            style={{ color: typeGroup.color }}
                          >
                            {typeGroup.label}
                          </h3>
                          <span className="text-xs text-gray-400">
                            {typeGroup.requests.length} {typeGroup.requests.length === 1 ? 'request' : 'requests'}
                          </span>
                        </div>
                        <div className="p-3 space-y-2">
                          {typeGroup.requests.map(request => (
                            <Link
                              key={request.id}
                              to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&tab=${tabName}`}
                              className={`block p-3 bg-gray-900/50 rounded-lg border hover:bg-gray-800/80 transition-colors ${
                                request.ownership?.ownership === 'ak_needs_review' ? 'border-l-4 border-l-red-500' : 
                                request.ownership?.ownership === 'waiting_on_client' ? 'border-l-4 border-l-gray-500' :
                                'border-gray-700'
                              }`}
                              style={{ borderColor: '#374151' }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="text-white font-medium text-sm truncate flex-1">{request.title}</h4>
                                <div className="flex items-center gap-1 shrink-0">
                                  {request.ownership && (
                                    <OwnershipBadge ownership={request.ownership.ownership} reason={request.ownership.reason} size="sm" />
                                  )}
                                  {request.totalCommentCount > 0 && (
                                    <Badge variant="outline" className="text-xs border-gray-600 text-gray-400 flex items-center gap-1">
                                      <MessageSquareText className="w-3 h-3" />
                                      {request.totalCommentCount}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <div className="flex flex-col gap-0.5 text-xs">
                                  <div className="flex items-center gap-2 text-gray-400 flex-wrap">
                                    {request.due_date && (
                                      <span className={new Date(request.due_date) < new Date() ? 'text-red-400 font-medium' : ''}>
                                        Due: {format(new Date(request.due_date), 'MMM d')}
                                      </span>
                                    )}
                                    {showEmailButton && request.last_email_sent_at && (
                                      <span className="flex items-center gap-1 text-gray-500">
                                        <Mail className="w-3 h-3" />
                                        {format(new Date(request.last_email_sent_at), 'MMM d')}
                                      </span>
                                    )}
                                  </div>
                                  {/* Activity context - only show client activity if after posted_at */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {(() => {
                                      const postedAt = request.posted_at ? new Date(request.posted_at) : null;
                                      const isOverdue = request.due_date && new Date(request.due_date) < new Date();
                                      const lastCommentDate = request.lastClientComment ? 
                                        (request.lastClientComment.posted_at ? new Date(request.lastClientComment.posted_at) : new Date(request.lastClientComment.created_date)) : null;
                                      const isCommentAfterPosted = lastCommentDate && postedAt && lastCommentDate > postedAt;
                                      
                                      // Priority: Overdue > Client activity after posted_at > Waiting since repost
                                      if (isOverdue && !isCommentAfterPosted) {
                                        return (
                                          <span className="text-red-400">
                                            {postedAt ? `Sent to client ${formatDistanceToNow(postedAt, { addSuffix: true })}, awaiting response` : 'Overdue — awaiting client response'}
                                          </span>
                                        );
                                      }
                                      
                                      if (isCommentAfterPosted) {
                                        return (
                                          <span className="text-yellow-400">
                                            Client replied {formatDistanceToNow(lastCommentDate, { addSuffix: true })}
                                          </span>
                                        );
                                      }
                                      
                                      if (request.ownership?.ownership === 'waiting_on_client' && postedAt) {
                                        return (
                                          <span className="text-gray-400">
                                            Sent to client {formatDistanceToNow(postedAt, { addSuffix: true })}
                                          </span>
                                        );
                                      }
                                      
                                      return null;
                                    })()}
                                    {request.last_viewed_by_internal_at && (
                                      <span className="text-gray-500">
                                        AK {formatDistanceToNow(new Date(request.last_viewed_by_internal_at), { addSuffix: true })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <CopyRequestLinkButton 
                                    slug={getProjectClientSlug(request.project_id)} 
                                    requestId={request.id} 
                                  />
                                  <ChevronRight className="w-4 h-4 text-gray-500" />
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  // Count items needing AK review for mobile context
  const needsAttentionCount = allRequests.filter(request => {
    if (request.status === 'draft' || request.status === 'archived') return false;
    const project = projects.find(p => p.id === request.project_id);
    if (selectedTypes.length > 0 && project && !selectedTypes.includes(project.project_type_id)) return false;
    if (statusFilter !== 'all' && project && project.status_id !== statusFilter) return false;
    if (assignedTo.length > 0 && project) {
      const projectTeam = project.assigned_team || [];
      if (!projectTeam.some(memberId => assignedTo.includes(memberId))) return false;
    }
    const ownership = getReviewOwnership(request, comments, decisions, attachments);
    return ownership.ownership === 'ak_needs_review';
  }).length;

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-white flex items-center gap-2 md:gap-3">
            <Users className="w-6 h-6 md:w-8 md:h-8 text-red-500" />
            Client Portal
          </h1>
          <p className="text-gray-400 text-xs md:text-base mt-0.5 md:mt-1">
            <span className="hidden md:inline">Manage client feedback requests and access</span>
            <span className="md:hidden">
              {needsAttentionCount > 0 
                ? `${needsAttentionCount} item${needsAttentionCount !== 1 ? 's' : ''} need attention`
                : 'All caught up'}
            </span>
          </p>
        </div>
        
        {/* Filters and View Mode Toggle */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="hidden md:block">
            <SavedViewsSelector
              savedViews={savedViews}
              activeViewName={activeViewName}
              onSelectView={handleSelectView}
              onSaveView={saveView}
              onDeleteView={deleteView}
              onRenameView={renameView}
              currentSelectedTypes={selectedTypes}
              currentStatusFilter={statusFilter}
            />
          </div>
          
          {/* Assigned To Multi-Select */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className={`justify-between bg-gray-900/50 border-gray-700 text-white hover:bg-gray-800 ${assignedTo.length > 0 ? 'border-cyan-500/50' : ''}`}
              >
                <span className="flex items-center gap-2 truncate">
                  <User className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">
                    {assignedTo.length === 0 
                      ? 'All Assignees' 
                      : assignedTo.length === 1 
                        ? activeTeamMembers.find(tm => tm.id === assignedTo[0])?.full_name || 'Assignee'
                        : `${assignedTo.length} Assignees`}
                  </span>
                  <span className="sm:hidden">
                    {assignedTo.length === 0 ? 'All' : assignedTo.length}
                  </span>
                </span>
                {assignedTo.length > 0 && (
                  <X 
                    className="w-4 h-4 ml-1 hover:text-red-400 shrink-0" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAssignedToChange([]);
                    }}
                  />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 max-h-80 overflow-y-auto">
              {activeTeamMembers.map(tm => (
                <DropdownMenuCheckboxItem
                  key={tm.id}
                  checked={assignedTo.includes(tm.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      handleAssignedToChange([...assignedTo, tm.id]);
                    } else {
                      handleAssignedToChange(assignedTo.filter(id => id !== tm.id));
                    }
                  }}
                >
                  <span className="truncate">
                    {tm.full_name}
                    {tm.team_role && <span className="text-gray-400 ml-1">({tm.team_role})</span>}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-1 bg-black/40 border border-gray-700 rounded-lg p-1">
            <Button
              size="sm"
              variant={viewMode === 'cards' ? 'default' : 'ghost'}
              onClick={() => handleViewModeChange('cards')}
              className={viewMode === 'cards' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              onClick={() => handleViewModeChange('list')}
              className={viewMode === 'list' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Saved Views - Below header */}
      <div className="md:hidden">
        <SavedViewsSelector
          savedViews={savedViews}
          activeViewName={activeViewName}
          onSelectView={handleSelectView}
          onSaveView={saveView}
          onDeleteView={deleteView}
          onRenameView={renameView}
          currentSelectedTypes={selectedTypes}
          currentStatusFilter={statusFilter}
        />
      </div>

      {/* Needs Attention Section - Always visible at top, filtered by saved view */}
      <NeedsAttentionSection
        requests={allRequests.filter(request => {
          const project = projects.find(p => p.id === request.project_id);
          if (selectedTypes.length > 0 && project && !selectedTypes.includes(project.project_type_id)) return false;
          if (statusFilter !== 'all' && project && project.status_id !== statusFilter) return false;
          return true;
        })}
        projects={projects}
        comments={comments}
        decisions={decisions}
        attachments={attachments}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Desktop Tabs */}
        <TabsList className="hidden md:flex bg-black/40 border border-gray-700 p-1 h-auto">
          <TabsTrigger 
            value="awaiting" 
            className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
          >
            <Clock className="w-4 h-4" />
            Awaiting Review
            {categorizedRequests.awaiting.length > 0 && (
              <Badge className="bg-amber-500/20 text-amber-400 ml-1">
                {categorizedRequests.awaiting.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="changes" 
            className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            Change Requests
            {categorizedRequests.changesRequested.length > 0 && (
              <Badge className="bg-orange-500/20 text-orange-400 ml-1">
                {categorizedRequests.changesRequested.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="approved" 
            className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Approved
            {categorizedRequests.approved.length > 0 && (
              <Badge className="bg-green-500/20 text-green-400 ml-1">
                {categorizedRequests.approved.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="admin" 
            className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
          >
            <Users className="w-4 h-4" />
            Admin
          </TabsTrigger>
        </TabsList>

        {/* Mobile Hamburger Menu */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between border-gray-700 text-white bg-black/40">
                <span className="flex items-center gap-2">
                  {activeTab === 'awaiting' && <><Clock className="w-4 h-4" /> Awaiting Review</>}
                  {activeTab === 'changes' && <><AlertTriangle className="w-4 h-4" /> Change Requests</>}
                  {activeTab === 'approved' && <><CheckCircle2 className="w-4 h-4" /> Approved</>}
                  {activeTab === 'admin' && <><Users className="w-4 h-4" /> Admin</>}
                </span>
                <Menu className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-gray-900 border-gray-700">
              <DropdownMenuItem 
                onClick={() => handleTabChange('awaiting')}
                className={`gap-2 ${activeTab === 'awaiting' ? 'bg-red-600 text-white' : 'text-gray-300'}`}
              >
                <Clock className="w-4 h-4" /> Awaiting Review
                {categorizedRequests.awaiting.length > 0 && (
                  <Badge className="bg-amber-500/20 text-amber-400 ml-auto">
                    {categorizedRequests.awaiting.length}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleTabChange('changes')}
                className={`gap-2 ${activeTab === 'changes' ? 'bg-red-600 text-white' : 'text-gray-300'}`}
              >
                <AlertTriangle className="w-4 h-4" /> Change Requests
                {categorizedRequests.changesRequested.length > 0 && (
                  <Badge className="bg-orange-500/20 text-orange-400 ml-auto">
                    {categorizedRequests.changesRequested.length}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleTabChange('approved')}
                className={`gap-2 ${activeTab === 'approved' ? 'bg-red-600 text-white' : 'text-gray-300'}`}
              >
                <CheckCircle2 className="w-4 h-4" /> Approved
                {categorizedRequests.approved.length > 0 && (
                  <Badge className="bg-green-500/20 text-green-400 ml-auto">
                    {categorizedRequests.approved.length}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleTabChange('admin')}
                className={`gap-2 ${activeTab === 'admin' ? 'bg-red-600 text-white' : 'text-gray-300'}`}
              >
                <Users className="w-4 h-4" /> Admin
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <TabsContent value="awaiting" className="mt-6">
          {(() => {
            // Group by review ownership: AK Needs Review vs Waiting on Client
            const akNeedsReview = categorizedRequests.awaiting.filter(r => r.ownership?.ownership === 'ak_needs_review');
            const waitingOnClient = categorizedRequests.awaiting.filter(r => r.ownership?.ownership === 'waiting_on_client');

            if (akNeedsReview.length === 0 && waitingOnClient.length === 0) {
              return viewMode === 'list' 
                ? <ClientPortalListView groupedData={[]} emptyMessage="No items awaiting client review" tabName="awaiting" getProjectClientSlug={getProjectClientSlug} />
                : renderRequestList([], "No items awaiting client review", "bg-amber-500/20 text-amber-400 border-amber-500/50", "awaiting", true);
            }

            if (viewMode === 'list') {
              return (
                <div className="space-y-6">
                  {akNeedsReview.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                        AK Needs to Review
                        <Badge className="bg-red-500/20 text-red-400 ml-2">{akNeedsReview.length}</Badge>
                      </h2>
                      <ClientPortalListView 
                        groupedData={groupByProject(akNeedsReview)} 
                        emptyMessage="No items need AK review" 
                        tabName="awaiting"
                        showEmailButton={true}
                        onSendBulkEmail={handleSendBulkEmail}
                        sendingEmailForProject={sendingEmailForProject}
                        comments={comments}
                        decisions={decisions}
                        getProjectClientSlug={getProjectClientSlug}
                      />
                    </div>
                  )}
                  {waitingOnClient.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Clock className="w-5 h-5 text-gray-400" />
                        Waiting on Client
                        <Badge className="bg-gray-500/20 text-gray-400 ml-2">{waitingOnClient.length}</Badge>
                      </h2>
                      <ClientPortalListView 
                        groupedData={groupByProject(waitingOnClient)} 
                        emptyMessage="No items waiting on client" 
                        tabName="awaiting"
                        showEmailButton={true}
                        onSendBulkEmail={handleSendBulkEmail}
                        sendingEmailForProject={sendingEmailForProject}
                        comments={comments}
                        decisions={decisions}
                        getProjectClientSlug={getProjectClientSlug}
                      />
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div className="space-y-8">
                {akNeedsReview.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                      AK Needs to Review
                      <Badge className="bg-red-500/20 text-red-400 ml-2">{akNeedsReview.length}</Badge>
                    </h2>
                    {renderRequestList(
                      groupByProject(akNeedsReview),
                      "No items need AK review",
                      "bg-red-500/20 text-red-400 border-red-500/50",
                      "awaiting",
                      true
                    )}
                  </div>
                )}
                {waitingOnClient.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Clock className="w-5 h-5 text-gray-400" />
                      Waiting on Client
                      <Badge className="bg-gray-500/20 text-gray-400 ml-2">{waitingOnClient.length}</Badge>
                    </h2>
                    {renderRequestList(
                      groupByProject(waitingOnClient),
                      "No items waiting on client",
                      "bg-gray-500/20 text-gray-400 border-gray-500/50",
                      "awaiting",
                      true
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="changes" className="mt-6">
          {viewMode === 'list' ? (
            <ClientPortalListView 
              groupedData={groupByProject(categorizedRequests.changesRequested)} 
              emptyMessage="No items with change requests" 
              tabName="changes"
              comments={comments}
              decisions={decisions}
              getProjectClientSlug={getProjectClientSlug}
            />
          ) : (
            renderRequestList(
              groupByProject(categorizedRequests.changesRequested),
              "No items with change requests",
              "bg-orange-500/20 text-orange-400 border-orange-500/50",
              "changes"
            )
          )}
        </TabsContent>

        <TabsContent value="approved" className="mt-6">
          {viewMode === 'list' ? (
            <ClientPortalListView 
              groupedData={groupByProject(categorizedRequests.approved)} 
              emptyMessage="No approved items yet" 
              tabName="approved"
              comments={comments}
              decisions={decisions}
              getProjectClientSlug={getProjectClientSlug}
            />
          ) : (
            renderRequestList(
              groupByProject(categorizedRequests.approved),
              "No approved items yet",
              "bg-green-500/20 text-green-400 border-green-500/50",
              "approved"
            )
          )}
        </TabsContent>

        <TabsContent value="admin" className="mt-6">
          <ClientPortalAdminTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}