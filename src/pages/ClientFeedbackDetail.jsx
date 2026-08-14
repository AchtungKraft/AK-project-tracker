import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Plus, ExternalLink, Pencil, Upload, EyeOff, ChevronRight } from "lucide-react";
import useFileUploader from "../components/clientportal/useFileUploader";
import FileUploadStatusList from "../components/clientportal/FileUploadStatusList";
import { NotFoundState, RateLimitState, UnknownErrorState } from "@/components/feedback/FeedbackErrorStates";
// Note: Send, Paperclip, LinkIcon removed — now in FeedbackCommentComposer
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getRequestTypeInfo } from "@/components/clientportal/utils";
// canonicalState is now derived inside buildOperationalViewModel
import { isStructuredReview } from "@/components/clientportal/reviewBehavior";
import ClientFeedbackThread from "../components/clientportal/ClientFeedbackThread.jsx";
import ToDoListDisplay from "../components/clientportal/ToDoListDisplay.jsx";
import CreateTaskFromApprovalModal from "../components/clientportal/CreateTaskFromApprovalModal.jsx";
import CreateLinkedTaskModal from "../components/clientportal/CreateLinkedTaskModal.jsx";
import { ClientLinksSection } from "../components/clientportal/ClientLinksCopyButtons.jsx";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ImageModal from "../components/ui/ImageModal";
import EditRequestModal from "../components/clientportal/EditRequestModal.jsx";
import HideFromQueueModal from "../components/clientportal/HideFromQueueModal.jsx";
import { isQueueHidden } from "../components/clientportal/attentionHelpers.jsx";
import OperationalSummary from "../components/clientportal/OperationalSummary.jsx";
import DetailActionBar from "../components/clientportal/DetailActionBar.jsx";
import NextActionPanel from "../components/clientportal/NextActionPanel.jsx";
import ReviewCycleSummary from "../components/clientportal/ReviewCycleSummary.jsx";
import { buildOperationalViewModel } from "../components/clientportal/buildOperationalViewModel.jsx";
import { MetadataCardSkeleton, ThreadSkeleton, CommentFormSkeleton } from "../components/clientportal/FeedbackDetailSkeleton.jsx";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import FeedbackCommentComposer from "../components/clientportal/FeedbackCommentComposer.jsx";
import HtmlContent from "@/components/shared/HtmlContent";
import LinkPreviewGrid from "@/components/shared/LinkPreviewGrid";
import { extractLinks } from "@/utils/extractLinks";

