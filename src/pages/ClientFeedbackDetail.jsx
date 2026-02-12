import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Send, Upload, Link as LinkIcon, Loader2, Archive, CheckCircle2, AlertCircle, Plus, ExternalLink, X, Paperclip, Trash2, RotateCw, FileText, Pencil } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getRequestState, getRequestTypeInfo } from "@/components/clientportal/utils";
import ClientFeedbackThread from "../components/clientportal/ClientFeedbackThread.jsx";
import ToDoListDisplay from "../components/clientportal/ToDoListDisplay.jsx";
import CreateTaskFromApprovalModal from "../components/clientportal/CreateTaskFromApprovalModal.jsx";
import CreateLinkedTaskModal from "../components/clientportal/CreateLinkedTaskModal.jsx";
import { ClientLinksSection } from "../components/clientportal/ClientLinksCopyButtons.jsx";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ImageModal from "../components/ui/ImageModal";
import EditRequestModal from "../components/clientportal/EditRequestModal.jsx";
import { MetadataCardSkeleton, ThreadSkeleton, CommentFormSkeleton } from "../components/clientportal/FeedbackDetailSkeleton.jsx";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import MobileCollapsibleComposer from "@/components/mobile/MobileCollapsibleComposer";

export default function ClientFeedbackDetail() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get('id');
  const projectId = urlParams.get('projectId');
  const fromHub = urlParams.get('from') === 'hub';
  const hubTab = urlParams.get('tab') || 'awaiting';

  const [newComment, setNewComment] = useState('');
  const [visibility, setVisibility] = useState('client_visible');
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newLinks, setNewLinks] = useState(['']);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [showCreateLinkedTaskModal, setShowCreateLinkedTaskModal] = useState(false);
  const [showRequestDecisionForm, setShowRequestDecisionForm] = useState(false);
  const [requestDecisionType, setRequestDecisionType] = useState('');
  const [requestDecisionNote, setRequestDecisionNote] = useState('');
  const [reviewNewImages, setReviewNewImages] = useState([]);
  const [isUploadingReviewImages, setIsUploadingReviewImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Track if view has been logged this session to prevent duplicate tracking
  const viewTrackedRef = useRef(false);

  // Fetch user - separate from detail to allow progressive rendering
  const { data: user, isLoading: isLoadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Single consolidated API call for all feedback detail data
  const { data: feedbackDetail, isLoading: isLoadingDetail, isFetching } = useQuery({
    queryKey: ['internalFeedbackDetail', requestId, projectId],
    queryFn: async () => {
      const response = await base44.functions.invoke('getInternalFeedbackDetail', { requestId, projectId });
      return response.data;
    },
    enabled: !!requestId,
    staleTime: 60_000, // 60 seconds - longer stale time
    gcTime: 300_000,
    refetchOnMount: false, // Don't refetch if data exists
    refetchOnWindowFocus: false,
  });

  // Non-blocking view tracking - fire and forget, debounced per session
  useEffect(() => {
    if (!requestId || !feedbackDetail?.request || viewTrackedRef.current) return;
    
    const request = feedbackDetail.request;
    if (request.status !== 'posted' && request.status !== 'changes_requested') return;
    
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
  const project = feedbackDetail?.project;
  const linkedTaskDetails = feedbackDetail?.linkedTasks || [];
  const users = feedbackDetail?.users || [];
  const clientContacts = feedbackDetail?.clientContacts || [];
  const assignableUsers = feedbackDetail?.assignableUsers || [];
  const assignableContacts = feedbackDetail?.assignableContacts || [];
  const primaryClientSlug = feedbackDetail?.primaryClientSlug;

  const updateRequestMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ClientFeedbackRequest.update(id, data),
    onSuccess: () => {
      // Only invalidate the current request detail - not global lists
      queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
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

  const [isAddingComment, setIsAddingComment] = useState(false);

  const createAttachmentMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientFeedbackAttachment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
    }
  });

  const submitDecisionMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke('publicClientDecision', payload),
    onSuccess: (response) => {
      if (response.data?.success) {
        // Only invalidate the current request - not global lists
        queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
        setRequestDecisionNote('');
        setReviewNewImages([]);
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
      // Archive is an internal-only action - NO email is sent to clients
      updateRequestMutation.mutate({
        id: requestId,
        data: { status: 'archived' }
      });
      toast.success('Request archived');
    }
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingImages(true);
    try {
      const uploadPromises = files.map((file) =>
      base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const photoUrls = results.map((r) => r.file_url);
      setUploadedPhotos([...uploadedPhotos, ...photoUrls]);
      toast.success('Images uploaded');
      e.target.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload images');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleRemovePhoto = (urlToRemove) => {
    setUploadedPhotos(uploadedPhotos.filter((url) => url !== urlToRemove));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadedFiles([...uploadedFiles, { name: file.name, url: file_url }]);
      toast.success('File uploaded');
      e.target.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleRemoveFile = (urlToRemove) => {
    setUploadedFiles(uploadedFiles.filter((f) => f.url !== urlToRemove));
  };

  const handleApproveRequest = () => {
    setRequestDecisionType('approved');
    setShowRequestDecisionForm(true);
  };

  const handleRequestChangesRequest = () => {
    setRequestDecisionType('changes_requested');
    setShowRequestDecisionForm(true);
  };

  const handleSubmitRequestDecision = (payload) => {
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
      newImages: payload.newImages || reviewNewImages // Use passed newImages or default to reviewNewImages state
    });
  };

  const handleAddComment = async () => {
    if (!newComment.trim() && newLinks.every((l) => !l.trim()) && uploadedPhotos.length === 0 && uploadedFiles.length === 0) {
      toast.error('Please enter a comment, add a link, or attach a file');
      return;
    }

    if (!user) {
      toast.error('User not authenticated.');
      return;
    }

    setIsAddingComment(true);
    try {
      const response = await base44.functions.invoke('addInternalComment', {
        requestId,
        body: newComment,
        visibility,
        photos: uploadedPhotos,
        files: uploadedFiles,
        links: newLinks
      });

      if (response.data?.success) {
        // Only invalidate current request detail
        queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
        setNewComment('');
        setNewLinks(['']);
        setUploadedPhotos([]);
        setUploadedFiles([]);
        toast.success('Comment added');
      } else {
        throw new Error(response.data?.error || 'Failed to add comment');
      }
    } catch (error) {
      console.error('Add comment error:', error);
      toast.error('Failed to add comment');
    } finally {
      setIsAddingComment(false);
    }
  };



  // Memoize expensive calculations to prevent re-computation on every render
  const requestState = useMemo(() => {
    return request ? getRequestState(request, decisions, attachments) : null;
  }, [request?.id, request?.status, decisions, attachments]);

  // Determine button labels based on request type
  const approveLabel = request?.request_type === 'design_review' ? 'Approve' : 'Confirm';
  const requestChangesLabel = 'Request Changes';
  
  // Memoize the request object passed to thread to prevent unnecessary re-renders
  const threadRequest = useMemo(() => {
    if (!request) return null;
    return { ...request, comments, decisions, attachments };
  }, [request, comments, decisions, attachments]);



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
  
  // Handle request not found after load completes
  if (!isLoadingDetail && !request) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Request not found</p>
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
                    {request?.status !== 'archived' && (
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
                  {project && <p className={cn("text-gray-400", isMobile ? "text-xs" : "text-sm")}>{project.name}</p>}
                </>
              )}
            </div>

            {/* Action buttons - only show when data is loaded, hidden on mobile (shown in metadata card) */}
            {!isMobile && !isInitialLoad && request?.status === 'posted' && request?.request_type !== 'design_review' && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleSubmitRequestDecision({
                    requestId,
                    decision: 'approved',
                    note: '',
                    targetAttachmentIds: null,
                    newImages: reviewNewImages,
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

            {!isMobile && !isInitialLoad && request?.status === 'posted' && request?.request_type === 'design_review' && (
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
              {primaryClientSlug && (
                <div className={cn("border-b border-gray-700/50", isMobile ? "pb-2" : "pb-3")}>
                  <ClientLinksSection 
                    slug={primaryClientSlug} 
                    requestId={requestId} 
                    projectName={project?.name}
                    compact={isMobile}
                  />
                </div>
              )}
              
              {/* Status badges - horizontal scroll on mobile */}
              <div className={cn(
                "flex items-center gap-2",
                isMobile ? "overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide" : "flex-wrap gap-3"
              )}>
                <Badge className={cn("text-xs border shrink-0", getRequestTypeInfo(request.request_type).color)}>
                  {getRequestTypeInfo(request.request_type).label}
                </Badge>
                {requestState && (
                  <Badge className={cn("flex items-center gap-1 shrink-0", requestState.color)}>
                    <requestState.icon className="w-3 h-3" />
                    {requestState.label}
                  </Badge>
                )}
                {request.due_date && (
                  <Badge variant="outline" className="border-gray-600 text-gray-200 shrink-0">
                    Due: {format(new Date(request.due_date), 'MMM d')}
                  </Badge>
                )}
              </div>

              {/* Mobile: Approve/Changes buttons for non-design-review */}
              {isMobile && request?.status === 'posted' && request?.request_type !== 'design_review' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleSubmitRequestDecision({
                      requestId,
                      decision: 'approved',
                      note: '',
                      targetAttachmentIds: null,
                      newImages: reviewNewImages,
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

              {isMobile && request?.status === 'posted' && request?.request_type === 'design_review' && (
                <p className="text-xs text-gray-400 italic">Select images below to review</p>
              )}

              {/* Action buttons - restructured for mobile */}
              {isMobile ? (
                <div className="space-y-2">
                  {/* Primary action row */}
                  {request.status === 'draft' && (
                    <Button size="sm" onClick={handlePostToClient} className="w-full h-10 bg-blue-600 hover:bg-blue-700">
                      Post to Client
                    </Button>
                  )}
                  {['posted', 'changes_requested', 'approved'].includes(request.status) && (
                    <Button size="sm" onClick={handleResendForApproval} className="w-full h-10 bg-purple-600 hover:bg-purple-700 text-white">
                      <RotateCw className="w-4 h-4 mr-1" />
                      Resend for Review
                    </Button>
                  )}
                  {request.status === 'archived' && (
                    <Button size="sm" onClick={() => {
                      if (confirm('Move this request back to draft?')) {
                        updateRequestMutation.mutate({ id: requestId, data: { status: 'draft' } });
                        toast.success('Moved to Drafts');
                      }
                    }} className="w-full h-10 bg-gray-700 hover:bg-gray-600 text-white">
                      <FileText className="w-4 h-4 mr-1" />
                      Move to Draft
                    </Button>
                  )}
                  
                  {/* Secondary inline row */}
                  <div className="flex gap-2">
                    {['posted', 'changes_requested', 'approved'].includes(request.status) && (
                      <Button 
                        size="sm" 
                        onClick={handleArchive} 
                        variant="outline" 
                        className="flex-1 h-9 border-gray-600 text-gray-300 text-xs"
                      >
                        <Archive className="w-3.5 h-3.5 mr-1" />
                        Archive
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={handleDeleteRequest}
                      disabled={deleteRequestMutation.isPending}
                      variant="outline"
                      className="flex-1 h-9 border-red-600/50 text-red-400 text-xs hover:bg-red-600/20"
                    >
                      {deleteRequestMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <><Trash2 className="w-3.5 h-3.5 mr-1" />Delete</>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Desktop action buttons */
                <div className="flex gap-2 flex-wrap">
                  {request.status === 'draft' && (
                    <Button size="sm" onClick={handlePostToClient} className="bg-blue-600 hover:bg-blue-700">
                      Post to Client
                    </Button>
                  )}
                  {['posted', 'changes_requested', 'approved'].includes(request.status) && (
                    <>
                      <Button size="sm" onClick={handleResendForApproval} variant="outline" className="bg-purple-100 text-purple-900 border-purple-200 hover:bg-purple-200 hover:text-purple-950 px-3 text-xs font-medium rounded-md h-8">
                        <RotateCw className="w-4 h-4 mr-1" />
                        Resend
                      </Button>
                      <Button size="sm" onClick={handleArchive} variant="outline" className="bg-gray-700 text-gray-200 px-3 text-xs font-medium rounded-md hover:bg-gray-600 hover:text-white h-8 border-gray-600">
                        <Archive className="w-4 h-4 mr-1" />
                        Archive
                      </Button>
                    </>
                  )}
                  {request.status === 'archived' && (
                    <Button size="sm" onClick={() => {
                      if (confirm('Move this request back to draft?')) {
                        updateRequestMutation.mutate({ id: requestId, data: { status: 'draft' } });
                        toast.success('Moved to Drafts');
                      }
                    }} variant="outline" className="bg-gray-100 text-gray-900 border-gray-200 hover:bg-gray-200 px-3 text-xs font-medium rounded-md h-8">
                      <FileText className="w-4 h-4 mr-1" />
                      Move to Draft
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleDeleteRequest}
                    disabled={deleteRequestMutation.isPending}
                    className="bg-red-600 hover:bg-red-700 text-white border-red-600"
                  >
                    {deleteRequestMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-1" />
                    )}
                    Delete
                  </Button>
                </div>
              )}

              {request.body && (
                <div className={cn("bg-gray-800/50 rounded-lg", isMobile ? "p-2" : "p-3")}>
                  <p className={cn("text-gray-300 whitespace-pre-wrap", isMobile ? "text-sm" : "")}>{request.body}</p>
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

          {request.request_type === 'todo_list' ? (
            <>
              <ToDoListDisplay
                requestId={requestId}
                tasks={todoTasks}
                assignableUsers={assignableUsers}
                assignableContacts={assignableContacts}
                queryKey={['internalFeedbackDetail', requestId, projectId]}
              />
              {/* Show comments thread for ToDo list requests */}
              {threadRequest && (
                <ClientFeedbackThread
                  requestId={requestId}
                  userId={user.id}
                  requestType={request.request_type}
                  onDecisionSubmit={handleSubmitRequestDecision}
                  onDeleteComment={async (commentId) => {
                    try {
                      const commentAttachments = attachments.filter(a => a.comment_id === commentId);
                      await Promise.all(commentAttachments.map(a => base44.entities.ClientFeedbackAttachment.delete(a.id)));
                      await base44.entities.ClientFeedbackComment.delete(commentId);
                      queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
                      toast.success('Comment deleted');
                    } catch (error) {
                      toast.error('Failed to delete comment');
                    }
                  }}
                  onDeleteDecision={async (decisionIds) => {
                    try {
                      await Promise.all(decisionIds.map(id => base44.entities.ClientFeedbackDecision.delete(id)));
                      queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
                      toast.success('Decision deleted');
                    } catch (error) {
                      toast.error('Failed to delete decision');
                    }
                  }}
                  isClientView={false}
                  accessRole={user?.role}
                  request={threadRequest}
                />
              )}
            </>
          ) : threadRequest && (
            <ClientFeedbackThread
              requestId={requestId}
              userId={user.id}
              requestType={request.request_type}
              onCreateTask={(approval) => {
                setSelectedApproval(approval);
                setShowCreateTaskModal(true);
              }}
              onDecisionSubmit={handleSubmitRequestDecision}
              onDeleteComment={async (commentId) => {
                try {
                  const commentAttachments = attachments.filter(a => a.comment_id === commentId);
                  await Promise.all(commentAttachments.map(a => base44.entities.ClientFeedbackAttachment.delete(a.id)));
                  await base44.entities.ClientFeedbackComment.delete(commentId);
                  queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
                  toast.success('Comment deleted');
                } catch (error) {
                  toast.error('Failed to delete comment');
                }
              }}
              onDeleteDecision={async (decisionIds) => {
                try {
                  await Promise.all(decisionIds.map(id => base44.entities.ClientFeedbackDecision.delete(id)));
                  queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
                  toast.success('Decision deleted');
                } catch (error) {
                  toast.error('Failed to delete decision');
                }
              }}
              isClientView={false}
              accessRole={user?.role}
              request={threadRequest}
            />
          )}


          {/* Comment Composer - Collapsible on mobile */}
          {isMobile ? (
            <MobileCollapsibleComposer
              value={newComment}
              onChange={setNewComment}
              onSubmit={handleAddComment}
              placeholder="Write a comment..."
              isSubmitting={isAddingComment}
              onImageUpload={handleImageUpload}
              onFileUpload={handleFileUpload}
              uploadingImages={uploadingImages}
              uploadingFiles={uploadingFile}
              uploadedPhotos={uploadedPhotos}
              uploadedFiles={uploadedFiles}
              onRemovePhoto={handleRemovePhoto}
              onRemoveFile={handleRemoveFile}
              links={newLinks}
              onLinksChange={setNewLinks}
              visibilitySelector={
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger className="w-28 bg-gray-800 border-gray-700 text-white h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_visible">Client</SelectItem>
                    <SelectItem value="internal_only">Internal</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          ) : (
            <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Add Comment</h3>
                  <Select value={visibility} onValueChange={setVisibility}>
                    <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client_visible">Client Visible</SelectItem>
                      <SelectItem value="internal_only">Internal Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                />

                {uploadedPhotos.length > 0 && (
                  <div>
                    <Label className="text-xs text-gray-400 mb-2 block">Attached Images ({uploadedPhotos.length})</Label>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                      {uploadedPhotos.map((url, idx) => (
                        <div key={idx} className="relative group">
                          <div className="w-full h-20 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden">
                            <img src={url} alt={`Upload ${idx + 1}`} loading="lazy" className="max-w-full max-h-full object-contain" />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(url)}
                            className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {uploadedFiles.length > 0 && (
                  <div>
                    <Label className="text-xs text-gray-400 mb-2 block">Attached Files ({uploadedFiles.length})</Label>
                    <div className="space-y-2">
                      {uploadedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-gray-800 rounded-lg">
                          <span className="text-white text-sm truncate">{file.name}</span>
                          <button type="button" onClick={() => handleRemoveFile(file.url)} className="text-red-400 hover:text-red-300 p-1">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">Add Links (optional)</Label>
                  {newLinks.map((link, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={link}
                        onChange={(e) => {
                          const updated = [...newLinks];
                          updated[idx] = e.target.value;
                          setNewLinks(updated);
                        }}
                        placeholder="https://..."
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      {idx === newLinks.length - 1 && (
                        <Button size="icon" variant="outline" onClick={() => setNewLinks([...newLinks, ''])} className="border-gray-700">
                          <Plus className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input id="internal-image-upload" type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                  <label htmlFor="internal-image-upload">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingImages}
                      className="bg-red-700 text-slate-50 px-3 text-xs font-medium rounded-md h-8 border-gray-700 cursor-pointer"
                      onClick={() => document.getElementById('internal-image-upload').click()}
                    >
                      {uploadingImages ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Uploading...</> : <><Upload className="w-4 h-4 mr-1" />Add Images</>}
                    </Button>
                  </label>

                  <input id="internal-file-upload" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={handleFileUpload} className="hidden" />
                  <label htmlFor="internal-file-upload">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingFile}
                      className="bg-amber-500 px-3 text-xs font-medium rounded-md h-8 border-gray-700 cursor-pointer"
                      onClick={() => document.getElementById('internal-file-upload').click()}
                    >
                      {uploadingFile ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Uploading...</> : <><Paperclip className="w-4 h-4 mr-1" />Attach File</>}
                    </Button>
                  </label>

                  <Button onClick={handleAddComment} disabled={isAddingComment} className="bg-blue-600 hover:bg-blue-700 text-white ml-auto">
                    {isAddingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>
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
                      {isUploadingReviewImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Upload Images
                    </div>
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      className="hidden" 
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length === 0) return;
                        
                        setIsUploadingReviewImages(true);
                        try {
                          const uploadPromises = files.map(file => base44.integrations.Core.UploadFile({ file }));
                          const results = await Promise.all(uploadPromises);
                          const urls = results.map(r => r.file_url);
                          setReviewNewImages(prev => [...prev, ...urls]);
                          toast.success('Images uploaded');
                        } catch (error) {
                          console.error(error);
                          toast.error('Failed to upload images');
                        } finally {
                          setIsUploadingReviewImages(false);
                        }
                      }}
                      disabled={isUploadingReviewImages} 
                    />
                  </label>
                  <span className="text-xs text-gray-500">{reviewNewImages.length} images added</span>
                </div>
                
                {reviewNewImages.length > 0 && (
                  <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                    {reviewNewImages.map((url, idx) => (
                      <div key={idx} className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden border border-gray-700">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button 
                          onClick={() => setReviewNewImages(prev => prev.filter(u => u !== url))}
                          className="absolute top-0 right-0 bg-red-600 text-white p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
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
                  newImages: reviewNewImages, // From modal upload
                })}
                disabled={submitDecisionMutation.isPending}
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
        approval={selectedApproval}
        userId={user.id} />

      }

      <CreateLinkedTaskModal
        open={showCreateLinkedTaskModal}
        onClose={() => setShowCreateLinkedTaskModal(false)}
        projectId={projectId}
        feedbackRequestId={requestId}
        feedbackRequestTitle={request?.title}
        feedbackAttachments={attachments}
        userId={user?.id}
      />

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />

      <EditRequestModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        request={request}
        onSave={handleEditSave}
        isSaving={updateRequestMutation.isPending}
      />
    </>);

}