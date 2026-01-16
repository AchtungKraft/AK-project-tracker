import React, { useState, useMemo } from "react";
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
  List
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ClientPortalAdminTab from "@/components/clientportal/ClientPortalAdminTab";
import ClientPortalListView from "@/components/clientportal/ClientPortalListView";

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
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') || 'awaiting';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('clientPortalHub_viewMode') || 'cards';
  });

  const [sendingEmailForProject, setSendingEmailForProject] = useState(null);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('clientPortalHub_viewMode', mode);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Refetch all data when switching tabs
    queryClient.invalidateQueries({ queryKey: ["allFeedbackRequests"] });
    queryClient.invalidateQueries({ queryKey: ["allFeedbackDecisions"] });
    queryClient.invalidateQueries({ queryKey: ["allFeedbackAttachments"] });
  };

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

  // Categorize requests
  const categorizedRequests = useMemo(() => {
    const awaiting = [];
    const changesRequested = [];
    const approved = [];

    allRequests.forEach(request => {
      if (request.status === 'draft' || request.status === 'archived') return;
      
      const state = getRequestState(request, decisions, attachments);
      
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
      
      if (state === 'approved') {
        approved.push({ ...request, state });
      } else if (state === 'changes_requested') {
        changesRequested.push({ ...request, state });
      } else if (state === 'awaiting_review') {
        awaiting.push({ ...request, state, hasClientComments, clientCommentCount });
      }
    });

    return { awaiting, changesRequested, approved };
  }, [allRequests, decisions, attachments, comments]);

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
                      {project?.client_name && (
                        <p className="text-sm text-gray-400">{project.client_name}</p>
                      )}
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
                              className="block p-3 bg-gray-900/50 rounded-lg border border-gray-700 hover:bg-gray-800/80 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <h4 className="text-white font-medium text-sm truncate flex-1">{request.title}</h4>
                                {request.hasClientComments && (
                                  <Badge className="bg-green-500/20 text-green-400 border-green-500/50 ml-2 flex items-center gap-1">
                                    <MessageSquareText className="w-3 h-3" />
                                    {request.clientCommentCount}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                  {request.due_date && (
                                    <span>Due: {format(new Date(request.due_date), 'MMM d')}</span>
                                  )}
                                  {showEmailButton && request.last_email_sent_at && (
                                    <span className="flex items-center gap-1 text-gray-500">
                                      <Mail className="w-3 h-3" />
                                      {format(new Date(request.last_email_sent_at), 'MMM d')}
                                    </span>
                                  )}
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-500" />
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

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Users className="w-8 h-8 text-red-500" />
            Client Portal
          </h1>
          <p className="text-gray-400 mt-1">
            Manage client feedback requests and access
          </p>
        </div>
        
        {/* View Mode Toggle */}
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
            const requestsWithComments = categorizedRequests.awaiting.filter(r => r.hasClientComments);
            const requestsWithoutComments = categorizedRequests.awaiting.filter(r => !r.hasClientComments);

            if (requestsWithComments.length === 0 && requestsWithoutComments.length === 0) {
              return viewMode === 'list' 
                ? <ClientPortalListView groupedData={[]} emptyMessage="No items awaiting client review" tabName="awaiting" />
                : renderRequestList([], "No items awaiting client review", "bg-amber-500/20 text-amber-400 border-amber-500/50", "awaiting", true);
            }

            if (viewMode === 'list') {
              return (
                <div className="space-y-6">
                  {requestsWithComments.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <MessageSquareText className="w-5 h-5 text-green-400" />
                        With Client Comments
                        <Badge className="bg-green-500/20 text-green-400 ml-2">{requestsWithComments.length}</Badge>
                      </h2>
                      <ClientPortalListView 
                        groupedData={groupByProject(requestsWithComments)} 
                        emptyMessage="No items with client comments" 
                        tabName="awaiting"
                        showEmailButton={true}
                        onSendBulkEmail={handleSendBulkEmail}
                        sendingEmailForProject={sendingEmailForProject}
                        comments={comments}
                        decisions={decisions}
                      />
                    </div>
                  )}
                  {requestsWithoutComments.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Clock className="w-5 h-5 text-amber-400" />
                        Awaiting Review
                        <Badge className="bg-amber-500/20 text-amber-400 ml-2">{requestsWithoutComments.length}</Badge>
                      </h2>
                      <ClientPortalListView 
                        groupedData={groupByProject(requestsWithoutComments)} 
                        emptyMessage="No items awaiting review" 
                        tabName="awaiting"
                        showEmailButton={true}
                        onSendBulkEmail={handleSendBulkEmail}
                        sendingEmailForProject={sendingEmailForProject}
                      />
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div className="space-y-8">
                {requestsWithComments.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <MessageSquareText className="w-5 h-5 text-green-400" />
                      Requests with Client Comments
                      <Badge className="bg-green-500/20 text-green-400 ml-2">{requestsWithComments.length}</Badge>
                    </h2>
                    {renderRequestList(
                      groupByProject(requestsWithComments),
                      "No items with client comments",
                      "bg-amber-500/20 text-amber-400 border-amber-500/50",
                      "awaiting",
                      true
                    )}
                  </div>
                )}
                {requestsWithoutComments.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amber-400" />
                      Requests Awaiting Review (No Comments)
                      <Badge className="bg-amber-500/20 text-amber-400 ml-2">{requestsWithoutComments.length}</Badge>
                    </h2>
                    {renderRequestList(
                      groupByProject(requestsWithoutComments),
                      "No items awaiting review without comments",
                      "bg-amber-500/20 text-amber-400 border-amber-500/50",
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