export default function ClientFeedbackDetail() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Stabilize URL params — useMemo prevents re-parsing on every render
  const { requestId, projectId, fromHub, hubTab } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      requestId: params.get('id'),
      projectId: params.get('projectId'),
      fromHub: params.get('from') === 'hub',
      hubTab: params.get('tab') || 'awaiting',
    };
  }, [window.location.search]);

  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [showCreateLinkedTaskModal, setShowCreateLinkedTaskModal] = useState(false);
  const [showRequestDecisionForm, setShowRequestDecisionForm] = useState(false);
  const [requestDecisionType, setRequestDecisionType] = useState('');
  const [requestDecisionNote, setRequestDecisionNote] = useState('');
  const reviewImageUploader = useFileUploader();
  const [selectedImage, setSelectedImage] = useState(null);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHideModal, setShowHideModal] = useState(false);

  // Track if view has been logged this session to prevent duplicate tracking
  const viewTrackedRef = useRef(false);
  const prevRequestIdRef = useRef(requestId);

  // Reset view tracking when navigating to a different request (URL param change without unmount)
  if (prevRequestIdRef.current !== requestId) {
    prevRequestIdRef.current = requestId;
    viewTrackedRef.current = false;
  }

  // LIFECYCLE: Cancel in-flight queries when requestId changes or component unmounts
  // Prevents stale responses from previous requests being processed
  useEffect(() => {
    return () => {
      // On unmount or requestId change, cancel any in-flight detail query
      queryClient.cancelQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
    };
  }, [requestId, projectId, queryClient]);

  // Fetch user - separate from detail to allow progressive rendering
  const { data: user, isLoading: isLoadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Single consolidated API call for all feedback detail data
  const { data: feedbackDetail, isLoading: isLoadingDetail, isFetching, error: fetchError, refetch } = useQuery({
    queryKey: ['internalFeedbackDetail', requestId, projectId],
    queryFn: async ({ signal, meta }) => {
      const payload = { requestId, projectId };
      if (meta?.bustCache) payload.bustCache = true;
      const response = await base44.functions.invoke('getInternalFeedbackDetail', payload);
      // Abort check — if navigated away, don't process stale response
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const result = response.data;
      // Normalize backend error responses into thrown errors for react-query
      if (result && result.success === false && result.error) {
        const err = new Error(result.error.message || 'API error');
        err.errorType = result.error.type;
        throw err;
      }
      return result;
    },
    enabled: !!requestId,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error?.name === 'AbortError') return false;
      // Auto-retry rate limit errors up to 3 times
      if (error?.errorType === 'RATE_LIMIT' && failureCount < 3) return true;
      // Don't retry NOT_FOUND or other errors
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(2000 * 2 ** attemptIndex, 10000),
  });

  // Derive error type for UI
  const apiErrorType = fetchError?.errorType || null;

  // Non-blocking view tracking - fire and forget, debounced per session
  useEffect(() => {
    if (!requestId || !feedbackDetail?.request || viewTrackedRef.current) return;
    
    const request = feedbackDetail.request;
    // Track views for active requests (has been posted, not archived).
    // Uses posted_at as the draft gate; archived check uses storage flag (mutation-only).
    if (!request.posted_at || request.status === 'archived') return; // status check is MUTATION guard, not state logic
    
    const lastView = request.last_viewed_by_internal_at;
    if (lastView) {
      const timeSinceLastView = Date.now() - new Date(lastView).getTime();
      if (timeSinceLastView < 5 * 60 * 1000) {
        viewTrackedRef.current = true; // Mark as tracked to prevent future attempts
        return;
      }
    }
    
    // Mark as tracked immediately to prevent duplicate calls
    viewTrackedRef.current = true;
    
    // Non-blocking - fire and forget
    queueMicrotask(() => {
      base44.entities.ClientFeedbackRequest.update(requestId, {
        last_viewed_by_internal_at: new Date().toISOString()
      }).catch(() => {}); // Silent fail - tracking is non-critical
    });
  }, [requestId, feedbackDetail?.request?.id]);

  const request = feedbackDetail?.request;
  const comments = feedbackDetail?.comments || [];
  const decisions = feedbackDetail?.decisions || [];
  const attachments = feedbackDetail?.attachments || [];
  const todoTasks = feedbackDetail?.todoTasks || [];
  const taskGroups = feedbackDetail?.taskGroups || [];
  const project = feedbackDetail?.project;
  const linkedTaskDetails = feedbackDetail?.linkedTasks || [];
  const users = feedbackDetail?.users || [];
  const clientContacts = feedbackDetail?.clientContacts || [];
  const assignableUsers = feedbackDetail?.assignableUsers || [];
  const assignableContacts = feedbackDetail?.assignableContacts || [];
  const primaryClientSlug = feedbackDetail?.primaryClientSlug;
  const clientAccessOptions = feedbackDetail?.clientAccessOptions || [];

  // Stabilize array references BEFORE they're used in requestLinks/requestState/canonicalState
  const stableComments = useMemo(() => comments, [JSON.stringify(comments.map(c => c.id + (c.updated_date || '')))]);
  const stableDecisions = useMemo(() => decisions, [JSON.stringify(decisions.map(d => d.id + (d.updated_date || '')))]);
  const stableAttachments = useMemo(() => attachments, [JSON.stringify(attachments.map(a => a.id + (a.updated_date || '')))]);

  // Ref for attachments used in callbacks — prevents callback recreation on every data refresh
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const updateRequestMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ClientFeedbackRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
      // Actively invalidate hub data so navigating back shows fresh state
      queryClient.invalidateQueries({ queryKey: ['clientPortalHubData'] });
    }
  });

  const handleEditSave = (updates) => {
    updateRequestMutation.mutate(
      { id: requestId, data: updates },
      {
        onSuccess: () => {
          setShowEditModal(false);
          toast.success('Request updated');
        },
        onError: () => {
          toast.error('Failed to update request');
        }
      }
    );
  };

  const submitDecisionMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke('publicClientDecision', payload),
    onSuccess: (response) => {
      if (response.data?.success) {
        // Only invalidate the current request - not global lists
        queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
        setRequestDecisionNote('');
        reviewImageUploader.clearAll();
        setShowRequestDecisionForm(false);
        toast.success('Decision recorded');
      } else {
        throw new Error(response.data?.error || 'Failed to record decision');
      }
    },
    onError: (error) => {
      console.error('Decision error:', error);
      toast.error('Failed to record decision');
    }
  });

  const deleteRequestMutation = useMutation({
    mutationFn: async () => {
      // Use data already loaded - no extra fetches needed
      const attachmentsToDelete = attachments;
      const commentsToDelete = comments;
      const decisionsToDelete = decisions;
      const linksToDelete = linkedTaskDetails.map(l => ({ id: l.link?.id })).filter(l => l.id);

      await Promise.all([
        ...attachmentsToDelete.map((a) => base44.entities.ClientFeedbackAttachment.delete(a.id)),
        ...commentsToDelete.map((c) => base44.entities.ClientFeedbackComment.delete(c.id)),
        ...decisionsToDelete.map((d) => base44.entities.ClientFeedbackDecision.delete(d.id)),
        ...linksToDelete.map((l) => base44.entities.ClientFeedbackTaskLink.delete(l.id))
      ]);

      await base44.entities.ClientFeedbackRequest.delete(requestId);
    },
    onSuccess: () => {
      toast.success('Feedback request deleted');
      navigate(createPageUrl('ProjectDetail') + '?id=' + projectId + '&tab=clientportal');
    }
  });

  const handleDeleteRequest = () => {
    if (!confirm('Delete this feedback request? This will remove its comments, attachments, and decisions.')) return;
    deleteRequestMutation.mutate();
  };

  const handlePostToClient = async () => {
    if (confirm('Post this request to the client? They will be notified.')) {
      try {
        await base44.functions.invoke('updateRequestStatus', { requestId, status: 'posted' });
        queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
        
        // Send the review email - fire and forget
        base44.functions.invoke('sendNeedsReviewEmail', { requestId, isRepost: false }).catch(() => {});
        toast.success('Request posted to client');
      } catch (error) {
        toast.error('Failed to post request');
      }
    }
  };

  const handleResendForApproval = async () => {
    if (confirm('Resend this request for approval? This will bump it to Needs Review for the client.')) {
      try {
        await base44.functions.invoke('updateRequestStatus', { requestId, status: 'posted' });
        queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
        
        // Send email - fire and forget
        base44.functions.invoke('sendNeedsReviewEmail', { requestId, isRepost: true }).catch(() => {});
        toast.success('Request resent to client');
      } catch (error) {
        toast.error('Failed to resend request');
      }
    }
  };

  const handleArchive = () => {
    if (confirm('Archive this request?')) {
      // Archive is an internal-only action - NO email is sent to clients.
      // Only set status to archived. The canonical queue helper (queueEligibility)
      // treats archived as a stronger exclusion than any operational overlay, so we
      // deliberately preserve review_state, review_started_at, queue_hidden_at, and
      // queue_resume_date as historical metadata. If the request is later unarchived,
      // these fields retain context about what was happening when it was archived.
      updateRequestMutation.mutate(
        { id: requestId, data: { status: 'archived' } },
        {
          onSuccess: () => {
            toast.success('Request archived');
            navigate(createPageUrl("ClientPortalHub"));
          }
        }
      );
    }
  };

  const handleFinishReview = () => {
    updateRequestMutation.mutate(
      { id: requestId, data: { review_state: 'none', review_started_at: null } },
      { onSuccess: () => toast.success('Stopped reviewing') }
    );
  };

  const handleHideFromQueue = (resumeDate) => {
    updateRequestMutation.mutate(
      { id: requestId, data: { queue_hidden: true, queue_hidden_at: new Date().toISOString(), queue_resume_date: resumeDate || null } },
      { onSuccess: () => { setShowHideModal(false); toast.success(resumeDate ? `Set aside until ${resumeDate}` : 'Set aside — will return when resumed'); } }
    );
  };

  const handleResumeInQueue = () => {
    updateRequestMutation.mutate(
      { id: requestId, data: { queue_hidden: false, queue_hidden_at: null, queue_resume_date: null } },
      { onSuccess: () => toast.success('Resumed in Action Queue') }
    );
  };

  // Image/file upload handlers removed — now handled by FeedbackCommentComposer

  const handleApproveRequest = () => {
    setRequestDecisionType('approved');
    setShowRequestDecisionForm(true);
  };

  const handleRequestChangesRequest = () => {
    setRequestDecisionType('changes_requested');
    setShowRequestDecisionForm(true);
  };

  const handleSubmitRequestDecision = useCallback((payload) => {
    if (payload.decision === 'changes_requested' && !payload.note?.trim()) {
      toast.error('Please provide a note explaining the requested changes');
      return;
    }

    if (!user) {
      toast.error('User not authenticated.');
      return;
    }

    submitDecisionMutation.mutate({
      ...payload,
      newImages: payload.newImages || reviewImageUploader.uploadedUrls
    });
  }, [user, submitDecisionMutation, reviewImageUploader.uploadedUrls]);

  const handleCommentAdded = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
  }, [queryClient, requestId, projectId]);


  // Extract links from request body + structured links for preview grid (deduplicated against attachments)
  const requestLinks = useMemo(() => {
    if (!request) return [];
    const attachmentUrls = stableAttachments
      .filter(a => a.file_url || a.link_url)
      .map(a => a.file_url || a.link_url);
    return extractLinks(request.content_html, request.body, attachmentUrls, request.links);
  }, [request?.content_html, request?.body, request?.links, stableAttachments]);

  // ── SINGLE CANONICAL ENRICHMENT ──
  // buildOperationalViewModel produces the same enriched shape as the Hub.
  // Every component below consumes this — no independent derivation.
  const enrichedRequest = useMemo(() => {
    return request ? buildOperationalViewModel(request, stableComments, stableDecisions, stableAttachments) : null;
  }, [request?.id, request?.updated_date, request?.posted_at, request?.status, request?.review_state, stableComments, stableDecisions, stableAttachments]);

  const canonicalState = enrichedRequest?.canonicalState || null;
  const canAct = canonicalState?.key === 'awaiting_review' || canonicalState?.key === 'changes_requested';

  // Determine button labels based on request type
  const approveLabel = isStructuredReview(request?.request_type) ? 'Approve' : 'Confirm';
  const requestChangesLabel = 'Request Changes';
  
  // Memoize the request object passed to thread to prevent unnecessary re-renders
  const threadRequest = useMemo(() => {
    if (!request) return null;
    return { ...request, comments: stableComments, decisions: stableDecisions, attachments: stableAttachments };
  }, [request?.id, request?.updated_date, request?.posted_at, request?.status, request?.review_state, stableComments, stableDecisions, stableAttachments]);



  // Stable callback handlers to prevent thread rerenders
  const handleDeleteComment = useCallback(async (commentId) => {
    try {
      const commentAtts = attachmentsRef.current.filter(a => a.comment_id === commentId);
      await Promise.all(commentAtts.map(a => base44.entities.ClientFeedbackAttachment.delete(a.id)));
      await base44.entities.ClientFeedbackComment.delete(commentId);
      queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
      toast.success('Comment deleted');
    } catch (error) {
      toast.error('Failed to delete comment');
    }
  }, [queryClient, requestId, projectId]);

  const handleDeleteDecision = useCallback(async (decisionIds) => {
    try {
      await Promise.all(decisionIds.map(id => base44.entities.ClientFeedbackDecision.delete(id)));
      queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
      toast.success('Decision deleted');
    } catch (error) {
      toast.error('Failed to delete decision');
    }
  }, [queryClient, requestId, projectId]);

  const handleThreadImageClick = useCallback((url, allImages, idx) => {
    setGalleryImages(allImages || []);
    setGalleryIndex(idx || 0);
    setSelectedImage(url);
  }, []);

  const handleGalleryOpen = useCallback((images, idx) => {
    setGalleryImages(images);
    setGalleryIndex(idx);
    setSelectedImage(images[idx]);
  }, []);

  const handleCreateTaskFromApproval = useCallback((approval) => {
    setSelectedApproval(approval);
    setShowCreateTaskModal(true);
  }, []);

  // Navigation handler - memoized
  const handleBack = useMemo(() => () => {
    if (fromHub) {
      navigate(createPageUrl("ClientPortalHub") + `?tab=${hubTab}`);
    } else {
      navigate(createPageUrl("ProjectDetail") + "?id=" + projectId + "&tab=clientportal");
    }
  }, [fromHub, hubTab, projectId, navigate]);

  // Handle user not loaded yet - show minimal loading
  if (isLoadingUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  // Handle no user after loading
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Please log in to view this page</p>
          <Button 
            variant="outline" 
            className="mt-4 border-gray-700 text-white"
            onClick={() => navigate(createPageUrl("ClientPortalHub"))}
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // PROGRESSIVE RENDERING: Show header skeleton while loading, then render progressively
  const isInitialLoad = isLoadingDetail && !feedbackDetail;
  
  // Handle errors after load completes — separate NOT_FOUND from transient failures
  if (!isLoadingDetail && (fetchError || !request)) {
    if (apiErrorType === 'NOT_FOUND' || (!fetchError && !request)) {
      return <NotFoundState onBack={handleBack} />;
    }
    if (apiErrorType === 'RATE_LIMIT') {
      return <RateLimitState onRetry={() => refetch()} isRetrying={isFetching} />;
    }
    return <UnknownErrorState 
      message={fetchError?.message} 
      onRetry={() => refetch()} 
      isRetrying={isFetching}
      onBack={handleBack} 
    />;
  }

  return (
    <>
      <div className={cn(
        "min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black",
        isMobile ? "p-2" : "p-3 md:p-6"
      )}>
        <div className={cn("max-w-5xl mx-auto", isMobile ? "space-y-3" : "space-y-6")}>
          {/* PHASE 1: Header - Compact on mobile */}
          <div className={cn("flex items-start gap-2", isMobile ? "gap-2" : "gap-3")}>
            <Button
              variant="outline"
              size="icon"
              onClick={handleBack}
              className={cn("border-gray-700 text-white shrink-0", isMobile ? "h-9 w-9" : "")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 min-w-0">
              {isInitialLoad ? (
                <>
                  <div className={cn("bg-gray-700 rounded animate-pulse", isMobile ? "h-6 w-48" : "h-8 w-64")} />
                  <div className="h-4 w-32 bg-gray-800 rounded animate-pulse mt-1" />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <h1 className={cn(
                      "font-bold text-white",
                      isMobile ? "text-lg leading-tight line-clamp-2" : "text-2xl"
                    )}>{request?.title}</h1>
                    {canonicalState?.key !== 'archived' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setShowEditModal(true)}
                        className={cn("text-gray-400 hover:text-white hover:bg-gray-800 shrink-0", isMobile ? "h-7 w-7" : "h-8 w-8")}
                      >
                        <Pencil className={isMobile ? "w-3.5 h-3.5" : "w-4 h-4"} />
                      </Button>
                    )}
                  </div>
                  {project && (
                    <button
                      onClick={() => navigate(createPageUrl("ProjectDetail") + "?id=" + project.id + "&tab=clientportal")}
                      className={cn(
                        "text-gray-400 hover:text-gray-200 transition-colors inline-flex items-center gap-1 group",
                        isMobile ? "text-xs" : "text-sm"
                      )}
                    >
                      {project.name}
                      <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Action buttons - only show when data is loaded, hidden on mobile (shown in metadata card) */}
            {!isMobile && !isInitialLoad && canAct && !isStructuredReview(request?.request_type) && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleSubmitRequestDecision({
                    requestId,
                    decision: 'approved',
                    note: '',
                    targetAttachmentIds: null,
                    newImages: reviewImageUploader.uploadedUrls,
                  })}
                  className="bg-green-600 hover:bg-green-700 text-white border-green-600"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {approveLabel}
                </Button>
                <Button
                  size="sm"
                  onClick={handleRequestChangesRequest}
                  className="bg-orange-600 hover:bg-orange-700 text-white border-orange-600"
                >
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {requestChangesLabel}
                </Button>
              </div>
            )}

            {!isMobile && !isInitialLoad && canAct && isStructuredReview(request?.request_type) && (
              <p className="text-sm text-gray-400 italic">Select images below to approve or request changes</p>
            )}
          </div>

          {/* PHASE 2: Show skeleton while loading metadata and thread */}
          {isInitialLoad ? (
            <>
              <MetadataCardSkeleton />
              <ThreadSkeleton />
              <CommentFormSkeleton />
            </>
          ) : (
            <>
              {/* PHASE 3: Actual content - hydrated progressively */}

          <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
            <CardContent className={cn("space-y-3", isMobile ? "p-3" : "p-4 space-y-4")}>
              {/* Client Links Section - Compact chips on mobile */}
              <div className={cn("border-b border-gray-700/50", isMobile ? "pb-2" : "pb-3")}>
                <ClientLinksSection 
                  clientAccessOptions={clientAccessOptions}
                  primaryClientSlug={primaryClientSlug}
                  requestId={requestId} 
                  compact={isMobile}
                />
              </div>
              
              {/* Identity badges — what is this request? */}
              <div className={cn(
                "flex items-center gap-1.5",
                isMobile ? "overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide" : "flex-wrap gap-1.5"
              )}>
                <Badge className={cn("text-xs border shrink-0", getRequestTypeInfo(request.request_type).color)}>
                  {getRequestTypeInfo(request.request_type).label}
                </Badge>
                {isQueueHidden(enrichedRequest) && (
                  <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/40 text-xs shrink-0">
                    <EyeOff className="w-3 h-3 mr-1" />
                    {request.queue_resume_date 
                      ? `Set aside — returns ${format(new Date(request.queue_resume_date), 'MMM d')}`
                      : 'Set aside'}
                  </Badge>
                )}
              </div>

              {/* Next Action — what should happen now? */}
              <NextActionPanel canonicalState={canonicalState} request={enrichedRequest} isMobile={isMobile} />

              {/* Operational Summary — important dates */}
              <OperationalSummary request={enrichedRequest} isMobile={isMobile} />

              {/* Mobile: Approve/Changes buttons for non-structured-review */}
              {isMobile && canAct && !isStructuredReview(request?.request_type) && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleSubmitRequestDecision({
                      requestId,
                      decision: 'approved',
                      note: '',
                      targetAttachmentIds: null,
                      newImages: reviewImageUploader.uploadedUrls,
                    })}
                    className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {approveLabel}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleRequestChangesRequest}
                    className="flex-1 h-10 bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    <AlertCircle className="w-4 h-4 mr-1" />
                    Changes
                  </Button>
                </div>
              )}

              {isMobile && canAct && isStructuredReview(request?.request_type) && (
                <p className="text-xs text-gray-400 italic">Select images below to review</p>
              )}

              {/* Hierarchical action bar */}
              <DetailActionBar
                canonicalState={canonicalState}
                request={enrichedRequest}
                isMobile={isMobile}
                isDeleting={deleteRequestMutation.isPending}
                onPostToClient={handlePostToClient}
                onResend={handleResendForApproval}
                onArchive={handleArchive}
                onDelete={handleDeleteRequest}
                onStartReviewing={() => updateRequestMutation.mutate({
                  id: requestId,
                  data: { review_state: 'in_review', review_started_at: new Date().toISOString() }
                }, { onSuccess: () => toast.success('Now reviewing') })}
                onStopReviewing={handleFinishReview}
                onShowLaterModal={() => setShowHideModal(true)}
                onResumeInQueue={handleResumeInQueue}
                onMoveToDraft={() => {
                  if (confirm('Move this request back to draft?')) {
                    updateRequestMutation.mutate({ id: requestId, data: { status: 'draft', posted_at: null } });
                    toast.success('Moved to Drafts');
                  }
                }}
              />

              {(request.body || request.content_html) && (
                <div className={cn("bg-gray-800/50 rounded-lg", isMobile ? "p-2" : "p-3")}>
                  <HtmlContent
                    html={request.content_html}
                    fallback={request.body}
                    className={isMobile ? "text-sm" : ""}
                  />
                  {requestLinks.length > 0 && (
                    <LinkPreviewGrid links={requestLinks} />
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={cn("font-semibold text-gray-400", isMobile ? "text-xs" : "text-sm")}>Linked Tasks</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCreateLinkedTaskModal(true)}
                    className={cn("border-gray-600 text-gray-200 hover:bg-gray-700 text-xs", isMobile ? "h-7 px-2" : "h-7")}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                </div>
                {linkedTaskDetails.length > 0 ? (
                  <div className={cn(isMobile ? "space-y-1.5" : "space-y-2")}>
                    {linkedTaskDetails.map(({ task }) => (
                      <div key={task.id} className={cn("bg-gray-800/50 rounded-lg flex items-center justify-between", isMobile ? "p-1.5" : "p-2")}>
                        <span className={cn("text-white", isMobile ? "text-xs" : "text-sm")}>{task.name}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(createPageUrl("ProjectDetail") + "?id=" + projectId + "&tab=tasks")}
                          className={cn("text-blue-400 hover:text-blue-300", isMobile ? "h-6 w-6 p-0" : "")}
                        >
                          <ExternalLink className={isMobile ? "w-3.5 h-3.5" : "w-4 h-4"} />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={cn("text-gray-500 italic", isMobile ? "text-xs" : "text-sm")}>No linked tasks</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Review Cycle — how has this review progressed? */}
          <ReviewCycleSummary request={enrichedRequest} isMobile={isMobile} />

          {/* Comment Composer — positioned above thread */}
          <FeedbackCommentComposer
            requestId={requestId}
            projectId={projectId}
            onCommentAdded={handleCommentAdded}
            isMobile={isMobile}
          />

          {request.request_type === 'todo_list' ? (
            <>
              <ToDoListDisplay
                requestId={requestId}
                tasks={todoTasks}
                taskGroups={taskGroups}
                assignableUsers={assignableUsers}
                assignableContacts={assignableContacts}
                queryKey={['internalFeedbackDetail', requestId, projectId]}
                onImageClick={handleGalleryOpen}
              />
              {/* Show comments thread for ToDo list requests */}
              {threadRequest && (
                <ClientFeedbackThread
                  requestId={requestId}
                  userId={user.id}
                  requestType={request.request_type}
                  onDecisionSubmit={handleSubmitRequestDecision}
                  onDeleteComment={handleDeleteComment}
                  onDeleteDecision={handleDeleteDecision}
                  isClientView={false}
                  accessRole={user?.role}
                  request={threadRequest}
                  onImageClick={handleThreadImageClick}
                />
              )}
            </>
          ) : threadRequest && (
            <ClientFeedbackThread
              requestId={requestId}
              userId={user.id}
              requestType={request.request_type}
              onCreateTask={handleCreateTaskFromApproval}
              onDecisionSubmit={handleSubmitRequestDecision}
              onDeleteComment={handleDeleteComment}
              onDeleteDecision={handleDeleteDecision}
              isClientView={false}
              accessRole={user?.role}
              request={threadRequest}
              onImageClick={handleThreadImageClick}
            />
          )}


            </>
          )}
        </div>
      </div>

      {showRequestDecisionForm &&
      <Dialog open={showRequestDecisionForm} onOpenChange={setShowRequestDecisionForm}>
          <DialogContent className="bg-gray-900 text-white">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                {requestDecisionType === 'approved' ? `${approveLabel} Request` : 'Request Changes'}
              </h3>
              <p className="text-sm text-gray-400">
                Making a decision for: "{request.title}"
              </p>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  {requestDecisionType === 'changes_requested' ? 'Explain what changes are needed *' : 'Add a note (optional)'}
                </label>
                <Textarea
                value={requestDecisionNote}
                onChange={(e) => setRequestDecisionNote(e.target.value)}
                placeholder={requestDecisionType === 'changes_requested' ? 'Describe the changes needed...' : 'Add any comments...'}
                className="bg-gray-800 border-gray-700 text-white min-h-[100px]" />

              </div>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">Upload Reference Images (Optional)</label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md transition-colors text-sm text-gray-300">
                      {reviewImageUploader.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Upload Images
                    </div>
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        reviewImageUploader.addFiles(files);
                        e.target.value = "";
                      }}
                      disabled={reviewImageUploader.isUploading} 
                    />
                  </label>
                  <span className="text-xs text-gray-500">{reviewImageUploader.uploadedUrls.length} images added</span>
                </div>
                
                {reviewImageUploader.files.length > 0 && (
                  <div className="mt-2">
                    <FileUploadStatusList
                      files={reviewImageUploader.files}
                      onRemove={reviewImageUploader.removeFile}
                      onRetry={reviewImageUploader.retryFailed}
                      mode="image"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                variant="outline"
                onClick={() => setShowRequestDecisionForm(false)}
                className="border-gray-600 text-gray-200 hover:bg-gray-800">

                  Cancel
                </Button>
                <Button
                onClick={() => handleSubmitRequestDecision({
                  requestId,
                  decision: requestDecisionType,
                  note: requestDecisionNote,
                  targetAttachmentIds: null,
                  newImages: reviewImageUploader.uploadedUrls,
                })}
                disabled={submitDecisionMutation.isPending || reviewImageUploader.isUploading}
                className={requestDecisionType === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}>

                  {submitDecisionMutation.isPending ?
                <Loader2 className="w-4 h-4 animate-spin" /> :

                `Submit ${requestDecisionType === 'approved' ? approveLabel : 'Changes'}`
                }
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      }

      {showCreateTaskModal &&
      <CreateTaskFromApprovalModal
        open={showCreateTaskModal}
        onClose={() => {
          setShowCreateTaskModal(false);
          setSelectedApproval(null);
        }}
        projectId={projectId}
        requestId={requestId}
        requestTitle={request?.title}
        approval={selectedApproval}
        userId={user.id} />

      }

      {showCreateLinkedTaskModal && (
        <CreateLinkedTaskModal
          open={showCreateLinkedTaskModal}
          onClose={() => setShowCreateLinkedTaskModal(false)}
          projectId={projectId}
          feedbackRequestId={requestId}
          feedbackRequestTitle={request?.title}
          feedbackAttachments={stableAttachments}
          userId={user?.id}
        />
      )}

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => {
          setSelectedImage(null);
          setGalleryImages([]);
          setGalleryIndex(0);
        }}
        imageUrl={selectedImage}
        images={galleryImages}
        currentIndex={galleryIndex}
        onNavigate={(newIndex) => {
          setGalleryIndex(newIndex);
          if (galleryImages.length > 0) setSelectedImage(galleryImages[newIndex]);
        }}
      />

      {showEditModal && (
        <EditRequestModal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          request={request}
          onSave={handleEditSave}
          isSaving={updateRequestMutation.isPending}
        />
      )}

      {showHideModal && (
        <HideFromQueueModal
          open={showHideModal}
          onClose={() => setShowHideModal(false)}
          onConfirm={handleHideFromQueue}
          isSaving={updateRequestMutation.isPending}
        />
      )}
    </>);

}