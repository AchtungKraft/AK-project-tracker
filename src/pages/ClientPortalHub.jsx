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
  Send
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ClientPortalAdminTab from "@/components/clientportal/ClientPortalAdminTab";

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
  
  // For image reviews, check if all images are decided
  if (request.request_type === 'image_review') {
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

  const [sendingEmailForProject, setSendingEmailForProject] = useState(null);

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
      
      if (state === 'approved') {
        approved.push({ ...request, state });
      } else if (state === 'changes_requested') {
        changesRequested.push({ ...request, state });
      } else if (state === 'awaiting_review') {
        awaiting.push({ ...request, state });
      }
    });

    return { awaiting, changesRequested, approved };
  }, [allRequests, decisions, attachments]);

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

  const renderRequestList = (groupedData, emptyMessage, stateColor, tabName, showEmailButton = false) => {
    if (groupedData.length === 0) {
      return (
        <Card className="bg-black/40 border-gray-700">
          <CardContent className="p-8 text-center text-gray-400">
            {emptyMessage}
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        {groupedData.map(({ project, requests }) => (
          <Card key={project?.id || 'unknown'} className="bg-black/40 border-gray-700">
            <CardHeader className="border-b border-gray-700 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FolderKanban className="w-5 h-5 text-red-500" />
                  <CardTitle className="text-lg text-white">
                    {project?.name || 'Unknown Project'}
                  </CardTitle>
                  {showEmailButton && project?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.preventDefault();
                        handleSendBulkEmail(project.id, requests.map(r => r.id));
                      }}
                      disabled={sendingEmailForProject === project.id}
                      className="ml-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
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
                        className="ml-1"
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
                </div>
                <Badge className="bg-gray-800 text-gray-300">
                  {requests.length} {requests.length === 1 ? 'item' : 'items'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-800">
                {requests.map(request => (
                  <Link
                    key={request.id}
                    to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&tab=${tabName}`}
                    className="flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium truncate">{request.title}</h4>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                        <span className="capitalize">{request.request_type?.replace('_', ' ')}</span>
                        {request.due_date && (
                          <span>Due: {format(new Date(request.due_date), 'MMM d')}</span>
                        )}
                        {showEmailButton && request.last_email_sent_at && (
                          <span className="flex items-center gap-1 text-gray-500">
                            <Mail className="w-3 h-3" />
                            {format(new Date(request.last_email_sent_at), 'MMM d, h:mm a')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={stateColor}>
                        {request.state === 'awaiting_review' && 'Awaiting Review'}
                        {request.state === 'changes_requested' && 'Changes Requested'}
                        {request.state === 'approved' && 'Approved'}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
          <Users className="w-8 h-8 text-red-500" />
          Client Portal
        </h1>
        <p className="text-gray-400 mt-1">
          Manage client feedback requests and access
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="bg-black/40 border border-gray-700 p-1 h-auto flex-wrap">
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

        <TabsContent value="awaiting" className="mt-6">
          {renderRequestList(
            groupByProject(categorizedRequests.awaiting),
            "No items awaiting client review",
            "bg-amber-500/20 text-amber-400 border-amber-500/50",
            "awaiting",
            true
          )}
        </TabsContent>

        <TabsContent value="changes" className="mt-6">
          {renderRequestList(
            groupByProject(categorizedRequests.changesRequested),
            "No items with change requests",
            "bg-orange-500/20 text-orange-400 border-orange-500/50",
            "changes"
          )}
        </TabsContent>

        <TabsContent value="approved" className="mt-6">
          {renderRequestList(
            groupByProject(categorizedRequests.approved),
            "No approved items yet",
            "bg-green-500/20 text-green-400 border-green-500/50",
            "approved"
          )}
        </TabsContent>

        <TabsContent value="admin" className="mt-6">
          <ClientPortalAdminTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}